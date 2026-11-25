-- ============================================================================
-- AKWAABA SCHOOLSUITE — COMPLETE SUPABASE SETUP SCRIPT
-- Multi-School Ghanaian Basic School Management System (Basic 1 - Basic 9)
-- Paste and run this entire script in Supabase -> SQL Editor -> New Query
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. CORE TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.schools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  motto TEXT DEFAULT '',
  address TEXT DEFAULT '',
  region TEXT DEFAULT 'Greater Accra',
  district TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  logo_url TEXT DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_schools_code ON public.schools(code);

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  avatar_url TEXT DEFAULT '',
  is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);

CREATE TABLE IF NOT EXISTS public.school_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'school_admin', 'teacher')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_school_memberships_school ON public.school_memberships(school_id);
CREATE INDEX IF NOT EXISTS idx_school_memberships_user ON public.school_memberships(user_id);

CREATE TABLE IF NOT EXISTS public.academic_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, name),
  CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS idx_academic_years_school ON public.academic_years(school_id);

CREATE TABLE IF NOT EXISTS public.terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE CASCADE,
  name TEXT NOT NULL CHECK (name IN ('Term 1', 'Term 2', 'Term 3')),
  term_number SMALLINT NOT NULL CHECK (term_number BETWEEN 1 AND 3),
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  next_reopening_date DATE,
  is_current BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, academic_year_id, term_number),
  CHECK (end_date >= start_date)
);
CREATE INDEX IF NOT EXISTS idx_terms_school_year ON public.terms(school_id, academic_year_id);

CREATE TABLE IF NOT EXISTS public.teachers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  teacher_code TEXT NOT NULL,
  first_name TEXT NOT NULL,
  middle_name TEXT DEFAULT '',
  surname TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('Male', 'Female')),
  phone TEXT NOT NULL DEFAULT '',
  email TEXT DEFAULT '',
  address TEXT DEFAULT '',
  academic_qualification TEXT DEFAULT '',
  first_appointment_date DATE,
  current_rank TEXT DEFAULT 'Senior Superintendent II',
  date_promoted DATE,
  employment_status TEXT NOT NULL DEFAULT 'Active' CHECK (employment_status IN ('Active', 'On Leave', 'Transferred', 'Retired', 'Inactive')),
  photo_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, teacher_code)
);
CREATE INDEX IF NOT EXISTS idx_teachers_school ON public.teachers(school_id);
CREATE INDEX IF NOT EXISTS idx_teachers_user ON public.teachers(user_id);

CREATE TABLE IF NOT EXISTS public.classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  level_number SMALLINT NOT NULL CHECK (level_number BETWEEN 1 AND 9),
  stream TEXT DEFAULT '',
  class_teacher_id UUID REFERENCES public.teachers(id) ON DELETE SET NULL,
  capacity INTEGER NOT NULL DEFAULT 45 CHECK (capacity > 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, name)
);
CREATE INDEX IF NOT EXISTS idx_classes_school ON public.classes(school_id);

CREATE TABLE IF NOT EXISTS public.guardians (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  relationship TEXT NOT NULL DEFAULT 'Parent',
  phone TEXT NOT NULL,
  alt_phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  address TEXT DEFAULT '',
  occupation TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_guardians_school ON public.guardians(school_id);

CREATE TABLE IF NOT EXISTS public.students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_code TEXT NOT NULL,
  first_name TEXT NOT NULL,
  middle_name TEXT DEFAULT '',
  surname TEXT NOT NULL,
  gender TEXT NOT NULL CHECK (gender IN ('Male', 'Female')),
  date_of_birth DATE NOT NULL,
  admission_date DATE NOT NULL DEFAULT CURRENT_DATE,
  current_class_id UUID REFERENCES public.classes(id) ON DELETE SET NULL,
  guardian_id UUID REFERENCES public.guardians(id) ON DELETE SET NULL,
  photo_url TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Graduated', 'Transferred', 'Suspended', 'Withdrawn')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, student_code)
);
CREATE INDEX IF NOT EXISTS idx_students_school ON public.students(school_id);
CREATE INDEX IF NOT EXISTS idx_students_class ON public.students(school_id, current_class_id);

CREATE TABLE IF NOT EXISTS public.subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  subject_code TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  is_core BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, subject_code),
  UNIQUE (school_id, name)
);
CREATE INDEX IF NOT EXISTS idx_subjects_school ON public.subjects(school_id);

-- ============================================================================
-- 2. ACADEMIC RELATIONSHIP, ASSESSMENT & CONFIGURATION TABLES
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.class_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES public.teachers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, class_id, subject_id)
);
CREATE INDEX IF NOT EXISTS idx_class_subjects_school ON public.class_subjects(school_id);

CREATE TABLE IF NOT EXISTS public.teacher_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, teacher_id, subject_id)
);
CREATE INDEX IF NOT EXISTS idx_teacher_subjects_school ON public.teacher_subjects(school_id);

CREATE TABLE IF NOT EXISTS public.student_enrollments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
  enrolled_at DATE NOT NULL DEFAULT CURRENT_DATE,
  promotion_status TEXT NOT NULL DEFAULT 'Active' CHECK (promotion_status IN ('Active', 'Promoted', 'Repeated', 'Graduated', 'Withdrawn')),
  remarks TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, student_id, academic_year_id)
);
CREATE INDEX IF NOT EXISTS idx_enrollments_school_year ON public.student_enrollments(school_id, academic_year_id);

CREATE TABLE IF NOT EXISTS public.assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  class_exercise_max NUMERIC(5,2) NOT NULL DEFAULT 10 CHECK (class_exercise_max >= 0),
  homework_max NUMERIC(5,2) NOT NULL DEFAULT 10 CHECK (homework_max >= 0),
  project_max NUMERIC(5,2) NOT NULL DEFAULT 10 CHECK (project_max >= 0),
  exam_max NUMERIC(5,2) NOT NULL DEFAULT 70 CHECK (exam_max >= 0),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (class_exercise_max + homework_max + project_max + exam_max = 100)
);
CREATE INDEX IF NOT EXISTS idx_assessments_school ON public.assessments(school_id);

