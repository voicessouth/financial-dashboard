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
  BarChart3,
  CheckCircle2,
  XCircle,
  Database,
  ShieldCheck,
  LogOut,
  History,
  AlertCircle
} from 'lucide-react';

// --- FIXED FIREBASE CONFIGURATION ---
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

const RECOVERY_MAP = {
  'Cash/Checks': 'Cash/Checks',
  'Credit/Debit Cards': 'Credit Card',
  'Text': 'Text',
  'Givelify': 'Givelify',
  'Tithely': 'Tithely',
  'CashApp': 'CashApp',
  'Zelle': 'Zelle',
  'Website Giving': 'Website Giving'
};

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
  const [statusLogs, setStatusLogs] = useState(["System Ready."]);

  const addLog = useCallback((msg) => {
    setStatusLogs(prev => [`${msg}`, ...prev].slice(0, 3));
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

  useEffect(() => {
    if (!user || !isAuthenticated) return;

    setIsSyncing(true);
    const sanitizedMode = viewMode.replace(/\s+/g, '_').toLowerCase();
    const docId = `finance_${selectedSheetDate}_${sanitizedMode}`;
    
    // NEW PATH
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', docId);
    
    // DEEP RECOVERY PATHS
    const legacyPath1 = doc(db, 'artifacts', appId, 'public', 'data', 'reports', selectedSheetDate);
    const legacyPath2 = doc(db, 'artifacts', appId, 'public', 'data', selectedSheetDate); // Root data path

    const unsubscribe = onSnapshot(docRef, async (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setRevenueData(data.revenue || {});
        setExpenses(data.expenses || []);
        setManualStartingBalance(data.startingBalance || 0);
        setIsSubmitted(data.status === 'submitted');
        addLog(`Active Record: ${selectedSheetDate}`);
        setIsSyncing(false);
      } else {
        addLog(`Scanning deep storage for ${selectedSheetDate}...`);
        try {
            // Check Path 1
            let legacySnap = await getDoc(legacyPath1);
            // If not found, check Path 2
            if (!legacySnap.exists()) legacySnap = await getDoc(legacyPath2);

            if (legacySnap.exists()) {
              addLog("ARCHIVE FOUND! Recovering...");
              const legacyData = legacySnap.data();
              
              const recoveredRevenue = {};
              if (legacyData.revenue) {
                Object.entries(legacyData.revenue).forEach(([oldKey, value]) => {
                  const newKey = RECOVERY_MAP[oldKey] || oldKey;
                  recoveredRevenue[newKey] = value;
                });
              }

              // Auto-migrate to current structure
              await setDoc(docRef, {
                revenue: recoveredRevenue,
                expenses: legacyData.expenses || [],
                startingBalance: legacyData.startingBalance || 0,
                migrated: true,
                recoveredAt: new Date().toISOString()
              });
            } else {
              setRevenueData({});
              setExpenses([]);
              setManualStartingBalance(0);
              setIsSubmitted(false);
              addLog(`Empty: ${selectedSheetDate}`);
            }
        } catch (e) {
            addLog("Deep Scan Error");
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

  if (!authReady) return (
    <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center p-6 text-white text-center">
        <Database className="animate-bounce mb-4 text-indigo-400" size={40} />
        <span className="text-[10px] font-black uppercase tracking-widest opacity-50">Syncing with Cloud...</span>
    </div>
  );

  if (!isAuthenticated) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-[3rem] p-12 shadow-2xl">
        <div className="mb-10 text-center">
            <div className="w-16 h-16 bg-indigo-600 rounded-2xl mx-auto mb-6 flex items-center justify-center text-white shadow-lg">
                <ShieldCheck size={32}/>
            </div>
            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">Voices South</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Authorized Access</p>
        </div>
        <form onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.target);
          if (d.get('id').toLowerCase() === ADMIN_CREDENTIALS.loginId && d.get('pw') === ADMIN_CREDENTIALS.password) {
            setIsAuthenticated(true);
            addLog("Authenticated");
          } else {
            addLog("Access Denied");
          }
        }} className="space-y-4">
          <input name="id" type="text" placeholder="Login ID" required className="w-full px-6 py-4 bg-slate-50 rounded-2xl border border-slate-100 font-bold outline-none" />
          <input name="pw" type="password" placeholder="Passcode" required className="w-full px-6 py-4 bg-slate-50 rounded-2xl border border-slate-100 font-bold outline-none" />
          <button type="submit" className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-indigo-600 transition-all text-xs">Login</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-32">
      <div className="bg-slate-900 text-white px-6 py-3 flex items-center justify-between sticky top-0 z-50 shadow-lg">
        <div className="flex items-center gap-3 overflow-hidden">
            <ShieldCheck size={16} className="text-emerald-400 shrink-0"/>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-r border-slate-700 pr-3 mr-1 shrink-0">System Log</span>
            <span className="text-[10px] font-black uppercase text-emerald-400 truncate">{statusLogs[0]}</span>
        </div>
        <button onClick={() => setIsAuthenticated(false)} className="text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-white transition-colors flex items-center gap-2 shrink-0">
            Exit <LogOut size={14}/>
        </button>
      </div>

      <header className="max-w-6xl mx-auto mt-12 px-6 grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex items-center justify-between">
          <button onClick={() => {
            const [m, d, y] = selectedSheetDate.split('-').map(Number);
            const date = new Date(2000 + y, m - 1, d);
            date.setDate(date.getDate() - 7);
            setSelectedSheetDate(formatDate(date));
          }} className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 hover:text-indigo-600 transition-all border border-slate-100"><ChevronLeft size={24}/></button>
          
          <div className="text-center">
            <div className="flex gap-2 justify-center mb-3">
                {['Sun', 'Tue', 'End Month'].map(m => (
                    <button key={m} onClick={() => setViewMode(m)} className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-tighter transition-all ${viewMode === m ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 hover:bg-slate-200'}`}>{m}</button>
                ))}
            </div>
            <h2 className="text-4xl md:text-5xl font-black text-slate-900 tracking-tighter">{selectedSheetDate}</h2>
          </div>

          <button onClick={() => {
            const [m, d, y] = selectedSheetDate.split('-').map(Number);
            const date = new Date(2000 + y, m - 1, d);
            date.setDate(date.getDate() + 7);
            setSelectedSheetDate(formatDate(date));
          }} className="w-12 h-12 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-400 hover:text-indigo-600 transition-all border border-slate-100"><ChevronRight size={24}/></button>
        </div>

        <div className="bg-white p-8 rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col justify-center">
             <p className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-2">Account Balance</p>
             <div className="flex items-baseline gap-2">
                <span className="text-4xl font-black text-slate-900">$</span>
                <span className="text-5xl font-black text-slate-900 tracking-tighter truncate">
                    {totals.end.toLocaleString(undefined, {minimumFractionDigits: 2})}
                </span>
             </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto mt-10 px-6 grid grid-cols-1 lg:grid-cols-2 gap-10">
        <section>
          <div className="flex items-center justify-between mb-6 px-2">
            <h3 className="font-black text-xs uppercase tracking-widest text-slate-900 flex items-center gap-3">
              <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-lg flex items-center justify-center"><TrendingUp size={18}/></div>
              Revenue
            </h3>
            <div className="text-[11px] font-black text-slate-400 uppercase">Subtotal: ${totals.rev.toLocaleString()}</div>
          </div>
          
          <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm space-y-5">
            <div className="p-5 bg-slate-50 rounded-2xl flex items-center justify-between border border-slate-100 mb-4 shadow-inner">
                 <div className="flex items-center gap-3">
                    <History size={16} className="text-slate-400" />
                    <span className="text-[10px] font-black uppercase text-slate-400">Opening Balance</span>
                 </div>
                 <input type="number" value={manualStartingBalance || ''} disabled={isSubmitted}
                    onChange={(e) => {
                      const v = parseFloat(e.target.value) || 0;
                      setManualStartingBalance(v);
                      handleSave({ startingBalance: v });
                    }} className="bg-transparent text-right font-black text-slate-900 outline-none w-28 placeholder-slate-200 text-lg" placeholder="0.00" />
            </div>

            {REVENUE_CATEGORIES.map(cat => (
              <div key={cat} className="flex items-center justify-between py-2 border-b border-slate-50 last:border-0">
                <span className="text-[11px] font-black text-slate-900 uppercase tracking-tight">{cat}</span>
                <div className="flex items-center gap-2">
                    <span className="text-slate-300 font-bold">$</span>
                    <input type="number" value={revenueData[cat] || ''} disabled={isSubmitted}
                        onChange={(e) => {
                          const updated = { ...revenueData, [cat]: e.target.value };
                          setRevenueData(updated);
                          handleSave({ revenue: updated });
                        }} className="w-32 py-1 font-black text-right outline-none text-lg text-slate-900 placeholder-slate-200" placeholder="0" />
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between mb-6 px-2">
            <h3 className="font-black text-xs uppercase tracking-widest text-slate-900 flex items-center gap-3">
              <div className="w-8 h-8 bg-rose-100 text-rose-600 rounded-lg flex items-center justify-center"><Wallet size={18}/></div>
              Expenditures
            </h3>
            <div className="text-[11px] font-black text-rose-500 uppercase">Out: ${totals.exp.toLocaleString()}</div>
          </div>

          <div className="bg-white p-8 rounded-[3rem] border border-slate-200 shadow-sm">
              {!isSubmitted && (
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const f = new FormData(e.target);
                  const newExp = { category: f.get('c'), amount: f.get('a'), date: new Date().toLocaleTimeString() };
                  const updated = [newExp, ...expenses];
                  setExpenses(updated);
                  handleSave({ expenses: updated });
                  e.target.reset();
                }} className="mb-8 p-6 bg-slate-50 rounded-3xl border border-slate-100 space-y-4 shadow-inner">
                  <select name="c" className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-black uppercase outline-none shadow-sm">
                      {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <div className="flex gap-2">
                      <input name="a" type="number" step="0.01" required placeholder="0.00" className="flex-1 bg-white border border-slate-200 rounded-xl p-3 text-sm font-black outline-none shadow-sm" />
                      <button type="submit" className="bg-slate-900 text-white px-6 rounded-xl hover:bg-indigo-600 transition-all shadow-lg active:scale-95"><Plus size={20}/></button>
                  </div>
                </form>
              )}

              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-2 custom-scrollbar">
                {expenses.length === 0 ? (
                  <div className="py-20 flex flex-col items-center justify-center text-slate-300 gap-3 opacity-50">
                    <Database size={32} strokeWidth={1.5}/>
                    <span className="text-[10px] font-black uppercase tracking-widest">No entries recorded</span>
                  </div>
                ) : (
                  expenses.map((exp, idx) => (
                    <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 group shadow-sm transition-all hover:border-indigo-200">
                      <div>
                        <div className="text-[10px] font-black text-slate-900 uppercase tracking-tight">{exp.category}</div>
                        <div className="text-[8px] font-bold text-slate-400 uppercase">{exp.date}</div>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-black text-rose-600">-${parseFloat(exp.amount).toLocaleString(undefined, {minimumFractionDigits: 2})}</span>
                        {!isSubmitted && (
                          <button onClick={() => {
                            const updated = expenses.filter((_, i) => i !== idx);
                            setExpenses(updated);
                            handleSave({ expenses: updated });
                          }} className="text-slate-300 hover:text-rose-600 opacity-0 group-hover:opacity-100 transition-all">
                            <XCircle size={16}/>
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

      <div className="fixed bottom-10 left-1/2 -translate-x-1/2 w-full max-w-md px-6">
        <button 
          onClick={() => { if(window.confirm("Archive this report?")) handleSave({ status: 'submitted' }); }}
          disabled={isSubmitted || isSyncing}
          className={`w-full py-6 rounded-3xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-4 shadow-2xl transition-all ${isSubmitted ? 'bg-emerald-500 text-white' : 'bg-slate-900 text-white hover:bg-indigo-600 active:scale-95'}`}
        >
          {isSubmitted ? <CheckCircle2 size={20}/> : <BarChart3 size={20}/>}
          {isSubmitted ? 'Locked & Verified' : 'Lock & Archive Report'}
        </button>
      </div>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #E2E8F0; border-radius: 10px; }
      `}</style>
    </div>
  );
}
