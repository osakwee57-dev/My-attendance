
import { createClient } from '@supabase/supabase-js';
import { Profile, AttendanceLog } from '../types';

const supabaseUrl = 'https://kyzewwinjvhjvebhdmvz.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5emV3d2luanZoanZlYmhkbXZ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzA1NTkzMTgsImV4cCI6MjA4NjEzNTMxOH0.MH7kxY0nukPEgXEwgcWDm0MtrSHddNwZLrnhL0bbDl8';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Custom Login Logic
 */
export const handleLogin = async (matric_number: string, password: string) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, matric_number, department, level, is_hoc, signature_url')
    .eq('matric_number', matric_number)
    .eq('password', password)
    .single();

  if (error) {
    throw new Error('Invalid matric number or password');
  }

  return data;
};

/**
 * Custom Registration Logic
 */
export const handleRegister = async (
  profileData: Omit<Profile, 'id' | 'created_at'>
) => {
  const { data, error } = await supabase
    .from('profiles')
    .insert([profileData])
    .select()
    .single();

  if (error) {
    if (error.code === '23505') {
      throw new Error('Matric number already exists');
    }
    throw error;
  }

  return data;
};

/**
 * Fetch Department Roster
 */
export const fetchDepartmentRoster = async (department: string) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, name, matric_number, level, department')
    .eq('department', department)
    .eq('is_hoc', false);

  if (error) throw error;
  return data;
};

/**
 * Live Broadcast System: Create Session
 */
export const createAttendanceSession = async (params: {
  courseCode: string,
  lecturerName: string,
  hocId: string,
  department: string,
  level: string,
  sessionCode: string
}) => {
  const { data, error } = await supabase
    .from('attendance_sessions')
    .insert([{
      course_code: params.courseCode,
      lecturer_name: params.lecturerName,
      hoc_id: params.hocId,
      department: params.department,
      level: params.level,
      is_active: true,
      session_code: params.sessionCode
    }])
    .select()
    .single();

  if (error) throw error;
  return data;
};

/**
 * Kill-Switch: Stop Session
 */
export const stopAttendanceSession = async (sessionId: string) => {
  const { error } = await supabase
    .from('attendance_sessions')
    .update({ is_active: false })
    .eq('id', sessionId);

  if (error) throw error;
};

/**
 * Find active session by 6-char code
 */
export const findSessionByCode = async (code: string) => {
  const { data, error } = await supabase
    .from('attendance_sessions')
    .select('*')
    .eq('session_code', code.toUpperCase())
    .eq('is_active', true)
    .single();

  if (error) throw new Error('Invalid or expired session code.');
  return data;
};

/**
 * Fetch current active session for an HOC
 */
export const fetchHocActiveSession = async (hocId: string) => {
  const { data, error } = await supabase
    .from('attendance_sessions')
    .select('*')
    .eq('hoc_id', hocId)
    .eq('is_active', true)
    .single();

  if (error && error.code !== 'PGRST116') throw error;
  return data;
};

/**
 * Fetch logs for a specific session
 */
export const fetchSessionAttendance = async (sessionId: string) => {
  const { data, error } = await supabase
    .from('attendance_logs')
    .select(`
      id,
      timestamp,
      signature_url,
      student_name,
      matric_number,
      profiles (
        name,
        matric_number
      )
    `)
    .eq('session_id', sessionId);

  if (error) throw error;
  return data as any[];
};

/**
 * Storage Logic
 */
export const uploadSignature = async (file: File | Blob, matricNumber: string) => {
  const fileName = `${matricNumber}_sig_${Date.now()}.png`;
  const { data, error } = await supabase.storage
    .from('signatures')
    .upload(fileName, file);

  if (error) {
    throw error;
  }

  const { data: { publicUrl } } = supabase.storage
    .from('signatures')
    .getPublicUrl(fileName);

  return publicUrl;
};

/**
 * Log Attendance with denormalized student details
 */
export const logAttendance = async (
  session_id: string, 
  student_id: string, 
  signature_url: string,
  studentDetails: {
    name: string,
    matric_number: string,
    department: string,
    level: string
  }
) => {
  const { data, error } = await supabase
    .from('attendance_logs')
    .insert([
      { 
        session_id, 
        student_id, 
        signature_url,
        student_name: studentDetails.name,
        matric_number: studentDetails.matric_number,
        department: studentDetails.department,
        level: studentDetails.level,
        timestamp: new Date().toISOString()
      }
    ])
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
};
