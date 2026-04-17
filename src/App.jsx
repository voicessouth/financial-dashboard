import React, { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  ChevronRight, 
  PieChart, 
  Activity,
  AlertCircle,
  Database,
  CloudOff,
  RefreshCw,
  Wallet
} from 'lucide-react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  onSnapshot,
} from 'firebase/firestore';

/**
 * REVISED CONFIGURATION ACCESS
 * Using a safer retrieval method to avoid "import.meta" compatibility issues
 * in environments configured for ES2015.
 */
const getSafeEnv = (key) => {
  if (typeof window !== 'undefined' && window.process && window.process.env) {
    return window.process.env[key] || "";
  }
  // Standard fallback for common build tool patterns
  try {
    return process.env[key] || "";
  } catch (e) {
    return "";
  }
};

const firebaseConfig = {
  apiKey: getSafeEnv('VITE_FIREBASE_API_KEY'),
  authDomain: getSafeEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: getSafeEnv('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: getSafeEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: getSafeEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: getSafeEnv('VITE_FIREBASE_APP_ID')
};

// Global service placeholders
let auth = null;
let db = null;

// Initialization check - ensuring values are actually strings and not empty
const hasValidConfig = typeof firebaseConfig.apiKey === 'string' && firebaseConfig.apiKey.length > 10;

if (hasValidConfig) {
  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (e) {
    console.warn("Firebase failed to initialize:", e);
  }
}

export default function App() {
  const [user, setUser] = useState(null);
  const [transactions, setTransactions] = useState([
    { id: '1', type: 'Income', category: 'Tithes', amount: 5200, date: new Date().toISOString(), description: 'Sunday Service' },
    { id: '2', type: 'Expense', category: 'Utilities', amount: 450, date: new Date().toISOString(), description: 'Electric Bill' },
    { id: '3', type: 'Income', category: 'Donation', amount: 1200, date: new Date().toISOString(), description: 'Youth Program' },
    { id: '4', type: 'Expense', category: 'Maintenance', amount: 800, date: new Date().toISOString(), description: 'Roof Repair' },
  ]);
  const [isDemo, setIsDemo] = useState(!hasValidConfig);
  const [isLoading, setIsLoading] = useState(true);

  // FAIL-SAFE: Ensure dashboard shows even if background tasks hang
  useEffect(() => {
    const forceLoad = setTimeout(() => {
      setIsLoading(false);
    }, 1200); 
    return () => clearTimeout(forceLoad);
  }, []);

  // Firebase Auth and Data Logic
  useEffect(() => {
    if (!hasValidConfig || !auth || !db) {
      setIsLoading(false);
      return;
    }

    let unsubData = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUser(u);
        setIsDemo(false);
        try {
          unsubData = onSnapshot(
            collection(db, 'transactions'), 
            (snap) => {
              if (!snap.empty) {
                const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                setTransactions(data);
              }
              setIsLoading(false);
            },
            (err) => {
              console.error("Firestore access error:", err);
              setIsDemo(true);
              setIsLoading(false);
            }
          );
        } catch (e) {
          setIsDemo(true);
          setIsLoading(false);
        }
      } else {
        signInAnonymously(auth).catch(() => {
          setIsDemo(true);
          setIsLoading(false);
        });
      }
    });

    return () => {
      unsubscribeAuth();
      if (unsubData) unsubData();
    };
  }, []);

  const stats = useMemo(() => {
    const income = transactions.filter(t => t.type === 'Income').reduce((s, t) => s + Number(t.amount), 0);
    const expenses = transactions.filter(t => t.type === 'Expense').reduce((s, t) => s + Number(t.amount), 0);
    return { income, expenses, balance: income - expenses };
  }, [transactions]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="relative">
          <div className="w-10 h-10 border-[3px] border-slate-200 border-t-blue-600 rounded-full animate-spin"></div>
        </div>
        <div className="mt-6">
          <p className="text-[10px] font-black text-slate-900 uppercase tracking-[0.3em]">Vault Access</p>
          <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1 animate-pulse">Syncing Ledger...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans antialiased selection:bg-blue-100">
      {/* Connectivity Status Toast */}
      <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded-full border shadow-sm text-[9px] font-black uppercase tracking-tight bg-white ${isDemo ? 'border-amber-100 text-amber-600' : 'border-emerald-100 text-emerald-600'}`}>
        <div className={`w-1.5 h-1.5 rounded-full ${isDemo ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'}`} />
        {isDemo ? 'Demo Mode' : 'Live Cloud'}
      </div>

      <nav className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-2 rounded-xl shadow-lg shadow-blue-50">
            <Wallet className="text-white w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-tight uppercase leading-none text-slate-900">Voices South</h1>
            <p className="text-[8px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Financial Portal</p>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-6 md:p-10 space-y-8">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h2 className="text-2xl font-black tracking-tight text-slate-900">Executive Dashboard</h2>
            <p className="text-slate-500 text-xs font-medium mt-1">Fiscal oversight and resource allocation.</p>
          </div>
          <div className="flex items-center gap-2 text-[9px] font-black uppercase text-slate-400 tracking-widest">
            <Activity size={10} className="text-blue-500" />
            Active Session
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-[28px] border border-slate-200 shadow-sm">
            <TrendingUp className="text-emerald-500 mb-4" size={18} />
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Gross Income</p>
            <p className="text-2xl font-black text-slate-900 mt-1">${stats.income.toLocaleString()}</p>
          </div>
          <div className="bg-white p-6 rounded-[28px] border border-slate-200 shadow-sm">
            <TrendingDown className="text-rose-500 mb-4" size={18} />
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Expenditures</p>
            <p className="text-2xl font-black text-slate-900 mt-1">${stats.expenses.toLocaleString()}</p>
          </div>
          <div className="bg-slate-900 p-6 rounded-[28px] shadow-xl text-white">
            <DollarSign className="text-blue-400 mb-4" size={18} />
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest">Operating Balance</p>
            <p className="text-2xl font-black mt-1">${stats.balance.toLocaleString()}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* History */}
          <div className="lg:col-span-8 bg-white rounded-[28px] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-white">
              <h3 className="font-black text-[10px] uppercase tracking-widest text-slate-900">Recent Transactions</h3>
              <button className="text-[9px] font-black uppercase text-blue-600 tracking-widest">Filter</button>
            </div>
            <div className="divide-y divide-slate-50 overflow-y-auto">
              {transactions.map(t => (
                <div key={t.id} className="p-5 flex items-center justify-between hover:bg-slate-50/50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${t.type === 'Income' ? 'bg-emerald-50 text-emerald-600' : 'bg-slate-100 text-slate-600'}`}>
                      {t.type === 'Income' ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                    </div>
                    <div>
                      <p className="font-bold text-[14px] text-slate-900">{t.description}</p>
                      <p className="text-[9px] text-slate-400 font-black uppercase tracking-widest mt-0.5">{t.category}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-black text-[14px] ${t.type === 'Income' ? 'text-emerald-600' : 'text-slate-900'}`}>
                      {t.type === 'Income' ? '+' : '-'}${Number(t.amount).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white p-7 rounded-[28px] border border-slate-200 shadow-sm">
              <h3 className="font-black text-[10px] uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
                <PieChart size={14} /> Allocation
              </h3>
              <div className="space-y-5">
                {[{l: 'Personnel', v: 45, c: 'bg-blue-600'}, {l: 'Operations', v: 30, c: 'bg-slate-900'}].map(i => (
                  <div key={i.l} className="space-y-2">
                    <div className="flex justify-between text-[9px] font-black uppercase">
                      <span className="text-slate-900">{i.l}</span>
                      <span className="text-slate-400">{i.v}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full ${i.c} rounded-full`} style={{width:`${i.v}%`}}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="bg-blue-600 p-7 rounded-[28px] text-white shadow-lg shadow-blue-100 relative overflow-hidden">
              <div className="relative z-10">
                <h4 className="font-black text-sm mb-1 uppercase tracking-tight">Audit Summary</h4>
                <p className="text-[10px] text-blue-100 font-bold mb-5 leading-relaxed opacity-80 uppercase">Financial year 2026 data compiled for oversight.</p>
                <button className="w-full py-3 bg-white text-blue-600 rounded-xl font-black text-[9px] uppercase tracking-widest shadow-sm hover:shadow-md active:scale-95 transition-all">
                  Generate PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
