import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  onSnapshot,
  enableNetwork,
  disableNetwork
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
      apiKey: "AIzaSyDb6oFZEStklFT_Dt2riDbQC_IJPHcT304",
  authDomain: "church-finance-dashboard-40dca.firebaseapp.com",
  projectId: "church-finance-dashboard-40dca",
  storageBucket: "church-finance-dashboard-40dca.firebasestorage.app",
  messagingSenderId: "480863076081",
  appId: "1:480863076081:web:dd01f7270a7cd158f93350"
    };

// Initialize Singleton
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'church-finance-dashboard-40dca';

// --- DATA HELPERS ---
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

  // --- AUTH INITIALIZATION ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
          addLog("Secure Token Connected");
        } else {
          await signInAnonymously(auth);
          addLog("Anon Session Connected");
        }
      } catch (err) {
        setErrorState(`Auth Failure: ${err.message}`);
      } finally {
        setAuthReady(true);
      }
    };
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
    });
    initAuth();
    return () => unsubscribe();
  }, [addLog]);

  // --- DATA LISTENER ---
  useEffect(() => {
    if (!user || !isAuthenticated) return;

    setIsSyncing(true);
    const sanitizedMode = viewMode.replace(/\s+/g, '_').toLowerCase();
    const docId = `finance_${selectedSheetDate}_${sanitizedMode}`;
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', docId);
    
    addLog(`Linking ${docId}...`);

    const unsubscribe = onSnapshot(docRef, 
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setRevenueData(data.revenue || {});
          setExpenses(data.expenses || []);
          setManualStartingBalance(data.startingBalance || 0);
          setIsSubmitted(data.status === 'submitted');
          addLog("Records Updated");
        } else {
          setRevenueData({});
          setExpenses([]);
          setManualStartingBalance(0);
          setIsSubmitted(false);
          addLog("New Ledger Created");
        }
        setIsSyncing(false);
      }, 
      (err) => {
        setIsSyncing(false);
        addLog(`DB Error: ${err.code}`);
        if (err.code === 'permission-denied') {
          setErrorState("Permission Denied: Check Firebase Rules & Paths");
        }
      }
    );

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

  // --- VIEW RENDERING ---

  if (errorState) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-8 text-center">
      <div className="bg-rose-500/10 p-6 rounded-3xl border border-rose-500/20 max-w-md">
        <AlertCircle className="text-rose-500 mx-auto mb-4" size={48} />
        <h2 className="text-white font-black uppercase tracking-tighter text-xl mb-2">System Error</h2>
        <p className="text-rose-200/60 text-sm font-medium leading-relaxed">{errorState}</p>
        <button onClick={() => window.location.reload()} className="mt-6 w-full py-3 bg-white text-slate-900 rounded-xl font-black uppercase text-xs tracking-widest">Restart Application</button>
      </div>
    </div>
  );

  if (!authReady) return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center">
      <Loader2 className="animate-spin text-indigo-500 mb-4" size={40}/>
      <p className="text-slate-500 font-black text-[10px] uppercase tracking-[0.3em]">Establishing Secure Link</p>
    </div>
  );

  if (!isAuthenticated) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-[2.5rem] p-10 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 left-0 w-full h-2 bg-indigo-600" />
        <div className="text-center mb-10">
          <div className="w-16 h-16 bg-slate-950 rounded-2xl flex items-center justify-center text-white mx-auto mb-6 shadow-xl shadow-indigo-500/10">
            <Lock size={24} className="text-indigo-400" />
          </div>
          <h1 className="text-2xl font-black uppercase tracking-tighter text-slate-900">Voices South Portal</h1>
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-2">Security Clearance Required</p>
        </div>
        <form onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.target);
          if (d.get('id') === ADMIN_CREDENTIALS.loginId && d.get('pw') === ADMIN_CREDENTIALS.password) {
            setIsAuthenticated(true);
          } else {
            addLog("Auth Rejected");
          }
        }} className="space-y-4">
          <div className="space-y-1">
             <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Admin Identity</label>
             <input name="id" type="text" placeholder="Username" required className="w-full px-5 py-4 bg-slate-50 rounded-xl outline-none font-bold text-slate-900 focus:ring-2 ring-indigo-500/20 border border-slate-100" />
          </div>
          <div className="space-y-1">
             <label className="text-[9px] font-black uppercase text-slate-400 ml-1">Security Key</label>
             <input name="pw" type="password" placeholder="••••••••" required className="w-full px-5 py-4 bg-slate-50 rounded-xl outline-none font-bold text-slate-900 focus:ring-2 ring-indigo-500/20 border border-slate-100" />
          </div>
          <button type="submit" className="w-full bg-slate-950 text-white py-4 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-600 transition-all mt-6 shadow-lg shadow-indigo-500/10">Authorize Session</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#fcfdfe] pb-40 font-sans">
      <nav className="bg-white border-b border-slate-100 sticky top-0 z-40 px-6 py-4">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div className="flex bg-slate-50 p-1 rounded-2xl border border-slate-100">
            {['Sun', 'Tue', 'End of Week', 'End of Month'].map(m => (
              <button key={m} onClick={() => setViewMode(m)} className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all ${viewMode === m ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                {m}
              </button>
            ))}
          </div>
          <div className="flex gap-3 items-center">
             <div className="hidden md:flex flex-col items-end mr-4">
                <span className={`flex items-center gap-1.5 text-[9px] font-black uppercase ${isSyncing ? 'text-amber-500' : 'text-emerald-500'}`}>
                  {isSyncing ? <Loader2 size={10} className="animate-spin"/> : <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"/>}
                  {isSyncing ? 'Syncing...' : 'Encrypted Link Active'}
                </span>
             </div>
             <button onClick={() => window.location.reload()} title="Force Sync" className="w-10 h-10 bg-slate-50 text-slate-400 hover:text-indigo-600 flex items-center justify-center rounded-xl border border-slate-100 transition-colors"><RefreshCw size={18}/></button>
             <button onClick={() => setIsAuthenticated(false)} title="Logout" className="w-10 h-10 bg-slate-50 text-slate-400 hover:text-rose-500 flex items-center justify-center rounded-xl border border-slate-100 transition-colors"><LogOut size={18}/></button>
          </div>
        </div>
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

        <div className="bg-slate-900 px-8 py-6 rounded-[2.5rem] text-center text-white flex flex-col justify-center shadow-xl shadow-slate-900/10">
             <p className="text-[9px] font-black uppercase text-indigo-400 tracking-widest mb-1">Projected Balance</p>
             <p className="text-3xl font-black text-white tracking-tight">${totals.end.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto mt-8 px-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Income Card */}
        <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm relative overflow-hidden group">
          <div className="flex items-center gap-4 mb-10">
            <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shadow-sm border border-emerald-100"><TrendingUp size={22}/></div>
            <div>
              <h3 className="font-black text-sm uppercase tracking-widest text-slate-800">Income Ledger</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Total In: ${totals.rev.toFixed(2)}</p>
            </div>
          </div>
          
          <div className="mb-10 p-6 bg-slate-50 rounded-3xl border border-slate-100 flex items-center justify-between">
            <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">Bank Carry Over</span>
            <div className="flex items-center gap-2 font-black text-slate-900 text-lg">
              <span className="text-slate-300">$</span>
              <input type="number" value={manualStartingBalance || ''} disabled={isSubmitted}
                onChange={(e) => {
                  const v = parseFloat(e.target.value) || 0;
                  setManualStartingBalance(v);
                  handleSave({ startingBalance: v });
                }} className="bg-transparent outline-none w-32 text-right border-b-2 border-transparent focus:border-indigo-500 transition-all" placeholder="0.00" />
            </div>
          </div>

          <div className="space-y-4">
            {REVENUE_CATEGORIES.map(cat => (
              <div key={cat} className="flex items-center gap-4 group/row">
                <span className="flex-1 text-[11px] font-black text-slate-500 uppercase tracking-tight group-hover/row:text-slate-900 transition-colors">{cat}</span>
                <div className="relative w-44">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 font-bold">$</span>
                  <input type="number" value={revenueData[cat] || ''} disabled={isSubmitted}
                    onChange={(e) => {
                      const updated = { ...revenueData, [cat]: e.target.value };
                      setRevenueData(updated);
                      handleSave({ revenue: updated });
                    }} className="w-full pl-8 pr-4 py-3.5 bg-slate-50 rounded-2xl font-black text-right text-slate-700 outline-none border border-transparent focus:border-indigo-500 focus:bg-white transition-all" placeholder="0.00" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Expenses Card */}
        <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm flex flex-col min-h-[600px] relative overflow-hidden">
          <div className="flex items-center gap-4 mb-10">
            <div className="w-12 h-12 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center shadow-sm border border-rose-100"><Wallet size={22}/></div>
            <div>
              <h3 className="font-black text-sm uppercase tracking-widest text-slate-800">Expenditures</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-tighter">Total Out: ${totals.exp.toFixed(2)}</p>
            </div>
          </div>

          <div className="flex-1 space-y-3 mb-10 overflow-y-auto max-h-[500px] pr-2 custom-scrollbar">
            {expenses.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center opacity-30 py-32 text-center">
                <Database size={32} className="text-slate-300 mb-4"/>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 leading-relaxed">No data detected for this<br/>period and filter.</p>
              </div>
            ) : (
              expenses.map((exp, idx) => (
                <div key={idx} className="bg-slate-50 p-5 rounded-2xl flex justify-between items-center group border border-slate-100 hover:bg-white hover:shadow-lg hover:shadow-slate-100 transition-all">
                  <div className="text-left">
                    <p className="font-black text-slate-900 text-[10px] uppercase tracking-tighter">{exp.category}</p>
                    <p className="text-[8px] font-bold text-slate-300 uppercase mt-0.5">{exp.date}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <p className="font-black text-rose-600 text-sm">-${parseFloat(exp.amount).toFixed(2)}</p>
                    {!isSubmitted && (
                      <button onClick={() => {
                        const updated = expenses.filter((_, i) => i !== idx);
                        setExpenses(updated);
                        handleSave({ expenses: updated });
                      }} className="text-slate-200 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all"><XCircle size={16}/></button>
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
            }} className="p-6 bg-slate-950 rounded-[2.5rem] space-y-4 shadow-2xl">
              <div className="flex gap-4">
                <select name="c" className="flex-1 py-4 px-5 bg-slate-800 text-white rounded-2xl text-[10px] font-black uppercase outline-none focus:ring-2 ring-indigo-500 appearance-none">
                  {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
                <div className="relative w-36">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-black">$</span>
                  <input name="a" type="number" step="0.01" required placeholder="0.00" className="w-full py-4 pl-8 pr-4 bg-slate-800 text-white rounded-2xl text-xs font-black outline-none focus:ring-2 ring-indigo-500" />
                </div>
                <button type="submit" className="bg-indigo-600 text-white w-14 h-14 rounded-2xl flex items-center justify-center hover:bg-indigo-500 active:scale-90 transition-all shadow-lg"><Plus size={24}/></button>
              </div>
            </form>
          )}
        </div>
      </main>

      <div className="max-w-7xl mx-auto mt-12 px-6">
        <div className="bg-white rounded-3xl p-6 border border-slate-200 flex flex-wrap gap-6 items-center">
          <div className="flex items-center gap-2 pr-6 border-r border-slate-100">
            <ShieldCheck size={14} className="text-emerald-500"/>
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-900">Security: Tier 1 Encryption</span>
          </div>
          {statusLogs.map((log, i) => (
            <div key={i} className={`text-[9px] font-black uppercase flex items-center gap-2 ${log.includes('Error') ? 'text-rose-500' : 'text-slate-400'}`}>
              <div className="w-1 h-1 rounded-full bg-current opacity-30" />
              {log}
            </div>
          ))}
        </div>
      </div>

      <footer className="fixed bottom-10 left-1/2 -translate-x-1/2 w-full max-w-sm px-6 z-50">
        <button 
          onClick={() => { if(window.confirm("Verify: Seals report for audit. Action cannot be undone.")) handleSave({ status: 'submitted' }); }}
          disabled={isSubmitted || isSyncing}
          className={`w-full py-6 rounded-[2.5rem] font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3 shadow-2xl transition-all ${isSubmitted ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-slate-950 text-white hover:bg-indigo-600 active:scale-95'}`}
        >
          {isSubmitted ? <CheckCircle2 size={18}/> : <BarChart3 size={18}/>}
          {isSubmitted ? 'Ledger Sealed' : 'Submit Final Audit'}
        </button>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
      `}} />
    </div>
  );
}
