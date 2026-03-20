import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  onSnapshot
} from 'firebase/firestore';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  TrendingUp, 
  Wallet, 
  History,
  Plus,
  ChevronLeft,
  ChevronRight,
  ArrowRightLeft
} from 'lucide-react';

// --- FIREBASE CONFIGURATION ---
// IMPORTANT: Replace these with your actual keys from the Firebase Console
const firebaseConfig = {
  apiKey: "AIzaSyDb6oFZEStklFT_Dt2riDbQC_IJPHcT304",
  authDomain: "church-finance-dashboard-40dca.firebaseapp.com",
  projectId: "church-finance-dashboard-40dca",
  storageBucket: "church-finance-dashboard-40dca.firebasestorage.app",
  messagingSenderId: "480863076081",
  appId: "1:480863076081:web:dd01f7270a7cd158f93350" 
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'church-financial-dashboard';

const REVENUE_CATEGORIES = [
  'Cash/Checks', 'Credit Card', 'Text', 'Givelify', 
  'Tithely', 'CashApp', 'Zelle', 'Website Giving'
];

const EXPENSE_CATEGORIES = [
  'Mortgage - Kirkland Group', 'Pastor Payroll', 'Lady Val Payroll', 
  'Admin Payroll Taxes and fees', 'Band Payroll', 'Pastor Love offerings', 
  'Georgia Power', 'Georgia Natural Gas', 'Spectrum (TV, Phone, Internet)', 
  'Henry County Water Authority', 'TMobile', 'Kaiser Permanente', 
  'GFL Environmental', 'Ministry Design', 'Quickbooks', 
  'Team Pest USA', 'First Citizens Bank', 'Other'
];

export default function App() {
  const [user, setUser] = useState(null);
  const [selectedSheetDate, setSelectedSheetDate] = useState(null);
  const [revenueData, setRevenueData] = useState({});
  const [expenses, setExpenses] = useState([]);
  const [manualStartingBalance, setManualStartingBalance] = useState(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  
  const [previousWeekEndingBalance, setPreviousWeekEndingBalance] = useState(0);

  const formatDate = (date) => `${date.getMonth() + 1}-${date.getDate()}-${date.getFullYear().toString().slice(-2)}`;

  // Corrected to use Friday as the base (1-2-26 is a Friday)
  const getWorksheetDate = (dateObj) => {
    const d = new Date(dateObj);
    const day = d.getDay(); // 0=Sun, 5=Fri
    const diff = (day >= 5) ? (day - 5) : (day + 2);
    const targetFriday = new Date(d);
    targetFriday.setDate(d.getDate() - diff);
    return formatDate(targetFriday);
  };

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (firebaseConfig.apiKey !== "PASTE_YOUR_API_KEY_HERE") {
          await signInAnonymously(auth);
        }
      } catch (err) { console.error("Auth Error:", err); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const current = getWorksheetDate(new Date());
    setSelectedSheetDate(current);
  }, []);

  // Listen to Current Week
  useEffect(() => {
    if (!user || !selectedSheetDate || firebaseConfig.apiKey === "PASTE_YOUR_API_KEY_HERE") return;
    const docPath = doc(db, 'artifacts', appId, 'public', 'data', 'reports', selectedSheetDate);
    
    const unsubscribe = onSnapshot(docPath, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setRevenueData(data.revenue || {});
        setExpenses(data.expenses || []);
        setManualStartingBalance(data.startingBalance ?? null);
        setIsSubmitted(data.status === 'submitted');
      } else {
        const initialRev = {};
        REVENUE_CATEGORIES.forEach(cat => initialRev[cat] = 0);
        setRevenueData(initialRev);
        setExpenses([]);
        setManualStartingBalance(null);
        setIsSubmitted(false);
      }
    });
    return () => unsubscribe();
  }, [user, selectedSheetDate]);

  // Listen to Previous Week for Balance Carry-Forward
  useEffect(() => {
    if (!user || !selectedSheetDate || firebaseConfig.apiKey === "PASTE_YOUR_API_KEY_HERE") return;
    
    const [m, d, y] = selectedSheetDate.split('-').map(Number);
    const prevDateObj = new Date(2000 + y, m - 1, d);
    prevDateObj.setDate(prevDateObj.getDate() - 7);
    const prevWeekKey = formatDate(prevDateObj);

    const prevDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'reports', prevWeekKey);
    
    const unsubscribe = onSnapshot(prevDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const rev = Object.values(data.revenue || {}).reduce((a, b) => a + (parseFloat(b) || 0), 0);
        const exp = (data.expenses || []).reduce((a, b) => a + (parseFloat(b.amount) || 0), 0);
        const start = data.startingBalance || 0;
        setPreviousWeekEndingBalance(start + rev - exp);
      } else {
        setPreviousWeekEndingBalance(0);
      }
    });
    return () => unsubscribe();
  }, [user, selectedSheetDate]);

  const currentWeekTotals = useMemo(() => {
    const rev = Object.values(revenueData).reduce((acc, val) => acc + (parseFloat(val) || 0), 0);
    const exp = expenses.reduce((acc, e) => acc + (parseFloat(e.amount) || 0), 0);
    const start = manualStartingBalance !== null ? parseFloat(manualStartingBalance) : previousWeekEndingBalance;
    return { 
      rev, exp, net: rev - exp, start: start, end: start + (rev - exp)
    };
  }, [revenueData, expenses, manualStartingBalance, previousWeekEndingBalance]);

  const changeWeek = (direction) => {
    const [m, d, y] = selectedSheetDate.split('-').map(Number);
    const date = new Date(2000 + y, m - 1, d);
    date.setDate(date.getDate() + (direction * 7));
    setSelectedSheetDate(formatDate(date));
  };

  const updateCloudData = async (updates) => {
    if (!user || !selectedSheetDate || isSubmitted) return;
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'reports', selectedSheetDate);
    await setDoc(docRef, { ...updates, lastUpdated: new Date().toISOString() }, { merge: true });
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen text-slate-400 font-bold uppercase tracking-widest animate-pulse">Loading...</div>;

  return (
    <div className="min-h-screen bg-slate-100 p-4 font-sans text-slate-900 pb-32">
      <header className="max-w-5xl mx-auto mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-xl border-b-4 border-indigo-500">
           <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Starting Balance</p>
           <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-slate-300">$</span>
            <input 
                type="number"
                value={manualStartingBalance ?? currentWeekTotals.start}
                disabled={isSubmitted}
                onChange={(e) => {
                    const val = e.target.value === '' ? null : e.target.value;
                    setManualStartingBalance(val);
                    updateCloudData({ startingBalance: val !== null ? parseFloat(val) : null });
                }}
                className="bg-transparent text-2xl font-black text-white outline-none w-full border-b border-slate-700 focus:border-indigo-400"
            />
           </div>
          <p className="text-[9px] font-bold text-slate-500 uppercase mt-2">
            {manualStartingBalance !== null ? "Manual Entry Set" : "Auto-Carried from previous week"}
          </p>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm md:col-span-2 flex justify-between items-center">
          <button onClick={() => changeWeek(-1)} className="p-3 hover:bg-slate-100 rounded-full text-slate-400"><ChevronLeft/></button>
          <div className="text-center">
            <h1 className="text-xl font-black text-slate-800 uppercase">Week of {selectedSheetDate}</h1>
            <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Friday Reporting Cycle</p>
          </div>
          <button onClick={() => changeWeek(1)} className="p-3 hover:bg-slate-100 rounded-full text-slate-400"><ChevronRight/></button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 text-center">
            <p className="text-[9px] font-black text-slate-400 uppercase">Revenue</p>
            <p className="text-lg font-black text-emerald-600">+${currentWeekTotals.rev.toLocaleString()}</p>
        </div>
        <div className="bg-white p-4 rounded-2xl border border-slate-200 text-center">
            <p className="text-[9px] font-black text-slate-400 uppercase">Expenses</p>
            <p className="text-lg font-black text-rose-600">-${currentWeekTotals.exp.toLocaleString()}</p>
        </div>
        <div className="bg-indigo-600 p-4 rounded-2xl shadow-lg text-center text-white">
            <p className="text-[9px] font-black text-indigo-200 uppercase">Ending Balance</p>
            <p className="text-lg font-black">${currentWeekTotals.end.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      <main className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
          <h3 className="font-black text-xs uppercase text-slate-400 mb-6 flex items-center gap-2"><TrendingUp size={16} className="text-emerald-500"/> Revenue</h3>
          <div className="space-y-3">
            {REVENUE_CATEGORIES.map(cat => (
              <div key={cat} className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600">{cat}</span>
                <input 
                  type="number" 
                  value={revenueData[cat] || ''} 
                  disabled={isSubmitted}
                  onChange={(e) => {
                    const updated = { ...revenueData, [cat]: e.target.value };
                    setRevenueData(updated);
                    updateCloudData({ revenue: updated });
                  }}
                  className="w-32 p-1.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-right"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col">
          <h3 className="font-black text-xs uppercase text-slate-400 mb-6 flex items-center gap-2"><Wallet size={16} className="text-rose-500"/> Expenses</h3>
          <div className="flex-1 overflow-y-auto max-h-[300px] mb-4 space-y-2">
            {expenses.map((exp, idx) => (
              <div key={idx} className="flex justify-between items-center p-3 bg-slate-50 rounded-xl border border-slate-100">
                <span className="text-xs font-bold text-slate-700">{exp.category}</span>
                <span className="text-xs font-black text-rose-500">-${parseFloat(exp.amount).toFixed(2)}</span>
              </div>
            ))}
          </div>
          {!isSubmitted && (
            <form onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.target);
              const newItem = { category: d.get('cat'), amount: d.get('amt'), id: Date.now() };
              const updated = [...expenses, newItem];
              setExpenses(updated);
              updateCloudData({ expenses: updated });
              e.target.reset();
            }} className="flex gap-2 p-2 bg-slate-100 rounded-2xl">
              <select name="cat" className="flex-1 bg-transparent text-xs font-bold outline-none" required>
                {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
              <input name="amt" type="number" step="0.01" className="w-20 bg-white p-2 rounded-xl text-xs font-bold" placeholder="0.00" required />
              <button className="bg-slate-900 text-white p-2 rounded-xl"><Plus size={16}/></button>
            </form>
          )}
        </div>
      </main>

      <footer className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-lg bg-white/90 backdrop-blur-xl border border-white shadow-2xl rounded-full p-4 flex justify-between items-center z-50">
        <p className="text-xs font-black text-slate-400 uppercase ml-4">Weekly Sync Active</p>
        <button 
          onClick={() => { if(confirm("Finalize week?")) updateCloudData({ status: 'submitted' })}}
          disabled={isSubmitted}
          className={`px-8 py-3 rounded-full font-black text-xs uppercase tracking-widest ${isSubmitted ? 'bg-slate-100 text-slate-400' : 'bg-indigo-600 text-white'}`}
        >
          {isSubmitted ? 'Locked' : 'Lock Week'}
        </button>
      </footer>
    </div>
  );
}
