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
  RefreshCw,
  Search,
  Lock,
  Calendar,
  BarChart3,
  CheckCircle2,
  XCircle,
  Clock,
  History,
  AlertCircle
} from 'lucide-react';

// --- FIXED FIREBASE CONFIGURATION ---
const firebaseConfig = {
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
const appId = typeof __app_id !== 'undefined' ? __app_id : 'church-finance-dashboard';

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

  // 1. AUTHENTICATION (RULE 3)
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        addLog("Auth failed. Check connection.");
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      if (u) {
        setUser(u);
        addLog("Secure Tunnel Active");
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. DATA SYNC (RULE 1 & 2)
  useEffect(() => {
    if (!user || !selectedSheetDate) return;

    const dbMode = viewMode.replace(/\s+/g, '_');
    const docId = `${selectedSheetDate}_${dbMode}`;
    
    // MANDATORY PATH: /artifacts/{appId}/public/data/reports/{docId}
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'reports', docId);
    
    const unsubscribe = onSnapshot(docRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setRevenueData(data.revenue || {});
        setExpenses(data.expenses || []);
        setManualStartingBalance(data.startingBalance || 0);
        setIsSubmitted(data.status === 'submitted');
        addLog(`Loaded: ${docId}`);
      } else {
        setRevenueData({});
        setExpenses([]);
        setManualStartingBalance(0);
        setIsSubmitted(false);
        addLog(`New entry for: ${docId}`);
      }
    }, (err) => {
      addLog("Database sync error.");
    });

    return () => unsubscribe();
  }, [user, selectedSheetDate, viewMode]);

  // 3. ARCHIVE SCANNER (RULE 1)
  const performRecoveryScan = async () => {
    if (!user) return;
    setIsScanning(true);
    addLog("Scanning cloud archive...");
    try {
      const results = [];
      const types = ['Sun', 'Tue', 'End_of_Week', 'End_of_Month'];
      
      // Look back 10 weeks
      for (let i = 0; i < 10; i++) {
        const d = new Date();
        d.setDate(d.getDate() - (i * 7));
        const dateStr = getReportingFriday(d);
        
        for (const type of types) {
          const id = `${dateStr}_${type.replace(/\s+/g, '_')}`;
          const snap = await getDoc(doc(db, 'artifacts', appId, 'public', 'data', 'reports', id));
          if (snap.exists()) {
            const data = snap.data();
            const revTotal = Object.values(data.revenue || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0);
            results.push({ 
              id: dateStr, 
              type: type, 
              total: revTotal,
              status: data.status 
            });
          }
        }
      }
      setFoundDates(results);
      setShowScanner(true);
      addLog(`Found ${results.length} historical records.`);
    } catch (e) {
      addLog("Archive scan failed.");
    } finally {
      setIsScanning(false);
    }
  };

  const totals = useMemo(() => {
    const rev = Object.values(revenueData).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
    const exp = expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    const start = parseFloat(manualStartingBalance) || 0;
    return { rev, exp, start, end: start + (rev - exp) };
  }, [revenueData, expenses, manualStartingBalance]);

  const handleSave = async (updates) => {
    if (!user || isSubmitted) return;
    const dbMode = viewMode.replace(/\s+/g, '_');
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'reports', `${selectedSheetDate}_${dbMode}`);
    try {
      await setDoc(docRef, { ...updates, lastUpdated: new Date().toISOString() }, { merge: true });
    } catch (e) {
      addLog("Cloud save error.");
    }
  };

  if (!isAuthenticated) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-[2.5rem] p-10 shadow-2xl">
        <div className="text-center mb-10">
            <div className="bg-indigo-600 w-14 h-14 rounded-2xl flex items-center justify-center text-white mx-auto mb-4 shadow-lg shadow-indigo-200"><Lock size={28}/></div>
            <h1 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Voices South Vault</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Authorized Personnel Only</p>
        </div>
        <form onSubmit={(e) => {
          e.preventDefault();
          const d = new FormData(e.target);
          if (d.get('id') === ADMIN_CREDENTIALS.loginId && d.get('pw') === ADMIN_CREDENTIALS.password) {
            setIsAuthenticated(true);
          } else { setLoginError('Access Denied: Invalid Credentials'); }
        }} className="space-y-4">
          <input name="id" type="text" placeholder="Admin ID" required className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 ring-indigo-500/20" />
          <input name="pw" type="password" placeholder="Secure Password" required className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-xl outline-none focus:ring-2 ring-indigo-500/20" />
          {loginError && <p className="text-rose-500 text-[10px] font-black uppercase text-center bg-rose-50 py-2 rounded-lg">{loginError}</p>}
          <button type="submit" className="w-full bg-slate-900 text-white py-4 rounded-xl font-black uppercase tracking-widest hover:bg-indigo-600 transition-all active:scale-95 shadow-lg">Unlock Dashboard</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-40">
        <div className="bg-white border-b border-slate-200 sticky top-0 z-40 px-4 py-3">
            <div className="max-w-6xl mx-auto flex flex-wrap gap-2 justify-center md:justify-start">
                {[
                    { id: 'Sun', icon: <Calendar size={14}/> },
                    { id: 'Tue', icon: <Clock size={14}/> },
                    { id: 'End of Week', icon: <BarChart3 size={14}/> },
                    { id: 'End of Month', icon: <History size={14}/> }
                ].map((m) => (
                    <button 
                        key={m.id}
                        onClick={() => setViewMode(m.id)}
                        className={`px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-2 transition-all ${viewMode === m.id ? 'bg-indigo-600 text-white shadow-md' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                    >
                        {m.icon} {m.id}
                    </button>
                ))}
            </div>
        </div>

        <header className="max-w-6xl mx-auto mt-8 mb-6 px-4 flex flex-wrap gap-4 items-center">
            <div className="flex-1 bg-white p-4 rounded-3xl shadow-sm border border-slate-200 flex justify-between items-center min-w-[300px]">
                <button onClick={() => {
                     const [m, d, y] = selectedSheetDate.split('-').map(Number);
                     const date = new Date(2000 + y, m - 1, d);
                     date.setDate(date.getDate() - 7);
                     setSelectedSheetDate(formatDate(date));
                }} className="p-2 hover:bg-slate-50 rounded-xl text-slate-400"><ChevronLeft/></button>
                <div className="text-center">
                    <p className="text-[10px] font-black text-indigo-600 uppercase tracking-widest leading-none mb-1">{viewMode}</p>
                    <h2 className="text-lg font-black text-slate-800">{selectedSheetDate}</h2>
                </div>
                <button onClick={() => {
                     const [m, d, y] = selectedSheetDate.split('-').map(Number);
                     const date = new Date(2000 + y, m - 1, d);
                     date.setDate(date.getDate() + 7);
                     setSelectedSheetDate(formatDate(date));
                }} className="p-2 hover:bg-slate-50 rounded-xl text-slate-400"><ChevronRight/></button>
            </div>
            
            <button onClick={performRecoveryScan} className="bg-slate-900 text-white px-6 py-4 rounded-3xl font-black uppercase text-[10px] tracking-widest flex items-center gap-3 hover:bg-indigo-600 transition-all shadow-lg active:scale-95">
                {isScanning ? <RefreshCw className="animate-spin" size={16}/> : <Search size={16}/>}
                History Archive
            </button>
        </header>

        <div className="max-w-6xl mx-auto px-4 grid grid-cols-1 md:grid-cols-4 gap-4 mb-8 text-center md:text-left">
            <div className="bg-white p-6 rounded-[2rem] border border-slate-200">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Starting Balance</p>
                <div className="flex items-center justify-center md:justify-start gap-1">
                    <span className="text-slate-300 font-bold">$</span>
                    <input 
                        type="number" 
                        value={manualStartingBalance || ''} 
                        disabled={isSubmitted} 
                        onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setManualStartingBalance(val);
                            handleSave({ startingBalance: val });
                        }} 
                        className="text-2xl font-black text-slate-800 outline-none w-full bg-transparent" 
                        placeholder="0.00"
                    />
                </div>
            </div>
            <div className="bg-white p-6 rounded-[2rem] border border-slate-200">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Weekly Inflow</p>
                <p className="text-3xl font-black text-emerald-600">${totals.rev.toLocaleString()}</p>
            </div>
            <div className="bg-white p-6 rounded-[2rem] border border-slate-200">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Weekly Outflow</p>
                <p className="text-3xl font-black text-rose-500">${totals.exp.toLocaleString()}</p>
            </div>
            <div className="bg-indigo-600 p-6 rounded-[2rem] text-white shadow-xl shadow-indigo-100">
                <p className="text-[10px] font-black text-indigo-200 uppercase mb-1">Projected Ending</p>
                <p className="text-3xl font-black">${totals.end.toLocaleString()}</p>
            </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Income */}
            <section className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200">
                <h3 className="font-black text-slate-800 uppercase text-xs tracking-widest mb-6 flex items-center gap-2 text-emerald-600"><TrendingUp size={18}/> Revenue Sources</h3>
                <div className="grid grid-cols-1 gap-4">
                    {REVENUE_CATEGORIES.map(cat => (
                        <div key={cat}>
                            <label className="text-[10px] font-black text-slate-400 uppercase ml-1 block mb-1">{cat}</label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 font-bold">$</span>
                                <input 
                                    type="number" 
                                    disabled={isSubmitted}
                                    value={revenueData[cat] || ''}
                                    onChange={(e) => {
                                        const val = e.target.value;
                                        const updated = { ...revenueData, [cat]: val };
                                        setRevenueData(updated);
                                        handleSave({ revenue: updated });
                                    }}
                                    className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold outline-none focus:bg-white focus:ring-2 ring-emerald-500/10"
                                    placeholder="0.00"
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            {/* Expenses */}
            <section className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200 flex flex-col min-h-[500px]">
                <h3 className="font-black text-slate-800 uppercase text-xs tracking-widest mb-6 flex items-center gap-2 text-rose-500"><Wallet size={18}/> Expense Tracking</h3>
                <div className="flex-1 overflow-y-auto mb-6 space-y-3 pr-2">
                    {expenses.length === 0 ? (
                        <div className="text-center py-20 text-slate-300 italic flex flex-col items-center">
                            <PlusCircle size={32} className="mb-2 opacity-20"/>
                            No expenses logged
                        </div>
                    ) : (
                        expenses.map((exp, idx) => (
                            <div key={idx} className="bg-slate-50 p-4 rounded-2xl flex justify-between items-center border border-slate-100 group">
                                <div><p className="font-bold text-slate-700">{exp.category}</p><p className="text-[10px] text-slate-400 font-black uppercase tracking-tight">{exp.date}</p></div>
                                <div className="flex items-center gap-4">
                                    <p className="font-black text-rose-500">-${parseFloat(exp.amount).toFixed(2)}</p>
                                    {!isSubmitted && (
                                        <button onClick={() => {
                                            const updated = expenses.filter((_, i) => i !== idx);
                                            setExpenses(updated);
                                            handleSave({ expenses: updated });
                                        }} className="text-slate-300 hover:text-rose-500 transition-colors"><XCircle size={16}/></button>
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
                        const newExp = { category: d.get('c'), amount: amt, date: new Date().toLocaleDateString() };
                        const updated = [newExp, ...expenses];
                        setExpenses(updated);
                        handleSave({ expenses: updated });
                        e.target.reset();
                    }} className="bg-slate-900 p-5 rounded-3xl space-y-3 shadow-xl">
                        <select name="c" className="w-full p-3 bg-slate-800 text-white rounded-xl text-sm font-bold border-none outline-none appearance-none">
                            {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                        </select>
                        <div className="flex gap-2">
                            <input name="a" type="number" step="0.01" required placeholder="Amount" className="flex-1 p-3 bg-slate-800 text-white rounded-xl text-sm font-bold border-none outline-none" />
                            <button type="submit" className="bg-indigo-600 text-white p-3 rounded-xl hover:bg-indigo-500 active:scale-95 transition-all"><Plus/></button>
                        </div>
                    </form>
                )}
            </section>
        </div>

        {/* System Logs */}
        <div className="max-w-6xl mx-auto mt-8 px-4">
            <div className="bg-slate-900/5 border border-slate-200 rounded-2xl p-4 font-mono text-[9px] text-slate-400 h-20 overflow-y-auto">
                <p className="uppercase font-black text-[8px] mb-1 text-slate-500">System Logs</p>
                {debugLog.map((log, i) => <div key={i}>{log}</div>)}
            </div>
        </div>

        {/* History Modal */}
        {showScanner && (
            <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-6">
                <div className="bg-white w-full max-w-xl rounded-[2.5rem] p-8 max-h-[80vh] flex flex-col shadow-2xl border border-white/20">
                    <div className="flex justify-between items-center mb-6">
                        <div>
                            <h3 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Report Archive</h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Past 10 Weeks</p>
                        </div>
                        <button onClick={() => setShowScanner(false)} className="p-2 bg-slate-100 rounded-full hover:bg-rose-50 hover:text-rose-500 transition-all"><XCircle size={20}/></button>
                    </div>
                    <div className="overflow-y-auto flex-1 space-y-3 pr-2">
                        {foundDates.length === 0 ? (
                            <div className="text-center py-20 flex flex-col items-center">
                                <AlertCircle size={40} className="text-slate-200 mb-4" />
                                <p className="font-bold text-slate-400">No matching reports found in the cloud.</p>
                            </div>
                        ) : foundDates.map((item, i) => (
                            <button key={i} onClick={() => { setSelectedSheetDate(item.id); setViewMode(item.type); setShowScanner(false); }} className="w-full flex items-center justify-between p-5 bg-slate-50 rounded-2xl hover:bg-indigo-50 transition-all border border-slate-100 group">
                                <div className="text-left">
                                    <p className="font-black text-slate-800 tracking-tight text-lg">{item.id}</p>
                                    <div className="flex items-center gap-2">
                                        <p className="text-[9px] font-black text-indigo-600 uppercase tracking-widest">{item.type}</p>
                                        {item.status === 'submitted' && <span className="bg-rose-100 text-rose-600 text-[8px] px-2 py-0.5 rounded-full font-black uppercase">Locked</span>}
                                    </div>
                                </div>
                                <div className="text-right flex items-center gap-4">
                                    <div>
                                        <p className="text-lg font-black text-emerald-600 tracking-tight">${item.total.toLocaleString()}</p>
                                        <p className="text-[8px] font-bold text-slate-400 uppercase tracking-widest">Revenue logged</p>
                                    </div>
                                    <ChevronRight className="text-slate-300 group-hover:text-indigo-600 transition-colors" size={20}/>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        )}

        <footer className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-md px-6 z-40">
            <div className="bg-white/90 backdrop-blur-xl border border-white/50 shadow-2xl rounded-full p-2">
                <button 
                    onClick={() => {
                        if(window.confirm("Submit final audit? This will lock all data for this specific report.")) {
                            handleSave({ status: 'submitted' });
                        }
                    }} 
                    disabled={isSubmitted} 
                    className={`w-full py-4 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all ${isSubmitted ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-100'}`}
                >
                    {isSubmitted ? <CheckCircle2 size={16}/> : null}
                    {isSubmitted ? 'Report Locked' : 'Finalize & Close Report'}
                </button>
            </div>
        </footer>
    </div>
  );
}
