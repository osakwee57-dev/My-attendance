
import React, { useRef, useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { uploadSignature, logAttendance, supabase } from '../services/supabaseClient';
import { AuthUser } from '../types';

interface MarkAttendanceProps {
  user: AuthUser;
}

const MarkAttendance: React.FC<MarkAttendanceProps> = ({ user }) => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  
  const [sessionId, setSessionId] = useState(searchParams.get('session_id') || '');
  const [courseDetails, setCourseDetails] = useState<{code: string, lecturer: string} | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (sessionId) {
      fetchSessionDetails(sessionId);
    }

    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
      }
    }
  }, [sessionId]);

  const fetchSessionDetails = async (id: string) => {
    const { data, error } = await supabase
      .from('attendance_sessions')
      .select('course_code, lecturer_name')
      .eq('id', id)
      .single();
    
    if (!error && data) {
      setCourseDetails({
        code: data.course_code,
        lecturer: data.lecturer_name
      });
    }
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

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (canvas && ctx) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionId) {
      setError('Invalid or missing Session ID. Please scan the QR code again.');
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    setLoading(true);
    setError(null);

    try {
      // 1. Capture signature
      const blob = await new Promise<Blob>((resolve) => {
        canvas.toBlob((b) => resolve(b!), 'image/png');
      });

      // 2. Upload signature
      const signatureUrl = await uploadSignature(blob, user.matric_number);

      // 3. Log attendance (using the denormalized student details logic)
      if (user.id) {
        await logAttendance(sessionId, user.id, signatureUrl, {
          name: user.name,
          matric_number: user.matric_number,
          department: user.department,
          level: user.level
        });
        alert("Attendance Marked Successfully!");
        navigate('/');
      }
    } catch (err: any) {
      alert("Error: " + err.message);
      setError(err.message || 'Verification failed. Please retry.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 animate-in fade-in duration-500">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-100 p-8">
        <div className="mb-8 text-center sm:text-left">
          <div className="flex items-center gap-3 mb-2 justify-center sm:justify-start">
             <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-black text-xs">EA</div>
             <h1 className="text-2xl font-black text-slate-900 tracking-tight uppercase">Presence Verification</h1>
          </div>
          <p className="text-sm text-slate-500 font-medium">Record your signature for the current academic session.</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="bg-red-50 text-red-600 p-4 rounded-xl text-xs border border-red-100 font-black uppercase tracking-widest">
              SYSTEM ALERT: {error}
            </div>
          )}

          <div className="bg-slate-50 border border-slate-100 p-6 rounded-2xl">
             <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Course Code</p>
                   <p className="font-mono font-bold text-slate-900">{courseDetails?.code || 'FETCHING...'}</p>
                </div>
                <div className="space-y-1">
                   <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Lecturer</p>
                   <p className="font-bold text-slate-900 truncate">{courseDetails?.lecturer || 'FETCHING...'}</p>
                </div>
             </div>
          </div>

          <div>
            <div className="flex justify-between items-end mb-2">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">Biometric Signature</label>
              <button
                type="button"
                onClick={clearCanvas}
                className="text-[10px] text-indigo-600 font-bold uppercase tracking-widest hover:text-indigo-800 transition-colors"
              >
                Reset Canvas
              </button>
            </div>
            <div className="border-2 border-slate-100 rounded-2xl overflow-hidden bg-white relative shadow-inner">
              <canvas
                ref={canvasRef}
                width={600}
                height={200}
                className="w-full h-48 cursor-crosshair touch-none"
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={endDrawing}
                onMouseLeave={endDrawing}
                onTouchStart={startDrawing}
                onTouchMove={draw}
                onTouchEnd={endDrawing}
              />
              <div className="absolute bottom-2 right-4 pointer-events-none text-[10px] font-mono text-slate-200 uppercase tracking-widest">
                Encryption Layer Active
              </div>
            </div>
            <p className="mt-2 text-[10px] text-slate-400 font-bold uppercase tracking-widest italic text-center">Standard Black Ink Protocol</p>
          </div>

          <div className="flex flex-col sm:flex-row gap-4 pt-4">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="flex-1 bg-slate-100 text-slate-600 font-bold py-4 rounded-xl hover:bg-slate-200 transition-colors uppercase tracking-widest text-xs"
            >
              Abort Signal
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-black py-4 rounded-xl transition-all shadow-xl shadow-indigo-900/20 disabled:opacity-50 uppercase tracking-widest text-xs"
            >
              {loading ? (
                <div className="flex items-center justify-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                  <span>UPLOADING...</span>
                </div>
              ) : 'TRANSMIT PRESENCE'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default MarkAttendance;
