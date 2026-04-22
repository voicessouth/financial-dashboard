import React, { useState, useMemo } from 'react';
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  PieChart, 
  Activity,
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  Plus,
  Filter,
  Download
} from 'lucide-react';

/**
 * VOICES SOUTH FINANCIAL PORTAL - STABILITY BUILD
 * This version uses local state management to bypass all connection/auth hangs.
 * It is designed for instant UI rendering across all browsers.
 */

export default function App() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [transactions] = useState([
    { id: '1', type: 'Income', category: 'Tithes', amount: 5200, date: '2024-05-20', description: 'Sunday Morning Service' },
    { id: '2', type: 'Expense', category: 'Utilities', amount: 450, date: '2024-05-19', description: 'Main Hall Electric' },
    { id: '3', type: 'Income', category: 'Donation', amount: 1200, date: '2024-05-18', description: 'Youth Building Fund' },
    { id: '4', type: 'Expense', category: 'Maintenance', amount: 800, date: '2024-05-17', description: 'Garden & Landscaping' },
    { id: '5', type: 'Income', category: 'Events', amount: 2100, date: '2024-05-16', description: 'Community Seminar' },
    { id: '6', type: 'Expense', category: 'Supplies', amount: 120, date: '2024-05-15', description: 'Office Stationery' },
  ]);

  const stats = useMemo(() => {
    const income = transactions
      .filter(t => t.type === 'Income')
      .reduce((acc, t) => acc + Number(t.amount), 0);
    const expenses = transactions
      .filter(t => t.type === 'Expense')
      .reduce((acc, t) => acc + Number(t.amount), 0);
    return { income, expenses, balance: income - expenses };
  }, [transactions]);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 font-sans antialiased">
      {/* Navigation Bar */}
      <nav className="bg-white border-b border-slate-200 px-4 sm:px-8 py-4 flex items-center justify-between sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="bg-indigo-600 p-2.5 rounded-xl shadow-lg shadow-indigo-100 flex items-center justify-center">
            <Wallet className="text-white w-5 h-5" />
          </div>
          <div>
            <h1 className="text-sm font-black tracking-tight uppercase leading-none text-slate-900">Voices South</h1>
            <p className="text-[9px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-1">Financial Portal</p>
          </div>
        </div>
        
        <div className="hidden md:flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
          <button 
            onClick={() => setActiveTab('dashboard')}
            className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${activeTab === 'dashboard' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Dashboard
          </button>
          <button 
            onClick={() => setActiveTab('ledger')}
            className={`px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all ${activeTab === 'ledger' ? 'bg-white shadow-sm text-indigo-600' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Ledger
          </button>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-50 text-emerald-600 rounded-full border border-emerald-100">
            <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
            <span className="text-[9px] font-black uppercase tracking-widest hidden sm:inline">Portal Active</span>
          </div>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto p-4 sm:p-8 lg:p-12 space-y-10">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[10px] font-bold uppercase tracking-widest">Administrator</span>
              <span className="text-slate-300">•</span>
              <span className="text-slate-400 text-[10px] font-bold uppercase tracking-widest">FY 2026</span>
            </div>
            <h2 className="text-3xl font-black tracking-tight text-slate-900">Executive Overview</h2>
            <p className="text-slate-500 text-sm mt-1">Comprehensive fiscal summary and real-time transaction data.</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="flex items-center gap-2 bg-white border border-slate-200 px-4 py-2.5 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm">
              <Download size={14} /> Export Report
            </button>
            <button className="flex items-center gap-2 bg-indigo-600 px-5 py-2.5 rounded-xl text-xs font-bold text-white hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-100">
              <Plus size={14} /> New Entry
            </button>
          </div>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {[
            { label: 'Net Revenue', value: stats.income, icon: ArrowUpRight, color: 'emerald', trend: '+14%' },
            { label: 'Total Expenses', value: stats.expenses, icon: ArrowDownLeft, color: 'rose', trend: '-2.4%' },
            { label: 'Available Balance', value: stats.balance, icon: DollarSign, color: 'indigo', trend: 'Stable' }
          ].map((card, i) => (
            <div key={i} className="bg-white p-7 rounded-[28px] border border-slate-200 shadow-sm relative overflow-hidden group hover:shadow-md transition-all">
              <div className="relative z-10 flex flex-col h-full justify-between">
                <div>
                  <div className={`w-10 h-10 rounded-xl bg-${card.color}-50 text-${card.color}-600 flex items-center justify-center mb-5`}>
                    <card.icon size={20} />
                  </div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.15em]">{card.label}</p>
                  <p className="text-3xl font-black text-slate-900 mt-2 tracking-tight">${card.value.toLocaleString()}</p>
                </div>
                <div className={`mt-6 text-[10px] font-bold uppercase tracking-widest text-${card.color}-600 bg-${card.color}-50 self-start px-2 py-1 rounded-md`}>
                  {card.trend} this month
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Transaction Feed */}
          <div className="lg:col-span-2 bg-white rounded-[32px] border border-slate-200 shadow-sm overflow-hidden flex flex-col">
            <div className="p-7 border-b border-slate-100 flex justify-between items-center bg-white sticky top-0">
              <h3 className="font-black text-[11px] uppercase tracking-widest text-slate-900 flex items-center gap-2">
                <Activity size={14} className="text-indigo-500" /> Recent Activity
              </h3>
              <button className="text-slate-400 hover:text-indigo-600 transition-colors">
                <Filter size={16} />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[500px]">
              {transactions.map((t, idx) => (
                <div key={t.id} className={`p-6 flex items-center justify-between hover:bg-slate-50 transition-colors group ${idx !== transactions.length - 1 ? 'border-b border-slate-50' : ''}`}>
                  <div className="flex items-center gap-5">
                    <div className={`w-12 h-12 rounded-2xl flex items-center justify-center transition-all group-hover:scale-105 ${t.type === 'Income' ? 'bg-emerald-50 text-emerald-600 shadow-sm' : 'bg-slate-100 text-slate-600 shadow-sm'}`}>
                      {t.type === 'Income' ? <ArrowUpRight size={18} /> : <ArrowDownLeft size={18} />}
                    </div>
                    <div>
                      <p className="font-bold text-slate-900 tracking-tight">{t.description}</p>
                      <div className="flex items-center gap-3 mt-1.5">
                        <span className="text-[10px] text-indigo-600 font-bold bg-indigo-50 px-2 py-0.5 rounded uppercase tracking-wider">{t.category}</span>
                        <div className="flex items-center gap-1 text-[10px] text-slate-400 font-medium">
                          <Calendar size={12} /> {t.date}
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`font-black text-base ${t.type === 'Income' ? 'text-emerald-600' : 'text-slate-900'}`}>
                      {t.type === 'Income' ? '+' : '-'}${Number(t.amount).toLocaleString()}
                    </p>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">Confirmed</p>
                  </div>
                </div>
              ))}
            </div>
            <button className="p-4 text-center text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 hover:text-indigo-600 border-t border-slate-50 transition-colors">
              View Full History
            </button>
          </div>

          {/* Allocation Side Panel */}
          <div className="space-y-8">
            <div className="bg-[#1E293B] p-8 rounded-[32px] text-white relative overflow-hidden shadow-2xl">
              <div className="relative z-10 h-full flex flex-col justify-between">
                <div>
                  <h3 className="font-black text-[11px] uppercase tracking-widest text-slate-400 mb-6 flex items-center gap-2">
                    <PieChart size={14} className="text-indigo-400" /> Fund Allocation
                  </h3>
                  <div className="space-y-7">
                    {[
                      { label: 'Personnel', value: 45, color: 'bg-indigo-500' },
                      { label: 'Facilities', value: 30, color: 'bg-emerald-500' },
                      { label: 'Outreach', value: 15, color: 'bg-rose-500' },
                      { label: 'Reserve', value: 10, color: 'bg-slate-500' }
                    ].map(item => (
                      <div key={item.label} className="space-y-3">
                        <div className="flex justify-between text-[10px] font-black uppercase tracking-wider">
                          <span className="text-slate-300">{item.label}</span>
                          <span className="text-white">{item.value}%</span>
                        </div>
                        <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                          <div className={`h-full ${item.color} rounded-full`} style={{ width: `${item.value}%` }}></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                
                <div className="mt-10 pt-8 border-t border-slate-800">
                  <div className="bg-slate-800/50 p-5 rounded-2xl border border-slate-700/50">
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Quarterly Review</p>
                    <p className="text-xs text-slate-300 leading-relaxed font-medium">
                      Operational costs are down 4.2% since the previous audit. All departments are within budget.
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Actions */}
            <div className="bg-white p-6 rounded-[32px] border border-slate-200 shadow-sm">
              <h3 className="font-black text-[11px] uppercase tracking-widest text-slate-900 mb-4">Quick Links</h3>
              <div className="grid grid-cols-2 gap-3">
                <button className="p-3 bg-slate-50 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-100 transition-all border border-slate-100">
                  Payroll
                </button>
                <button className="p-3 bg-slate-50 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-600 hover:bg-slate-100 transition-all border border-slate-100">
                  Tax Docs
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
