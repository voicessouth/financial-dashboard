import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  collection, 
  onSnapshot, 
  addDoc,
  deleteDoc,
  query
} from 'firebase/firestore';
import { 
  LayoutDashboard, 
  Plus, 
  ChevronLeft, 
  ChevronRight, 
  Database, 
  Trash2,
  Lock,
  TrendingUp,
  Wallet,
  CalendarDays
} from 'lucide-react';

// --- INITIALIZATION ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'voices-south-portal';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Set initial anchor to January 2, 2026
  const [activeDate, setActiveDate] = useState(() => {
    const anchor = new Date(2026, 0, 2); // Jan 2, 2026
    const today = new Date();
    
    // If today is past the anchor, find the closest Friday (7-day interval)
    if (today > anchor) {
      const diffTime = Math.abs(today - anchor);
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      const weeksElapsed = Math.floor(diffDays / 7);
      const currentWeekDate = new Date(anchor);
      currentWeekDate.setDate(anchor.getDate() + (weeksElapsed * 7));
      return currentWeekDate;
    }
    return anchor;
  });

  const [isFinalized, setIsFinalized] = useState(false);
  
  // Financial State
  const [income, setIncome] = useState({
    cash: 0, credit: 0, text: 0, givelify: 0, 
    tithely: 0, cashapp: 0, zelle: 0, website: 0
  });
  const [expenses, setExpenses] = useState([]);
  const [newExpense, setNewExpense] = useState({ category: 'Lady Val Payroll', amount: '' });

  const categories = [
    'Lady Val Payroll', 'MORTGAGE - KIRKLAND GROUP', 'UTILITIES', 
    'MAINTENANCE', 'SUPPLIES', 'MINISTRY', 'TRAVEL', 'OTHER'
  ];

  // --- AUTHENTICATION ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth failed:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // --- DATE LOGIC ---
  const dateKey = useMemo(() => {
    const d = new Date(activeDate);
    return `${d.getMonth() + 1}-${d.getDate()}-${d.getFullYear()}`;
  }, [activeDate]);

  const changeWeek = (direction) => {
    const newDate = new Date(activeDate);
    newDate.setDate(activeDate.getDate() + (direction * 7));
    setActiveDate(newDate);
  };

  // --- DATA SYNC ---
  const getDocPath = (key) => doc(db, 'artifacts', appId, 'public', 'data', 'finance_reports', key);
  const getExpColPath = (key) => collection(db, 'artifacts', appId, 'public', 'data', 'finance_reports', key, 'expenses');

  useEffect(() => {
    if (!user) return;

    const unsubDoc = onSnapshot(getDocPath(dateKey), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setIncome(data.income || {
          cash: 0, credit: 0, text: 0, givelify: 0, 
          tithely: 0, cashapp: 0, zelle: 0, website: 0
        });
        setIsFinalized(data.status === 'finalized');
      } else {
        setIncome({ cash: 0, credit: 0, text: 0, givelify: 0, tithely: 0, cashapp: 0, zelle: 0, website: 0 });
        setIsFinalized(false);
      }
    }, (err) => console.error("Snapshot Error:", err));

    const unsubExp = onSnapshot(getExpColPath(dateKey), (snap) => {
      const exps = [];
      snap.forEach(d => exps.push({ id: d.id, ...d.data() }));
      setExpenses(exps.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
    });

    return () => {
      unsubDoc();
      unsubExp();
    };
  }, [user, dateKey]);

  // --- ACTIONS ---
  const handleIncomeChange = async (key, val) => {
    if (isFinalized) return;
    const numericVal = parseFloat(val) || 0;
    const newIncome = { ...income, [key]: numericVal };
    setIncome(newIncome);
    
    try {
      await setDoc(getDocPath(dateKey), {
        income: newIncome,
        lastUpdated: new Date().toISOString()
      }, { merge: true });
    } catch (e) { console.error("Save error:", e); }
  };

  const addExpense = async () => {
    if (!newExpense.amount || isFinalized) return;
    const entry = {
      category: newExpense.category,
      amount: parseFloat(newExpense.amount),
      timestamp: new Date().toISOString()
    };
    
    try {
      await addDoc(getExpColPath(dateKey), entry);
      setNewExpense({ ...newExpense, amount: '' });
    } catch (e) { console.error("Add expense error:", e); }
  };

  const deleteExpense = async (id) => {
    if (isFinalized) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'finance_reports', dateKey, 'expenses', id));
    } catch (e) { console.error("Delete error:", e); }
  };

  const toggleFinalize = async () => {
    const newStatus = isFinalized ? 'draft' : 'finalized';
    if (newStatus === 'finalized' && !window.confirm("Lock this week's records? You won't be able to edit them without unlocking.")) return;
    
    try {
      await setDoc(getDocPath(dateKey), { status: newStatus }, { merge: true });
    } catch (e) { console.error("Status update error:", e); }
  };

  const totalIncome = useMemo(() => Object.values(income).reduce((a, b) => a + (Number(b) || 0), 0), [income]);
  const totalExpenses = useMemo(() => expenses.reduce((a, b) => a + (Number(b.amount) || 0), 0), [expenses]);
  const netSum = totalIncome - totalExpenses;

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <Database className="w-10 h-10 text-indigo-500 animate-pulse mb-4" />
        <h2 className="text-slate-800 font-black text-xl tracking-tighter uppercase">Securing Connection</h2>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 pb-40">
      <header className="bg-white px-6 py-5 flex justify-between items-center sticky top-0 z-20 shadow-sm border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-100">
            <LayoutDashboard className="text-white w-5 h-5" />
          </div>
          <div>
            <h1 className="font-black text-lg uppercase tracking-tighter leading-none">Voices South</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Treasury Portal</p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-full border border-emerald-100">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          <span className="text-[10px] font-black text-emerald-600 uppercase">Live</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
        {/* Date Selector */}
        <section className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-200 text-center relative overflow-hidden">
          <div className="relative z-10 flex items-center justify-center gap-8">
            <button onClick={() => changeWeek(-1)} className="p-3 bg-slate-50 rounded-full hover:bg-slate-100 transition-colors">
              <ChevronLeft className="w-6 h-6 text-slate-400"/>
            </button>
            <div>
              <div className="flex items-center justify-center gap-2 text-indigo-600 mb-1">
                <CalendarDays className="w-3 h-3" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">Reporting Period</span>
              </div>
              <p className="text-4xl font-black text-slate-800 tracking-tighter">{dateKey}</p>
            </div>
            <button onClick={() => changeWeek(1)} className="p-3 bg-slate-50 rounded-full hover:bg-slate-100 transition-colors">
              <ChevronRight className="w-6 h-6 text-slate-400"/>
            </button>
          </div>
        </section>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Income Column */}
          <section className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-200">
            <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-8 flex items-center gap-3">
               <TrendingUp className="w-4 h-4 text-emerald-500" /> Weekly Income
            </h2>
            <div className="space-y-6">
              {Object.keys(income).map((key) => (
                <div key={key} className="group flex items-center justify-between border-b border-slate-50 pb-2">
                  <span className="text-[11px] font-bold uppercase text-slate-500 group-hover:text-indigo-600 transition-colors">{key}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-300 font-bold">$</span>
                    <input
                      type="number"
                      disabled={isFinalized}
                      value={income[key] || ''}
                      onChange={(e) => handleIncomeChange(key, e.target.value)}
                      className="w-28 text-right font-black text-xl text-slate-800 focus:outline-none bg-transparent disabled:opacity-50"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-10 pt-6 border-t border-dashed border-slate-200 flex justify-between items-end">
                <p className="text-[10px] font-black text-slate-400 uppercase">Gross Revenue</p>
                <p className="text-2xl font-black text-emerald-600">${totalIncome.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
            </div>
          </section>

          {/* Expenses Column */}
          <div className="space-y-6">
            <section className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-200">
              <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-8 flex items-center gap-3">
                 <Plus className="w-4 h-4 text-rose-500" /> Record Expense
              </h2>
              <div className="space-y-4">
                <select 
                  disabled={isFinalized}
                  value={newExpense.category}
                  onChange={(e) => setNewExpense({...newExpense, category: e.target.value})}
                  className="w-full bg-slate-50 p-4 rounded-2xl font-bold text-sm outline-none border border-slate-100 focus:ring-2 ring-indigo-500/10 appearance-none disabled:opacity-50"
                >
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 font-bold">$</span>
                    <input
                      type="number"
                      disabled={isFinalized}
                      value={newExpense.amount}
                      onChange={(e) => setNewExpense({...newExpense, amount: e.target.value})}
                      placeholder="0.00"
                      className="w-full bg-slate-50 pl-10 pr-4 py-4 rounded-2xl font-black text-lg outline-none border border-slate-100 focus:ring-2 ring-indigo-500/10 disabled:opacity-50"
                    />
                  </div>
                  <button 
                    onClick={addExpense} 
                    disabled={isFinalized}
                    className="bg-slate-900 text-white p-4 rounded-2xl px-8 hover:bg-black transition-all active:scale-95 disabled:bg-slate-200"
                  >
                    <Plus className="w-6 h-6" />
                  </button>
                </div>
              </div>
            </section>

            <section className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-200">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400">Activity Log</h3>
                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md">{expenses.length} Entries</span>
              </div>
              <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                {expenses.length === 0 ? (
                  <div className="text-center py-12">
                    <Wallet className="w-8 h-8 text-slate-100 mx-auto mb-2" />
                    <p className="text-slate-300 text-[10px] font-bold uppercase tracking-widest">No expenses recorded</p>
                  </div>
                ) : (
                  expenses.map(exp => (
                    <div key={exp.id} className="group flex items-center justify-between p-4 bg-slate-50 rounded-2xl hover:bg-white border border-transparent hover:border-slate-100 transition-all">
                      <div className="flex-1">
                        <p className="text-[10px] font-black text-slate-800 leading-none uppercase tracking-tight">{exp.category}</p>
                        <p className="text-[8px] text-slate-400 font-bold mt-1.5 uppercase">
                          {new Date(exp.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <p className="font-black text-rose-600 text-sm">-${Number(exp.amount).toFixed(2)}</p>
                        {!isFinalized && (
                          <button onClick={() => deleteExpense(exp.id)} className="text-slate-200 hover:text-rose-500 transition-colors">
                             <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-6 pt-4 border-t border-slate-100 flex justify-between items-center">
                <span className="text-[10px] font-black text-slate-400 uppercase">Total Expenses</span>
                <span className="text-lg font-black text-rose-600">-${totalExpenses.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* Floating Summary & Action */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[95%] max-w-xl z-30">
        <div className="bg-white rounded-[3rem] p-4 shadow-[0_20px_50px_rgba(0,0,0,0.15)] border border-slate-100 flex flex-col sm:flex-row items-center gap-4">
          <div className="flex-1 bg-slate-900 rounded-[2.5rem] p-6 text-white flex items-center justify-between w-full">
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Weekly Net Flow</p>
              <p className={`text-3xl font-black ${netSum >= 0 ? 'text-emerald-400' : 'text-rose-400'} tracking-tighter`}>
                ${netSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="text-right hidden sm:block">
              <p className="text-[9px] font-bold text-slate-500 uppercase">In: ${totalIncome.toLocaleString()}</p>
              <p className="text-[9px] font-bold text-slate-500 uppercase">Out: ${totalExpenses.toLocaleString()}</p>
            </div>
          </div>
          
          <button 
            onClick={toggleFinalize}
            className={`w-full sm:w-auto px-8 py-6 rounded-[2.5rem] font-black text-[11px] uppercase tracking-widest transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2 whitespace-nowrap ${
              isFinalized 
              ? 'bg-rose-50 text-rose-600 border border-rose-100 hover:bg-rose-100' 
              : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200'
            }`}
          >
            {isFinalized ? (
              <><Lock className="w-4 h-4" /> Unlock Week</>
            ) : (
              'Finalize Week'
            )}
          </button>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 10px; }
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
        body { font-family: 'Inter', sans-serif; }
      `}</style>
    </div>
  );
}
