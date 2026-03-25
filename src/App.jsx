import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  onSnapshot,
  collection,
  getDocs,
  query,
  limit,
  orderBy
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
  Download,
  Lock,
  Search,
  Database,
  RefreshCw,
  AlertCircle,
  History,
  CheckCircle2
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

const INCOME_DAYS = ['Sunday', 'Tuesday', 'End of Week', 'End of Month'];
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
  const [activeIncomeDay, setActiveIncomeDay] = useState('Sunday');
  const [expenseCategory, setExpenseCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [selectedSheetDate, setSelectedSheetDate] = useState(getReportingFriday(new Date()));
  const [revenueData, setRevenueData] = useState({});
  const [expenses, setExpenses] = useState([]);
  const [manualStartingBalance, setManualStartingBalance] = useState(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  
  // Recovery States
  const [isScanning, setIsScanning] = useState(false);
  const [foundDates, setFoundDates] = useState([]);
  const [showScanner, setShowScanner] = useState(false);
  const [scanStatus, setScanStatus] = useState('idle');

  // 1. AUTHENTICATION
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) { console.error("Auth Failure:", err); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, setUser);
    return () => unsubscribe();
  }, []);

  // 2. DATA SYNC - Listens to the current selected date
  useEffect(() => {
    if (!user || !isAuthenticated || !selectedSheetDate) return;

    const docPath = doc(db, 'church_reports', selectedSheetDate);
    const unsubscribe = onSnapshot(docPath, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setRevenueData(data.revenue || {});
        setExpenses(data.expenses || []);
        setManualStartingBalance(data.startingBalance ?? null);
        setIsSubmitted(data.status === 'submitted');
      } else {
        setRevenueData({});
        setExpenses([]);
        setManualStartingBalance(0);
        setIsSubmitted(false);
      }
    }, (err) => {
        console.error("Sync Error:", err);
    });

    return () => unsubscribe();
  }, [user, isAuthenticated, selectedSheetDate]);

  // 3. ENHANCED RECOVERY TOOL: Deep Scan
  const performDeepScan = async () => {
    if (!user) return;
    setIsScanning(true);
    setScanStatus('scanning');
    try {
      // Specifically target 'church_reports'
      const collectionRef = collection(db, 'church_reports');
      const querySnapshot = await getDocs(collectionRef);
      
      const results = [];
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        results.push({ 
          id: doc.id, 
          status: data.status || 'draft',
          revTotal: Object.values(data.revenue || {}).reduce((sum, day) => 
            sum + Object.values(day).reduce((s, v) => s + (parseFloat(v) || 0), 0), 0
          )
        });
      });

      // Simple date sort (M-D-YY format needs custom sort to be accurate)
      results.sort((a, b) => {
        const parseDate = (s) => {
            const [m, d, y] = s.split('-').map(Number);
            return new Date(2000 + y, m - 1, d);
        };
        return parseDate(b.id) - parseDate(a.id);
      });

      setFoundDates(results);
      setScanStatus(results.length > 0 ? 'success' : 'empty');
      setShowScanner(true);
    } catch (e) {
      console.error("Scanning failed", e);
      setScanStatus('error');
    } finally {
      setIsScanning(false);
    }
  };

  // 4. CALCULATIONS
  const currentWeekTotals = useMemo(() => {
    let totalRev = 0;
    Object.values(revenueData).forEach(dayData => {
      Object.values(dayData).forEach(val => totalRev += (parseFloat(val) || 0));
    });
    const exp = expenses.reduce((acc, e) => acc + (parseFloat(e.amount) || 0), 0);
    const start = manualStartingBalance !== null ? parseFloat(manualStartingBalance) : 0;
    return { rev: totalRev, exp, net: totalRev - exp, start, end: start + (totalRev - exp) };
  }, [revenueData, expenses, manualStartingBalance]);

  const handleLogin = (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    if (data.get('loginId') === ADMIN_CREDENTIALS.loginId && data.get('password') === ADMIN_CREDENTIALS.password) {
      setIsAuthenticated(true);
    } else {
      setLoginError('Invalid Credentials');
    }
  };

  const changeWeek = (direction) => {
    const [m, d, y] = selectedSheetDate.split('-').map(Number);
    const date = new Date(2000 + y, m - 1, d);
    date.setDate(date.getDate() + (direction * 7));
    setSelectedSheetDate(formatDate(date));
  };

  const updateCloudData = async (updates) => {
    if (!user || isSubmitted) return;
    const docRef = doc(db, 'church_reports', selectedSheetDate);
    await setDoc(docRef, { ...updates, lastUpdated: new Date().toISOString() }, { merge: true });
  };

  if (!isAuthenticated) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-md bg-white rounded-[2.5rem] p-10 shadow-2xl">
        <div className="flex justify-center mb-8">
          <div className="bg-indigo-600 p-5 rounded-3xl text-white shadow-xl shadow-indigo-200">
            <Lock size={32} />
          </div>
        </div>
        <h1 className="text-3xl font-black text-center text-slate-800 uppercase tracking-tight mb-8">Financial Portal</h1>
        <form onSubmit={handleLogin} className="space-y-4">
          <input name="loginId" type="text" placeholder="Admin ID" required className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-indigo-600 font-bold" />
          <input name="password" type="password" placeholder="Password" required className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-indigo-600 font-bold" />
          {loginError && <p className="text-rose-500 text-[10px] font-black uppercase text-center">{loginError}</p>}
          <button type="submit" className="w-full bg-slate-900 text-white py-5 rounded-2xl font-black uppercase tracking-widest hover:bg-indigo-600 transition-all">Sign In</button>
        </form>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-4 pb-32 font-sans">
        {/* Header Navigation */}
        <header className="max-w-6xl mx-auto mb-8 flex flex-wrap gap-4 items-stretch">
            <div className="flex-1 min-w-[300px] bg-white p-6 rounded-[2rem] shadow-sm border border-slate-200 flex justify-between items-center">
                <button onClick={() => changeWeek(-1)} className="p-3 hover:bg-slate-100 rounded-2xl text-slate-400 transition-all active:scale-95"><ChevronLeft/></button>
                <div className="text-center">
                    <h2 className="text-xl font-black text-slate-800 uppercase tracking-tight">Week of {selectedSheetDate}</h2>
                    <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-[0.2em] mt-1">Voices of Faith South</p>
                </div>
                <button onClick={() => changeWeek(1)} className="p-3 hover:bg-slate-100 rounded-2xl text-slate-400 transition-all active:scale-95"><ChevronRight/></button>
            </div>
            
            <button 
                onClick={performDeepScan}
                disabled={isScanning}
                className="bg-slate-900 px-8 rounded-[2rem] font-black uppercase text-[11px] text-white hover:bg-indigo-600 disabled:bg-slate-400 transition-all flex items-center gap-3 shadow-lg shadow-slate-200"
            >
                {isScanning ? <RefreshCw className="animate-spin" size={16}/> : <History size={16}/>}
                History & Recovery
            </button>
        </header>

        {/* RECOVERY MODAL */}
        {showScanner && (
            <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-md z-[100] flex items-center justify-center p-6">
                <div className="bg-white w-full max-w-2xl rounded-[3rem] p-10 shadow-2xl max-h-[85vh] flex flex-col border border-white/20">
                    <div className="flex justify-between items-start mb-8">
                        <div>
                            <h3 className="text-2xl font-black uppercase text-slate-800 tracking-tighter">Database Explorer</h3>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Showing all records found in 'church_reports'</p>
                        </div>
                        <button onClick={() => setShowScanner(false)} className="bg-slate-100 p-3 rounded-2xl hover:bg-rose-50 hover:text-rose-500 transition-all"><Plus className="rotate-45"/></button>
                    </div>
                    
                    <div className="overflow-y-auto flex-1 space-y-3 pr-4 custom-scrollbar">
                        {foundDates.length === 0 ? (
                            <div className="text-center py-20 bg-slate-50 rounded-[2rem] border-2 border-dashed border-slate-200">
                                <AlertCircle className="mx-auto text-amber-500 mb-4" size={48}/>
                                <p className="text-slate-800 font-black uppercase text-sm">No Records Found</p>
                                <p className="text-slate-400 font-medium text-xs mt-2 px-10 leading-relaxed">
                                    We couldn't find any documents in the 'church_reports' collection. 
                                    Double-check that data is being saved to this exact collection name.
                                </p>
                            </div>
                        ) : (
                            foundDates.map((item, i) => (
                                <button 
                                    key={i}
                                    onClick={() => {
                                        setSelectedSheetDate(item.id);
                                        setShowScanner(false);
                                    }}
                                    className="w-full text-left p-6 bg-slate-50 hover:bg-indigo-50 rounded-3xl border border-slate-100 flex justify-between items-center transition-all group active:scale-[0.98]"
                                >
                                    <div className="flex items-center gap-5">
                                        <div className={`p-4 rounded-2xl ${item.status === 'submitted' ? 'bg-indigo-100 text-indigo-600' : 'bg-emerald-100 text-emerald-600'}`}>
                                            {item.status === 'submitted' ? <Lock size={20}/> : <CheckCircle2 size={20}/>}
                                        </div>
                                        <div>
                                            <span className="text-lg font-black text-slate-800 tracking-tighter">Week of {item.id}</span>
                                            <div className="flex items-center gap-3 mt-1">
                                                <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-md ${item.status === 'submitted' ? 'bg-indigo-600 text-white' : 'bg-emerald-500 text-white'}`}>
                                                    {item.status}
                                                </span>
                                                <span className="text-[10px] font-bold text-slate-400">Recorded Revenue: ${item.revTotal.toFixed(2)}</span>
                                            </div>
                                        </div>
                                    </div>
                                    <span className="text-[10px] font-black text-indigo-600 uppercase opacity-0 group-hover:opacity-100 transition-all translate-x-4 group-hover:translate-x-0">Load Record →</span>
                                </button>
                            ))
                        )}
                    </div>
                    
                    <div className="mt-8 pt-6 border-t border-slate-100 flex justify-between items-center">
                        <p className="text-[10px] font-bold text-slate-400 uppercase">Found {foundDates.length} entries</p>
                        <button onClick={performDeepScan} className="text-indigo-600 font-black uppercase text-[11px] flex items-center gap-2 hover:underline">
                            <RefreshCw size={14}/> Re-scan Database
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* Dashboard Content */}
        <div className="max-w-6xl mx-auto">
            {/* Top Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Starting</p>
                    <div className="flex items-center gap-1">
                        <span className="text-lg font-bold text-slate-300">$</span>
                        <input 
                            type="number" 
                            value={manualStartingBalance ?? 0}
                            disabled={isSubmitted}
                            onChange={(e) => {
                                const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                                setManualStartingBalance(val);
                                updateCloudData({ startingBalance: val });
                            }}
                            className="text-2xl font-black text-slate-800 outline-none w-full bg-transparent border-b-2 border-slate-100 focus:border-indigo-500 transition-colors"
                        />
                    </div>
                </div>
                <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col justify-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Revenue</p>
                    <p className="text-3xl font-black text-emerald-600 tracking-tighter">${currentWeekTotals.rev.toFixed(2)}</p>
                </div>
                <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col justify-center">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Expenses</p>
                    <p className="text-3xl font-black text-rose-600 tracking-tighter">${currentWeekTotals.exp.toFixed(2)}</p>
                </div>
                <div className="bg-indigo-600 p-8 rounded-[2rem] text-white shadow-xl shadow-indigo-100 flex flex-col justify-center">
                    <p className="text-[10px] font-black text-indigo-200 uppercase tracking-widest mb-1">Ending Balance</p>
                    <p className="text-3xl font-black tracking-tighter">${currentWeekTotals.end.toFixed(2)}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                {/* Revenue Card */}
                <section className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-200">
                    <div className="flex justify-between items-center mb-8">
                        <h3 className="text-lg font-black uppercase text-slate-800 tracking-tight flex items-center gap-2">
                            <TrendingUp className="text-emerald-500" size={20}/> Income Entry
                        </h3>
                        <div className="flex gap-1 bg-slate-100 p-1.5 rounded-2xl">
                            {INCOME_DAYS.map(day => (
                                <button key={day} onClick={() => setActiveIncomeDay(day)} className={`px-4 py-2 text-[10px] font-black uppercase rounded-xl transition-all ${activeIncomeDay === day ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>{day.charAt(0)}</button>
                            ))}
                        </div>
                    </div>
                    
                    <div className="space-y-5">
                        <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                            <span className="text-[10px] font-black uppercase text-indigo-600">{activeIncomeDay} Breakdown</span>
                        </div>
                        {REVENUE_CATEGORIES.map(cat => (
                            <div key={cat} className="flex items-center justify-between group">
                                <span className="text-xs font-bold text-slate-500 uppercase">{cat}</span>
                                <div className="flex items-center gap-3">
                                    <span className="text-xs text-slate-300 font-bold">$</span>
                                    <input 
                                        type="number"
                                        value={(revenueData[activeIncomeDay]?.[cat]) || ''}
                                        disabled={isSubmitted}
                                        onChange={(e) => {
                                            const updated = { ...revenueData, [activeIncomeDay]: { ...(revenueData[activeIncomeDay] || {}), [cat]: e.target.value } };
                                            setRevenueData(updated);
                                            updateCloudData({ revenue: updated });
                                        }}
                                        className="w-32 p-3 bg-slate-50 border border-slate-100 rounded-2xl text-right text-sm font-black outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition-all"
                                        placeholder="0.00"
                                    />
                                </div>
                            </div>
                        ))}
                    </div>
                </section>

                {/* Expenses Card */}
                <section className="bg-white p-10 rounded-[3rem] shadow-sm border border-slate-200 flex flex-col min-h-[600px]">
                    <h3 className="text-lg font-black uppercase text-slate-800 mb-8 tracking-tight flex items-center gap-2">
                        <Wallet className="text-rose-500" size={20}/> Expenses
                    </h3>
                    
                    <div className="flex-1 overflow-y-auto space-y-3 mb-8 pr-2 custom-scrollbar">
                        {expenses.length === 0 ? (
                            <div className="h-full flex flex-col items-center justify-center text-slate-200">
                                <Wallet size={64} strokeWidth={1}/>
                                <p className="text-[10px] font-black uppercase mt-4 tracking-widest">Clear Records</p>
                            </div>
                        ) : (
                            expenses.map((exp, idx) => (
                                <div key={idx} className="flex justify-between items-center p-5 bg-slate-50 rounded-[1.5rem] border border-slate-100 group animate-in fade-in slide-in-from-bottom-2">
                                    <div className="flex flex-col">
                                        <span className="text-[11px] font-black text-slate-800 uppercase tracking-tight">{exp.category}</span>
                                        {exp.otherDetail && <span className="text-[9px] text-slate-400 font-bold uppercase mt-0.5">{exp.otherDetail}</span>}
                                    </div>
                                    <div className="flex items-center gap-4">
                                        <span className="text-sm font-black text-rose-600">-${parseFloat(exp.amount).toFixed(2)}</span>
                                        {!isSubmitted && (
                                            <button onClick={() => {
                                                const updated = expenses.filter((_, i) => i !== idx);
                                                setExpenses(updated);
                                                updateCloudData({ expenses: updated });
                                            }} className="bg-white p-2 rounded-xl text-slate-300 hover:text-rose-500 hover:shadow-md transition-all active:scale-90"><Plus size={16} className="rotate-45"/></button>
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
                            const newItem = { category: expenseCategory, amount: d.get('amt'), otherDetail: d.get('otherDetail') || '', id: Date.now() };
                            const updated = [...expenses, newItem];
                            setExpenses(updated);
                            updateCloudData({ expenses: updated });
                            e.target.reset();
                            setExpenseCategory(EXPENSE_CATEGORIES[0]);
                        }} className="bg-slate-900 p-8 rounded-[2.5rem] flex flex-col gap-5 shadow-2xl">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-500 uppercase ml-2 tracking-widest">Select Category</label>
                                    <select value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value)} className="w-full bg-slate-800 text-white p-4 rounded-2xl text-[11px] font-bold outline-none border border-slate-700 focus:border-indigo-500">
                                        {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                                    </select>
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[9px] font-black text-slate-500 uppercase ml-2 tracking-widest">Amount</label>
                                    <input name="amt" type="number" step="0.01" placeholder="0.00" className="w-full bg-white p-4 rounded-2xl text-slate-900 text-sm font-black outline-none focus:ring-4 focus:ring-indigo-500/10" required />
                                </div>
                            </div>
                            {expenseCategory === 'Other' && (
                                <input name="otherDetail" type="text" placeholder="Detail for 'Other'..." className="bg-slate-800 text-white p-4 rounded-2xl text-[10px] font-bold outline-none border border-slate-700" required />
                            )}
                            <button type="submit" className="bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase text-xs tracking-widest hover:bg-indigo-500 transition-all active:scale-95 flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/20">
                                <Plus size={18}/> Add Transaction
                            </button>
                        </form>
                    )}
                </section>
            </div>
        </div>

        {/* Global Actions */}
        <footer className="fixed bottom-8 left-1/2 -translate-x-1/2 w-full max-w-lg px-6 z-[60]">
            <div className="bg-white/90 backdrop-blur-2xl border border-white/50 shadow-2xl rounded-full p-3 flex justify-between items-center">
                <button onClick={() => {
                    const csv = `Date: ${selectedSheetDate}\nCategory,Amount\n` + expenses.map(e => `${e.category},${e.amount}`).join('\n');
                    const link = document.createElement("a");
                    link.href = 'data:text/csv;charset=utf-8,' + encodeURI(csv);
                    link.download = `Church_Report_${selectedSheetDate}.csv`;
                    link.click();
                }} className="px-8 py-4 rounded-full text-[11px] font-black uppercase text-slate-500 hover:bg-slate-50 transition-all flex items-center gap-2">
                  <Download size={16}/> Export CSV
                </button>
                <button onClick={() => {
                    if(window.confirm("Lock this week? This cannot be undone.")) {
                        updateCloudData({ status: 'submitted' });
                    }
                }} disabled={isSubmitted} className={`px-12 py-4 rounded-full text-[11px] font-black uppercase tracking-widest transition-all ${isSubmitted ? 'bg-slate-100 text-slate-400' : 'bg-indigo-600 text-white shadow-xl shadow-indigo-100 hover:scale-105 active:scale-95'}`}>
                    {isSubmitted ? 'Period Locked' : 'Finalize & Lock'}
                </button>
            </div>
        </footer>

        <style dangerouslySetInnerHTML={{ __html: `
            .custom-scrollbar::-webkit-scrollbar { width: 4px; }
            .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
            .custom-scrollbar::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 10px; }
            .custom-scrollbar::-webkit-scrollbar-thumb:hover { background: #cbd5e1; }
        `}} />
    </div>
  );
}
