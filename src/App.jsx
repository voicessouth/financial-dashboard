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
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  TrendingUp, 
  Wallet, 
  PlusCircle, 
  Calendar, 
  History,
  Plus,
  CheckCircle2,
  AlertCircle,
  Lock,
  DollarSign
} from 'lucide-react';

// --- FIREBASE CONFIGURATION ---
// IMPORTANT: Replace these placeholders with your ACTUAL keys from the Firebase Console
const firebaseConfig = {
  apiKey: "YOUR_API_KEY",
  authDomain: "church-finance-dashboard-40dca.firebaseapp.com",
  projectId: "church-finance-dashboard-40dca",
  storageBucket: "church-finance-dashboard-40dca.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId: "YOUR_APP_ID"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

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

const App = () => {
  const [user, setUser] = useState(null);
  const [selectedSheetDate, setSelectedSheetDate] = useState(null);
  const [revenueData, setRevenueData] = useState({});
  const [expenses, setExpenses] = useState([]);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [loading, setLoading] = useState(true);

  // Check if keys are still placeholders to show warning
  const isConfigured = firebaseConfig.apiKey !== "YOUR_API_KEY";

  useEffect(() => {
    const initAuth = async () => {
      if (!isConfigured) {
        setLoading(false);
        return;
      }
      try {
        await signInAnonymously(auth);
      } catch (err) {
        console.error("Auth Error:", err);
        setLoading(false);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) setLoading(false);
    });
    return () => unsubscribe();
  }, [isConfigured]);

  useEffect(() => {
    // Generate the date for the current reporting week (Last Tuesday)
    const d = new Date();
    const day = d.getDay();
    const diff = day >= 2 ? day - 2 : day + 5; 
    const lastTuesday = new Date(d);
    lastTuesday.setDate(d.getDate() - diff);
    const dateStr = `${lastTuesday.getMonth() + 1}-${lastTuesday.getDate()}-${lastTuesday.getFullYear().toString().slice(-2)}`;
    setSelectedSheetDate(dateStr);
  }, []);

  useEffect(() => {
    if (!user || !selectedSheetDate || !isConfigured) return;
    
    // Path: /church_reports/{date}
    const docPath = doc(db, 'church_reports', selectedSheetDate);
    
    const unsubscribe = onSnapshot(docPath, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setRevenueData(data.revenue || {});
        setExpenses(data.expenses || []);
        setIsSubmitted(data.status === 'submitted');
      } else {
        setRevenueData({});
        setExpenses([]);
        setIsSubmitted(false);
      }
    }, (error) => {
      console.error("Firestore Listen Error:", error);
    });
    
    return () => unsubscribe();
  }, [user, selectedSheetDate, isConfigured]);

  const totals = useMemo(() => {
    const rev = Object.values(revenueData).reduce((acc, val) => acc + (parseFloat(val) || 0), 0);
    const exp = expenses.reduce((acc, e) => acc + (parseFloat(e.amount) || 0), 0);
    return { rev, exp, net: rev - exp };
  }, [revenueData, expenses]);

  const updateCloudData = async (data) => {
    if (!isConfigured || !user || !selectedSheetDate || isSubmitted) return;
    const docPath = doc(db, 'church_reports', selectedSheetDate);
    await setDoc(docPath, data, { merge: true });
  };

  const handleRevenueChange = (cat, val) => {
    const updated = { ...revenueData, [cat]: val };
    setRevenueData(updated);
    updateCloudData({ revenue: updated });
  };

  const addExpense = (e) => {
    e.preventDefault();
    if (isSubmitted) return;
    const formData = new FormData(e.target);
    const newExpense = {
      id: Date.now().toString(),
      category: formData.get('category'),
      amount: parseFloat(formData.get('amount')) || 0,
      timestamp: new Date().toLocaleTimeString()
    };
    const updated = [newExpense, ...expenses];
    setExpenses(updated);
    updateCloudData({ expenses: updated });
    e.target.reset();
  };

  if (loading && isConfigured) return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
        <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">Securing Connection...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans pb-32">
        {!isConfigured && (
          <div className="max-w-4xl mx-auto mb-6 bg-amber-50 border border-amber-200 p-4 rounded-xl text-amber-800 flex items-center gap-3">
            <AlertCircle size={20} />
            <p className="text-sm font-medium">Please add your Firebase API keys to <code>App.jsx</code> to enable saving.</p>
          </div>
        )}

        <header className="max-w-4xl mx-auto mb-8 flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <div>
              <h1 className="text-2xl font-black text-slate-800">Financial Dashboard</h1>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">Week: {selectedSheetDate}</p>
            </div>
            <div className="text-right">
                <p className="text-[10px] font-bold text-slate-400 uppercase">Weekly Net</p>
                <p className={`text-2xl font-black ${totals.net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                    ${totals.net.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                </p>
            </div>
        </header>

        <main className="max-w-4xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-6">
            <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
                <h2 className="font-bold mb-6 flex items-center gap-2 text-slate-700">
                  <TrendingUp className="text-emerald-500" size={20}/> Revenue
                </h2>
                <div className="space-y-4">
                  {REVENUE_CATEGORIES.map(cat => (
                      <div key={cat}>
                          <label className="text-[10px] font-black text-slate-400 uppercase mb-1 block">{cat}</label>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                            <input 
                                type="number" 
                                disabled={isSubmitted}
                                className="w-full pl-7 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl outline-none focus:ring-2 ring-indigo-500/20" 
                                value={revenueData[cat] || ''} 
                                onChange={(e) => handleRevenueChange(cat, e.target.value)}
                                placeholder="0.00"
                            />
                          </div>
                      </div>
                  ))}
                </div>
            </section>

            <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex flex-col">
                <h2 className="font-bold mb-6 flex items-center gap-2 text-slate-700">
                  <Wallet className="text-rose-500" size={20}/> Expenses
                </h2>
                {!isSubmitted && (
                  <form onSubmit={addExpense} className="space-y-3 mb-6 bg-slate-50 p-4 rounded-xl">
                      <select name="category" required className="w-full p-2 bg-white border border-slate-200 rounded-lg text-sm">
                          <option value="">Category...</option>
                          {EXPENSE_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                      <div className="flex gap-2">
                        <input name="amount" type="number" step="0.01" required placeholder="0.00" className="flex-1 p-2 bg-white border border-slate-200 rounded-lg text-sm font-bold" />
                        <button type="submit" className="bg-indigo-600 text-white px-4 rounded-lg hover:bg-indigo-700 transition-colors"><Plus size={20}/></button>
                      </div>
                  </form>
                )}
                <div className="flex-1 overflow-y-auto max-h-[400px] space-y-2">
                    {expenses.length === 0 && <p className="text-center text-slate-300 text-xs py-10 uppercase font-bold italic">No expenses</p>}
                    {expenses.map(exp => (
                        <div key={exp.id} className="flex justify-between items-center text-sm p-3 bg-slate-50 border border-slate-100 rounded-xl">
                            <span className="font-bold text-slate-700">{exp.category}</span>
                            <span className="font-black text-rose-600">-${exp.amount.toFixed(2)}</span>
                        </div>
                    ))}
                </div>
            </section>
        </main>

        <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-6 shadow-2xl z-20">
            <div className="max-w-4xl mx-auto flex justify-between items-center">
              <div>
                  <p className="text-slate-400 text-[10px] uppercase font-black">Status</p>
                  <p className="text-sm font-bold text-slate-700 uppercase">{isSubmitted ? 'Locked' : 'Live Syncing'}</p>
              </div>
              {!isSubmitted ? (
                <button 
                  onClick={() => updateCloudData({ status: 'submitted' })}
                  className="bg-indigo-600 text-white px-8 py-3 rounded-2xl font-black text-sm hover:bg-indigo-700 transition-all active:scale-95"
                >
                  Finalize Report
                </button>
              ) : (
                <div className="flex items-center gap-2 text-rose-500 font-bold bg-rose-50 px-4 py-2 rounded-xl border border-rose-100">
                  <Lock size={18} /> Report Finalized
                </div>
              )}
            </div>
        </footer>
    </div>
  );
};

export default App;
