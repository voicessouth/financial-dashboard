import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc,
  onSnapshot,
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
  Loader2,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
  LogOut
} from 'lucide-react';

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = typeof __firebase_config !== 'undefined' 
  ? JSON.parse(__firebase_config) 
  : {
      apiKey: "",
      authDomain: "church-finance-dashboard-40dca.firebaseapp.com",
      projectId: "church-finance-dashboard-40dca",
      storageBucket: "church-finance-dashboard-40dca.appspot.com",
      messagingSenderId: "774391673327",
      appId: "1:774391673327:web:96e81084206085a5700885"
    };

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'church-finance-dashboard-40dca';

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
  const [statusLogs, setStatusLogs] = useState([]);
  const [errorState, setErrorState] = useState(null);

  const addLog = useCallback((msg) => {
    setStatusLogs(prev => [`[${new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}] ${msg}`, ...prev].slice(0, 5));
  }, []);

  // --- INITIAL AUTH ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        setErrorState(`Auth Failure: ${err.message}`);
      } finally {
        setAuthReady(true);
      }
    };
    const unsubscribe = onAuthStateChanged(auth, setUser);
    initAuth();
    return () => unsubscribe();
  }, []);

  // --- DATA LISTENER & AUTO-RECOVERY ---
  useEffect(() => {
    if (!user || !isAuthenticated) return;

    setIsSyncing(true);
    const sanitizedMode = viewMode.replace(/\s+/g, '_').toLowerCase();
    
    // NEW PATH: /artifacts/{appId}/public/data/{docId}
    const docId = `finance_${selectedSheetDate}_${sanitizedMode}`;
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', docId);
    
    // OLD PATH: /artifacts/{appId}/public/data/reports/{selectedSheetDate}
    // Note: Old data didn't have "Sun/Tue" split, so we check the root report path
    const legacyDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'reports', selectedSheetDate);

    const unsubscribe = onSnapshot(docRef, async (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setRevenueData(data.revenue || {});
        setExpenses(data.expenses || []);
        setManualStartingBalance(data.startingBalance || 0);
        setIsSubmitted(data.status === 'submitted');
        addLog("Records Updated");
        setIsSyncing(false);
      } else {
        // DATA NOT FOUND IN NEW PATH? CHECK LEGACY PATH
        addLog(`Searching recovery for ${selectedSheetDate}...`);
        try {
            const legacySnap = await getDoc(legacyDocRef);
            
            if (legacySnap.exists()) {
              addLog("Legacy Data Found! Migrating...");
              const legacyData = legacySnap.data();
              // Automatically save it to the new location (Defaults to Sunday view)
              await setDoc(docRef, {
                ...legacyData,
                migratedFrom: 'reports_collection',
                lastUpdated: new Date().toISOString()
              });
              // The onSnapshot will re-fire and populate the UI
            } else {
              // Truly new record
              setRevenueData({});
              setExpenses([]);
              setManualStartingBalance(0);
              setIsSubmitted(false);
              addLog("New Ledger Created");
            }
        } catch (e) {
            addLog("Scan Error");
        }
        setIsSyncing(false);
      }
    }, (err) => {
      setIsSyncing(false);
      addLog(`Sync Error: ${err.code}`);
    });

    return () => unsubscribe();
  }, [user, isAuthenticated, selectedSheetDate, viewMode, addLog]);

  const totals = useMemo(() => {
    const rev = Object.values(revenueData).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
    const exp = expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    const start = parseFloat(manualStartingBalance) || 0;
    return { rev, exp, start, end: start + (rev - exp) };
  }, [revenueData, expenses, manualStartingBalance]);

  const handleSave = async (updates) => {
    if (!user || !isAuthenticated || isSubmitted) return;
    const sanitizedMode = viewMode.replace(/\s+/g, '_').toLowerCase();
    const docId = `finance_${selectedSheetDate}_${sanitizedMode}`;
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', docId);
    try {
      await setDoc(docRef, { ...updates, lastUpdated: new Date().toISOString() }, { merge: true });
    } catch (e) {
      addLog(`Save Failed: ${e.code}`);
    }
  };

  if (errorState) return <div className="min-h-screen bg-slate-950 flex items-center justify-center p-8 text-rose-500">{errorState}</div>;
  if (!authReady) return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white">Connecting...</div>;

  if (!isAuthenticated) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-[2.5rem] p-10 shadow-2xl">
        <h1 className="text-2xl font-black text-center mb-8 uppercase tracking-tighter">Security Portal</h1>
        <form onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.target);
          if (d.get('id') === ADMIN_CREDENTIALS.loginId && d.get('pw') === ADMIN_CREDENTIALS.password) {
            setIsAuthenticated(true);
          }
        }} className="space-y-4">
          <input name="id" type="text" placeholder="Username" required className="w-full px-5 py-4 bg-slate-50 rounded-xl border border-slate-100" />
          <input name="pw" type="password" placeholder="Password" required className="w-full px-5 py-4 bg-slate-50 rounded-xl border border-slate-100" />
          <button type="submit" className="w-full bg-slate-950 text-white py-4 rounded-xl font-black uppercase tracking-widest hover:bg-indigo-600 transition-all text-sm tracking-tighter">Authorize Access</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#fcfdfe] pb-40 font-sans">
      <nav className="bg-white border-b border-slate-100 sticky top-0 z-40 px-6 py-4 flex items-center justify-between">
          <div className="flex bg-slate-50 p-1 rounded-2xl border border-slate-100">
            {['Sun', 'Tue', 'End of Week', 'End of Month'].map(m => (
              <button key={m} onClick={() => setViewMode(m)} className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all ${viewMode === m ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                {m}
              </button>
            ))}
          </div>
          <button onClick={() => setIsAuthenticated(false)} className="text-slate-400 hover:text-rose-500 transition-colors"><LogOut size={20}/></button>
      </nav>

      <header className="max-w-7xl mx-auto mt-10 px-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm flex items-center justify-between">
          <button onClick={() => {
            const [m, d, y] = selectedSheetDate.split('-').map(Number);
            const date = new Date(2000 + y, m - 1, d);
            date.setDate(date.getDate() - 7);
            setSelectedSheetDate(formatDate(date));
          }} className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 hover:text-indigo-600 transition-all border border-slate-100"><ChevronLeft size={24}/></button>
          <div className="text-center">
            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-[0.2em] mb-1">{viewMode}</p>
            <h2 className="text-4xl font-black text-slate-900 tracking-tighter">{selectedSheetDate}</h2>
          </div>
          <button onClick={() => {
            const [m, d, y] = selectedSheetDate.split('-').map(Number);
            const date = new Date(2000 + y, m - 1, d);
            date.setDate(date.getDate() + 7);
            setSelectedSheetDate(formatDate(date));
          }} className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 hover:text-indigo-600 transition-all border border-slate-100"><ChevronRight size={24}/></button>
        </div>

        <div className="bg-slate-900 px-8 py-6 rounded-[2.5rem] text-center text-white flex flex-col justify-center shadow-xl">
             <p className="text-[9px] font-black uppercase text-indigo-400 tracking-widest mb-1">Projected Balance</p>
             <p className="text-3xl font-black text-white tracking-tight">${totals.end.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto mt-8 px-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm">
          <h3 className="font-black text-sm uppercase tracking-widest text-slate-800 mb-6 flex items-center gap-2">
            <TrendingUp size={20} className="text-emerald-500"/> Income Ledger
          </h3>
          <div className="mb-6 p-4 bg-slate-50 rounded-2xl flex items-center justify-between border border-slate-100">
             <span className="text-[10px] font-black uppercase text-slate-400">Carry Over</span>
             <input type="number" value={manualStartingBalance || ''} disabled={isSubmitted}
                onChange={(e) => {
                  const v = parseFloat(e.target.value) || 0;
                  setManualStartingBalance(v);
                  handleSave({ startingBalance: v });
                }} className="bg-transparent text-right font-black text-slate-900 outline-none w-24 placeholder-slate-200" placeholder="0.00" />
          </div>
          <div className="space-y-4">
            {REVENUE_CATEGORIES.map(cat => (
              <div key={cat} className="flex items-center gap-4">
                <span className="flex-1 text-[11px] font-black text-slate-500 uppercase">{cat}</span>
                <input type="number" value={revenueData[cat] || ''} disabled={isSubmitted}
                    onChange={(e) => {
                      const updated = { ...revenueData, [cat]: e.target.value };
                      setRevenueData(updated);
                      handleSave({ revenue: updated });
                    }} className="w-32 p-3 bg-slate-50 rounded-xl font-black text-right border border-transparent focus:border-indigo-500 outline-none placeholder-slate-200" placeholder="0.00" />
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm flex flex-col min-h-[500px]">
          <h3 className="font-black text-sm uppercase tracking-widest text-slate-800 mb-6 flex items-center gap-2">
            <Wallet size={20} className="text-rose-500"/> Expenditures
          </h3>
          <div className="flex-1 space-y-3 mb-6 overflow-y-auto max-h-[400px] pr-2">
            {expenses.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center opacity-20 py-20"><Database size={32}/><p className="text-[10px] font-black uppercase mt-2 tracking-widest">No expenses recorded</p></div>
            ) : (
              expenses.map((exp, idx) => (
                <div key={idx} className="bg-slate-50 p-4 rounded-xl flex justify-between items-center border border-slate-100 animate-in fade-in slide-in-from-bottom-2 duration-300">
                  <span className="font-black text-slate-900 text-[10px] uppercase tracking-tight">{exp.category}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-black text-rose-600">-${parseFloat(exp.amount).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                    {!isSubmitted && <button onClick={() => {
                        const updated = expenses.filter((_, i) => i !== idx);
                        setExpenses(updated);
                        handleSave({ expenses: updated });
                    }} className="text-slate-300 hover:text-rose-500 transition-colors"><XCircle size={14}/></button>}
                  </div>
                </div>
              ))
            )}
          </div>
          {!isSubmitted && (
            <form onSubmit={(e) => {
              e.preventDefault();
              const f = new FormData(e.target);
              const newExp = { category: f.get('c'), amount: f.get('a'), date: new Date().toLocaleTimeString() };
              const updated = [newExp, ...expenses];
              setExpenses(updated);
              handleSave({ expenses: updated });
              e.target.reset();
            }} className="p-4 bg-slate-950 rounded-3xl flex gap-2 shadow-lg">
              <select name="c" className="flex-1 bg-transparent text-white text-[10px] font-black uppercase outline-none px-2 cursor-pointer">
                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c} className="bg-slate-900 text-white">{c}</option>)}
              </select>
              <input name="a" type="number" step="0.01" required placeholder="0.00" className="w-20 bg-slate-800 text-white p-2 rounded-xl text-xs font-black outline-none border border-slate-700 focus:border-indigo-500" />
              <button type="submit" className="bg-indigo-600 text-white p-2 rounded-xl hover:bg-indigo-500 transition-colors"><Plus size={18}/></button>
            </form>
          )}
        </div>
      </main>

      <div className="max-w-7xl mx-auto mt-8 px-6">
        <div className="bg-white rounded-2xl p-4 border border-slate-200 flex gap-4 overflow-hidden items-center">
          <ShieldCheck size={14} className="text-emerald-500 shrink-0"/>
          <div className="flex gap-6 overflow-hidden">
            {statusLogs.map((log, i) => (
              <span key={i} className={`text-[9px] font-black uppercase whitespace-nowrap ${i === 0 ? 'text-indigo-600' : 'text-slate-300'}`}>{log}</span>
            ))}
          </div>
        </div>
      </div>

      <footer className="fixed bottom-10 left-1/2 -translate-x-1/2 w-full max-w-sm px-6">
        <button 
          onClick={() => { if(window.confirm("Lock this report for the official record?")) handleSave({ status: 'submitted' }); }}
          disabled={isSubmitted || isSyncing}
          className={`w-full py-5 rounded-[2rem] font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 shadow-2xl transition-all ${isSubmitted ? 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none border border-slate-200' : 'bg-slate-950 text-white hover:bg-indigo-600 active:scale-95'}`}
        >
          {isSubmitted ? <CheckCircle2 size={18}/> : <BarChart3 size={18}/>}
          {isSubmitted ? 'Record Locked' : 'Finalize & Close Report'}
        </button>
      </footer>
    </div>
  );
}
