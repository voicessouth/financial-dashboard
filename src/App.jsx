import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged,
  signOut 
} from 'firebase/auth';
import { 
  getFirestore, 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  onSnapshot, 
  addDoc, 
  deleteDoc
} from 'firebase/firestore';
import { 
  LayoutDashboard, 
  Plus, 
  Trash2, 
  ChevronLeft, 
  ChevronRight, 
  LogOut, 
  Database, 
  Search,
  RefreshCw
} from 'lucide-react';
const firebaseConfig = {
// --- FIREBASE CONFIGURATION ---
  apiKey: "AIzaSyDb6oFZEStklFT_Dt2riDbQC_IJPHcT304",
  authDomain: "church-finance-dashboard-40dca.firebaseapp.com",
  projectId: "church-finance-dashboard-40dca",
  storageBucket: "church-finance-dashboard-40dca.firebasestorage.app",
  messagingSenderId: "480863076081",
  appId: "1:480863076081:web:dd01f7270a7cd158f93350";
};
export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeDate, setActiveDate] = useState(new Date());
  const [recoveryStatus, setRecoveryStatus] = useState('idle'); // idle, scanning, found, empty
  
  // Financial State
  const [income, setIncome] = useState({
    cash: 0,
    credit: 0,
    text: 0,
    givelify: 0,
    tithely: 0,
    cashapp: 0,
    zelle: 0,
    website: 0
  });
  const [expenses, setExpenses] = useState([]);
  const [newExpense, setNewExpense] = useState({ category: 'Lady Val Payroll', amount: '' });

  const categories = [
    'Lady Val Payroll', 'MORTGAGE - KIRKLAND GROUP', 'UTILITIES', 
    'MAINTENANCE', 'SUPPLIES', 'MINISTRY', 'TRAVEL', 'OTHER'
  ];

  // --- AUTHENTICATION ---
  useEffect(() => {
    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth error:", err);
      }
    };
    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // --- DATE KEY GENERATION ---
  const dateKey = useMemo(() => {
    const d = new Date(activeDate);
    // Explicitly stringify to avoid any object rendering issues
    return String(`${d.getMonth() + 1}-${d.getDate()}-${d.getFullYear()}`);
  }, [activeDate]);

  // --- DATA SYNC & RECOVERY ENGINE ---
  // RULE 1: Paths must be artifacts/{appId}/public/data/{collection}/{doc} (6 segments)
  const getDocPath = (key) => `artifacts/${appId}/public/data/finance/entries/${key}`;
  const getExpColPath = (key) => `artifacts/${appId}/public/data/finance/entries/${key}/expenses`;

  const runDeepScan = async () => {
    if (!user) return;
    setRecoveryStatus('scanning');
    
    // Testing multiple potential key formats if they were saved differently before
    const possibleKeys = [
      dateKey,
      `entry_${dateKey}`,
      dateKey.replaceAll('-', '_')
    ];

    let foundAny = false;
    for (const key of possibleKeys) {
      try {
        const docRef = doc(db, getDocPath(key));
        const snap = await getDoc(docRef);
        if (snap.exists()) {
          foundAny = true;
          const data = snap.data();
          if (data.income) setIncome(data.income);
          // If we found it under a weird key, we don't break, just keep checking
        }
      } catch (e) {
        console.error("Scan error at " + key, e);
      }
    }

    setRecoveryStatus(foundAny ? 'found' : 'empty');
    setTimeout(() => setRecoveryStatus('idle'), 5000);
  };

  useEffect(() => {
    if (!user) return;

    const docPath = getDocPath(dateKey);
    const unsubDoc = onSnapshot(doc(db, docPath), (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setIncome(data.income || {
          cash: 0, credit: 0, text: 0, givelify: 0, 
          tithely: 0, cashapp: 0, zelle: 0, website: 0
        });
      } else {
        setIncome({
          cash: 0, credit: 0, text: 0, givelify: 0, 
          tithely: 0, cashapp: 0, zelle: 0, website: 0
        });
      }
    }, (err) => console.error("Firestore Income Error:", err));

    const unsubExp = onSnapshot(collection(db, getExpColPath(dateKey)), (snap) => {
      const exps = [];
      snap.forEach(d => exps.push({ id: d.id, ...d.data() }));
      setExpenses(exps);
    }, (err) => console.error("Firestore Expense Error:", err));

    return () => {
      unsubDoc();
      unsubExp();
    };
  }, [user, dateKey]);

  // --- ACTIONS ---
  const handleIncomeChange = async (key, val) => {
    if (!user) return;
    const numericVal = parseFloat(val) || 0;
    const newIncome = { ...income, [key]: numericVal };
    setIncome(newIncome);
    
    const docRef = doc(db, getDocPath(dateKey));
    await setDoc(docRef, {
      income: newIncome,
      lastUpdated: new Date().toISOString()
    }, { merge: true });
  };

  const addExpense = async () => {
    if (!user || !newExpense.amount) return;
    await addDoc(collection(db, getExpColPath(dateKey)), {
      category: newExpense.category,
      amount: parseFloat(newExpense.amount),
      timestamp: new Date().toISOString()
    });
    setNewExpense({ ...newExpense, amount: '' });
  };

  const deleteExpense = async (id) => {
    await deleteDoc(doc(db, getExpColPath(dateKey), id));
  };

  // Helper to ensure values are numbers before summing
  const totalIncome = useMemo(() => 
    Object.values(income).reduce((a, b) => a + (Number(b) || 0), 0)
  , [income]);

  const totalExpenses = useMemo(() => 
    expenses.reduce((a, b) => a + (Number(b.amount) || 0), 0)
  , [expenses]);

  const netSum = totalIncome - totalExpenses;

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans pb-20">
      {/* Recovery Status Bar */}
      <div className={`w-full py-2 px-4 flex items-center justify-between transition-colors ${
        recoveryStatus === 'scanning' ? 'bg-amber-100 text-amber-800' :
        recoveryStatus === 'found' ? 'bg-emerald-100 text-emerald-800' :
        recoveryStatus === 'empty' ? 'bg-slate-200 text-slate-600' : 'bg-indigo-600 text-white'
      }`}>
        <div className="flex items-center gap-2 text-sm font-medium">
          {recoveryStatus === 'scanning' ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Database className="w-4 h-4" />}
          <span>
            {recoveryStatus === 'scanning' ? 'Deep Scanning database...' :
             recoveryStatus === 'found' ? 'Records Restored!' :
             recoveryStatus === 'empty' ? 'No legacy data found.' : 
             'Voices South Financial Network'}
          </span>
        </div>
        <button 
          onClick={runDeepScan}
          className="bg-white/20 hover:bg-white/30 px-3 py-1 rounded text-xs flex items-center gap-1 transition-all"
        >
          <Search className="w-3 h-3" /> Search Legacy
        </button>
      </div>

      <header className="bg-white border-b border-slate-200 px-6 py-4 flex justify-between items-center sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600 p-2 rounded-lg">
            <LayoutDashboard className="text-white w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-slate-800 uppercase">Voices South Portal</h1>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => signOut(auth)} className="text-slate-400 hover:text-red-500 transition-colors">
            <LogOut className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto mt-8 px-4 md:px-6 space-y-8">
        
        <section className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200/60 relative overflow-hidden text-center">
          <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 to-emerald-500"></div>
          <div className="flex items-center justify-center gap-8">
            <button 
              onClick={() => {
                const d = new Date(activeDate);
                d.setDate(d.getDate() - 7);
                setActiveDate(d);
              }}
              className="p-3 rounded-full hover:bg-slate-100 border border-slate-100 transition-all"
            >
              <ChevronLeft className="w-6 h-6 text-slate-400" />
            </button>
            
            <div>
              <p className="text-[3.5rem] font-black text-slate-800 leading-none tracking-tighter">
                {String(dateKey)}
              </p>
              <p className="text-slate-400 font-bold uppercase tracking-[0.2em] text-[10px] mt-2">Week Ending Date</p>
            </div>

            <button 
              onClick={() => {
                const d = new Date(activeDate);
                d.setDate(d.getDate() + 7);
                setActiveDate(d);
              }}
              className="p-3 rounded-full hover:bg-slate-100 border border-slate-100 transition-all"
            >
              <ChevronRight className="w-6 h-6 text-slate-400" />
            </button>
          </div>
        </section>

        <div className="grid md:grid-cols-2 gap-8">
          <section className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200/60 h-fit">
            <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-8 flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
              Weekly Income
            </h2>

            <div className="space-y-6">
              {Object.keys(income).map((key) => (
                <div key={key} className="flex items-center justify-between group">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 group-hover:text-indigo-600 transition-colors">
                      {key.replace(/([A-Z])/g, ' $1')}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-slate-300 font-bold">$</span>
                    <input
                      type="number"
                      value={income[key] || ''}
                      onChange={(e) => handleIncomeChange(key, e.target.value)}
                      placeholder="0.00"
                      className="w-32 text-right font-black text-xl text-slate-800 focus:outline-none placeholder-slate-200"
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>

          <div className="space-y-8">
            <section className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200/60">
              <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-8 flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                New Expenditure
              </h2>

              <div className="space-y-4">
                <select
                  value={newExpense.category}
                  onChange={(e) => setNewExpense({ ...newExpense, category: e.target.value })}
                  className="w-full bg-slate-50 border-none rounded-2xl px-6 py-4 text-sm font-bold text-slate-700 outline-none"
                >
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <div className="relative">
                  <input
                    type="number"
                    value={newExpense.amount}
                    onChange={(e) => setNewExpense({ ...newExpense, amount: e.target.value })}
                    placeholder="0.00"
                    className="w-full bg-slate-50 border-none rounded-2xl px-6 py-6 text-2xl font-black text-slate-800 outline-none placeholder-slate-200"
                  />
                  <button
                    onClick={addExpense}
                    className="absolute right-3 top-3 bottom-3 aspect-square bg-slate-900 text-white rounded-xl flex items-center justify-center hover:bg-slate-800 active:scale-95 transition-all shadow-lg"
                  >
                    <Plus className="w-6 h-6" />
                  </button>
                </div>
              </div>
            </section>

            <section className="bg-white rounded-3xl p-8 shadow-sm border border-slate-200/60">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Activity Log</h2>
                <p className="text-rose-500 font-black text-sm">${totalExpenses.toFixed(2)}</p>
              </div>

              <div className="space-y-3 max-h-[300px] overflow-y-auto pr-2 custom-scrollbar">
                {expenses.length === 0 ? (
                  <p className="text-center text-slate-300 text-[10px] font-bold uppercase py-8">No records found</p>
                ) : (
                  expenses.map(exp => (
                    <div key={exp.id} className="flex items-center justify-between bg-slate-50 p-4 rounded-2xl group transition-all">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-tighter text-slate-800">{exp.category}</p>
                        <p className="text-[8px] text-slate-400 font-bold">{new Date(exp.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</p>
                      </div>
                      <div className="flex items-center gap-4">
                        <p className="font-black text-slate-700">${(Number(exp.amount) || 0).toFixed(2)}</p>
                        <button onClick={() => deleteExpense(exp.id)} className="text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </section>
          </div>
        </div>

        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 w-[90%] max-w-xl z-20">
          <div className="bg-slate-900 rounded-[2.5rem] p-6 shadow-2xl flex items-center justify-between border border-white/10">
            <div>
              <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">Weekly Net Sum</p>
              <p className={`text-4xl font-black ${netSum >= 0 ? 'text-emerald-400' : 'text-rose-400'} tracking-tighter`}>
                ${netSum.toLocaleString(undefined, { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="text-right">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-tight">Total In: ${totalIncome.toLocaleString()}</p>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-tight">Total Out: ${totalExpenses.toLocaleString()}</p>
            </div>
          </div>
        </div>
      </main>

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: #CBD5E1; border-radius: 10px; }
      `}</style>
    </div>
  );
}
