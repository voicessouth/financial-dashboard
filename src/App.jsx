import React, { useState, useEffect, useMemo } from 'react';
import { initializeApp } from 'firebase/app';
import { 
  getAuth, 
  signInAnonymously, 
  signInWithCustomToken, 
  onAuthStateChanged 
} from 'firebase/auth';
import { 
  getFirestore, 
  collection, 
  doc, 
  setDoc, 
  onSnapshot, 
  query,
  Timestamp 
} from 'firebase/firestore';
import { 
  LayoutDashboard, 
  PlusCircle, 
  History, 
  LogOut, 
  ChevronLeft, 
  ChevronRight, 
  Copy, 
  Check, 
  AlertCircle,
  Loader2,
  RefreshCw
} from 'lucide-react';

// --- Firebase Configuration ---
const firebaseConfig = JSON.parse(__firebase_config);
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';

export default function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [logs, setLogs] = useState([]);
  const [view, setView] = useState('dashboard'); // 'dashboard', 'history', 'month'
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copySuccess, setCopySuccess] = useState(false);
  const [currentDate, setCurrentDate] = useState(new Date());

  // --- Auth & Connection Logic ---
  useEffect(() => {
    let authTimeout = setTimeout(() => {
      if (!user && loading) {
        setAuthError("Connection taking longer than expected. Please check your internet or refresh the page.");
      }
    }, 8000);

    const initAuth = async () => {
      try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
          await signInWithCustomToken(auth, __initial_auth_token);
        } else {
          await signInAnonymously(auth);
        }
      } catch (err) {
        console.error("Auth Error:", err);
        setAuthError("Failed to establish a secure connection. Please refresh.");
      }
    };

    initAuth();
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (u) {
        setLoading(false);
        setAuthError(null);
        clearTimeout(authTimeout);
      }
    });

    return () => {
      unsubscribe();
      clearTimeout(authTimeout);
    };
  }, []);

  // --- Data Subscription ---
  useEffect(() => {
    if (!user) return;

    const logsRef = collection(db, 'artifacts', appId, 'public', 'data', 'work_logs');
    const unsubscribe = onSnapshot(
      logsRef,
      (snapshot) => {
        const data = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          timestamp: doc.data().timestamp?.toDate() || new Date()
        }));
        setLogs(data.sort((a, b) => b.timestamp - a.timestamp));
        setLoading(false);
      },
      (err) => {
        console.error("Firestore Error:", err);
        // Don't set global error here to allow UI to remain interactive
      }
    );

    return () => unsubscribe();
  }, [user]);

  // --- Actions ---
  const handleAddLog = async (type) => {
    if (!user || isSubmitting) return;
    setIsSubmitting(true);
    
    try {
      const logId = crypto.randomUUID();
      const logRef = doc(db, 'artifacts', appId, 'public', 'data', 'work_logs', logId);
      
      await setDoc(logRef, {
        userId: user.uid,
        userName: user.isAnonymous ? 'Anonymous User' : (user.displayName || user.email),
        type: type,
        timestamp: Timestamp.now()
      });
    } catch (err) {
      console.error("Add Log Error:", err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyForSheets = () => {
    const header = "Date\tTime\tType\tUser\n";
    const rows = logs.map(log => {
      const date = log.timestamp.toLocaleDateString();
      const time = log.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `${date}\t${time}\t${log.type}\t${log.userName}`;
    }).join('\n');
    
    const textArea = document.createElement("textarea");
    textArea.value = header + rows;
    document.body.appendChild(textArea);
    textArea.select();
    try {
      document.execCommand('copy');
      setCopySuccess(true);
      setTimeout(() => setCopySuccess(false), 2000);
    } catch (err) {
      console.error('Copy failed', err);
    }
    document.body.removeChild(textArea);
  };

  // --- UI Components ---
  if (authError) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-sm w-full border border-red-100">
          <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-slate-800 mb-2">Connection Issue</h1>
          <p className="text-slate-600 mb-6">{authError}</p>
          <button 
            onClick={() => window.location.reload()}
            className="w-full flex items-center justify-center gap-2 bg-blue-600 text-white py-3 rounded-xl font-semibold hover:bg-blue-700 transition-colors"
          >
            <RefreshCw className="w-5 h-5" />
            Retry Connection
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <Loader2 className="w-12 h-12 text-blue-600 animate-spin mb-4" />
        <p className="text-slate-600 font-medium animate-pulse">Initializing secure connection...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans pb-20 md:pb-0">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-2 rounded-lg">
              <LayoutDashboard className="w-5 h-5 text-white" />
            </div>
            <h1 className="font-bold text-lg tracking-tight">ShiftTracker</h1>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={copyForSheets}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                copySuccess ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {copySuccess ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              <span className="hidden sm:inline">Copy for Sheets</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-4 md:p-8">
        {view === 'dashboard' && (
          <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
            {/* Quick Actions */}
            <section>
              <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider mb-4">Quick Punch</h2>
              <div className="grid grid-cols-2 gap-4">
                <button 
                  onClick={() => handleAddLog('PUNCH IN')}
                  disabled={isSubmitting}
                  className="group relative bg-white border-2 border-slate-100 p-6 rounded-2xl shadow-sm hover:shadow-md hover:border-blue-200 transition-all text-center active:scale-95 overflow-hidden"
                >
                  <div className="relative z-10">
                    <div className="bg-blue-50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:bg-blue-600 transition-colors">
                      <PlusCircle className="w-6 h-6 text-blue-600 group-hover:text-white" />
                    </div>
                    <span className="block font-bold text-slate-800">Punch In</span>
                  </div>
                </button>

                <button 
                  onClick={() => handleAddLog('PUNCH OUT')}
                  disabled={isSubmitting}
                  className="group relative bg-white border-2 border-slate-100 p-6 rounded-2xl shadow-sm hover:shadow-md hover:border-orange-200 transition-all text-center active:scale-95 overflow-hidden"
                >
                  <div className="relative z-10">
                    <div className="bg-orange-50 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 group-hover:bg-orange-600 transition-colors">
                      <LogOut className="w-6 h-6 text-orange-600 group-hover:text-white" />
                    </div>
                    <span className="block font-bold text-slate-800">Punch Out</span>
                  </div>
                </button>
              </div>
            </section>

            {/* Recent Activity */}
            <section>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wider">Recent Activity</h2>
                <button onClick={() => setView('history')} className="text-sm font-medium text-blue-600 hover:underline">View All</button>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
                {logs.length === 0 ? (
                  <div className="p-12 text-center text-slate-400">
                    <History className="w-12 h-12 mx-auto mb-3 opacity-20" />
                    <p>No activity recorded yet</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {logs.slice(0, 5).map((log) => (
                      <div key={log.id} className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors">
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${log.type === 'PUNCH IN' ? 'bg-blue-500' : 'bg-orange-500'}`} />
                          <div>
                            <p className="font-semibold text-slate-800 text-sm">{log.type}</p>
                            <p className="text-xs text-slate-500">
                              {log.timestamp.toLocaleDateString([], { month: 'short', day: 'numeric' })} • {log.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] bg-slate-100 text-slate-500 px-2 py-0.5 rounded-full font-mono">
                          {log.userId.slice(-4)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>
        )}

        {view === 'history' && (
          <div className="animate-in fade-in slide-in-from-right-4 duration-300">
            <button 
              onClick={() => setView('dashboard')}
              className="flex items-center gap-2 text-slate-500 mb-6 hover:text-slate-800"
            >
              <ChevronLeft className="w-5 h-5" />
              Back to Dashboard
            </button>
            <h2 className="text-2xl font-bold mb-6 text-slate-800">Full History</h2>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200">
                    <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Time</th>
                    <th className="p-4 text-xs font-semibold text-slate-500 uppercase">Action</th>
                    <th className="p-4 text-xs font-semibold text-slate-500 uppercase">User</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {logs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-50">
                      <td className="p-4">
                        <div className="text-sm font-medium text-slate-800">
                          {log.timestamp.toLocaleDateString()}
                        </div>
                        <div className="text-xs text-slate-500">
                          {log.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </td>
                      <td className="p-4">
                        <span className={`px-2 py-1 rounded-md text-[10px] font-bold ${
                          log.type === 'PUNCH IN' ? 'bg-blue-100 text-blue-700' : 'bg-orange-100 text-orange-700'
                        }`}>
                          {log.type}
                        </span>
                      </td>
                      <td className="p-4 text-sm text-slate-500 font-mono">
                        {log.userId.slice(-6)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* Mobile Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 md:hidden flex justify-around p-2 pb-6">
        <button 
          onClick={() => setView('dashboard')}
          className={`flex flex-col items-center p-2 rounded-xl transition-colors ${view === 'dashboard' ? 'text-blue-600' : 'text-slate-400'}`}
        >
          <LayoutDashboard className="w-6 h-6" />
          <span className="text-[10px] mt-1 font-medium">Home</span>
        </button>
        <button 
          onClick={() => setView('history')}
          className={`flex flex-col items-center p-2 rounded-xl transition-colors ${view === 'history' ? 'text-blue-600' : 'text-slate-400'}`}
        >
          <History className="w-6 h-6" />
          <span className="text-[10px] mt-1 font-medium">History</span>
        </button>
      </nav>
    </div>
  );
}
