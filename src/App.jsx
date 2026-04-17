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
 * UPDATED CONFIGURATION ACCESS
 * This bypasses the build-time errors and prevents the "Initializing" hang.
 */
const firebaseConfig = {
  apiKey: typeof window !== 'undefined' ? (window.VITE_FIREBASE_API_KEY || "") : "",
  authDomain: typeof window !== 'undefined' ? (window.VITE_FIREBASE_AUTH_DOMAIN || "") : "",
  projectId: typeof window !== 'undefined' ? (window.VITE_FIREBASE_PROJECT_ID || "") : "",
  storageBucket: typeof window !== 'undefined' ? (window.VITE_FIREBASE_STORAGE_BUCKET || "") : "",
  messagingSenderId: typeof window !== 'undefined' ? (window.VITE_FIREBASE_MESSAGING_SENDER_ID || "") : "",
  appId: typeof window !== 'undefined' ? (window.VITE_FIREBASE_APP_ID || "") : ""
};

// Global services
let auth = null;
let db = null;

// Only attempt init if we have keys, otherwise default to demo mode
const hasKeys = !!firebaseConfig.apiKey;

if (hasKeys) {
  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (e) {
    console.error("Firebase Init Error", e);
  }
}

export default function App() {
  const [user, setUser] = useState(null);
  const [transactions, setTransactions] = useState([
    { id: '1', type: 'Income', category: 'Tithes', amount: 5200, date: new Date().toISOString(), description: 'Sunday Service' },
    { id: '2', type: 'Expense', category: 'Utilities', amount: 450, date: new Date().toISOString(), description: 'Electric Bill' },
    { id: '3', type: 'Income', category: 'Donation', amount: 1200, date: new Date().toISOString(), description: 'Youth Program' },
  ]);
  const [isDemo, setIsDemo] = useState(!hasKeys);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // CRITICAL: Fail-safe to ensure dashboard shows no matter what
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsLoading(false);
    }, 1500); // Max 1.5 seconds wait
    return () => clearTimeout(timer);
  }, []);

  // Auth & Data Subscription
  useEffect(() => {
    if (!auth || !db) {
      setIsLoading(false);
      return;
    }

    const unsubscribeAuth = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
        // Once authed, subscribe to data
        const unsubData = onSnapshot(collection(db, 'transactions'), 
          (snap) => {
            const data = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            if (data.length > 0) setTransactions(data);
            setIsLoading(false);
          },
          (err) => {
            console.error(err);
            setIsDemo(true);
            setIsLoading(false);
          }
        );
        return () => unsubData();
      } else {
        signInAnonymously(auth).catch(() => {
          setIsDemo(true);
          setIsLoading(false);
        });
      }
    });

    return () => unsubscribeAuth();
  }, []);

  const stats = useMemo(() => {
    const income = transactions.filter(t => t.type === 'Income').reduce((s, t) => s + Number(t.amount), 0);
    const expenses = transactions.filter(t => t.type === 'Expense').reduce((s, t) => s + Number(t.amount), 0);
    return { income, expenses, balance: income - expenses };
  }, [transactions]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-6">
        <RefreshCw className="w-8 h-8 text-blue-600 animate-spin mb-4" />
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.3em]">Loading Secure Ledger...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 selection:bg-blue-100">
      {/* Network Banner */}
      <div className={`py-1 px-4 text-[9px] font-black uppercase tracking-widest text-center transition-colors ${isDemo ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white'}`}>
        {isDemo ? 'Offline / Demo Mode Active' : 'Connected to Cloud Treasury'}
      </div>

      <nav className="bg-white border-b border-slate-200 px-6 py-4 flex items-center justify-between sticky top-0 z-20">
        <div className="flex items-center gap-3">
          <div className="bg-blue-600 p-2 rounded-lg">
            <Wallet className="text-white w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-black tracking-tight uppercase leading-none">Voices South</h1>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Financial Portal</p>
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-6 md:p-8 space-y-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <TrendingUp className="text-emerald-500 mb-4" size={20} />
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Income</p>
            <p className="text-2xl font-black text-slate-900">${stats.income.toLocaleString()}</p>
          </div>
          <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
            <TrendingDown className="text-rose-500 mb-4" size={20} />
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Total Expenses</p>
            <p className="text-2xl font-black text-slate-900">${stats.expenses.toLocaleString()}</p>
          </div>
          <div className="bg-slate-900 p-6 rounded-3xl shadow-xl shadow-slate-200 text-white">
            <DollarSign className="text-blue-400 mb-4" size={20} />
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Net Balance</p>
            <p className="text-2xl font-black">${stats.balance.toLocaleString()}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-8 bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-black text-xs uppercase tracking-widest text-slate-400">Transaction History</h3>
              <Activity size={14} className="text-blue-500 animate-pulse" />
            </div>
            <div className="divide-y divide-slate-50">
              {transactions.map(t => (
                <div key={t.id} className="p-5 flex items-center justify-between hover:bg-slate-50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${t.type === 'Income' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                      {t.type === 'Income' ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                    </div>
                    <div>
                      <p className="font-bold text-sm text-slate-800">{t.description}</p>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wide">{t.category}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-black text-sm ${t.type === 'Income' ? 'text-emerald-600' : 'text-slate-900'}`}>
                      {t.type === 'Income' ? '+' : '-'}${Number(t.amount).toLocaleString()}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm">
              <h3 className="font-black text-[10px] uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
                <PieChart size={14} /> Allocation
              </h3>
              <div className="space-y-4">
                {[{l: 'Personnel', v: 45, c: 'bg-blue-600'}, {l: 'Ops', v: 30, c: 'bg-slate-900'}].map(i => (
                  <div key={i.l}>
                    <div className="flex justify-between text-[10px] font-black uppercase mb-1">
                      <span>{i.l}</span>
                      <span>{i.v}%</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full">
                      <div className={`h-full ${i.c} rounded-full`} style={{width:`${i.v}%`}}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            
            <div className="bg-blue-600 p-6 rounded-3xl text-white shadow-lg shadow-blue-100">
              <h4 className="font-black text-sm mb-1 uppercase tracking-tight">Audit Ready</h4>
              <p className="text-[10px] text-blue-100 font-bold mb-4 leading-tight opacity-80">Reports generated for the board review committee.</p>
              <button className="w-full py-3 bg-white text-blue-600 rounded-xl font-black text-[10px] uppercase tracking-widest shadow-sm hover:shadow-md transition-all active:scale-95">
                Download PDF
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
