import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

export const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'school_system.db');
export const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const computed = crypto.scryptSync(password, salt, 64);
  const storedBuf = Buffer.from(hash, 'hex');
  if (computed.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(computed, storedBuf);
}

export function newUuid(): string {
  return crypto.randomUUID();
}

export function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schools (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      code TEXT NOT NULL UNIQUE,
      motto TEXT DEFAULT '',
      address TEXT DEFAULT '',
      region TEXT DEFAULT 'Greater Accra',
      district TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      logo_url TEXT DEFAULT '',
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      phone TEXT DEFAULT '',
      avatar_url TEXT DEFAULT '',
      is_super_admin INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS school_memberships (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      user_id TEXT NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
      role TEXT NOT NULL CHECK (role IN ('super_admin', 'school_admin', 'teacher')),
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (school_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS academic_years (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      is_current INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (school_id, name)
    );

    CREATE TABLE IF NOT EXISTS terms (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE CASCADE,
      name TEXT NOT NULL CHECK (name IN ('Term 1', 'Term 2', 'Term 3')),
      term_number INTEGER NOT NULL CHECK (term_number BETWEEN 1 AND 3),
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      next_reopening_date TEXT,
      is_current INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (school_id, academic_year_id, term_number)
    );

    CREATE TABLE IF NOT EXISTS teachers (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      teacher_code TEXT NOT NULL,
      first_name TEXT NOT NULL,
      middle_name TEXT DEFAULT '',
      surname TEXT NOT NULL,
      gender TEXT NOT NULL CHECK (gender IN ('Male', 'Female')),
      phone TEXT NOT NULL DEFAULT '',
      email TEXT DEFAULT '',
      address TEXT DEFAULT '',
      academic_qualification TEXT DEFAULT '',
      first_appointment_date TEXT,
      current_rank TEXT DEFAULT 'Senior Superintendent II',
      date_promoted TEXT,
      employment_status TEXT NOT NULL DEFAULT 'Active' CHECK (employment_status IN ('Active', 'On Leave', 'Transferred', 'Retired', 'Inactive')),
      photo_url TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (school_id, teacher_code)
    );

    CREATE TABLE IF NOT EXISTS classes (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      level_number INTEGER NOT NULL CHECK (level_number BETWEEN 1 AND 9),
      stream TEXT DEFAULT '',
      class_teacher_id TEXT REFERENCES teachers(id) ON DELETE SET NULL,
      capacity INTEGER NOT NULL DEFAULT 45,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (school_id, name)
    );

    CREATE TABLE IF NOT EXISTS guardians (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      full_name TEXT NOT NULL,
      relationship TEXT NOT NULL DEFAULT 'Parent',
      phone TEXT NOT NULL,
      alt_phone TEXT DEFAULT '',
      email TEXT DEFAULT '',
      address TEXT DEFAULT '',
      occupation TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS students (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      student_code TEXT NOT NULL,
      first_name TEXT NOT NULL,
      middle_name TEXT DEFAULT '',
      surname TEXT NOT NULL,
      gender TEXT NOT NULL CHECK (gender IN ('Male', 'Female')),
      date_of_birth TEXT NOT NULL,
      admission_date TEXT NOT NULL,
      current_class_id TEXT REFERENCES classes(id) ON DELETE SET NULL,
      guardian_id TEXT REFERENCES guardians(id) ON DELETE SET NULL,
      photo_url TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Graduated', 'Transferred', 'Suspended', 'Withdrawn')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (school_id, student_code)
    );

    CREATE TABLE IF NOT EXISTS subjects (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      subject_code TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      is_core INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (school_id, subject_code),
      UNIQUE (school_id, name)
    );

    CREATE TABLE IF NOT EXISTS class_subjects (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      teacher_id TEXT REFERENCES teachers(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (school_id, class_id, subject_id)
    );

    CREATE TABLE IF NOT EXISTS teacher_subjects (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      teacher_id TEXT NOT NULL REFERENCES teachers(id) ON DELETE CASCADE,
      subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (school_id, teacher_id, subject_id)
    );

    CREATE TABLE IF NOT EXISTS student_enrollments (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
      academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
      enrolled_at TEXT NOT NULL DEFAULT (date('now')),
      promotion_status TEXT NOT NULL DEFAULT 'Active' CHECK (promotion_status IN ('Active', 'Promoted', 'Repeated', 'Graduated', 'Withdrawn')),
      remarks TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (school_id, student_id, academic_year_id)
    );

    CREATE TABLE IF NOT EXISTS assessments (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      academic_year_id TEXT REFERENCES academic_years(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      class_exercise_max REAL NOT NULL DEFAULT 10,
      homework_max REAL NOT NULL DEFAULT 10,
      project_max REAL NOT NULL DEFAULT 10,
      exam_max REAL NOT NULL DEFAULT 70,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS grading_scales (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      grade TEXT NOT NULL,
      min_score REAL NOT NULL,
      max_score REAL NOT NULL,
      remark TEXT NOT NULL,
      sort_order INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (school_id, grade)
    );

    CREATE TABLE IF NOT EXISTS results (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
      subject_id TEXT NOT NULL REFERENCES subjects(id) ON DELETE RESTRICT,
      academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
      term_id TEXT NOT NULL REFERENCES terms(id) ON DELETE RESTRICT,
      class_exercise REAL NOT NULL DEFAULT 0,
      homework REAL NOT NULL DEFAULT 0,
      project REAL NOT NULL DEFAULT 0,
      exam REAL NOT NULL DEFAULT 0,
      total_score REAL NOT NULL DEFAULT 0,
      grade TEXT NOT NULL DEFAULT 'F',
      remarks TEXT NOT NULL DEFAULT '',
      is_locked INTEGER NOT NULL DEFAULT 0,
      recorded_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (school_id, student_id, subject_id, academic_year_id, term_id)
    );

    CREATE TABLE IF NOT EXISTS attendance (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
      academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
      term_id TEXT NOT NULL REFERENCES terms(id) ON DELETE RESTRICT,
      attendance_date TEXT NOT NULL,
      status TEXT NOT NULL CHECK (status IN ('Present', 'Absent')),
      remarks TEXT DEFAULT '',
      recorded_by TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (school_id, student_id, attendance_date)
    );

    CREATE TABLE IF NOT EXISTS report_comments (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE RESTRICT,
      academic_year_id TEXT NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
      term_id TEXT NOT NULL REFERENCES terms(id) ON DELETE RESTRICT,
      conduct TEXT DEFAULT 'Satisfactory',
      attitude TEXT DEFAULT 'Hardworking',
      interest TEXT DEFAULT 'Reading & Mathematics',
      class_teacher_comment TEXT DEFAULT '',
      headteacher_comment TEXT DEFAULT '',
      is_published INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (school_id, student_id, academic_year_id, term_id)
    );

    CREATE TABLE IF NOT EXISTS school_settings (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL UNIQUE REFERENCES schools(id) ON DELETE CASCADE,
      student_id_prefix TEXT NOT NULL DEFAULT 'STU',
      teacher_id_prefix TEXT NOT NULL DEFAULT 'TCH',
      default_class_teacher_comment TEXT DEFAULT 'Good performance this term. Keep putting in steady effort across all subjects.',
      default_headteacher_comment TEXT DEFAULT 'Promising progress. Encouraged to maintain discipline and regular attendance.',
      headteacher_name TEXT DEFAULT '',
      allow_teacher_result_lock INTEGER NOT NULL DEFAULT 0,
      show_class_position_on_report INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      school_id TEXT NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
      user_id TEXT REFERENCES profiles(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'info',
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      school_id TEXT REFERENCES schools(id) ON DELETE CASCADE,
      actor_id TEXT REFERENCES profiles(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT,
      details TEXT DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}
