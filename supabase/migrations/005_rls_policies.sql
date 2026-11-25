-- ============================================================================
-- Migration 005: Row Level Security (RLS) & Strict Multi-School Isolation
-- ============================================================================

-- Helper security-definer functions for RLS
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND is_super_admin = TRUE AND is_active = TRUE
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_school_member(p_school_id UUID)
RETURNS BOOLEAN AS $$
  SELECT public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.school_memberships
    WHERE school_id = p_school_id AND user_id = auth.uid() AND is_active = TRUE
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_school_admin(p_school_id UUID)
RETURNS BOOLEAN AS $$
  SELECT public.is_super_admin() OR EXISTS (
    SELECT 1 FROM public.school_memberships
    WHERE school_id = p_school_id
      AND user_id = auth.uid()
      AND role IN ('super_admin', 'school_admin')
      AND is_active = TRUE
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.teacher_can_access_class(p_school_id UUID, p_class_id UUID)
RETURNS BOOLEAN AS $$
  SELECT public.is_school_admin(p_school_id) OR EXISTS (
    SELECT 1 FROM public.teachers t
    LEFT JOIN public.classes c ON c.class_teacher_id = t.id
    LEFT JOIN public.class_subjects cs ON cs.teacher_id = t.id
    WHERE t.school_id = p_school_id
      AND t.user_id = auth.uid()
      AND (c.id = p_class_id OR cs.class_id = p_class_id)
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.teacher_can_access_subject(p_school_id UUID, p_class_id UUID, p_subject_id UUID)
RETURNS BOOLEAN AS $$
  SELECT public.is_school_admin(p_school_id) OR EXISTS (
    SELECT 1 FROM public.teachers t
    JOIN public.class_subjects cs ON cs.teacher_id = t.id
    WHERE t.school_id = p_school_id
      AND t.user_id = auth.uid()
      AND cs.class_id = p_class_id
      AND cs.subject_id = p_subject_id
  ) OR EXISTS (
    SELECT 1 FROM public.teachers t
    JOIN public.classes c ON c.class_teacher_id = t.id
    WHERE t.school_id = p_school_id
      AND t.user_id = auth.uid()
      AND c.id = p_class_id
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Enable RLS on all 21 tables
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

-- Schools
CREATE POLICY schools_select ON public.schools FOR SELECT USING (public.is_school_member(id));
CREATE POLICY schools_insert ON public.schools FOR INSERT WITH CHECK (public.is_super_admin());
CREATE POLICY schools_update ON public.schools FOR UPDATE USING (public.is_school_admin(id)) WITH CHECK (public.is_school_admin(id));
CREATE POLICY schools_delete ON public.schools FOR DELETE USING (public.is_super_admin());

-- Profiles (Users cannot elevate their own is_super_admin flag)
CREATE POLICY profiles_select ON public.profiles FOR SELECT USING (id = auth.uid() OR public.is_super_admin() OR EXISTS (
  SELECT 1 FROM public.school_memberships m1
  JOIN public.school_memberships m2 ON m1.school_id = m2.school_id
  WHERE m1.user_id = auth.uid() AND m2.user_id = profiles.id AND m1.role IN ('school_admin', 'super_admin')
));
CREATE POLICY profiles_update_self ON public.profiles FOR UPDATE USING (id = auth.uid() OR public.is_super_admin())
  WITH CHECK (
    public.is_super_admin() OR (id = auth.uid() AND is_super_admin = (SELECT p.is_super_admin FROM public.profiles p WHERE p.id = auth.uid()))
  );

-- School Memberships (Prevent self-assignment of privileged roles)
CREATE POLICY memberships_select ON public.school_memberships FOR SELECT USING (user_id = auth.uid() OR public.is_school_admin(school_id));
CREATE POLICY memberships_insert ON public.school_memberships FOR INSERT WITH CHECK (
  public.is_super_admin() OR (public.is_school_admin(school_id) AND role IN ('school_admin', 'teacher'))
);
CREATE POLICY memberships_update ON public.school_memberships FOR UPDATE USING (public.is_school_admin(school_id))
  WITH CHECK (public.is_super_admin() OR (public.is_school_admin(school_id) AND role IN ('school_admin', 'teacher')));
CREATE POLICY memberships_delete ON public.school_memberships FOR DELETE USING (public.is_school_admin(school_id));

-- Macro-style explicit policies for school-owned config & core tables
CREATE POLICY academic_years_select ON public.academic_years FOR SELECT USING (public.is_school_member(school_id));
CREATE POLICY academic_years_write ON public.academic_years FOR ALL USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));

CREATE POLICY terms_select ON public.terms FOR SELECT USING (public.is_school_member(school_id));
CREATE POLICY terms_write ON public.terms FOR ALL USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));

CREATE POLICY teachers_select ON public.teachers FOR SELECT USING (public.is_school_member(school_id));
CREATE POLICY teachers_write ON public.teachers FOR ALL USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));

