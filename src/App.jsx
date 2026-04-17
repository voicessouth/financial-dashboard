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
  ShieldCheck,
  AlertCircle
} from 'lucide-react';

// --- CONFIGURATION RECOVERY ---
const getSafeConfig = () => {
  try {
    if (typeof __firebase_config !== 'undefined') return JSON.parse(__firebase_config);
  } catch (e) {
    console.error("Config Parse Error", e);
  }
  return null;
};

export default function App() {
  // Initialization & Auth
  const [db, setDb] = useState(null);
  const [user, setUser] = useState(null);
  const [initStage, setInitStage] = useState('Booting...');
  const [isDemo, setIsDemo] = useState(false);

  // App Data
  const [activeDate, setActiveDate] = useState(() => new Date(2026, 0, 2));
  const [isFinalized, setIsFinalized] = useState(false);
  const [income, setIncome] = useState({
    cash: 0, credit: 0, text: 0, givelify: 0, 
    tithely: 0, cashapp: 0, zelle: 0, website: 0
  });
  const [expenses, setExpenses] = useState([]);
  const [newExpense, setNewExpense] = useState({ category: 'Lady Val Payroll', amount: '' });

  const categories = ['Lady Val Payroll', 'MORTGAGE', 'UTILITIES', 'MAINTENANCE', 'SUPPLIES', 'MINISTRY', 'TRAVEL', 'OTHER'];
  const appId = typeof __app_id !== 'undefined' ? __app_id : 'voices-south-portal';
  
  const dateKey = useMemo(() => {
    const d = new Date(activeDate);
    return `${d.getMonth() + 1}-${d.getDate()}-${d.getFullYear()}`;
  }, [activeDate]);

  // --- CORE ENGINE ---
  useEffect(() => {
    const startApp = async () => {
      setInitStage('Validating System...');
      const config = getSafeConfig();
      
      if (!config) {
        setInitStage('Running in Demo Mode');
        setIsDemo(true);
        return;
      }

      try {
        const app = !getApps().length ? initializeApp(config) : getApps()[0];
        const auth = getAuth(app);
        const firestore = getFirestore(app);
        
        setDb(firestore);
        setInitStage('Establishing Secure Link...');

        // Auth Sequence
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }

        onAuthStateChanged(auth, (u) => {
          if (u) {
            setUser(u);
            setInitStage('Ready');
          }
        });
      } catch (err) {
        console.error("Critical Startup Error:", err);
        setInitStage(`Error: ${err.message}`);
        setIsDemo(true); // Fallback to local state if DB fails
      }
    };

    startApp();
  }, []);

  // --- DATA SYNC ---
  useEffect(() => {
    if (!db || !user || isDemo) return;

    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'finance_reports', dateKey);
    const expCol = collection(db, 'artifacts', appId, 'public', 'data', 'finance_reports', dateKey, 'expenses');

    const unsubDoc = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setIncome(data.income || income);
        setIsFinalized(data.status === 'finalized');
      }
    }, (e) => console.error("Sync Error", e));

    const unsubExp = onSnapshot(expCol, (snap) => {
      const items = [];
      snap.forEach(d => items.push({ id: d.id, ...d.data() }));
      setExpenses(items.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)));
    });

    return () => { unsubDoc(); unsubExp(); };
  }, [db, user, dateKey, isDemo]);

  // UI HELPERS
  const totalIncome = Object.values(income).reduce((a, b) => a + (Number(b) || 0), 0);
  const totalExpenses = expenses.reduce((a, b) => a + (Number(b.amount) || 0), 0);

  // If we are still booting and not in demo mode
  if (initStage !== 'Ready' && !isDemo && !initStage.includes('Error')) {
    return (
      <div className="min-h-screen bg-[#020617] flex flex-col items-center justify-center p-12 text-center">
        <Database className="w-12 h-12 text-blue-500 animate-pulse mb-6" />
        <h2 className="text-white font-black uppercase tracking-[0.3em] text-[10px] mb-2">{initStage}</h2>
        <div className="w-48 h-1 bg-white/10 rounded-full overflow-hidden">
          <div className="h-full bg-blue-500 animate-[loading_2s_ease-in-out_infinite]"></div>
        </div>
        <style>{`@keyframes loading { 0% { width: 0%; } 50% { width: 100%; } 100% { width: 0%; } }`}</style>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] font-sans text-slate-900 pb-40">
      {/* Top Banner */}
      <nav className="bg-white/80 backdrop-blur-md border-b border-slate-200 px-6 py-4 sticky top-0 z-50 flex justify-between items-center">
        <div className="flex items-center gap-3">
          <div className="bg-slate-900 p-2 rounded-xl shadow-lg">
            <ShieldCheck className="text-emerald-400 w-5 h-5" />
          </div>
          <div>
            <h1 className="font-black text-lg uppercase tracking-tight leading-none">Voices South Portal</h1>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Treasury Management</p>
          </div>
        </div>
        {isDemo && (
          <div className="bg-amber-50 text-amber-700 px-3 py-1.5 rounded-full border border-amber-200 flex items-center gap-2">
            <AlertCircle className="w-3 h-3" />
            <span className="text-[9px] font-black uppercase tracking-widest">Local Mode</span>
          </div>
        )}
      </nav>

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Date Selector */}
        <div className="bg-white p-6 rounded-[2rem] shadow-sm border border-slate-200 flex items-center justify-between">
          <button onClick={() => { const d = new Date(activeDate); d.setDate(d.getDate() - 7); setActiveDate(d); }} className="p-3 bg-slate-50 rounded-xl text-slate-400 hover:text-slate-900 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <div className="text-center">
            <span className="text-[9px] font-black text-blue-600 uppercase tracking-widest block mb-1">Accounting Cycle</span>
            <h2 className="text-2xl font-black text-slate-800 tracking-tighter">{dateKey}</h2>
          </div>
          <button onClick={() => { const d = new Date(activeDate); d.setDate(d.getDate() + 7); setActiveDate(d); }} className="p-3 bg-slate-50 rounded-xl text-slate-400 hover:text-slate-900 transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Left: Income */}
          <section className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 flex items-center gap-2 mb-8">
              <TrendingUp className="w-4 h-4 text-emerald-500" /> Revenue Inflow
            </h3>
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
                      onChange={async (e) => {
                        const val = parseFloat(e.target.value) || 0;
                        const next = {...income, [key]: val};
                        setIncome(next);
                        if(db && user && !isDemo) {
                          await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'finance_reports', dateKey), { income: next }, { merge: true });
                        }
                      }}
                      className="w-24 text-right font-black text-lg text-slate-800 bg-transparent outline-none focus:text-blue-600"
                      placeholder="0.00"
                    />
                  </div>
                </div>
              ))}
              <div className="pt-6 mt-4 flex justify-between items-center border-t-2 border-dashed border-slate-100">
                <span className="text-[10px] font-black uppercase text-slate-400">Total</span>
                <span className="text-3xl font-black text-emerald-600 tracking-tighter">${totalIncome.toLocaleString()}</span>
              </div>
            </div>
          </section>

          {/* Right: Expenses */}
          <section className="space-y-6">
            <div className="bg-slate-900 p-6 rounded-[2rem] text-white">
              <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-4">New Disbursement</p>
              <div className="space-y-3">
                <select 
                  value={newExpense.category}
                  onChange={e => setNewExpense({...newExpense, category: e.target.value})}
                  className="w-full bg-white/10 p-4 rounded-xl font-bold text-xs uppercase outline-none border border-white/5"
                >
                  {categories.map(c => <option key={c} value={c} className="bg-slate-900">{c}</option>)}
                </select>
                <div className="flex gap-2">
                  <input 
                    type="number"
                    value={newExpense.amount}
                    onChange={e => setNewExpense({...newExpense, amount: e.target.value})}
                    placeholder="0.00"
                    className="flex-1 bg-white/10 p-4 rounded-xl font-black text-lg outline-none"
                  />
                  <button 
                    onClick={async () => {
                      const item = { category: newExpense.category, amount: parseFloat(newExpense.amount), timestamp: new Date().toISOString() };
                      if(db && user && !isDemo) {
                        await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'finance_reports', dateKey, 'expenses'), item);
                      } else {
                        setExpenses([ {...item, id: Math.random().toString()}, ...expenses]);
                      }
                      setNewExpense({...newExpense, amount: ''});
                    }}
                    className="bg-blue-600 px-6 rounded-xl hover:bg-blue-500 transition-colors"
                  >
                    <Plus />
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-[2rem] border border-slate-200 min-h-[300px]">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Activity</h3>
              <div className="space-y-2">
                {expenses.map(exp => (
                  <div key={exp.id} className="flex justify-between items-center bg-slate-50 p-3 rounded-xl">
                    <div>
                      <p className="text-[10px] font-black uppercase leading-none">{exp.category}</p>
                      <p className="text-[8px] font-bold text-slate-400 uppercase mt-1">{new Date(exp.timestamp).toLocaleTimeString()}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-black text-rose-500">-${exp.amount.toFixed(2)}</span>
                      {!isFinalized && (
                        <button onClick={async () => {
                          if(db && user && !isDemo) await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'finance_reports', dateKey, 'expenses', exp.id));
                          else setExpenses(expenses.filter(e => e.id !== exp.id));
                        }} className="text-slate-300 hover:text-rose-500 transition-colors"><Trash2 className="w-3.5 h-3.5" /></button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </div>
      </main>

      <footer className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-md bg-white rounded-[2.5rem] p-4 shadow-2xl border border-slate-200 flex items-center justify-between z-[100]">
        <div className="px-4">
          <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Net Position</p>
          <p className={`text-2xl font-black tracking-tighter ${totalIncome - totalExpenses >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
            ${(totalIncome - totalExpenses).toLocaleString()}
          </p>
        </div>
        <button 
          onClick={async () => {
            if(db && user && !isDemo) {
              await setDoc(doc(db, 'artifacts', appId, 'public', 'data', 'finance_reports', dateKey), { status: isFinalized ? 'draft' : 'finalized' }, { merge: true });
            } else {
              setIsFinalized(!isFinalized);
            }
          }}
          className={`px-8 py-4 rounded-full font-black text-[10px] uppercase tracking-widest text-white shadow-lg transition-all active:scale-95 ${isFinalized ? 'bg-rose-500 shadow-rose-200' : 'bg-slate-900 shadow-slate-200'}`}
        >
          {isFinalized ? 'Unlock Audit' : 'Finalize Ledger'}
        </button>
      </footer>
    </div>
  );
}
