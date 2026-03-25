import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  onSnapshot,
  collection,
  query,
  getDocs
} from 'firebase/firestore';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged,
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
  AlertCircle,
  Search
} from 'lucide-react';

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = {
  apiKey: "AIzaSyDb6oFZEStklFT_Dt2riDbQC_IJPHcT304",
  authDomain: "church-finance-dashboard-40dca.firebaseapp.com",
  projectId: "church-finance-dashboard-40dca",
  storageBucket: "church-finance-dashboard-40dca.firebasestorage.app",
  messagingSenderId: "480863076081",
  appId: "1:480863076081:web:dd01f7270a7cd158f93350"

// --- APP CONSTANTS ---
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
    });
    return () => unsubscribe();
  }, []);

  // 2. Data Discovery Logic (Finds your Jan/Feb data)
  useEffect(() => {
    if (!user || !isAuthenticated) return;

    const findLatestActiveDate = async () => {
      try {
        // Updated collection path to match the rest of the app logic
        const reportsRef = collection(db, 'artifacts', appId, 'public', 'data', 'church_reports');
        const qSnap = await getDocs(reportsRef);
        
        if (!qSnap.empty) {
          const dateEntries = qSnap.docs.map(doc => {
            const parts = doc.id.split('-');
            if (parts.length !== 3) return null;
            const [m, d, y] = parts.map(Number);
            return { id: doc.id, date: new Date(2000 + y, m - 1, d) };
          }).filter(entry => entry !== null);

          if (dateEntries.length > 0) {
            dateEntries.sort((a, b) => b.date - a.date);
            setSelectedSheetDate(dateEntries[0].id);
          } else {
            setSelectedSheetDate(getWorksheetDate(new Date()));
          }
        } else {
          setSelectedSheetDate(getWorksheetDate(new Date()));
        }
      } catch (e) {
        console.error("Discovery error:", e);
        setSelectedSheetDate(getWorksheetDate(new Date()));
      } finally {
        setLoading(false);
      }
    };

    findLatestActiveDate();
  }, [user, isAuthenticated]);

  // 3. MAIN DATA SYNC
  useEffect(() => {
    if (!user || !selectedSheetDate || !isAuthenticated) return;

    setRevenueData({});
    setExpenses([]);
    setManualStartingBalance(null);
    setIsSubmitted(false);

    const docPath = doc(db, 'artifacts', appId, 'public', 'data', 'church_reports', selectedSheetDate);
    
    const unsubscribe = onSnapshot(docPath, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setRevenueData(data.revenue || {});
        setExpenses(data.expenses || []);
        setManualStartingBalance(data.startingBalance ?? null);
        setIsSubmitted(data.status === 'submitted');
      }
    }, (err) => {
        console.error("Snapshot Error:", err);
        // If there's a permission error, we still want to stop the loading spinner
        setLoading(false);
    });

    return () => unsubscribe();
  }, [user, selectedSheetDate, isAuthenticated]);

  // 4. PREVIOUS BALANCE SYNC
  useEffect(() => {
    if (!user || !selectedSheetDate || !isAuthenticated) return;
    
    const [m, d, y] = selectedSheetDate.split('-').map(Number);
    const prevDateObj = new Date(2000 + y, m - 1, d);
    prevDateObj.setDate(prevDateObj.getDate() - 7);
    const prevWeekKey = formatDate(prevDateObj);

    const prevDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'church_reports', prevWeekKey);
    
    const unsubscribe = onSnapshot(prevDocRef, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        let totalPrevRev = 0;
        const revObj = data.revenue || {};
        Object.values(revObj).forEach(dayData => {
          Object.values(dayData).forEach(val => totalPrevRev += (parseFloat(val) || 0));
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
      Object.values(dayData).forEach(val => totalRev += (parseFloat(val) || 0));
    });
    const exp = expenses.reduce((acc, e) => acc + (parseFloat(e.amount) || 0), 0);
    const start = manualStartingBalance !== null ? parseFloat(manualStartingBalance) : previousWeekEndingBalance;
    return { rev: totalRev, exp, net: totalRev - exp, start, end: start + (totalRev - exp) };
  }, [revenueData, expenses, manualStartingBalance, previousWeekEndingBalance]);

  const handleLogin = (e) => {
    e.preventDefault();
    const data = new FormData(e.target);
    if (data.get('loginId') === ADMIN_CREDENTIALS.loginId && data.get('password') === ADMIN_CREDENTIALS.password) {
      setIsAuthenticated(true);
      setLoginError('');
    } else {
      setLoginError('Invalid Login ID or Password');
    }
  };

  const changeWeek = (direction) => {
    const [m, d, y] = selectedSheetDate.split('-').map(Number);
    const date = new Date(2000 + y, m - 1, d);
    date.setDate(date.getDate() + (direction * 7));
    setSelectedSheetDate(formatDate(date));
  };

  const updateCloudData = async (updates) => {
    if (!user || !selectedSheetDate || isSubmitted || !isAuthenticated) return;
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', 'church_reports', selectedSheetDate);
    await setDoc(docRef, { ...updates, lastUpdated: new Date().toISOString() }, { merge: true });
  };

  const handleRevenueChange = (category, value) => {
    const updatedRevenue = { ...revenueData, [activeIncomeDay]: { ...(revenueData[activeIncomeDay] || {}), [category]: value } };
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
      ["Ending Balance", currentWeekTotals.end.toFixed(2)],
      [],
      ["Revenue Details"]
    ];
    INCOME_DAYS.forEach(day => {
      csvRows.push([day]);
      REVENUE_CATEGORIES.forEach(cat => {
        const val = (revenueData[day] && revenueData[day][cat]) || 0;
        csvRows.push([cat, parseFloat(val).toFixed(2)]);
      });
    });
    const csvContent = "data:text/csv;charset=utf-8," + csvRows.map(e => e.join(",")).join("\n");
    const link = document.createElement("a");
    link.setAttribute("href", encodeURI(csvContent));
    link.setAttribute("download", `Report_${selectedSheetDate}.csv`);
    document.body.appendChild(link);
    link.click();
  };

  // Guard against render before state is ready
  if (loading && isAuthenticated) return <div className="flex items-center justify-center min-h-screen bg-slate-900 text-indigo-400 font-black animate-pulse uppercase tracking-[0.3em]">Locating Data...</div>;

  if (!isAuthenticated) return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-[2.5rem] p-8 shadow-2xl border-b-8 border-indigo-600">
        <div className="flex justify-center mb-6"><div className="bg-indigo-50 p-4 rounded-full text-indigo-600"><Lock size={32} /></div></div>
        <div className="text-center mb-8"><h1 className="text-2xl font-black text-slate-800 uppercase tracking-tight">Access Control</h1></div>
        <form onSubmit={handleLogin} className="space-y-4">
          <input name="loginId" type="text" required className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-indigo-500 font-bold" placeholder="Login ID" />
          <input name="password" type="password" required className="w-full px-6 py-4 bg-slate-50 border-2 border-slate-100 rounded-2xl outline-none focus:border-indigo-500 font-bold" placeholder="Password" />
          {loginError && <p className="text-rose-500 text-[10px] font-black uppercase text-center">{loginError}</p>}
          <button type="submit" className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-black uppercase tracking-widest hover:bg-indigo-700 transition-all">Sign In</button>
        </form>
      </div>
    </div>
  );

  // Final check for selectedSheetDate before rendering main UI
  if (!selectedSheetDate) return null;

  return (
    <div className="min-h-screen bg-slate-100 p-4 font-sans text-slate-900 pb-32">
      {showConfirmLock && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-[2rem] p-8 max-w-sm w-full shadow-2xl">
            <h3 className="text-xl font-black text-center text-slate-800 uppercase tracking-tight mb-2">Finalize Week?</h3>
            <p className="text-xs text-slate-500 text-center font-bold mb-8">This will lock all data for {selectedSheetDate}.</p>
            <div className="flex gap-3">
              <button onClick={() => setShowConfirmLock(false)} className="flex-1 py-3 rounded-xl font-black text-[10px] uppercase text-slate-400">Cancel</button>
              <button onClick={() => { updateCloudData({ status: 'submitted' }); setShowConfirmLock(false); }} className="flex-1 py-3 rounded-xl bg-indigo-600 text-white font-black text-[10px] uppercase">Confirm</button>
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

      <div className="max-w-5xl mx-auto mb-6 grid grid-cols-1 md:grid-cols-3 gap-4 text-center font-black">
        <div className="bg-white p-5 rounded-2xl border border-slate-200"><p className="text-[9px] text-slate-400 uppercase mb-1">Revenue</p><p className="text-xl text-emerald-600">+${currentWeekTotals.rev.toFixed(2)}</p></div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200"><p className="text-[9px] text-slate-400 uppercase mb-1">Expenses</p><p className="text-xl text-rose-600">-${currentWeekTotals.exp.toFixed(2)}</p></div>
        <div className="bg-indigo-600 p-5 rounded-2xl text-white"><p className="text-[9px] text-indigo-200 uppercase mb-1">Ending Balance</p><p className="text-xl">${currentWeekTotals.end.toFixed(2)}</p></div>
      </div>

      <main className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
          <div className="flex flex-wrap gap-1 mb-6 bg-slate-50 p-1.5 rounded-2xl">
            {INCOME_DAYS.map(day => (
              <button key={day} onClick={() => setActiveIncomeDay(day)} className={`flex-1 px-3 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${activeIncomeDay === day ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400'}`}>{day}</button>
            ))}
          </div>
          <div className="space-y-3">
            {REVENUE_CATEGORIES.map(cat => (
              <div key={cat} className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-600">{cat}</span>
                <input type="number" value={(revenueData[activeIncomeDay] && revenueData[activeIncomeDay][cat]) || ''} disabled={isSubmitted} onChange={(e) => handleRevenueChange(cat, e.target.value)} className="w-32 p-1.5 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-right outline-none focus:border-indigo-500" placeholder="0.00" />
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col min-h-[400px]">
          <h3 className="font-black text-xs uppercase text-slate-400 mb-6 flex items-center gap-2 tracking-widest"><Wallet size={16} className="text-rose-500"/> Expenses</h3>
          <div className="flex-1 overflow-y-auto space-y-2 mb-4">
            {expenses.map((exp, idx) => (
              <div key={idx} className="flex justify-between items-start p-3 bg-slate-50 rounded-xl border border-slate-100 group transition-all">
                <div className="flex flex-col"><span className="text-xs font-bold text-slate-700">{exp.category}</span>{exp.otherDetail && <span className="text-[10px] text-slate-400 font-medium italic">{exp.otherDetail}</span>}</div>
                <div className="flex items-center gap-3"><span className="text-xs font-black text-rose-500">-${parseFloat(exp.amount).toFixed(2)}</span>{!isSubmitted && <button onClick={() => { const updated = expenses.filter((_, i) => i !== idx); setExpenses(updated); updateCloudData({ expenses: updated }); }} className="text-slate-300 hover:text-rose-500"><Plus size={14} className="rotate-45" /></button>}</div>
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
            }} className="p-3 bg-slate-100 rounded-2xl flex flex-col gap-2">
              <div className="flex gap-2">
                <select name="cat" value={expenseCategory} onChange={(e) => setExpenseCategory(e.target.value)} className="flex-1 bg-transparent text-xs font-bold outline-none">
                  {EXPENSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}
                </select>
                <input name="amt" type="number" step="0.01" className="w-20 bg-white p-2 rounded-xl text-xs font-bold" placeholder="0.00" required />
                <button className="bg-slate-900 text-white p-2 rounded-xl"><Plus size={16}/></button>
              </div>
              {expenseCategory === 'Other' && <input name="otherDetail" type="text" placeholder="Specify Details" className="bg-white p-2 rounded-xl text-[10px] font-bold" required />}
            </form>
          )}
        </div>
      </main>

      <footer className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[95%] max-w-4xl bg-white/90 backdrop-blur-xl shadow-2xl rounded-full p-2 flex justify-between items-center z-50">
        <button onClick={exportToCSV} className="flex items-center gap-2 px-6 py-3 rounded-full font-black text-[10px] uppercase text-slate-600 hover:bg-slate-100"><Download size={14}/> Export</button>
        <button onClick={() => setShowConfirmLock(true)} disabled={isSubmitted} className={`px-8 py-3 rounded-full font-black text-xs uppercase tracking-widest transition-all ${isSubmitted ? 'bg-slate-100 text-slate-400' : 'bg-indigo-600 text-white shadow-lg shadow-indigo-200'}`}>
            {isSubmitted ? 'Report Locked' : 'Lock Week'}
        </button>
      </footer>
    </div>
  );
}
