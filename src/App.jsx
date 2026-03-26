import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  onSnapshot,
  getDoc,
  collection
} from 'firebase/firestore';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged,
  signInWithCustomToken
} from 'firebase/auth';
import { 
  TrendingUp, 
  Wallet, 
  Plus,
  ChevronLeft,
  ChevronRight,
  Lock,
  BarChart3,
  CheckCircle2,
  XCircle,
  Database,
  Search,
  Loader2,
  RefreshCw
} from 'lucide-react';

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : {
      apiKey: "AIzaSyDb6oFZEStklFT_Dt2riDbQC_IJPHcT304",
  authDomain: "church-finance-dashboard-40dca.firebaseapp.com",
  projectId: "church-finance-dashboard-40dca",
  storageBucket: "church-finance-dashboard-40dca.firebasestorage.app",
  messagingSenderId: "480863076081",
  appId: "1:480863076081:web:dd01f7270a7cd158f93350""
    };

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'church-finance-dashboard-40dca';

// --- CONSTANTS ---
const REVENUE_CATEGORIES = ['Cash/Checks', 'Credit Card', 'Text', 'Givelify', 'Tithely', 'CashApp', 'Zelle', 'Website Giving'];
const EXPENSE_CATEGORIES = [
  'Mortgage - Kirkland Group', 'Pastor Payroll', 'Lady Val Payroll', 
  'Admin Payroll Taxes and fees', 'Band Payroll', 'Pastor Love offerings', 
  'Georgia Power', 'Georgia Natural Gas', 'Spectrum (TV, Phone, Internet)', 
  'Henry County Water Authority', 'TMobile', 'Kaiser Permanente', 
  'GFL Environmental', 'Ministry Design', 'Quickbooks', 
  'Team Pest USA', 'First Citizens Bank', 'Other'
];

const ADMIN_CREDENTIALS = { loginId: "voicessouth", password: "3894South" };

const formatDate = (date) => {
  const d = new Date(date);
  return `${d.getMonth() + 1}-${d.getDate()}-${d.getFullYear().toString().slice(-2)}`;
};

const getReportingFriday = (dateObj) => {
  const d = new Date(dateObj);
  const day = d.getDay(); 
  const diff = (day >= 5) ? (day - 5) : (day + 2);
  const targetFriday = new Date(d);
  targetFriday.setDate(d.getDate() - diff);
  return formatDate(targetFriday);
};

