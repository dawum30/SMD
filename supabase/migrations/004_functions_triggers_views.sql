-- ============================================================================
-- Migration 004: Functions, Triggers, Views & Transactional RPCs
-- ============================================================================

-- 1. Automatic updated_at trigger function
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

-- 2. Auto-generate Student Code if omitted (e.g. STU-2025-0001)
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

    SELECT COALESCE(COUNT(*), 0) + 1 INTO v_seq
    FROM public.students WHERE school_id = NEW.school_id;

    NEW.student_code := v_prefix || '-' || v_year || '-' || lpad(v_seq::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_students_auto_code ON public.students;
CREATE TRIGGER trg_students_auto_code
BEFORE INSERT ON public.students
FOR EACH ROW EXECUTE FUNCTION public.generate_student_code();

-- 3. Auto-generate Teacher Code if omitted (e.g. TCH-0001)
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

    SELECT COALESCE(COUNT(*), 0) + 1 INTO v_seq
    FROM public.teachers WHERE school_id = NEW.school_id;

    NEW.teacher_code := v_prefix || '-' || lpad(v_seq::TEXT, 4, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_teachers_auto_code ON public.teachers;
CREATE TRIGGER trg_teachers_auto_code
BEFORE INSERT ON public.teachers
FOR EACH ROW EXECUTE FUNCTION public.generate_teacher_code();

-- 4. Validate Assessment Maximums & Auto-Calculate Result Total, Grade, Remarks
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

  IF NEW.class_exercise > v_ce_max THEN
    RAISE EXCEPTION 'Class exercise score (%) exceeds maximum permitted (%)', NEW.class_exercise, v_ce_max;
  END IF;
  IF NEW.homework > v_hw_max THEN
    RAISE EXCEPTION 'Homework score (%) exceeds maximum permitted (%)', NEW.homework, v_hw_max;
  END IF;
  IF NEW.project > v_proj_max THEN
    RAISE EXCEPTION 'Project score (%) exceeds maximum permitted (%)', NEW.project, v_proj_max;
  END IF;
  IF NEW.exam > v_exam_max THEN
    RAISE EXCEPTION 'Exam score (%) exceeds maximum permitted (%)', NEW.exam, v_exam_max;
  END IF;

  NEW.total_score := ROUND(NEW.class_exercise + NEW.homework + NEW.project + NEW.exam, 2);

  SELECT grade, remark INTO v_grade, v_remark
  FROM public.grading_scales
  WHERE school_id = NEW.school_id
    AND NEW.total_score >= min_score
    AND NEW.total_score <= max_score
  ORDER BY min_score DESC
  LIMIT 1;

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

-- 5. Prevent Unauthorized Modification of Locked Results
CREATE OR REPLACE FUNCTION public.prevent_locked_result_modification()
RETURNS TRIGGER AS $$
DECLARE
  v_is_admin BOOLEAN;
BEGIN
  IF OLD.is_locked = TRUE THEN
    SELECT EXISTS (
      SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_super_admin = TRUE
    ) OR EXISTS (
      SELECT 1 FROM public.school_memberships
      WHERE user_id = auth.uid() AND school_id = OLD.school_id AND role IN ('super_admin', 'school_admin') AND is_active = TRUE
    ) INTO v_is_admin;

    IF NOT COALESCE(v_is_admin, FALSE) THEN
      RAISE EXCEPTION 'This result is locked and cannot be modified by a non-administrator.';
    END IF;

    -- Even admins must explicitly unlock before editing scores
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

-- 6. Handle new Supabase Auth User -> create Profile automatically
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- 7. Database Views for Analytics & Rankings
CREATE OR REPLACE VIEW public.v_student_term_summary AS
SELECT
  r.school_id,
  r.student_id,
  r.class_id,
  r.academic_year_id,
  r.term_id,
  COUNT(r.id) AS subjects_count,
  ROUND(AVG(r.total_score), 2) AS average_score,
  SUM(r.total_score) AS total_marks
FROM public.results r
GROUP BY r.school_id, r.student_id, r.class_id, r.academic_year_id, r.term_id;

CREATE OR REPLACE VIEW public.v_class_rankings AS
SELECT
  s.*,
  RANK() OVER (
    PARTITION BY s.school_id, s.class_id, s.academic_year_id, s.term_id
    ORDER BY s.average_score DESC
  ) AS class_position,
  COUNT(*) OVER (
    PARTITION BY s.school_id, s.class_id, s.academic_year_id, s.term_id
  ) AS class_size
FROM public.v_student_term_summary s;

CREATE OR REPLACE VIEW public.v_subject_performance AS
SELECT
  r.school_id,
  r.academic_year_id,
  r.term_id,
  r.class_id,
  r.subject_id,
  sub.name AS subject_name,
  sub.subject_code,
  COUNT(r.id) AS student_count,
  ROUND(AVG(r.total_score), 2) AS average_score,
  MAX(r.total_score) AS highest_score,
  MIN(r.total_score) AS lowest_score
FROM public.results r
JOIN public.subjects sub ON sub.id = r.subject_id
GROUP BY r.school_id, r.academic_year_id, r.term_id, r.class_id, r.subject_id, sub.name, sub.subject_code;

CREATE OR REPLACE VIEW public.v_attendance_summary AS
SELECT
  a.school_id,
  a.student_id,
  a.class_id,
  a.academic_year_id,
  a.term_id,
  COUNT(*) AS total_days,
  COUNT(*) FILTER (WHERE a.status = 'Present') AS present_days,
  COUNT(*) FILTER (WHERE a.status = 'Absent') AS absent_days,
  ROUND(
    (COUNT(*) FILTER (WHERE a.status = 'Present')::NUMERIC / NULLIF(COUNT(*), 0)) * 100,
    1
  ) AS attendance_percentage
FROM public.attendance a
GROUP BY a.school_id, a.student_id, a.class_id, a.academic_year_id, a.term_id;

-- 8. Transactional RPC: Bulk Student Promotion (preserves historical enrollments)
CREATE OR REPLACE FUNCTION public.promote_students_bulk(
  p_school_id UUID,
  p_student_ids UUID[],
  p_target_class_id UUID,
  p_target_academic_year_id UUID
)
RETURNS INTEGER AS $$
DECLARE
  v_sid UUID;
  v_count INTEGER := 0;
BEGIN
  FOREACH v_sid IN ARRAY p_student_ids LOOP
    UPDATE public.student_enrollments
    SET promotion_status = 'Promoted'
    WHERE school_id = p_school_id AND student_id = v_sid AND promotion_status = 'Active';

    INSERT INTO public.student_enrollments (school_id, student_id, class_id, academic_year_id, promotion_status)
    VALUES (p_school_id, v_sid, p_target_class_id, p_target_academic_year_id, 'Active')
    ON CONFLICT (school_id, student_id, academic_year_id)
    DO UPDATE SET class_id = EXCLUDED.class_id, promotion_status = 'Active';

    UPDATE public.students
    SET current_class_id = p_target_class_id
    WHERE id = v_sid AND school_id = p_school_id;

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Auto-bootstrap defaults whenever a new school is created
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

-- 10. Auto-sync Student Enrollment when a student is added or assigned to a class
CREATE OR REPLACE FUNCTION public.sync_student_enrollment()
RETURNS TRIGGER AS $$
DECLARE
  v_year_id UUID;
BEGIN
  IF NEW.current_class_id IS NOT NULL THEN
    SELECT id INTO v_year_id
    FROM public.academic_years
    WHERE school_id = NEW.school_id AND is_current = TRUE
    ORDER BY start_date DESC LIMIT 1;

    IF v_year_id IS NOT NULL THEN
      INSERT INTO public.student_enrollments (school_id, student_id, class_id, academic_year_id, enrolled_at, promotion_status)
      VALUES (NEW.school_id, NEW.id, NEW.current_class_id, v_year_id, COALESCE(NEW.admission_date, CURRENT_DATE), 'Active')
      ON CONFLICT (school_id, student_id, academic_year_id)
      DO UPDATE SET class_id = EXCLUDED.class_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_students_sync_enrollment ON public.students;
CREATE TRIGGER trg_students_sync_enrollment
AFTER INSERT OR UPDATE OF current_class_id ON public.students
FOR EACH ROW EXECUTE FUNCTION public.sync_student_enrollment();

