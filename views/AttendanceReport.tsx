
import React, { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { fetchSessionAttendance, supabase } from '../services/supabaseClient';
import { AuthUser } from '../types';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface AttendanceReportProps {
  user: AuthUser;
}

const AttendanceReport: React.FC<AttendanceReportProps> = ({ user }) => {
  const { sessionId } = useParams<{ sessionId: string }>();
  const navigate = useNavigate();
  const reportRef = useRef<HTMLDivElement>(null);
  
  const [logs, setLogs] = useState<any[]>([]);
  const [session, setSession] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadReportData = async () => {
    if (!sessionId) return;
    try {
      setLoading(true);
      setError(null);

      const { data: sessionData, error: sessionError } = await supabase
        .from('attendance_sessions')
        .select('*')
        .eq('id', sessionId)
        .single();

      if (sessionError) throw sessionError;
      setSession(sessionData);

      const data = await fetchSessionAttendance(sessionId);
      setLogs(data || []);
    } catch (err: any) {
      console.error("Report sync error:", err);
      setError("Failed to synchronize report data.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReportData();

    const channel = supabase
      .channel(`session_logs_${sessionId}`)
      .on(
        'postgres_changes',
        { 
          event: '*', 
          schema: 'public', 
          table: 'attendance_logs',
          filter: `session_id=eq.${sessionId}`
        },
        async () => {
          const data = await fetchSessionAttendance(sessionId!);
          setLogs(data || []);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [sessionId]);

  const sortedLogs = [...logs].sort((a, b) => {
    const getSuffixValue = (m: string) => {
      const match = m.match(/\d+$/);
      if (!match) return 0;
      const suffix = match[0].slice(-3);
      return parseInt(suffix, 10) || 0;
    };
    return getSuffixValue(a.profiles.matric_number) - getSuffixValue(b.profiles.matric_number);
  });

  const downloadPDF = async () => {
    if (!reportRef.current) return;
    const element = reportRef.current;
    
    const canvas = await html2canvas(element, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff'
    });
    
    const imgData = canvas.toDataURL('image/png');
    const pdf = new jsPDF('p', 'mm', 'a4');
    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
    
    pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
    pdf.save(`REPORT_${session?.course_code}_${new Date().toLocaleDateString()}.pdf`);
  };

  const shareSummary = async () => {
    const totalPresent = logs.length;
    const summary = `EduAttend Registry Summary:\n\nCourse: ${session?.course_code}\nDept: ${session?.department}\nLevel: ${session?.level}\nLecturer: ${session?.lecturer_name}\n\nTOTAL SIGNED: ${totalPresent}\nStatus: Official Record Verified\nDate: ${new Date().toLocaleString()}\n\nVerified via EduAttend Pro Terminal.`;
    
    try {
      if (navigator.share) {
        await navigator.share({
          title: `Attendance: ${session?.course_code}`,
          text: summary
        });
      } else {
        await navigator.clipboard.writeText(summary);
        alert('Summary text copied to clipboard!');
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        console.error('Sharing failed', err);
      }
    }
  };

  if (loading && !session) return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-indigo-600"></div>
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto px-4 py-12 animate-in fade-in duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 no-print">
        <button 
          onClick={() => navigate('/')} 
          className="text-slate-500 hover:text-indigo-600 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest"
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M10 19l-7-7m0 0l7-7m-7 7h18"></path></svg>
          Return to Command
        </button>
        <div className="flex gap-2 w-full md:w-auto">
          <button 
            onClick={shareSummary}
            className="flex-1 md:flex-none bg-slate-900 text-white px-5 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-slate-800 transition-all flex items-center justify-center gap-2"
          >
            Share Summary
          </button>
          <button 
            onClick={downloadPDF}
            className="flex-1 md:flex-none bg-indigo-600 text-white px-5 py-3 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-indigo-500 transition-all flex items-center justify-center gap-2"
          >
            Export to PDF
          </button>
        </div>
      </div>

      <div ref={reportRef} className="bg-white border border-slate-200 rounded-[2rem] shadow-2xl overflow-hidden p-12 print:shadow-none print:border-none">
        <header className="mb-10 border-b-[6px] border-slate-900 pb-10">
           <div className="flex flex-col md:flex-row justify-between items-end gap-6">
              <div className="space-y-3 text-left">
                <div className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.4em]">FACULTY OF ENGINEERING REGISTRY</div>
                <h1 className="text-5xl font-black text-slate-900 tracking-tighter leading-none">{session?.course_code}</h1>
                <p className="text-slate-500 text-sm font-bold uppercase tracking-widest">COURSE LECTURER: {session?.lecturer_name}</p>
              </div>
              <div className="text-right space-y-1">
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{session?.department}</p>
                <p className="text-2xl font-black text-slate-900 tracking-tight">{session?.level}</p>
                <div className="bg-indigo-600 text-white px-3 py-1 rounded-lg text-[10px] font-black mt-2 inline-block">CODE: {session?.session_code}</div>
              </div>
           </div>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-slate-900 text-white">
                <th className="px-6 py-4 text-[9px] font-black uppercase tracking-widest">S/N</th>
                <th className="px-6 py-4 text-[9px] font-black uppercase tracking-widest">Student Identity</th>
                <th className="px-6 py-4 text-[9px] font-black uppercase tracking-widest">Matric Number</th>
                <th className="px-6 py-4 text-[9px] font-black uppercase tracking-widest text-right">Biometric Auth</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedLogs.length > 0 ? (
                sortedLogs.map((log, index) => (
                  <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-6 font-mono text-[10px] text-slate-400">{(index + 1).toString().padStart(2, '0')}</td>
                    <td className="px-6 py-6">
                      <div className="text-sm font-black text-slate-900 tracking-tight uppercase">{log.profiles.name}</div>
                      <div className="text-[8px] text-slate-400 font-mono mt-0.5">AUTH_TS: {new Date(log.timestamp).toLocaleTimeString()}</div>
                    </td>
                    <td className="px-6 py-6">
                      <span className="text-[10px] font-bold text-indigo-600 font-mono bg-indigo-50 px-2 py-1 rounded border border-indigo-100">
                        {log.profiles.matric_number}
                      </span>
                    </td>
                    <td className="px-6 py-6">
                      <div className="w-28 h-12 ml-auto bg-white border border-slate-100 rounded p-1 flex items-center justify-center overflow-hidden">
                        <img 
                          src={log.signature_url} 
                          alt="Signature" 
                          className="max-w-full max-h-full object-contain grayscale"
                          crossOrigin="anonymous"
                        />
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-6 py-24 text-center">
                    <div className="flex flex-col items-center gap-4 opacity-20">
                       <p className="text-xs font-black text-slate-900 uppercase tracking-[0.2em]">Registry stream is empty</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <footer className="mt-12 pt-10 border-t border-slate-100 flex justify-between items-center">
           <div>
              <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Personnel Tally</div>
              <div className="text-2xl font-black text-slate-900">{logs.length} Signed</div>
           </div>
           <div className="text-right">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Official EduAttend Report</p>
              <p className="text-[8px] font-mono text-slate-300 mt-1 uppercase">Node ID: {session?.hoc_id}</p>
           </div>
        </footer>
      </div>
    </div>
  );
};

export default AttendanceReport;
