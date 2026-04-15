import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp, getApps } from 'firebase/app';
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
  deleteDoc
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
  CalendarDays,
  AlertCircle,
  Loader2
} from 'lucide-react';

// --- FIREBASE INITIALIZATION ---
// Safe initialization to prevent multiple instances
const firebaseConfig = JSON.parse(__firebase_config);
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'voices-south-portal';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [statusMessage, setStatusMessage] = useState("Establishing Secure Connection...");
  const [error, setError] = useState(null);
  
  // Reporting Date: Anchored to Jan 2, 2026 as requested
  const [activeDate, setActiveDate] = useState(() => new Date(2026, 0, 2));

  // Dashboard State
  const [isFinalized, setIsFinalized] = useState(false);
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

  // --- RESILIENT AUTHENTICATION FLOW ---
  useEffect(() => {
    let mounted = true;

    const startAuth = async () => {
      try {
        setStatusMessage("Authenticating with Vault...");
        
        // Use custom token if provided, otherwise anonymous
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth Error:", err);
        if (mounted) setError("Failed to connect to the security server. Please refresh.");
      }
    };

    // Listen for auth state changes
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (mounted) {
        if (u) {
          setUser(u);
          setLoading(false);
          setError(null);
        } else {
          // If no user, trigger auth
          startAuth();
        }
      }
    });

    // Cleanup
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  // --- DATA FETCHING ---
  const dateKey = useMemo(() => {
    const d = new Date(activeDate);
    return `${d.getMonth() + 1}-${d.getDate()}-${d.getFullYear()}`;
  }, [activeDate]);

  useEffect(() => {
    if (!user) return;

    // Path setup based on Rule 1
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'finance_reports', dateKey);
    const expColRef = collection(db, 'artifacts', appId, 'public', 'data', 'finance_reports', dateKey, 'expenses');

    // Subscribe to Report Document
    const unsubDoc = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setIncome(data.income || {
          cash: 0, credit: 0, text: 0, givelify: 0, 
          tithely: 0, cashapp: 0, zelle: 0, website: 0
        });
        setIsFinalized(data.status === 'finalized');
      } else {
        // Reset for new date
        setIncome({ cash: 0, credit: 0, text: 0, givelify: 0, tithely: 0, cashapp: 0, zelle: 0, website: 0 });
        setIsFinalized(false);
      }
    }, (err) => {
      console.error("Firestore Error:", err);
      setError("Sync interrupted. Retrying...");
    });

    // Subscribe to Expenses
    const unsubExp = onSnapshot(expColRef, (snap) => {
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
    if (isFinalized || !user) return;
    const numericVal = parseFloat(val) || 0;
    const newIncome = { ...income, [key]: numericVal };
    setIncome(newIncome); // Optimistic update
    
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'finance_reports', dateKey);
      await setDoc(docRef, {
        income: newIncome,
        lastUpdated: new Date().toISOString()
      }, { merge: true });
    } catch (e) { console.error("Save error:", e); }
  };

  const addExpense = async () => {
    if (!newExpense.amount || isFinalized || !user) return;
    const entry = {
      category: newExpense.category,
      amount: parseFloat(newExpense.amount),
      timestamp: new Date().toISOString()
    };
    
    try {
      const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'finance_reports', dateKey, 'expenses');
      await addDoc(colRef, entry);
      setNewExpense({ ...newExpense, amount: '' });
    } catch (e) { console.error("Add expense error:", e); }
  };

  const deleteExpense = async (id) => {
    if (isFinalized || !user) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'finance_reports', dateKey, 'expenses', id));
    } catch (e) { console.error("Delete error:", e); }
  };

  const toggleFinalize = async () => {
    if (!user) return;
    try {
      const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'finance_reports', dateKey);
      await setDoc(docRef, { 
        status: isFinalized ? 'draft' : 'finalized' 
      }, { merge: true });
    } catch (e) { console.error("Status update error:", e); }
  };

  const changeWeek = (direction) => {
    const newDate = new Date(activeDate);
    newDate.setDate(activeDate.getDate() + (direction * 7));
    setActiveDate(newDate);
  };

  // --- CALCULATIONS ---
  const totalIncome = useMemo(() => Object.values(income).reduce((a, b) => a + (Number(b) || 0), 0), [income]);
  const totalExpenses = useMemo(() => expenses.reduce((a, b) => a + (Number(b.amount) || 0), 0), [expenses]);
  const netSum = totalIncome - totalExpenses;

  // --- LOADING / ERROR STATES ---
  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F172A] flex flex-col items-center justify-center p-6 text-center">
        <div className="relative mb-8">
          <div className="absolute inset-0 bg-indigo-500/20 blur-3xl rounded-full"></div>
          <Database className="w-16 h-16 text-indigo-400 animate-pulse relative z-10" />
        </div>
        <h2 className="text-white font-black text-2xl tracking-tighter uppercase mb-3">Initializing Portal</h2>
        <div className="flex items-center gap-2 justify-center text-indigo-300/60 font-bold text-[10px] uppercase tracking-[0.3em]">
          <Loader2 className="w-3 h-3 animate-spin" />
          {error ? <span className="text-rose-400">{error}</span> : <span>{statusMessage}</span>}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 pb-40 font-sans">
      <header className="bg-white/80 backdrop-blur-md px-6 py-5 flex justify-between items-center sticky top-0 z-20 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-xl shadow-lg shadow-indigo-200">
            <LayoutDashboard className="text-white w-5 h-5" />
          </div>
          <div>
            <h1 className="font-black text-lg uppercase tracking-tighter leading-none">Voices South</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Finance Dashboard</p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 rounded-full border border-emerald-100">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          <span className="text-[10px] font-black text-emerald-600 uppercase">System Active</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 md:p-8 space-y-6">
        {/* Date Selector */}
        <section className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-200 text-center relative overflow-hidden group">
          <div className="absolute inset-0 bg-indigo-50 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none"></div>
          <div className="relative z-10 flex items-center justify-center gap-8">
            <button onClick={() => changeWeek(-1)} className="p-4 bg-slate-50 rounded-full hover:bg-white hover:shadow-md transition-all active:scale-90">
              <ChevronLeft className="w-6 h-6 text-slate-400"/>
            </button>
            <div className="min-w-[240px]">
              <div className="flex items-center justify-center gap-2 text-indigo-600 mb-1">
                <CalendarDays className="w-3 h-3" />
                <span className="text-[10px] font-black uppercase tracking-[0.2em]">Current Period</span>
              </div>
              <p className="text-4xl font-black text-slate-800 tracking-tighter">{dateKey}</p>
            </div>
            <button onClick={() => changeWeek(1)} className="p-4 bg-slate-50 rounded-full hover:bg-white hover:shadow-md transition-all active:scale-90">
              <ChevronRight className="w-6 h-6 text-slate-400"/>
            </button>
          </div>
        </section>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Income Column */}
          <section className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-200">
            <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-8 flex items-center gap-3">
               <TrendingUp className="w-4 h-4 text-emerald-500" /> Revenue Stream
            </h2>
            <div className="space-y-5">
              {Object.keys(income).map((key) => (
                <div key={key} className="group flex items-center justify-between border-b border-slate-100 pb-3">
                  <span className="text-[11px] font-bold uppercase text-slate-400 group-focus-within:text-indigo-600 transition-colors">{key}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-300 font-bold text-sm">$</span>
                    <input
                      type="number"
                      disabled={isFinalized}
                      value={income[key] || ''}
                      onChange={(e) => handleIncomeChange(key, e.target.value)}
                      className="w-28 text-right font-black text-xl text-slate-800 focus:outline-none bg-transparent disabled:opacity-40"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-10 pt-6 border-t border-dashed border-slate-200 flex justify-between items-end">
                <p className="text-[10px] font-black text-slate-400 uppercase">Gross Total</p>
                <p className="text-3xl font-black text-emerald-600 tracking-tighter">${totalIncome.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
            </div>
          </section>

          {/* Expense Column */}
          <div className="space-y-6">
            <section className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-200">
              <h2 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-8 flex items-center gap-3">
                 <Plus className="w-4 h-4 text-rose-500" /> Quick Add Expense
              </h2>
              <div className="space-y-4">
                <div className="relative">
                  <select 
                    disabled={isFinalized}
                    value={newExpense.category}
                    onChange={(e) => setNewExpense({...newExpense, category: e.target.value})}
                    className="w-full bg-slate-50 p-4 rounded-2xl font-bold text-sm outline-none border border-slate-100 focus:ring-4 ring-indigo-500/5 appearance-none disabled:opacity-50"
                  >
                    {categories.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 font-bold">$</span>
                    <input
                      type="number"
                      disabled={isFinalized}
                      value={newExpense.amount}
                      onChange={(e) => setNewExpense({...newExpense, amount: e.target.value})}
                      placeholder="0.00"
                      className="w-full bg-slate-50 pl-10 pr-4 py-4 rounded-2xl font-black text-lg outline-none border border-slate-100 focus:ring-4 ring-indigo-500/5 disabled:opacity-50"
                    />
                  </div>
                  <button 
                    onClick={addExpense} 
                    disabled={isFinalized || !newExpense.amount}
                    className="bg-slate-900 text-white p-4 rounded-2xl px-8 hover:bg-indigo-600 transition-all active:scale-95 disabled:bg-slate-100 disabled:text-slate-300"
                  >
                    <Plus className="w-6 h-6" />
                  </button>
                </div>
              </div>
            </section>

            <section className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-slate-200">
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400">Expense Journal</h3>
                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-3 py-1 rounded-full uppercase tracking-tighter">{expenses.length} Records</span>
              </div>
              <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2 custom-scrollbar">
                {expenses.length === 0 ? (
                  <div className="text-center py-12 border-2 border-dashed border-slate-50 rounded-3xl">
                    <Wallet className="w-8 h-8 text-slate-100 mx-auto mb-2" />
                    <p className="text-slate-300 text-[10px] font-bold uppercase tracking-widest">Awaiting data</p>
                  </div>
                ) : (
                  expenses.map(exp => (
                    <div key={exp.id} className="group flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-transparent hover:border-slate-100 hover:bg-white transition-all">
                      <div className="flex-1">
                        <p className="text-[10px] font-black text-slate-800 leading-none uppercase tracking-tight">{exp.category}</p>
                        <p className="text-[8px] text-slate-400 font-bold mt-1.5 uppercase">
                          {new Date(exp.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        <p className="font-black text-rose-500 text-sm">-${Number(exp.amount).toFixed(2)}</p>
                        {!isFinalized && (
                          <button onClick={() => deleteExpense(exp.id)} className="text-slate-200 hover:text-rose-500 transition-colors p-1">
                             <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-6 pt-5 border-t border-slate-100 flex justify-between items-center">
                <span className="text-[10px] font-black text-slate-400 uppercase">Debit Sum</span>
                <span className="text-2xl font-black text-rose-500 tracking-tighter">-${totalExpenses.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* Floating Bottom Bar */}
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[95%] max-w-xl z-30">
        <div className="bg-white/90 backdrop-blur-xl rounded-[3rem] p-4 shadow-[0_32px_64px_rgba(0,0,0,0.15)] border border-white/50 flex flex-col sm:flex-row items-center gap-4">
          <div className={`flex-1 rounded-[2.5rem] p-6 text-white flex items-center justify-between w-full transition-colors duration-500 ${netSum >= 0 ? 'bg-slate-900' : 'bg-rose-950'}`}>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Net Liquidity</p>
              <p className={`text-3xl font-black tracking-tighter ${netSum >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                ${netSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            {netSum < 0 && <AlertCircle className="w-6 h-6 text-rose-500 animate-bounce" />}
          </div>
          
          <button 
            onClick={toggleFinalize}
            className={`w-full sm:w-auto px-8 py-6 rounded-[2.5rem] font-black text-[11px] uppercase tracking-widest transition-all shadow-xl active:scale-95 flex items-center justify-center gap-2 whitespace-nowrap ${
              isFinalized 
              ? 'bg-rose-100 text-rose-600 border border-rose-200 hover:bg-rose-200' 
              : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-indigo-200 hover:shadow-indigo-300'
            }`}
          >
            {isFinalized ? (
              <><Lock className="w-4 h-4" /> Unlock Report</>
            ) : (
              'Finalize Report'
            )}
          </button>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 10px; }
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
        body { font-family: 'Inter', sans-serif; }
      `}</style>
    </div>
  );
}