CREATE TABLE IF NOT EXISTS public.grading_scales (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  grade TEXT NOT NULL,
  min_score NUMERIC(5,2) NOT NULL CHECK (min_score >= 0 AND min_score <= 100),
  max_score NUMERIC(5,2) NOT NULL CHECK (max_score >= 0 AND max_score <= 100),
  remark TEXT NOT NULL,
  sort_order SMALLINT NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, grade),
  CHECK (max_score >= min_score)
);
CREATE INDEX IF NOT EXISTS idx_grading_scales_school ON public.grading_scales(school_id);

CREATE TABLE IF NOT EXISTS public.results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE RESTRICT,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
  term_id UUID NOT NULL REFERENCES public.terms(id) ON DELETE RESTRICT,
  class_exercise NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (class_exercise >= 0),
  homework NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (homework >= 0),
  project NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (project >= 0),
  exam NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (exam >= 0),
  total_score NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (total_score >= 0 AND total_score <= 100),
  grade TEXT NOT NULL DEFAULT 'F',
  remarks TEXT NOT NULL DEFAULT '',
  is_locked BOOLEAN NOT NULL DEFAULT FALSE,
  recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, student_id, subject_id, academic_year_id, term_id)
);
CREATE INDEX IF NOT EXISTS idx_results_lookup ON public.results(school_id, academic_year_id, term_id, class_id, subject_id);

CREATE TABLE IF NOT EXISTS public.attendance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
  term_id UUID NOT NULL REFERENCES public.terms(id) ON DELETE RESTRICT,
  attendance_date DATE NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('Present', 'Absent')),
  remarks TEXT DEFAULT '',
  recorded_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, student_id, attendance_date)
);
CREATE INDEX IF NOT EXISTS idx_attendance_filter ON public.attendance(school_id, class_id, attendance_date);

CREATE TABLE IF NOT EXISTS public.report_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE RESTRICT,
  academic_year_id UUID NOT NULL REFERENCES public.academic_years(id) ON DELETE RESTRICT,
  term_id UUID NOT NULL REFERENCES public.terms(id) ON DELETE RESTRICT,
  conduct TEXT DEFAULT 'Satisfactory',
  attitude TEXT DEFAULT 'Hardworking',
  interest TEXT DEFAULT 'Reading & Mathematics',
  class_teacher_comment TEXT DEFAULT '',
  headteacher_comment TEXT DEFAULT '',
  is_published BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, student_id, academic_year_id, term_id)
);

CREATE TABLE IF NOT EXISTS public.school_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL UNIQUE REFERENCES public.schools(id) ON DELETE CASCADE,
  student_id_prefix TEXT NOT NULL DEFAULT 'STU',
  teacher_id_prefix TEXT NOT NULL DEFAULT 'TCH',
  default_class_teacher_comment TEXT DEFAULT 'Good performance this term. Keep putting in steady effort across all subjects.',
  default_headteacher_comment TEXT DEFAULT 'Promising progress. Encouraged to maintain discipline and regular attendance.',
  headteacher_name TEXT DEFAULT '',
  allow_teacher_result_lock BOOLEAN NOT NULL DEFAULT FALSE,
  show_class_position_on_report BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'info' CHECK (category IN ('info', 'warning', 'success', 'alert')),
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID REFERENCES public.schools(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  details JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- 3. FUNCTIONS, TRIGGERS, VIEWS & RPCS
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'schools', 'profiles', 'school_memberships', 'academic_years', 'terms',
    'teachers', 'classes', 'guardians', 'students', 'subjects',
    'class_subjects', 'student_enrollments', 'assessments', 'grading_scales',
    'results', 'attendance', 'report_comments', 'school_settings'
  ]
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_%I_updated_at ON public.%I;', tbl, tbl);
    EXECUTE format('CREATE TRIGGER trg_%I_updated_at BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();', tbl, tbl);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.generate_student_code()
RETURNS TRIGGER AS $$
DECLARE
  v_prefix TEXT;
  v_year TEXT;
  v_seq INTEGER;