CREATE POLICY classes_select ON public.classes FOR SELECT USING (public.is_school_member(school_id));
CREATE POLICY classes_write ON public.classes FOR ALL USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));

CREATE POLICY subjects_select ON public.subjects FOR SELECT USING (public.is_school_member(school_id));
CREATE POLICY subjects_write ON public.subjects FOR ALL USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));

CREATE POLICY class_subjects_select ON public.class_subjects FOR SELECT USING (public.is_school_member(school_id));
CREATE POLICY class_subjects_write ON public.class_subjects FOR ALL USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));

CREATE POLICY teacher_subjects_select ON public.teacher_subjects FOR SELECT USING (public.is_school_member(school_id));
CREATE POLICY teacher_subjects_write ON public.teacher_subjects FOR ALL USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));

CREATE POLICY guardians_select ON public.guardians FOR SELECT USING (public.is_school_member(school_id));
CREATE POLICY guardians_write ON public.guardians FOR ALL USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));

-- Students & Enrollments (Teachers can view students in their assigned classes; Admins manage all)
CREATE POLICY students_select ON public.students FOR SELECT USING (
  public.is_school_admin(school_id) OR public.teacher_can_access_class(school_id, current_class_id)
);
CREATE POLICY students_write ON public.students FOR ALL USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));

CREATE POLICY enrollments_select ON public.student_enrollments FOR SELECT USING (
  public.is_school_admin(school_id) OR public.teacher_can_access_class(school_id, class_id)
);
CREATE POLICY enrollments_write ON public.student_enrollments FOR ALL USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));

-- Assessments, Grading Scales, School Settings
CREATE POLICY assessments_select ON public.assessments FOR SELECT USING (public.is_school_member(school_id));
CREATE POLICY assessments_write ON public.assessments FOR ALL USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));

CREATE POLICY grading_scales_select ON public.grading_scales FOR SELECT USING (public.is_school_member(school_id));
CREATE POLICY grading_scales_write ON public.grading_scales FOR ALL USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));

CREATE POLICY school_settings_select ON public.school_settings FOR SELECT USING (public.is_school_member(school_id));
CREATE POLICY school_settings_write ON public.school_settings FOR ALL USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));

-- Results (Teachers can view/insert/update unlocked results ONLY for assigned classes & subjects)
CREATE POLICY results_select ON public.results FOR SELECT USING (
  public.is_school_admin(school_id) OR public.teacher_can_access_subject(school_id, class_id, subject_id)
);
CREATE POLICY results_insert ON public.results FOR INSERT WITH CHECK (
  public.is_school_admin(school_id) OR public.teacher_can_access_subject(school_id, class_id, subject_id)
);
CREATE POLICY results_update ON public.results FOR UPDATE USING (
  public.is_school_admin(school_id) OR (is_locked = FALSE AND public.teacher_can_access_subject(school_id, class_id, subject_id))
) WITH CHECK (
  public.is_school_admin(school_id) OR (is_locked = FALSE AND public.teacher_can_access_subject(school_id, class_id, subject_id))
);
CREATE POLICY results_delete ON public.results FOR DELETE USING (public.is_school_admin(school_id));

-- Attendance (Teachers can view & record attendance for assigned classes)
CREATE POLICY attendance_select ON public.attendance FOR SELECT USING (
  public.is_school_admin(school_id) OR public.teacher_can_access_class(school_id, class_id)
);
CREATE POLICY attendance_write ON public.attendance FOR ALL USING (
  public.is_school_admin(school_id) OR public.teacher_can_access_class(school_id, class_id)
) WITH CHECK (
  public.is_school_admin(school_id) OR public.teacher_can_access_class(school_id, class_id)
);

-- Report Comments
CREATE POLICY report_comments_select ON public.report_comments FOR SELECT USING (
  public.is_school_admin(school_id) OR public.teacher_can_access_class(school_id, class_id)
);
CREATE POLICY report_comments_write ON public.report_comments FOR ALL USING (
  public.is_school_admin(school_id) OR public.teacher_can_access_class(school_id, class_id)
) WITH CHECK (
  public.is_school_admin(school_id) OR public.teacher_can_access_class(school_id, class_id)
);

-- Notifications & Audit Logs
CREATE POLICY notifications_select ON public.notifications FOR SELECT USING (
  user_id = auth.uid() OR public.is_school_admin(school_id)
);
CREATE POLICY notifications_write ON public.notifications FOR ALL USING (public.is_school_admin(school_id)) WITH CHECK (public.is_school_admin(school_id));

CREATE POLICY audit_logs_select ON public.audit_logs FOR SELECT USING (public.is_school_admin(school_id));
CREATE POLICY audit_logs_insert ON public.audit_logs FOR INSERT WITH CHECK (public.is_school_member(school_id));
