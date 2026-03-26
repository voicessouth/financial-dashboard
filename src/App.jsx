import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  onSnapshot,
  getDoc
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
  RefreshCw,
  Search,
  Lock,
  Calendar,
  BarChart3,
  CheckCircle2,
  XCircle,
  Clock,
  History,
  AlertCircle,
  PlusCircle,
  Loader2,
  Database
} from 'lucide-react';

// --- FIREBASE INITIALIZATION ---
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

// --- HELPERS ---
const formatDate = (date) => {
  return `${date.getMonth() + 1}-${date.getDate()}-${date.getFullYear().toString().slice(-2)}`;
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
  const [loginError, setLoginError] = useState('');
  
  const [selectedSheetDate, setSelectedSheetDate] = useState(getReportingFriday(new Date()));
  const [viewMode, setViewMode] = useState('Sun'); 
  
  const [revenueData, setRevenueData] = useState({});
  const [expenses, setExpenses] = useState([]);
  const [manualStartingBalance, setManualStartingBalance] = useState(0);
  const [isSubmitted, setIsSubmitted] = useState(false);
  
  const [isScanning, setIsScanning] = useState(false);
  const [foundDates, setFoundDates] = useState([]);
  const [showScanner, setShowScanner] = useState(false);
  const [debugLog, setDebugLog] = useState([]);

  const addLog = (msg) => setDebugLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 15));

  // 1. MANDATORY AUTH INITIALIZATION (RULE 3)
  useEffect(() => {
    const startSession = async () => {
      try {
        addLog("Initializing Secure Tunnel...");
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        addLog("Security Error: " + err.message);
      }
    };

    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthReady(true);
      if (u) addLog("Cloud Connection: Online");
    });

    startSession();
    return () => unsubscribe();
  }, []);

  // 2. DATA SYNCHRONIZATION (RULE 1 & 2)
  useEffect(() => {
    // Prevent fetching if not logged into both Firebase AND the UI
    if (!user || !isAuthenticated || !selectedSheetDate) return;

    const dbMode = viewMode.replace(/\s+/g, '_');
    const docId = `${selectedSheetDate}_${dbMode}`;
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'reports', docId);
    
    addLog(`Loading Record: ${docId}`);
    
    const unsubscribe = onSnapshot(docRef, 
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          setRevenueData(data.revenue || {});
          setExpenses(data.expenses || []);
          setManualStartingBalance(data.startingBalance || 0);
          setIsSubmitted(data.status === 'submitted');
          addLog(`Sync Complete: ${docId}`);
        } else {
          setRevenueData({});
          setExpenses([]);
          setManualStartingBalance(0);
          setIsSubmitted(false);
          addLog(`New Record Initialized: ${docId}`);
        }
      }, 
      (err) => {
        addLog("Database Sync Failed: Check Permissions");
        console.error(err);
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

  const handleSave = async (updates) => {
    if (!user || !isAuthenticated || isSubmitted) return;
    const dbMode = viewMode.replace(/\s+/g, '_');
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'reports', `${selectedSheetDate}_${dbMode}`);
    try {
      await setDoc(docRef, { ...updates, lastUpdated: new Date().toISOString() }, { merge: true });
    } catch (e) {
      addLog("Save Failed: Connection Interrupted");
    }
  };

  const performRecoveryScan = async () => {
    if (!user || !isAuthenticated) return;
    setIsScanning(true);
    addLog("Scanning Cloud Archive...");
    try {
      const results = [];
      const types = ['Sun', 'Tue', 'End_of_Week', 'End_of_Month'];
      for (let i = 0; i < 8; i++) {
        const d = new Date();
        d.setDate(d.getDate() - (i * 7));
        const dateStr = getReportingFriday(d);
        for (const type of types) {
          const id = `${dateStr}_${type.replace(/\s+/g, '_')}`;
          const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'reports', id));
          if (snap.exists()) {
            results.push({ id: dateStr, type: type, total: Object.values(snap.data().revenue || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0)});
          }
        }
      }
      setFoundDates(results);
      setShowScanner(true);
      addLog(`Scan found ${results.length} records`);
    } catch (e) { addLog("Archive Scan Failed"); }
    setIsScanning(false);
  };

  // --- RENDERING ---

  // Phase 1: Establish Secure Connection
  if (!authReady) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 text-white">
          <Loader2 className="animate-spin text-indigo-500 mb-6" size={48}/>
          <div className="text-center space-y-2">
            <h2 className="text-sm font-black uppercase tracking-[0.2em] text-indigo-400">Security Handshake</h2>
            <p className="text-[10px] text-slate-500 font-mono">Establishing encrypted connection to Vault...</p>
          </div>
      </div>
    );
  }

  // Phase 2: Login Guard
  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6 font-sans">
        <div className="w-full max-w-md bg-white rounded-[3rem] p-12 shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-indigo-600"></div>
          
          <div className="text-center mb-10">
              <div className="bg-slate-900 w-16 h-16 rounded-2xl flex items-center justify-center text-white mx-auto mb-6 shadow-xl"><Lock size={32}/></div>
              <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Voices South</h1>
              <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-[0.3em] mt-2">Financial Vault v2.0</p>
          </div>

          <form onSubmit={(e) => {
            e.preventDefault();
            const d = new FormData(e.target);
            if (d.get('id') === ADMIN_CREDENTIALS.loginId && d.get('pw') === ADMIN_CREDENTIALS.password) {
              addLog("Access Granted: Welcome Admin");
              setIsAuthenticated(true);
            } else { 
              setLoginError('Invalid Access Credentials'); 
              addLog("Unauthorized Access Attempt blocked");
            }
          }} className="space-y-4">
            <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase ml-2">Identity</label>
                <input name="id" type="text" placeholder="Admin ID" required className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-4 ring-indigo-500/10 font-bold text-slate-700 placeholder:text-slate-300" />
            </div>
            <div className="space-y-1">
                <label className="text-[9px] font-black text-slate-400 uppercase ml-2">Secure Key</label>
                <input name="pw" type="password" placeholder="••••••••" required className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-4 ring-indigo-500/10 font-bold text-slate-700 placeholder:text-slate-300" />
            </div>
            
            {loginError && (
              <div className="bg-rose-50 border border-rose-100 p-4 rounded-2xl flex items-center gap-3 animate-bounce">
                <AlertCircle className="text-rose-500" size={18}/>
                <p className="text-[11px] font-black text-rose-600 uppercase tracking-tight">{loginError}</p>
              </div>
            )}

            <button type="submit" className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black uppercase tracking-[0.2em] text-xs hover:bg-indigo-600 transition-all active:scale-95 shadow-xl shadow-indigo-100 mt-4">
                Verify Identity
            </button>
          </form>

          <button onClick={() => window.location.reload()} className="w-full mt-8 text-[9px] font-black text-slate-300 uppercase hover:text-indigo-400 tracking-widest transition-colors flex items-center justify-center gap-2">
            <RefreshCw size={10}/> Reset Session
          </button>
        </div>
      </div>
    );
  }

  // Phase 3: Dashboard UI
  return (
    <div className="min-h-screen bg-[#fcfdfe] pb-40 font-sans selection:bg-indigo-100">
        <nav className="bg-white/80 backdrop-blur-md border-b border-slate-100 sticky top-0 z-40 px-6 py-4">
            <div className="max-w-6xl mx-auto flex flex-wrap gap-3 items-center justify-between">
                <div className="flex gap-2 bg-slate-100 p-1 rounded-2xl">
                    {['Sun', 'Tue', 'End of Week', 'End of Month'].map((m) => (
                        <button 
                            key={m}
                            onClick={() => setViewMode(m)}
                            className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all ${viewMode === m ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                        >
                            {m}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-3">
                   <div className="text-right hidden sm:block">
                      <p className="text-[9px] font-black text-slate-400 uppercase leading-none">Database Status</p>
                      <p className="text-[10px] font-black text-emerald-500 uppercase flex items-center justify-end gap-1">
                        <Database size={10}/> Online & Syncing
                      </p>
                   </div>
                   <button onClick={() => setIsAuthenticated(false)} className="p-2 text-slate-300 hover:text-rose-500 transition-colors"><XCircle size={20}/></button>
                </div>
            </div>
        </nav>

        <header className="max-w-6xl mx-auto mt-10 mb-8 px-6 grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
            <div className="md:col-span-8 bg-white p-6 rounded-[2.5rem] shadow-sm border border-slate-100 flex items-center justify-between">
                <button onClick={() => {
                     const [m, d, y] = selectedSheetDate.split('-').map(Number);
                     const date = new Date(2000 + y, m - 1, d);
                     date.setDate(date.getDate() - 7);
                     setSelectedSheetDate(formatDate(date));
                }} className="w-12 h-12 flex items-center justify-center bg-slate-50 hover:bg-slate-100 rounded-2xl text-slate-400 transition-all active:scale-90"><ChevronLeft/></button>
                
                <div className="text-center">
                    <div className="flex items-center justify-center gap-2 mb-1">
                      <Calendar size={14} className="text-indigo-500"/>
                      <span className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.3em]">{viewMode} Report</span>
                    </div>
                    <h2 className="text-3xl font-black text-slate-900 tracking-tighter">{selectedSheetDate}</h2>
                </div>

                <button onClick={() => {
                     const [m, d, y] = selectedSheetDate.split('-').map(Number);
                     const date = new Date(2000 + y, m - 1, d);
                     date.setDate(date.getDate() + 7);
                     setSelectedSheetDate(formatDate(date));
                }} className="w-12 h-12 flex items-center justify-center bg-slate-50 hover:bg-slate-100 rounded-2xl text-slate-400 transition-all active:scale-90"><ChevronRight/></button>
            </div>
            
            <div className="md:col-span-4 h-full">
              <button onClick={performRecoveryScan} className="w-full h-full bg-slate-900 hover:bg-indigo-600 text-white p-6 rounded-[2.5rem] flex items-center justify-center gap-4 transition-all shadow-xl active:scale-95 group">
                  <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center group-hover:scale-110 transition-transform">
                    {isScanning ? <Loader2 className="animate-spin" size={20}/> : <History size={20}/>}
                  </div>
                  <div className="text-left">
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-50">Archive</p>
                    <p className="text-sm font-black uppercase tracking-tighter">Restore Record</p>
                  </div>
              </button>
            </div>
        </header>

        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
            {[
              { label: 'Starting Cash', val: totals.start, color: 'text-slate-800', isInput: true },
              { label: 'Total Inflow', val: totals.rev, color: 'text-emerald-600', isInput: false },
              { label: 'Total Outflow', val: totals.exp, color: 'text-rose-500', isInput: false },
              { label: 'Vault Balance', val: totals.end, color: 'text-white', isInput: false, isPrimary: true }
            ].map((stat, i) => (
              <div key={i} className={`${stat.isPrimary ? 'bg-indigo-600 text-white shadow-xl shadow-indigo-100' : 'bg-white border border-slate-100'} p-8 rounded-[2.5rem] relative overflow-hidden transition-all hover:translate-y-[-4px]`}>
                 <p className={`text-[10px] font-black uppercase tracking-widest mb-3 ${stat.isPrimary ? 'text-indigo-200' : 'text-slate-400'}`}>{stat.label}</p>
                 {stat.isInput ? (
                    <div className="flex items-center gap-1">
                      <span className="text-slate-300 font-bold text-xl">$</span>
                      <input 
                          type="number" 
                          value={manualStartingBalance || ''} 
                          disabled={isSubmitted} 
                          onChange={(e) => {
                              const v = parseFloat(e.target.value) || 0;
                              setManualStartingBalance(v);
                              handleSave({ startingBalance: v });
                          }} 
                          className="text-3xl font-black outline-none w-full bg-transparent text-slate-800" 
                          placeholder="0.00"
                      />
                    </div>
                 ) : (
                    <p className={`text-3xl font-black tracking-tight ${stat.color}`}>${stat.val.toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                 )}
              </div>
            ))}
        </div>

        <div className="max-w-6xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-10">
            {/* Revenue */}
            <section className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="font-black text-slate-900 uppercase text-xs tracking-[0.2em] flex items-center gap-3">
                    <div className="w-8 h-8 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600"><TrendingUp size={16}/></div>
                    Revenue Sources
                  </h3>
                  <div className="px-3 py-1 bg-emerald-50 text-emerald-600 text-[9px] font-black rounded-full uppercase">Sync Active</div>
                </div>
                
                <div className="space-y-5">
                    {REVENUE_CATEGORIES.map(cat => (
                        <div key={cat} className="group">
                            <label className="text-[10px] font-black text-slate-400 uppercase ml-2 mb-1.5 block group-focus-within:text-indigo-500 transition-colors">{cat}</label>
                            <div className="relative">
                                <span className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-300 font-bold">$</span>
                                <input 
                                    type="number" 
                                    disabled={isSubmitted}
                                    value={revenueData[cat] || ''}
                                    onChange={(e) => {
                                        const updated = { ...revenueData, [cat]: e.target.value };
                                        setRevenueData(updated);
                                        handleSave({ revenue: updated });
                                    }}
                                    className="w-full pl-10 pr-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none focus:bg-white focus:ring-4 ring-indigo-500/5 transition-all text-slate-700 placeholder:text-slate-200"
                                    placeholder="0.00"
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Expenses */}
            <section className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-100 flex flex-col min-h-[600px]">
                <div className="flex items-center justify-between mb-8">
                  <h3 className="font-black text-slate-900 uppercase text-xs tracking-[0.2em] flex items-center gap-3">
                    <div className="w-8 h-8 bg-rose-50 rounded-lg flex items-center justify-center text-rose-600"><Wallet size={16}/></div>
                    Expense Ledger
                  </h3>
                  <div className="px-3 py-1 bg-rose-50 text-rose-600 text-[9px] font-black rounded-full uppercase">Realtime</div>
                </div>

                <div className="flex-1 overflow-y-auto mb-8 space-y-4 pr-2 custom-scrollbar">
                    {expenses.length === 0 ? (
                        <div className="flex flex-col items-center justify-center py-32 opacity-20 grayscale">
                            <PlusCircle size={48} className="mb-4"/>
                            <p className="font-black uppercase text-[10px] tracking-widest">No expenses logged for this period</p>
                        </div>
                    ) : (
                        expenses.map((exp, idx) => (
                            <div key={idx} className="bg-slate-50 p-5 rounded-2xl flex justify-between items-center border border-slate-100 group hover:border-indigo-100 hover:bg-white transition-all">
                                <div className="space-y-1">
                                    <p className="font-black text-slate-800 text-sm tracking-tight">{exp.category}</p>
                                    <div className="flex items-center gap-2">
                                      <Clock size={10} className="text-slate-300"/>
                                      <p className="text-[9px] text-slate-400 font-black uppercase tracking-tight">{exp.date}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-5">
                                    <p className="font-black text-rose-500 tracking-tight text-lg">-${parseFloat(exp.amount).toLocaleString(undefined, {minimumFractionDigits: 2})}</p>
                                    {!isSubmitted && (
                                        <button onClick={() => {
                                            const updated = expenses.filter((_, i) => i !== idx);
                                            setExpenses(updated);
                                            handleSave({ expenses: updated });
                                        }} className="w-8 h-8 flex items-center justify-center text-slate-200 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-all opacity-0 group-hover:opacity-100"><XCircle size={18}/></button>
                                    )}
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {!isSubmitted && (
                    <form onSubmit={(e) => {
                        e.preventDefault();
                        const d = new FormData(e.target);
                        const amt = d.get('a');
                        if(!amt || isNaN(amt)) return;
                        const newExp = { category: d.get('c'), amount: amt, date: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) };
                        const updated = [newExp, ...expenses];
                        setExpenses(updated);
                        handleSave({ expenses: updated });
                        e.target.reset();
                    }} className="bg-slate-900 p-6 rounded-[2.5rem] space-y-4 shadow-2xl">
                        <div className="space-y-1">
                          <label className="text-[8px] font-black text-slate-500 uppercase ml-2 tracking-widest">Select Category</label>
                          <select name="c" className="w-full p-4 bg-slate-800 text-white rounded-2xl text-xs font-bold border-none outline-none focus:ring-2 ring-indigo-500 appearance-none">
                              {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                          </select>
                        </div>
                        <div className="flex gap-3">
                            <div className="flex-1 space-y-1">
                               <label className="text-[8px] font-black text-slate-500 uppercase ml-2 tracking-widest">Amount ($)</label>
                               <input name="a" type="number" step="0.01" required placeholder="0.00" className="w-full p-4 bg-slate-800 text-white rounded-2xl text-sm font-black border-none outline-none focus:ring-2 ring-indigo-500" />
                            </div>
                            <button type="submit" className="self-end bg-indigo-600 text-white w-14 h-14 rounded-2xl flex items-center justify-center hover:bg-indigo-500 active:scale-95 transition-all shadow-lg">
                                <Plus size={24}/>
                            </button>
                        </div>
                    </form>
                )}
            </section>
        </div>

        {/* Footer Audit Logs */}
        <div className="max-w-6xl mx-auto mt-12 px-6">
            <div className="bg-slate-900/5 rounded-3xl p-6 font-mono text-[9px] text-slate-500">
                <div className="flex items-center gap-2 mb-4 border-b border-slate-200 pb-2">
                  <Database size={12}/>
                  <span className="font-black uppercase tracking-widest">Cloud Transaction Log</span>
                </div>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                   {debugLog.map((log, i) => <div key={i} className="flex gap-2"><span className="opacity-30">[{i}]</span> {log}</div>)}
                </div>
            </div>
        </div>

        {/* Modal: Recovery Archive */}
        {showScanner && (
            <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-xl z-50 flex items-center justify-center p-6">
                <div className="bg-white w-full max-w-2xl rounded-[3.5rem] p-12 max-h-[85vh] flex flex-col shadow-2xl animate-in fade-in zoom-in duration-300">
                    <div className="flex justify-between items-start mb-10">
                        <div>
                            <h3 className="text-3xl font-black text-slate-900 tracking-tighter">Vault Archives</h3>
                            <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-[0.4em] mt-2">Select a historical snapshot</p>
                        </div>
                        <button onClick={() => setShowScanner(false)} className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center hover:bg-rose-50 hover:text-rose-500 transition-all active:scale-90"><XCircle size={24}/></button>
                    </div>
                    <div className="overflow-y-auto flex-1 space-y-4 pr-4 custom-scrollbar">
                        {foundDates.length === 0 ? (
                            <div className="text-center py-20 flex flex-col items-center">
                                <AlertCircle size={48} className="text-slate-100 mb-4" />
                                <p className="font-black text-slate-300 uppercase text-xs tracking-widest">No archived records found</p>
                            </div>
                        ) : foundDates.map((item, i) => (
                            <button key={i} onClick={() => { setSelectedSheetDate(item.id); setViewMode(item.type); setShowScanner(false); }} className="w-full flex items-center justify-between p-6 bg-slate-50 rounded-[2rem] hover:bg-indigo-600 hover:text-white transition-all border border-slate-100 group">
                                <div className="text-left">
                                    <p className="font-black tracking-tight text-xl">{item.id}</p>
                                    <p className="text-[9px] font-black uppercase tracking-widest opacity-60 group-hover:opacity-100">{item.type} Report</p>
                                </div>
                                <div className="text-right flex items-center gap-6">
                                    <div>
                                        <p className="text-xl font-black tracking-tight">${item.total.toLocaleString()}</p>
                                        <p className="text-[8px] font-bold uppercase tracking-widest opacity-40 group-hover:opacity-100">Revenue</p>
                                    </div>
                                    <div className="w-10 h-10 rounded-full bg-white flex items-center justify-center text-slate-300 group-hover:text-indigo-600 transition-colors">
                                      <ChevronRight size={20}/>
                                    </div>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        )}

        <footer className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-lg px-6 z-40">
            <div className="bg-white/90 backdrop-blur-2xl border border-white shadow-[0_20px_50px_-12px_rgba(0,0,0,0.15)] rounded-[3rem] p-3 flex gap-4">
                <button 
                    onClick={() => {
                        if(window.confirm("FINAL AUDIT: This will lock all entries for this date. Continue?")) {
                            handleSave({ status: 'submitted' });
                        }
                    }} 
                    disabled={isSubmitted} 
                    className={`flex-1 py-5 rounded-[2.2rem] text-xs font-black uppercase tracking-[0.2em] flex items-center justify-center gap-3 transition-all ${isSubmitted ? 'bg-slate-100 text-slate-400' : 'bg-indigo-600 text-white hover:bg-indigo-700 active:scale-95 shadow-lg shadow-indigo-100'}`}
                >
                    {isSubmitted ? <CheckCircle2 size={18}/> : <BarChart3 size={18}/>}
                    {isSubmitted ? 'Audit Locked' : 'Sign & Finalize'}
                </button>
            </div>
        </footer>
        
        <style>{`
          .custom-scrollbar::-webkit-scrollbar { width: 4px; }
          .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
          .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
          input::-webkit-outer-spin-button, input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        `}</style>
    </div>
  );
}
