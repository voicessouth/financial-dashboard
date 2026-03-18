import React, { useState, useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  onSnapshot
} from 'firebase/firestore';
import { 
  getAuth, 
  onAuthStateChanged,
  signInAnonymously,
  signInWithCustomToken
} from 'firebase/auth';
import { 
  TrendingUp, 
  Wallet, 
  Calendar, 
  History,
  Plus,
  Trash2,
  CheckCircle2,
  Lock,
  Unlock,
  RefreshCw,
  ChevronDown
} from 'lucide-react';

// --- FIREBASE CONFIGURATION ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'church-dashboard-v1';

const REVENUE_CATEGORIES = [
  'Cash/Checks', 'Credit Card', 'Text', 'Givelify', 
  'Tithely', 'CashApp', 'Zelle', 'Website Giving'
];

const INCOME_DAY_OPTIONS = [
  'Sun', 'Tue', 'End of week', 'End of month'
];

const EXPENSE_CATEGORIES = [
  'Mortgage - Kirkland Group', 'Pastor Payroll', 'Lady Val Payroll', 
  'Admin Payroll Taxes and fees', 'Band Payroll', 'Pastor Love offerings', 
  'Georgia Power', 'Georgia Natural Gas', 'Spectrum (TV, Phone, Internet)', 
  'Henry County Water Authority', 'TMobile', 'Kaiser Permanente', 
  'GFL Environmental', 'Ministry Design', 'Quickbooks', 
  'Team Pest USA', 'First Citizens Bank', 'Other'
];

