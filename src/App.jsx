import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  onSnapshot
} from 'firebase/firestore';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged,
  signOut
} from 'firebase/auth';
import { 
  TrendingUp, 
  Wallet, 
  Plus,
  ChevronLeft,
  ChevronRight,
  Download,
  CalendarDays,
  Lock,
  User,
  LogOut,
  AlertCircle
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
const appId = typeof __app_id !== 'undefined' ? __app_id : 'church-financial-dashboard';

// --- APP CONSTANTS ---
const INCOME_DAYS = ['Sunday', 'Tuesday', 'End of Week', 'End of Month'];

const REVENUE_CATEGORIES = [
  'Cash/Checks', 'Credit Card', 'Text', 'Givelify', 
  'Tithely', 'CashApp', 'Zelle', 'Website Giving'
];

const EXPENSE_CATEGORIES = [
  'Mortgage - Kirkland Group', 'Pastor Payroll', 'Lady Val Payroll', 
  'Admin Payroll Taxes and fees', 'Band Payroll', 'Pastor Love offerings', 
  'Georgia Power', 'Georgia Natural Gas', 'Spectrum (TV, Phone, Internet)', 
  'Henry County Water Authority', 'TMobile', 'Kaiser Permanente', 
  'GFL Environmental', 'Ministry Design', 'Quickbooks', 
  'Team Pest USA', 'First Citizens Bank', 'Other'
];

// Simple Authentication Credentials
const ADMIN_CREDENTIALS = {
  loginId: "voicessouth",
  password: "3894South"
};

export default function App() {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loginError, setLoginError] = useState('');
  const [selectedSheetDate, setSelectedSheetDate] = useState(null);
  const [revenueData, setRevenueData] = useState({});
  const [expenses, setExpenses] = useState([]);
  const [manualStartingBalance, setManualStartingBalance] = useState(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [previousWeekEndingBalance, setPreviousWeekEndingBalance] = useState(0);
  const [activeIncomeDay, setActiveIncomeDay] = useState('Sunday');
  const [expenseCategory, setExpenseCategory] = useState(EXPENSE_CATEGORIES[0]);
  const [showConfirmLock, setShowConfirmLock] = useState(false);

  const formatDate = (date) => `${date.getMonth() + 1}-${date.getDate()}-${date.getFullYear().toString().slice(-2)}`;

  const getWorksheetDate = (dateObj) => {
    const d = new Date(dateObj);
    const day = d.getDay(); 
    const diff = (day >= 5) ? (day - 5) : (day + 2);
    const targetFriday = new Date(d);
    targetFriday.setDate(d.getDate() - diff);
    return formatDate(targetFriday);
  };

  // 1. Initial Auth Setup
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInAnonymously(auth);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) { console.error("Auth Error:", err); }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // 2. Set Default Date
  useEffect(() => {
    const current = getWorksheetDate(new Date());
    setSelectedSheetDate(current);
  }, []);

  // 3. MAIN DATA SYNC: Resets state and listens to Firestore
  useEffect(() => {
    if (!user || !selectedSheetDate || !isAuthenticated) return;

    // IMPORTANT: Clear current state before loading data for the new date
    // This prevents "ghosting" data from the previous week
    setRevenueData({});
    setExpenses([]);
    setManualStartingBalance(null);
    setIsSubmitted(false);

    const docPath = doc(db, 'artifacts', appId, 'public', 'data', 'reports', selectedSheetDate);
    
    const unsubscribe = onSnapshot(docPath, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setRevenueData(data.revenue || {});
        setExpenses(data.expenses || []);
        setManualStartingBalance(data.startingBalance ?? null);
        setIsSubmitted(data.status === 'submitted');
      }
      // Note: If document doesn't exist, state remains at the cleared defaults set above
    }, (err) => console.error("Snapshot Error:", err));

    return () => unsubscribe();
  }, [user, selectedSheetDate, isAuthenticated]);

  // 4. PREVIOUS BALANCE SYNC
  useEffect(() => {
    if (!user || !selectedSheetDate || !isAuthenticated) return;
    
    const [m, d, y] = selectedSheetDate.split('-').map(Number);
    const prevDateObj = new Date(2000 + y, m - 1, d);
    prevDateObj.setDate(prevDateObj.getDate() - 7);
    const prevWeekKey = formatDate(prevDateObj);

    const prevDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'reports', prevWeekKey);
    
    const unsubscribe = onSnapshot(prevDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        let totalPrevRev = 0;
        const revObj = data.revenue || {};
        Object.values(revObj).forEach(dayData => {
          Object.values(dayData).forEach(val => {
            totalPrevRev += (parseFloat(val) || 0);
          });
        });
        const exp = (data.expenses || []).reduce((a, b) => a + (parseFloat(b.amount) || 0), 0);
        const start = data.startingBalance || 0;
        setPreviousWeekEndingBalance(start + totalPrevRev - exp);
      } else {
        setPreviousWeekEndingBalance(0);
      }
    }, (err) => console.error("Prev Balance Error:", err));
    return () => unsubscribe();
  }, [user, selectedSheetDate, isAuthenticated]);

  const currentWeekTotals = useMemo(() => {
    let totalRev = 0;
    Object.values(revenueData).forEach(dayData => {
      Object.values(dayData).forEach(val => {
        totalRev += (parseFloat(val) || 0);
      });
    });

    const exp = expenses.reduce((acc, e) => acc + (parseFloat(e.amount) || 0), 0);
    const start = manualStartingBalance !== null ? parseFloat(manualStartingBalance) : previousWeekEndingBalance;
    return { 
      rev: totalRev, exp, net: totalRev - exp, start: start, end: start + (totalRev - exp)
    };
  }, [revenueData, expenses, manualStartingBalance, previousWeekEndingBalance]);

  const handleLogin = (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    const id = data.get('loginId');
    const pw = data.get('password');

    if (id === ADMIN_CREDENTIALS.loginId && pw === ADMIN_CREDENTIALS.password) {
      setIsAuthenticated(true);
      setLoginError('');
    } else {
      setLoginError('Invalid Login ID or Password');
    }
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
  };

  const changeWeek = (direction) => {
    const [m, d, y] = selectedSheetDate.split('-').map(Number);
    const date = new Date(2000 + y, m - 1, d);
    date.setDate(date.getDate() + (direction * 7));
    setSelectedSheetDate(formatDate(date));
  };

  const updateCloudData = async (updates) => {
    if (!user || !selectedSheetDate || isSubmitted || !isAuthenticated) return;
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'reports', selectedSheetDate);
    await setDoc(docRef, { ...updates, lastUpdated: new Date().toISOString() }, { merge: true });
  };

  const handleRevenueChange = (category, value) => {
    const updatedRevenue = {
      ...revenueData,
      [activeIncomeDay]: {
        ...(revenueData[activeIncomeDay] || {}),
        [category]: value
      }
    };
    setRevenueData(updatedRevenue);
    updateCloudData({ revenue: updatedRevenue });
  };

  const exportToCSV = () => {
    let csvRows = [
      ["Church Financial Report", `Week of ${selectedSheetDate}`],
      [],
      ["Summary"],
      ["Starting Balance", currentWeekTotals.start.toFixed(2)],
      ["Total Revenue", currentWeekTotals.rev.toFixed(2)],
      ["Total Expenses", currentWeekTotals.exp.toFixed(2)],
      ["Net Cash Flow", currentWeekTotals.net.toFixed(2)],
      ["Ending Balance", currentWeekTotals.end.toFixed(2)],
      [],
      ["Revenue Detail By Day"]
    ];

    INCOME_DAYS.forEach(day => {
      csvRows.push([day]);
      csvRows.push(["Category", "Amount"]);
      REVENUE_CATEGORIES.forEach(cat => {
        const val = (revenueData[day] && revenueData[day][cat]) || 0;
        csvRows.push([cat, parseFloat(val).toFixed(2)]);
      });
      csvRows.push([]);
    });

    csvRows.push(["Expense Detail"], ["Category", "Amount"]);
    expenses.forEach(exp => {
      csvRows.push([exp.category + (exp.otherDetail ? ` (${exp.otherDetail})` : ""), parseFloat(exp.amount).toFixed(2)]);
    });

    const csvContent = csvRows.map(row => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `Church_Report_${selectedSheetDate}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-screen bg-slate-100 text-slate-400 font-bold tracking-widest animate-pulse uppercase">
      Dashboard Initializing...
    </div>
  );

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-[2.5rem] p-8 shadow-2xl border-b-8 border-indigo-600">
          <div className="flex justify-center mb-6">
            <div className="bg-indigo-50 p-4 rounded-full text-indigo-600">
              <Lock size={32} />
            </div>
          </div>
          <div className="text-center mb-8">
            <h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Access Control</h1>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Authorized Personnel Only</p>
          </div>
          
          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Login ID</label>
              <div className="relative">
                <User size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                <input name="loginId" type="text" required className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-indigo-500 transition-all font-bold text-slate-700" placeholder="Enter ID" />
              </div>
            </div>
            <div>
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" />
                <input name="password" type="password" required className="w-full pl-12 pr-4 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-indigo-500 transition-all font-bold text-slate-700" placeholder="••••••••" />
              </div>
            </div>
            {loginError && <p className="text-rose-500 text-[10px] font-black uppercase tracking-widest text-center animate-bounce">{loginError}</p>}
            <button type="submit" className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest shadow-xl shadow-indigo-200 hover:bg-indigo-700 hover:-translate-y-0.5 transition-all active:scale-95">Sign In</button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 p-4 font-sans text-slate-900 pb-32">
      {/* Custom Confirmation Modal */}
      {showConfirmLock && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] p-8 max-w-sm w-full shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="flex justify-center mb-4">
              <div className="bg-amber-100 text-amber-600 p-3 rounded-full"><AlertCircle size={28}/></div>
            </div>
            <h3 className="text-xl font-black text-center text-slate-800 uppercase tracking-tight mb-2">Finalize Week?</h3>
            <p className="text-xs text-slate-500 text-center font-bold mb-8 leading-relaxed">
              This will lock all data for the week of <span className="text-slate-800">{selectedSheetDate}</span>. You won't be able to make further edits.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirmLock(false)} className="flex-1 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest text-slate-400 hover:bg-slate-100 transition-colors">Cancel</button>
              <button onClick={() => { updateCloudData({ status: 'submitted' }); setShowConfirmLock(false); }} className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-black text-[10px] uppercase tracking-widest shadow-lg shadow-indigo-100 transition-transform active:scale-95">Yes, Lock It</button>
            </div>
          </div>
        </div>
      )}

      <header className="max-w-5xl mx-auto mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-slate-900 text-white p-6 rounded-3xl shadow-xl border-b-4 border-indigo-500">
           <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Starting Balance</p>
           <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-slate-300">$</span>
            <input 
                type="number"
                value={manualStartingBalance ?? currentWeekTotals.start}
                disabled={isSubmitted}
                onChange={(e) => {
                    const val = e.target.value === '' ? null : e.target.value;
                    setManualStartingBalance(val);
                    updateCloudData({ startingBalance: val !== null ? parseFloat(val) : null });
                }}
                className="bg-transparent text-2xl font-black text-white outline-none w-full border-b border-slate-700 focus:border-indigo-400"
            />
           </div>
        </div>

        <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-sm md:col-span-2 flex justify-between items-center text-center">
          <button onClick={() => changeWeek(-1)} className="p-3 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"><ChevronLeft/></button>
          <div>
            <h1 className="text-xl font-black text-slate-800 uppercase tracking-tight">Week of {selectedSheetDate}</h1>
            <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest">Friday Reporting Cycle</p>
          </div>
          <button onClick={() => changeWeek(1)} className="p-3 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"><ChevronRight/></button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 text-center shadow-sm">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Revenue</p>
            <p className="text-xl font-black text-emerald-600">+${currentWeekTotals.rev.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 text-center shadow-sm">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Expenses</p>
            <p className="text-xl font-black text-rose-600">-${currentWeekTotals.exp.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
        </div>
        <div className="bg-indigo-600 p-5 rounded-2xl shadow-lg text-center text-white">
            <p className="text-[9px] font-black text-indigo-200 uppercase tracking-widest mb-1">Ending Balance</p>
            <p className="text-xl font-black">${currentWeekTotals.end.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
        </div>
      </div>

      <main className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
          <h3 className="font-black text-xs uppercase text-slate-400 mb-4 flex items-center gap-2 tracking-widest">
            <TrendingUp size={16} className="text-emerald-500"/> Revenue Tracking
          </h3>
          
          <div className="flex flex-wrap gap-1 mb-6 bg-slate-50 p-1.5 rounded-2xl border border-slate-100">
            {INCOME_DAYS.map(day => (
              <button key={day} onClick={() => setActiveIncomeDay(day)} className={`flex-1 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-tighter transition-all ${activeIncomeDay === day ? 'bg-white text-indigo-600 shadow-sm border border-slate-100' : 'text-slate-400 hover:text-slate-600'}`}>{day}</button>
            ))}
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-2 px-1">
              <CalendarDays size={14} className="text-indigo-400" />
              <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">{activeIncomeDay} Income</span>
            </div>
            {REVENUE_CATEGORIES.map(cat => (
              <div key={cat} className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600">{cat}</span>
                <input 
                  type="number" 
                  value={(revenueData[activeIncomeDay] && revenueData[activeIncomeDay][cat]) || ''} 
                  disabled={isSubmitted}
                  onChange={(e) => handleRevenueChange(cat, e.target.value)}
                  className="w-32 p-1.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-right outline-none focus:border-indigo-500 disabled:opacity-50"
                  placeholder="0.00"
                />
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col">
          <h3 className="font-black text-xs uppercase text-slate-400 mb-6 flex items-center gap-2 tracking-widest">
            <Wallet size={16} className="text-rose-500"/> Expenses
          </h3>
          <div className="flex-1 overflow-y-auto max-h-[350px] mb-4 space-y-2 pr-1">
            {expenses.length === 0 && <div className="py-12 text-center text-slate-300 text-[10px] font-black uppercase tracking-widest italic">No expenses recorded</div>}
            {expenses.map((exp, idx) => (
              <div key={idx} className="flex justify-between items-start p-3 bg-slate-50 rounded-xl border border-slate-100 group transition-all">
                <div className="flex flex-col"><span className="text-xs font-bold text-slate-700">{exp.category}</span>{exp.otherDetail && <span className="text-[10px] text-slate-400 font-medium italic">{exp.otherDetail}</span>}</div>
                <div className="flex items-center gap-3"><span className="text-xs font-black text-rose-500">-${parseFloat(exp.amount).toFixed(2)}</span>{!isSubmitted && <button onClick={() => { const updated = expenses.filter((_, i) => i !== idx); setExpenses(updated); updateCloudData({ expenses: updated }); }} className="text-slate-300 hover:text-rose-500 transition-colors"><Plus size={14} className="rotate-45" /></button>}</div>
              </div>
            ))}
          </div>
          {!isSubmitted && (
            <form onSubmit={(e) => {
              e.preventDefault();
              const d = new FormData(e.target);
              const newItem = { category: d.get('cat'), amount: d.get('amt'), otherDetail: d.get('otherDetail') || '', id: Date.now() };
              const updated = [...expenses, newItem];
              setExpenses(updated);
              updateCloudData({ expenses: updated });
              e.target.reset();
              setExpenseCategory(EXPENSE_CATEGORIES[0]);
            }} className="flex flex-col gap-2 p-2 bg-slate-100 rounded-2xl">
              <div className="flex gap-2">
                <select name="cat" value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value)} className="flex-1 bg-transparent text-xs font-bold outline-none px-2" required>
                  {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
                <input name="amt" type="number" step="0.01" className="w-20 bg-white p-2 rounded-xl text-xs font-bold outline-none border border-transparent focus:border-indigo-500" placeholder="0.00" required />
                <button className="bg-slate-900 text-white p-2 rounded-xl hover:bg-black transition-colors"><Plus size={16}/></button>
              </div>
              {expenseCategory === 'Other' && <input name="otherDetail" type="text" placeholder="Details" className="bg-white p-2 rounded-xl text-[10px] font-bold outline-none border border-transparent focus:border-indigo-500" required />}
            </form>
          )}
        </div>
      </main>

      <footer className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[95%] max-w-4xl bg-white/90 backdrop-blur-xl border border-white shadow-2xl rounded-full p-2 flex justify-between items-center z-50">
        <div className="flex gap-2">
          <button onClick={exportToCSV} className="flex items-center gap-2 px-6 py-3 rounded-full font-black text-[10px] uppercase tracking-widest text-slate-600 hover:bg-slate-100 transition-all border border-slate-100"><Download size={14}/> Export CSV</button>
          <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-3 rounded-full font-black text-[10px] uppercase tracking-widest text-rose-500 hover:bg-rose-50 transition-all border border-rose-100"><LogOut size={14}/></button>
        </div>
        
        <div className="flex items-center gap-2 mr-2">
          <button 
            onClick={() => setShowConfirmLock(true)}
            disabled={isSubmitted}
            className={`px-8 py-3 rounded-full font-black text-xs uppercase tracking-widest transition-all ${isSubmitted ? 'bg-slate-100 text-slate-400' : 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 active:scale-95'}`}
          >
            {isSubmitted ? 'Report Locked' : 'Lock Week'}
          </button>
        </div>
      </footer>
    </div>
  );
}
