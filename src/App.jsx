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
  Clock
} from 'lucide-react';

// --- FIREBASE CONFIGURATION ---
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

// --- HELPERS ---
const formatDate = (date) => `${date.getMonth() + 1}-${date.getDate()}-${date.getFullYear().toString().slice(-2)}`;

const getReportingFriday = (dateObj) => {
  const d = new Date(dateObj);
  const day = d.getDay(); 
  const diff = (day >= 5) ? (day - 5) : (day + 2);
  const targetFriday = new Date(d);
  targetFriday.setDate(d.getDate() - diff);
  return formatDate(targetFriday);
};

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

export default function App() {
  const [user, setUser] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [selectedSheetDate, setSelectedSheetDate] = useState(getReportingFriday(new Date()));
  const [viewMode, setViewMode] = useState('Sun'); // 'Sun', 'Tue', 'End of Week', 'End of Month'
  
  const [revenueData, setRevenueData] = useState({});
  const [expenses, setExpenses] = useState([]);
  const [manualStartingBalance, setManualStartingBalance] = useState(0);
  const [isSubmitted, setIsSubmitted] = useState(false);
  
  const [isScanning, setIsScanning] = useState(false);
  const [foundDates, setFoundDates] = useState([]);
  const [showScanner, setShowScanner] = useState(false);
  const [debugLog, setDebugLog] = useState([]);

  const addLog = (msg) => setDebugLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 30));

  // 1. AUTH INITIALIZATION
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) { addLog("AUTH_ERR: Check Connection"); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
        if (u) { setUser(u); setAuthReady(true); addLog("ACCESS_TUNNEL_OPEN"); }
    });
    return () => unsubscribe();
  }, []);

  // 2. REAL-TIME DATA SYNC
  useEffect(() => {
    if (!authReady || !isAuthenticated || !selectedSheetDate) return;
    
    // Normalize viewMode for DB paths but keep UI clean
    const dbViewMode = viewMode.replace(/\s+/g, '_');
    const docId = `${selectedSheetDate}_${dbViewMode}`;
    const docPath = doc(db, 'church_reports', docId);
    
    addLog(`SYNCING: ${docId}...`);

    const unsubscribe = onSnapshot(docPath, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        // Critical: Spread into new objects to ensure React detects the change
        const incomingRev = data.revenue || {};
        setRevenueData({ ...incomingRev });
        setExpenses([...(data.expenses || [])]);
        setManualStartingBalance(data.startingBalance || 0);
        setIsSubmitted(data.status === 'submitted');
        
        const count = Object.keys(incomingRev).filter(k => parseFloat(incomingRev[k]) > 0).length;
        addLog(`POPULATED: ${docId} (${count} income fields)`);
      } else {
        // Reset for new records
        setRevenueData({});
        setExpenses([]);
        setManualStartingBalance(0);
        setIsSubmitted(false);
        addLog(`CLEARED: Ready for ${docId}`);
      }
    }, (err) => addLog(`SYNC_ERROR: ${err.message}`));
    
    return () => unsubscribe();
  }, [authReady, isAuthenticated, selectedSheetDate, viewMode]);

  // 3. HISTORY SCANNER
  const performRecoveryScan = async () => {
    setIsScanning(true);
    addLog("SCANNING_ARCHIVES...");
    try {
      const results = [];
      const now = new Date();
      // Scan last 10 weeks
      for (let i = 0; i < 10; i++) {
        const testDate = new Date();
        testDate.setDate(now.getDate() - (i * 7));
        const dateStr = getReportingFriday(testDate);
        
        for (const type of ['Sun', 'Tue', 'End_of_Week', 'End_of_Month']) {
            const id = `${dateStr}_${type}`;
            const snap = await getDoc(doc(db, 'church_reports', id));
            if (snap.exists()) {
                const d = snap.data();
                const total = Object.values(d.revenue || {}).reduce((s, v) => s + (parseFloat(v) || 0), 0);
                results.push({ id: dateStr, type: type.replace(/_/g, ' '), total, docId: id });
            }
        }
      }
      setFoundDates(results);
      setShowScanner(true);
      addLog(`FOUND ${results.length} RECENT RECORDS`);
    } catch (e) { addLog("SCAN_FAILED"); } finally { setIsScanning(false); }
  };

  const currentTotals = useMemo(() => {
    const rev = Object.values(revenueData).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
    const exp = expenses.reduce((sum, e) => sum + (parseFloat(e.amount) || 0), 0);
    const start = parseFloat(manualStartingBalance) || 0;
    return { rev, exp, net: rev - exp, start, end: start + (rev - exp) };
  }, [revenueData, expenses, manualStartingBalance]);

  const handleLogin = (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    if (data.get('loginId') === ADMIN_CREDENTIALS.loginId && data.get('password') === ADMIN_CREDENTIALS.password) {
      setIsAuthenticated(true);
    } else { setLoginError('Invalid Credentials'); }
  };

  if (!isAuthenticated) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-[2.5rem] p-10 shadow-2xl">
        <div className="text-center mb-10">
            <div className="bg-indigo-600 w-14 h-14 rounded-2xl flex items-center justify-center text-white mx-auto mb-4"><Lock size={28}/></div>
            <h1 className="text-xl font-black text-slate-900 uppercase tracking-tighter">Voices South Vault</h1>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <input name="loginId" type="text" placeholder="Admin ID" required className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-xl outline-none" />
          <input name="password" type="password" placeholder="Password" required className="w-full px-5 py-4 bg-slate-50 border border-slate-100 rounded-xl outline-none" />
          {loginError && <p className="text-rose-500 text-[10px] font-black uppercase text-center">{loginError}</p>}
          <button type="submit" className="w-full bg-slate-900 text-white py-4 rounded-xl font-black uppercase tracking-widest hover:bg-indigo-600 transition-all">Unlock Dashboard</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 pb-40">
        {/* VIEW SELECTOR: Sun, Tue, End of Week, End of Month */}
        <div className="bg-white border-b border-slate-200 sticky top-0 z-40 px-4 py-3">
            <div className="max-w-6xl mx-auto flex flex-wrap gap-2 justify-center md:justify-start">
                {[
                    { id: 'Sun', label: 'Sun', icon: <Calendar size={14}/> },
                    { id: 'Tue', label: 'Tue', icon: <Clock size={14}/> },
                    { id: 'End of Week', label: 'End of week', icon: <BarChart3 size={14}/> },
                    { id: 'End of Month', label: 'End of Month', icon: <History size={14}/> }
                ].map((m) => (
                    <button 
                        key={m.id}
                        onClick={() => setViewMode(m.id)}
                        className={`px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-wider flex items-center gap-2 transition-all ${viewMode === m.id ? 'bg-indigo-600 text-white shadow-md scale-105' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                    >
                        {m.icon} {m.label}
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
                    <h2 className="text-lg font-black text-slate-800">Report: {selectedSheetDate}</h2>
                </div>
                <button onClick={() => {
                     const [m, d, y] = selectedSheetDate.split('-').map(Number);
                     const date = new Date(2000 + y, m - 1, d);
                     date.setDate(date.getDate() + 7);
                     setSelectedSheetDate(formatDate(date));
                }} className="p-2 hover:bg-slate-50 rounded-xl text-slate-400"><ChevronRight/></button>
            </div>
            
            <button onClick={performRecoveryScan} disabled={isScanning} className="bg-slate-900 text-white px-6 py-4 rounded-3xl font-black uppercase text-[10px] tracking-widest flex items-center gap-3 hover:bg-indigo-600 transition-all shadow-lg">
                {isScanning ? <RefreshCw className="animate-spin" size={16}/> : <Search size={16}/>}
                History & Recovery
            </button>
        </header>

        <div className="max-w-6xl mx-auto px-4 grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white p-6 rounded-[2rem] border border-slate-200">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Starting Balance</p>
                <div className="flex items-center gap-1">
                    <span className="text-slate-300 font-bold">$</span>
                    <input 
                        type="number" 
                        value={manualStartingBalance} 
                        disabled={isSubmitted} 
                        onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setManualStartingBalance(val);
                            const dbMode = viewMode.replace(/\s+/g, '_');
                            setDoc(doc(db, 'church_reports', `${selectedSheetDate}_${dbMode}`), { startingBalance: val }, { merge: true });
                        }} 
                        className="text-2xl font-black text-slate-800 outline-none w-full bg-transparent border-b-2 border-slate-100 focus:border-indigo-500" 
                        placeholder="0.00"
                    />
                </div>
            </div>
            <div className="bg-white p-6 rounded-[2rem] border border-slate-200">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Inflow</p>
                <p className="text-3xl font-black text-emerald-600">${currentTotals.rev.toLocaleString()}</p>
            </div>
            <div className="bg-white p-6 rounded-[2rem] border border-slate-200">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Outflow</p>
                <p className="text-3xl font-black text-rose-500">${currentTotals.exp.toLocaleString()}</p>
            </div>
            <div className="bg-indigo-600 p-6 rounded-[2rem] text-white shadow-xl">
                <p className="text-[10px] font-black text-indigo-200 uppercase mb-1">Ending Balance</p>
                <p className="text-3xl font-black">${currentTotals.end.toLocaleString()}</p>
            </div>
        </div>

        <div className="max-w-6xl mx-auto px-4 grid grid-cols-1 md:grid-cols-2 gap-8">
            <section className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200">
                <h3 className="font-black text-slate-800 uppercase text-xs tracking-widest mb-6 flex items-center gap-2 text-emerald-600"><TrendingUp size={18}/> Income Streams</h3>
                <div className="grid grid-cols-1 gap-4">
                    {REVENUE_CATEGORIES.map(cat => (
                        <div key={cat}>
                            <label className="text-[10px] font-black text-slate-400 uppercase ml-1 mb-1 block">{cat}</label>
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
                                        const dbMode = viewMode.replace(/\s+/g, '_');
                                        setDoc(doc(db, 'church_reports', `${selectedSheetDate}_${dbMode}`), { revenue: updated }, { merge: true });
                                    }}
                                    className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-xl font-bold outline-none focus:ring-2 ring-indigo-500/20"
                                    placeholder="0.00"
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200 flex flex-col h-full min-h-[600px]">
                <h3 className="font-black text-slate-800 uppercase text-xs tracking-widest mb-6 flex items-center gap-2 text-rose-500"><Wallet size={18}/> Expense Log</h3>
                <div className="flex-1 overflow-y-auto mb-6 space-y-3 custom-scrollbar pr-2">
                    {expenses.length === 0 ? <div className="h-40 flex items-center justify-center text-slate-300 font-bold italic text-sm">No recorded expenses</div> : (
                        expenses.map((exp, idx) => (
                            <div key={idx} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex justify-between items-center group">
                                <div><p className="font-bold text-slate-700 text-sm">{exp.category}</p><p className="text-[10px] text-slate-400 font-black uppercase">{exp.date}</p></div>
                                <div className="flex items-center gap-4"><p className="font-black text-rose-500">-${parseFloat(exp.amount).toFixed(2)}</p>
                                {!isSubmitted && (
                                    <button onClick={() => {
                                        const updated = expenses.filter((_, i) => i !== idx);
                                        setExpenses(updated);
                                        const dbMode = viewMode.replace(/\s+/g, '_');
                                        setDoc(doc(db, 'church_reports', `${selectedSheetDate}_${dbMode}`), { expenses: updated }, { merge: true });
                                    }} className="text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100"><Plus className="rotate-45" size={16}/></button>
                                )}</div>
                            </div>
                        ))
                    )}
                </div>
                {!isSubmitted && (
                    <form onSubmit={(e) => {
                        e.preventDefault();
                        const data = new FormData(e.target);
                        const newExp = { category: data.get('cat'), amount: data.get('amt'), date: new Date().toLocaleDateString() };
                        const updated = [...expenses, newExp];
                        setExpenses(updated);
                        const dbMode = viewMode.replace(/\s+/g, '_');
                        setDoc(doc(db, 'church_reports', `${selectedSheetDate}_${dbMode}`), { expenses: updated }, { merge: true });
                        e.target.reset();
                    }} className="bg-slate-900 p-5 rounded-3xl space-y-3 shadow-xl">
                        <select name="cat" required className="w-full p-3 bg-slate-800 text-white rounded-xl border-none text-sm font-bold outline-none">
                            {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                        </select>
                        <div className="flex gap-2">
                            <input name="amt" type="number" step="0.01" required placeholder="Amount" className="flex-1 p-3 bg-slate-800 text-white rounded-xl border-none text-sm font-bold outline-none" />
                            <button type="submit" className="bg-indigo-600 text-white p-3 rounded-xl hover:bg-indigo-500 transition-all"><Plus/></button>
                        </div>
                    </form>
                )}
            </section>
        </div>

        {/* DIAGNOSTIC PANEL */}
        <div className="max-w-6xl mx-auto mt-12 px-4">
            <div className="bg-slate-900 rounded-[2rem] p-6 font-mono text-[10px] text-indigo-300 h-40 overflow-y-auto custom-scrollbar border border-indigo-500/20">
                {debugLog.map((log, i) => <div key={i} className="mb-1">{log}</div>)}
                <div className="animate-pulse">_</div>
            </div>
        </div>

        {/* MODAL: RECOVERY */}
        {showScanner && (
            <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-6">
                <div className="bg-white w-full max-w-xl rounded-[2rem] p-8 shadow-2xl max-h-[80vh] flex flex-col">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-black text-slate-900 uppercase">Database Archive</h3>
                        <button onClick={() => setShowScanner(false)} className="text-slate-400 hover:text-rose-500"><XCircle size={24}/></button>
                    </div>
                    <div className="overflow-y-auto flex-1 space-y-2 pr-2 custom-scrollbar">
                        {foundDates.map((item, i) => (
                            <button key={i} onClick={() => { setSelectedSheetDate(item.id); setViewMode(item.type); setShowScanner(false); }} className="w-full flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl hover:bg-indigo-50 transition-all group">
                                <div>
                                    <p className="font-black text-slate-800 tracking-tight">Week of {item.id}</p>
                                    <p className="text-[9px] font-bold text-indigo-600 uppercase">{item.type}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-sm font-black text-emerald-600">${item.total.toLocaleString()}</p>
                                    <p className="text-[8px] font-bold text-slate-400 uppercase group-hover:text-indigo-600 transition-colors">Load Data →</p>
                                </div>
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        )}

        <footer className="fixed bottom-6 left-1/2 -translate-x-1/2 w-full max-w-md px-6 z-40">
            <div className="bg-white/80 backdrop-blur-xl border border-white/50 shadow-2xl rounded-full p-2 flex gap-2">
                <button 
                    onClick={() => {
                        if(window.confirm("Submit final audit? This locks data.")) {
                            const dbMode = viewMode.replace(/\s+/g, '_');
                            setDoc(doc(db, 'church_reports', `${selectedSheetDate}_${dbMode}`), { status: 'submitted' }, { merge: true });
                        }
                    }} 
                    disabled={isSubmitted} 
                    className={`flex-1 py-4 rounded-full text-[10px] font-black uppercase tracking-widest transition-all flex items-center justify-center gap-2 ${isSubmitted ? 'bg-slate-100 text-slate-400' : 'bg-indigo-600 text-white shadow-lg'}`}
                >
                    {isSubmitted ? <CheckCircle2 size={14}/> : null}
                    {isSubmitted ? 'Sheet Locked' : 'Finalize & Close'}
                </button>
            </div>
        </footer>

        <style>{`
            .custom-scrollbar::-webkit-scrollbar { width: 5px; }
            .custom-scrollbar::-webkit-scrollbar-thumb { background: #cbd5e1; border-radius: 10px; }
        `}</style>
    </div>
  );
}
