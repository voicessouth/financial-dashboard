import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  onSnapshot, 
  collection, 
  query,
  getDoc
} from 'firebase/firestore';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  TrendingUp, 
  Wallet, 
  PlusCircle, 
  Calendar, 
  History,
  PieChart, 
  DollarSign, 
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  Cloud,
  Layers,
  Send,
  Lock,
  Download
} from 'lucide-react';

// --- FIREBASE CONFIGURATION ---
// PASTE YOUR REAL KEYS FROM THE FIREBASE CONSOLE HERE
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
  const [activeSheetDate, setActiveSheetDate] = useState(null);
  const [selectedSheetDate, setSelectedSheetDate] = useState(null);
  const [revenueData, setRevenueData] = useState({});
  const [expenses, setExpenses] = useState([]);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (firebaseConfig.apiKey !== "PASTE_YOUR_API_KEY_HERE") {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth Error:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const getWorksheetDate = (dateObj) => {
    const d = new Date(dateObj);
    const day = d.getDay();
    const diff = day >= 2 ? day - 2 : day + 5; 
    const lastTuesday = new Date(d);
    lastTuesday.setDate(d.getDate() - diff);
    return `${lastTuesday.getMonth() + 1}-${lastTuesday.getDate()}-${lastTuesday.getFullYear().toString().slice(-2)}`;
  };

  useEffect(() => {
    const current = getWorksheetDate(new Date());
    setActiveSheetDate(current);
    setSelectedSheetDate(current);
  }, []);

  useEffect(() => {
    if (!user || !selectedSheetDate || firebaseConfig.apiKey === "PASTE_YOUR_API_KEY_HERE") return;
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
    }, (error) => {
      console.error("Firestore error:", error);
    });
    return () => unsubscribe();
  }, [user, selectedSheetDate]);

  const totals = useMemo(() => {
    const rev = Object.values(revenueData).reduce((acc, val) => acc + (parseFloat(val) || 0), 0);
    const exp = expenses.reduce((acc, e) => acc + (parseFloat(e.amount) || 0), 0);
    return { rev, exp, net: rev - exp };
  }, [revenueData, expenses]);

  const updateCloudData = async (updates) => {
    if (!user || !selectedSheetDate || isSubmitted) return;
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'reports', selectedSheetDate);
      await setDoc(docRef, { ...updates, lastUpdated: new Date().toISOString() }, { merge: true });
    } catch (e) {
      console.error("Error updating cloud data:", e);
    }
  };

  const handleRevenueChange = (cat, val) => {
    const updated = { ...revenueData, [cat]: val };
    setRevenueData(updated);
    updateCloudData({ revenue: updated });
  };

  const addExpense = (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const amt = parseFloat(formData.get('amount')) || 0;
    if (amt <= 0) return;

    const newExpense = {
      id: Date.now().toString(),
      category: formData.get('category'),
      amount: amt,
      timestamp: new Date().toLocaleTimeString()
    };
    const updated = [newExpense, ...expenses];
    setExpenses(updated);
    updateCloudData({ expenses: updated });
    e.target.reset();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 font-sans text-slate-900">
      {firebaseConfig.apiKey === "PASTE_YOUR_API_KEY_HERE" && (
        <div className="max-w-4xl mx-auto mb-4 bg-amber-50 border border-amber-200 p-4 rounded-xl text-amber-800 text-sm font-medium animate-pulse">
          <AlertCircle className="inline-block mr-2" size={16} />
          Configuration required: Please paste your real Firebase keys into App.jsx.
        </div>
      )}

      <header className="max-w-4xl mx-auto mb-8 bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-black text-slate-800 tracking-tight">Church Financial Dashboard</h1>
          <p className="text-indigo-600 font-bold text-xs uppercase">Report Week: {selectedSheetDate}</p>
        </div>
        <div className="text-right">
          <p className="text-xs font-bold text-slate-400 uppercase">Weekly Net Balance</p>
          <p className="text-2xl font-black text-emerald-600">${totals.net.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
        </div>
      </header>

      <main className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 pb-24">
        {/* Income Section */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <h3 className="font-bold mb-6 flex items-center gap-2 text-slate-700 uppercase text-sm tracking-widest">
            <TrendingUp size={18} className="text-emerald-500" /> Revenue
          </h3>
          <div className="space-y-4">
            {REVENUE_CATEGORIES.map(cat => (
              <div key={cat}>
                <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">{cat}</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                  <input 
                    type="number" 
                    disabled={isSubmitted}
                    value={revenueData[cat] || ''} 
                    onChange={(e) => handleRevenueChange(cat, e.target.value)}
                    className="w-full pl-7 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:border-indigo-500 font-semibold transition-all disabled:opacity-50" 
                    placeholder="0.00"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Expense Section */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex flex-col">
          <h3 className="font-bold mb-6 flex items-center gap-2 text-slate-700 uppercase text-sm tracking-widest">
            <Wallet size={18} className="text-rose-500" /> Expenses
          </h3>
          {!isSubmitted && (
            <form onSubmit={addExpense} className="space-y-3 mb-6 bg-slate-50 p-4 rounded-xl border border-slate-100">
              <select name="category" required className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm font-medium outline-none">
                <option value="">Select Category...</option>
                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <div className="flex gap-2">
                <input name="amount" type="number" step="0.01" required placeholder="0.00" className="flex-1 p-2 bg-white border border-slate-200 rounded-lg text-sm font-bold outline-none" />
                <button type="submit" className="bg-indigo-600 text-white px-4 rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"><Plus size={20}/></button>
              </div>
            </form>
          )}
          <div className="flex-1 space-y-2 overflow-y-auto max-h-[500px] pr-1">
            {expenses.length === 0 ? (
              <div className="text-center py-12 text-slate-300">
                <History className="mx-auto mb-2 opacity-20" size={32} />
                <p className="text-[10px] font-black uppercase">No expenses logged</p>
              </div>
            ) : (
              expenses.map(exp => (
                <div key={exp.id} className="flex justify-between items-center text-sm p-3 bg-slate-50 border border-slate-100 rounded-xl">
                  <div>
                    <p className="font-bold text-slate-700 leading-none mb-1">{exp.category}</p>
                    <p className="text-[9px] text-slate-400 font-bold uppercase">{exp.timestamp}</p>
                  </div>
                  <span className="font-black text-rose-600">-${exp.amount.toFixed(2)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </main>

      {/* Footer / Submission */}
      <footer className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-md border-t border-slate-200 p-4 z-10">
        <div className="max-w-4xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${isSubmitted ? 'bg-rose-500' : 'bg-emerald-500 animate-pulse'}`}></div>
            <span className="text-xs font-bold text-slate-700 uppercase tracking-tight">
              {isSubmitted ? 'Report Finalized' : 'Syncing to Cloud'}
            </span>
          </div>
          {!isSubmitted ? (
            <button 
              onClick={() => { if(confirm("Are you sure you want to finalize this week? This will lock the entries.")) updateCloudData({ status: 'submitted' })}}
              className="bg-slate-900 text-white px-8 py-3 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-black transition-all shadow-lg"
            >
              Finalize Week
            </button>
          ) : (
             <div className="flex items-center gap-2 text-rose-600 font-black text-xs uppercase bg-rose-50 px-4 py-2 rounded-xl border border-rose-100">
               <Lock size={14} /> View Only
             </div>
          )}
        </div>
      </footer>
    </div>
  );
}
