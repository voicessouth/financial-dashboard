import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  onSnapshot, 
  collection, 
  query,
  getDocs
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
  AlertCircle,
  Lock,
  ChevronLeft,
  ChevronRight,
  Database,
  Calculator
} from 'lucide-react';

// --- FIREBASE CONFIGURATION ---
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
  'Mortgage - Kirkland Group', 'Payroll', 'Utilities', 'Ministry Design', 'Quickbooks', 'Other'
];

export default function App() {
  const [user, setUser] = useState(null);
  const [selectedSheetDate, setSelectedSheetDate] = useState(null);
  const [revenueData, setRevenueData] = useState({});
  const [expenses, setExpenses] = useState([]);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  
  // Historical Data for Cumulative Balance
  const [allTimeNet, setAllTimeNet] = useState(0);
  const [openingBalance, setOpeningBalance] = useState(0);

  // Helper: Get Tuesday of a given week
  const getWorksheetDate = (dateObj) => {
    const d = new Date(dateObj);
    const day = d.getDay();
    const diff = day >= 2 ? day - 2 : day + 5; 
    const lastTuesday = new Date(d);
    lastTuesday.setDate(d.getDate() - diff);
    return `${lastTuesday.getMonth() + 1}-${lastTuesday.getDate()}-${lastTuesday.getFullYear().toString().slice(-2)}`;
  };

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (firebaseConfig.apiKey !== "YOUR_ACTUAL_API_KEY") {
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

  // 1. Listen to the specific selected week
  useEffect(() => {
    if (!user || !selectedSheetDate || firebaseConfig.apiKey === "YOUR_ACTUAL_API_KEY") return;
    const docPath = doc(db, 'artifacts', appId, 'public', 'data', 'reports', selectedSheetDate);
    
    const unsubscribe = onSnapshot(docPath, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setRevenueData(data.revenue || {});
        setExpenses(data.expenses || []);
        setIsSubmitted(data.status === 'submitted');
      } else {
        const initialRev = {};
        REVENUE_CATEGORIES.forEach(cat => initialRev[cat] = 0);
        setRevenueData(initialRev);
        setExpenses([]);
        setIsSubmitted(false);
      }
    });
    return () => unsubscribe();
  }, [user, selectedSheetDate]);

  // 2. Fetch all historical data to calculate current bank balance
  useEffect(() => {
    if (!user || firebaseConfig.apiKey === "YOUR_ACTUAL_API_KEY") return;
    
    const settingsRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global');
    const reportsRef = collection(db, 'artifacts', appId, 'public', 'data', 'reports');

    const unsubscribeSettings = onSnapshot(settingsRef, (s) => {
      if (s.exists()) setOpeningBalance(parseFloat(s.data().openingBalance) || 0);
    });

    const unsubscribeReports = onSnapshot(reportsRef, (snapshot) => {
      let total = 0;
      snapshot.docs.forEach(doc => {
        const data = doc.data();
        const rev = Object.values(data.revenue || {}).reduce((a, b) => a + (parseFloat(b) || 0), 0);
        const exp = (data.expenses || []).reduce((a, b) => a + (parseFloat(b.amount) || 0), 0);
        total += (rev - exp);
      });
      setAllTimeNet(total);
    });

    return () => { unsubscribeSettings(); unsubscribeReports(); };
  }, [user]);

  const currentWeekTotals = useMemo(() => {
    const rev = Object.values(revenueData).reduce((acc, val) => acc + (parseFloat(val) || 0), 0);
    const exp = expenses.reduce((acc, e) => acc + (parseFloat(e.amount) || 0), 0);
    return { rev, exp, net: rev - exp };
  }, [revenueData, expenses]);

  const changeWeek = (direction) => {
    const [m, d, y] = selectedSheetDate.split('-').map(Number);
    const date = new Date(2000 + y, m - 1, d);
    date.setDate(date.getDate() + (direction * 7));
    setSelectedSheetDate(getWorksheetDate(date));
  };

  const updateCloudData = async (updates) => {
    if (!user || !selectedSheetDate || isSubmitted) return;
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'reports', selectedSheetDate);
    await setDoc(docRef, { ...updates, lastUpdated: new Date().toISOString() }, { merge: true });
  };

  const setGlobalOpeningBalance = async (val) => {
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'settings', 'global');
    await setDoc(docRef, { openingBalance: parseFloat(val) || 0 }, { merge: true });
  };

  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>;

  return (
    <div className="min-h-screen bg-slate-100 p-4 font-sans text-slate-900">
      {/* Top Bar: Bank Balance & Year-to-Date */}
      <header className="max-w-5xl mx-auto mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-xl">
          <p className="text-[10px] font-black uppercase text-slate-400 mb-1 tracking-widest">Current Bank Balance</p>
          <h2 className="text-3xl font-black text-emerald-400">
            ${(openingBalance + allTimeNet).toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </h2>
          <div className="mt-4 flex items-center gap-2">
            <input 
              type="number" 
              placeholder="Set Opening Balance"
              className="bg-slate-800 text-xs p-2 rounded-lg border border-slate-700 w-24 outline-none focus:border-emerald-500"
              onBlur={(e) => setGlobalOpeningBalance(e.target.value)}
            />
            <span className="text-[9px] text-slate-500 font-bold uppercase leading-tight">Opening Balance<br/>at start of year</span>
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm md:col-span-2 flex justify-between items-center">
          <button onClick={() => changeWeek(-1)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><ChevronLeft/></button>
          <div className="text-center">
            <h1 className="text-xl font-black text-slate-800">Week of {selectedSheetDate}</h1>
            <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Worksheet Navigation</p>
          </div>
          <button onClick={() => changeWeek(1)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><ChevronRight/></button>
        </div>
      </header>

      {/* Main Grid */}
      <main className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 pb-24">
        {/* Income */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
          <h3 className="font-black text-xs uppercase text-slate-400 mb-6 flex items-center gap-2 tracking-widest">
            <TrendingUp size={16} className="text-emerald-500"/> Weekly Revenue
          </h3>
          <div className="space-y-3">
            {REVENUE_CATEGORIES.map(cat => (
              <div key={cat} className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600">{cat}</span>
                <div className="relative w-32">
                  <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-300 text-xs">$</span>
                  <input 
                    type="number" 
                    value={revenueData[cat] || ''} 
                    disabled={isSubmitted}
                    onChange={(e) => {
                      const updated = { ...revenueData, [cat]: e.target.value };
                      setRevenueData(updated);
                      updateCloudData({ revenue: updated });
                    }}
                    className="w-full pl-5 pr-2 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-right outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            ))}
            <div className="pt-4 mt-4 border-t border-slate-100 flex justify-between items-center">
              <span className="text-xs font-black uppercase text-slate-400">Week Total</span>
              <span className="text-lg font-black text-emerald-600">${currentWeekTotals.rev.toLocaleString()}</span>
            </div>
          </div>
        </div>

        {/* Expenses */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col">
          <h3 className="font-black text-xs uppercase text-slate-400 mb-6 flex items-center gap-2 tracking-widest">
            <Wallet size={16} className="text-rose-500"/> Weekly Expenses
          </h3>
          <div className="flex-1 overflow-y-auto max-h-[400px] mb-4 space-y-2">
            {expenses.map((exp, idx) => (
              <div key={idx} className="flex justify-between items-center p-3 bg-slate-50 rounded-2xl border border-slate-100">
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
              <select name="cat" className="flex-1 bg-transparent text-xs font-bold outline-none px-2" required>
                {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
              <input name="amt" type="number" step="0.01" className="w-20 bg-white p-2 rounded-xl text-xs font-bold" placeholder="0.00" required />
              <button className="bg-slate-900 text-white p-2 rounded-xl hover:scale-105 transition-transform"><Plus size={16}/></button>
            </form>
          )}
        </div>
      </main>

      <footer className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] max-w-lg bg-white/90 backdrop-blur-xl border border-white shadow-2xl rounded-full p-3 flex justify-between items-center z-50">
        <div className="px-4">
          <p className="text-[9px] font-black text-slate-400 uppercase leading-none mb-1">Weekly Net</p>
          <p className={`text-sm font-black ${currentWeekTotals.net >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
            {currentWeekTotals.net >= 0 ? '+' : ''}${currentWeekTotals.net.toLocaleString()}
          </p>
        </div>
        <button 
          onClick={() => { if(confirm("Finalize this week's records?")) updateCloudData({ status: 'submitted' })}}
          disabled={isSubmitted}
          className={`px-8 py-3 rounded-full font-black text-xs uppercase tracking-widest transition-all ${isSubmitted ? 'bg-slate-100 text-slate-400' : 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'}`}
        >
          {isSubmitted ? 'Locked' : 'Finalize Week'}
        </button>
      </footer>
    </div>
  );
}
