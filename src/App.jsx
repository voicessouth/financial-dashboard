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
  Download,
  Lock,
  Search,
  Database,
  RefreshCw,
  AlertCircle
} from 'lucide-react';

// --- FIREBASE CONFIGURATION (Verified with your project) ---
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
const appId = 'church-finance-dashboard-40dca';

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
  const [isScanning, setIsScanning] = useState(false);
  const [foundDates, setFoundDates] = useState([]);
  const [showScanner, setShowScanner] = useState(false);

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

    // We look in 'church_reports' collection
    const docPath = doc(db, 'church_reports', selectedSheetDate);
    const unsubscribe = onSnapshot(docPath, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setRevenueData(data.revenue || {});
        setExpenses(data.expenses || []);
        setManualStartingBalance(data.startingBalance ?? null);
        setIsSubmitted(data.status === 'submitted');
      } else {
        // Reset state if no document found for this specific date string
        setRevenueData({});
        setExpenses([]);
        setManualStartingBalance(null);
        setIsSubmitted(false);
      }
    }, (err) => {
        console.error("Sync Error:", err);
    });

    return () => unsubscribe();
  }, [user, isAuthenticated, selectedSheetDate]);

  // 3. RECOVERY TOOL: Scan the collection for all existing documents
  const scanForData = async () => {
    if (!user) return;
    setIsScanning(true);
    try {
      const q = query(collection(db, 'church_reports'), limit(100));
      const querySnapshot = await getDocs(q);
      const results = [];
      querySnapshot.forEach((doc) => {
        results.push({ id: doc.id, ...doc.data() });
      });
      // Sort by ID (Date) descending
      results.sort((a, b) => b.id.localeCompare(a.id));
      setFoundDates(results);
      setShowScanner(true);
    } catch (e) {
      console.error("Scanning failed", e);
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
    <div className="min-h-screen bg-slate-50 p-4 pb-32">
        {/* Header */}
        <header className="max-w-5xl mx-auto mb-8 flex flex-col md:flex-row gap-4 items-stretch">
            <div className="flex-1 bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex justify-between items-center">
                <button onClick={() => changeWeek(-1)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"><ChevronLeft/></button>
                <div className="text-center">
                    <h2 className="text-xl font-black text-slate-800 uppercase">Week of {selectedSheetDate}</h2>
                    <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Financial Reporting</p>
                </div>
                <button onClick={() => changeWeek(1)} className="p-2 hover:bg-slate-100 rounded-full text-slate-400"><ChevronRight/></button>
            </div>
            
            <button 
                onClick={scanForData}
                className="bg-white px-6 rounded-3xl border border-slate-200 font-black uppercase text-[10px] text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition-all flex items-center gap-2"
            >
                {isScanning ? <RefreshCw className="animate-spin" size={16}/> : <Database size={16}/>}
                Search Records
            </button>

            <div className="md:w-64 bg-slate-900 text-white p-6 rounded-3xl shadow-lg border-b-4 border-indigo-500">
                <p className="text-[10px] font-black uppercase text-slate-400 mb-1 tracking-wider">Weekly Start Balance</p>
                <div className="flex items-center gap-1">
                    <span className="text-lg font-bold text-indigo-400">$</span>
                    <input 
                        type="number" 
                        value={manualStartingBalance ?? 0}
                        disabled={isSubmitted}
                        onChange={(e) => {
                            const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                            setManualStartingBalance(val);
                            updateCloudData({ startingBalance: val });
                        }}
                        className="bg-transparent text-2xl font-black outline-none w-full border-b border-slate-700 focus:border-indigo-400"
                    />
                </div>
            </div>
        </header>

        {/* Database Search Results Overlay */}
        {showScanner && (
            <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md z-[100] flex items-center justify-center p-6">
                <div className="bg-white w-full max-w-2xl rounded-[2.5rem] p-8 shadow-2xl max-h-[80vh] flex flex-col">
                    <div className="flex justify-between items-center mb-6">
                        <h3 className="text-xl font-black uppercase text-slate-800 flex items-center gap-2"><Database className="text-indigo-600"/> Firebase: church_reports</h3>
                        <button onClick={() => setShowScanner(false)} className="text-slate-400 hover:text-slate-900 font-bold">Close</button>
                    </div>
                    <div className="overflow-y-auto flex-1 space-y-2 pr-2">
                        {foundDates.length === 0 ? (
                            <div className="text-center py-20">
                                <AlertCircle className="mx-auto text-amber-500 mb-4" size={48}/>
                                <p className="text-slate-400 font-bold uppercase text-xs tracking-widest">No matching records found in Firebase.</p>
                            </div>
                        ) : (
                            foundDates.map((item, i) => (
                                <button 
                                    key={i}
                                    onClick={() => {
                                        setSelectedSheetDate(item.id);
                                        setShowScanner(false);
                                    }}
                                    className="w-full text-left p-5 bg-slate-50 hover:bg-indigo-50 rounded-2xl border border-slate-100 flex justify-between items-center transition-all group"
                                >
                                    <div>
                                        <span className="text-sm font-black text-slate-800 tracking-tight">{item.id}</span>
                                        <p className="text-[8px] font-bold text-slate-400 uppercase mt-1">Status: {item.status || 'draft'}</p>
                                    </div>
                                    <div className="text-right">
                                        <span className="text-[10px] font-black text-indigo-600 uppercase opacity-0 group-hover:opacity-100 transition-all">Restore This Date →</span>
                                    </div>
                                </button>
                            ))
                        )}
                    </div>
                </div>
            </div>
        )}

        {/* Financial Summary */}
        <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
            <div className="bg-white p-6 rounded-3xl border border-slate-200 text-center">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Total Revenue</p>
                <p className="text-2xl font-black text-emerald-600 tracking-tight">${currentWeekTotals.rev.toFixed(2)}</p>
            </div>
            <div className="bg-white p-6 rounded-3xl border border-slate-200 text-center">
                <p className="text-[10px] font-black text-slate-400 uppercase mb-2">Total Expenses</p>
                <p className="text-2xl font-black text-rose-600 tracking-tight">${currentWeekTotals.exp.toFixed(2)}</p>
            </div>
            <div className="bg-indigo-600 p-6 rounded-3xl text-white text-center shadow-xl shadow-indigo-100">
                <p className="text-[10px] font-black text-indigo-200 uppercase mb-2">Ending Balance</p>
                <p className="text-2xl font-black tracking-tight">${currentWeekTotals.end.toFixed(2)}</p>
            </div>
        </div>

        {/* Data Sections */}
        <main className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-8">
            <section className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200">
                <div className="flex gap-1 mb-8 bg-slate-50 p-1.5 rounded-2xl">
                    {INCOME_DAYS.map(day => (
                        <button key={day} onClick={() => setActiveIncomeDay(day)} className={`flex-1 py-2 text-[10px] font-black uppercase rounded-xl transition-all ${activeIncomeDay === day ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>{day}</button>
                    ))}
                </div>
                <div className="space-y-4">
                    {REVENUE_CATEGORIES.map(cat => (
                        <div key={cat} className="flex items-center justify-between group">
                            <span className="text-[11px] font-bold text-slate-500 uppercase">{cat}</span>
                            <div className="flex items-center gap-2">
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
                                    className="w-28 p-2 bg-slate-50 border border-slate-100 rounded-xl text-right text-sm font-black outline-none focus:border-indigo-600"
                                    placeholder="0.00"
                                />
                            </div>
                        </div>
                    ))}
                </div>
            </section>

            <section className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-slate-200 flex flex-col min-h-[500px]">
                <h3 className="text-[11px] font-black uppercase text-slate-400 mb-6 tracking-[0.2em] flex items-center gap-2">
                  <Wallet size={16} className="text-rose-500"/> Outgoing Funds
                </h3>
                <div className="flex-1 overflow-y-auto space-y-3 mb-6 pr-2">
                    {expenses.length === 0 && <div className="h-full flex flex-col items-center justify-center opacity-20"><Wallet size={48}/><p className="text-[10px] font-black uppercase mt-4">No records yet</p></div>}
                    {expenses.map((exp, idx) => (
                        <div key={idx} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100 group">
                            <div className="flex flex-col">
                                <span className="text-[11px] font-black text-slate-700 uppercase">{exp.category}</span>
                                {exp.otherDetail && <span className="text-[9px] text-slate-400 italic font-medium">{exp.otherDetail}</span>}
                            </div>
                            <div className="flex items-center gap-4">
                                <span className="text-sm font-black text-rose-600">-${parseFloat(exp.amount).toFixed(2)}</span>
                                {!isSubmitted && (
                                    <button onClick={() => {
                                        const updated = expenses.filter((_, i) => i !== idx);
                                        setExpenses(updated);
                                        updateCloudData({ expenses: updated });
                                    }} className="text-slate-300 hover:text-rose-500 transition-colors"><Plus size={16} className="rotate-45"/></button>
                                )}
                            </div>
                        </div>
                    ))}
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
                    }} className="bg-slate-900 p-6 rounded-3xl flex flex-col gap-4 shadow-xl">
                        <div className="flex flex-col gap-1">
                            <label className="text-[9px] font-black text-indigo-300 uppercase">Category</label>
                            <select value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value)} className="bg-slate-800 text-white p-3 rounded-xl text-xs font-bold outline-none border border-slate-700">
                                {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                        {expenseCategory === 'Other' && (
                            <input name="otherDetail" type="text" placeholder="Explain 'Other' expense..." className="bg-slate-800 text-white p-3 rounded-xl text-[10px] font-bold outline-none border border-slate-700" required />
                        )}
                        <div className="flex gap-3">
                            <input name="amt" type="number" step="0.01" placeholder="0.00" className="flex-1 bg-white p-4 rounded-2xl text-slate-900 text-sm font-black outline-none" required />
                            <button type="submit" className="bg-indigo-600 text-white px-6 rounded-2xl font-black hover:bg-indigo-500 transition-colors"><Plus/></button>
                        </div>
                    </form>
                )}
            </section>
        </main>

        <footer className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-lg bg-white/80 backdrop-blur-xl border border-white/50 shadow-2xl rounded-full p-2 flex justify-between items-center z-50">
            <button onClick={() => {
                const csv = `Category,Amount\n` + expenses.map(e => `${e.category},${e.amount}`).join('\n');
                const link = document.createElement("a");
                link.href = 'data:text/csv;charset=utf-8,' + encodeURI(csv);
                link.download = `Report_${selectedSheetDate}.csv`;
                link.click();
            }} className="px-6 py-3 rounded-full text-[10px] font-black uppercase text-slate-500 hover:bg-slate-100 transition-all flex items-center gap-2">
              <Download size={14}/> Export
            </button>
            <button onClick={() => {
                if(window.confirm("Lock this week? You won't be able to edit further.")) {
                    updateCloudData({ status: 'submitted' });
                }
            }} disabled={isSubmitted} className={`px-10 py-3 rounded-full text-xs font-black uppercase tracking-widest transition-all ${isSubmitted ? 'bg-slate-100 text-slate-400' : 'bg-indigo-600 text-white shadow-lg shadow-indigo-100'}`}>
                {isSubmitted ? 'Locked' : 'Lock Records'}
            </button>
        </footer>
    </div>
  );
}
