export type UserRole = 'super_admin' | 'school_admin' | 'teacher';

export interface School {
  id: string;
  name: string;
  code: string;
  motto: string;
  address: string;
  region: string;
  district: string;
  phone: string;
  email: string;
  logo_url: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string;
  phone: string;
  avatar_url: string;
  is_super_admin: boolean;
  is_active: boolean;
  created_at: string;
}

export interface SchoolMembership {
  id: string;
  school_id: string;
  user_id: string;
  role: UserRole;
  is_active: boolean;
  profile?: Profile;
  school?: School;
}

export interface AuthSession {
  user: Profile;
  token: string;
  activeSchoolId: string;
  activeRole: UserRole;
  memberships: SchoolMembership[];
  schools: School[];
  teacherRecordId?: string | null;
}

export interface AcademicYear {
  id: string;
  school_id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_current: boolean;
}

export interface Term {
  id: string;
  school_id: string;
  academic_year_id: string;
  name: 'Term 1' | 'Term 2' | 'Term 3';
  term_number: 1 | 2 | 3;
  start_date: string;
  end_date: string;
  next_reopening_date: string | null;
  is_current: boolean;
}

export interface Teacher {
  id: string;
  school_id: string;
  user_id: string | null;
  teacher_code: string;
  first_name: string;
  middle_name: string;
  surname: string;
  gender: 'Male' | 'Female';
  phone: string;
  email: string;
  address: string;
  academic_qualification: string;
  gha_number: string;
  first_appointment_date: string | null;
  current_rank: string;
  date_promoted: string | null;
  employment_status: 'Active' | 'On Leave' | 'Transferred' | 'Retired' | 'Inactive';
  photo_url: string;
  assigned_subject_ids?: string[];
  assigned_class_ids?: string[];
  assigned_subjects?: { id: string; name: string; subject_code: string }[];
  assigned_classes?: { id: string; name: string }[];
  created_at: string;
}

export interface SchoolClass {
  id: string;
  school_id: string;
  name: string;
  level_number: number;
  stream: string;
  class_teacher_id: string | null;
  class_teacher_name?: string;
  capacity: number;
  is_active: boolean;
  student_count?: number;
  subject_count?: number;
}

export interface Guardian {
  id: string;
  school_id: string;
  full_name: string;
  relationship: string;
  phone: string;
  alt_phone: string;
  email: string;
  address: string;
  occupation: string;
}

export type StudentStatus = 'Active' | 'Graduated' | 'Transferred' | 'Suspended' | 'Withdrawn';

export interface Student {
  id: string;
  school_id: string;
  student_code: string;
  first_name: string;
  middle_name: string;
  surname: string;
  gender: 'Male' | 'Female';
  date_of_birth: string;
  admission_date: string;
  current_class_id: string | null;
  class_name?: string;
  guardian_id: string | null;
  guardian_name?: string;
  guardian_phone?: string;
  guardian_address?: string;
  guardian_relationship?: string;
  photo_url: string;
  status: StudentStatus;
  created_at: string;
}

export interface StudentEnrollment {
  id: string;
  school_id: string;
  student_id: string;
  class_id: string;
  class_name?: string;
  academic_year_id: string;
  academic_year_name?: string;
  enrolled_at: string;
  promotion_status: 'Active' | 'Promoted' | 'Repeated' | 'Graduated' | 'Withdrawn';
  remarks: string;
}

export interface Subject {
  id: string;
  school_id: string;
  subject_code: string;
  name: string;
  description: string;
  is_core: boolean;
  status: 'Active' | 'Inactive';
  assignments?: ClassSubjectAssignment[];
}

export interface ClassSubjectAssignment {
  id: string;
  school_id: string;
  class_id: string;
  class_name?: string;
  subject_id: string;
  subject_name?: string;
  subject_code?: string;
  teacher_id: string | null;
  teacher_name?: string;
}

export interface AssessmentConfig {
  id: string;
  school_id: string;
  academic_year_id: string | null;
  name: string;
  class_exercise_max: number;
  homework_max: number;
  project_max: number;
  exam_max: number;
  is_active: boolean;
}

export interface GradingScaleItem {
  id: string;
  school_id: string;
  grade: string;
  min_score: number;
  max_score: number;
  remark: string;
  sort_order: number;
}

export interface ResultRecord {
  id: string;
  school_id: string;
  student_id: string;
  student_code?: string;
  student_name?: string;
  class_id: string;
  class_name?: string;
  subject_id: string;
  subject_name?: string;
  subject_code?: string;
  academic_year_id: string;
  term_id: string;
  term_name?: string;
  class_exercise: number;
  homework: number;
  project: number;
  exam: number;
  total_score: number;
  grade: string;
  remarks: string;
  is_locked: boolean;
  recorded_by: string | null;
  updated_at?: string;
}

export interface AttendanceRecord {
  id: string;
  school_id: string;
  student_id: string;
  student_code?: string;
  student_name?: string;
  gender?: string;
  class_id: string;
  class_name?: string;
  academic_year_id: string;
  term_id: string;
  attendance_date: string;
  status: 'Present' | 'Absent';
  remarks: string;
}

export interface ReportComment {
  id: string;
  school_id: string;
  student_id: string;
  class_id: string;
  academic_year_id: string;
  term_id: string;
  conduct: string;
  attitude: string;
  interest: string;
  class_teacher_comment: string;
  headteacher_comment: string;
  is_published: boolean;
}

export interface SchoolSettings {
  id: string;
  school_id: string;
  student_id_prefix: string;
  teacher_id_prefix: string;
  default_class_teacher_comment: string;
  default_headteacher_comment: string;
  headteacher_name: string;
  allow_teacher_result_lock: boolean;
  show_class_position_on_report: boolean;
}

export interface DashboardAnalytics {
  summary: {
    totalStudents: number;
    maleStudents: number;
    femaleStudents: number;
    totalTeachers: number;
    totalSubjects: number;
    totalClasses: number;
  };
  genderDistribution: { name: string; value: number; fill: string }[];
  subjectPerformance: { subject: string; code: string; average: number; entries: number }[];
  termComparison: { term: string; average: number; entries: number }[];
  gradeDistribution: { grade: string; count: number; remark: string }[];
  highlights: {
    highestStudent: { name: string; studentCode: string; className: string; average: number } | null;
    lowestStudent: { name: string; studentCode: string; className: string; average: number } | null;
    highestSubject: { name: string; code: string; average: number } | null;
    lowestSubject: { name: string; code: string; average: number } | null;
    overallAverage: number;
  };
}

export interface StudentReportCardData {
  school: School;
  settings: SchoolSettings;
  academicYear: AcademicYear;
  term: Term;
  student: Student;
  schoolClass: SchoolClass;
  subjects: {
    subject_id: string;
    subject_name: string;
    subject_code: string;
    class_exercise: number;
    homework: number;
    project: number;
    sba_total: number;
    exam: number;
    total_score: number;
    grade: string;
    remarks: string;
    subject_average: number;
  }[];
  overallAverage: number;
  totalScoreSum: number;
  classPosition: number;
  classSize: number;
  attendance: {
    presentDays: number;
    absentDays: number;
    totalDays: number;
    percentage: number;
  };
  comment: ReportComment | null;
}
