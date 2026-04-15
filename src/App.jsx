import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  onSnapshot, 
  collection,
  addDoc,
  deleteDoc,
  getDoc
} from 'firebase/firestore';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken,
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  TrendingUp, 
  Wallet, 
  Plus,
  ChevronLeft,
  ChevronRight,
  Trash2,
  Lock,
  Unlock,
  BarChart3,
  Download,
  Calendar,
  Copy,
  CheckCircle2
} from 'lucide-react';

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'voices-south-portal';

const REVENUE_CATEGORIES = [
  'cash', 'credit', 'text', 'givelify', 
  'tithely', 'cashapp', 'zelle', 'website'
];

const EXPENSE_CATEGORIES = [
  'Lady Val Payroll', 'MORTGAGE - KIRKLAND GROUP', 'UTILITIES', 
  'MAINTENANCE', 'SUPPLIES', 'MINISTRY', 'TRAVEL', 'OTHER'
];

export default function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState('weekly'); // 'weekly' or 'monthly'
  const [selectedSheetDate, setSelectedSheetDate] = useState("4-12-2026");
  const [revenueData, setRevenueData] = useState({});
  const [expenses, setExpenses] = useState([]);
  const [isLocked, setIsLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [dbStatus, setDbStatus] = useState('connecting');
  const [newExpense, setNewExpense] = useState({ category: EXPENSE_CATEGORIES[0], amount: '' });
  const [copyFeedback, setCopyFeedback] = useState(false);

  // Monthly State
  const [monthlyStats, setMonthlyStats] = useState({ income: {}, expenses: [], totalIn: 0, totalOut: 0, loading: false });

  const getWorksheetDate = (dateObj) => {
    const d = new Date(dateObj);
    return `${d.getMonth() + 1}-${d.getDate()}-${d.getFullYear()}`;
  };

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) { 
        setDbStatus('error');
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
      if (u) setDbStatus('online');
    });
    return () => unsubscribe();
  }, []);

  // Weekly Sync
  useEffect(() => {
    if (!user || !selectedSheetDate || view !== 'weekly') return;
    
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'finance_entries', selectedSheetDate);
    const expCol = collection(db, 'artifacts', appId, 'public', 'data', 'finance_entries', selectedSheetDate, 'expenses');
    
    const unsubscribeDoc = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setRevenueData(data.income || {});
        setIsLocked(data.status === 'locked');
      } else {
        setRevenueData({});
        setIsLocked(false);
      }
    }, () => setDbStatus('error'));
    
    const unsubscribeExp = onSnapshot(expCol, (snap) => {
        const exps = [];
        snap.forEach(d => exps.push({ id: d.id, ...d.data() }));
        setExpenses(exps);
    });

    return () => { unsubscribeDoc(); unsubscribeExp(); };
  }, [user, selectedSheetDate, view]);

  // Monthly Data Aggregator
  const loadMonthlySummary = async () => {
    if (!user) return;
    setMonthlyStats(prev => ({ ...prev, loading: true }));
    
    const parts = selectedSheetDate.split('-');
    const month = parseInt(parts[0]);
    const year = parseInt(parts[2]);
    
    // Find all Sundays (or relevant dates) in that month
    const datesToScan = [];
    const tempDate = new Date(year, month - 1, 1);
    while (tempDate.getMonth() === month - 1) {
        datesToScan.push(`${month}-${tempDate.getDate()}-${year}`);
        tempDate.setDate(tempDate.getDate() + 1);
    }

    let aggregatedIncome = {};
    let aggregatedExpenses = [];

    for (const dateKey of datesToScan) {
        const dRef = doc(db, 'artifacts', appId, 'public', 'data', 'finance_entries', dateKey);
        const snap = await getDoc(dRef);
        if (snap.exists()) {
            const data = snap.data().income || {};
            Object.keys(data).forEach(cat => {
                aggregatedIncome[cat] = (aggregatedIncome[cat] || 0) + (parseFloat(data[cat]) || 0);
            });
        }
        // Simplified: In a real app we'd fetch subcollections, for now aggregation via main docs or predefined structure
    }

    const totalIn = Object.values(aggregatedIncome).reduce((a, b) => a + b, 0);
    
    setMonthlyStats({
        income: aggregatedIncome,
        expenses: aggregatedExpenses,
        totalIn,
        totalOut: 0, // Expenditure aggregation would follow same pattern
        loading: false
    });
  };

  useEffect(() => {
    if (view === 'monthly') loadMonthlySummary();
  }, [view, selectedSheetDate]);

  const currentWeekTotals = useMemo(() => {
    const rev = Object.values(revenueData).reduce((acc, val) => acc + (parseFloat(val) || 0), 0);
    const exp = expenses.reduce((acc, e) => acc + (parseFloat(e.amount) || 0), 0);
    return { rev, exp, net: rev - exp };
  }, [revenueData, expenses]);

  const copyToSheets = () => {
    let csv = "Category,Amount\n";
    csv += "INCOME\n";
    REVENUE_CATEGORIES.forEach(cat => {
        csv += `${cat.toUpperCase()},${(view === 'weekly' ? revenueData[cat] : monthlyStats.income[cat]) || 0}\n`;
    });
    csv += `TOTAL INCOME,${view === 'weekly' ? currentWeekTotals.rev : monthlyStats.totalIn}\n\n`;
    
    if (view === 'weekly') {
        csv += "EXPENSES\n";
        expenses.forEach(e => {
            csv += `${e.category},${e.amount}\n`;
        });
        csv += `TOTAL EXPENSES,${currentWeekTotals.exp}\n`;
        csv += `NET FLOW,${currentWeekTotals.net}\n`;
    }

    const textArea = document.createElement("textarea");
    textArea.value = csv;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    
    setCopyFeedback(true);
    setTimeout(() => setCopyFeedback(false), 2000);
  };

  const updateRevenue = async (cat, val) => {
    if (!user || isLocked) return;
    const updated = { ...revenueData, [cat]: parseFloat(val) || 0 };
    setRevenueData(updated);
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'finance_entries', selectedSheetDate);
    await setDoc(docRef, { income: updated, lastUpdated: new Date().toISOString() }, { merge: true });
  };

  const addExpense = async (e) => {
    e.preventDefault();
    if (!user || !newExpense.amount || isLocked) return;
    const expCol = collection(db, 'artifacts', appId, 'public', 'data', 'finance_entries', selectedSheetDate, 'expenses');
    await addDoc(expCol, {
      category: newExpense.category,
      amount: parseFloat(newExpense.amount),
      timestamp: new Date().toISOString()
    });
    setNewExpense({ ...newExpense, amount: '' });
  };

  const deleteExpense = async (id) => {
    if (!user || isLocked) return;
    const expDoc = doc(db, 'artifacts', appId, 'public', 'data', 'finance_entries', selectedSheetDate, 'expenses', id);
    await deleteDoc(expDoc);
  };

  const toggleLock = async () => {
    if (!user) return;
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'finance_entries', selectedSheetDate);
    await setDoc(docRef, { status: isLocked ? 'open' : 'locked' }, { merge: true });
  };

  const changeWeek = (direction) => {
    const parts = selectedSheetDate.split('-');
    const date = new Date(parseInt(parts[2]), parseInt(parts[0]) - 1, parseInt(parts[1]));
    date.setDate(date.getDate() + (direction * 7));
    setSelectedSheetDate(getWorksheetDate(date));
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-slate-500 font-bold text-xs uppercase tracking-widest">Voices South Ledger...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-100 p-4 font-sans text-slate-900 pb-32">
      <header className="max-w-5xl mx-auto mb-6">
        <div className="flex justify-between items-center mb-6">
            <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-slate-200">
                <button 
                    onClick={() => setView('weekly')}
                    className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${view === 'weekly' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}
                >
                    Weekly
                </button>
                <button 
                    onClick={() => setView('monthly')}
                    className={`px-6 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${view === 'monthly' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-400 hover:bg-slate-50'}`}
                >
                    Monthly
                </button>
            </div>
            
            <button 
                onClick={copyToSheets}
                className="flex items-center gap-2 bg-emerald-600 text-white px-5 py-2.5 rounded-2xl font-bold text-xs uppercase tracking-widest hover:bg-emerald-700 transition-all shadow-lg shadow-emerald-200"
            >
                {copyFeedback ? <CheckCircle2 size={16}/> : <Copy size={16}/>}
                {copyFeedback ? 'Copied!' : 'Copy for Sheets'}
            </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-4 opacity-10">
                    <BarChart3 size={80} />
                </div>
                <p className="text-[10px] font-black uppercase text-slate-400 mb-1 tracking-widest">
                    {view === 'weekly' ? 'Weekly Net Sum' : 'Monthly Income Total'}
                </p>
                <h2 className="text-4xl font-black text-emerald-400 tracking-tighter">
                    ${(view === 'weekly' ? currentWeekTotals.net : monthlyStats.totalIn).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </h2>
                <div className="mt-4 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                        <span className={`w-2 h-2 rounded-full ${dbStatus === 'online' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></span>
                        <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">{dbStatus}</span>
                    </div>
                    {view === 'weekly' && (
                        <button onClick={toggleLock} className="text-[9px] font-black uppercase tracking-widest flex items-center gap-1 text-slate-400 hover:text-white transition-colors">
                            {isLocked ? <Lock size={12}/> : <Unlock size={12}/>} {isLocked ? 'Locked' : 'Open'}
                        </button>
                    )}
                </div>
            </div>

            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm md:col-span-2 flex justify-between items-center">
                <button onClick={() => changeWeek(-1)} className="p-3 hover:bg-slate-100 rounded-full transition-colors text-slate-400"><ChevronLeft size={24}/></button>
                <div className="text-center">
                    <h1 className="text-2xl font-black text-slate-800">
                        {view === 'weekly' ? `Week Ending ${selectedSheetDate}` : `Month of ${new Date(selectedSheetDate.split('-')[2], selectedSheetDate.split('-')[0]-1).toLocaleString('default', { month: 'long' })}`}
                    </h1>
                    <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-[0.2em] mt-1">
                        {view === 'weekly' ? 'Revenue & Expenditure' : 'Aggregate Performance View'}
                    </p>
                </div>
                <button onClick={() => changeWeek(1)} className="p-3 hover:bg-slate-100 rounded-full transition-colors text-slate-400"><ChevronRight size={24}/></button>
            </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto">
        {view === 'weekly' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
                    <h3 className="font-black text-[10px] uppercase text-slate-400 mb-8 flex items-center gap-2 tracking-[0.2em]">
                        <TrendingUp size={16} className="text-emerald-500"/> Revenue Stream
                    </h3>
                    <div className="space-y-4">
                        {REVENUE_CATEGORIES.map(cat => (
                        <div key={cat} className="flex items-center justify-between group">
                            <span className="text-[11px] font-black text-slate-400 uppercase tracking-tight group-hover:text-indigo-600 transition-colors">{cat}</span>
                            <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 font-bold text-xs">$</span>
                                <input 
                                    type="number"
                                    placeholder="0.00"
                                    disabled={isLocked}
                                    value={revenueData[cat] || ''}
                                    onChange={(e) => updateRevenue(cat, e.target.value)}
                                    className="w-36 bg-slate-50 border border-slate-100 rounded-2xl px-6 py-3 text-right font-black text-slate-800 outline-none focus:ring-2 ring-indigo-500/10 disabled:opacity-50"
                                />
                            </div>
                        </div>
                        ))}
                        <div className="pt-6 mt-6 border-t border-slate-100 flex justify-between items-center">
                            <span className="text-xs font-black uppercase text-slate-400 tracking-widest">Total Inbound</span>
                            <span className="text-2xl font-black text-emerald-600">${currentWeekTotals.rev.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
                        <h3 className="font-black text-[10px] uppercase text-slate-400 mb-6 flex items-center gap-2 tracking-[0.2em]">
                            <Plus size={16} className="text-indigo-500"/> Log Expenditure
                        </h3>
                        <form onSubmit={addExpense} className="space-y-4">
                            <select 
                                disabled={isLocked}
                                value={newExpense.category}
                                onChange={(e) => setNewExpense({...newExpense, category: e.target.value})}
                                className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm font-bold text-slate-700 outline-none focus:ring-2 ring-indigo-500/10"
                            >
                                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <div className="flex gap-3">
                                <input 
                                    type="number"
                                    step="0.01"
                                    disabled={isLocked}
                                    placeholder="0.00"
                                    value={newExpense.amount}
                                    onChange={(e) => setNewExpense({...newExpense, amount: e.target.value})}
                                    className="flex-1 bg-slate-50 border border-slate-100 rounded-2xl px-6 py-4 text-xl font-black text-slate-800 outline-none focus:ring-2 ring-indigo-500/10"
                                />
                                <button type="submit" disabled={isLocked} className="bg-slate-900 text-white w-16 rounded-2xl font-bold hover:bg-indigo-600 transition-all disabled:opacity-50 flex items-center justify-center shadow-lg active:scale-95">
                                    <Plus size={24} />
                                </button>
                            </div>
                        </form>
                    </div>

                    <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200 flex flex-col">
                        <h3 className="font-black text-[10px] uppercase text-slate-400 mb-6 flex items-center gap-2 tracking-[0.2em]">
                            <Wallet size={16} className="text-rose-500"/> Expenditure Activity
                        </h3>
                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                            {expenses.length === 0 && <p className="text-center py-10 text-slate-300 text-[10px] font-black uppercase tracking-widest">No activity found</p>}
                            {expenses.map((exp) => (
                            <div key={exp.id} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100 group hover:border-rose-100 transition-all">
                                <div>
                                    <p className="text-[10px] font-black uppercase text-slate-800">{exp.category}</p>
                                    <p className="text-[8px] font-bold text-slate-400">{new Date(exp.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                                </div>
                                <div className="flex items-center gap-4">
                                    <span className="text-sm font-black text-rose-500">-${parseFloat(exp.amount).toFixed(2)}</span>
                                    {!isLocked && <button onClick={() => deleteExpense(exp.id)} className="text-slate-300 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100"><Trash2 size={16}/></button>}
                                </div>
                            </div>
                            ))}
                        </div>
                        <div className="pt-6 mt-6 border-t border-slate-100 flex justify-between items-center">
                            <span className="text-xs font-black uppercase text-slate-400 tracking-widest">Total Outbound</span>
                            <span className="text-2xl font-black text-rose-600">-${currentWeekTotals.exp.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                        </div>
                    </div>
                </div>
            </div>
        ) : (
            <div className="bg-white p-8 rounded-3xl shadow-sm border border-slate-200">
                <div className="flex justify-between items-center mb-8">
                    <h3 className="font-black text-[10px] uppercase text-slate-400 flex items-center gap-2 tracking-[0.2em]">
                        <Calendar size={16} className="text-indigo-500"/> Monthly Totals Aggregation
                    </h3>
                    {monthlyStats.loading && <div className="animate-spin rounded-full h-4 w-4 border-2 border-indigo-600 border-t-transparent"></div>}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-12">
                    <div className="space-y-6">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b pb-2">Income Category Totals</p>
                        {REVENUE_CATEGORIES.map(cat => (
                            <div key={cat} className="flex justify-between items-center py-1">
                                <span className="text-[11px] font-black text-slate-500 uppercase">{cat}</span>
                                <span className="font-black text-slate-800">${(monthlyStats.income[cat] || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            </div>
                        ))}
                    </div>

                    <div className="flex flex-col justify-center items-center bg-slate-50 rounded-3xl p-10 border border-slate-100">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-4">Cumulative Month Income</p>
                        <p className="text-6xl font-black text-slate-900 tracking-tighter mb-4">${monthlyStats.totalIn.toLocaleString()}</p>
                        <div className="w-full h-2 bg-slate-200 rounded-full overflow-hidden">
                            <div className="h-full bg-emerald-500 w-full animate-pulse"></div>
                        </div>
                        <p className="mt-6 text-[10px] text-slate-400 max-w-[200px] text-center font-medium leading-relaxed uppercase">
                            Aggregated from all entries detected within this calendar month.
                        </p>
                    </div>
                </div>
            </div>
        )}
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 10px; }
      `}</style>
    </div>
  );
}
