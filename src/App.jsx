import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { initializeApp, getApps } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc,
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
  BarChart3,
  CheckCircle2,
  XCircle,
  Database,
  ShieldCheck,
  LogOut,
  History,
  AlertCircle,
  Search
} from 'lucide-react';

// --- PRODUCTION FIREBASE CONFIG ---
const firebaseConfig = {
  apiKey: "AIzaSyAs-your-actual-key-here", 
  authDomain: "church-finance-dashboard-40dca.firebaseapp.com",
  projectId: "church-finance-dashboard-40dca",
  storageBucket: "church-finance-dashboard-40dca.appspot.com",
  messagingSenderId: "774391673327",
  appId: "1:774391673327:web:96e81084206085a5700885"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);
const appId = 'church-finance-dashboard-40dca';

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

// Standardized Date Formatter to ensure 1-2-26 vs 01-02-26 consistency
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
  const [statusLogs, setStatusLogs] = useState(["System Ready."]);

  const addLog = useCallback((msg) => {
    setStatusLogs(prev => [`${msg}`, ...prev].slice(0, 5));
  }, []);

  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        addLog(`Auth Error: ${err.message}`);
      } finally {
        setAuthReady(true);
      }
    };
    const unsubscribe = onAuthStateChanged(auth, setUser);
    initAuth();
    return () => unsubscribe();
  }, [addLog]);

  // DEEP DATA RECOVERY TRIGGER
  useEffect(() => {
    if (!user || !isAuthenticated) return;

    const performDeepScan = async () => {
      setIsSyncing(true);
      const sanitizedMode = viewMode.replace(/\s+/g, '_').toLowerCase();
      
      // Current Path
      const primaryDocId = `finance_${selectedSheetDate}_${sanitizedMode}`;
      const primaryRef = doc(db, 'artifacts', appId, 'public', 'data', primaryDocId);
      
      try {
        const primarySnap = await getDoc(primaryRef);
        
        if (primarySnap.exists()) {
          const data = primarySnap.data();
          setRevenueData(data.revenue || {});
          setExpenses(data.expenses || []);
          setManualStartingBalance(data.startingBalance || 0);
          setIsSubmitted(data.status === 'submitted');
          addLog(`Loaded: ${selectedSheetDate}`);
        } else {
          addLog(`Scanning legacy data for ${selectedSheetDate}...`);
          
          // TRY LEGACY PATH 1: data/{date}
          const legacy1 = doc(db, 'artifacts', appId, 'public', 'data', selectedSheetDate);
          // TRY LEGACY PATH 2: reports/{date}
          const legacy2 = doc(db, 'artifacts', appId, 'public', 'reports', selectedSheetDate);
          
          let foundData = null;
          const [snap1, snap2] = await Promise.all([getDoc(legacy1), getDoc(legacy2)]);
          
          if (snap1.exists()) foundData = snap1.data();
          else if (snap2.exists()) foundData = snap2.data();

          if (foundData) {
            addLog("RECOVERY SUCCESSFUL!");
            setRevenueData(foundData.revenue || {});
            setExpenses(foundData.expenses || []);
            setManualStartingBalance(foundData.startingBalance || 0);
            
            // Auto-migrate so it works in the new view
            await setDoc(primaryRef, {
              ...foundData,
              migratedFromLegacy: true,
              recoveredAt: new Date().toISOString()
            });
          } else {
            setRevenueData({});
            setExpenses([]);
            setManualStartingBalance(0);
            setIsSubmitted(false);
            addLog(`No record found for ${selectedSheetDate}`);
          }
        }
      } catch (err) {
        addLog(`Database Disconnect: ${err.code}`);
      }
      setIsSyncing(false);
    };

    performDeepScan();
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

  if (!authReady) return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white text-center">
        <Database className="animate-pulse mb-4 text-indigo-400" size={40} />
        <span className="text-[10px] font-black uppercase tracking-widest opacity-50">Establishing Secure Tunnel...</span>
    </div>
  );

  if (!isAuthenticated) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-[2.5rem] p-10 shadow-2xl overflow-hidden relative">
        <div className="absolute top-0 left-0 w-full h-2 bg-indigo-600"></div>
        <div className="mb-10 text-center">
            <div className="w-16 h-16 bg-slate-900 rounded-2xl mx-auto mb-6 flex items-center justify-center text-white shadow-lg">
                <ShieldCheck size={32}/>
            </div>
            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Voices South Financials</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Management Portal</p>
        </div>
        <form onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.target);
          if (d.get('id').toLowerCase() === ADMIN_CREDENTIALS.loginId && d.get('pw') === ADMIN_CREDENTIALS.password) {
            setIsAuthenticated(true);
            addLog("Session Established");
          } else {
            addLog("Invalid Credentials");
          }
        }} className="space-y-4">
          <input name="id" type="text" placeholder="Admin ID" required className="w-full px-6 py-4 bg-slate-50 rounded-2xl border border-slate-100 font-bold outline-none focus:ring-2 ring-indigo-500/20" />
          <input name="pw" type="password" placeholder="Passcode" required className="w-full px-6 py-4 bg-slate-50 rounded-2xl border border-slate-100 font-bold outline-none focus:ring-2 ring-indigo-500/20" />
          <button type="submit" className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-indigo-600 transition-all text-xs">Authorize Access</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F1F5F9] pb-32 font-sans">
      {/* Dynamic Status Bar */}
      <div className="bg-slate-900 text-white px-6 py-3 flex items-center justify-between sticky top-0 z-50 shadow-xl border-b border-white/10">
        <div className="flex items-center gap-4 overflow-hidden">
            <div className={`w-2 h-2 rounded-full ${isSyncing ? 'bg-amber-400 animate-ping' : 'bg-emerald-400'}`}></div>
            <div className="flex flex-col">
                <span className="text-[9px] font-black uppercase tracking-widest text-slate-500">Live Database Status</span>
                <span className="text-[10px] font-bold text-indigo-300 truncate">{statusLogs[0]}</span>
            </div>
        </div>
        <div className="flex items-center gap-6">
            <div className="hidden md:flex items-center gap-2 text-[9px] font-black text-slate-500 uppercase tracking-widest">
                <Database size={12}/> {appId}
            </div>
            <button onClick={() => setIsAuthenticated(false)} className="bg-white/10 hover:bg-white/20 p-2 rounded-lg transition-colors">
                <LogOut size={16}/>
            </button>
        </div>
      </div>

      <header className="max-w-6xl mx-auto mt-12 px-6">
        <div className="bg-white p-8 md:p-12 rounded-[3rem] border border-slate-200 shadow-sm flex flex-col md:flex-row items-center justify-between gap-8">
          <div className="flex items-center gap-6">
            <button onClick={() => {
                const [m, d, y] = selectedSheetDate.split('-').map(Number);
                const date = new Date(2000 + y, m - 1, d);
                date.setDate(date.getDate() - 7);
                setSelectedSheetDate(formatDate(date));
            }} className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 hover:bg-indigo-600 hover:text-white transition-all border border-slate-100 shadow-sm"><ChevronLeft size={28}/></button>
            
            <div className="text-center md:text-left">
                <p className="text-[10px] font-black uppercase text-indigo-600 tracking-[0.2em] mb-1">Week Ending Date</p>
                <h2 className="text-5xl font-black text-slate-900 tracking-tighter">{selectedSheetDate}</h2>
            </div>

            <button onClick={() => {
                const [m, d, y] = selectedSheetDate.split('-').map(Number);
                const date = new Date(2000 + y, m - 1, d);
                date.setDate(date.getDate() + 7);
                setSelectedSheetDate(formatDate(date));
            }} className="w-14 h-14 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 hover:bg-indigo-600 hover:text-white transition-all border border-slate-100 shadow-sm"><ChevronRight size={28}/></button>
          </div>

          <div className="flex flex-col items-center md:items-end gap-3">
             <div className="flex bg-slate-100 p-1.5 rounded-2xl">
                {['Sun', 'Tue', 'End Month'].map(m => (
                    <button key={m} onClick={() => setViewMode(m)} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-tight transition-all ${viewMode === m ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>{m}</button>
                ))}
             </div>
             <div className="flex items-baseline gap-2">
                <span className="text-xl font-black text-slate-400">$</span>
                <span className="text-4xl font-black text-slate-900 tracking-tighter">
                    {totals.end.toLocaleString(undefined, {minimumFractionDigits: 2})}
                </span>
             </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto mt-10 px-6 grid grid-cols-1 lg:grid-cols-2 gap-10">
        {/* Revenue Column */}
        <section className="space-y-6">
          <div className="flex items-center justify-between px-4">
            <h3 className="font-black text-xs uppercase tracking-widest text-slate-900 flex items-center gap-3">
              <div className="w-10 h-10 bg-emerald-500 text-white rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20"><TrendingUp size={20}/></div>
              Revenue Entry
            </h3>
            <span className="text-xs font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-full">+${totals.rev.toLocaleString()}</span>
          </div>
          
          <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm space-y-6">
            <div className="p-6 bg-indigo-50/50 rounded-3xl border border-indigo-100 flex items-center justify-between mb-2">
                 <div className="flex items-center gap-3">
                    <History size={18} className="text-indigo-400" />
                    <span className="text-[11px] font-black uppercase text-indigo-600 tracking-wider">Starting Balance</span>
                 </div>
                 <input type="number" value={manualStartingBalance || ''} disabled={isSubmitted}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0;
                      setManualStartingBalance(v);
                      handleSave({ startingBalance: v });
                    }} className="bg-transparent text-right font-black text-indigo-900 outline-none w-32 text-xl" placeholder="0.00" />
            </div>

            <div className="space-y-1">
                {REVENUE_CATEGORIES.map(cat => (
                <div key={cat} className="flex items-center justify-between p-4 rounded-2xl hover:bg-slate-50 transition-colors group">
                    <span className="text-[11px] font-black text-slate-500 uppercase tracking-tight group-hover:text-slate-900">{cat}</span>
                    <div className="flex items-center gap-3">
                        <span className="text-slate-300 font-bold">$</span>
                        <input type="number" value={revenueData[cat] || ''} disabled={isSubmitted}
                            onChange={(e) => {
                            const updated = { ...revenueData, [cat]: e.target.value };
                            setRevenueData(updated);
                            handleSave({ revenue: updated });
                            }} className="w-32 py-1 font-black text-right outline-none text-xl text-slate-900 placeholder-slate-100 bg-transparent" placeholder="0" />
                    </div>
                </div>
                ))}
            </div>
          </div>
        </section>

        {/* Expenses Column */}
        <section className="space-y-6">
          <div className="flex items-center justify-between px-4">
            <h3 className="font-black text-xs uppercase tracking-widest text-slate-900 flex items-center gap-3">
              <div className="w-10 h-10 bg-rose-500 text-white rounded-xl flex items-center justify-center shadow-lg shadow-rose-500/20"><Wallet size={20}/></div>
              Expenditures
            </h3>
            <span className="text-xs font-black text-rose-600 bg-rose-50 px-3 py-1 rounded-full">-${totals.exp.toLocaleString()}</span>
          </div>

          <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm min-h-[500px] flex flex-col">
              {!isSubmitted && (
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.target);
                  const newExp = { 
                    category: f.get('c'), 
                    amount: f.get('a'), 
                    date: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) 
                  };
                  const updated = [newExp, ...expenses];
                  setExpenses(updated);
                  handleSave({ expenses: updated });
                  e.target.reset();
                }} className="mb-8 p-6 bg-slate-950 rounded-[2rem] space-y-4 shadow-xl">
                  <select name="c" className="w-full bg-white/10 border border-white/10 rounded-xl p-4 text-[10px] font-black uppercase text-white outline-none">
                      {EXPENSE_CATEGORIES.map(c => <option key={c} value={c} className="text-slate-900">{c}</option>)}
                  </select>
                  <div className="flex gap-3">
                      <input name="a" type="number" step="0.01" required placeholder="Amount 0.00" className="flex-1 bg-white/10 border border-white/10 rounded-xl p-4 text-sm font-black text-white outline-none" />
                      <button type="submit" className="bg-indigo-600 text-white px-8 rounded-xl hover:bg-indigo-500 transition-all font-black uppercase text-[10px] tracking-widest">Add</button>
                  </div>
                </form>
              )}

              <div className="flex-1 space-y-3 overflow-y-auto pr-2 custom-scrollbar">
                {expenses.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-slate-300 gap-4 opacity-40 py-20">
                    <Search size={48} strokeWidth={1}/>
                    <p className="text-[10px] font-black uppercase tracking-[0.3em]">Waiting for entries</p>
                  </div>
                ) : (
                  expenses.map((exp, idx) => (
                    <div key={idx} className="flex items-center justify-between p-5 bg-slate-50 rounded-2xl border border-slate-100 group hover:border-indigo-200 transition-all">
                      <div className="flex gap-4 items-center">
                        <div className="w-2 h-2 rounded-full bg-rose-400"></div>
                        <div>
                            <div className="text-[11px] font-black text-slate-900 uppercase tracking-tight">{exp.category}</div>
                            <div className="text-[8px] font-bold text-slate-400 uppercase">{exp.date}</div>
                        </div>
                      </div>
                      <div className="flex items-center gap-5">
                        <span className="font-black text-slate-900">-${parseFloat(exp.amount).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                        {!isSubmitted && (
                          <button onClick={() => {
                            const updated = expenses.filter((_, i) => i !== idx);
                            setExpenses(updated);
                            handleSave({ expenses: updated });
                          }} className="text-slate-300 hover:text-rose-600 transition-all">
                            <XCircle size={18}/>
                          </button>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
          </div>
        </section>
      </main>

      {/* Floating Action Button */}
      <div className="fixed bottom-10 left-1/2 -translate-x-1/2 w-full max-w-sm px-6">
        <button 
          onClick={() => { if(window.confirm("Archive this report permanently?")) handleSave({ status: 'submitted' }); }}
          disabled={isSubmitted || isSyncing}
          className={`w-full py-6 rounded-[2rem] font-black text-[11px] uppercase tracking-[0.2em] flex items-center justify-center gap-4 shadow-2xl transition-all ${isSubmitted ? 'bg-emerald-500 text-white shadow-emerald-500/20' : 'bg-slate-900 text-white hover:bg-indigo-600 active:scale-95 shadow-slate-900/40'}`}
        >
          {isSubmitted ? <ShieldCheck size={20}/> : <BarChart3 size={20}/>}
          {isSubmitted ? 'Locked & Verified' : 'Finalize & Archive'}
        </button>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 10px; }
        input[type=number]::-webkit-inner-spin-button, input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
      `}</style>
    </div>
  );
}
