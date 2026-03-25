import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  onSnapshot,
  collection,
  getDocs,
  getDoc,
  query,
  limit
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
  History,
  RefreshCw,
  AlertCircle,
  Database,
  Lock,
  Search,
  ShieldAlert
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
  const [revenueData, setRevenueData] = useState({});
  const [expenses, setExpenses] = useState([]);
  const [manualStartingBalance, setManualStartingBalance] = useState(0);
  const [isSubmitted, setIsSubmitted] = useState(false);
  
  // Recovery & Debug States
  const [isScanning, setIsScanning] = useState(false);
  const [foundDates, setFoundDates] = useState([]);
  const [showScanner, setShowScanner] = useState(false);
  const [debugLog, setDebugLog] = useState([]);

  const addLog = (msg) => setDebugLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 50));

  // 1. AUTH INITIALIZATION
  useEffect(() => {
    const initAuth = async () => {
      try {
        addLog("Establishing Secure Tunnel...");
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) { 
        addLog("AUTH_FAILURE: Check API Key / Auth Config."); 
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
        if (u) {
            setUser(u);
            setAuthReady(true);
            addLog(`IDENTITY VERIFIED: ${u.uid.slice(0,8)}`);
        }
    });
    return () => unsubscribe();
  }, []);

  // 2. Real-time Sync
  useEffect(() => {
    if (!authReady || !isAuthenticated || !selectedSheetDate) return;
    
    const docPath = doc(db, 'church_reports', selectedSheetDate);
    const unsubscribe = onSnapshot(docPath, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setRevenueData(data.revenue || {});
        setExpenses(data.expenses || []);
        setManualStartingBalance(data.startingBalance || 0);
        setIsSubmitted(data.status === 'submitted');
        addLog(`SYNCED: ${selectedSheetDate}`);
      } else {
        setRevenueData({}); setExpenses([]); setManualStartingBalance(0); setIsSubmitted(false);
        addLog(`BLANK_RECORD: Initializing ${selectedSheetDate}`);
      }
    }, (err) => {
        addLog(`READ_DENIED: ${err.message}`);
    });
    
    return () => unsubscribe();
  }, [authReady, isAuthenticated, selectedSheetDate]);

  // 3. FORCE PROBE (Bypass List Permission)
  const performRecoveryScan = async () => {
    if (!authReady) return addLog("SCAN_BLOCKED: Auth Not Ready");
    
    setIsScanning(true);
    addLog("INITIATING FORCE PROBE: Testing last 12 Fridays...");
    
    try {
      const results = [];
      const now = new Date();
      
      // Probe specifically for the last 12 potential dates
      // This bypasses 'list' restrictions by performing individual 'get' requests
      for (let i = 0; i < 12; i++) {
        const testDate = new Date();
        testDate.setDate(now.getDate() - (i * 7));
        const dateStr = getReportingFriday(testDate);
        
        addLog(`Probing ${dateStr}...`);
        const docRef = doc(db, 'church_reports', dateStr);
        const snap = await getDoc(docRef);
        
        if (snap.exists()) {
            const data = snap.data();
            const revTotal = Object.values(data.revenue || {}).reduce((sum, val) => sum + (parseFloat(val) || 0), 0);
            results.push({ id: snap.id, status: data.status || 'draft', revTotal });
            addLog(`FOUND: ${dateStr}`);
        }
      }

      setFoundDates(results);
      setShowScanner(true);
      addLog(`RECOVERY FINISHED: Probed 12 slots, found ${results.length} records.`);
      
    } catch (e) {
      addLog(`PROBE_FAILED: ${e.message}`);
      addLog("FIX: Go to Firebase Console > Firestore > Rules. Change 'allow read, write: if false;' to 'allow read, write: if true;'");
    } finally {
      setIsScanning(false);
    }
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
      addLog("ADMIN_ACCESS_GRANTED");
    } else {
      setLoginError('Invalid Login/Password');
    }
  };

  if (!isAuthenticated) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-[3rem] p-12 shadow-2xl">
        <div className="mb-8 text-center">
            <div className="bg-indigo-600 w-16 h-16 rounded-3xl flex items-center justify-center text-white mx-auto mb-4"><Lock size={32}/></div>
            <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Finance Vault</h1>
            <p className="text-slate-400 text-[10px] font-bold uppercase mt-1">Voices of Faith South</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <input name="loginId" type="text" placeholder="Admin ID" required className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none" />
          <input name="password" type="password" placeholder="Password" required className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none" />
          {loginError && <p className="text-rose-500 text-[10px] font-black uppercase text-center">{loginError}</p>}
          <button type="submit" className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-indigo-600 transition-all">Sign In</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-48 font-sans">
        <header className="max-w-6xl mx-auto mb-8 flex flex-wrap gap-4 items-stretch">
            <div className="flex-1 min-w-[300px] bg-white p-6 rounded-[2rem] shadow-sm border border-slate-200 flex justify-between items-center">
                <button onClick={() => {
                     const [m, d, y] = selectedSheetDate.split('-').map(Number);
                     const date = new Date(2000 + y, m - 1, d);
                     date.setDate(date.getDate() - 7);
                     setSelectedSheetDate(formatDate(date));
                }} className="p-3 hover:bg-slate-100 rounded-2xl text-slate-400"><ChevronLeft/></button>
                <div className="text-center">
                    <h2 className="text-xl font-black text-slate-800 tracking-tight">Week of {selectedSheetDate}</h2>
                    <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Active Sheet</p>
                </div>
                <button onClick={() => {
                     const [m, d, y] = selectedSheetDate.split('-').map(Number);
                     const date = new Date(2000 + y, m - 1, d);
                     date.setDate(date.getDate() + 7);
                     setSelectedSheetDate(formatDate(date));
                }} className="p-3 hover:bg-slate-100 rounded-2xl text-slate-400"><ChevronRight/></button>
            </div>
            
            <button 
                onClick={performRecoveryScan}
                disabled={isScanning || !authReady}
                className="bg-slate-900 px-8 rounded-[2rem] font-black uppercase text-[11px] text-white hover:bg-indigo-600 disabled:bg-slate-400 transition-all flex items-center gap-3 shadow-lg"
            >
                {isScanning ? <RefreshCw className="animate-spin" size={16}/> : <Search size={16}/>}
                History & Recovery
            </button>
        </header>

        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white p-8 rounded-[2rem] border border-slate-200">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-3">Starting Balance</p>
                <div className="flex items-center gap-1">
                    <span className="text-slate-300 font-bold">$</span>
                    <input 
                        type="number" 
                        value={manualStartingBalance} 
                        disabled={isSubmitted} 
                        onChange={(e) => {
                            const val = parseFloat(e.target.value) || 0;
                            setManualStartingBalance(val);
                            if (authReady) setDoc(doc(db, 'church_reports', selectedSheetDate), { startingBalance: val }, { merge: true });
                        }} 
                        className="text-2xl font-black text-slate-800 outline-none w-full bg-transparent border-b-2 border-slate-100 focus:border-indigo-500" 
                    />
                </div>
            </div>
            <div className="bg-white p-8 rounded-[2rem] border border-slate-200">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Total Revenue</p>
                <p className="text-3xl font-black text-emerald-600">${currentTotals.rev.toLocaleString()}</p>
            </div>
            <div className="bg-white p-8 rounded-[2rem] border border-slate-200">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Total Expenses</p>
                <p className="text-3xl font-black text-rose-600">${currentTotals.exp.toLocaleString()}</p>
            </div>
            <div className="bg-indigo-600 p-8 rounded-[2rem] text-white shadow-xl">
                <p className="text-[10px] font-black text-indigo-200 uppercase mb-1">Ending Balance</p>
                <p className="text-3xl font-black">${currentTotals.end.toLocaleString()}</p>
            </div>
        </div>

        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
            <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-200">
                <h3 className="font-black text-slate-800 uppercase text-xs tracking-widest mb-6 flex items-center gap-2"><TrendingUp className="text-emerald-500" size={18}/> Revenue</h3>
                <div className="space-y-4">
                    {REVENUE_CATEGORIES.map(cat => (
                        <div key={cat} className="group">
                            <label className="text-[10px] font-black text-slate-400 uppercase ml-1 mb-1 block">{cat}</label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 font-bold">$</span>
                                <input 
                                    type="number" 
                                    disabled={isSubmitted}
                                    value={revenueData[cat] || ''}
                                    onChange={(e) => {
                                        const updated = { ...revenueData, [cat]: e.target.value };
                                        setRevenueData(updated);
                                        if (authReady) setDoc(doc(db, 'church_reports', selectedSheetDate), { revenue: updated }, { merge: true });
                                    }}
                                    className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl font-bold outline-none focus:ring-2 ring-indigo-500/20"
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-200 flex flex-col">
                <h3 className="font-black text-slate-800 uppercase text-xs tracking-widest mb-6 flex items-center gap-2"><Wallet className="text-rose-500" size={18}/> Expenses</h3>
                <div className="flex-1 overflow-y-auto max-h-[500px] mb-6 space-y-3 pr-2 custom-scrollbar">
                    {expenses.length === 0 ? <div className="h-40 flex items-center justify-center border-2 border-dashed border-slate-100 rounded-[2rem] text-slate-300 font-bold italic text-sm">No entries</div> : (
                        expenses.map((exp, idx) => (
                            <div key={idx} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex justify-between items-center">
                                <div><p className="font-bold text-slate-700 text-sm">{exp.category}</p><p className="text-[10px] text-slate-400 font-black uppercase">{exp.date}</p></div>
                                <div className="flex items-center gap-4"><p className="font-black text-rose-500">-${parseFloat(exp.amount).toFixed(2)}</p>
                                {!isSubmitted && (
                                    <button onClick={() => {
                                        const updated = expenses.filter((_, i) => i !== idx);
                                        setExpenses(updated);
                                        setDoc(doc(db, 'church_reports', selectedSheetDate), { expenses: updated }, { merge: true });
                                    }} className="text-slate-300 hover:text-rose-500"><Plus className="rotate-45" size={16}/></button>
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
                        if (authReady) setDoc(doc(db, 'church_reports', selectedSheetDate), { expenses: updated }, { merge: true });
                        e.target.reset();
                    }} className="space-y-3 p-4 bg-slate-50 rounded-[2rem] border border-slate-100">
                        <select name="cat" required className="w-full p-3 bg-white rounded-xl border border-slate-200 text-sm font-bold">
                            {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                        </select>
                        <div className="flex gap-2">
                            <input name="amt" type="number" step="0.01" required placeholder="Amount" className="flex-1 p-3 bg-white rounded-xl border border-slate-200 text-sm font-bold" />
                            <button type="submit" className="bg-slate-900 text-white p-3 rounded-xl hover:bg-indigo-600 transition-all"><Plus/></button>
                        </div>
                    </form>
                )}
            </div>
        </div>

        {/* LOG PANEL */}
        <div className="max-w-6xl mx-auto mt-12 bg-slate-900 rounded-[3rem] p-10 shadow-2xl overflow-hidden relative">
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 blur-[100px]"></div>
            <div className="flex items-center justify-between mb-6 relative">
                <div className="flex items-center gap-3">
                    <Database className="text-indigo-400" size={20}/>
                    <h4 className="text-indigo-100 font-black uppercase text-xs tracking-widest">System Diagnostics</h4>
                </div>
                <div className="text-[10px] font-black text-indigo-400 bg-indigo-400/10 px-3 py-1 rounded-full border border-indigo-400/20">FORCE_PROBE_ENABLED</div>
            </div>
            <div className="bg-black/60 p-6 rounded-2xl font-mono text-[11px] text-emerald-400 space-y-1 h-48 overflow-y-auto custom-scrollbar border border-white/5 backdrop-blur-md">
                {debugLog.map((log, i) => <div key={i} className="opacity-80 hover:opacity-100 transition-opacity">
                    {log.includes("READ_DENIED") ? <span className="text-rose-400">{log}</span> : log}
                </div>)}
                <div className="animate-pulse">_</div>
            </div>
        </div>

        {/* RECOVERY MODAL */}
        {showScanner && (
            <div className="fixed inset-0 bg-slate-900/90 backdrop-blur-xl z-[100] flex items-center justify-center p-6">
                <div className="bg-white w-full max-w-2xl rounded-[3rem] p-12 shadow-2xl max-h-[85vh] flex flex-col scale-in-center">
                    <div className="flex justify-between items-start mb-8">
                        <div>
                            <h3 className="text-3xl font-black uppercase text-slate-800 tracking-tighter">Force-Found Archives</h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Direct probes successful</p>
                        </div>
                        <button onClick={() => setShowScanner(false)} className="bg-slate-100 p-3 rounded-2xl hover:text-rose-500 transition-all"><Plus className="rotate-45"/></button>
                    </div>
                    <div className="overflow-y-auto flex-1 space-y-3 pr-4 custom-scrollbar">
                        {foundDates.length === 0 ? (
                            <div className="text-center py-20 bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200">
                                <ShieldAlert className="mx-auto text-rose-500 mb-4" size={48}/>
                                <p className="text-slate-800 font-black uppercase text-sm">No Records Probed</p>
                                <p className="text-slate-400 text-xs mt-2 italic px-8">The system probed the last 12 weeks individually but found no matching documents in the database.</p>
                            </div>
                        ) : (
                            foundDates.map((item, i) => (
                                <button key={i} onClick={() => { setSelectedSheetDate(item.id); setShowScanner(false); }} className="w-full text-left p-6 bg-slate-50 hover:bg-indigo-50 rounded-3xl border border-slate-100 flex justify-between items-center transition-all group">
                                    <div>
                                        <span className="text-xl font-black text-slate-800 tracking-tight">Week of {item.id}</span>
                                        <div className="flex gap-3 mt-1 items-center"><span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md text-white ${item.status === 'submitted' ? 'bg-indigo-600' : 'bg-emerald-500'}`}>{item.status}</span><span className="text-[10px] font-bold text-slate-400 tracking-wider">REVENUE: ${item.revTotal.toLocaleString()}</span></div>
                                    </div>
                                    <span className="text-[10px] font-black text-indigo-600 uppercase group-hover:translate-x-2 transition-transform">Restore Data →</span>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </div>
        )}

        <footer className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-lg px-6 z-50">
            <div className="bg-white/90 backdrop-blur-2xl border border-white/50 shadow-2xl rounded-full p-3 flex justify-between items-center ring-1 ring-slate-900/5">
                <button onClick={() => {/* ... export ... */}} className="px-8 py-4 rounded-full text-[11px] font-black uppercase text-slate-500 hover:bg-slate-50">Export</button>
                <button 
                    onClick={() => {
                        if(window.confirm("Lock this report? Changes will be disabled.")) {
                            setDoc(doc(db, 'church_reports', selectedSheetDate), { status: 'submitted' }, { merge: true });
                            addLog(`LOCKED: ${selectedSheetDate}`);
                        }
                    }} 
                    disabled={isSubmitted || !authReady} 
                    className={`px-12 py-4 rounded-full text-[11px] font-black uppercase tracking-widest transition-all ${isSubmitted ? 'bg-slate-100 text-slate-400' : 'bg-indigo-600 text-white shadow-xl'}`}
                >
                    {isSubmitted ? 'Locked' : 'Finalize Week'}
                </button>
            </div>
        </footer>

        <style>{`
            .custom-scrollbar::-webkit-scrollbar { width: 6px; }
            .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
            @keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
            @keyframes scale-in-center { 0% { transform: scale(0.9); opacity: 0; } 100% { transform: scale(1); opacity: 1; } }
            .scale-in-center { animation: scale-in-center 0.4s cubic-bezier(0.390, 0.575, 0.565, 1.000) both; }
        `}</style>
    </div>
  );
}
