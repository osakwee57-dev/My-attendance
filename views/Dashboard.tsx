
import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  fetchDepartmentRoster, 
  fetchHocActiveSession,
  logAttendance,
  supabase
} from '../services/supabaseClient';
import { AuthUser, Profile } from '../types';

interface DashboardProps {
  user: AuthUser;
}

const Dashboard: React.FC<DashboardProps> = ({ user }) => {
  const navigate = useNavigate();
  const [roster, setRoster] = useState<Profile[]>([]);
  const [recentSessions, setRecentSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Live Broadcast States (HOC)
  const [activeSession, setActiveSession] = useState<any>(null);
  const [courseCode, setCourseCode] = useState('');
  const [lecturerName, setLecturerName] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  
  // Student Receiver States
  const [liveNotification, setLiveNotification] = useState<any>(null);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [entryCode, setEntryCode] = useState('');
  const [isSigning, setIsSigning] = useState(false);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const rosterData = await fetchDepartmentRoster(user.department);
      setRoster(rosterData || []);

      if (user.is_hoc) {
        const session = await fetchHocActiveSession(user.id!);
        setActiveSession(session);

        const { data: history } = await supabase
          .from('attendance_sessions')
          .select('*')
          .eq('hoc_id', user.id!)
          .eq('is_active', false)
          .order('created_at', { ascending: false })
          .limit(5);
        setRecentSessions(history || []);
      }
    } catch (err: any) {
      console.error("Sync error:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && user.department) {
      loadData();

      // Listen for active sessions matching this student's profile
      if (!user.is_hoc) {
        const sessionChannel = supabase
          .channel('live-sessions')
          .on('postgres_changes', { 
              event: '*', 
              schema: 'public', 
              table: 'attendance_sessions',
              filter: `department=eq.${user.department}` 
          }, (payload) => {
              const session = payload.new as any;
              if (session && session.is_active && session.level === user.level) {
                  setLiveNotification(session);
              } else {
                  setLiveNotification(null);
                  setShowCodeInput(false);
              }
          })
          .subscribe();

        return () => {
          supabase.removeChannel(sessionChannel);
        };
      }
    }
  }, [user]);

  const generateSessionCode = () => {
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; 
    let result = '';
    for (let i = 0; i < 6; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
  };

  const handleShare = async () => {
    if (!activeSession) return;
    
    const shareData = {
      title: 'Attendance Alert',
      text: `Attention! ${user.name} has started an attendance session for ${activeSession.course_code}. \n\nLog in to the portal and enter unique code: ${activeSession.session_code} \n\nLink: ${window.location.origin}`,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareData.text);
        setSuccess('Message copied to clipboard!');
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Sharing failed', err);
      }
    }
  };

  const handleStartSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseCode || !lecturerName) return;

    setIsStarting(true);
    setError(null);

    const newCode = generateSessionCode();
    
    try {
      const { data, error: sessionError } = await supabase
        .from('attendance_sessions')
        .insert([
          {
            course_code: courseCode,
            lecturer_name: lecturerName,
            session_code: newCode,
            department: user.department,
            level: user.level,
            hoc_id: user.id,
            is_active: true
          }
        ])
        .select();

      if (sessionError) {
        throw sessionError;
      } else {
        setActiveSession(data[0]); 
        setCourseCode('');
        setLecturerName('');
        setSuccess(`Broadcast live: ${newCode}`);
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err: any) {
      setError("Failed to initialize session broadcast.");
    } finally {
      setIsStarting(false);
    }
  };

  const handleStopSession = async () => {
    if (!activeSession) return;
    if (!window.confirm("CRITICAL: Terminate this session registry?")) return;

    try {
      const { error: stopError } = await supabase
        .from('attendance_sessions')
        .update({ is_active: false })
        .eq('id', activeSession.id);

      if (!stopError) {
        alert('Session Closed. No more entries allowed.');
        loadData();
        setActiveSession(null);
      } else {
        throw stopError;
      }
    } catch (err) {
      setError("Failed to terminate session registry.");
    }
  };

  /**
   * Verified presence signature logic based on the requested handleVerifyCode snippet.
   */
  const handleQuickSign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entryCode || entryCode.length !== 6 || !liveNotification) return;

    setIsSigning(true);
    setError(null);
    try {
      // 1. Code validation
      if (entryCode.toUpperCase() !== liveNotification.session_code) {
        alert("Invalid Code. Please check the HOC's broadcast.");
        throw new Error("Invalid Authorization Code.");
      }

      // If user has no signature stored, they must go to the manual signing page
      if (!user.signature_url) {
        navigate(`/mark-attendance?session_id=${liveNotification.id}`);
        return;
      }

      // 2. Mark attendance (following the snippet logic for denormalized field population)
      await logAttendance(liveNotification.id, user.id!, user.signature_url, {
        name: user.name,
        matric_number: user.matric_number,
        department: user.department,
        level: user.level
      });

      // 3. Success feedback from snippet
      alert("Attendance Marked Successfully!");
      setSuccess(`Presence recorded for ${liveNotification.course_code}.`);
      setShowCodeInput(false);
      setLiveNotification(null);
      setEntryCode('');
      
      setTimeout(() => setSuccess(null), 5000);
    } catch (err: any) {
      // Alert handling from snippet
      if (err.message !== "Invalid Authorization Code.") {
        alert("Error: " + err.message);
      }
      setError(err.message || "Registry authentication failed.");
    } finally {
      setIsSigning(false);
    }
  };

  const sortedRoster = [...roster].sort((a, b) => {
    const matchA = a.matric_number.match(/\d+$/);
    const matchB = b.matric_number.match(/\d+$/);
    const suffixA = matchA ? parseInt(matchA[0].slice(-3), 10) : 0;
    const suffixB = matchB ? parseInt(matchB[0].slice(-3), 10) : 0;
    return suffixA - suffixB;
  });

  const renderHocDashboard = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
      <section className="bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl relative">
        <div className="p-8">
          {activeSession ? (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-3 h-3 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_15px_rgba(16,185,129,1)]"></div>
                  <h2 className="text-xl font-black text-white uppercase tracking-widest">LIVE BROADCAST ACTIVE</h2>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={handleShare}
                    className="bg-indigo-600/20 text-indigo-400 border border-indigo-600/50 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all flex items-center gap-2"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"></path></svg>
                    Broadcast Alert
                  </button>
                  <Link 
                    to={`/report/${activeSession.id}`} 
                    className="bg-indigo-600/20 text-indigo-400 border border-indigo-600/50 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-600 hover:text-white transition-all"
                  >
                    View Live Report
                  </Link>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-indigo-900/40 border border-indigo-800 p-6 rounded-2xl text-center">
                  <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-1">Session Code</p>
                  <p className="text-4xl font-black text-white tracking-tighter font-mono">{activeSession.session_code}</p>
                </div>
                <div className="md:col-span-2 space-y-4">
                   <div className="flex flex-wrap gap-4">
                      <button onClick={handleStopSession} className="flex-1 bg-red-600 hover:bg-red-500 text-white font-black py-4 rounded-xl transition-all text-xs uppercase tracking-widest shadow-lg shadow-red-900/20">Stop Broadcast</button>
                   </div>
                   <div className="text-[10px] text-indigo-300 font-bold uppercase tracking-widest bg-slate-800/50 p-2 rounded-lg inline-block">
                    {activeSession.course_code} | {activeSession.lecturer_name}
                   </div>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleStartSession} className="space-y-6">
              <h2 className="text-xl font-black text-white uppercase tracking-widest">Broadcast Initialization</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Course Code</label>
                  <input type="text" required value={courseCode} onChange={(e) => setCourseCode(e.target.value.toUpperCase())} placeholder="E.G. ENG 401" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white font-mono outline-none focus:ring-2 focus:ring-indigo-600" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Lecturer Identity</label>
                  <input type="text" required value={lecturerName} onChange={(e) => setLecturerName(e.target.value)} placeholder="PROF. ADENIJI" className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white outline-none focus:ring-2 focus:ring-indigo-600" />
                </div>
              </div>
              <button type="submit" disabled={isStarting} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest transition-all shadow-xl shadow-indigo-900/20 disabled:opacity-50">
                {isStarting ? 'Allocating Resources...' : 'Start Live Broadcast'}
              </button>
            </form>
          )}
        </div>
      </section>

      {recentSessions.length > 0 && (
        <section className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl">
          <h3 className="text-sm font-black text-slate-400 uppercase tracking-widest mb-6">Archived Registries</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentSessions.map(s => (
              <Link 
                key={s.id} 
                to={`/report/${s.id}`}
                className="bg-slate-950 border border-slate-800 p-4 rounded-2xl hover:border-indigo-500 transition-colors group"
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="text-xs font-black text-white font-mono">{s.course_code}</span>
                  <span className="text-[9px] text-slate-600 font-bold">{new Date(s.created_at).toLocaleDateString()}</span>
                </div>
                <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest truncate">{s.lecturer_name}</p>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl">
        <h3 className="text-2xl font-black text-white tracking-tight mb-6 underline decoration-indigo-600 underline-offset-8 uppercase">Master Unit Registry</h3>
        <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-slate-900 text-slate-500 border-b border-slate-800">
              <tr>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest">S/N</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest">Full Name</th>
                <th className="px-6 py-4 text-[10px] font-bold uppercase tracking-widest">Matric Number</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800 text-slate-300">
              {sortedRoster.map((s, i) => (
                <tr key={s.id} className="hover:bg-slate-900/50">
                  <td className="px-6 py-4 font-mono text-[11px]">{(i+1).toString().padStart(2, '0')}</td>
                  <td className="px-6 py-4 text-sm font-bold">{s.name}</td>
                  <td className="px-6 py-4 font-mono text-indigo-400 font-bold">{s.matric_number}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );

  const renderStudentDashboard = () => (
    <div className="space-y-8 animate-in fade-in duration-600">
      {liveNotification && !showCodeInput && (
        <div 
          onClick={() => setShowCodeInput(true)}
          className="bg-indigo-600 text-white p-6 rounded-3xl shadow-2xl cursor-pointer hover:bg-indigo-500 transition-all animate-pulse border-4 border-white/10 flex items-center justify-between"
        >
          <div className="flex items-center gap-4">
             <div className="w-12 h-12 bg-white/20 rounded-2xl flex items-center justify-center">
                <svg className="w-6 h-6 animate-bounce" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9"></path></svg>
             </div>
             <div>
                <h4 className="font-black text-lg leading-tight uppercase tracking-tight">LIVE SESSION DETECTED</h4>
                <p className="text-sm font-bold opacity-80 uppercase tracking-widest">{liveNotification.course_code} by {liveNotification.lecturer_name}</p>
             </div>
          </div>
          <span className="text-[10px] font-black bg-white/20 px-3 py-1 rounded-full tracking-widest">TAP TO INPUT CODE</span>
        </div>
      )}

      {showCodeInput && (
        <section className="bg-slate-900 border border-slate-800 rounded-3xl p-8 shadow-2xl animate-in zoom-in-95 duration-300">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-black text-white uppercase tracking-widest">Authorize Presence</h2>
            <button onClick={() => setShowCodeInput(false)} className="text-slate-500 hover:text-white">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>
          <form onSubmit={handleQuickSign} className="space-y-6">
            <div className="text-center space-y-2">
              <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Verification code required for {liveNotification?.course_code}</p>
              <input
                type="text"
                maxLength={6}
                autoFocus
                value={entryCode}
                onChange={(e) => setEntryCode(e.target.value.toUpperCase())}
                placeholder="------"
                className="w-full bg-slate-950 border border-slate-700 rounded-2xl px-6 py-6 text-indigo-400 font-mono font-black text-5xl tracking-[0.4em] focus:ring-2 focus:ring-indigo-600 outline-none text-center shadow-inner"
              />
            </div>
            <button
              type="submit"
              disabled={isSigning || entryCode.length !== 6}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-5 rounded-2xl transition-all shadow-xl shadow-indigo-900/40 disabled:opacity-50 uppercase tracking-[0.2em] text-sm"
            >
              {isSigning ? 'TRANSMITTING BIOMETRICS...' : 'VERIFY & SIGN SESSION'}
            </button>
          </form>
        </section>
      )}

      {!liveNotification && !showCodeInput && (
        <div className="bg-slate-900 border border-slate-800 rounded-3xl p-16 text-center space-y-6 relative overflow-hidden">
          <div className="absolute inset-0 opacity-10">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 border-4 border-indigo-500 rounded-full animate-ping"></div>
          </div>
          <div className="relative z-10">
            <div className="w-20 h-20 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-6 border border-slate-700">
               <svg className="w-10 h-10 text-indigo-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"></path></svg>
            </div>
            <h3 className="text-xl font-black text-white uppercase tracking-widest">Scanning Registry</h3>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-widest">Waiting for {user.department} broadcasts...</p>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-3xl p-10 shadow-sm text-center">
        <h2 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">Identity: {user.name}</h2>
        <div className="flex flex-wrap justify-center gap-4 mt-6">
           <div className="px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl min-w-[140px]">
              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Node</div>
              <div className="text-sm font-black text-slate-900">{user.department}</div>
           </div>
           <div className="px-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl min-w-[140px]">
              <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mb-1">Status</div>
              <div className="text-sm font-black text-indigo-600">{user.level} ACTIVE</div>
           </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 selection:bg-indigo-500/30 no-print">
      <header className="mb-10 flex items-center justify-between border-b border-slate-200 pb-8">
        <div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter leading-none">{user.is_hoc ? 'HOC COMMAND' : 'STUDENT TERMINAL'}</h1>
          <p className="text-slate-500 text-[11px] font-bold uppercase tracking-[0.4em] mt-2">Unit ID: {user.matric_number}</p>
        </div>
        <div className="hidden sm:block text-right">
          <div className="bg-indigo-600/10 text-indigo-600 px-4 py-1.5 rounded-full text-[10px] font-black tracking-widest border border-indigo-600/20 uppercase">System v6.5.2-Verified</div>
        </div>
      </header>

      {error && (
        <div className="mb-6 bg-red-500/10 border border-red-500/50 text-red-500 px-6 py-4 rounded-2xl text-xs font-black uppercase tracking-widest animate-shake">
          CRITICAL ERROR: {error}
        </div>
      )}

      {success && (
        <div className="mb-6 bg-emerald-500/10 border border-emerald-500/50 text-emerald-500 px-6 py-4 rounded-2xl text-xs font-black uppercase tracking-widest animate-bounce">
          SUCCESS: {success}
        </div>
      )}

      {user.is_hoc ? renderHocDashboard() : renderStudentDashboard()}
    </div>
  );
};

export default Dashboard;
