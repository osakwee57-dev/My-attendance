
import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { handleLogin } from '../services/supabaseClient';
import { AuthUser } from '../types';

interface LoginProps {
  onLogin: (user: AuthUser) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const navigate = useNavigate();
  const [matricNumber, setMatricNumber] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Direct database query authentication
      const user = await handleLogin(matricNumber, password);
      
      // Store session
      onLogin(user);

      // Role-based redirection
      if (user.is_hoc) {
        navigate('/hoc-dashboard');
      } else {
        navigate('/student-dashboard');
      }
    } catch (err: any) {
      setError('Invalid Matric Number or Password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-8 relative overflow-hidden">
        {/* Engineering blueprint effect */}
        <div className="absolute inset-0 opacity-5 pointer-events-none" style={{backgroundImage: 'radial-gradient(#4f46e5 1px, transparent 1px)', backgroundSize: '24px 24px'}}></div>
        
        <div className="relative z-10">
          <header className="mb-10 text-center">
            <h1 className="text-3xl font-black text-white tracking-tighter mb-2 underline decoration-indigo-600 underline-offset-8">MASTER LOGIN</h1>
            <p className="text-slate-500 uppercase text-[10px] tracking-[0.2em] font-bold mt-4">
              Authorized Personnel Only
            </p>
          </header>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded-xl text-sm font-medium">
                ACCESS DENIED: {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Matriculation Number</label>
              <input
                type="text"
                required
                value={matricNumber}
                onChange={(e) => setMatricNumber(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none text-white font-mono placeholder:text-slate-600"
                placeholder="20XX/ENG/XXX"
              />
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Security Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none text-white placeholder:text-slate-600"
                placeholder="••••••••"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-xl transition-all shadow-xl shadow-indigo-900/20 disabled:opacity-50"
            >
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>VERIFYING...</span>
                </div>
              ) : 'LOGIN TO TERMINAL'}
            </button>
          </form>

          <div className="mt-8 text-center space-y-4">
            <p className="text-slate-500 text-sm">
              New profile required? {' '}
              <Link to="/register" className="text-indigo-400 font-bold hover:text-indigo-300">
                REGISTER MASTER IDENTITY
              </Link>
            </p>
            <div className="text-[10px] text-slate-700 font-mono tracking-widest uppercase">
              Secure Auth Protocol Active
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
