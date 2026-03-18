import React, { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
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
  Plus,
  Trash2,
  CheckCircle2,
  AlertCircle,
  ChevronLeft,
  Cloud,
  Layers,
  Send,
  Lock,
  Download,
  Wifi,
  RefreshCw,
  Database,
  ArrowRightLeft
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

const REVENUE_CATEGORIES = [
  'Cash/Checks', 'Credit Card', 'Text', 'Givelify', 
  'Tithely', 'CashApp', 'Zelle', 'Website Giving'
];

const INCOME_DAY_OPTIONS = [
  'Sun', 'Tue', 'End of week', 'End of month'
];

const EXPENSE_CATEGORIES = [
  'Mortgage - Kirkland Group', 'Pastor Payroll', 'Lady Val Payroll', 
  'Admin Payroll Taxes and fees', 'Band Payroll', 'Pastor Love offerings', 
  'Georgia Power', 'Georgia Natural Gas', 'Spectrum (TV, Phone, Internet)', 
  'Henry County Water Authority', 'TMobile', 'Kaiser Permanente', 
  'GFL Environmental', 'Ministry Design', 'Quickbooks', 
  'Team Pest USA', 'First Citizens Bank', 'Other'
];

const App = () => {
  const [user, setUser] = useState(null);
  const [selectedSheetDate, setSelectedSheetDate] = useState('1-2-26');
  const [selectedIncomeDay, setSelectedIncomeDay] = useState('Sun');
  const [revenueData, setRevenueData] = useState({});
  const [bankBalance, setBankBalance] = useState(0);
  const [expenses, setExpenses] = useState([]);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dbConnected, setDbConnected] = useState(false);
  const [showOtherInput, setShowOtherInput] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Generate weeks for the dropdown
  const weeksOfYear = useMemo(() => {
    const weeks = [];
    let current = new Date(2026, 0, 2); 
    const endOfYear = new Date(2026, 11, 31);
    while (current <= endOfYear) {
      const dateStr = `${current.getMonth() + 1}-${current.getDate()}-${current.getFullYear().toString().slice(-2)}`;
      weeks.push(dateStr);
      current.setDate(current.getDate() + 7);
    }
    return weeks;
  }, []);

  // Auth Initialization
  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (err) {
        console.error("Auth Error:", err);
      } finally {
        setLoading(false);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => setUser(u));
    return () => unsubscribe();
  }, []);

  // Real-time Sync for selected week
  useEffect(() => {
    if (!user || !selectedSheetDate) return;
    
    const docPath = doc(db, 'church_reports', selectedSheetDate);
    const unsubscribe = onSnapshot(docPath, (docSnap) => {
      setDbConnected(true);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setRevenueData(data.revenue || {});
        setBankBalance(data.bankBalance || 0);
        setExpenses(data.expenses || []);
        setIsSubmitted(data.status === 'submitted');
      } else {
        // Reset local state if document doesn't exist yet
        setRevenueData({});
        setBankBalance(0);
        setExpenses([]);
        setIsSubmitted(false);
      }
    }, (err) => {
      setDbConnected(false);
    });
    return () => unsubscribe();
  }, [user, selectedSheetDate]);

  // Totals Calculation
  const totals = useMemo(() => {
    let rev = parseFloat(bankBalance) || 0;
    // Sum all days of income
    Object.values(revenueData).forEach(dayData => {
      if (typeof dayData === 'object') {
        Object.values(dayData).forEach(val => {
          rev += (parseFloat(val) || 0);
        });
      }
    });
    const exp = expenses.reduce((acc, e) => acc + (parseFloat(e.amount) || 0), 0);
    return { rev, exp, net: rev - exp };
  }, [revenueData, expenses, bankBalance]);

  // Firestore update helper
  const updateDoc = async (data) => {
    if (!user || !selectedSheetDate || isSubmitted) return;
    setIsSaving(true);
    const docPath = doc(db, 'church_reports', selectedSheetDate);
    try {
      await setDoc(docPath, { 
        ...data, 
        lastSync: new Date().toISOString(),
        updatedBy: user.uid 
      }, { merge: true });
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setTimeout(() => setIsSaving(false), 500);
    }
  };

  const handleRevenueChange = (cat, val) => {
    const currentDayData = revenueData[selectedIncomeDay] || {};
    const updatedDayData = { ...currentDayData, [cat]: val };
    const updatedFullRevenue = { ...revenueData, [selectedIncomeDay]: updatedDayData };
    setRevenueData(updatedFullRevenue);
    updateDoc({ revenue: updatedFullRevenue });
  };

  const addExpense = (e) => {
    e.preventDefault();
    if (isSubmitted) return;
    const formData = new FormData(e.target);
    const category = formData.get('category');
    const amount = parseFloat(formData.get('amount')) || 0;
    const finalCategory = category === 'Other' ? `Other: ${formData.get('otherDescription')}` : category;
    
    const newExpense = {
      id: Date.now().toString(),
      category: finalCategory,
      amount: amount,
      timestamp: new Date().toLocaleTimeString()
    };
    
    const updated = [newExpense, ...expenses];
    setExpenses(updated);
    updateDoc({ expenses: updated });
    e.target.reset();
    setShowOtherInput(false);
  };

  const deleteExpense = (id) => {
    if (isSubmitted) return;
    const updated = expenses.filter(e => e.id !== id);
    setExpenses(updated);
    updateDoc({ expenses: updated });
  };

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <RefreshCw className="text-indigo-500 animate-spin mb-4" size={32} />
        <p className="font-black text-slate-400 uppercase tracking-widest text-xs text-center">
            Initializing Secure Cloud Session...
        </p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans pb-40">
        {/* Header Section */}
        <header className="max-w-4xl mx-auto mb-8 flex flex-col md:flex-row justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-200 gap-4">
            <div className="flex flex-col gap-1">
              <h1 className="text-2xl font-black text-slate-800 tracking-tight">Financial Dashboard</h1>
              <div className="flex items-center gap-3">
                <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full ${dbConnected ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${dbConnected ? 'bg-emerald-500' : 'bg-rose-500 animate-pulse'}`}></div>
                  <span className="text-[10px] font-black uppercase tracking-widest">{dbConnected ? 'Cloud Sync Active' : 'Offline'}</span>
                </div>
                {isSaving && <span className="text-[10px] font-black text-indigo-400 uppercase animate-pulse">Saving...</span>}
              </div>
            </div>
            
            <div className="flex flex-wrap items-center gap-4">
              <div className="bg-slate-50 border border-slate-100 px-4 py-2 rounded-2xl flex flex-col">
                <label className="text-[9px] font-black text-slate-400 uppercase mb-0.5">Bank Start Balance</label>
                <div className="flex items-center">
                  <span className="text-slate-400 font-bold mr-1">$</span>
                  <input 
                    type="number"
                    disabled={isSubmitted}
                    value={bankBalance || ''}
                    onChange={(e) => { 
                      const val = e.target.value;
                      setBankBalance(val); 
                      updateDoc({ bankBalance: val }); 
                    }}
                    className="bg-transparent text-sm font-black text-slate-700 outline-none w-24"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="bg-indigo-50 px-4 py-2 rounded-2xl border border-indigo-100 text-center flex flex-col">
                <label className="text-[9px] font-black text-indigo-400 uppercase mb-0.5">Report Week</label>
                <select 
                  value={selectedSheetDate} 
                  onChange={(e) => setSelectedSheetDate(e.target.value)}
                  className="bg-transparent text-sm font-black text-indigo-700 outline-none cursor-pointer"
                >
                  {weeksOfYear.map(week => (
                    <option key={week} value={week}>{week.replace(/-/g, '/')}</option>
                  ))}
                </select>
              </div>
            </div>
        </header>

        {/* Main Content */}
        <main className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
            
            {/* Income Section */}
            <section className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
                <div className="flex justify-between items-center mb-6">
                  <h2 className="font-bold flex items-center gap-2 text-slate-700">
                    <TrendingUp className="text-emerald-500" size={20}/> 
                    Weekly Income
                  </h2>
                  <select 
                    value={selectedIncomeDay} 
                    onChange={(e) => setSelectedIncomeDay(e.target.value)} 
                    className="text-[10px] font-black text-slate-500 bg-slate-50 rounded-xl px-3 py-1.5 border border-slate-100 outline-none"
                  >
                    {INCOME_DAY_OPTIONS.map(day => <option key={day} value={day}>{day}</option>)}
                  </select>
                </div>

                <div className="space-y-4">
                  {REVENUE_CATEGORIES.map(cat => (
                      <div key={cat} className="group">
                          <label className="text-[10px] font-black text-slate-400 group-focus-within:text-indigo-500 uppercase mb-1 block transition-colors">
                            {cat}
                          </label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                            <input 
                                type="number" 
                                disabled={isSubmitted}
                                className="w-full pl-7 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none font-semibold focus:ring-2 ring-indigo-500/10 focus:border-indigo-300 transition-all" 
                                value={revenueData[selectedIncomeDay]?.[cat] || ''} 
                                onChange={(e) => handleRevenueChange(cat, e.target.value)}
                                placeholder="0.00"
                            />
                          </div>
                      </div>
                  ))}
                </div>
            </section>

            {/* Expense Section */}
            <section className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col">
                <h2 className="font-bold mb-6 flex items-center gap-2 text-slate-700">
                    <Wallet className="text-rose-500" size={20}/> 
                    Expense Log
                </h2>
                
                {!isSubmitted && (
                  <form onSubmit={addExpense} className="space-y-3 mb-6 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <select 
                        name="category" 
                        required 
                        onChange={(e) => setShowOtherInput(e.target.value === 'Other')} 
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:ring-2 ring-indigo-500/10"
                      >
                          <option value="">Select Category...</option>
                          {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      
                      {showOtherInput && (
                        <input 
                            name="otherDescription" 
                            type="text" 
                            required 
                            placeholder="Expense Description" 
                            className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-sm font-medium outline-none" 
                        />
                      )}

                      <div className="flex gap-2">
                        <div className="relative flex-1">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                            <input 
                                name="amount" 
                                type="number" 
                                step="0.01" 
                                required 
                                placeholder="0.00" 
                                className="w-full pl-7 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none focus:ring-2 ring-indigo-500/10" 
                            />
                        </div>
                        <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 rounded-xl transition-all active:scale-95 shadow-lg shadow-indigo-200">
                            <Plus size={20}/>
                        </button>
                      </div>
                  </form>
                )}

                <div className="flex-1 overflow-y-auto max-h-[450px] space-y-2 pr-1 custom-scrollbar">
                    {expenses.length === 0 && (
                        <div className="text-center py-12 text-slate-300">
                            <History size={32} className="mx-auto mb-2 opacity-20" />
                            <p className="text-[10px] font-black uppercase tracking-widest italic">No expenses recorded</p>
                        </div>
                    )}
                    {expenses.map(exp => (
                        <div key={exp.id} className="flex justify-between items-center text-sm p-4 bg-slate-50 border border-slate-100 rounded-2xl group animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="flex flex-col">
                                <span className="font-bold text-slate-700 leading-tight">{exp.category}</span>
                                <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter mt-0.5">{exp.timestamp}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="font-black text-rose-600">-${exp.amount.toFixed(2)}</span>
                                {!isSubmitted && (
                                    <button 
                                        onClick={() => deleteExpense(exp.id)}
                                        className="text-slate-300 hover:text-rose-500 p-1 transition-colors"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </main>

        {/* Floating Summary Footer */}
        <footer className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[95%] max-w-4xl bg-slate-900 text-white p-6 rounded-[2.5rem] shadow-2xl z-20 border border-white/10 backdrop-blur-md">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-4 md:gap-8">
                  <div>
                      <p className="text-slate-400 text-[10px] uppercase font-black mb-1 tracking-widest">Total Income</p>
                      <p className="text-xl font-bold text-white">${totals.rev.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                  </div>
                  <div className="h-8 w-px bg-white/10 hidden md:block"></div>
                  <div>
                      <p className="text-slate-400 text-[10px] uppercase font-black mb-1 tracking-widest">Net Cash Flow</p>
                      <p className={`text-2xl font-black ${totals.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        ${totals.net.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </p>
                  </div>
              </div>

              {!isSubmitted ? (
                <button 
                    onClick={() => updateDoc({ status: 'submitted' })} 
                    className="bg-indigo-500 hover:bg-indigo-600 text-white px-6 md:px-10 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all active:scale-95 shadow-xl shadow-indigo-900/50"
                >
                    Finalize Report
                </button>
              ) : (
                <div className="flex items-center gap-2 text-emerald-400 font-bold bg-emerald-400/10 px-6 py-3 rounded-2xl border border-emerald-400/20">
                    <CheckCircle2 size={18} /> 
                    <span className="text-xs uppercase tracking-widest">Locked</span>
                </div>
              )}
            </div>
        </footer>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}

export default App;
