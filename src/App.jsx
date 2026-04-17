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
  RefreshCw,
  ShieldCheck
} from 'lucide-react';

export default function App() {
  // Initialization State
  const [db, setDb] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [status, setStatus] = useState("System Boot...");

  // Ledger State
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

  const dateKey = useMemo(() => {
    const d = new Date(activeDate);
    return `${d.getMonth() + 1}-${d.getDate()}-${d.getFullYear()}`;
  }, [activeDate]);

  const appId = typeof __app_id !== 'undefined' ? __app_id : 'voices-south-portal';

  // --- SAFE INITIALIZATION EFFECT ---
  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      try {
        setStatus("Checking Environment...");
        if (typeof __firebase_config === 'undefined') {
          throw new Error("Configuration not found. Please check your environment variables.");
        }

        const config = JSON.parse(__firebase_config);
        
        // Singleton Initialization
        let app;
        if (!getApps().length) {
          app = initializeApp(config);
        } else {
          app = getApps()[0];
        }

        const _auth = getAuth(app);
        const _db = getFirestore(app);

        if (isMounted) {
          setDb(_db);
          setStatus("Authenticating Secure Node...");
        }

        // Auth
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(_auth, __initial_auth_token);
        } else {
          await signInAnonymously(_auth);
        }

        onAuthStateChanged(_auth, (u) => {
          if (u && isMounted) {
            setUser(u);
            setLoading(false);
          }
        });

      } catch (err) {
        console.error("Init Error:", err);
        if (isMounted) {
          setError(err.message);
          setLoading(false);
        }
      }
    };

    init();
    
    // Safety Timeout: If nothing happens in 5s, try to show the app anyway
    const timer = setTimeout(() => {
      if (loading && isMounted) {
        setLoading(false);
        setStatus("Manual Override Active");
      }
    }, 5000);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, []);

  // --- DATA SYNC EFFECT ---
  useEffect(() => {
    if (!user || !db) return;

    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'finance_reports', dateKey);
    const expCol = collection(db, 'artifacts', appId, 'public', 'data', 'finance_reports', dateKey, 'expenses');

    const unsubDoc = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setIncome(data.income || { cash: 0, credit: 0, text: 0, givelify: 0, tithely: 0, cashapp: 0, zelle: 0, website: 0 });
        setIsFinalized(data.status === 'finalized');
      } else {
        setIncome({ cash: 0, credit: 0, text: 0, givelify: 0, tithely: 0, cashapp: 0, zelle: 0, website: 0 });
        setIsFinalized(false);
      }
    }, (e) => console.log("Report error:", e));

    const unsubExp = onSnapshot(expCol, (snap) => {
      const items = [];
      snap.forEach(d => items.push({ id: d.id, ...d.data() }));
      setExpenses(items.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
    }, (e) => console.log("Expense error:", e));

    return () => {
      unsubDoc();
      unsubExp();
    };
  }, [user, db, dateKey, appId]);

  // Actions
  const handleIncomeChange = async (key, val) => {
    if (isFinalized || !user || !db) return;
    const valNum = parseFloat(val) || 0;
    const newIncome = { ...income, [key]: valNum };
    setIncome(newIncome);
    await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'finance_reports', dateKey), {
      income: newIncome,
      lastUpdated: new Date().toISOString()
    }, { merge: true });
  };

  const addExpense = async () => {
    if (!newExpense.amount || isFinalized || !user || !db) return;
    const colRef = collection(db, 'artifacts', appId, 'public', 'data', 'finance_reports', dateKey, 'expenses');
    await addDoc(colRef, {
      category: newExpense.category,
      amount: parseFloat(newExpense.amount),
      timestamp: new Date().toISOString()
    });
    setNewExpense({ ...newExpense, amount: '' });
  };

  const totalIncome = Object.values(income).reduce((a, b) => a + (Number(b) || 0), 0);
  const totalExpenses = expenses.reduce((a, b) => a + (Number(b.amount) || 0), 0);

  if (loading && !error) {
    return (
      <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-6 text-center">
        <div className="relative w-24 h-24 mb-8">
          <Database className="w-full h-full text-blue-500 animate-pulse" />
          <div className="absolute inset-0 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
        </div>
        <h2 className="text-white font-black uppercase tracking-[0.4em] text-xs mb-2">{status}</h2>
        <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Voices South Treasury v2.1</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-8">
        <div className="max-w-md w-full bg-white/5 border border-white/10 p-10 rounded-[3rem] backdrop-blur-md text-center">
          <AlertCircle className="w-16 h-16 text-rose-500 mx-auto mb-6" />
          <h2 className="text-white text-2xl font-black uppercase mb-4 tracking-tighter">Connection Failed</h2>
          <div className="bg-black/50 p-4 rounded-2xl text-rose-300 font-mono text-xs mb-8 text-left overflow-auto max-h-32">
            {error}
          </div>
          <button onClick={() => window.location.reload()} className="w-full bg-white text-black py-4 rounded-full font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 active:scale-95 transition-all">
            <RefreshCw className="w-4 h-4" /> Restart Portal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-44 font-sans text-slate-900">
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-4 sticky top-0 z-50 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="bg-slate-900 p-2.5 rounded-2xl shadow-xl">
            <ShieldCheck className="text-emerald-400 w-6 h-6" />
          </div>
          <div>
            <h1 className="font-black text-xl uppercase tracking-tighter leading-none">Treasury Portal</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Voices South Main Campus</p>
          </div>
        </div>
        <div className="hidden md:flex items-center gap-2 bg-emerald-50 px-4 py-2 rounded-full border border-emerald-100">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          <span className="text-[9px] font-black uppercase tracking-widest text-emerald-700">Encrypted Cloud Sync</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-6 mt-4">
        {/* Cycle Control */}
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-200 flex items-center justify-between">
          <button onClick={() => {
            const d = new Date(activeDate);
            d.setDate(d.getDate() - 7);
            setActiveDate(d);
          }} className="p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-all text-slate-400 active:scale-90">
            <ChevronLeft />
          </button>
          <div className="text-center">
            <span className="text-[9px] font-black text-blue-600 uppercase tracking-[0.2em] mb-1 block">Accounting Cycle</span>
            <h2 className="text-2xl font-black text-slate-800 tracking-tighter">{dateKey}</h2>
          </div>
          <button onClick={() => {
            const d = new Date(activeDate);
            d.setDate(d.getDate() + 7);
            setActiveDate(d);
          }} className="p-3 rounded-xl bg-slate-50 hover:bg-slate-100 transition-all text-slate-400 active:scale-90">
            <ChevronRight />
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Revenue Stream */}
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200">
            <div className="flex items-center justify-between mb-8">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-500" /> Revenue Stream
              </h3>
              {isFinalized && <Lock className="w-4 h-4 text-slate-300" />}
            </div>
            
            <div className="space-y-4">
              {Object.keys(income).map(key => (
                <div key={key} className="flex items-center justify-between border-b border-slate-50 pb-3">
                  <span className="text-[10px] font-bold uppercase text-slate-500">{key}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-300 font-black text-sm">$</span>
                    <input 
                      type="number"
                      disabled={isFinalized}
                      value={income[key] || ''}
                      onChange={(e) => handleIncomeChange(key, e.target.value)}
                      placeholder="0.00"
                      className="w-24 text-right font-black text-lg text-slate-800 bg-transparent outline-none focus:text-blue-600 disabled:opacity-30"
                    />
                  </div>
                </div>
              ))}
              <div className="pt-6 mt-4 flex justify-between items-center border-t-2 border-dashed border-slate-100">
                <span className="text-[10px] font-black uppercase text-slate-400">Total Income</span>
                <span className="text-3xl font-black text-emerald-600 tracking-tighter">${totalIncome.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
              </div>
            </div>
          </div>

          {/* Expenses & Ledger */}
          <div className="space-y-6">
            <div className="bg-slate-900 p-6 rounded-[2.5rem] shadow-xl text-white">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-6">Debit Entry</h3>
              <div className="flex flex-col gap-3">
                <select 
                  value={newExpense.category}
                  disabled={isFinalized}
                  onChange={e => setNewExpense({...newExpense, category: e.target.value})}
                  className="bg-white/10 p-4 rounded-2xl font-bold text-xs uppercase tracking-widest outline-none border border-white/5 focus:border-blue-500 transition-colors"
                >
                  {categories.map(c => <option key={c} value={c} className="bg-slate-900">{c}</option>)}
                </select>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-white/30 font-black">$</span>
                    <input 
                      type="number"
                      disabled={isFinalized}
                      value={newExpense.amount}
                      onChange={e => setNewExpense({...newExpense, amount: e.target.value})}
                      placeholder="0.00"
                      className="w-full bg-white/10 p-4 pl-8 rounded-2xl font-black text-xl outline-none border border-white/5 focus:border-blue-500 disabled:opacity-20"
                    />
                  </div>
                  <button 
                    onClick={addExpense}
                    disabled={!newExpense.amount || isFinalized}
                    className="bg-blue-600 text-white p-4 rounded-2xl px-6 hover:bg-blue-500 transition-all active:scale-90 disabled:opacity-20 shadow-lg shadow-blue-900/40"
                  >
                    <Plus />
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-200">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-6">Activity Log</h3>
              <div className="space-y-3 max-h-60 overflow-y-auto pr-2 custom-scrollbar">
                {expenses.length === 0 && (
                  <div className="py-10 text-center border-2 border-dashed border-slate-50 rounded-2xl">
                    <p className="text-[10px] font-black uppercase text-slate-300">No Transactions Found</p>
                  </div>
                )}
                {expenses.map(exp => (
                  <div key={exp.id} className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-100/50">
                    <div>
                      <p className="text-[10px] font-black uppercase text-slate-800">{exp.category}</p>
                      <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">
                        {new Date(exp.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-black text-rose-500 text-sm">-${exp.amount.toFixed(2)}</span>
                      {!isFinalized && (
                        <button onClick={async () => {
                          await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'finance_reports', dateKey, 'expenses', exp.id));
                        }} className="text-slate-300 hover:text-rose-500 transition-colors p-1"><Trash2 className="w-3.5 h-3.5" /></button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="pt-6 mt-4 border-t border-slate-100 flex justify-between items-center">
                <span className="text-[10px] font-black uppercase text-slate-400">Total Expenses</span>
                <span className="text-2xl font-black text-rose-500 tracking-tighter">-${totalExpenses.toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Floating Action Bar */}
      <div className="fixed bottom-10 left-1/2 -translate-x-1/2 w-[95%] max-w-lg z-[100]">
        <div className="bg-white rounded-[2.5rem] p-3 flex items-center gap-4 shadow-2xl border border-slate-200">
          <div className="flex-1 px-6">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Net Position</p>
            <p className={`text-2xl font-black tracking-tighter ${totalIncome - totalExpenses >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
              ${(totalIncome - totalExpenses).toLocaleString(undefined, {minimumFractionDigits: 2})}
            </p>
          </div>
          <button 
            onClick={async () => {
              if (!db || !user) return;
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'finance_reports', dateKey), { 
                status: isFinalized ? 'draft' : 'finalized' 
              }, { merge: true });
            }}
            className={`px-8 py-5 rounded-[2rem] font-black text-[10px] uppercase tracking-widest transition-all shadow-lg ${isFinalized ? 'bg-rose-500 text-white shadow-rose-200' : 'bg-slate-900 text-white hover:bg-blue-600'}`}
          >
            {isFinalized ? 'Unlock Audit' : 'Finalize Ledger'}
          </button>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 3px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 10px; }
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap');
        body { font-family: 'Inter', sans-serif; }
      `}</style>
    </div>
  );
}
