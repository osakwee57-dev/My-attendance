
export interface Profile {
  id?: string;
  name: string;
  matric_number: string;
  password?: string;
  department: string;
  level: string;
  is_hoc?: boolean;
  signature_url?: string;
  created_at?: string;
}

export interface AttendanceRecord {
  id: string;
  student_id: string;
  course_code: string;
  timestamp: string;
  signature_url: string;
  profiles?: Profile;
}

export interface AttendanceSession {
  id: string;
  course_code: string;
  lecturer_name: string;
  hoc_id: string;
  department: string;
  level: string;
  created_at: string;
  is_active: boolean;
  session_code: string;
}

export interface AttendanceLog {
  id: string;
  session_id: string;
  student_id: string;
  student_name?: string;
  matric_number?: string;
  department?: string;
  level?: string;
  timestamp: string;
  signature_url: string;
  profiles?: Profile;
  attendance_sessions?: AttendanceSession;
}

export type AuthUser = Omit<Profile, 'password'>;
