
import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, Link } from 'react-router-dom';
import Login from './views/Login';
import Register from './views/Register';
import Dashboard from './views/Dashboard';
import MarkAttendance from './views/MarkAttendance';
import AttendanceReport from './views/AttendanceReport';
import { AuthUser } from './types';

const App: React.FC = () => {
  const [user, setUser] = useState<AuthUser | null>(() => {
    const saved = localStorage.getItem('edu_user');
    return saved ? JSON.parse(saved) : null;
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem('edu_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('edu_user');
    }
  }, [user]);

  const handleLogout = () => {
    setUser(null);
  };

  return (
    <HashRouter>
      <div className="min-h-screen flex flex-col bg-slate-50">
        {user && (
          <nav className="bg-white border-b border-slate-200 px-4 py-3 flex justify-between items-center shadow-sm sticky top-0 z-50 no-print">
            <Link to="/" className="text-xl font-bold text-indigo-600 flex items-center gap-2">
              <span className="bg-indigo-600 text-white p-1 rounded">EA</span>
              EduAttend
            </Link>
            <div className="flex items-center gap-6">
              <Link to="/" className="text-slate-600 hover:text-indigo-600 font-medium">Dashboard</Link>
              <div className="flex items-center gap-3 ml-4 border-l pl-4">
                <div className="text-right hidden sm:block">
                  <p className="text-sm font-semibold text-slate-900">{user.name}</p>
                  <p className="text-xs text-slate-500 font-mono">{user.matric_number}</p>
                </div>
                <button
                  onClick={handleLogout}
                  className="bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-600 p-2 rounded-full transition-colors"
                  title="Logout"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                </button>
              </div>
            </div>
          </nav>
        )}

        <main className="flex-grow">
          <Routes>
            <Route 
              path="/login" 
              element={user ? <Navigate to="/" /> : <Login onLogin={setUser} />} 
            />
            <Route 
              path="/register" 
              element={user ? <Navigate to="/" /> : <Register onRegister={setUser} />} 
            />
            <Route 
              path="/mark-attendance" 
              element={user ? <MarkAttendance user={user} /> : <Navigate to="/login" />} 
            />
            <Route 
              path="/report/:sessionId" 
              element={user ? <AttendanceReport user={user} /> : <Navigate to="/login" />} 
            />
            <Route 
              path="/" 
              element={user ? <Dashboard user={user} onUpdateUser={setUser} /> : <Navigate to="/login" />} 
            />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>

        <footer className="py-6 text-center text-slate-400 text-sm bg-white border-t border-slate-100 no-print">
          &copy; {new Date().getFullYear()} EduAttend Pro. All rights reserved.
        </footer>
      </div>
    </HashRouter>
  );
};

export default App;