BEGIN
  IF NEW.student_code IS NULL OR btrim(NEW.student_code) = '' THEN
    SELECT COALESCE(student_id_prefix, 'STU') INTO v_prefix
    FROM public.school_settings WHERE school_id = NEW.school_id;
    v_prefix := COALESCE(v_prefix, 'STU');
    v_year := EXTRACT(YEAR FROM COALESCE(NEW.admission_date, CURRENT_DATE))::TEXT;
    SELECT COALESCE(COUNT(*), 0) + 1 INTO v_seq FROM public.students WHERE school_id = NEW.school_id;
    NEW.student_code := v_prefix || '-' || v_year || '-' || lpad(v_seq::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_students_auto_code ON public.students;
CREATE TRIGGER trg_students_auto_code
BEFORE INSERT ON public.students
FOR EACH ROW EXECUTE FUNCTION public.generate_student_code();

CREATE OR REPLACE FUNCTION public.generate_teacher_code()
RETURNS TRIGGER AS $$
DECLARE
  v_prefix TEXT;
  v_seq INTEGER;
BEGIN
  IF NEW.teacher_code IS NULL OR btrim(NEW.teacher_code) = '' THEN
    SELECT COALESCE(teacher_id_prefix, 'TCH') INTO v_prefix
    FROM public.school_settings WHERE school_id = NEW.school_id;
    v_prefix := COALESCE(v_prefix, 'TCH');
    SELECT COALESCE(COUNT(*), 0) + 1 INTO v_seq FROM public.teachers WHERE school_id = NEW.school_id;
    NEW.teacher_code := v_prefix || '-' || lpad(v_seq::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_teachers_auto_code ON public.teachers;
CREATE TRIGGER trg_teachers_auto_code
BEFORE INSERT ON public.teachers
FOR EACH ROW EXECUTE FUNCTION public.generate_teacher_code();

CREATE OR REPLACE FUNCTION public.compute_result_totals_and_grade()
RETURNS TRIGGER AS $$
DECLARE
  v_ce_max NUMERIC := 10;
  v_hw_max NUMERIC := 10;
  v_proj_max NUMERIC := 10;
  v_exam_max NUMERIC := 70;
  v_grade TEXT;
  v_remark TEXT;
BEGIN
  SELECT class_exercise_max, homework_max, project_max, exam_max
  INTO v_ce_max, v_hw_max, v_proj_max, v_exam_max
  FROM public.assessments
  WHERE school_id = NEW.school_id AND is_active = TRUE
  ORDER BY created_at DESC LIMIT 1;

  v_ce_max := COALESCE(v_ce_max, 10);
  v_hw_max := COALESCE(v_hw_max, 10);
  v_proj_max := COALESCE(v_proj_max, 10);
  v_exam_max := COALESCE(v_exam_max, 70);

  IF NEW.class_exercise > v_ce_max THEN RAISE EXCEPTION 'Class exercise exceeds maximum (%)', v_ce_max; END IF;
  IF NEW.homework > v_hw_max THEN RAISE EXCEPTION 'Homework exceeds maximum (%)', v_hw_max; END IF;
  IF NEW.project > v_proj_max THEN RAISE EXCEPTION 'Project exceeds maximum (%)', v_proj_max; END IF;
  IF NEW.exam > v_exam_max THEN RAISE EXCEPTION 'Exam exceeds maximum (%)', v_exam_max; END IF;

  NEW.total_score := ROUND(NEW.class_exercise + NEW.homework + NEW.project + NEW.exam, 2);

  SELECT grade, remark INTO v_grade, v_remark
  FROM public.grading_scales
  WHERE school_id = NEW.school_id AND NEW.total_score >= min_score AND NEW.total_score <= max_score
  ORDER BY min_score DESC LIMIT 1;

  IF v_grade IS NULL THEN
    IF NEW.total_score >= 80 THEN v_grade := 'A'; v_remark := 'Excellent';
    ELSIF NEW.total_score >= 70 THEN v_grade := 'B'; v_remark := 'Very Good';
    ELSIF NEW.total_score >= 60 THEN v_grade := 'C'; v_remark := 'Good';
    ELSIF NEW.total_score >= 50 THEN v_grade := 'D'; v_remark := 'Credit';
    ELSIF NEW.total_score >= 40 THEN v_grade := 'E'; v_remark := 'Pass';
    ELSE v_grade := 'F'; v_remark := 'Fail';
    END IF;
  END IF;

  NEW.grade := v_grade;
  NEW.remarks := v_remark;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_results_compute ON public.results;
CREATE TRIGGER trg_results_compute
BEFORE INSERT OR UPDATE ON public.results
FOR EACH ROW EXECUTE FUNCTION public.compute_result_totals_and_grade();

CREATE OR REPLACE FUNCTION public.prevent_locked_result_modification()
RETURNS TRIGGER AS $$
DECLARE
  v_is_admin BOOLEAN;
BEGIN
  IF OLD.is_locked = TRUE THEN
    SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = TRUE)
    OR EXISTS (
      SELECT 1 FROM public.school_memberships
      WHERE user_id = auth.uid() AND school_id = OLD.school_id AND role IN ('super_admin', 'school_admin') AND is_active = TRUE
    ) INTO v_is_admin;

    IF NOT COALESCE(v_is_admin, FALSE) THEN
      RAISE EXCEPTION 'Locked result cannot be modified by a non-administrator.';
    END IF;

    IF TG_OP = 'UPDATE' AND NEW.is_locked = TRUE AND (
      NEW.class_exercise IS DISTINCT FROM OLD.class_exercise OR
      NEW.homework IS DISTINCT FROM OLD.homework OR
      NEW.project IS DISTINCT FROM OLD.project OR
      NEW.exam IS DISTINCT FROM OLD.exam
    ) THEN
      RAISE EXCEPTION 'Unlock result before modifying scores.';
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_results_lock_guard ON public.results;
CREATE TRIGGER trg_results_lock_guard
BEFORE UPDATE OR DELETE ON public.results
FOR EACH ROW EXECUTE FUNCTION public.prevent_locked_result_modification();

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
DECLARE
  v_email TEXT := lower(btrim(COALESCE(NEW.email, '')));
  v_is_super BOOLEAN := lower(btrim(COALESCE(NEW.email, ''))) IN (
    lower('dawum30@gmail.com'),
    lower('superadmin@akwaabasms.gh')
  );
BEGIN
  INSERT INTO public.profiles (id, email, full_name, is_super_admin)
  VALUES (
    NEW.id,
    v_email,
    COALESCE(NULLIF(btrim(NEW.raw_user_meta_data->>'full_name'), ''), split_part(v_email, '@', 1)),
    v_is_super
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    is_super_admin = CASE WHEN v_is_super THEN TRUE ELSE public.profiles.is_super_admin END;

  IF v_is_super THEN
    INSERT INTO public.school_memberships (school_id, user_id, role, is_active)
    SELECT id, NEW.id, 'super_admin', TRUE
    FROM public.schools
    WHERE code = 'ARBS-001'
    ON CONFLICT (school_id, user_id) DO UPDATE SET role = 'super_admin', is_active = TRUE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

CREATE OR REPLACE FUNCTION public.bootstrap_new_school()
RETURNS TRIGGER AS $$
DECLARE
  v_year_id UUID;
  v_lvl SMALLINT;
BEGIN
  INSERT INTO public.school_settings (school_id, student_id_prefix, teacher_id_prefix)
  VALUES (NEW.id, UPPER(LEFT(NEW.code, 4)), 'TCH')
  ON CONFLICT (school_id) DO NOTHING;

  INSERT INTO public.assessments (school_id, name, class_exercise_max, homework_max, project_max, exam_max, is_active)
  VALUES (NEW.id, 'GES Standard SBA + End of Term Exam', 10, 10, 10, 70, TRUE);

  INSERT INTO public.grading_scales (school_id, grade, min_score, max_score, remark, sort_order)
  VALUES
    (NEW.id, 'A', 80, 100, 'Excellent', 1),
    (NEW.id, 'B', 70, 79.99, 'Very Good', 2),
    (NEW.id, 'C', 60, 69.99, 'Good', 3),
    (NEW.id, 'D', 50, 59.99, 'Credit', 4),
    (NEW.id, 'E', 40, 49.99, 'Pass', 5),
    (NEW.id, 'F', 0, 39.99, 'Fail', 6)
  ON CONFLICT (school_id, grade) DO NOTHING;

  INSERT INTO public.academic_years (school_id, name, start_date, end_date, is_current)
  VALUES (NEW.id, '2025/2026', '2025-09-08', '2026-07-24', TRUE)
  ON CONFLICT (school_id, name) DO NOTHING
  RETURNING id INTO v_year_id;

  IF v_year_id IS NOT NULL THEN
    INSERT INTO public.terms (school_id, academic_year_id, name, term_number, start_date, end_date, next_reopening_date, is_current)
    VALUES
      (NEW.id, v_year_id, 'Term 1', 1, '2025-09-08', '2025-12-18', '2026-01-12', FALSE),
      (NEW.id, v_year_id, 'Term 2', 2, '2026-01-12', '2026-04-02', '2026-04-27', TRUE),
      (NEW.id, v_year_id, 'Term 3', 3, '2026-04-27', '2026-07-24', '2026-09-07', FALSE);
  END IF;

  FOR v_lvl IN 1..9 LOOP
    INSERT INTO public.classes (school_id, name, level_number, stream, capacity, is_active)
    VALUES (NEW.id, 'Basic ' || v_lvl, v_lvl, '', 45, TRUE)
    ON CONFLICT (school_id, name) DO NOTHING;
  END LOOP;

  INSERT INTO public.subjects (school_id, subject_code, name, description, is_core, status)
  VALUES
    (NEW.id, 'ENG', 'English Language', 'Reading, grammar, composition, and oral literacy.', TRUE, 'Active'),
    (NEW.id, 'MAT', 'Mathematics', 'Number operations, geometry, measurement, and problem solving.', TRUE, 'Active'),
    (NEW.id, 'SCI', 'Integrated Science', 'Natural sciences, energy, living organisms, and environment.', TRUE, 'Active'),
    (NEW.id, 'OWOP', 'Our World Our People', 'Citizenship, culture, governance, and social values.', TRUE, 'Active'),
    (NEW.id, 'GHL', 'Ghanaian Language (Twi)', 'Ghanaian language literacy, culture, and oral expression.', TRUE, 'Active'),
    (NEW.id, 'RME', 'Religious & Moral Education', 'Moral development, character, and religious heritage.', TRUE, 'Active'),
    (NEW.id, 'CAD', 'Creative Arts & Design', 'Visual arts, performing arts, and creative expression.', FALSE, 'Active'),
    (NEW.id, 'ICT', 'Computing', 'Digital literacy, basic computing, and safe technology use.', FALSE, 'Active')
  ON CONFLICT (school_id, subject_code) DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_schools_bootstrap ON public.schools;
CREATE TRIGGER trg_schools_bootstrap
AFTER INSERT ON public.schools
FOR EACH ROW EXECUTE FUNCTION public.bootstrap_new_school();

CREATE OR REPLACE FUNCTION public.sync_student_enrollment()
RETURNS TRIGGER AS $$
DECLARE
  v_year_id UUID;
BEGIN
  IF NEW.current_class_id IS NOT NULL THEN
    SELECT id INTO v_year_id FROM public.academic_years
    WHERE school_id = NEW.school_id AND is_current = TRUE ORDER BY start_date DESC LIMIT 1;
    IF v_year_id IS NOT NULL THEN
      INSERT INTO public.student_enrollments (school_id, student_id, class_id, academic_year_id, enrolled_at, promotion_status)
      VALUES (NEW.school_id, NEW.id, NEW.current_class_id, v_year_id, COALESCE(NEW.admission_date, CURRENT_DATE), 'Active')
      ON CONFLICT (school_id, student_id, academic_year_id) DO UPDATE SET class_id = EXCLUDED.class_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_students_sync_enrollment ON public.students;
CREATE TRIGGER trg_students_sync_enrollment
AFTER INSERT OR UPDATE OF current_class_id ON public.students
FOR EACH ROW EXECUTE FUNCTION public.sync_student_enrollment();

-- Views & Transactional RPC
CREATE OR REPLACE VIEW public.v_student_term_summary AS
SELECT r.school_id, r.student_id, r.class_id, r.academic_year_id, r.term_id,
       COUNT(r.id) AS subjects_count, ROUND(AVG(r.total_score), 2) AS average_score, SUM(r.total_score) AS total_marks
FROM public.results r
GROUP BY r.school_id, r.student_id, r.class_id, r.academic_year_id, r.term_id;

CREATE OR REPLACE VIEW public.v_class_rankings AS
SELECT s.*,
       RANK() OVER (PARTITION BY s.school_id, s.class_id, s.academic_year_id, s.term_id ORDER BY s.average_score DESC) AS class_position,
       COUNT(*) OVER (PARTITION BY s.school_id, s.class_id, s.academic_year_id, s.term_id) AS class_size
FROM public.v_student_term_summary s;

CREATE OR REPLACE FUNCTION public.promote_students_bulk(
  p_school_id UUID, p_student_ids UUID[], p_target_class_id UUID, p_target_academic_year_id UUID
) RETURNS INTEGER AS $$
DECLARE
  v_sid UUID;
  v_count INTEGER := 0;
BEGIN
  FOREACH v_sid IN ARRAY p_student_ids LOOP
    UPDATE public.student_enrollments SET promotion_status = 'Promoted'
    WHERE school_id = p_school_id AND student_id = v_sid AND promotion_status = 'Active';
    INSERT INTO public.student_enrollments (school_id, student_id, class_id, academic_year_id, promotion_status)
    VALUES (p_school_id, v_sid, p_target_class_id, p_target_academic_year_id, 'Active')
    ON CONFLICT (school_id, student_id, academic_year_id)
    DO UPDATE SET class_id = EXCLUDED.class_id, promotion_status = 'Active';
    UPDATE public.students SET current_class_id = p_target_class_id WHERE id = v_sid AND school_id = p_school_id;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Security helper functions (defined before RPCs and RLS policies)
CREATE OR REPLACE FUNCTION public.is_super_admin() RETURNS BOOLEAN AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = TRUE AND is_active = TRUE);
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_school_member(p_school_id UUID) RETURNS BOOLEAN AS $$
  SELECT public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.school_memberships WHERE school_id = p_school_id AND user_id = auth.uid() AND is_active = TRUE
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_school_admin(p_school_id UUID) RETURNS BOOLEAN AS $$
  SELECT public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.school_memberships
    WHERE school_id = p_school_id AND user_id = auth.uid() AND role IN ('super_admin', 'school_admin') AND is_active = TRUE
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.teacher_can_access_class(p_school_id UUID, p_class_id UUID) RETURNS BOOLEAN AS $$
  SELECT public.is_school_admin(p_school_id) OR EXISTS (
    SELECT 1 FROM public.teachers t
    LEFT JOIN public.classes c ON c.class_teacher_id = t.id
    LEFT JOIN public.class_subjects cs ON cs.teacher_id = t.id
    WHERE t.school_id = p_school_id AND t.user_id = auth.uid() AND (c.id = p_class_id OR cs.class_id = p_class_id)
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.teacher_can_access_subject(p_school_id UUID, p_class_id UUID, p_subject_id UUID) RETURNS BOOLEAN AS $$
  SELECT public.is_school_admin(p_school_id) OR EXISTS (
    SELECT 1 FROM public.teachers t
    JOIN public.class_subjects cs ON cs.teacher_id = t.id
    WHERE t.school_id = p_school_id AND t.user_id = auth.uid() AND cs.class_id = p_class_id AND cs.subject_id = p_subject_id
  ) OR EXISTS (
    SELECT 1 FROM public.teachers t
    JOIN public.classes c ON c.class_teacher_id = t.id
    WHERE t.school_id = p_school_id AND t.user_id = auth.uid() AND c.id = p_class_id
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- User Provisioning RPCs:
--   * Super Admin can add Super Admins, School Administrators, and Teachers
--   * School Administrators can add and manage Teachers
CREATE OR REPLACE FUNCTION public.provision_school_user(
  p_school_id UUID,
  p_email TEXT,
  p_full_name TEXT,
  p_phone TEXT DEFAULT '',
  p_role TEXT DEFAULT 'teacher',
  p_teacher_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_user_id UUID;
  v_confirmed BOOLEAN := FALSE;
  v_clean_email TEXT := lower(btrim(p_email));
BEGIN
  IF NOT public.is_school_admin(p_school_id) THEN
    RAISE EXCEPTION 'Only Super Administrators or School Administrators can provision users.';
  END IF;

  IF p_role NOT IN ('super_admin', 'school_admin', 'teacher') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;

  IF p_role IN ('super_admin', 'school_admin') AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only a Super Administrator can create or assign School Administrator or Super Administrator accounts.';
  END IF;

  SELECT id, (email_confirmed_at IS NOT NULL)
  INTO v_user_id, v_confirmed
  FROM auth.users
  WHERE lower(email) = v_clean_email
  LIMIT 1;

  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Auth account for % was not found. Please provide a password to create a new login or create the user in Authentication first.', v_clean_email;
  END IF;

  IF NOT COALESCE(v_confirmed, FALSE) THEN
    BEGIN
      UPDATE auth.users
      SET email_confirmed_at = COALESCE(email_confirmed_at, NOW())
      WHERE id = v_user_id;
      v_confirmed := TRUE;
    EXCEPTION WHEN OTHERS THEN
      v_confirmed := FALSE;
    END;
  END IF;

  INSERT INTO public.profiles (id, email, full_name, phone, is_super_admin, is_active)
  VALUES (
    v_user_id,
    v_clean_email,
    COALESCE(NULLIF(btrim(p_full_name), ''), split_part(v_clean_email, '@', 1)),
    COALESCE(p_phone, ''),
    (p_role = 'super_admin'),
    TRUE
  )
  ON CONFLICT (id) DO UPDATE SET
    full_name = COALESCE(NULLIF(btrim(p_full_name), ''), public.profiles.full_name),
    phone = CASE WHEN COALESCE(btrim(p_phone), '') <> '' THEN p_phone ELSE public.profiles.phone END,
    is_super_admin = CASE WHEN p_role = 'super_admin' THEN TRUE ELSE public.profiles.is_super_admin END,
    is_active = TRUE;

  INSERT INTO public.school_memberships (school_id, user_id, role, is_active)
  VALUES (p_school_id, v_user_id, p_role, TRUE)
  ON CONFLICT (school_id, user_id) DO UPDATE SET
    role = EXCLUDED.role,
    is_active = TRUE;

  IF p_teacher_id IS NOT NULL THEN
    UPDATE public.teachers
    SET user_id = v_user_id
    WHERE id = p_teacher_id AND school_id = p_school_id;
  ELSIF p_role = 'teacher' THEN
    UPDATE public.teachers
    SET user_id = v_user_id
    WHERE school_id = p_school_id
      AND lower(email) = v_clean_email
      AND user_id IS NULL;
  END IF;

  RETURN jsonb_build_object(
    'user_id', v_user_id,
    'email_confirmed', v_confirmed
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.update_school_user_membership(
  p_membership_id UUID,
  p_role TEXT DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
  v_school_id UUID;
  v_user_id UUID;
  v_old_role TEXT;
  v_has_other_super BOOLEAN;
BEGIN
  SELECT school_id, user_id, role
  INTO v_school_id, v_user_id, v_old_role
  FROM public.school_memberships
  WHERE id = p_membership_id;

  IF v_school_id IS NULL THEN
    RAISE EXCEPTION 'Membership record not found.';
  END IF;

  IF NOT public.is_school_admin(v_school_id) THEN
    RAISE EXCEPTION 'Administrator access required.';
  END IF;

  IF (v_old_role IN ('super_admin', 'school_admin') OR p_role IN ('super_admin', 'school_admin'))
     AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'Only a Super Administrator can grant or modify School Administrator or Super Administrator privileges.';
  END IF;

  IF p_role IS NOT NULL AND p_role NOT IN ('super_admin', 'school_admin', 'teacher') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role;
  END IF;

  UPDATE public.school_memberships
  SET role = COALESCE(p_role, role),
      is_active = COALESCE(p_is_active, is_active),
      updated_at = NOW()
  WHERE id = p_membership_id;

  IF p_role = 'super_admin' THEN
    UPDATE public.profiles SET is_super_admin = TRUE WHERE id = v_user_id;
  ELSIF p_role IS NOT NULL AND v_old_role = 'super_admin' AND p_role <> 'super_admin' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.school_memberships
      WHERE user_id = v_user_id AND role = 'super_admin' AND is_active = TRUE
    ) INTO v_has_other_super;
    IF NOT COALESCE(v_has_other_super, FALSE) THEN
      UPDATE public.profiles SET is_super_admin = FALSE WHERE id = v_user_id;
    END IF;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 4. ROW LEVEL SECURITY (RLS) & MULTI-SCHOOL ISOLATION
-- ============================================================================

ALTER TABLE public.schools ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.guardians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_subjects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.student_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grading_scales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.report_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.school_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS schools_select ON public.schools;
CREATE POLICY schools_select ON public.schools FOR SELECT USING (public.is_school_member(id));
DROP POLICY IF EXISTS schools_insert ON public.schools;
CREATE POLICY schools_insert ON public.schools FOR INSERT WITH CHECK (public.is_super_admin());
DROP POLICY IF EXISTS schools_update ON public.schools;
CREATE POLICY schools_update ON public.schools FOR UPDATE USING (public.is_school_admin(id)) WITH CHECK (public.is_school_admin(id));
DROP POLICY IF EXISTS schools_delete ON public.schools;
CREATE POLICY schools_delete ON public.schools FOR DELETE USING (public.is_super_admin());

DROP POLICY IF EXISTS profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT USING (id = auth.uid() OR public.is_super_admin() OR EXISTS (
  SELECT 1 FROM public.school_memberships m1 JOIN public.school_memberships m2 ON m1.school_id = m2.school_id
  WHERE m1.user_id = auth.uid() AND m2.user_id = profiles.id AND m1.role IN ('school_admin', 'super_admin')
));
DROP POLICY IF EXISTS profiles_update_self ON public.profiles;
CREATE POLICY profiles_update_self ON public.profiles FOR UPDATE USING (id = auth.uid() OR public.is_super_admin())
  WITH CHECK (public.is_super_admin() OR (id = auth.uid() AND is_super_admin = (SELECT p.is_super_admin FROM public.profiles p WHERE p.id = auth.uid())));

DROP POLICY IF EXISTS memberships_select ON public.school_memberships;
CREATE POLICY memberships_select ON public.school_memberships FOR SELECT USING (user_id = auth.uid() OR public.is_school_admin(school_id));
DROP POLICY IF EXISTS memberships_insert ON public.school_memberships;
CREATE POLICY memberships_insert ON public.school_memberships FOR INSERT WITH CHECK (public.is_super_admin() OR (public.is_school_admin(school_id) AND role = 'teacher'));
DROP POLICY IF EXISTS memberships_update ON public.school_memberships;
CREATE POLICY memberships_update ON public.school_memberships FOR UPDATE USING (public.is_super_admin() OR (public.is_school_admin(school_id) AND role = 'teacher'))
  WITH CHECK (public.is_super_admin() OR (public.is_school_admin(school_id) AND role = 'teacher'));
DROP POLICY IF EXISTS memberships_delete ON public.school_memberships;
CREATE POLICY memberships_delete ON public.school_memberships FOR DELETE USING (public.is_super_admin() OR (public.is_school_admin(school_id) AND role = 'teacher'));

DROP POLICY IF EXISTS academic_years_select ON public.academic_years;
CREATE POLICY academic_years_select ON public.academic_years FOR SELECT USING (public.is_school_member(school_id));
DROP POLICY IF EXISTS academic_years_write ON public.academic_years;
CREATE POLICY academic_years_write ON public.academic_years FOR ALL USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));

DROP POLICY IF EXISTS terms_select ON public.terms;
CREATE POLICY terms_select ON public.terms FOR SELECT USING (public.is_school_member(school_id));
DROP POLICY IF EXISTS terms_write ON public.terms;
CREATE POLICY terms_write ON public.terms FOR ALL USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));

DROP POLICY IF EXISTS teachers_select ON public.teachers;
CREATE POLICY teachers_select ON public.teachers FOR SELECT USING (public.is_school_member(school_id));
DROP POLICY IF EXISTS teachers_write ON public.teachers;
CREATE POLICY teachers_write ON public.teachers FOR ALL USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));

