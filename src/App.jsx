import React, { useState, useEffect, useMemo, useRef } from 'react';
import { initializeApp, getApps, deleteApp } from 'firebase/app';
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
  // --- Initialization State ---
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [statusMsg, setStatusMsg] = useState("Initializing System...");
  
  // --- App Logic State ---
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

  // --- Step 1: Bootstrap Firebase Safely ---
  useEffect(() => {
    const bootstrap = async () => {
      try {
        setStatusMsg("Detecting environment...");
        
        // 1. Check for config
        if (typeof __firebase_config === 'undefined') {
          throw new Error("Environment variable '__firebase_config' is missing. Ensure you are running this in the correct portal.");
        }

        const config = JSON.parse(__firebase_config);
        
        // 2. Clear existing apps to prevent "Duplicate App" errors
        if (getApps().length > 0) {
          await Promise.all(getApps().map(app => deleteApp(app)));
        }

        // 3. Initialize
        setStatusMsg("Connecting to Treasury Cloud...");
        const app = initializeApp(config);
        const _auth = getAuth(app);
        const _db = getFirestore(app);
        
        setAuth(_auth);
        setDb(_db);

        // 4. Handle Authentication
        setStatusMsg("Authenticating session...");
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(_auth, __initial_auth_token);
        } else {
          await signInAnonymously(_auth);
        }

        // 5. Setup Auth Listener
        const unsubscribe = onAuthStateChanged(_auth, (u) => {
          if (u) {
            setUser(u);
            setStatusMsg("Syncing Ledger...");
            setLoading(false);
          }
        });

        return unsubscribe;
      } catch (err) {
        console.error("Bootstrap Error:", err);
        setError(err.message);
        setLoading(false);
      }
    };

    bootstrap();
  }, []);

  // --- Step 2: Sync Data ---
  const dateKey = useMemo(() => {
    const d = new Date(activeDate);
    return `${d.getMonth() + 1}-${d.getDate()}-${d.getFullYear()}`;
  }, [activeDate]);

  const appId = typeof __app_id !== 'undefined' ? __app_id : 'voices-south-portal';

  useEffect(() => {
    if (!user || !db) return;

    // RULE 1 Paths
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
    }, (err) => console.error("Snapshot Error:", err));

    const unsubExp = onSnapshot(expCol, (snap) => {
      const items = [];
      snap.forEach(d => items.push({ id: d.id, ...d.data() }));
      setExpenses(items.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
    }, (err) => console.error("Exp Snapshot Error:", err));

    return () => {
      unsubDoc();
      unsubExp();
    };
  }, [user, db, dateKey, appId]);

  // --- Actions ---
  const handleIncomeChange = async (key, val) => {
    if (isFinalized || !user || !db) return;
    const newIncome = { ...income, [key]: parseFloat(val) || 0 };
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

  // --- UI Layouts ---
  if (loading || error) {
    return (
      <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-6">
        <div className="w-full max-w-md bg-white/5 border border-white/10 p-10 rounded-[3rem] backdrop-blur-xl text-center">
          {error ? (
            <>
              <AlertCircle className="w-16 h-16 text-rose-500 mx-auto mb-6" />
              <h2 className="text-white text-2xl font-black uppercase mb-2">Startup Failed</h2>
              <p className="text-slate-400 text-xs font-mono bg-black/40 p-4 rounded-2xl mb-6">{error}</p>
              <button onClick={() => window.location.reload()} className="w-full bg-white text-black py-4 rounded-full font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4" /> Retry Connection
              </button>
            </>
          ) : (
            <>
              <div className="relative w-20 h-20 mx-auto mb-8">
                <Database className="w-full h-full text-blue-500 animate-pulse" />
                <div className="absolute inset-0 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin"></div>
              </div>
              <p className="text-white font-black text-xs uppercase tracking-[0.3em]">{statusMsg}</p>
              <div className="mt-8 flex justify-center gap-1">
                {[1,2,3].map(i => <div key={i} className="w-1 h-1 rounded-full bg-blue-500 animate-bounce" style={{animationDelay: `${i*0.1}s`}}></div>)}
              </div>
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-44">
      <header className="bg-white border-b border-slate-200 px-6 py-5 sticky top-0 z-50 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <div className="bg-slate-900 p-2.5 rounded-2xl shadow-lg">
            <ShieldCheck className="text-emerald-400 w-6 h-6" />
          </div>
          <div>
            <h1 className="font-black text-xl uppercase tracking-tighter">Treasury Portal</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Voices South Main Campus</p>
          </div>
        </div>
        <div className="hidden sm:flex items-center gap-2 bg-slate-50 px-4 py-2 rounded-full border border-slate-100">
          <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
          <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Secure Node Connected</span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-8 mt-4">
        {/* Date Selector */}
        <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200 flex items-center justify-between">
          <button onClick={() => {
            const d = new Date(activeDate);
            d.setDate(d.getDate() - 7);
            setActiveDate(d);
          }} className="p-4 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-all active:scale-95 text-slate-400">
            <ChevronLeft />
          </button>
          <div className="text-center">
            <span className="text-[10px] font-black text-blue-600 uppercase tracking-widest mb-1 block">Selected Cycle</span>
            <h2 className="text-3xl font-black text-slate-800 tracking-tighter">{dateKey}</h2>
          </div>
          <button onClick={() => {
            const d = new Date(activeDate);
            d.setDate(d.getDate() + 7);
            setActiveDate(d);
          }} className="p-4 rounded-2xl bg-slate-50 hover:bg-slate-100 transition-all active:scale-95 text-slate-400">
            <ChevronRight />
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Revenue Section */}
          <div className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-200">
            <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-8 flex items-center gap-3">
              <TrendingUp className="w-4 h-4 text-emerald-500" /> Revenue Stream
            </h3>
            <div className="space-y-5">
              {Object.keys(income).map(key => (
                <div key={key} className="flex items-center justify-between border-b border-slate-50 pb-4">
                  <span className="text-[10px] font-bold uppercase text-slate-400">{key}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-slate-300 font-black">$</span>
                    <input 
                      type="number"
                      disabled={isFinalized}
                      value={income[key] || ''}
                      onChange={(e) => handleIncomeChange(key, e.target.value)}
                      placeholder="0.00"
                      className="w-24 text-right font-black text-xl text-slate-800 bg-transparent outline-none focus:text-blue-600 disabled:opacity-30"
                    />
                  </div>
                </div>
              ))}
              <div className="pt-8 flex justify-between items-center border-t-2 border-dashed border-slate-100">
                <span className="text-[10px] font-black uppercase text-slate-400">Gross Total</span>
                <span className="text-3xl font-black text-emerald-600 tracking-tighter">${totalIncome.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Expenses Section */}
          <div className="space-y-8">
            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-6">Debit Entry</h3>
              <div className="flex gap-3">
                <select 
                  value={newExpense.category}
                  onChange={e => setNewExpense({...newExpense, category: e.target.value})}
                  className="flex-1 bg-slate-50 p-4 rounded-2xl font-bold text-sm outline-none border border-slate-100"
                >
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <input 
                  type="number"
                  value={newExpense.amount}
                  onChange={e => setNewExpense({...newExpense, amount: e.target.value})}
                  placeholder="0.00"
                  className="w-28 bg-slate-50 p-4 rounded-2xl font-black text-lg outline-none border border-slate-100"
                />
                <button 
                  onClick={addExpense}
                  disabled={!newExpense.amount || isFinalized}
                  className="bg-slate-900 text-white p-4 rounded-2xl px-6 hover:bg-blue-600 transition-all active:scale-90 disabled:opacity-20"
                >
                  <Plus />
                </button>
              </div>
            </div>

            <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200">
              <h3 className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-6">Activity Log</h3>
              <div className="space-y-3 max-h-64 overflow-y-auto pr-2 custom-scrollbar">
                {expenses.map(exp => (
                  <div key={exp.id} className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl">
                    <div>
                      <p className="text-[10px] font-black uppercase text-slate-800">{exp.category}</p>
                      <p className="text-[8px] font-bold text-slate-400 uppercase">{new Date(exp.timestamp).toLocaleTimeString()}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-black text-rose-500">-${exp.amount.toFixed(2)}</span>
                      {!isFinalized && (
                        <button onClick={async () => {
                          await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'finance_reports', dateKey, 'expenses', exp.id));
                        }} className="text-slate-200 hover:text-rose-500"><Trash2 className="w-4 h-4" /></button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="pt-6 mt-6 border-t border-slate-100 flex justify-between items-center">
                <span className="text-[10px] font-black uppercase text-slate-400">Total Debits</span>
                <span className="text-2xl font-black text-rose-500">-${totalExpenses.toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      </main>

      <div className="fixed bottom-10 left-1/2 -translate-x-1/2 w-[90%] max-w-xl">
        <div className="bg-slate-900 rounded-[3rem] p-4 flex items-center gap-4 shadow-2xl shadow-blue-900/40 border border-slate-800">
          <div className="flex-1 px-8">
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Net Flow</p>
            <p className={`text-3xl font-black tracking-tighter ${totalIncome - totalExpenses >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
              ${(totalIncome - totalExpenses).toFixed(2)}
            </p>
          </div>
          <button 
            onClick={async () => {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'finance_reports', dateKey), { 
                status: isFinalized ? 'draft' : 'finalized' 
              }, { merge: true });
            }}
            className={`px-10 py-6 rounded-[2.5rem] font-black text-[10px] uppercase tracking-widest transition-all ${isFinalized ? 'bg-rose-500 text-white' : 'bg-blue-600 text-white hover:bg-blue-500'}`}
          >
            {isFinalized ? 'Unlock Period' : 'Finalize Weekly'}
          </button>
        </div>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 10px; }
        body { font-family: 'Inter', sans-serif; }
      `}</style>
    </div>
  );
}
