import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  onSnapshot,
  collection,
  getDocs
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
  Bug,
  Lock,
  Unlock
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

  const addLog = (msg) => setDebugLog(prev => [`[${new Date().toLocaleTimeString()}] ${msg}`, ...prev].slice(0, 30));

  // 1. Initial Auth
  useEffect(() => {
    const initAuth = async () => {
      try {
        addLog("Initializing Firebase Connection...");
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) { addLog("Auth Error: " + err.message); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
        setUser(u);
        if(u) addLog(`Cloud Connected: Session ID ${u.uid.slice(0,8)}...`);
    });
    return () => unsubscribe();
  }, []);

  // 2. Real-time Data Sync for Selected Date
  useEffect(() => {
    if (!user || !isAuthenticated || !selectedSheetDate) return;
    
    addLog(`Syncing data for week: ${selectedSheetDate}`);
    const docPath = doc(db, 'church_reports', selectedSheetDate);
    
    const unsubscribe = onSnapshot(docPath, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setRevenueData(data.revenue || {});
        setExpenses(data.expenses || []);
        setManualStartingBalance(data.startingBalance || 0);
        setIsSubmitted(data.status === 'submitted');
        addLog(`Found existing record for ${selectedSheetDate}`);
      } else {
        setRevenueData({}); setExpenses([]); setManualStartingBalance(0); setIsSubmitted(false);
        addLog(`No cloud record yet for ${selectedSheetDate} (Started new draft)`);
      }
    }, (err) => addLog("Database Access Error: " + err.message));
    
    return () => unsubscribe();
  }, [user, isAuthenticated, selectedSheetDate]);

  // 3. Deep Scan (The Recovery Button)
  const performDeepScan = async () => {
    if (!user) return addLog("Cannot scan: Not authenticated.");
    setIsScanning(true);
    addLog("Scanning Cloud Storage for 'church_reports'...");
    
    try {
      const collectionRef = collection(db, 'church_reports');
      const querySnapshot = await getDocs(collectionRef);
      
      const results = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        results.push({ 
          id: doc.id, 
          status: data.status || 'draft',
          revTotal: Object.values(data.revenue || {}).reduce((sum, val) => sum + (parseFloat(val) || 0), 0)
        });
      });

      // Sort by date (newest first)
      results.sort((a, b) => {
        const [am, ad, ay] = a.id.split('-').map(Number);
        const [bm, bd, by] = b.id.split('-').map(Number);
        return new Date(2000 + by, bm - 1, bd) - new Date(2000 + ay, am - 1, ad);
      });

      setFoundDates(results);
      setShowScanner(true);
      addLog(`Scan Complete. Found ${results.length} records.`);
    } catch (e) {
      addLog("Scan Failed: " + e.message);
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
      addLog("Login verified.");
    } else {
      setLoginError('Invalid Login or Password');
    }
  };

  if (!isAuthenticated) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6 font-sans">
      <div className="w-full max-w-md bg-white rounded-[3rem] p-12 shadow-2xl">
        <div className="mb-8 text-center">
            <div className="bg-indigo-600 w-16 h-16 rounded-3xl flex items-center justify-center text-white mx-auto mb-4 shadow-lg">
                <Lock size={32}/>
            </div>
            <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tighter">Finance Portal</h1>
            <p className="text-slate-400 text-[10px] font-bold uppercase mt-1">Voices of Faith South</p>
        </div>
        <form onSubmit={handleLogin} className="space-y-4">
          <input name="loginId" type="text" placeholder="Admin ID" required className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 ring-indigo-500/20" />
          <input name="password" type="password" placeholder="Password" required className="w-full px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 ring-indigo-500/20" />
          {loginError && <p className="text-rose-500 text-[10px] font-black uppercase text-center">{loginError}</p>}
          <button type="submit" className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-indigo-600 transition-all shadow-xl">Sign In</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-48 font-sans">
        {/* Navigation & Recovery Header */}
        <header className="max-w-6xl mx-auto mb-8 flex flex-wrap gap-4 items-stretch">
            <div className="flex-1 min-w-[300px] bg-white p-6 rounded-[2rem] shadow-sm border border-slate-200 flex justify-between items-center">
                <button onClick={() => {
                     const [m, d, y] = selectedSheetDate.split('-').map(Number);
                     const date = new Date(2000 + y, m - 1, d);
                     date.setDate(date.getDate() - 7);
                     setSelectedSheetDate(formatDate(date));
                }} className="p-3 hover:bg-slate-100 rounded-2xl text-slate-400 transition-all"><ChevronLeft/></button>
                <div className="text-center">
                    <h2 className="text-xl font-black text-slate-800 tracking-tight">Week of {selectedSheetDate}</h2>
                    <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Selected Period</p>
                </div>
                <button onClick={() => {
                     const [m, d, y] = selectedSheetDate.split('-').map(Number);
                     const date = new Date(2000 + y, m - 1, d);
                     date.setDate(date.getDate() + 7);
                     setSelectedSheetDate(formatDate(date));
                }} className="p-3 hover:bg-slate-100 rounded-2xl text-slate-400 transition-all"><ChevronRight/></button>
            </div>
            
            <button 
                onClick={performDeepScan}
                disabled={isScanning}
                className="bg-slate-900 px-8 rounded-[2rem] font-black uppercase text-[11px] text-white hover:bg-indigo-600 disabled:bg-slate-400 transition-all flex items-center gap-3 shadow-lg"
            >
                {isScanning ? <RefreshCw className="animate-spin" size={16}/> : <History size={16}/>}
                History & Recovery
            </button>
        </header>

        {/* Totals Grid */}
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-3">Starting Balance</p>
                <input 
                    type="number" 
                    value={manualStartingBalance} 
                    disabled={isSubmitted} 
                    onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        setManualStartingBalance(val);
                        setDoc(doc(db, 'church_reports', selectedSheetDate), { startingBalance: val }, { merge: true });
                    }} 
                    className="text-2xl font-black text-slate-800 outline-none w-full bg-transparent border-b-2 border-slate-100 focus:border-indigo-500 transition-colors" 
                />
            </div>
            <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Total Revenue</p>
                <p className="text-3xl font-black text-emerald-600">${currentTotals.rev.toFixed(2)}</p>
            </div>
            <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-1">Total Expenses</p>
                <p className="text-3xl font-black text-rose-600">${currentTotals.exp.toFixed(2)}</p>
            </div>
            <div className="bg-indigo-600 p-8 rounded-[2rem] text-white shadow-xl">
                <p className="text-[10px] font-black text-indigo-200 uppercase mb-1">Ending Balance</p>
                <p className="text-3xl font-black">${currentTotals.end.toFixed(2)}</p>
            </div>
        </div>

        {/* Input Sections */}
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
            {/* Revenue Column */}
            <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-200">
                <h3 className="font-black text-slate-800 uppercase text-xs tracking-widest mb-6 flex items-center gap-2">
                    <TrendingUp className="text-emerald-500" size={18}/> Weekly Revenue Breakdown
                </h3>
                <div className="space-y-4">
                    {REVENUE_CATEGORIES.map(cat => (
                        <div key={cat} className="group">
                            <label className="text-[10px] font-black text-slate-400 uppercase ml-1 block mb-1 group-focus-within:text-indigo-600 transition-colors">{cat}</label>
                            <div className="relative">
                                <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300 font-bold">$</span>
                                <input 
                                    type="number" 
                                    disabled={isSubmitted}
                                    placeholder="0.00"
                                    value={revenueData[cat] || ''}
                                    onChange={(e) => {
                                        const updated = { ...revenueData, [cat]: e.target.value };
                                        setRevenueData(updated);
                                        setDoc(doc(db, 'church_reports', selectedSheetDate), { revenue: updated }, { merge: true });
                                    }}
                                    className="w-full pl-8 pr-4 py-3 bg-slate-50 border border-slate-100 rounded-2xl outline-none focus:ring-2 ring-indigo-500/20 font-bold text-slate-700 transition-all"
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Expenses Column */}
            <div className="bg-white p-8 rounded-[3rem] shadow-sm border border-slate-200 flex flex-col">
                <h3 className="font-black text-slate-800 uppercase text-xs tracking-widest mb-6 flex items-center gap-2">
                    <Wallet className="text-rose-500" size={18}/> Weekly Expense Log
                </h3>
                
                <div className="flex-1 overflow-y-auto max-h-[500px] mb-6 space-y-3 pr-2">
                    {expenses.length === 0 ? (
                        <div className="h-40 flex items-center justify-center border-2 border-dashed border-slate-100 rounded-[2rem] text-slate-300 font-bold italic text-sm uppercase">
                            No expenses added
                        </div>
                    ) : (
                        expenses.map((exp, idx) => (
                            <div key={idx} className="bg-slate-50 p-4 rounded-2xl border border-slate-100 flex justify-between items-center">
                                <div>
                                    <p className="font-bold text-slate-700 text-sm">{exp.category}</p>
                                    <p className="text-[10px] text-slate-400 font-black uppercase">{exp.date}</p>
                                </div>
                                <p className="font-black text-rose-500">-${parseFloat(exp.amount).toFixed(2)}</p>
                            </div>
                        ))
                    )}
                </div>

                {!isSubmitted && (
                    <form onSubmit={(e) => {
                        e.preventDefault();
                        const data = new FormData(e.target);
                        const newExp = {
                            category: data.get('cat'),
                            amount: data.get('amt'),
                            date: new Date().toLocaleDateString()
                        };
                        const updated = [...expenses, newExp];
                        setExpenses(updated);
                        setDoc(doc(db, 'church_reports', selectedSheetDate), { expenses: updated }, { merge: true });
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

        {/* SYSTEM LOG PANEL */}
        <div className="max-w-6xl mx-auto mt-12 bg-slate-900 rounded-[3rem] p-10 shadow-2xl overflow-hidden border-4 border-slate-800">
            <div className="flex items-center gap-3 mb-6">
                <Bug className="text-indigo-400" size={20}/>
                <h4 className="text-indigo-100 font-black uppercase text-xs tracking-widest">Database Diagnostics</h4>
            </div>
            <div className="bg-black/50 p-6 rounded-2xl font-mono text-[11px] text-emerald-400 space-y-1 h-40 overflow-y-auto custom-scrollbar">
                {debugLog.length === 0 ? "> Initializing system..." : debugLog.map((log, i) => <div key={i}>{log}</div>)}
            </div>
        </div>

        {/* RECOVERY MODAL */}
        {showScanner && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-6">
                <div className="bg-white w-full max-w-2xl rounded-[3rem] p-12 shadow-2xl max-h-[85vh] flex flex-col">
                    <div className="flex justify-between items-start mb-8">
                        <div>
                            <h3 className="text-2xl font-black uppercase text-slate-800 tracking-tighter">History Found</h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Available cloud records</p>
                        </div>
                        <button onClick={() => setShowScanner(false)} className="bg-slate-100 p-3 rounded-2xl hover:text-rose-500 transition-all"><Plus className="rotate-45"/></button>
                    </div>
                    
                    <div className="overflow-y-auto flex-1 space-y-3 pr-4 custom-scrollbar">
                        {foundDates.length === 0 ? (
                            <div className="text-center py-20 bg-slate-50 rounded-[2rem]">
                                <AlertCircle className="mx-auto text-amber-500 mb-4" size={48}/>
                                <p className="text-slate-800 font-black uppercase text-sm">No records detected</p>
                                <p className="text-slate-400 text-xs mt-2 italic">Ensure you have saved a report previously.</p>
                            </div>
                        ) : (
                            foundDates.map((item, i) => (
                                <button 
                                    key={i}
                                    onClick={() => { setSelectedSheetDate(item.id); setShowScanner(false); }}
                                    className="w-full text-left p-6 bg-slate-50 hover:bg-indigo-50 rounded-3xl border border-slate-100 flex justify-between items-center transition-all group"
                                >
                                    <div>
                                        <span className="text-lg font-black text-slate-800">Week of {item.id}</span>
                                        <div className="flex gap-3 mt-1">
                                            <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md text-white ${item.status === 'submitted' ? 'bg-indigo-600' : 'bg-emerald-500'}`}>{item.status}</span>
                                            <span className="text-[10px] font-bold text-slate-400 tracking-wider">REV: ${item.revTotal.toFixed(2)}</span>
                                        </div>
                                    </div>
                                    <span className="text-[10px] font-black text-indigo-600 uppercase group-hover:translate-x-1 transition-transform">Load Report →</span>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </div>
        )}

        {/* Global Footer Controls */}
        <footer className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-lg px-6 z-50">
            <div className="bg-white/90 backdrop-blur-2xl border border-white/50 shadow-2xl rounded-full p-3 flex justify-between items-center">
                <button 
                    onClick={() => {
                        const csv = `Church Financial Report - ${selectedSheetDate}\n\nREVENUE\n` + 
                            Object.entries(revenueData).map(([k,v]) => `${k},${v}`).join('\n') + 
                            `\n\nEXPENSES\n` + expenses.map(e => `${e.category},${e.amount}`).join('\n') +
                            `\n\nStarting Balance,${currentTotals.start}\nTotal Revenue,${currentTotals.rev}\nTotal Expenses,${currentTotals.exp}\nEnding Balance,${currentTotals.end}`;
                        const link = document.createElement("a");
                        link.href = 'data:text/csv;charset=utf-8,' + encodeURI(csv);
                        link.download = `VOF_South_${selectedSheetDate}.csv`;
                        link.click();
                    }}
                    className="px-8 py-4 rounded-full text-[11px] font-black uppercase text-slate-500 hover:bg-slate-50 transition-all"
                >
                    Export CSV
                </button>
                <button 
                    onClick={() => {
                        if(window.confirm("Lock this report? Changes will be disabled.")) {
                            setDoc(doc(db, 'church_reports', selectedSheetDate), { status: 'submitted' }, { merge: true });
                        }
                    }} 
                    disabled={isSubmitted} 
                    className={`px-12 py-4 rounded-full text-[11px] font-black uppercase tracking-widest transition-all ${isSubmitted ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-indigo-600 text-white shadow-xl hover:scale-105 hover:bg-indigo-700'}`}
                >
                    {isSubmitted ? <span className="flex items-center gap-2"><Lock size={14}/> Report Locked</span> : 'Finalize Week'}
                </button>
            </div>
        </footer>

        <style>{`
            .custom-scrollbar::-webkit-scrollbar { width: 6px; }
            .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
            .custom-scrollbar::-webkit-scrollbar-thumb { background: #334155; border-radius: 10px; }
            .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #475569; }
        `}</style>
    </div>
  );
}