const App = () => {
  const [user, setUser] = useState(null);
  const [selectedSheetDate, setSelectedSheetDate] = useState('1-2-26');
  const [selectedIncomeDay, setSelectedIncomeDay] = useState('Sun');
  const [revenueData, setRevenueData] = useState({});
  const [bankBalance, setBankBalance] = useState(0);
  const [expenses, setExpenses] = useState([]);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [showUnlockConfirm, setShowUnlockConfirm] = useState(false);
  const [showOtherInput, setShowOtherInput] = useState(false);

  // Generate weeks for 2026
  const weeksOfYear = useMemo(() => {
    const weeks = [];
    let current = new Date(2026, 0, 2); 
    const endOfYear = new Date(2026, 11, 31);
    while (current <= endOfYear) {
      const dateStr = `${current.getMonth() + 1}-${current.getDate()}-${current.getFullYear().toString().slice(-2)}`;
      weeks.push(dateStr);
      current.setDate(current.getDate() + 7);
    }
    return weeks;
  }, []);

  // Auth Effect
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth initialization failed", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Data Sync Effect
  useEffect(() => {
    if (!user) return;
    
    // Path: /artifacts/{appId}/public/data/{docId}
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', selectedSheetDate);
    
    const unsubscribe = onSnapshot(docRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setRevenueData(data.revenue || {});
        setBankBalance(data.bankBalance || 0);
        setExpenses(data.expenses || []);
        setIsSubmitted(data.status === 'submitted');
      } else {
        setRevenueData({});
        setBankBalance(0);
        setExpenses([]);
        setIsSubmitted(false);
      }
    }, (err) => {
      console.error("Firestore Error:", err);
    });

    return () => unsubscribe();
  }, [user, selectedSheetDate]);

  const updateDocData = async (updates) => {
    if (!user) return;
    setIsSaving(true);
    const docRef = doc(db, 'artifacts', appId, 'public', 'data', selectedSheetDate);
    try {
      await setDoc(docRef, { 
        ...updates, 
        lastUpdated: new Date().toISOString(),
        updatedBy: user.uid 
      }, { merge: true });
    } catch (err) {
      console.error("Save error:", err);
    } finally {
      setTimeout(() => setIsSaving(false), 500);
    }
  };

  const totals = useMemo(() => {
    let rev = parseFloat(bankBalance) || 0;
    Object.values(revenueData).forEach(dayData => {
      if (typeof dayData === 'object') {
        Object.values(dayData).forEach(val => {
          rev += (parseFloat(val) || 0);
        });
      }
    });
    const exp = expenses.reduce((acc, e) => acc + (parseFloat(e.amount) || 0), 0);
    return { rev, exp, net: rev - exp };
  }, [revenueData, expenses, bankBalance]);

  const handleRevenueChange = (cat, val) => {
    if (isSubmitted) return;
    const currentDayData = revenueData[selectedIncomeDay] || {};
    const updatedDayData = { ...currentDayData, [cat]: val };
    const updatedFullRevenue = { ...revenueData, [selectedIncomeDay]: updatedDayData };
    setRevenueData(updatedFullRevenue);
    updateDocData({ revenue: updatedFullRevenue });
  };

  const addExpense = (e) => {
    e.preventDefault();
    if (isSubmitted) return;
    const formData = new FormData(e.target);
    const category = formData.get('category');
    const amount = parseFloat(formData.get('amount')) || 0;
    const finalCategory = category === 'Other' ? `Other: ${formData.get('otherDescription')}` : category;
    
    const newExpense = {
      id: Math.random().toString(36).substr(2, 9),
      category: finalCategory,
      amount: amount,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
    
    const updated = [newExpense, ...expenses];
    setExpenses(updated);
    updateDocData({ expenses: updated });
    e.target.reset();
    setShowOtherInput(false);
  };

  const deleteExpense = (id) => {
    if (isSubmitted) return;
    const updated = expenses.filter(e => e.id !== id);
    setExpenses(updated);
    updateDocData({ expenses: updated });
  };

  if (loading) return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50">
        <RefreshCw className="text-indigo-500 animate-spin mb-4" size={32} />
        <p className="font-black text-slate-400 uppercase tracking-widest text-[10px]">Preparing Dashboard...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans pb-40">
        {/* Unlock Confirmation Modal */}
        {showUnlockConfirm && (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl border border-slate-100">
              <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mb-4">
                <Unlock size={24} />
              </div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">Re-open Report?</h3>
              <p className="text-slate-500 text-sm mb-6">This will allow you to edit or delete entries for the week of {selectedSheetDate.replace(/-/g, '/')}.</p>
              <div className="flex flex-col gap-2">
                <button 
                  onClick={() => {
                    setIsSubmitted(false);
                    updateDocData({ status: 'draft' });
                    setShowUnlockConfirm(false);
                  }}
                  className="w-full bg-indigo-600 text-white font-black uppercase tracking-widest text-xs py-4 rounded-2xl hover:bg-indigo-700 transition-colors"
                >
                  Confirm Unlock
                </button>
                <button 
                  onClick={() => setShowUnlockConfirm(false)}
                  className="w-full bg-slate-100 text-slate-600 font-black uppercase tracking-widest text-xs py-4 rounded-2xl hover:bg-slate-200 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        <header className="max-w-4xl mx-auto mb-8 flex flex-col md:flex-row justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-slate-200 gap-4">
            <div>
              <h1 className="text-2xl font-black text-slate-800 tracking-tight flex items-center gap-2">
                Finance Portal {isSubmitted && <Lock size={18} className="text-slate-300" />}
              </h1>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                {isSaving ? 'Saving changes...' : 'Cloud Connection Active'}
              </p>
            </div>
            
            <div className="flex flex-wrap items-center gap-4">
              <div className="bg-slate-50 border border-slate-100 px-4 py-2 rounded-2xl">
                <label className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-0.5">Bank Start</label>
                <div className="flex items-center">
                  <span className="text-slate-400 font-bold mr-1">$</span>
                  <input 
                    type="number"
                    disabled={isSubmitted}
                    value={bankBalance || ''}
                    onChange={(e) => { 
                      setBankBalance(e.target.value); 
                      updateDocData({ bankBalance: e.target.value }); 
                    }}
                    className="bg-transparent text-sm font-black text-slate-700 outline-none w-24 disabled:text-slate-400"
                    placeholder="0.00"
                  />
                </div>
              </div>

              <div className="bg-indigo-50 px-4 py-2 rounded-2xl border border-indigo-100 relative group">
                <label className="text-[9px] font-black text-indigo-400 uppercase tracking-widest block mb-0.5">Report Week</label>
                <div className="flex items-center gap-1">
                  <select 
                    value={selectedSheetDate} 
                    onChange={(e) => setSelectedSheetDate(e.target.value)}
                    className="bg-transparent text-sm font-black text-indigo-700 outline-none cursor-pointer pr-4 appearance-none"
                  >
                    {weeksOfYear.map(week => (
                      <option key={week} value={week}>{week.replace(/-/g, '/')}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="text-indigo-400 absolute right-3 pointer-events-none" />
                </div>
              </div>
            </div>
        </header>

        <main className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
            <section className={`bg-white p-6 rounded-3xl shadow-sm border border-slate-200 transition-opacity ${isSubmitted ? 'opacity-70 pointer-events-none' : 'opacity-100'}`}>
                <div className="flex justify-between items-center mb-6">
                  <h2 className="font-bold flex items-center gap-2 text-slate-700">
                    <TrendingUp className="text-emerald-500" size={20}/> Income
                  </h2>
                  <select 
                    value={selectedIncomeDay} 
                    onChange={(e) => setSelectedIncomeDay(e.target.value)} 
                    className="text-[10px] font-black text-slate-500 bg-slate-50 rounded-xl px-3 py-1.5 border border-slate-100 outline-none"
                  >
                    {INCOME_DAY_OPTIONS.map(day => <option key={day} value={day}>{day}</option>)}
                  </select>
                </div>

                <div className="space-y-4">
                  {REVENUE_CATEGORIES.map(cat => (
                      <div key={cat}>
                          <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block tracking-widest">{cat}</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                            <input 
                                type="number" 
                                className="w-full pl-7 pr-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl outline-none font-semibold focus:border-indigo-300 transition-all" 
                                value={revenueData[selectedIncomeDay]?.[cat] || ''} 
                                onChange={(e) => handleRevenueChange(cat, e.target.value)}
                                placeholder="0.00"
                            />
                          </div>
                      </div>
                  ))}
                </div>
            </section>

            <section className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 flex flex-col">
                <h2 className="font-bold mb-6 flex items-center gap-2 text-slate-700">
                    <Wallet className="text-rose-500" size={20}/> Expenses
                </h2>
                
                {!isSubmitted ? (
                  <form onSubmit={addExpense} className="space-y-3 mb-6 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                      <select 
                        name="category" 
                        required 
                        onChange={(e) => setShowOtherInput(e.target.value === 'Other')} 
                        className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold outline-none focus:ring-2 ring-indigo-500/10"
                      >
                          <option value="">Select Category...</option>
                          {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      
                      {showOtherInput && (
                        <input name="otherDescription" type="text" required placeholder="Expense detail..." className="w-full p-2.5 bg-white border border-slate-200 rounded-xl text-sm" />
                      )}

                      <div className="flex gap-2">
                        <div className="relative flex-1">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                            <input name="amount" type="number" step="0.01" required placeholder="0.00" className="w-full pl-7 pr-3 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-bold outline-none" />
                        </div>
                        <button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 rounded-xl transition-all shadow-lg shadow-indigo-100"><Plus size={20}/></button>
                      </div>
                  </form>
                ) : (
                  <div className="mb-6 p-4 bg-slate-50 rounded-2xl text-slate-500 italic text-xs flex gap-2 items-center border border-slate-100">
                    <Lock size={14} /> This report is locked. Unlock to make changes.
                  </div>
                )}

                <div className="flex-1 overflow-y-auto max-h-[400px] space-y-2 pr-1">
                    {expenses.length === 0 && (
                        <div className="text-center py-12 text-slate-300">
                            <History size={32} className="mx-auto mb-2 opacity-10" />
                            <p className="text-[10px] font-black uppercase tracking-widest italic">Empty</p>
                        </div>
                    )}
                    {expenses.map(exp => (
                        <div key={exp.id} className="flex justify-between items-center text-sm p-4 bg-slate-50 border border-slate-100 rounded-2xl group transition-all hover:border-slate-300">
                            <div className="flex flex-col">
                                <span className="font-bold text-slate-700 leading-tight">{exp.category}</span>
                                <span className="text-[9px] font-black text-slate-400 uppercase mt-0.5">{exp.timestamp}</span>
                            </div>
                            <div className="flex items-center gap-3">
                                <span className="font-black text-rose-600">-${exp.amount.toFixed(2)}</span>
                                {!isSubmitted && (
                                    <button onClick={() => deleteExpense(exp.id)} className="text-slate-300 hover:text-rose-500 transition-colors p-1">
                                        <Trash2 size={14} />
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </main>

        <footer className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[95%] max-w-4xl bg-slate-900 text-white p-6 rounded-[2.5rem] shadow-2xl z-20 border border-white/10 backdrop-blur-lg">
            <div className="flex justify-between items-center">
              <div>
                  <p className="text-slate-400 text-[10px] uppercase font-black mb-1 tracking-widest">Calculated Net</p>
                  <p className={`text-2xl font-black ${totals.net >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    ${totals.net.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </p>
              </div>

              {!isSubmitted ? (
                <button 
                    onClick={() => {
                      setIsSubmitted(true);
                      updateDocData({ status: 'submitted' });
                    }} 
                    className="bg-indigo-500 hover:bg-indigo-600 text-white px-8 py-3.5 rounded-2xl font-black text-xs uppercase tracking-widest transition-all shadow-xl shadow-indigo-900/40 flex items-center gap-2 active:scale-95"
                >
                    <CheckCircle2 size={16} /> Finalize
                </button>
              ) : (
                <button 
                    onClick={() => setShowUnlockConfirm(true)}
                    className="flex items-center gap-2 text-emerald-400 font-bold bg-emerald-400/10 px-6 py-3.5 rounded-2xl border border-emerald-400/20 hover:bg-emerald-400/20 transition-all active:scale-95"
                >
                    <Lock size={18} /> 
                    <span className="text-[10px] uppercase font-black tracking-widest">Locked (Unlock)</span>
                </button>
              )}
            </div>
        </footer>
    </div>
  );
};

const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(<App />);
}

export default App;