DROP POLICY IF EXISTS classes_select ON public.classes;
CREATE POLICY classes_select ON public.classes FOR SELECT USING (public.is_school_member(school_id));
DROP POLICY IF EXISTS classes_insert ON public.classes;
CREATE POLICY classes_insert ON public.classes FOR INSERT WITH CHECK (public.is_school_member(school_id));
DROP POLICY IF EXISTS classes_update ON public.classes;
CREATE POLICY classes_update ON public.classes FOR UPDATE USING (public.is_school_member(school_id)) WITH CHECK (public.is_school_member(school_id));
DROP POLICY IF EXISTS classes_delete ON public.classes;
CREATE POLICY classes_delete ON public.classes FOR DELETE USING (public.is_school_admin(school_id));

DROP POLICY IF EXISTS subjects_select ON public.subjects;
CREATE POLICY subjects_select ON public.subjects FOR SELECT USING (public.is_school_member(school_id));
DROP POLICY IF EXISTS subjects_write ON public.subjects;
CREATE POLICY subjects_write ON public.subjects FOR ALL USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));

DROP POLICY IF EXISTS class_subjects_select ON public.class_subjects;
CREATE POLICY class_subjects_select ON public.class_subjects FOR SELECT USING (public.is_school_member(school_id));
DROP POLICY IF EXISTS class_subjects_insert ON public.class_subjects;
CREATE POLICY class_subjects_insert ON public.class_subjects FOR INSERT WITH CHECK (public.is_school_member(school_id));
DROP POLICY IF EXISTS class_subjects_update ON public.class_subjects;
CREATE POLICY class_subjects_update ON public.class_subjects FOR UPDATE USING (public.is_school_member(school_id)) WITH CHECK (public.is_school_member(school_id));
DROP POLICY IF EXISTS class_subjects_delete ON public.class_subjects;
CREATE POLICY class_subjects_delete ON public.class_subjects FOR DELETE USING (public.is_school_admin(school_id));

