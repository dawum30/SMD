-- ============================================================================
-- Migration 002: Academic Relationships, Assessment & Performance Tables
-- ============================================================================

-- 11. Class Subjects (Assigns subjects to specific classes + optional subject teacher)
CREATE TABLE IF NOT EXISTS public.class_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  class_id UUID NOT NULL REFERENCES public.classes(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  teacher_id UUID REFERENCES public.teachers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, class_id, subject_id) -- Prevent duplicate subject assignment per class
);

CREATE INDEX IF NOT EXISTS idx_class_subjects_school ON public.class_subjects(school_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_class ON public.class_subjects(class_id);
CREATE INDEX IF NOT EXISTS idx_class_subjects_teacher ON public.class_subjects(teacher_id);

-- 12. Teacher Subjects (Normalized many-to-many teacher <-> subject qualifications/assignments)
CREATE TABLE IF NOT EXISTS public.teacher_subjects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  teacher_id UUID NOT NULL REFERENCES public.teachers(id) ON DELETE CASCADE,
  subject_id UUID NOT NULL REFERENCES public.subjects(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (school_id, teacher_id, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_teacher_subjects_school ON public.teacher_subjects(school_id);
CREATE INDEX IF NOT EXISTS idx_teacher_subjects_teacher ON public.teacher_subjects(teacher_id);

-- 13. Student Enrollments (Preserves full class & academic history across promotions)
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
CREATE INDEX IF NOT EXISTS idx_enrollments_student ON public.student_enrollments(student_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_class ON public.student_enrollments(class_id);

-- 14. Assessments (Configurable school assessment structure; default 10/10/10/70)
CREATE TABLE IF NOT EXISTS public.assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id UUID NOT NULL REFERENCES public.schools(id) ON DELETE CASCADE,
  academic_year_id UUID REFERENCES public.academic_years(id) ON DELETE CASCADE,
  name TEXT NOT NULL, -- e.g. 'Default GES SBA + Exam'
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

-- 15. Grading Scales (Configurable per school; default 80-100 A .. 0-39 F)
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

-- 16. Results (Individual student subject scores per term)
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
CREATE INDEX IF NOT EXISTS idx_results_student ON public.results(student_id, academic_year_id, term_id);

-- 17. Attendance
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
CREATE INDEX IF NOT EXISTS idx_attendance_student_term ON public.attendance(student_id, academic_year_id, term_id);

-- 18. Report Comments (Termly Teacher & Headteacher Remarks per Student)
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

CREATE INDEX IF NOT EXISTS idx_report_comments_lookup ON public.report_comments(school_id, academic_year_id, term_id, class_id);