export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  const [selectedSheetDate, setSelectedSheetDate] = useState(getReportingFriday(new Date()));
  const [viewMode, setViewMode] = useState('Sun'); 
  
  const [revenueData, setRevenueData] = useState({});
  const [expenses, setExpenses] = useState([]);
  const [manualStartingBalance, setManualStartingBalance] = useState(0);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [logs, setLogs] = useState([]);

  const addLog = (msg) => setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 5));

  // 1. AUTHENTICATION
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        addLog("Auth Error: " + err.message);
      }
    };
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
    });
    initAuth();
    return () => unsubscribe();
  }, []);

  // 2. DATA LISTENER - PULLING FROM church_reports
  useEffect(() => {
    if (!user || !isAuthenticated) return;

    setIsSyncing(true);
    const dbMode = viewMode.replace(/\s+/g, '_');
    const docId = `${selectedSheetDate}_${dbMode}`;
    
    // We listen to the path that matches your existing collection: church_reports
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'church_reports', docId);
    
    const unsubscribe = onSnapshot(docRef, 
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setRevenueData(data.revenue || {});
          setExpenses(data.expenses || []);
          setManualStartingBalance(data.startingBalance || 0);
          setIsSubmitted(data.status === 'submitted');
          addLog(`Found data for ${selectedSheetDate}`);
        } else {
          // If not found in primary path, try a fallback search for root-level legacy data
          checkLegacyData(docId);
        }
        setIsSyncing(false);
      }, 
      (err) => {
        addLog("Sync Error: " + err.code);
        setIsSyncing(false);
      }
    );

    return () => unsubscribe();
  }, [user, isAuthenticated, selectedSheetDate, viewMode]);

  const checkLegacyData = async (docId) => {
    try {
      // Trying to pull from the specific collection you mentioned
      const legacyRef = doc(db, 'church_reports', selectedSheetDate);
      const legacySnap = await getDoc(legacyRef);
      if (legacySnap.exists()) {
        const data = legacySnap.data();
        setRevenueData(data.revenue || {});
        setExpenses(data.expenses || []);
        setIsSubmitted(data.status === 'submitted');
        addLog("Recovered data from church_reports");
      } else {
        setRevenueData({});
        setExpenses([]);
        setIsSubmitted(false);
      }
    } catch (e) {
      addLog("New report path active");
    }
  };

  const totals = useMemo(() => {
    const rev = Object.values(revenueData).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
    const exp = expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    const start = parseFloat(manualStartingBalance) || 0;
    return { rev, exp, start, end: start + (rev - exp) };
  }, [revenueData, expenses, manualStartingBalance]);

  const handleSave = async (updates) => {
    if (!user || !isAuthenticated || isSubmitted) return;
    const dbMode = viewMode.replace(/\s+/g, '_');
    const docId = `${selectedSheetDate}_${dbMode}`;
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'church_reports', docId);
    
    try {
      await setDoc(docRef, { ...updates, lastUpdated: new Date().toISOString() }, { merge: true });
    } catch (e) {
      addLog("Save failed: Permission check");
    }
  };

  if (!authReady) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <Loader2 className="animate-spin text-indigo-400" size={32}/>
    </div>
  );

  if (!isAuthenticated) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 text-slate-900">
      <div className="w-full max-w-md bg-white rounded-[2.5rem] p-10 shadow-2xl">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white mx-auto mb-4 shadow-lg"><Lock size={24}/></div>
          <h1 className="text-xl font-black uppercase tracking-tight">Financial Vault</h1>
          <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mt-1">Voices South Admin</p>
        </div>
        <form onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.target);
          if (d.get('id') === ADMIN_CREDENTIALS.loginId && d.get('pw') === ADMIN_CREDENTIALS.password) {
            setIsAuthenticated(true);
          }
        }} className="space-y-3">
          <input name="id" type="text" placeholder="Admin ID" required className="w-full px-5 py-4 bg-slate-100 rounded-xl outline-none font-bold" />
          <input name="pw" type="password" placeholder="Passkey" required className="w-full px-5 py-4 bg-slate-100 rounded-xl outline-none font-bold" />
          <button type="submit" className="w-full bg-slate-900 text-white py-4 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-600 transition-all mt-4">Login to Database</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f8fafc] pb-32">
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-40 px-6 py-3">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex bg-slate-100 p-1 rounded-xl">
            {['Sun', 'Tue', 'End of Week', 'End of Month'].map(m => (
              <button key={m} onClick={() => setViewMode(m)} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-tighter ${viewMode === m ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>
                {m}
              </button>
            ))}
          </div>
          <div className="flex gap-3">
             <button onClick={() => window.location.reload()} className="p-2 text-slate-400 hover:text-indigo-600 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest bg-slate-50 rounded-lg px-3">
               <RefreshCw size={14} className={isSyncing ? "animate-spin" : ""} />
               Sync Database
             </button>
             <button onClick={() => setIsAuthenticated(false)} className="text-slate-300 hover:text-rose-500"><XCircle size={20}/></button>
          </div>
        </div>
      </nav>

      <header className="max-w-6xl mx-auto mt-8 px-6 flex flex-col md:flex-row gap-6 items-center justify-between">
        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-10">
          <button onClick={() => {
            const [m, d, y] = selectedSheetDate.split('-').map(Number);
            const date = new Date(2000 + y, m - 1, d);
            date.setDate(date.getDate() - 7);
            setSelectedSheetDate(formatDate(date));
          }} className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 hover:text-indigo-600 transition-colors"><ChevronLeft/></button>
          <div className="text-center min-w-[120px]">
            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest">{viewMode} Sheet</p>
            <h2 className="text-3xl font-black text-slate-900">{selectedSheetDate}</h2>
          </div>
          <button onClick={() => {
            const [m, d, y] = selectedSheetDate.split('-').map(Number);
            const date = new Date(2000 + y, m - 1, d);
            date.setDate(date.getDate() + 7);
            setSelectedSheetDate(formatDate(date));
          }} className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center text-slate-400 hover:text-indigo-600 transition-colors"><ChevronRight/></button>
        </div>

        <div className="grid grid-cols-2 gap-4 w-full md:w-auto">
          <div className="bg-white px-8 py-5 rounded-[2rem] border border-slate-200 text-center shadow-sm">
             <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest">Total Revenue</p>
             <p className="text-xl font-black text-emerald-600">${totals.rev.toLocaleString()}</p>
          </div>
          <div className="bg-indigo-600 px-8 py-5 rounded-[2rem] text-center text-white shadow-xl shadow-indigo-100">
             <p className="text-[9px] font-black uppercase text-indigo-200 tracking-widest">Ending Balance</p>
             <p className="text-xl font-black">${totals.end.toLocaleString()}</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto mt-8 px-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 bg-emerald-50 text-emerald-600 rounded-lg flex items-center justify-center"><TrendingUp size={16}/></div>
            <h3 className="font-black text-xs uppercase tracking-widest text-slate-800 tracking-tighter">Income Entry</h3>
          </div>
          
          <div className="mb-6 p-4 bg-slate-50 rounded-2xl border border-slate-100 flex items-center justify-between">
            <span className="text-[10px] font-black text-slate-400 uppercase">Starting Cash Balance</span>
            <div className="flex items-center gap-1 font-black text-slate-800">
              <span className="text-slate-300">$</span>
              <input type="number" value={manualStartingBalance || ''} disabled={isSubmitted}
                onChange={(e) => {
                  const v = parseFloat(e.target.value) || 0;
                  setManualStartingBalance(v);
                  handleSave({ startingBalance: v });
                }} className="bg-transparent outline-none w-24 text-right" placeholder="0.00" />
            </div>
          </div>

          <div className="space-y-4">
            {REVENUE_CATEGORIES.map(cat => (
              <div key={cat} className="flex items-center gap-4">
                <span className="flex-1 text-[11px] font-bold text-slate-500 uppercase">{cat}</span>
                <div className="relative w-32">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300 font-bold">$</span>
                  <input type="number" value={revenueData[cat] || ''} disabled={isSubmitted}
                    onChange={(e) => {
                      const updated = { ...revenueData, [cat]: e.target.value };
                      setRevenueData(updated);
                      handleSave({ revenue: updated });
                    }} className="w-full pl-7 pr-3 py-2 bg-slate-50 rounded-xl font-bold text-right text-slate-700 outline-none focus:ring-2 ring-indigo-500/10" />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col min-h-[500px]">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 bg-rose-50 text-rose-600 rounded-lg flex items-center justify-center"><Wallet size={16}/></div>
            <h3 className="font-black text-xs uppercase tracking-widest text-slate-800 tracking-tighter">Expense Entry</h3>
          </div>

          <div className="flex-1 space-y-3 mb-6 overflow-y-auto max-h-[350px] pr-2">
            {expenses.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center opacity-20 py-20">
                <Database size={32} className="mb-2"/>
                <p className="text-[10px] font-black uppercase tracking-widest text-center">No expenses recorded<br/>for this period</p>
              </div>
            ) : (
              expenses.map((exp, idx) => (
                <div key={idx} className="bg-slate-50 p-4 rounded-xl flex justify-between items-center group border border-slate-100">
                  <div className="text-left">
                    <p className="font-black text-slate-800 text-xs">{exp.category}</p>
                    <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">{exp.date}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <p className="font-black text-rose-500">-${parseFloat(exp.amount).toFixed(2)}</p>
                    {!isSubmitted && (
                      <button onClick={() => {
                        const updated = expenses.filter((_, i) => i !== idx);
                        setExpenses(updated);
                        handleSave({ expenses: updated });
                      }} className="text-slate-200 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all"><XCircle size={14}/></button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {!isSubmitted && (
            <form onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.target);
              const amt = f.get('a');
              if(!amt) return;
              const newExp = { 
                category: f.get('c'), 
                amount: amt, 
                date: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) 
              };
              const updated = [newExp, ...expenses];
              setExpenses(updated);
              handleSave({ expenses: updated });
              e.target.reset();
            }} className="p-5 bg-slate-900 rounded-3xl space-y-3">
              <select name="c" className="w-full p-3 bg-slate-800 text-white rounded-xl text-[10px] font-bold outline-none ring-indigo-500 focus:ring-1 appearance-none">
                {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
              <div className="flex gap-2">
                <input name="a" type="number" step="0.01" required placeholder="0.00" className="flex-1 p-3 bg-slate-800 text-white rounded-xl text-xs font-bold outline-none ring-indigo-500 focus:ring-1" />
                <button type="submit" className="bg-indigo-600 text-white w-12 h-12 rounded-xl flex items-center justify-center hover:bg-indigo-500 shadow-lg active:scale-95 transition-all"><Plus size={20}/></button>
              </div>
            </form>
          )}
        </div>
      </main>

      <div className="max-w-6xl mx-auto mt-6 px-6">
        <div className="flex gap-2 overflow-x-auto pb-2 no-scrollbar">
          {logs.map((log, i) => (
            <div key={i} className="whitespace-nowrap bg-slate-100 text-[8px] font-bold text-slate-400 px-3 py-1 rounded-full border border-slate-200 uppercase tracking-widest">{log}</div>
          ))}
        </div>
      </div>

      <footer className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-lg px-6">
        <div className="bg-white/90 backdrop-blur-xl border border-slate-200 rounded-[2.5rem] p-3 shadow-2xl flex items-center gap-4">
          <button 
            onClick={() => { if(window.confirm("Seal report and prevent further edits?")) handleSave({ status: 'submitted' }); }}
            disabled={isSubmitted}
            className={`flex-1 py-4 rounded-[1.8rem] font-black text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${isSubmitted ? 'bg-slate-100 text-slate-400' : 'bg-slate-900 text-white hover:bg-indigo-600 shadow-xl'}`}
          >
            {isSubmitted ? <CheckCircle2 size={16}/> : <BarChart3 size={16}/>}
            {isSubmitted ? 'Record Locked & Verified' : 'Submit Weekly Report'}
          </button>
        </div>
      </footer>
    </div>
  );
}