DROP POLICY IF EXISTS teacher_subjects_select ON public.teacher_subjects;
CREATE POLICY teacher_subjects_select ON public.teacher_subjects FOR SELECT USING (public.is_school_member(school_id));
DROP POLICY IF EXISTS teacher_subjects_write ON public.teacher_subjects;
CREATE POLICY teacher_subjects_write ON public.teacher_subjects FOR ALL USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));

DROP POLICY IF EXISTS guardians_select ON public.guardians;
CREATE POLICY guardians_select ON public.guardians FOR SELECT USING (public.is_school_member(school_id));
DROP POLICY IF EXISTS guardians_insert ON public.guardians;
CREATE POLICY guardians_insert ON public.guardians FOR INSERT WITH CHECK (public.is_school_member(school_id));
DROP POLICY IF EXISTS guardians_update ON public.guardians;
CREATE POLICY guardians_update ON public.guardians FOR UPDATE USING (public.is_school_member(school_id)) WITH CHECK (public.is_school_member(school_id));
DROP POLICY IF EXISTS guardians_delete ON public.guardians;
CREATE POLICY guardians_delete ON public.guardians FOR DELETE USING (public.is_school_admin(school_id));

DROP POLICY IF EXISTS students_select ON public.students;
CREATE POLICY students_select ON public.students FOR SELECT USING (public.is_school_member(school_id));
DROP POLICY IF EXISTS students_insert ON public.students;
CREATE POLICY students_insert ON public.students FOR INSERT WITH CHECK (public.is_school_member(school_id));
DROP POLICY IF EXISTS students_update ON public.students;
CREATE POLICY students_update ON public.students FOR UPDATE USING (public.is_school_member(school_id)) WITH CHECK (public.is_school_member(school_id));
DROP POLICY IF EXISTS students_delete ON public.students;
CREATE POLICY students_delete ON public.students FOR DELETE USING (public.is_school_admin(school_id));

