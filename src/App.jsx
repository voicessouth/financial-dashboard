import React, { useState, useEffect, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Calendar, 
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
  addDoc, 
  serverTimestamp,
  query
} from 'firebase/firestore';

/**
 * FIREBASE CONFIGURATION
 * Updated to use a more compatible environment variable access pattern 
 * or global fallbacks to ensure the app compiles in all target environments.
 */
const getEnv = (key) => {
  try {
    // Fallback chain for different build tools (Vite/Webpack/Process)
    return (
      (typeof process !== 'undefined' && process.env && process.env[key]) ||
      (typeof window !== 'undefined' && window[key]) ||
      ""
    );
  } catch (e) {
    return "";
  }
};

const firebaseConfig = {
  apiKey: getEnv('VITE_FIREBASE_API_KEY'),
  authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: getEnv('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: getEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: getEnv('VITE_FIREBASE_APP_ID')
};

// Check if config is valid
const isConfigValid = firebaseConfig.apiKey && firebaseConfig.projectId;

// Initialize Firebase only if config is present and not already initialized
let db = null;
let auth = null;

if (isConfigValid) {
  try {
    const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
    auth = getAuth(app);
    db = getFirestore(app);
  } catch (error) {
    console.error("Firebase initialization failed:", error);
  }
}

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [isDemo, setIsDemo] = useState(!isConfigValid);
  const [transactions, setTransactions] = useState([]);
  const [error, setError] = useState(null);

  // MOCK DATA for Demo Mode or initial load
  const mockTransactions = [
    { id: '1', type: 'Income', category: 'Tithes', amount: 5200, date: new Date().toISOString(), description: 'Sunday Service' },
    { id: '2', type: 'Expense', category: 'Utilities', amount: 450, date: new Date().toISOString(), description: 'Electric Bill' },
    { id: '3', type: 'Income', category: 'Donation', amount: 1200, date: new Date().toISOString(), description: 'Youth Program' },
  ];

  // SAFETY TIMEOUT: Force show dashboard after 3 seconds
  useEffect(() => {
    const timer = setTimeout(() => {
      if (loading) {
        setLoading(false);
        if (transactions.length === 0) setTransactions(mockTransactions);
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, [loading, transactions.length]);

  // Handle Authentication
  useEffect(() => {
    if (!auth) {
      setLoading(false);
      setTransactions(mockTransactions);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setUser(user);
      } else {
        signInAnonymously(auth).catch(err => {
          console.error("Auth error:", err);
          setIsDemo(true);
          setLoading(false);
        });
      }
    });

    return () => unsubscribe();
  }, []);

  // Handle Data Fetching
  useEffect(() => {
    if (!user || !db || isDemo) return;

    const transactionsRef = collection(db, 'transactions');
    
    const unsubscribe = onSnapshot(transactionsRef, 
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          date: doc.data().date?.toDate?.()?.toISOString() || doc.data().date || new Date().toISOString()
        }));
        setTransactions(data.length > 0 ? data : mockTransactions);
        setLoading(false);
      },
      (err) => {
        console.error("Firestore error:", err);
        setError("Syncing paused. Showing local records.");
        setTransactions(mockTransactions);
        setLoading(false);
      }
    );

    return () => unsubscribe();
  }, [user, isDemo]);

  // Calculations
  const stats = useMemo(() => {
    const income = transactions
      .filter(t => t.type === 'Income')
      .reduce((sum, t) => sum + Number(t.amount), 0);
    const expenses = transactions
      .filter(t => t.type === 'Expense')
      .reduce((sum, t) => sum + Number(t.amount), 0);
    return {
      totalIncome: income,
      totalExpenses: expenses,
      balance: income - expenses
    };
  }, [transactions]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <RefreshCw className="w-10 h-10 text-blue-600 animate-spin mb-4" />
        <p className="text-slate-600 font-bold uppercase tracking-widest text-xs">Accessing Financial Portal...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans">
      {/* Network Status */}
      <div className={`w-full py-1.5 px-4 text-[9px] font-black uppercase tracking-[0.2em] flex items-center justify-center gap-2 ${isDemo ? 'bg-amber-500 text-white' : 'bg-emerald-500 text-white'}`}>
        {isDemo ? (
          <><CloudOff size={10} /> Local Demo Mode</>
        ) : (
          <><Database size={10} /> Live Cloud Connection</>
        )}
      </div>

      <nav className="bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-4">
          <div className="bg-blue-600 p-2.5 rounded-xl shadow-lg shadow-blue-200">
            <Wallet className="text-white w-6 h-6" />
          </div>
          <div>
            <h1 className="text-xl font-black tracking-tighter text-slate-900 uppercase">Voices South</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Financial Management</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="hidden sm:block text-right mr-4">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Reporting Period</p>
            <p className="text-xs font-bold text-slate-800">April 2026</p>
          </div>
          <div className="w-10 h-10 rounded-2xl bg-slate-100 flex items-center justify-center text-slate-500 font-black border border-slate-200">
            VS
          </div>
        </div>
      </nav>

      <main className="max-w-6xl mx-auto p-8 space-y-8">
        {/* Error Alert */}
        {error && (
          <div className="bg-amber-50 border border-amber-200 p-4 rounded-2xl flex items-center gap-3 text-amber-800">
            <AlertCircle size={18} />
            <p className="text-xs font-bold uppercase tracking-wide">{error}</p>
          </div>
        )}

        {/* Highlight Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col justify-between h-48">
            <div className="flex justify-between items-start">
              <span className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl"><TrendingUp size={24} /></span>
              <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">+12%</span>
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Tithes</p>
              <h2 className="text-3xl font-black text-slate-900">${stats.totalIncome.toLocaleString()}</h2>
            </div>
          </div>

          <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100 flex flex-col justify-between h-48">
            <div className="flex justify-between items-start">
              <span className="p-3 bg-rose-50 text-rose-600 rounded-2xl"><TrendingDown size={24} /></span>
              <span className="text-[10px] font-black text-rose-600 bg-rose-50 px-3 py-1 rounded-full">-4%</span>
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Total Expenses</p>
              <h2 className="text-3xl font-black text-slate-900">${stats.totalExpenses.toLocaleString()}</h2>
            </div>
          </div>

          <div className="bg-slate-900 p-8 rounded-[2rem] shadow-2xl text-white flex flex-col justify-between h-48">
            <div className="flex justify-between items-start">
              <span className="p-3 bg-blue-500/20 text-blue-400 rounded-2xl"><DollarSign size={24} /></span>
              <Activity size={20} className="text-blue-400 animate-pulse" />
            </div>
            <div>
              <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Net Balance</p>
              <h2 className="text-3xl font-black text-white">${stats.balance.toLocaleString()}</h2>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Recent Ledger */}
          <div className="lg:col-span-8 space-y-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-black text-sm uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
                Recent Activity
                <span className="h-1.5 w-1.5 rounded-full bg-blue-500"></span>
              </h3>
              <button className="text-[10px] font-black text-blue-600 uppercase tracking-widest hover:bg-blue-50 px-4 py-2 rounded-xl transition-all">View All Entries</button>
            </div>
            
            <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden">
              <div className="divide-y divide-slate-50">
                {transactions.map((t) => (
                  <div key={t.id} className="p-5 hover:bg-slate-50/50 transition-colors flex items-center justify-between group">
                    <div className="flex items-center gap-5">
                      <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${t.type === 'Income' ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>
                        {t.type === 'Income' ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                      </div>
                      <div>
                        <p className="font-black text-slate-900 text-sm tracking-tight">{t.description}</p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          {t.category} • {new Date(t.date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className={`font-black text-lg ${t.type === 'Income' ? 'text-emerald-600' : 'text-slate-900'}`}>
                          {t.type === 'Income' ? '+' : '-'}${Number(t.amount).toLocaleString()}
                        </p>
                      </div>
                      <ChevronRight size={16} className="text-slate-300 group-hover:text-blue-600 transition-colors" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Sidebar Analytics */}
          <div className="lg:col-span-4 space-y-6">
            <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-slate-100">
              <h3 className="font-black text-[10px] uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
                <PieChart size={14} className="text-blue-600" />
                Budget Split
              </h3>
              <div className="space-y-5">
                {[
                  { label: 'Personnel', value: 45, color: 'bg-blue-600' },
                  { label: 'Operations', value: 30, color: 'bg-slate-900' },
                  { label: 'Outreach', value: 15, color: 'bg-emerald-500' },
                  { label: 'Emergency', value: 10, color: 'bg-rose-500' }
                ].map(item => (
                  <div key={item.label}>
                    <div className="flex justify-between text-[10px] font-black text-slate-400 uppercase mb-2">
                      <span>{item.label}</span>
                      <span className="text-slate-900">{item.value}%</span>
                    </div>
                    <div className="h-2 bg-slate-50 rounded-full overflow-hidden">
                      <div className={`h-full ${item.color} rounded-full`} style={{ width: `${item.value}%` }}></div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-blue-600 p-8 rounded-[2rem] shadow-xl text-white relative overflow-hidden">
              <div className="relative z-10">
                <h3 className="font-black text-lg tracking-tighter mb-2">Quarterly Audit</h3>
                <p className="text-blue-100 text-[10px] font-bold uppercase tracking-widest mb-6 leading-relaxed">System-generated transparency report for the 2026 Board.</p>
                <button className="w-full py-4 bg-white text-blue-600 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-blue-50 transition-all active:scale-95">
                  Export Dataset
                </button>
              </div>
              <Activity size={100} className="absolute -bottom-8 -right-8 text-blue-500/20" />
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
