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
  Loader2,
  RefreshCw
} from 'lucide-react';

/**
 * FIREBASE INITIALIZATION
 * Uses environment-injected globals. 
 * Do NOT manually paste config here.
 */
const getFirebaseConfig = () => {
  try {
    return JSON.parse(__firebase_config);
  } catch (e) {
    console.error("Firebase Config missing or invalid");
    return null;
  }
};

const config = getFirebaseConfig();
const app = (config && getApps().length === 0) ? initializeApp(config) : getApps()[0];
const auth = app ? getAuth(app) : null;
const db = app ? getFirestore(app) : null;
const appId = typeof __app_id !== 'undefined' ? __app_id : 'voices-south-portal';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [authStage, setAuthStage] = useState("Checking System Configuration...");
  
  // App State
  const [activeDate, setActiveDate] = useState(() => new Date(2026, 0, 2));
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

  // --- COMPREHENSIVE AUTHENTICATION BOOTSTRAP ---
  useEffect(() => {
    if (!auth) {
      setError("Firebase Configuration not found. Please refresh the page.");
      return;
    }

    let isMounted = true;

    const initConnection = async () => {
      try {
        setAuthStage("Establishing Security Handshake...");
        
        // Priority 1: Custom Token from Environment
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          setAuthStage("Authenticating with Custom Token...");
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          // Priority 2: Anonymous Fallback
          setAuthStage("Starting Secure Guest Session...");
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth Error:", err);
        if (isMounted) setError(`Authentication Failed: ${err.message}`);
      }
    };

    // Listen for Auth Changes
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (isMounted) {
        if (u) {
          setAuthStage("Access Granted. Syncing Ledger...");
          setUser(u);
          // Small delay to ensure Firestore is ready
          setTimeout(() => setLoading(false), 500);
        } else {
          initConnection();
        }
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, []);

  // --- DATA SYNC ---
  const dateKey = useMemo(() => {
    const d = new Date(activeDate);
    return `${d.getMonth() + 1}-${d.getDate()}-${d.getFullYear()}`;
  }, [activeDate]);

  useEffect(() => {
    if (!user || !db) return;

    // RULE 1: Strict Paths
    const reportPath = ['artifacts', appId, 'public', 'data', 'finance_reports', dateKey];
    const docRef = doc(db, ...reportPath);
    const expColRef = collection(db, ...reportPath, 'expenses');

    const unsubDoc = onSnapshot(docRef, (docSnap) => {
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
    }, (err) => {
      console.error("Firestore Doc Error:", err);
      // Don't show full screen error for background sync fails
    });

    const unsubExp = onSnapshot(expColRef, (snap) => {
      const items = [];
      snap.forEach(d => items.push({ id: d.id, ...d.data() }));
      setExpenses(items.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
    }, (err) => console.error("Firestore Exp Error:", err));

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
    setIncome(newIncome);
    
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'finance_reports', dateKey), {
        income: newIncome,
        lastUpdated: new Date().toISOString()
      }, { merge: true });
    } catch (e) { console.error("Update failed:", e); }
  };

  const addExpense = async () => {
    if (!newExpense.amount || isFinalized || !user) return;
    try {
      const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'finance_reports', dateKey, 'expenses');
      await addDoc(colRef, {
        category: newExpense.category,
        amount: parseFloat(newExpense.amount),
        timestamp: new Date().toISOString()
      });
      setNewExpense({ ...newExpense, amount: '' });
    } catch (e) { console.error("Add failed:", e); }
  };

  const deleteExpense = async (id) => {
    if (isFinalized || !user) return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'finance_reports', dateKey, 'expenses', id));
    } catch (e) { console.error("Delete failed:", e); }
  };

  const toggleFinalize = async () => {
    if (!user) return;
    try {
      await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'finance_reports', dateKey), { 
        status: isFinalized ? 'draft' : 'finalized' 
      }, { merge: true });
    } catch (e) { console.error("Status toggle failed:", e); }
  };

  const changeWeek = (direction) => {
    const newDate = new Date(activeDate);
    newDate.setDate(activeDate.getDate() + (direction * 7));
    setActiveDate(newDate);
  };

  const totalIncome = useMemo(() => Object.values(income).reduce((a, b) => a + (Number(b) || 0), 0), [income]);
  const totalExpenses = useMemo(() => expenses.reduce((a, b) => a + (Number(b.amount) || 0), 0), [expenses]);
  const netSum = totalIncome - totalExpenses;

  // --- RENDER STATES ---
  if (loading || error) {
    return (
      <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-8 text-center">
        <div className="relative mb-10">
          <div className="absolute inset-0 bg-blue-500/20 blur-[100px] animate-pulse"></div>
          {error ? (
            <AlertCircle className="w-20 h-20 text-rose-500 relative z-10" />
          ) : (
            <Database className="w-20 h-20 text-blue-500 animate-bounce relative z-10" />
          )}
        </div>
        
        <h2 className="text-white text-3xl font-black tracking-tighter uppercase mb-4">
          {error ? "System Blocked" : "Portal Initializing"}
        </h2>
        
        <div className="max-w-md bg-white/5 border border-white/10 p-6 rounded-[2rem] backdrop-blur-md">
          <p className={`text-sm font-bold tracking-widest uppercase mb-4 ${error ? 'text-rose-400' : 'text-blue-400'}`}>
            {error ? "Security Exception Detected" : "Current Status"}
          </p>
          <p className="text-slate-400 text-xs font-medium leading-relaxed mb-6">
            {error || authStage}
          </p>
          
          {error && (
            <button 
              onClick={() => window.location.reload()} 
              className="flex items-center gap-2 mx-auto bg-white text-black px-6 py-3 rounded-full font-black text-[10px] uppercase tracking-widest hover:bg-blue-500 hover:text-white transition-all"
            >
              <RefreshCw className="w-3 h-3" /> Force Reboot
            </button>
          )}
        </div>

        {!error && (
          <div className="mt-8 flex gap-2">
            {[1, 2, 3].map(i => (
              <div key={i} className="w-1.5 h-1.5 rounded-full bg-blue-500/40 animate-ping" style={{animationDelay: `${i * 0.2}s`}}></div>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 pb-40">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md px-6 py-5 flex justify-between items-center sticky top-0 z-40 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2.5 rounded-2xl shadow-xl shadow-blue-200">
            <LayoutDashboard className="text-white w-5 h-5" />
          </div>
          <div>
            <h1 className="font-black text-xl uppercase tracking-tighter leading-none">Voices South</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1.5">Treasury Operations</p>
          </div>
        </div>
        <div className="flex items-center gap-2.5 px-4 py-2 bg-emerald-50 rounded-full border border-emerald-100 shadow-sm shadow-emerald-50">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          <span className="text-[10px] font-black text-emerald-600 uppercase tracking-widest">Live Sync</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-4 md:p-10 space-y-8">
        {/* Date Context */}
        <section className="bg-white rounded-[3rem] p-10 shadow-sm border border-slate-200 text-center relative overflow-hidden">
          <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
            <CalendarDays className="w-32 h-32" />
          </div>
          <div className="relative z-10 flex items-center justify-between max-w-sm mx-auto">
            <button onClick={() => changeWeek(-1)} className="p-4 bg-slate-50 rounded-full hover:bg-white hover:shadow-xl transition-all active:scale-90 border border-transparent hover:border-slate-100">
              <ChevronLeft className="w-6 h-6 text-slate-400"/>
            </button>
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-black text-blue-600 uppercase tracking-[0.3em] mb-2 bg-blue-50 px-3 py-1 rounded-full">Reporting Cycle</span>
              <p className="text-4xl font-black text-slate-800 tracking-tighter">{dateKey}</p>
            </div>
            <button onClick={() => changeWeek(1)} className="p-4 bg-slate-50 rounded-full hover:bg-white hover:shadow-xl transition-all active:scale-90 border border-transparent hover:border-slate-100">
              <ChevronRight className="w-6 h-6 text-slate-400"/>
            </button>
          </div>
        </section>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Revenue Inputs */}
          <section className="bg-white rounded-[3rem] p-10 shadow-sm border border-slate-200">
            <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 mb-10 flex items-center gap-4">
               <TrendingUp className="w-4 h-4 text-emerald-500" /> Revenue Streams
            </h2>
            <div className="space-y-6">
              {Object.keys(income).map((key) => (
                <div key={key} className="group flex items-center justify-between border-b border-slate-50 pb-4 transition-all focus-within:border-blue-200">
                  <span className="text-[11px] font-bold uppercase text-slate-400 group-focus-within:text-blue-600 transition-colors">{key}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-200 font-black text-lg">$</span>
                    <input
                      type="number"
                      disabled={isFinalized}
                      value={income[key] || ''}
                      onChange={(e) => handleIncomeChange(key, e.target.value)}
                      className="w-28 text-right font-black text-2xl text-slate-800 focus:outline-none bg-transparent disabled:opacity-30"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-12 pt-8 border-t-2 border-dashed border-slate-100 flex justify-between items-center">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Deposits</p>
                <p className="text-4xl font-black text-emerald-600 tracking-tighter">${totalIncome.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
            </div>
          </section>

          {/* Expense Management */}
          <div className="space-y-8">
            <section className="bg-white rounded-[3rem] p-10 shadow-sm border border-slate-200">
              <h2 className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400 mb-8 flex items-center gap-4">
                 <Plus className="w-4 h-4 text-rose-500" /> New Transaction
              </h2>
              <div className="space-y-5">
                <select 
                  disabled={isFinalized}
                  value={newExpense.category}
                  onChange={(e) => setNewExpense({...newExpense, category: e.target.value})}
                  className="w-full bg-slate-50 p-5 rounded-3xl font-bold text-sm outline-none border-2 border-transparent focus:border-blue-500/10 focus:bg-white transition-all appearance-none disabled:opacity-50 cursor-pointer"
                >
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <div className="flex gap-4">
                  <div className="relative flex-1">
                    <span className="absolute left-6 top-1/2 -translate-y-1/2 text-slate-300 font-black">$</span>
                    <input
                      type="number"
                      disabled={isFinalized}
                      value={newExpense.amount}
                      onChange={(e) => setNewExpense({...newExpense, amount: e.target.value})}
                      placeholder="0.00"
                      className="w-full bg-slate-50 pl-12 pr-6 py-5 rounded-3xl font-black text-xl outline-none border-2 border-transparent focus:border-blue-500/10 focus:bg-white transition-all disabled:opacity-50"
                    />
                  </div>
                  <button 
                    onClick={addExpense} 
                    disabled={isFinalized || !newExpense.amount}
                    className="bg-slate-900 text-white p-5 rounded-3xl px-10 hover:bg-blue-600 hover:shadow-xl hover:shadow-blue-200 transition-all active:scale-95 disabled:bg-slate-100 disabled:text-slate-300 disabled:shadow-none"
                  >
                    <Plus className="w-6 h-6" />
                  </button>
                </div>
              </div>
            </section>

            <section className="bg-white rounded-[3rem] p-10 shadow-sm border border-slate-200">
              <div className="flex justify-between items-center mb-8">
                <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400">Activity Ledger</h3>
                <span className="text-[10px] font-black text-blue-600 bg-blue-50 px-4 py-1.5 rounded-full uppercase">{expenses.length} Items</span>
              </div>
              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {expenses.length === 0 ? (
                  <div className="text-center py-16 opacity-20">
                    <Wallet className="w-12 h-12 mx-auto mb-4" />
                    <p className="text-[10px] font-black uppercase tracking-[0.3em]">No Debits Recorded</p>
                  </div>
                ) : (
                  expenses.map(exp => (
                    <div key={exp.id} className="group flex items-center justify-between p-5 bg-slate-50 rounded-3xl border-2 border-transparent hover:border-slate-100 hover:bg-white transition-all duration-300">
                      <div className="flex-1">
                        <p className="text-[11px] font-black text-slate-800 leading-none uppercase mb-2">{exp.category}</p>
                        <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">
                          {new Date(exp.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit', second: '2-digit'})}
                        </p>
                      </div>
                      <div className="flex items-center gap-6">
                        <p className="font-black text-rose-500 text-lg">-${Number(exp.amount).toFixed(2)}</p>
                        {!isFinalized && (
                          <button onClick={() => deleteExpense(exp.id)} className="text-slate-200 hover:text-rose-500 transition-colors p-2 hover:bg-rose-50 rounded-xl">
                             <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
              <div className="mt-8 pt-8 border-t border-slate-100 flex justify-between items-center">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Debits</span>
                <span className="text-3xl font-black text-rose-500 tracking-tighter">-${totalExpenses.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
              </div>
            </section>
          </div>
        </div>
      </main>

      {/* Persistence Bar */}
      <div className="fixed bottom-10 left-1/2 -translate-x-1/2 w-[90%] max-w-2xl z-50">
        <div className="bg-white/70 backdrop-blur-2xl rounded-[3.5rem] p-5 shadow-[0_40px_80px_-20px_rgba(0,0,0,0.25)] border border-white/40 flex flex-col sm:flex-row items-center gap-5">
          <div className={`flex-1 rounded-[3rem] p-7 text-white flex items-center justify-between w-full transition-all duration-700 shadow-inner ${netSum >= 0 ? 'bg-slate-900 shadow-slate-800/50' : 'bg-rose-950 shadow-rose-900/50'}`}>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em] mb-2">Weekly Net Projection</p>
              <p className={`text-4xl font-black tracking-tighter ${netSum >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                ${netSum.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
          
          <button 
            onClick={toggleFinalize}
            className={`w-full sm:w-auto px-12 py-8 rounded-[3rem] font-black text-[11px] uppercase tracking-[0.3em] transition-all shadow-2xl active:scale-95 flex items-center justify-center gap-3 whitespace-nowrap ${
              isFinalized 
              ? 'bg-rose-100 text-rose-600 border border-rose-200 hover:bg-rose-200' 
              : 'bg-blue-600 text-white hover:bg-blue-700 shadow-blue-200'
            }`}
          >
            {isFinalized ? (
              <><Lock className="w-5 h-5" /> Unlock Period</>
            ) : (
              'Finalize Ledger'
            )}
          </button>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 5px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 10px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
        body { font-family: 'Inter', sans-serif; overflow-x: hidden; }
      `}</style>
    </div>
  );
}