DROP POLICY IF EXISTS enrollments_select ON public.student_enrollments;
CREATE POLICY enrollments_select ON public.student_enrollments FOR SELECT USING (public.is_school_member(school_id));
DROP POLICY IF EXISTS enrollments_insert ON public.student_enrollments;
CREATE POLICY enrollments_insert ON public.student_enrollments FOR INSERT WITH CHECK (public.is_school_member(school_id));
DROP POLICY IF EXISTS enrollments_update ON public.student_enrollments;
CREATE POLICY enrollments_update ON public.student_enrollments FOR UPDATE USING (public.is_school_member(school_id)) WITH CHECK (public.is_school_member(school_id));
DROP POLICY IF EXISTS enrollments_delete ON public.student_enrollments;
CREATE POLICY enrollments_delete ON public.student_enrollments FOR DELETE USING (public.is_school_admin(school_id));

DROP POLICY IF EXISTS assessments_select ON public.assessments;
CREATE POLICY assessments_select ON public.assessments FOR SELECT USING (public.is_school_member(school_id));
DROP POLICY IF EXISTS assessments_write ON public.assessments;
CREATE POLICY assessments_write ON public.assessments FOR ALL USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));

DROP POLICY IF EXISTS grading_scales_select ON public.grading_scales;
CREATE POLICY grading_scales_select ON public.grading_scales FOR SELECT USING (public.is_school_member(school_id));
DROP POLICY IF EXISTS grading_scales_write ON public.grading_scales;
CREATE POLICY grading_scales_write ON public.grading_scales FOR ALL USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));

