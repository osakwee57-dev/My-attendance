
import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { handleRegister, uploadSignature } from '../services/supabaseClient';
import { AuthUser } from '../types';

interface RegisterProps {
  onRegister: (user: AuthUser) => void;
}

const DEPARTMENTS = [
  "Civil Engineering",
  "Mechanical Engineering",
  "Electrical & Electronics Engineering",
  "Computer Engineering",
  "Mechatronics Engineering",
  "Agricultural & Bio-Resources Engineering",
  "Chemical Engineering"
];

const LEVELS = ["100 Level", "200 Level", "300 Level", "400 Level", "500 Level"];

const Register: React.FC<RegisterProps> = ({ onRegister }) => {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isHoc, setIsHoc] = useState(false);
  const [secretCode, setSecretCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    name: '',
    matric_number: '',
    password: '',
    department: DEPARTMENTS[0],
    level: LEVELS[0],
  });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        // Set signature color to black
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 2.5;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
      }
    }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    draw(e);
  };

  const endDrawing = () => {
    setIsDrawing(false);
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.beginPath();
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    let clientX, clientY;
    if ('touches' in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const rect = canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // 1. Validate signature
      const canvas = canvasRef.current;
      if (!canvas) throw new Error("Signature pad error");
      
      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((b) => resolve(b), 'image/png');
      });
      if (!blob) throw new Error("Could not capture signature");

      // 2. Upload Signature
      const signatureUrl = await uploadSignature(blob, formData.matric_number);

      // 3. Handle HOC logic
      const finalIsHoc = isHoc && secretCode === 'ACCESS_GRANTED';

      // 4. Register Profile - Logic maps name, matric_number, password directly
      const profile = await handleRegister({
        name: formData.name,
        matric_number: formData.matric_number,
        password: formData.password,
        department: formData.department,
        level: formData.level,
        is_hoc: finalIsHoc,
        signature_url: signatureUrl
      });

      onRegister(profile);
      navigate('/login');
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 flex flex-col items-center justify-center p-6 selection:bg-indigo-500/30">
      <div className="max-w-2xl w-full bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl shadow-black p-8 relative overflow-hidden">
        {/* Engineering-inspired grid background */}
        <div className="absolute inset-0 opacity-5 pointer-events-none" style={{backgroundImage: 'radial-gradient(#4f46e5 1px, transparent 1px)', backgroundSize: '24px 24px'}}></div>
        
        <div className="relative z-10">
          <header className="mb-10 text-center">
            <h1 className="text-4xl font-black text-white tracking-tighter mb-2">MASTER REGISTRATION</h1>
            <p className="text-slate-500 uppercase text-xs tracking-[0.2em] font-bold">
              Faculty of Engineering | Student Database System
            </p>
            <div className="mt-4 inline-block px-3 py-1 bg-slate-800 rounded text-[10px] font-mono text-indigo-400 uppercase tracking-widest">
              Unified Matriculation Interface
            </div>
          </header>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="bg-red-500/10 border border-red-500/50 text-red-400 p-4 rounded-xl text-sm font-medium animate-pulse">
                SYSTEM ERROR: {error}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Full Name</label>
                <input
                  name="name"
                  type="text"
                  required
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="e.g. OLANREWAJU BABATUNDE"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-600"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Matriculation Number</label>
                <input
                  name="matric_number"
                  type="text"
                  required
                  value={formData.matric_number}
                  onChange={handleChange}
                  placeholder="2021/ENG/10293"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all font-mono placeholder:text-slate-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Department</label>
                <select
                  name="department"
                  value={formData.department}
                  onChange={handleChange}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none cursor-pointer"
                >
                  {DEPARTMENTS.map(dept => (
                    <option key={dept} value={dept}>{dept}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Academic Level</label>
                <select
                  name="level"
                  value={formData.level}
                  onChange={handleChange}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none appearance-none cursor-pointer"
                >
                  {LEVELS.map(lvl => (
                    <option key={lvl} value={lvl}>{lvl}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Security Password</label>
              <input
                name="password"
                type="password"
                required
                value={formData.password}
                onChange={handleChange}
                placeholder="••••••••"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
              />
            </div>

            <div className="p-4 bg-slate-800/50 rounded-2xl border border-slate-700/50">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-6 rounded-full p-1 cursor-pointer transition-colors ${isHoc ? 'bg-indigo-600' : 'bg-slate-600'}`} onClick={() => setIsHoc(!isHoc)}>
                    <div className={`w-4 h-4 bg-white rounded-full transition-transform ${isHoc ? 'translate-x-4' : ''}`}></div>
                  </div>
                  <span className="text-sm font-bold">Register as Class HOC?</span>
                </div>
              </div>
              
              {isHoc && (
                <div className="space-y-2 animate-in slide-in-from-top-2 duration-300">
                  <label className="text-xs font-bold text-indigo-400 uppercase tracking-wider">Secret Access Code</label>
                  <input
                    type="text"
                    value={secretCode}
                    onChange={(e) => setSecretCode(e.target.value)}
                    placeholder=""
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 outline-none transition-all"
                  />
                </div>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex justify-between items-end">
                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Digital Signature (Verification)</label>
                <button 
                  type="button" 
                  onClick={clearSignature}
                  className="text-[10px] text-indigo-400 font-bold uppercase tracking-widest hover:text-indigo-300 transition-colors"
                >
                  Reset Workspace
                </button>
              </div>
              <div className="bg-white border-2 border-slate-700 rounded-2xl overflow-hidden relative group">
                <canvas
                  ref={canvasRef}
                  width={600}
                  height={160}
                  className="w-full h-40 cursor-crosshair touch-none"
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={endDrawing}
                  onMouseLeave={endDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={endDrawing}
                />
                <div className="absolute bottom-2 right-4 pointer-events-none text-[10px] font-mono text-slate-300 uppercase">
                  Biometric Auth Layer
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-xl transition-all shadow-xl shadow-indigo-900/20 disabled:opacity-50 disabled:cursor-not-allowed group"
            >
              <div className="flex items-center justify-center gap-3">
                {loading ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                ) : (
                  <>
                    <span>INITIALIZE ACCOUNT</span>
                    <svg className="w-5 h-5 transition-transform group-hover:translate-x-1" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 7l5 5m0 0l-5 5m5-5H6"></path></svg>
                  </>
                )}
              </div>
            </button>
          </form>

          <footer className="mt-8 text-center">
            <p className="text-slate-500 text-sm">
              Account already exists? {' '}
              <Link to="/login" className="text-indigo-400 font-bold hover:text-indigo-300 underline underline-offset-4">
                LOGIN TO TERMINAL
              </Link>
            </p>
            <div className="mt-6 text-[10px] text-slate-700 font-mono italic tracking-widest">
              Verified Attendance Management Protocol v1.0
            </div>
          </footer>
        </div>
      </div>
    </div>
  );
};

export default Register;
