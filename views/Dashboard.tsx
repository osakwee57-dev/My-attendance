
import React, { useEffect, useState } from 'react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { 
  fetchDepartmentRoster, 
  supabase,
  logAttendance
} from '../services/supabaseClient';
import { AuthUser, Profile } from '../types';

interface DashboardProps {
  user: AuthUser;
}

const Dashboard: React.FC<DashboardProps> = ({ user }) => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [roster, setRoster] = useState<Profile[]>([]);
  const [recentSessions, setRecentSessions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // HOC Active Session State
  const [activeSession, setActiveSession] = useState<any>(null);
  const [courseCode, setCourseCode] = useState('');
  const [lecturerName, setLecturerName] = useState('');
  const [isStarting, setIsStarting] = useState(false);
  
  // Student Discovery State (Requested: activeNotice)
  const [activeNotice, setActiveNotice] = useState<any>(null);
  const [showCodeInput, setShowCodeInput] = useState(false);
  const [entryCode, setEntryCode] = useState('');
  const [isSigning, setIsSigning] = useState(false);

  // 1. HOC Session Recovery Logic (Requested pattern)
  useEffect(() => {
    if (user.is_hoc) {
      const checkActiveSession = async () => {
        const { data, error } = await supabase
          .from('attendance_sessions')
          .select('*')
          .eq('hoc_id', user.id)
          .eq('is_active', true)
          .maybeSingle(); // Looks for one active session

        if (data) {
          setActiveSession(data);
          // Sync history too
          const { data: history } = await supabase
            .from('attendance_sessions')
            .select('*')
            .eq('hoc_id', user.id)
            .eq('is_active', false)
            .order('created_at', { ascending: false })
            .limit(5);
          setRecentSessions(history || []);
        }
      };
      checkActiveSession();
    }
  }, [user.id, user.is_hoc]);

  // 2. Student Initial Check & Real-time Listener (Requested pattern)
  useEffect(() => {
    if (!user.is_hoc) {
      // 1. Initial Check on Load
      const fetchActive = async () => {
        const { data } = await supabase
          .from('attendance_sessions')
          .select('*')
          .eq('department', user.department)
          .eq('level', user.level)
          .eq('is_active', true)
          .maybeSingle();
        if (data) setActiveNotice(data);
      };
      fetchActive();

      // 2. Real-time Listener (Listen for "New" sessions)
      const channel = supabase
        .channel('student-alerts')
        .on('postgres_changes', { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'attendance_sessions' 
        }, (payload) => {
          if (payload.new.is_active && 
              payload.new.department === user.department && 
              payload.new.level === user.level) {
            setActiveNotice(payload.new);
          }
        })
        .on('postgres_changes', { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'attendance_sessions' 
        }, (payload) => {
          // If a session is closed, remove notice
          if (payload.new.id === activeNotice?.id && !payload.new.is_active) {
            setActiveNotice(null);
            setShowCodeInput(false);
          }
        })
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user.department, user.level, user.is_hoc, activeNotice?.id]);

  useEffect(() => {
    if (user && user.department) {
      fetchDepartmentRoster(user.department).then(data => setRoster(data || []));
      
      // Deep Link Join Handler
      const joinCode = searchParams.get('join');
      if (joinCode && !user.is_hoc) {
        setEntryCode(joinCode.toUpperCase());
        setShowCodeInput(true);
        supabase.from('attendance_sessions')
          .select('*')
          .eq('session_code', joinCode.toUpperCase())
          .eq('is_active', true)
          .single()
          .then(({data}) => {
            if (data) setActiveNotice(data);
          });
      }
    }
  }, [user, searchParams]);

  const generateSessionCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; 
    let res = '';
    for (let i = 0; i < 6; i++) res += chars.charAt(Math.floor(Math.random() * chars.length));
    return res;
  };

  const handleShare = async () => {
    if (!activeSession) return;
    const appLink = `${window.location.origin}/#/?join=${activeSession.session_code}`;
    const shareText = `📢 *ATTENDANCE ALERT* 📢\n\n${user.name} has started a registry for *${activeSession.course_code}*.\n\n✅ *Code:* ${activeSession.session_code}\n🔗 *Sign here:* ${appLink}`;

    try {
      if (navigator.share) {
        await navigator.share({ title: 'EduAttend Alert', text: shareText });
      } else {
        await navigator.clipboard.writeText(shareText);
        setSuccess('Share link copied to clipboard!');
        setTimeout(() => setSuccess(null), 3000);
      }
    } catch (err) {}
  };

  const handleStartSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!courseCode || !lecturerName) return;

    setIsStarting(true);
    const newCode = generateSessionCode();
    
    try {
      const { data, error: sessionError } = await supabase
        .from('attendance_sessions')
        .insert([{
          course_code: courseCode,
          lecturer_name: lecturerName,
          session_code: newCode,
          department: user.department,
          level: user.level,
          hoc_id: user.id,
          is_active: true
        }])
        .select()
        .single();

      if (sessionError) throw sessionError;
      setActiveSession(data); 
      setCourseCode('');
      setLecturerName('');
      setSuccess(`Broadcast live: ${newCode}`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err: any) {
      setError("Broadcast initialization failed.");
    } finally {
      setIsStarting(false);
    }
  };

  const handleStopSession = async () => {
    if (!activeSession) return;
    if (!window.confirm("TERMINATE REGISTRY? No more entries will be allowed.")) return;

    try {
      await supabase
        .from('attendance_sessions')
        .update({ is_active: false })
        .eq('id', activeSession.id);

      setActiveSession(null);
      // Refresh history
      const { data: history } = await supabase
        .from('attendance_sessions')
        .select('*')
        .eq('hoc_id', user.id)
        .eq('is_active', false)
        .order('created_at', { ascending: false })
        .limit(5);
      setRecentSessions(history || []);
    } catch (err) {
      setError("Failed to stop broadcast.");
    }
  };

  const handleQuickSign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entryCode || !activeNotice) return;

    setIsSigning(true);
    try {
      if (entryCode.toUpperCase() !== activeNotice.session_code) {
        throw new Error("INVALID_CODE");
      }

      if (!user.signature_url) {
        navigate(`/mark-attendance?session_id=${activeNotice.id}`);
        return;
      }

      await logAttendance(activeNotice.id, user.id!, user.signature_url, {
        name: user.name,
        matric_number: user.matric_number,
        department: user.department,
        level: user.level
      });

      alert("Registry updated successfully!");
      setSuccess(`Attendance recorded for ${activeNotice.course_code}.`);
      setShowCodeInput(false);
      setActiveNotice(null);
      setEntryCode('');
    } catch (err: any) {
      alert(err.message === "INVALID_CODE" ? "Verification failed: Check code." : "Transmission error.");
    } finally {
      setIsSigning(false);
    }
  };

  const sortedRoster = [...roster].sort((a, b) => {
    const suffixA = parseInt(a.matric_number.slice(-3)) || 0;
    const suffixB = parseInt(b.matric_number.slice(-3)) || 0;
    return suffixA - suffixB;
  });

  const renderHocDashboard = () => (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <section className="bg-slate-900 border border-slate-800 rounded-[2rem] overflow-hidden shadow-2xl">
        <div className="p-10">
          {activeSession ? (
            <div className="space-y-8">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-4 h-4 bg-emerald-500 rounded-full animate-pulse shadow-[0_0_20px_rgba(16,185,129,0.6)]"></div>
                  <h2 className="text-xl font-black text-white uppercase tracking-widest">REGISTRY BROADCAST ACTIVE</h2>
                </div>
                <button onClick={handleShare} className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"></path></svg>
                  BROADCAST ALERT
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                <div className="bg-slate-950 border border-slate-800 p-8 rounded-3xl text-center">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-2">AUTH CODE</p>
                  <p className="text-5xl font-black text-white tracking-tighter font-mono">{activeSession.session_code}</p>
                </div>
                <div className="md:col-span-2 flex flex-col justify-center space-y-4">
                   <div className="flex items-center gap-3">
                      <span className="bg-indigo-600/20 text-indigo-400 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest">{activeSession.course_code}</span>
                      <span className="text-slate-400 font-bold uppercase tracking-widest text-xs">{activeSession.lecturer_name}</span>
                   </div>
                   <div className="flex gap-4">
                      <Link to={`/report/${activeSession.id}`} className="flex-1 bg-slate-800 hover:bg-slate-700 text-white font-black py-4 rounded-xl text-center text-xs uppercase tracking-widest transition-all">View Report</Link>
                      <button onClick={handleStopSession} className="flex-1 bg-red-600 hover:bg-red-500 text-white font-black py-4 rounded-xl text-xs uppercase tracking-widest transition-all shadow-xl shadow-red-900/20">Close Registry</button>
                   </div>
                </div>
              </div>
            </div>
          ) : (
            <form onSubmit={handleStartSession} className="space-y-8">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-indigo-600/10 rounded-2xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                </div>
                <div>
                   <h2 className="text-2xl font-black text-white tracking-tight uppercase">Session Setup</h2>
                   <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">Initialize a new attendance broadcast</p>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Course Code</label>
                  <input type="text" required value={courseCode} onChange={(e) => setCourseCode(e.target.value.toUpperCase())} placeholder="E.G. CSC 402" className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-5 py-4 text-white font-mono outline-none focus:ring-2 focus:ring-indigo-600 transition-all" />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Lecturer Identity</label>
                  <input type="text" required value={lecturerName} onChange={(e) => setLecturerName(e.target.value)} placeholder="PROF. JOHNSON" className="w-full bg-slate-800 border border-slate-700 rounded-2xl px-5 py-4 text-white outline-none focus:ring-2 focus:ring-indigo-600 transition-all" />
                </div>
              </div>
              <button type="submit" disabled={isStarting} className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-5 rounded-2xl text-sm uppercase tracking-[0.2em] transition-all shadow-2xl shadow-indigo-900/30 disabled:opacity-50">
                {isStarting ? 'ALLOCATING RESOURCES...' : 'INITIALIZE BROADCAST'}
              </button>
            </form>
          )}
        </div>
      </section>

      {recentSessions.length > 0 && (
        <section className="bg-slate-900 border border-slate-800 rounded-[2rem] p-8">
          <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] mb-6">Archive Vault</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {recentSessions.map(s => (
              <Link key={s.id} to={`/report/${s.id}`} className="bg-slate-950 border border-slate-800 p-5 rounded-2xl hover:border-indigo-600 transition-all group">
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

      <section className="bg-white border border-slate-200 rounded-[2rem] overflow-hidden shadow-sm">
        <div className="px-8 py-6 bg-slate-50 border-b border-slate-200 flex justify-between items-center">
           <h3 className="text-sm font-black text-slate-900 uppercase tracking-widest">Master Unit Registry</h3>
           <span className="text-[10px] font-bold text-slate-400 bg-white px-3 py-1 rounded-full border border-slate-200 uppercase">{roster.length} Identities Found</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-50 text-slate-400 border-b border-slate-200">
              <tr>
                <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest">S/N</th>
                <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest">Full Name</th>
                <th className="px-8 py-4 text-[10px] font-black uppercase tracking-widest">Unit ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedRoster.map((s, i) => (
                <tr key={s.id} className="hover:bg-slate-50/50">
                  <td className="px-8 py-5 font-mono text-[11px] text-slate-400">{(i+1).toString().padStart(2, '0')}</td>
                  <td className="px-8 py-5 text-sm font-black text-slate-900 uppercase">{s.name}</td>
                  <td className="px-8 py-5 font-mono text-indigo-600 font-bold text-xs">{s.matric_number}</td>
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
      {/* Requested Active Notice Component */}
      {activeNotice && (
        <div className="bg-orange-500 text-white p-6 rounded-3xl shadow-lg mb-8 animate-bounce border-4 border-white/20">
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <p className="font-black text-lg tracking-tight uppercase">🔔 ACTIVE SESSION: {activeNotice.course_code}</p>
              <p className="text-sm font-bold opacity-90 uppercase tracking-widest">Lecturer: {activeNotice.lecturer_name}</p>
            </div>
            {!showCodeInput && (
              <button 
                onClick={() => setShowCodeInput(true)} 
                className="bg-white text-orange-600 px-6 py-2 rounded-full text-xs font-black uppercase tracking-widest shadow-md hover:bg-orange-50 transition-colors"
              >
                Enter Code Now
              </button>
            )}
          </div>
        </div>
      )}

      {showCodeInput && (
        <section className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-10 shadow-2xl animate-in fade-in slide-in-from-top-4 duration-500">
          <div className="flex justify-between items-center mb-10">
            <div>
               <h2 className="text-2xl font-black text-white tracking-tight uppercase">Presence Verification</h2>
               <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mt-1">Authorized signature required for {activeNotice?.course_code}</p>
            </div>
            <button onClick={() => setShowCodeInput(false)} className="bg-slate-800 text-slate-400 hover:text-white p-2 rounded-xl transition-all">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
          </div>
          <form onSubmit={handleQuickSign} className="space-y-8">
            <div className="relative">
              <input
                type="text"
                maxLength={6}
                autoFocus
                value={entryCode}
                onChange={(e) => setEntryCode(e.target.value.toUpperCase())}
                placeholder="------"
                className="w-full bg-slate-950 border-2 border-slate-800 rounded-3xl px-8 py-8 text-indigo-400 font-mono font-black text-6xl tracking-[0.5em] focus:border-indigo-600 outline-none text-center shadow-inner uppercase transition-all"
              />
            </div>
            <button
              type="submit"
              disabled={isSigning || entryCode.length !== 6}
              className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-black py-6 rounded-3xl transition-all shadow-2xl shadow-indigo-900/40 disabled:opacity-50 uppercase tracking-[0.3em] text-sm"
            >
              {isSigning ? 'TRANSMITTING IDENTITY...' : 'VERIFY & SIGN REGISTRY'}
            </button>
          </form>
        </section>
      )}

      {!activeNotice && !showCodeInput && (
        <div className="bg-slate-900 border border-slate-800 rounded-[2.5rem] p-20 text-center relative overflow-hidden shadow-2xl">
          <div className="absolute inset-0 opacity-5">
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] border-2 border-indigo-500 rounded-full animate-[ping_3s_infinite]"></div>
          </div>
          <div className="relative z-10 space-y-6">
            <div className="w-24 h-24 bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-8 border border-slate-700 shadow-inner">
               <svg className="w-12 h-12 text-indigo-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0"></path></svg>
            </div>
            <h3 className="text-2xl font-black text-white uppercase tracking-widest">SCANNING BROADCASTS</h3>
            <p className="text-slate-500 text-xs font-bold uppercase tracking-[0.4em]">Node: {user.department} | {user.level}</p>
          </div>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-[2.5rem] p-12 shadow-sm flex flex-col items-center">
         <div className="w-20 h-20 bg-indigo-50 rounded-3xl flex items-center justify-center text-indigo-600 text-3xl font-black mb-6">
            {user.name.charAt(0)}
         </div>
         <h2 className="text-3xl font-black text-slate-900 tracking-tighter text-center uppercase mb-2">{user.name}</h2>
         <p className="text-slate-400 font-mono text-sm mb-10">{user.matric_number}</p>
         <div className="flex flex-wrap justify-center gap-4 w-full max-w-lg">
            <div className="flex-1 bg-slate-50 p-6 rounded-3xl border border-slate-100 text-center">
               <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Status</p>
               <p className="text-sm font-black text-slate-900 uppercase">{user.level}</p>
            </div>
            <div className="flex-1 bg-slate-50 p-6 rounded-3xl border border-slate-100 text-center">
               <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1">Department</p>
               <p className="text-sm font-black text-indigo-600 uppercase truncate px-2">{user.department.split(' ')[0]}</p>
            </div>
         </div>
      </div>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-6 py-12 selection:bg-indigo-500/30 no-print">
      <header className="mb-12 flex items-end justify-between border-b-4 border-slate-900 pb-10">
        <div className="space-y-2">
          <div className="flex items-center gap-3">
             <div className="bg-indigo-600 text-white px-3 py-1 rounded text-[10px] font-black uppercase tracking-widest">PRO TERMINAL</div>
             <div className="text-slate-400 text-[10px] font-black uppercase tracking-widest">v6.8.5-LIVE</div>
          </div>
          <h1 className="text-6xl font-black text-slate-900 tracking-tighter leading-none">{user.is_hoc ? 'HOC COMMAND' : 'STUDENT UNIT'}</h1>
        </div>
        <div className="hidden lg:block text-right">
           <p className="text-[10px] font-black text-slate-400 uppercase tracking-[0.5em]">System Latency: 18ms</p>
           <p className="text-slate-900 font-mono text-xs font-bold mt-1">STATUS: ONLINE_ENCRYPTED</p>
        </div>
      </header>

      {(error || success) && (
        <div className={`mb-8 px-8 py-5 rounded-2xl text-[10px] font-black uppercase tracking-widest border animate-in slide-in-from-top-4 ${error ? 'bg-red-50 border-red-100 text-red-600' : 'bg-emerald-50 border-emerald-100 text-emerald-600'}`}>
          {error ? `CRITICAL: ${error}` : `SYSTEM: ${success}`}
        </div>
      )}

      {user.is_hoc ? renderHocDashboard() : renderStudentDashboard()}
    </div>
  );
};

export default Dashboard;