DROP POLICY IF EXISTS school_settings_select ON public.school_settings;
CREATE POLICY school_settings_select ON public.school_settings FOR SELECT USING (public.is_school_member(school_id));
DROP POLICY IF EXISTS school_settings_write ON public.school_settings;
CREATE POLICY school_settings_write ON public.school_settings FOR ALL USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));

DROP POLICY IF EXISTS results_select ON public.results;
CREATE POLICY results_select ON public.results FOR SELECT USING (public.is_school_member(school_id));
DROP POLICY IF EXISTS results_insert ON public.results;
CREATE POLICY results_insert ON public.results FOR INSERT WITH CHECK (public.is_school_member(school_id));
DROP POLICY IF EXISTS results_update ON public.results;
CREATE POLICY results_update ON public.results FOR UPDATE USING (public.is_school_admin(school_id) OR (is_locked = FALSE AND public.is_school_member(school_id)))
  WITH CHECK (public.is_school_admin(school_id) OR (is_locked = FALSE AND public.is_school_member(school_id)));
DROP POLICY IF EXISTS results_delete ON public.results;
CREATE POLICY results_delete ON public.results FOR DELETE USING (public.is_school_admin(school_id));

DROP POLICY IF EXISTS attendance_select ON public.attendance;
CREATE POLICY attendance_select ON public.attendance FOR SELECT USING (public.is_school_member(school_id));
DROP POLICY IF EXISTS attendance_write ON public.attendance;
CREATE POLICY attendance_write ON public.attendance FOR ALL USING (public.is_school_member(school_id)) WITH CHECK (public.is_school_member(school_id));

