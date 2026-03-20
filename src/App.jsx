import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  collection, 
  onSnapshot, 
  addDoc, 
  query, 
  orderBy, 
  serverTimestamp,
  deleteDoc,
  doc
} from 'firebase/firestore';
import { 
  getAuth, 
  signInAnonymously, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  AreaChart,
  Area
} from 'recharts';
import { 
  PlusCircle, 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  Calendar, 
  Trash2, 
  PieChart,
  Wallet
} from 'lucide-react';

// --- Firebase Configuration ---
// These keys allow your app to talk to your specific database
const firebaseConfig = {
  apiKey: "AIzaSyDb6oFZEStklFT_Dt2riDbQC_IJPHcT304",
  authDomain: "church-finance-dashboard-40dca.firebaseapp.com",
  projectId: "church-finance-dashboard-40dca",
  storageBucket: "church-finance-dashboard-40dca.firebasestorage.app",
  messagingSenderId: "480863076081",
  appId: "1:480863076081:web:dd01f7270a7cd158f93350"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);
const appId = "church-financial-dashboard"; // Unique ID for your app path

export default function App() {
  const [user, setUser] = useState(null);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    amount: '',
    category: 'Tithes',
    description: '',
    type: 'income'
  });

  // 1. Handle Authentication
  useEffect(() => {
    const login = async () => {
      try {
        await signInAnonymously(auth);
      } catch (err) {
        console.error("Auth error:", err);
      }
    };
    login();
    return onAuthStateChanged(auth, (user) => {
      setUser(user);
    });
  }, []);

  // 2. Listen to Transactions
  useEffect(() => {
    if (!user) return;

    // RULE 1: Using the specific path required for the environment
    const q = collection(db, 'artifacts', appId, 'public', 'data', 'transactions');
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      
      // Sort in memory (Rule 2: avoid complex Firestore queries)
      const sortedData = data.sort((a, b) => 
        (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
      );
      
      setTransactions(sortedData);
      setLoading(false);
    }, (error) => {
      console.error("Firestore error:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user]);

  // 3. Calculated Stats
  const stats = useMemo(() => {
    const income = transactions
      .filter(t => t.type === 'income')
      .reduce((acc, curr) => acc + Number(curr.amount), 0);
    const expenses = transactions
      .filter(t => t.type === 'expense')
      .reduce((acc, curr) => acc + Number(curr.amount), 0);
    return {
      income,
      expenses,
      balance: income - expenses
    };
  }, [transactions]);

  // 4. Chart Data Preparation
  const chartData = useMemo(() => {
    return [...transactions].reverse().map(t => ({
      date: t.createdAt ? new Date(t.createdAt.seconds * 1000).toLocaleDateString() : '...',
      amount: Number(t.amount),
      type: t.type
    }));
  }, [transactions]);

  // 5. Actions
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.amount || !user) return;

    try {
      await addDoc(collection(db, 'artifacts', appId, 'public', 'data', 'transactions'), {
        ...formData,
        amount: parseFloat(formData.amount),
        createdAt: serverTimestamp(),
        userId: user.uid
      });
      setFormData({ amount: '', category: 'Tithes', description: '', type: 'income' });
    } catch (err) {
      console.error("Error adding document: ", err);
    }
  };

  const deleteTransaction = async (id) => {
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'transactions', id));
    } catch (err) {
      console.error("Error deleting document: ", err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-8 font-sans text-slate-900">
      <div className="max-w-6xl mx-auto space-y-8">
        
        {/* Header */}
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Church Financial Dashboard</h1>
            <p className="text-slate-500">Manage tithes, offerings, and church expenses.</p>
          </div>
          <div className="flex items-center gap-2 bg-white px-4 py-2 rounded-lg shadow-sm border border-slate-200">
            <Calendar className="w-4 h-4 text-slate-400" />
            <span className="text-sm font-medium">{new Date().toLocaleDateString()}</span>
          </div>
        </header>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard 
            title="Total Balance" 
            amount={stats.balance} 
            icon={<Wallet className="w-6 h-6 text-blue-600" />}
            color="bg-blue-50"
          />
          <StatCard 
            title="Monthly Income" 
            amount={stats.income} 
            icon={<TrendingUp className="w-6 h-6 text-emerald-600" />}
            color="bg-emerald-50"
          />
          <StatCard 
            title="Monthly Expenses" 
            amount={stats.expenses} 
            icon={<TrendingDown className="w-6 h-6 text-rose-600" />}
            color="bg-rose-50"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Form Section */}
          <div className="lg:col-span-1 bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
            <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
              <PlusCircle className="w-5 h-5 text-blue-600" />
              New Transaction
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Type</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setFormData({...formData, type: 'income'})}
                    className={`py-2 px-4 rounded-lg text-sm font-medium transition-colors ${formData.type === 'income' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                  >Income</button>
                  <button
                    type="button"
                    onClick={() => setFormData({...formData, type: 'expense'})}
                    className={`py-2 px-4 rounded-lg text-sm font-medium transition-colors ${formData.type === 'expense' ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-600'}`}
                  >Expense</button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Amount ($)</label>
                <input
                  type="number"
                  required
                  value={formData.amount}
                  onChange={(e) => setFormData({...formData, amount: e.target.value})}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => setFormData({...formData, category: e.target.value})}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 bg-white"
                >
                  <option>Tithes</option>
                  <option>Offerings</option>
                  <option>Missions</option>
                  <option>Utilities</option>
                  <option>Salaries</option>
                  <option>Maintenance</option>
                  <option>Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  className="w-full px-4 py-2 rounded-lg border border-slate-200 outline-none h-24"
                  placeholder="Optional details..."
                />
              </div>
              <button
                type="submit"
                className="w-full bg-slate-900 text-white py-3 rounded-xl font-semibold hover:bg-slate-800 transition-colors mt-4 shadow-lg shadow-slate-200"
              >
                Add Transaction
              </button>
            </form>
          </div>

          {/* List & Chart Section */}
          <div className="lg:col-span-2 space-y-8">
            {/* Chart */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
              <h2 className="text-xl font-semibold mb-6 flex items-center gap-2">
                <PieChart className="w-5 h-5 text-blue-600" />
                Financial Trend
              </h2>
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <defs>
                      <linearGradient id="colorAmt" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#2563eb" stopOpacity={0.1}/>
                        <stop offset="95%" stopColor="#2563eb" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="date" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#fff', borderRadius: '12px', border: '1px solid #e2e8f0', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                    />
                    <Area type="monotone" dataKey="amount" stroke="#2563eb" fillOpacity={1} fill="url(#colorAmt)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Recent Transactions */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center">
                <h2 className="text-xl font-semibold">History</h2>
                <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">Latest Activities</span>
              </div>
              <div className="divide-y divide-slate-100">
                {transactions.length === 0 ? (
                  <div className="p-8 text-center text-slate-400">No transactions recorded yet.</div>
                ) : (
                  transactions.map((t) => (
                    <div key={t.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors group">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${t.type === 'income' ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                          {t.type === 'income' ? <TrendingUp size={20} /> : <TrendingDown size={20} />}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{t.category}</p>
                          <p className="text-sm text-slate-500">{t.description || 'No description'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-6">
                        <div className="text-right">
                          <p className={`font-bold ${t.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {t.type === 'income' ? '+' : '-'}${Number(t.amount).toLocaleString()}
                          </p>
                          <p className="text-xs text-slate-400">
                            {t.createdAt ? new Date(t.createdAt.seconds * 1000).toLocaleDateString() : 'Pending'}
                          </p>
                        </div>
                        <button 
                          onClick={() => deleteTransaction(t.id)}
                          className="p-2 text-slate-300 hover:text-rose-600 transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, amount, icon, color }) {
  return (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 flex items-center gap-4">
      <div className={`p-3 rounded-xl ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-slate-500 uppercase tracking-wider">{title}</p>
        <p className="text-2xl font-bold text-slate-900">${amount.toLocaleString()}</p>
      </div>
    </div>
  );
}
