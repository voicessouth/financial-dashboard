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
  WifiOff,
  RefreshCw,
  Database
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
  const [connectionError, setConnectionError] = useState(null);
  const [isEmpty, setIsEmpty] = useState(false);
  
  const [showOtherInput, setShowOtherInput] = useState(false);

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

  useEffect(() => {
    const initAuth = async () => {
      try {
        await signInAnonymously(auth);
      } catch (err) {
        console.error("Auth Error:", err);
        setConnectionError("Auth Failed");
      } finally {
        setLoading(false);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!user || !selectedSheetDate) return;
    const docPath = doc(db, 'church_reports', selectedSheetDate);
    
    const unsubscribe = onSnapshot(docPath, (docSnap) => {
      setDbConnected(true);
      setConnectionError(null);
      if (docSnap.exists()) {
        const data = docSnap.data();
        setRevenueData(data.revenue || {});
        setBankBalance(data.bankBalance || 0);
        setExpenses(data.expenses || []);
        setIsSubmitted(data.status === 'submitted');
        setIsEmpty(false);
      } else {
        setRevenueData({});
        setBankBalance(0);
        setExpenses([]);
        setIsSubmitted(false);
        setIsEmpty(true);
      }
    }, (err) => {
      console.error("Connection Error:", err);
      setDbConnected(false);
      setConnectionError(err.code === 'permission-denied' ? "Rules Error" : "Disconnected");
    });
    return () => unsubscribe();
  }, [user, selectedSheetDate]);

  const currentDayRevenue = useMemo(() => {
    return revenueData[selectedIncomeDay] || {};
  }, [revenueData, selectedIncomeDay]);

  const totals = useMemo(() => {
    let rev = parseFloat(bankBalance) || 0;
    Object.values(revenueData).forEach(dayData => {
      Object.values(dayData).forEach(val => {
        rev += (parseFloat(val) || 0);
      });
    });
    const exp = expenses.reduce((acc, e) => acc + (parseFloat(e.amount) || 0), 0);
    return { rev, exp, net: rev - exp };
  }, [revenueData, expenses, bankBalance]);

  const updateDoc = async (data) => {
    if (!user || !selectedSheetDate || isSubmitted) return;
    const docPath = doc(db, 'church_reports', selectedSheetDate);
    try {
      await setDoc(docPath, { 
        ...data, 
        lastSync: new Date().toISOString(),
        updatedBy: user.uid 
      }, { merge: true });
      setDbConnected(true);
    } catch (err) {
      console.error("Save Error:", err);
      setConnectionError("Save Failed");
    }
  };

  const handleInitialize = () => {
    // Force writing a small packet of data to trigger the collection creation in Firebase Console
    updateDoc({ 
      revenue: {}, 
      bankBalance: 0, 
      expenses: [], 
      status: 'active',
      initTimestamp: new Date().toISOString() 
    });
  };

  const handleRevenueChange = (cat, val) => {
    const updatedDayData = { ...currentDayRevenue, [cat]: val };
    const updatedFullRevenue = { ...revenueData, [selectedIncomeDay]: updatedDayData };
    setRevenueData(updatedFullRevenue);
    updateDoc({ revenue: updatedFullRevenue });
  };

  const handleBankBalanceChange = (val) => {
    setBankBalance(val);
    updateDoc({ bankBalance: val });
  };

  const addExpense = (e) => {
    e.preventDefault();
    if (isSubmitted) return;
    const formData = new FormData(e.target);
    const category = formData.get('category');
    const otherDescription = formData.get('otherDescription');
    
    const finalCategory = category === 'Other' && otherDescription 
      ? `Other: ${otherDescription}` 
      : category;

    const newExpense = {
      id: Date.now().toString(),
      category: finalCategory,
      amount: parseFloat(formData.get('amount')) || 0,
      timestamp: new Date().toLocaleTimeString()
    };
    const updated = [newExpense, ...expenses];
    setExpenses(updated);
    updateDoc({ expenses: updated });
    e.target.reset();
    setShowOtherInput(false);
  };

  const downloadCSV = () => {
    let csvRows = [];
    csvRows.push(`Report Week Ending,${selectedSheetDate}`);
    csvRows.push(`Starting Bank Balance,${bankBalance}`);
    csvRows.push('');
    csvRows.push('INCOME BREAKDOWN');
    csvRows.push('Category,Day,Amount');
    Object.entries(revenueData).forEach(([day, categories]) => {
      Object.entries(categories).forEach(([cat, amt]) => {
        if (amt) csvRows.push(`${cat},${day},${amt}`);
      });
    });
    csvRows.push('');
    csvRows.push('EXPENSES');
    csvRows.push('Category,Amount,Time');
    expenses.forEach(exp => {
      csvRows.push(`"${exp.category}",${exp.amount},${exp.timestamp}`);
    });
    csvRows.push('');
    csvRows.push(`TOTAL REVENUE (Inc Bank),${totals.rev}`);
    csvRows.push(`TOTAL EXPENSES,${totals.exp}`);
    csvRows.push(`NET CASH FLOW,${totals.net}`);
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.setAttribute('hidden', ''); a.setAttribute('href', url); a.setAttribute('download', `Report_${selectedSheetDate}.csv`);
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="font-bold text-slate-600 tracking-widest uppercase text-xs">Connecting to Secure Server...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans">
        <header className="max-w-4xl mx-auto mb-8 flex flex-col md:flex-row justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200 gap-4">
            <div className="flex flex-col md:flex-row items-center gap-4 text-center md:text-left">
              <div className="relative">
                <h1 className="text-2xl font-black text-slate-800 tracking-tight">Financial Dashboard</h1>
                <div className="flex items-center gap-1.5 mt-1 justify-center md:justify-start">
                   {dbConnected ? (
                     <div className="flex items-center gap-1 text-[10px] font-black text-emerald-500 uppercase tracking-widest bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                       <Wifi size={10} /> Database Live
                     </div>
                   ) : (
                     <div className="flex items-center gap-1 text-[10px] font-black text-rose-500 uppercase tracking-widest bg-rose-50 px-2 py-0.5 rounded-full border border-rose-100 animate-pulse">
                       <WifiOff size={10} /> {connectionError || "Connecting..."}
                     </div>
                   )}
                </div>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={downloadCSV}
                  className="flex items-center gap-2 bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-slate-700 transition-colors"
                >
                  <Download size={14} /> Download
                </button>
                {isEmpty && dbConnected && (
                  <button 
                    onClick={handleInitialize}
                    className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-xl text-xs font-bold hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200"
                  >
                    <Database size={14} /> Start Week
                  </button>
                )}
              </div>
            </div>
            
            <div className="flex flex-wrap items-center justify-center gap-4">
              <div className="flex items-center gap-3 bg-slate-50 border border-slate-100 px-4 py-2 rounded-xl">
                <Wallet size={18} className="text-slate-500" />
                <div className="flex flex-col">
                  <label className="text-[10px] font-black text-slate-400 uppercase leading-none mb-1">Starting Balance</label>
                  <div className="relative">
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-sm">$</span>
                    <input 
                      type="number"
                      disabled={isSubmitted}
                      value={bankBalance || ''}
                      onChange={(e) => handleBankBalanceChange(e.target.value)}
                      placeholder="0.00"
                      className="bg-transparent text-sm font-black text-slate-700 outline-none w-24 pl-3"
                    />
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 bg-indigo-50 px-4 py-2 rounded-xl border border-indigo-100">
                <Calendar size={18} className="text-indigo-600" />
                <div className="flex flex-col">
                  <label className="text-[10px] font-black text-indigo-400 uppercase leading-none mb-1">Select Week Ending</label>
                  <select 
                    value={selectedSheetDate} 
                    onChange={(e) => setSelectedSheetDate(e.target.value)}
                    className="bg-transparent text-sm font-black text-indigo-700 outline-none cursor-pointer"
                  >
                    {weeksOfYear.map(week => (
                      <option key={week} value={week}>Friday, {week.replace(/-/g, '/')}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
        </header>

        <main className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6 pb-32">
            <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <div className="flex justify-between items-start mb-6">
                  <h2 className="font-bold flex items-center gap-2 text-slate-700">
                    <TrendingUp className="text-emerald-500" size={20}/> Weekly Income
                  </h2>
                  <div className="bg-slate-50 border border-slate-100 px-3 py-1 rounded-lg">
                    <label className="text-[9px] font-black text-slate-400 uppercase block leading-none mb-1">Giving Day</label>
                    <select 
                      value={selectedIncomeDay} 
                      onChange={(e) => setSelectedIncomeDay(e.target.value)}
                      className="bg-transparent text-xs font-bold text-slate-600 outline-none cursor-pointer"
                    >
                      {INCOME_DAY_OPTIONS.map(day => <option key={day} value={day}>{day}</option>)}
                    </select>
                  </div>
                </div>

                <div className="space-y-4">
                  {REVENUE_CATEGORIES.map(cat => (
                      <div key={cat}>
                          <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">{cat}</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                            <input 
                                type="number" 
                                disabled={isSubmitted}
                                className="w-full pl-7 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 ring-indigo-500/20 transition-all font-semibold" 
                                value={currentDayRevenue[cat] || ''} 
                                onChange={(e) => handleRevenueChange(cat, e.target.value)}
                                placeholder="0.00"
                            />
                          </div>
                      </div>
                  ))}
                </div>
            </section>

            <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col">
                <h2 className="font-bold mb-6 flex items-center gap-2 text-slate-700">
                  <Wallet className="text-rose-500" size={20}/> Weekly Expenses
                </h2>
                {!isSubmitted && (
                  <form onSubmit={addExpense} className="space-y-3 mb-8 bg-slate-50 p-4 rounded-xl border border-slate-100">
                      <select name="category" required onChange={(e) => setShowOtherInput(e.target.value === 'Other')} className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm font-medium outline-none focus:border-indigo-500">
                          <option value="">Select Category...</option>
                          {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      {showOtherInput && (
                        <input name="otherDescription" type="text" required placeholder="Specify description" className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm font-medium outline-none focus:border-indigo-500 animate-in fade-in slide-in-from-top-1" />
                      )}
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold text-xs">$</span>
                          <input name="amount" type="number" step="0.01" required placeholder="0.00" className="w-full pl-6 pr-2 py-2 bg-white border border-slate-200 rounded-lg text-sm font-bold outline-none focus:border-indigo-500" />
                        </div>
                        <button type="submit" className="bg-indigo-600 text-white px-4 rounded-lg hover:bg-indigo-700 transition-all shadow-md shadow-indigo-100"><Plus size={20}/></button>
                      </div>
                  </form>
                )}
                <div className="flex-1 overflow-y-auto max-h-[400px] space-y-2 pr-1 custom-scrollbar">
                    {expenses.length === 0 && <p className="text-center text-slate-300 text-xs py-10 uppercase font-bold italic">Empty log</p>}
                    {expenses.map(exp => (
                        <div key={exp.id} className="flex justify-between items-center text-sm p-3 bg-slate-50 border border-slate-100 rounded-xl">
                            <div><p className="font-bold text-slate-700">{exp.category}</p></div>
                            <span className="font-black text-rose-600">-${exp.amount.toFixed(2)}</span>
                        </div>
                    ))}
                </div>
            </section>
        </main>

        <footer className="fixed bottom-0 left-0 right-0 bg-slate-900 text-white p-6 shadow-2xl z-20">
            <div className="max-w-4xl mx-auto flex flex-row justify-between items-center">
              <div>
                  <p className="text-slate-400 text-[10px] uppercase font-black mb-1 tracking-widest">Net Cash Flow</p>
                  <p className={`text-3xl font-black ${totals.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    ${totals.net.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
              </div>
              {!isSubmitted ? (
                <button onClick={() => updateDoc({ status: 'submitted' })} className="bg-indigo-500 hover:bg-indigo-600 px-8 py-3 rounded-2xl font-black text-sm transition-all active:scale-95 shadow-lg shadow-indigo-500/20">Finalize</button>
              ) : (
                <div className="flex items-center gap-2 text-emerald-400 font-bold bg-emerald-400/10 px-6 py-3 rounded-2xl border border-emerald-400/20"><CheckCircle2 size={18} /> Locked</div>
              )}
            </div>
        </footer>
    </div>
  );
};

export default App;