DROP POLICY IF EXISTS report_comments_select ON public.report_comments;
CREATE POLICY report_comments_select ON public.report_comments FOR SELECT USING (public.is_school_member(school_id));
DROP POLICY IF EXISTS report_comments_write ON public.report_comments;
CREATE POLICY report_comments_write ON public.report_comments FOR ALL USING (public.is_school_member(school_id)) WITH CHECK (public.is_school_member(school_id));

DROP POLICY IF EXISTS notifications_select ON public.notifications;
CREATE POLICY notifications_select ON public.notifications FOR SELECT USING (user_id = auth.uid() OR public.is_school_admin(school_id));
DROP POLICY IF EXISTS notifications_write ON public.notifications;
CREATE POLICY notifications_write ON public.notifications FOR ALL USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));

DROP POLICY IF EXISTS audit_logs_select ON public.audit_logs;
CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT USING (public.is_school_admin(school_id));
DROP POLICY IF EXISTS audit_logs_insert ON public.audit_logs;
CREATE POLICY audit_logs_insert ON public.audit_logs FOR INSERT WITH CHECK (public.is_school_member(school_id));

-- ============================================================================
-- 5. SUPABASE STORAGE BUCKETS & POLICIES
-- ============================================================================

INSERT INTO storage.buckets (id, name, public)
VALUES
  ('school-logos', 'school-logos', true),
  ('student-photos', 'student-photos', true),
  ('teacher-photos', 'teacher-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read for school assets" ON storage.objects;
CREATE POLICY "Public read for school assets" ON storage.objects
  FOR SELECT USING (bucket_id IN ('school-logos', 'student-photos', 'teacher-photos'));

DROP POLICY IF EXISTS "Authenticated upload for school assets" ON storage.objects;
CREATE POLICY "Authenticated upload for school assets" ON storage.objects
  FOR INSERT WITH CHECK (auth.role() = 'authenticated' AND bucket_id IN ('school-logos', 'student-photos', 'teacher-photos'));

DROP POLICY IF EXISTS "Authenticated update for school assets" ON storage.objects;
CREATE POLICY "Authenticated update for school assets" ON storage.objects
  FOR UPDATE USING (auth.role() = 'authenticated' AND bucket_id IN ('school-logos', 'student-photos', 'teacher-photos'));

DROP POLICY IF EXISTS "Authenticated delete for school assets" ON storage.objects;
CREATE POLICY "Authenticated delete for school assets" ON storage.objects
  FOR DELETE USING (auth.role() = 'authenticated' AND bucket_id IN ('school-logos', 'student-photos', 'teacher-photos'));

-- ============================================================================
-- 6. INITIAL SCHOOL SEED (Optional: creates Accra Ridge Basic School)
-- ============================================================================

INSERT INTO public.schools (name, code, motto, address, region, district, phone, email)
VALUES (
  'Accra Ridge Basic School',
  'ARBS-001',
  'Knowledge, Character & Unity',
  '14 Independence Avenue, Ridge, Accra',
  'Greater Accra',
  'Accra Metropolitan',
  '+233 30 222 4890',
  'admin@accraridgebasic.edu.gh'
)
ON CONFLICT (code) DO NOTHING;

-- Ensure Super Admin accounts have password SMD10011 and confirmed emails (if present in auth.users)
UPDATE auth.users
SET encrypted_password = crypt('SMD10011', gen_salt('bf')),
    email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
    updated_at = NOW()
WHERE lower(email) IN (lower('dawum30@gmail.com'), lower('superadmin@akwaabasms.gh'));

-- Backfill any existing Supabase Auth users into public.profiles
INSERT INTO public.profiles (id, email, full_name)
SELECT
  id,
  email,
  COALESCE(raw_user_meta_data->>'full_name', split_part(email, '@', 1))
FROM auth.users
WHERE email IS NOT NULL
ON CONFLICT (id) DO NOTHING;

-- Promote Super Administrators and link to Accra Ridge Basic School
UPDATE public.profiles
SET is_super_admin = TRUE
WHERE lower(email) IN (lower('dawum30@gmail.com'), lower('superadmin@akwaabasms.gh'));

INSERT INTO public.school_memberships (school_id, user_id, role, is_active)
SELECT s.id, p.id, 'super_admin', TRUE
FROM public.schools s
JOIN public.profiles p ON lower(p.email) IN (lower('dawum30@gmail.com'), lower('superadmin@akwaabasms.gh'))
WHERE s.code = 'ARBS-001'
ON CONFLICT (school_id, user_id) DO UPDATE SET role = 'super_admin', is_active = TRUE;
