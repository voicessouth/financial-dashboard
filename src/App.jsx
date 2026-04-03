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
  Plus, 
  Lock, 
  AlertCircle,
  Calendar,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';

// --- FIREBASE CONFIGURATION ---
// Replace placeholders with your ACTUAL keys from the Firebase Console
const firebaseConfig = {
  apiKey: "AIzaSyDb6oFZEStklFT_Dt2riDbQC_IJPHcT304",
  authDomain: "church-finance-dashboard-40dca.firebaseapp.com",
  projectId: "church-finance-dashboard-40dca",
  storageBucket: "church-finance-dashboard-40dca.firebasestorage.app",
  messagingSenderId: "480863076081",
  appId: "1:480863076081:web:dd01f7270a7cd158f93350"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

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
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);

  // Check if keys are still placeholders
  const isConfigured = firebaseConfig.apiKey !== "YOUR_API_KEY";

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
      if (!isConfigured) {
        setLoading(false);
        return;
      }
      try {
        await signInAnonymously(auth);
      } catch (err) {
        console.error("Auth Error:", err);
        setLoading(false);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) setLoading(false);
    });
    return () => unsubscribe();
  }, [isConfigured]);

  useEffect(() => {
    setSelectedSheetDate(getWorksheetDate(new Date()));
  }, []);

  useEffect(() => {
    if (!user || !selectedSheetDate || !isConfigured) return;
    
    // Path: /church_reports/{date}
    const docPath = doc(db, 'church_reports', selectedSheetDate);
    
    const unsubscribe = onSnapshot(docPath, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setRevenueData(data.revenue || {});
        setExpenses(data.expenses || []);
        setIsSubmitted(data.status === 'submitted');
      } else {
        setRevenueData({});
        setExpenses([]);
        setIsSubmitted(false);
      }
    }, (error) => {
      console.error("Firestore Listen Error:", error);
    });
    
    return () => unsubscribe();
  }, [user, selectedSheetDate, isConfigured]);

  const totals = useMemo(() => {
    const rev = Object.values(revenueData).reduce((acc, val) => acc + (parseFloat(val) || 0), 0);
    const exp = expenses.reduce((acc, e) => acc + (parseFloat(e.amount) || 0), 0);
    return { rev, exp, net: rev - exp };
  }, [revenueData, expenses]);

  const updateCloudData = async (data) => {
    if (!isConfigured || !user || !selectedSheetDate || isSubmitted) return;
    const docPath = doc(db, 'church_reports', selectedSheetDate);
    await setDoc(docPath, { ...data, lastUpdated: new Date().toISOString() }, { merge: true });
  };

  const handleRevenueChange = (cat, val) => {
    const updated = { ...revenueData, [cat]: val };
    setRevenueData(updated);
    updateCloudData({ revenue: updated });
  };

  const addExpense = (e) => {
    e.preventDefault();
    if (isSubmitted) return;
    const formData = new FormData(e.target);
    const newExpense = {
      id: Date.now().toString(),
      category: formData.get('category'),
      amount: parseFloat(formData.get('amount')) || 0,
      timestamp: new Date().toLocaleTimeString()
    };
    const updated = [newExpense, ...expenses];
    setExpenses(updated);
    updateCloudData({ expenses: updated });
    e.target.reset();
  };

  const changeWeek = (direction) => {
    const [m, d, y] = selectedSheetDate.split('-').map(Number);
    const date = new Date(2000 + y, m - 1, d);
    date.setDate(date.getDate() + (direction * 7));
    setSelectedSheetDate(getWorksheetDate(date));
  };

  if (loading && isConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center animate-pulse">
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest">Connecting to Treasury...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans pb-32">
      {!isConfigured && (
        <div className="max-w-4xl mx-auto mb-6 bg-amber-50 border border-amber-200 p-4 rounded-xl text-amber-800 flex items-center gap-3">
          <AlertCircle size={20} />
          <p className="text-sm font-medium">Configuration Required: Add your Firebase API keys to <code>App.jsx</code>.</p>
        </div>
      )}

      {/* Header / Week Picker */}
      <header className="max-w-4xl mx-auto mb-8 bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="flex items-center gap-4">
          <button onClick={() => changeWeek(-1)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><ChevronLeft/></button>
          <div className="text-center md:text-left">
            <h1 className="text-2xl font-black text-slate-800 leading-tight">Financial Dashboard</h1>
            <p className="text-indigo-600 text-[10px] font-bold uppercase tracking-widest flex items-center gap-1 justify-center md:justify-start">
              <Calendar size={12}/> Week of {selectedSheetDate}
            </p>
          </div>
          <button onClick={() => changeWeek(1)} className="p-2 hover:bg-slate-100 rounded-full transition-colors"><ChevronRight/></button>
        </div>
        <div className="text-right bg-slate-50 px-6 py-3 rounded-2xl border border-slate-100">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Net Cash Flow</p>
          <p className={`text-2xl font-black ${totals.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            ${totals.net.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Revenue Section */}
        <section className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
          <h2 className="font-black text-xs uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
            <TrendingUp className="text-emerald-500" size={16}/> Weekly Revenue
          </h2>
          <div className="space-y-4">
            {REVENUE_CATEGORIES.map(cat => (
              <div key={cat} className="flex flex-col">
                <label className="text-[10px] font-black text-slate-400 uppercase mb-1 px-1">{cat}</label>
                <div className="relative">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 font-bold text-sm">$</span>
                  <input 
                    type="number" 
                    disabled={isSubmitted}
                    className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 ring-indigo-500/10 focus:bg-white transition-all font-bold text-slate-700" 
                    value={revenueData[cat] || ''} 
                    onChange={(e) => handleRevenueChange(cat, e.target.value)}
                    placeholder="0.00"
                  />
                </div>
              </div>
            ))}
            <div className="pt-4 mt-6 border-t border-dashed border-slate-200 flex justify-between items-center">
              <span className="text-xs font-black uppercase text-slate-400">Total Income</span>
              <span className="text-xl font-black text-emerald-600">${totals.rev.toLocaleString()}</span>
            </div>
          </div>
        </section>

        {/* Expenses Section */}
        <section className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col">
          <h2 className="font-black text-xs uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
            <Wallet className="text-rose-500" size={16}/> Weekly Expenses
          </h2>
          
          {!isSubmitted && (
            <form onSubmit={addExpense} className="space-y-3 mb-6 bg-slate-50 p-4 rounded-2xl border border-slate-100">
              <select name="category" required className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none">
                <option value="">Select Category...</option>
                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 font-bold text-xs">$</span>
                  <input name="amount" type="number" step="0.01" required placeholder="0.00" className="w-full pl-7 pr-3 py-3 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none" />
                </div>
                <button type="submit" className="bg-slate-900 text-white px-5 rounded-xl hover:bg-black transition-colors">
                  <Plus size={20}/>
                </button>
              </div>
            </form>
          )}

          <div className="flex-1 overflow-y-auto max-h-[500px] space-y-2 pr-2 custom-scrollbar">
            {expenses.length === 0 ? (
              <div className="py-20 text-center">
                <p className="text-slate-300 text-[10px] font-black uppercase tracking-tighter">No expenses recorded</p>
              </div>
            ) : (
              expenses.map(exp => (
                <div key={exp.id} className="flex justify-between items-center p-4 bg-slate-50 border border-slate-100 rounded-2xl group transition-all">
                  <div>
                    <p className="font-bold text-slate-700 text-sm">{exp.category}</p>
                    <p className="text-[9px] text-slate-400 font-medium uppercase">{exp.timestamp}</p>
                  </div>
                  <span className="font-black text-rose-600">-${exp.amount.toFixed(2)}</span>
                </div>
              ))
            )}
          </div>
          
          <div className="pt-4 mt-auto border-t border-dashed border-slate-200 flex justify-between items-center">
            <span className="text-xs font-black uppercase text-slate-400">Total Expenses</span>
            <span className="text-xl font-black text-rose-600">-${totals.exp.toLocaleString()}</span>
          </div>
        </section>
      </main>

      {/* Fixed Footer Actions */}
      <footer className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[92%] max-w-lg bg-white/80 backdrop-blur-xl border border-white/50 shadow-2xl rounded-full p-3 flex justify-between items-center z-50">
        <div className="px-6">
          <p className="text-slate-400 text-[9px] uppercase font-black tracking-widest leading-none mb-1">Status</p>
          <p className={`text-xs font-bold uppercase ${isSubmitted ? 'text-rose-500' : 'text-indigo-600'}`}>
            {isSubmitted ? 'Record Locked' : 'Syncing Live'}
          </p>
        </div>
        {!isSubmitted ? (
          <button 
            onClick={() => { if(window.confirm("Finalize this week's records? This will lock editing.")) updateCloudData({ status: 'submitted' })}}
            className="bg-indigo-600 text-white px-10 py-4 rounded-full font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 active:scale-95"
          >
            Finalize Week
          </button>
        ) : (
          <div className="flex items-center gap-2 text-rose-500 font-black text-xs uppercase tracking-widest bg-rose-50 px-8 py-4 rounded-full border border-rose-100">
            <Lock size={14} /> Finalized
          </div>
        )}
      </footer>
    </div>
  );
}
