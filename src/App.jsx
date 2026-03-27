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
  ShieldCheck,
  AlertCircle,
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
  appId: "1:480863076081:web:dd01f7270a7cd158f93350"
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
  
  // Data State
  const [revenueData, setRevenueData] = useState({});
  const [expenses, setExpenses] = useState([]);
  const [manualStartingBalance, setManualStartingBalance] = useState(0);
  const [isSubmitted, setIsSubmitted] = useState(false);
  
  // UI Status
  const [isSyncing, setIsSyncing] = useState(false);
  const [logs, setLogs] = useState([]);
  const [permissionError, setPermissionError] = useState(false);

  const addLog = (msg) => setLogs(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 10));

  // --- 1. AUTHENTICATION (MANDATORY RULE 3) ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
          addLog("AUTH: Secure Token");
        } else {
          await signInAnonymously(auth);
          addLog("AUTH: Anonymous Session");
        }
      } catch (err) {
        addLog("AUTH ERR: " + err.code);
      } finally {
        setAuthReady(true);
      }
    };
    const unsubscribe = onAuthStateChanged(auth, setUser);
    initAuth();
    return () => unsubscribe();
  }, []);

  // --- 2. DATA LISTENER (MANDATORY RULE 1 & 2) ---
  useEffect(() => {
    // Only query if user is authed and logged into the portal UI
    if (!user || !isAuthenticated) return;

    // MANDATORY RESET: Clear local state before fetching new date/mode data
    setIsSyncing(true);
    setRevenueData({});
    setExpenses([]);
    setManualStartingBalance(0);
    setIsSubmitted(false);
    setPermissionError(false);
    
    const sanitizedMode = viewMode.replace(/\s+/g, '_').toLowerCase();
    const docId = `finance_${selectedSheetDate}_${sanitizedMode}`;
    
    // RULE 1: STRICT PATH REQUIRED 
    // Format: /artifacts/{appId}/public/data/{docId}
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', docId);
    
    addLog(`SYNC: Linking to ${docId}...`);

    const unsubscribe = onSnapshot(docRef, 
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setRevenueData(data.revenue || {});
          setExpenses(data.expenses || []);
          setManualStartingBalance(data.startingBalance || 0);
          setIsSubmitted(data.status === 'submitted');
          addLog("SYNC: Records Found");
        } else {
          addLog("SYNC: Clean Ledger Created");
        }
        setIsSyncing(false);
      }, 
      (err) => {
        setIsSyncing(false);
        if (err.code === 'permission-denied') {
          setPermissionError(true);
          addLog("PERMISSION DENIED: Check Rule 1 Path");
        } else {
          addLog(`ERR: ${err.message}`);
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

  // --- 3. SAVE HANDLER ---
  const handleSave = async (updates) => {
    if (!user || !isAuthenticated || isSubmitted) return;
    
    const sanitizedMode = viewMode.replace(/\s+/g, '_').toLowerCase();
    const docId = `finance_${selectedSheetDate}_${sanitizedMode}`;
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', docId);
    
    try {
      await setDoc(docRef, { 
        ...updates, 
        lastUpdated: new Date().toISOString(),
        updatedBy: user.uid 
      }, { merge: true });
    } catch (e) {
      addLog(`SAVE ERR: ${e.code}`);
    }
  };

  if (!authReady) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <Loader2 className="animate-spin text-indigo-400" size={40}/>
    </div>
  );

  if (!isAuthenticated) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-[2.5rem] p-10 shadow-2xl">
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-indigo-600 rounded-2xl flex items-center justify-center text-white mx-auto mb-4"><Lock size={24}/></div>
          <h1 className="text-xl font-black uppercase tracking-tight text-slate-900">Voices South Portal</h1>
          <p className="text-[10px] font-bold text-indigo-500 uppercase tracking-widest mt-1">Authorized Entry Required</p>
        </div>
        <form onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.target);
          if (d.get('id') === ADMIN_CREDENTIALS.loginId && d.get('pw') === ADMIN_CREDENTIALS.password) {
            setIsAuthenticated(true);
            addLog("UI: Portal Unlocked");
          } else {
            addLog("UI: Access Denied");
          }
        }} className="space-y-3">
          <input name="id" type="text" placeholder="Admin ID" required className="w-full px-5 py-4 bg-slate-100 rounded-xl outline-none font-bold text-slate-900 focus:ring-2 ring-indigo-500/20" />
          <input name="pw" type="password" placeholder="Passkey" required className="w-full px-5 py-4 bg-slate-100 rounded-xl outline-none font-bold text-slate-900 focus:ring-2 ring-indigo-500/20" />
          <button type="submit" className="w-full bg-slate-900 text-white py-4 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-600 transition-all mt-4">Login</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#f8fafc] pb-32 font-sans">
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
             <div className="hidden sm:flex flex-col items-end mr-4">
                <span className={`flex items-center gap-1.5 text-[10px] font-black uppercase ${isSyncing ? 'text-amber-500' : 'text-emerald-500'}`}>
                  {isSyncing ? <Loader2 size={10} className="animate-spin"/> : <div className="w-1.5 h-1.5 rounded-full bg-emerald-500"/>}
                  {isSyncing ? 'Synchronizing' : 'Database Connected'}
                </span>
             </div>
             <button onClick={() => window.location.reload()} className="w-10 h-10 bg-slate-50 text-slate-400 hover:text-indigo-600 flex items-center justify-center rounded-xl transition-colors"><RefreshCw size={18}/></button>
             <button onClick={() => setIsAuthenticated(false)} className="w-10 h-10 bg-slate-50 text-slate-300 hover:text-rose-500 flex items-center justify-center rounded-xl transition-colors"><XCircle size={18}/></button>
          </div>
        </div>
      </nav>

      {permissionError && (
        <div className="max-w-6xl mx-auto mt-6 px-6">
          <div className="bg-rose-50 border border-rose-200 p-4 rounded-2xl flex items-center gap-4 text-rose-600 shadow-lg shadow-rose-100">
            <AlertCircle size={20}/>
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider">Storage Protocol Error</p>
              <p className="text-[9px] font-bold uppercase opacity-80">Path forbidden by Firebase Rules. Contact Developer.</p>
            </div>
          </div>
        </div>
      )}

      <header className="max-w-6xl mx-auto mt-8 px-6 flex flex-col lg:flex-row gap-6">
        <div className="flex-1 bg-white p-6 rounded-[2.5rem] border border-slate-200 shadow-sm flex items-center justify-between">
          <button onClick={() => {
            const [m, d, y] = selectedSheetDate.split('-').map(Number);
            const date = new Date(2000 + y, m - 1, d);
            date.setDate(date.getDate() - 7);
            setSelectedSheetDate(formatDate(date));
          }} className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 hover:text-indigo-600 transition-all"><ChevronLeft size={24}/></button>
          <div className="text-center">
            <p className="text-[10px] font-black text-indigo-500 uppercase tracking-widest mb-1">{viewMode}</p>
            <h2 className="text-4xl font-black text-slate-900 tracking-tighter">{selectedSheetDate}</h2>
          </div>
          <button onClick={() => {
            const [m, d, y] = selectedSheetDate.split('-').map(Number);
            const date = new Date(2000 + y, m - 1, d);
            date.setDate(date.getDate() + 7);
            setSelectedSheetDate(formatDate(date));
          }} className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 hover:text-indigo-600 transition-all"><ChevronRight size={24}/></button>
        </div>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="bg-white px-8 py-6 rounded-[2.5rem] border border-slate-200 text-center flex-1">
             <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-1">Total Cash In</p>
             <p className="text-xl font-black text-emerald-600">${totals.rev.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
          </div>
          <div className="bg-slate-900 px-10 py-6 rounded-[2.5rem] text-center text-white flex-1 shadow-xl">
             <p className="text-[9px] font-black uppercase text-indigo-300 tracking-widest mb-1">Ending Balance</p>
             <p className="text-xl font-black text-white">${totals.end.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto mt-8 px-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Income Card */}
        <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm relative overflow-hidden">
          {isSyncing && <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-10 flex items-center justify-center"><Loader2 className="animate-spin text-indigo-500" size={32}/></div>}
          <div className="flex items-center gap-4 mb-8">
            <div className="w-10 h-10 bg-emerald-50 text-emerald-600 rounded-2xl flex items-center justify-center shadow-sm"><TrendingUp size={20}/></div>
            <h3 className="font-black text-sm uppercase tracking-widest text-slate-800">Revenue Log</h3>
          </div>
          
          <div className="mb-8 p-6 bg-slate-50 rounded-3xl border border-slate-100 flex items-center justify-between">
            <span className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Carry Over</span>
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
              <div key={cat} className="flex items-center gap-4 group">
                <span className="flex-1 text-[11px] font-black text-slate-500 uppercase tracking-tight">{cat}</span>
                <div className="relative w-40">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 font-bold">$</span>
                  <input type="number" value={revenueData[cat] || ''} disabled={isSubmitted}
                    onChange={(e) => {
                      const updated = { ...revenueData, [cat]: e.target.value };
                      setRevenueData(updated);
                      handleSave({ revenue: updated });
                    }} className="w-full pl-8 pr-4 py-3 bg-slate-50 rounded-2xl font-black text-right text-slate-700 outline-none border border-transparent focus:border-indigo-500 transition-all" placeholder="0.00" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Expenses Card */}
        <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm flex flex-col min-h-[600px] relative overflow-hidden">
          {isSyncing && <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] z-10" />}
          <div className="flex items-center gap-4 mb-8">
            <div className="w-10 h-10 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center shadow-sm"><Wallet size={20}/></div>
            <h3 className="font-black text-sm uppercase tracking-widest text-slate-800">Outflow Log</h3>
          </div>

          <div className="flex-1 space-y-3 mb-8 overflow-y-auto max-h-[450px] pr-2 custom-scrollbar">
            {expenses.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center opacity-30 py-24 text-center">
                <Database size={32} className="text-slate-400 mb-4"/>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">No Expenses Recorded</p>
              </div>
            ) : (
              expenses.map((exp, idx) => (
                <div key={idx} className="bg-slate-50 p-5 rounded-2xl flex justify-between items-center group border border-slate-100 hover:bg-white transition-all">
                  <div className="text-left">
                    <p className="font-black text-slate-900 text-[10px] uppercase tracking-tighter">{exp.category}</p>
                    <p className="text-[8px] font-bold text-slate-300 uppercase">{exp.date}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <p className="font-black text-rose-600 text-sm">-${parseFloat(exp.amount).toFixed(2)}</p>
                    {!isSubmitted && (
                      <button onClick={() => {
                        const updated = expenses.filter((_, i) => i !== idx);
                        setExpenses(updated);
                        handleSave({ expenses: updated });
                      }} className="text-slate-200 hover:text-rose-500 opacity-0 group-hover:opacity-100"><XCircle size={16}/></button>
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
                <select name="c" className="flex-1 py-4 px-5 bg-slate-800 text-white rounded-2xl text-[10px] font-black uppercase outline-none focus:ring-2 ring-indigo-500">
                  {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
                <div className="relative w-32">
                  <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500 font-black">$</span>
                  <input name="a" type="number" step="0.01" required placeholder="0.00" className="w-full py-4 pl-8 pr-4 bg-slate-800 text-white rounded-2xl text-xs font-black outline-none focus:ring-2 ring-indigo-500" />
                </div>
                <button type="submit" className="bg-indigo-600 text-white w-14 h-14 rounded-2xl flex items-center justify-center hover:bg-indigo-500 active:scale-90 transition-all shadow-lg"><Plus size={24}/></button>
              </div>
            </form>
          )}
        </div>
      </main>

      {/* Audit Log */}
      <div className="max-w-6xl mx-auto mt-12 px-6">
        <div className="bg-white/50 backdrop-blur rounded-[2rem] p-6 border border-slate-200 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <div className="flex items-center gap-3 text-slate-400">
            <ShieldCheck size={14} className="text-emerald-500"/>
            <span className="text-[9px] font-black uppercase tracking-widest">Live Cloud Stream</span>
          </div>
          {logs.map((log, i) => (
            <div key={i} className={`flex items-center gap-2 text-[9px] font-black uppercase ${log.includes('DENIED') ? 'text-rose-500' : 'text-slate-400'}`}>
              <span className="opacity-30">[{log.split(']')[0].replace('[','')}]</span>
              <span className="truncate">{log.split(']')[1]}</span>
            </div>
          ))}
        </div>
      </div>

      <footer className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-sm px-6 z-50">
        <button 
          onClick={() => { if(window.confirm("Lock this report for audit?")) handleSave({ status: 'submitted' }); }}
          disabled={isSubmitted || isSyncing}
          className={`w-full py-5 rounded-[2.5rem] font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3 shadow-2xl transition-all ${isSubmitted ? 'bg-slate-200 text-slate-400' : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95'}`}
        >
          {isSubmitted ? <CheckCircle2 size={18}/> : <BarChart3 size={18}/>}
          {isSubmitted ? 'Report Sealed' : 'Submit Final Ledger'}
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
