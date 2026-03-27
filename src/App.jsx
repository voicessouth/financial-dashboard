import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  onSnapshot,
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
  Loader2,
  RefreshCw,
  Zap,
  ShieldCheck,
  History
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
  const [permissionError, setPermissionError] = useState(false);

  const addLog = (msg) => setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 15));

  // 1. AUTHENTICATION (RULE 3)
  useEffect(() => {
    const initAuth = async () => {
      try {
        setAuthReady(false);
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
          addLog("AUTH: Secure Token Accepted");
        } else {
          await signInAnonymously(auth);
          addLog("AUTH: Anonymous Session Ready");
        }
      } catch (err) {
        addLog("AUTH ERR: " + err.code);
      } finally {
        setAuthReady(true);
      }
    };
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) addLog(`User: ${u.uid.slice(0,8)}...`);
    });
    initAuth();
    return () => unsubscribe();
  }, []);

  // 2. DATA LISTENER (RULE 1: Corrected Path Structure)
  useEffect(() => {
    if (!user || !isAuthenticated) return;

    setIsSyncing(true);
    setPermissionError(false);
    
    const sanitizedMode = viewMode.replace(/\s+/g, '_').toLowerCase();
    // Unique ID combining Date and Mode to prevent overlap
    const docId = `finance_${selectedSheetDate}_${sanitizedMode}`;
    
    // MANDATORY PATH: /artifacts/{appId}/public/data/data/{docId}
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'data', docId);
    
    addLog(`FETCH: Requesting ${docId}...`);

    const unsubscribe = onSnapshot(docRef, 
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setRevenueData(data.revenue || {});
          setExpenses(data.expenses || []);
          setManualStartingBalance(data.startingBalance || 0);
          setIsSubmitted(data.status === 'submitted');
          addLog(`SUCCESS: ${docId} synchronized`);
        } else {
          setRevenueData({});
          setExpenses([]);
          setManualStartingBalance(0);
          setIsSubmitted(false);
          addLog(`NEW: Ready for ${docId}`);
        }
        setIsSyncing(false);
      }, 
      (err) => {
        setIsSyncing(false);
        if (err.code === 'permission-denied') {
          setPermissionError(true);
          addLog("CRITICAL: Permission Denied at Path");
        } else {
          addLog("ERROR: " + err.message);
        }
      }
    );

    return () => unsubscribe();
  }, [user, isAuthenticated, selectedSheetDate, viewMode]);

  const totals = useMemo(() => {
    const rev = Object.values(revenueData).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
    const exp = expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    const start = parseFloat(manualStartingBalance) || 0;
    return { rev, exp, start, end: start + (rev - exp) };
  }, [revenueData, expenses, manualStartingBalance]);

  // SAVE HANDLER
  const handleSave = async (updates) => {
    if (!user || !isAuthenticated || isSubmitted) return;
    
    const sanitizedMode = viewMode.replace(/\s+/g, '_').toLowerCase();
    const docId = `finance_${selectedSheetDate}_${sanitizedMode}`;
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'data', docId);
    
    try {
      await setDoc(docRef, { 
        ...updates, 
        lastUpdated: new Date().toISOString(),
        updatedBy: user.uid 
      }, { merge: true });
      addLog("SAVE: Ledger Updated");
    } catch (e) {
      addLog(`SAVE ERR: ${e.code}`);
      if (e.code === 'permission-denied') setPermissionError(true);
    }
  };

  const forceRepair = async () => {
    addLog("REPAIR: Forcing Re-Authentication...");
    try {
      await auth.signOut();
      window.location.reload(); 
    } catch (e) {
      addLog("REPAIR FAIL: " + e.code);
    }
  };

  if (!authReady) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <div className="text-center">
        <Loader2 className="animate-spin text-indigo-400 mb-4 mx-auto" size={40}/>
        <p className="text-indigo-300 font-black text-[10px] uppercase tracking-widest animate-pulse">Establishing Secure Link...</p>
      </div>
    </div>
  );

  if (!isAuthenticated) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-[2.5rem] p-10 shadow-2xl">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white mx-auto mb-4 shadow-lg shadow-indigo-200"><Lock size={24}/></div>
          <h1 className="text-xl font-black uppercase tracking-tight text-slate-900">Financial Portal</h1>
          <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mt-1">Voices South Official Admin</p>
        </div>
        <form onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.target);
          if (d.get('id') === ADMIN_CREDENTIALS.loginId && d.get('pw') === ADMIN_CREDENTIALS.password) {
            setIsAuthenticated(true);
            addLog("UI: User Authenticated");
          } else {
            addLog("UI: Invalid Credentials");
          }
        }} className="space-y-3">
          <input name="id" type="text" placeholder="Admin ID" required className="w-full px-5 py-4 bg-slate-100 rounded-xl outline-none font-bold text-slate-900 focus:ring-2 ring-indigo-500/20" />
          <input name="pw" type="password" placeholder="Passkey" required className="w-full px-5 py-4 bg-slate-100 rounded-xl outline-none font-bold text-slate-900 focus:ring-2 ring-indigo-500/20" />
          <button type="submit" className="w-full bg-slate-900 text-white py-4 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-600 transition-all mt-4 active:scale-95 shadow-lg">Open Vault</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f1f5f9] pb-32">
      {/* Top Header Bar */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-40 px-6 py-4 shadow-sm">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex bg-slate-100 p-1.5 rounded-2xl">
            {['Sun', 'Tue', 'End of Week', 'End of Month'].map(m => (
              <button key={m} onClick={() => setViewMode(m)} className={`px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all ${viewMode === m ? 'bg-white text-indigo-600 shadow-md scale-105' : 'text-slate-400 hover:text-slate-600'}`}>
                {m}
              </button>
            ))}
          </div>
          <div className="flex gap-4 items-center">
             <div className="flex flex-col items-end">
                <span className="text-[9px] font-black text-slate-400 uppercase tracking-tighter">Database Status</span>
                <span className="flex items-center gap-1.5 text-[10px] font-black text-emerald-500 uppercase">
                  <span className={`w-1.5 h-1.5 rounded-full ${isSyncing ? 'bg-amber-400' : 'bg-emerald-500'}`}></span>
                  {isSyncing ? 'Syncing...' : 'Connected'}
                </span>
             </div>
             <button onClick={() => setIsAuthenticated(false)} className="w-10 h-10 bg-slate-50 text-slate-300 hover:text-rose-500 flex items-center justify-center rounded-xl transition-colors"><XCircle size={20}/></button>
          </div>
        </div>
      </nav>

      {permissionError && (
        <div className="max-w-6xl mx-auto mt-6 px-6">
          <div className="bg-rose-600 border border-rose-700 p-5 rounded-[2rem] flex items-center justify-between shadow-xl shadow-rose-200 animate-in fade-in slide-in-from-top-4 duration-500">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 bg-rose-500 rounded-2xl flex items-center justify-center shadow-inner"><Zap className="text-white" size={20}/></div>
              <div>
                <p className="text-xs font-black text-white uppercase tracking-wider">Access Connection Severed</p>
                <p className="text-[10px] text-rose-100 font-bold uppercase tracking-widest opacity-80">Security protocol triggered. A manual handshake is required.</p>
              </div>
            </div>
            <button onClick={forceRepair} className="bg-white text-rose-600 px-8 py-3 rounded-2xl text-[11px] font-black uppercase tracking-widest hover:bg-rose-50 transition-all active:scale-95 shadow-lg">Repair Connection</button>
          </div>
        </div>
      )}

      {/* Date & Totals Section */}
      <header className="max-w-6xl mx-auto mt-8 px-6 flex flex-col lg:flex-row gap-8 items-stretch lg:items-center">
        <div className="flex-1 bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm flex items-center justify-between">
          <button onClick={() => {
            const [m, d, y] = selectedSheetDate.split('-').map(Number);
            const date = new Date(2000 + y, m - 1, d);
            date.setDate(date.getDate() - 7);
            setSelectedSheetDate(formatDate(date));
          }} className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 hover:text-indigo-600 transition-all active:scale-90"><ChevronLeft size={24}/></button>
          
          <div className="text-center">
            <p className="text-[11px] font-black text-indigo-500 uppercase tracking-[0.2em] mb-1">{viewMode} Report</p>
            <h2 className="text-4xl font-black text-slate-900 tracking-tighter">{selectedSheetDate}</h2>
          </div>

          <button onClick={() => {
            const [m, d, y] = selectedSheetDate.split('-').map(Number);
            const date = new Date(2000 + y, m - 1, d);
            date.setDate(date.getDate() + 7);
            setSelectedSheetDate(formatDate(date));
          }} className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 hover:text-indigo-600 transition-all active:scale-90"><ChevronRight size={24}/></button>
        </div>

        <div className="grid grid-cols-2 gap-4 w-full lg:w-auto">
          <div className="bg-white px-10 py-7 rounded-[2.5rem] border border-slate-200 text-center shadow-sm">
             <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.15em] mb-2">Total Income</p>
             <p className="text-2xl font-black text-emerald-600">${totals.rev.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
          </div>
          <div className="bg-slate-900 px-10 py-7 rounded-[2.5rem] text-center text-white shadow-2xl shadow-slate-200">
             <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.15em] mb-2">Final Balance</p>
             <p className="text-2xl font-black text-white">${totals.end.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <main className="max-w-6xl mx-auto mt-8 px-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Revenue Section */}
        <section className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shadow-sm"><TrendingUp size={20}/></div>
              <h3 className="font-black text-sm uppercase tracking-widest text-slate-800">Revenue Entries</h3>
            </div>
            <div className="bg-emerald-50 text-emerald-700 px-3 py-1 rounded-full text-[9px] font-black uppercase">Live Updates</div>
          </div>
          
          <div className="mb-8 p-6 bg-slate-50 rounded-3xl border border-slate-100 flex items-center justify-between group hover:border-indigo-200 transition-colors">
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Starting Vault Balance</span>
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

          <div className="space-y-6">
            {REVENUE_CATEGORIES.map(cat => (
              <div key={cat} className="flex items-center gap-4 group">
                <span className="flex-1 text-[11px] font-black text-slate-500 uppercase tracking-tight group-hover:text-indigo-600 transition-colors">{cat}</span>
                <div className="relative w-40">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 font-bold">$</span>
                  <input type="number" value={revenueData[cat] || ''} disabled={isSubmitted}
                    onChange={(e) => {
                      const updated = { ...revenueData, [cat]: e.target.value };
                      setRevenueData(updated);
                      handleSave({ revenue: updated });
                    }} className="w-full pl-8 pr-4 py-3 bg-slate-50 rounded-2xl font-black text-right text-slate-700 outline-none border border-transparent focus:border-indigo-500 focus:bg-white transition-all" />
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Expenses Section */}
        <section className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm flex flex-col min-h-[600px]">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center shadow-sm"><Wallet size={20}/></div>
              <h3 className="font-black text-sm uppercase tracking-widest text-slate-800">Expenditures</h3>
            </div>
            <div className="bg-rose-50 text-rose-700 px-3 py-1 rounded-full text-[9px] font-black uppercase">Real-Time Log</div>
          </div>

          <div className="flex-1 space-y-4 mb-8 overflow-y-auto max-h-[400px] pr-4 custom-scrollbar">
            {expenses.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center opacity-30 py-24 text-center">
                <div className="w-16 h-16 bg-slate-100 rounded-3xl flex items-center justify-center mb-4"><Database size={32} className="text-slate-400"/></div>
                <p className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400">No Expenses Recorded</p>
                <p className="text-[9px] font-bold text-slate-300 uppercase mt-1">Pending first entry for {selectedSheetDate}</p>
              </div>
            ) : (
              expenses.map((exp, idx) => (
                <div key={idx} className="bg-slate-50 p-5 rounded-2xl flex justify-between items-center group border border-slate-100 hover:border-rose-100 hover:bg-white transition-all">
                  <div className="text-left">
                    <p className="font-black text-slate-900 text-xs uppercase tracking-tight">{exp.category}</p>
                    <div className="flex items-center gap-2 mt-1">
                       <History size={10} className="text-slate-300"/>
                       <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{exp.date}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-5">
                    <p className="font-black text-rose-600 text-sm">-${parseFloat(exp.amount).toFixed(2)}</p>
                    {!isSubmitted && (
                      <button onClick={() => {
                        const updated = expenses.filter((_, i) => i !== idx);
                        setExpenses(updated);
                        handleSave({ expenses: updated });
                      }} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-200 hover:text-rose-500 hover:bg-rose-50 transition-all opacity-0 group-hover:opacity-100"><XCircle size={16}/></button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>

          {!isSubmitted && (
            <div className="p-1 bg-slate-100 rounded-[2.5rem]">
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
              }} className="p-6 bg-slate-900 rounded-[2.2rem] space-y-4 shadow-xl">
                <div className="relative">
                  <select name="c" className="w-full py-4 px-5 bg-slate-800 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest outline-none ring-indigo-500 focus:ring-2 appearance-none">
                    {EXPENSE_CATEGORIES.map(c => <option key={c} className="bg-slate-900">{c}</option>)}
                  </select>
                  <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-500"><ChevronRight size={14} className="rotate-90"/></div>
                </div>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-black">$</span>
                    <input name="a" type="number" step="0.01" required placeholder="Amount" className="w-full py-4 pl-8 pr-5 bg-slate-800 text-white rounded-2xl text-sm font-black outline-none ring-indigo-500 focus:ring-2" />
                  </div>
                  <button type="submit" className="bg-indigo-600 text-white w-14 h-14 rounded-2xl flex items-center justify-center hover:bg-indigo-500 shadow-lg active:scale-95 transition-all"><Plus size={24}/></button>
                </div>
              </form>
            </div>
          )}
        </section>
      </main>

      {/* Audit Log / Event Stream */}
      <div className="max-w-6xl mx-auto mt-12 px-6">
        <div className="flex items-center gap-3 mb-4">
           <ShieldCheck size={16} className="text-indigo-500"/>
           <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.25em]">Security Event Stream</h4>
        </div>
        <div className="bg-white/50 backdrop-blur rounded-[2rem] p-6 border border-slate-200 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-y-3 gap-x-6">
          {logs.map((log, i) => (
            <div key={i} className={`flex items-center gap-3 py-1 border-b border-slate-100 last:border-0 ${log.includes('CRITICAL') || log.includes('ERR') ? 'text-rose-500' : 'text-slate-500'}`}>
              <span className="text-[8px] font-black opacity-40 whitespace-nowrap">{log.split(']')[0].replace('[','')}</span>
              <span className="text-[9px] font-black uppercase tracking-tight truncate">{log.split(']')[1]}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Floating Action Bar */}
      <footer className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-lg px-6 z-50">
        <div className="bg-white/90 backdrop-blur-2xl border border-slate-200 rounded-[3rem] p-4 shadow-2xl flex items-center gap-4">
          <button 
            onClick={() => { if(window.confirm("Verify and Lock this report? This action cannot be undone.")) handleSave({ status: 'submitted' }); }}
            disabled={isSubmitted}
            className={`flex-1 py-5 rounded-[2.2rem] font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all ${isSubmitted ? 'bg-slate-100 text-slate-400' : 'bg-slate-900 text-white hover:bg-indigo-600 shadow-xl shadow-indigo-100 active:scale-95'}`}
          >
            {isSubmitted ? <CheckCircle2 size={18}/> : <BarChart3 size={18}/>}
            {isSubmitted ? 'Report Verified' : 'Seal Weekly Ledger'}
          </button>
        </div>
      </footer>

      <style dangerouslySetInnerHTML={{ __html: `
        .no-scrollbar::-webkit-scrollbar { display: none; }
        .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
      `}} />
    </div>
  );
}
