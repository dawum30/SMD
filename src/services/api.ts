import { createEphemeralSupabaseClient, getSupabaseClient, isSupabaseConfigured } from '../lib/supabase';
import {
  AcademicYear,
  AssessmentConfig,
  AttendanceRecord,
  AuthSession,
  ClassSubjectAssignment,
  DashboardAnalytics,
  GradingScaleItem,
  ReportComment,
  ResultRecord,
  School,
  SchoolClass,
  SchoolMembership,
  SchoolSettings,
  Student,
  StudentEnrollment,
  StudentReportCardData,
  Subject,
  Teacher,
  Term,
  UserRole,
} from '../types/database';
import { calculateGradeAndRemark } from '../utils/grading';

const TOKEN_STORAGE_KEY = 'akwaaba_session_token';
const SCHOOL_STORAGE_KEY = 'akwaaba_active_school_id';

export function getStoredToken(): string {
  return typeof window !== 'undefined' ? window.localStorage.getItem(TOKEN_STORAGE_KEY) || '' : '';
}

export function setStoredToken(token: string): void {
  if (typeof window !== 'undefined') {
    if (token) window.localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else window.localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

export function getStoredSchoolId(): string {
  return typeof window !== 'undefined' ? window.localStorage.getItem(SCHOOL_STORAGE_KEY) || '' : '';
}

export function setStoredSchoolId(id: string): void {
  if (typeof window !== 'undefined') {
    if (id) window.localStorage.setItem(SCHOOL_STORAGE_KEY, id);
    else window.localStorage.removeItem(SCHOOL_STORAGE_KEY);
  }
}

async function localFetch<T>(url: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const schoolId = getStoredSchoolId();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (schoolId) headers['x-school-id'] = schoolId;

  const res = await fetch(url, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed with status ${res.status}`);
  }
  return data as T;
}

// Helper to convert File to DataURL
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Helper to load active school ID cleanly
function requireActiveSchoolId(): string {
  const id = getStoredSchoolId();
  if (!id) throw new Error('No active school selected.');
  return id;
}

export const api = {
  // ==================== AUTH ====================
  async login(email: string, password: string): Promise<AuthSession> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { data, error } = await sb.auth.signInWithPassword({ email: email.trim(), password });
      if (error || !data.user || !data.session) {
        throw new Error(error?.message || 'Invalid credentials');
      }
      setStoredToken(data.session.access_token);
      return this.getSession();
    }
    const session = await localFetch<AuthSession>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setStoredToken(session.token);
    setStoredSchoolId(session.activeSchoolId);
    return session;
  },

  async getSession(): Promise<AuthSession> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { data: authData, error: authErr } = await sb.auth.getSession();
      if (authErr || !authData.session) throw new Error('Session expired');

      const userId = authData.session.user.id;
      const { data: profile, error: profErr } = await sb
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (profErr || !profile) throw new Error('User profile not found.');

      const { data: memberships } = await sb
        .from('school_memberships')
        .select('*')
        .eq('user_id', userId)
        .eq('is_active', true);

      const { data: schools } = profile.is_super_admin
        ? await sb.from('schools').select('*').order('name')
        : await sb
            .from('schools')
            .select('*')
            .in('id', (memberships || []).map((m) => m.school_id))
            .order('name');

      const schoolList = (schools || []) as School[];
      const storedSchool = getStoredSchoolId();
      const activeSchoolId =
        schoolList.find((s) => s.id === storedSchool)?.id || schoolList[0]?.id || '';
      setStoredSchoolId(activeSchoolId);

      const activeRole: UserRole = profile.is_super_admin
        ? 'super_admin'
        : ((memberships || []).find((m) => m.school_id === activeSchoolId)?.role as UserRole) || 'teacher';

      const { data: teacherRow } = activeSchoolId
        ? await sb.from('teachers').select('id').eq('school_id', activeSchoolId).eq('user_id', userId).maybeSingle()
        : { data: null };

      return {
        user: profile,
        token: authData.session.access_token,
        activeSchoolId,
        activeRole,
        memberships: (memberships || []) as SchoolMembership[],
        schools: schoolList,
        teacherRecordId: teacherRow?.id || null,
      };
    }
    return localFetch<AuthSession>('/api/auth/session');
  },

  async logout(): Promise<void> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient();
      if (sb) await sb.auth.signOut();
    }
    setStoredToken('');
  },

  async resetPassword(email: string, newPassword?: string): Promise<{ message: string }> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/`,
      });
      if (error) throw new Error(error.message);
      return { message: 'Password reset link has been sent to your email address via Supabase Auth.' };
    }
    return localFetch<{ message: string }>('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email, newPassword }),
    });
  },

  // ==================== STORAGE / FILE UPLOAD ====================
  async uploadImage(file: File, folder: 'student-photos' | 'teacher-photos' | 'school-logos'): Promise<string> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const ext = file.name.split('.').pop() || 'png';
      const filePath = `${requireActiveSchoolId()}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await sb.storage.from(folder).upload(filePath, file, { upsert: true });
      if (error) throw new Error(error.message);
      const { data } = sb.storage.from(folder).getPublicUrl(filePath);
      return data.publicUrl;
    }
    const dataUrl = await fileToDataUrl(file);
    const res = await localFetch<{ url: string }>('/api/upload', {
      method: 'POST',
      body: JSON.stringify({ dataUrl, folder, filename: file.name }),
    });
    return res.url;
  },

  // ==================== SCHOOLS ====================
  async getSchools(): Promise<School[]> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { data, error } = await sb.from('schools').select('*').order('name');
      if (error) throw new Error(error.message);
      return (data || []) as School[];
    }
    return localFetch<School[]>('/api/schools');
  },

  async createSchool(payload: Partial<School>): Promise<School> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { data, error } = await sb.from('schools').insert(payload).select().single();
      if (error) throw new Error(error.message);
      return data as School;
    }
    return localFetch<School>('/api/schools', { method: 'POST', body: JSON.stringify(payload) });
  },

  // ==================== DASHBOARD ====================
  async getDashboard(filters: { academicYearId?: string; termId?: string; classId?: string }): Promise<DashboardAnalytics> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const schoolId = requireActiveSchoolId();

      let stuQuery = sb.from('students').select('id, gender, current_class_id').eq('school_id', schoolId);
      if (filters.classId) stuQuery = stuQuery.eq('current_class_id', filters.classId);
      const { data: students } = await stuQuery;

      const [{ count: totalTeachers }, { count: totalSubjects }, { count: totalClasses }] = await Promise.all([
        sb.from('teachers').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('employment_status', 'Active'),
        sb.from('subjects').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('status', 'Active'),
        sb.from('classes').select('id', { count: 'exact', head: true }).eq('school_id', schoolId).eq('is_active', true),
      ]);

      let resQuery = sb
        .from('results')
        .select('student_id, subject_id, term_id, total_score, grade, subjects(name, subject_code), students(first_name, surname, student_code), classes(name)')
        .eq('school_id', schoolId);
      if (filters.academicYearId) resQuery = resQuery.eq('academic_year_id', filters.academicYearId);
      if (filters.termId) resQuery = resQuery.eq('term_id', filters.termId);
      if (filters.classId) resQuery = resQuery.eq('class_id', filters.classId);
      const { data: results } = await resQuery;

      const { data: terms } = await sb
        .from('terms')
        .select('id, name, term_number')
        .eq('school_id', schoolId)
        .order('term_number');

      const { data: scales } = await sb
        .from('grading_scales')
        .select('grade, remark, sort_order')
        .eq('school_id', schoolId)
        .order('sort_order');

      const stuList = students || [];
      const maleStudents = stuList.filter((s) => s.gender === 'Male').length;
      const femaleStudents = stuList.filter((s) => s.gender === 'Female').length;

      const subMap = new Map<string, { subject: string; code: string; sum: number; count: number }>();
      const stuAvgMap = new Map<string, { name: string; studentCode: string; className: string; sum: number; count: number }>();
      const gradeCountMap = new Map<string, number>();

      for (const r of (results || []) as Record<string, any>[]) {
        const subName = r.subjects?.name || 'Subject';
        const subCode = r.subjects?.subject_code || 'SUB';
        const curSub = subMap.get(r.subject_id) || { subject: subName, code: subCode, sum: 0, count: 0 };
        curSub.sum += Number(r.total_score);
        curSub.count += 1;
        subMap.set(r.subject_id, curSub);

        const stuName = `${r.students?.first_name || ''} ${r.students?.surname || ''}`.trim();
        const curStu = stuAvgMap.get(r.student_id) || {
          name: stuName,
          studentCode: r.students?.student_code || '',
          className: r.classes?.name || '-',
          sum: 0,
          count: 0,
        };
        curStu.sum += Number(r.total_score);
        curStu.count += 1;
        stuAvgMap.set(r.student_id, curStu);

        gradeCountMap.set(r.grade, (gradeCountMap.get(r.grade) || 0) + 1);
      }

      const subjectPerformance = Array.from(subMap.values())
        .map((s) => ({ subject: s.subject, code: s.code, average: Math.round((s.sum / s.count) * 10) / 10, entries: s.count }))
        .sort((a, b) => b.average - a.average);

      const studentRankings = Array.from(stuAvgMap.values())
        .map((s) => ({ name: s.name, studentCode: s.studentCode, className: s.className, average: Math.round((s.sum / s.count) * 10) / 10 }))
        .sort((a, b) => b.average - a.average);

      // Term comparison across selected year
      let termResQuery = sb.from('results').select('term_id, total_score').eq('school_id', schoolId);
      if (filters.academicYearId) termResQuery = termResQuery.eq('academic_year_id', filters.academicYearId);
      if (filters.classId) termResQuery = termResQuery.eq('class_id', filters.classId);
      const { data: termRes } = await termResQuery;

      const termComparison = (terms || []).map((t) => {
        const rows = (termRes || []).filter((r) => r.term_id === t.id);
        const avg = rows.length ? Math.round((rows.reduce((a, b) => a + Number(b.total_score), 0) / rows.length) * 10) / 10 : 0;
        return { term: t.name, average: avg, entries: rows.length };
      });

      const allScores = (results || []).map((r: Record<string, any>) => Number(r.total_score));
      const overallAverage = allScores.length ? Math.round((allScores.reduce((a, b) => a + b, 0) / allScores.length) * 10) / 10 : 0;

      return {
        summary: {
          totalStudents: stuList.length,
          maleStudents,
          femaleStudents,
          totalTeachers: totalTeachers || 0,
          totalSubjects: totalSubjects || 0,
          totalClasses: totalClasses || 0,
        },
        genderDistribution: [
          { name: 'Male', value: maleStudents, fill: '#064e3b' },
          { name: 'Female', value: femaleStudents, fill: '#d97706' },
        ],
        subjectPerformance,
        termComparison,
        gradeDistribution: (scales || []).map((s) => ({
          grade: s.grade,
          remark: s.remark,
          count: gradeCountMap.get(s.grade) || 0,
        })),
        highlights: {
          highestStudent: studentRankings[0] || null,
          lowestStudent: studentRankings.length ? studentRankings[studentRankings.length - 1] : null,
          highestSubject: subjectPerformance[0]
            ? { name: subjectPerformance[0].subject, code: subjectPerformance[0].code, average: subjectPerformance[0].average }
            : null,
          lowestSubject: subjectPerformance.length
            ? {
                name: subjectPerformance[subjectPerformance.length - 1].subject,
                code: subjectPerformance[subjectPerformance.length - 1].code,
                average: subjectPerformance[subjectPerformance.length - 1].average,
              }
            : null,
          overallAverage,
        },
      };
    }

    const params = new URLSearchParams();
    if (filters.academicYearId) params.set('academicYearId', filters.academicYearId);
    if (filters.termId) params.set('termId', filters.termId);
    if (filters.classId) params.set('classId', filters.classId);
    return localFetch<DashboardAnalytics>(`/api/dashboard?${params.toString()}`);
  },

  // ==================== ACADEMIC YEARS & TERMS ====================
  async getAcademicYearsAndTerms(): Promise<{ academicYears: AcademicYear[]; terms: Term[] }> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const schoolId = requireActiveSchoolId();
      const [{ data: academicYears }, { data: terms }] = await Promise.all([
        sb.from('academic_years').select('*').eq('school_id', schoolId).order('start_date', { ascending: false }),
        sb.from('terms').select('*').eq('school_id', schoolId).order('term_number', { ascending: true }),
      ]);
      return { academicYears: (academicYears || []) as AcademicYear[], terms: (terms || []) as Term[] };
    }
    return localFetch<{ academicYears: AcademicYear[]; terms: Term[] }>('/api/academic-years');
  },

  async createAcademicYear(payload: { name: string; start_date: string; end_date: string; is_current: boolean }): Promise<void> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const schoolId = requireActiveSchoolId();
      if (payload.is_current) {
        await sb.from('academic_years').update({ is_current: false }).eq('school_id', schoolId);
      }
      const { data: ay, error } = await sb
        .from('academic_years')
        .insert({ ...payload, school_id: schoolId })
        .select()
        .single();
      if (error) throw new Error(error.message);
      await sb.from('terms').insert([1, 2, 3].map((n) => ({
        school_id: schoolId,
        academic_year_id: ay.id,
        name: `Term ${n}`,
        term_number: n,
        start_date: payload.start_date,
        end_date: payload.end_date,
        is_current: payload.is_current && n === 1,
      })));
      return;
    }
    await localFetch('/api/academic-years', { method: 'POST', body: JSON.stringify(payload) });
  },

  async activateAcademicYear(id: string): Promise<void> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const schoolId = requireActiveSchoolId();
      await sb.from('academic_years').update({ is_current: false }).eq('school_id', schoolId);
      await sb.from('academic_years').update({ is_current: true }).eq('id', id).eq('school_id', schoolId);
      return;
    }
    await localFetch(`/api/academic-years/${id}/activate`, { method: 'PUT' });
  },

  async updateTerm(id: string, payload: Partial<Term>): Promise<void> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const schoolId = requireActiveSchoolId();
      if (payload.is_current) {
        await sb.from('terms').update({ is_current: false }).eq('school_id', schoolId);
      }
      const { error } = await sb.from('terms').update(payload).eq('id', id).eq('school_id', schoolId);
      if (error) throw new Error(error.message);
      return;
    }
    await localFetch(`/api/terms/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  },

  // ==================== STUDENTS ====================
  async getStudents(): Promise<Student[]> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const schoolId = requireActiveSchoolId();
      const { data, error } = await sb
        .from('students')
        .select('*, classes(name), guardians(full_name, phone, address, relationship)')
        .eq('school_id', schoolId)
        .order('surname');
      if (error) throw new Error(error.message);
      return (data || []).map((row: Record<string, any>) => ({
        ...row,
        class_name: row.classes?.name || '',
        guardian_name: row.guardians?.full_name || '',
        guardian_phone: row.guardians?.phone || '',
        guardian_address: row.guardians?.address || '',
        guardian_relationship: row.guardians?.relationship || 'Parent',
      })) as Student[];
    }
    return localFetch<Student[]>('/api/students');
  },

  async getStudentProfile(id: string): Promise<{
    student: Student;
    enrollments: StudentEnrollment[];
    results: (ResultRecord & { academic_year_name: string })[];
    overallAverage: number;
    classPosition: number;
    classSize: number;
  }> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const schoolId = requireActiveSchoolId();
      const { data: student, error } = await sb
        .from('students')
        .select('*, classes(name), guardians(full_name, phone, address, relationship)')
        .eq('id', id)
        .eq('school_id', schoolId)
        .single();
      if (error || !student) throw new Error('Student not found');

      const [{ data: enrollments }, { data: results }, { data: rankings }] = await Promise.all([
        sb.from('student_enrollments').select('*, classes(name), academic_years(name)').eq('student_id', id).eq('school_id', schoolId),
        sb
          .from('results')
          .select('*, subjects(name, subject_code), terms(name), academic_years(name), classes(name)')
          .eq('student_id', id)
          .eq('school_id', schoolId),
        sb.from('v_class_rankings').select('*').eq('student_id', id),
      ]);

      const latestRank = (rankings || [])[0] as { average_score?: number; class_position?: number; class_size?: number } | undefined;

      return {
        student: {
          ...student,
          class_name: (student as any).classes?.name || '',
          guardian_name: (student as any).guardians?.full_name || '',
          guardian_phone: (student as any).guardians?.phone || '',
          guardian_address: (student as any).guardians?.address || '',
          guardian_relationship: (student as any).guardians?.relationship || 'Parent',
        } as Student,
        enrollments: (enrollments || []).map((e: Record<string, any>) => ({
          ...e,
          class_name: e.classes?.name || '',
          academic_year_name: e.academic_years?.name || '',
        })) as StudentEnrollment[],
        results: (results || []).map((r: Record<string, any>) => ({
          ...r,
          subject_name: r.subjects?.name || '',
          subject_code: r.subjects?.subject_code || '',
          term_name: r.terms?.name || '',
          academic_year_name: r.academic_years?.name || '',
          class_name: r.classes?.name || '',
        })) as (ResultRecord & { academic_year_name: string })[],
        overallAverage: latestRank?.average_score || 0,
        classPosition: latestRank?.class_position || 0,
        classSize: latestRank?.class_size || 0,
      };
    }
    return localFetch(`/api/students/${id}/profile`);
  },

  async createStudent(payload: Record<string, unknown>): Promise<Student> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const schoolId = requireActiveSchoolId();
      const { data: guardian, error: gErr } = await sb
        .from('guardians')
        .insert({
          school_id: schoolId,
          full_name: payload.guardian_name,
          phone: payload.guardian_phone,
          address: payload.guardian_address || '',
          relationship: payload.guardian_relationship || 'Parent',
        })
        .select()
        .single();
      if (gErr) throw new Error(gErr.message);

      const { data: student, error: sErr } = await sb
        .from('students')
        .insert({
          school_id: schoolId,
          student_code: '',
          first_name: payload.first_name,
          middle_name: payload.middle_name || '',
          surname: payload.surname,
          gender: payload.gender,
          date_of_birth: payload.date_of_birth,
          admission_date: payload.admission_date || new Date().toISOString().slice(0, 10),
          current_class_id: payload.current_class_id,
          guardian_id: guardian.id,
          photo_url: payload.photo_url || '',
          status: payload.status || 'Active',
        })
        .select()
        .single();
      if (sErr) throw new Error(sErr.message);
      return student as Student;
    }
    return localFetch<Student>('/api/students', { method: 'POST', body: JSON.stringify(payload) });
  },

  async updateStudent(id: string, payload: Record<string, unknown>): Promise<void> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const schoolId = requireActiveSchoolId();

      const { data: existingStu } = await sb
        .from('students')
        .select('guardian_id')
        .eq('id', id)
        .eq('school_id', schoolId)
        .maybeSingle();

      if (existingStu?.guardian_id && (payload.guardian_name || payload.guardian_phone || payload.guardian_address !== undefined)) {
        await sb
          .from('guardians')
          .update({
            ...(payload.guardian_name ? { full_name: payload.guardian_name } : {}),
            ...(payload.guardian_phone ? { phone: payload.guardian_phone } : {}),
            ...(payload.guardian_address !== undefined ? { address: payload.guardian_address } : {}),
            ...(payload.guardian_relationship ? { relationship: payload.guardian_relationship } : {}),
          })
          .eq('id', existingStu.guardian_id)
          .eq('school_id', schoolId);
      }

      const studentPatch: Record<string, unknown> = {};
      const allowedFields = [
        'first_name',
        'middle_name',
        'surname',
        'gender',
        'date_of_birth',
        'admission_date',
        'current_class_id',
        'photo_url',
        'status',
      ];
      for (const key of allowedFields) {
        if (payload[key] !== undefined) studentPatch[key] = payload[key];
      }

      const { error } = await sb
        .from('students')
        .update(studentPatch)
        .eq('id', id)
        .eq('school_id', schoolId);
      if (error) throw new Error(error.message);
      return;
    }
    await localFetch(`/api/students/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  },

  async promoteStudents(studentIds: string[], targetClassId: string, targetAcademicYearId: string): Promise<void> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { error } = await sb.rpc('promote_students_bulk', {
        p_school_id: requireActiveSchoolId(),
        p_student_ids: studentIds,
        p_target_class_id: targetClassId,
        p_target_academic_year_id: targetAcademicYearId,
      });
      if (error) throw new Error(error.message);
      return;
    }
    await localFetch('/api/students/promote', {
      method: 'POST',
      body: JSON.stringify({ studentIds, targetClassId, targetAcademicYearId }),
    });
  },

  async deleteStudent(id: string): Promise<void> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { error } = await sb.from('students').delete().eq('id', id).eq('school_id', requireActiveSchoolId());
      if (error) throw new Error(error.message);
      return;
    }
    await localFetch(`/api/students/${id}`, { method: 'DELETE' });
  },

  // ==================== TEACHERS ====================
  async getTeachers(): Promise<Teacher[]> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const schoolId = requireActiveSchoolId();
      const [{ data: teachers, error }, { data: ts }, { data: cs }, { data: cls }] = await Promise.all([
        sb.from('teachers').select('*').eq('school_id', schoolId).order('surname'),
        sb.from('teacher_subjects').select('teacher_id, subjects(id, name, subject_code)').eq('school_id', schoolId),
        sb.from('class_subjects').select('teacher_id, classes(id, name)').eq('school_id', schoolId),
        sb.from('classes').select('id, name, class_teacher_id').eq('school_id', schoolId),
      ]);
      if (error) throw new Error(error.message);

      return (teachers || []).map((t: Record<string, any>) => {
        const subs = (ts || [])
          .filter((r: any) => r.teacher_id === t.id && r.subjects)
          .map((r: any) => r.subjects);
        const classMap = new Map<string, { id: string; name: string }>();
        (cls || []).filter((c: any) => c.class_teacher_id === t.id).forEach((c: any) => classMap.set(c.id, { id: c.id, name: c.name }));
        (cs || []).filter((c: any) => c.teacher_id === t.id && c.classes).forEach((c: any) => classMap.set(c.classes.id, c.classes));
        return {
          ...t,
          assigned_subjects: subs,
          assigned_subject_ids: subs.map((s: any) => s.id),
          assigned_classes: Array.from(classMap.values()),
          assigned_class_ids: Array.from(classMap.keys()),
        };
      }) as Teacher[];
    }
    return localFetch<Teacher[]>('/api/teachers');
  },

  async createTeacher(payload: Record<string, unknown>): Promise<Teacher> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const schoolId = requireActiveSchoolId();
      const { assigned_subject_ids, ...rest } = payload;
      const { data: teacher, error } = await sb
        .from('teachers')
        .insert({ ...rest, school_id: schoolId, teacher_code: '' })
        .select()
        .single();
      if (error) throw new Error(error.message);
      if (Array.isArray(assigned_subject_ids) && assigned_subject_ids.length) {
        await sb.from('teacher_subjects').insert(
          assigned_subject_ids.map((sid) => ({ school_id: schoolId, teacher_id: teacher.id, subject_id: sid }))
        );
      }
      return teacher as Teacher;
    }
    return localFetch<Teacher>('/api/teachers', { method: 'POST', body: JSON.stringify(payload) });
  },

  async updateTeacher(id: string, payload: Record<string, unknown>): Promise<void> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const schoolId = requireActiveSchoolId();
      const { assigned_subject_ids, ...rest } = payload;
      const { error } = await sb.from('teachers').update(rest).eq('id', id).eq('school_id', schoolId);
      if (error) throw new Error(error.message);
      if (Array.isArray(assigned_subject_ids)) {
        await sb.from('teacher_subjects').delete().eq('teacher_id', id).eq('school_id', schoolId);
        if (assigned_subject_ids.length) {
          await sb.from('teacher_subjects').insert(
            assigned_subject_ids.map((sid) => ({ school_id: schoolId, teacher_id: id, subject_id: sid }))
          );
        }
      }
      return;
    }
    await localFetch(`/api/teachers/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  },

  async deleteTeacher(id: string): Promise<void> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { error } = await sb.from('teachers').delete().eq('id', id).eq('school_id', requireActiveSchoolId());
      if (error) throw new Error(error.message);
      return;
    }
    await localFetch(`/api/teachers/${id}`, { method: 'DELETE' });
  },

  // ==================== SUBJECTS ====================
  async getSubjects(): Promise<Subject[]> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const schoolId = requireActiveSchoolId();
      const [{ data: subjects, error }, { data: assignments }] = await Promise.all([
        sb.from('subjects').select('*').eq('school_id', schoolId).order('name'),
        sb.from('class_subjects').select('*, classes(name), subjects(name, subject_code), teachers(first_name, surname)').eq('school_id', schoolId),
      ]);
      if (error) throw new Error(error.message);
      return (subjects || []).map((s: Record<string, any>) => ({
        ...s,
        assignments: (assignments || [])
          .filter((a: any) => a.subject_id === s.id)
          .map((a: any) => ({
            ...a,
            class_name: a.classes?.name || '',
            subject_name: a.subjects?.name || '',
            subject_code: a.subjects?.subject_code || '',
            teacher_name: a.teachers ? `${a.teachers.first_name} ${a.teachers.surname}` : '',
          })),
      })) as Subject[];
    }
    return localFetch<Subject[]>('/api/subjects');
  },

  async createSubject(payload: Partial<Subject>): Promise<void> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { error } = await sb.from('subjects').insert({ ...payload, school_id: requireActiveSchoolId() });
      if (error) throw new Error(error.message);
      return;
    }
    await localFetch('/api/subjects', { method: 'POST', body: JSON.stringify(payload) });
  },

  async updateSubject(id: string, payload: Partial<Subject>): Promise<void> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { error } = await sb.from('subjects').update(payload).eq('id', id).eq('school_id', requireActiveSchoolId());
      if (error) throw new Error(error.message);
      return;
    }
    await localFetch(`/api/subjects/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  },

  async deleteSubject(id: string): Promise<void> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { error } = await sb.from('subjects').delete().eq('id', id).eq('school_id', requireActiveSchoolId());
      if (error) throw new Error(error.message);
      return;
    }
    await localFetch(`/api/subjects/${id}`, { method: 'DELETE' });
  },

  async getClassSubjects(): Promise<ClassSubjectAssignment[]> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { data, error } = await sb
        .from('class_subjects')
        .select('*, classes(name), subjects(name, subject_code), teachers(first_name, surname)')
        .eq('school_id', requireActiveSchoolId());
      if (error) throw new Error(error.message);
      return (data || []).map((a: Record<string, any>) => ({
        ...a,
        class_name: a.classes?.name || '',
        subject_name: a.subjects?.name || '',
        subject_code: a.subjects?.subject_code || '',
        teacher_name: a.teachers ? `${a.teachers.first_name} ${a.teachers.surname}` : '',
      })) as ClassSubjectAssignment[];
    }
    return localFetch<ClassSubjectAssignment[]>('/api/class-subjects');
  },

  async assignSubjectToClass(payload: { class_id: string; subject_id: string; teacher_id: string | null }): Promise<void> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { error } = await sb.from('class_subjects').insert({ ...payload, school_id: requireActiveSchoolId() });
      if (error) throw new Error(error.message);
      return;
    }
    await localFetch('/api/class-subjects', { method: 'POST', body: JSON.stringify(payload) });
  },

  async removeClassSubject(id: string): Promise<void> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { error } = await sb.from('class_subjects').delete().eq('id', id).eq('school_id', requireActiveSchoolId());
      if (error) throw new Error(error.message);
      return;
    }
    await localFetch(`/api/class-subjects/${id}`, { method: 'DELETE' });
  },

  // ==================== CLASSES ====================
  async getClasses(): Promise<SchoolClass[]> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const schoolId = requireActiveSchoolId();
      const [{ data: classes, error }, { data: students }, { data: cs }] = await Promise.all([
        sb.from('classes').select('*, teachers(first_name, surname)').eq('school_id', schoolId).order('level_number'),
        sb.from('students').select('current_class_id').eq('school_id', schoolId).eq('status', 'Active'),
        sb.from('class_subjects').select('class_id').eq('school_id', schoolId),
      ]);
      if (error) throw new Error(error.message);
      return (classes || []).map((c: Record<string, any>) => ({
        ...c,
        class_teacher_name: c.teachers ? `${c.teachers.first_name} ${c.teachers.surname}` : '',
        student_count: (students || []).filter((s) => s.current_class_id === c.id).length,
        subject_count: (cs || []).filter((x) => x.class_id === c.id).length,
      })) as SchoolClass[];
    }
    return localFetch<SchoolClass[]>('/api/classes');
  },

  async createClass(payload: Partial<SchoolClass>): Promise<void> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { error } = await sb.from('classes').insert({ ...payload, school_id: requireActiveSchoolId() });
      if (error) throw new Error(error.message);
      return;
    }
    await localFetch('/api/classes', { method: 'POST', body: JSON.stringify(payload) });
  },

  async updateClass(id: string, payload: Partial<SchoolClass>): Promise<void> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { error } = await sb.from('classes').update(payload).eq('id', id).eq('school_id', requireActiveSchoolId());
      if (error) throw new Error(error.message);
      return;
    }
    await localFetch(`/api/classes/${id}`, { method: 'PUT', body: JSON.stringify(payload) });
  },

  async deleteClass(id: string): Promise<void> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { error } = await sb.from('classes').delete().eq('id', id).eq('school_id', requireActiveSchoolId());
      if (error) throw new Error(error.message);
      return;
    }
    await localFetch(`/api/classes/${id}`, { method: 'DELETE' });
  },

  // ==================== RESULTS ====================
  async getResults(filters: { academicYearId?: string; termId?: string; classId?: string; subjectId?: string }): Promise<ResultRecord[]> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      let q = sb
        .from('results')
        .select('*, students(student_code, first_name, surname), classes(name), subjects(name, subject_code), terms(name)')
        .eq('school_id', requireActiveSchoolId());
      if (filters.academicYearId) q = q.eq('academic_year_id', filters.academicYearId);
      if (filters.termId) q = q.eq('term_id', filters.termId);
      if (filters.classId) q = q.eq('class_id', filters.classId);
      if (filters.subjectId) q = q.eq('subject_id', filters.subjectId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data || []).map((r: Record<string, any>) => ({
        ...r,
        student_code: r.students?.student_code || '',
        student_name: r.students ? `${r.students.first_name} ${r.students.surname}` : '',
        class_name: r.classes?.name || '',
        subject_name: r.subjects?.name || '',
        subject_code: r.subjects?.subject_code || '',
        term_name: r.terms?.name || '',
      })) as ResultRecord[];
    }
    const p = new URLSearchParams();
    if (filters.academicYearId) p.set('academicYearId', filters.academicYearId);
    if (filters.termId) p.set('termId', filters.termId);
    if (filters.classId) p.set('classId', filters.classId);
    if (filters.subjectId) p.set('subjectId', filters.subjectId);
    return localFetch<ResultRecord[]>(`/api/results?${p.toString()}`);
  },

  async saveResultsBulk(payload: {
    academic_year_id: string;
    term_id: string;
    class_id: string;
    subject_id: string;
    entries: { student_id: string; class_exercise: number; homework: number; project: number; exam: number }[];
  }): Promise<void> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const schoolId = requireActiveSchoolId();
      const { data: scales } = await sb.from('grading_scales').select('*').eq('school_id', schoolId);
      const rows = payload.entries.map((e) => {
        const total = Number(e.class_exercise) + Number(e.homework) + Number(e.project) + Number(e.exam);
        const { grade, remark } = calculateGradeAndRemark(total, (scales || []) as GradingScaleItem[]);
        return {
          school_id: schoolId,
          student_id: e.student_id,
          class_id: payload.class_id,
          subject_id: payload.subject_id,
          academic_year_id: payload.academic_year_id,
          term_id: payload.term_id,
          class_exercise: e.class_exercise,
          homework: e.homework,
          project: e.project,
          exam: e.exam,
          total_score: total,
          grade,
          remarks: remark,
        };
      });
      const { error } = await sb.from('results').upsert(rows, {
        onConflict: 'school_id,student_id,subject_id,academic_year_id,term_id',
      });
      if (error) throw new Error(error.message);
      return;
    }
    await localFetch('/api/results/bulk', { method: 'POST', body: JSON.stringify(payload) });
  },

  async lockResults(payload: { academic_year_id: string; term_id: string; class_id: string; subject_id?: string; locked: boolean }): Promise<void> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      let q = sb
        .from('results')
        .update({ is_locked: payload.locked })
        .eq('school_id', requireActiveSchoolId())
        .eq('academic_year_id', payload.academic_year_id)
        .eq('term_id', payload.term_id)
        .eq('class_id', payload.class_id);
      if (payload.subject_id) q = q.eq('subject_id', payload.subject_id);
      const { error } = await q;
      if (error) throw new Error(error.message);
      return;
    }
    await localFetch('/api/results/lock', { method: 'POST', body: JSON.stringify(payload) });
  },

  async deleteResult(id: string): Promise<void> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { error } = await sb.from('results').delete().eq('id', id).eq('school_id', requireActiveSchoolId());
      if (error) throw new Error(error.message);
      return;
    }
    await localFetch(`/api/results/${id}`, { method: 'DELETE' });
  },

  // ==================== ATTENDANCE ====================
  async getAttendance(filters: { classId?: string; date?: string; academicYearId?: string; termId?: string; studentId?: string }): Promise<AttendanceRecord[]> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      let q = sb
        .from('attendance')
        .select('*, students(student_code, first_name, surname, gender), classes(name)')
        .eq('school_id', requireActiveSchoolId())
        .order('attendance_date', { ascending: false });
      if (filters.classId) q = q.eq('class_id', filters.classId);
      if (filters.date) q = q.eq('attendance_date', filters.date);
      if (filters.academicYearId) q = q.eq('academic_year_id', filters.academicYearId);
      if (filters.termId) q = q.eq('term_id', filters.termId);
      if (filters.studentId) q = q.eq('student_id', filters.studentId);
      const { data, error } = await q;
      if (error) throw new Error(error.message);
      return (data || []).map((a: Record<string, any>) => ({
        ...a,
        student_code: a.students?.student_code || '',
        student_name: a.students ? `${a.students.first_name} ${a.students.surname}` : '',
        gender: a.students?.gender || '',
        class_name: a.classes?.name || '',
      })) as AttendanceRecord[];
    }
    const p = new URLSearchParams();
    if (filters.classId) p.set('classId', filters.classId);
    if (filters.date) p.set('date', filters.date);
    if (filters.academicYearId) p.set('academicYearId', filters.academicYearId);
    if (filters.termId) p.set('termId', filters.termId);
    if (filters.studentId) p.set('studentId', filters.studentId);
    return localFetch<AttendanceRecord[]>(`/api/attendance?${p.toString()}`);
  },

  async saveAttendanceBulk(payload: {
    class_id: string;
    academic_year_id: string;
    term_id: string;
    attendance_date: string;
    entries: { student_id: string; status: 'Present' | 'Absent'; remarks?: string }[];
  }): Promise<void> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const schoolId = requireActiveSchoolId();
      const rows = payload.entries.map((e) => ({
        school_id: schoolId,
        student_id: e.student_id,
        class_id: payload.class_id,
        academic_year_id: payload.academic_year_id,
        term_id: payload.term_id,
        attendance_date: payload.attendance_date,
        status: e.status,
        remarks: e.remarks || '',
      }));
      const { error } = await sb.from('attendance').upsert(rows, { onConflict: 'school_id,student_id,attendance_date' });
      if (error) throw new Error(error.message);
      return;
    }
    await localFetch('/api/attendance/bulk', { method: 'POST', body: JSON.stringify(payload) });
  },

  // ==================== REPORTS ====================
  async getReportCards(filters: { academicYearId: string; termId: string; classId: string }): Promise<StudentReportCardData[]> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const schoolId = requireActiveSchoolId();
      const [
        { data: school },
        { data: settings },
        { data: academicYear },
        { data: term },
        { data: schoolClass },
        { data: students },
        { data: results },
        { data: attendance },
        { data: comments },
      ] = await Promise.all([
        sb.from('schools').select('*').eq('id', schoolId).single(),
        sb.from('school_settings').select('*').eq('school_id', schoolId).single(),
        sb.from('academic_years').select('*').eq('id', filters.academicYearId).single(),
        sb.from('terms').select('*').eq('id', filters.termId).single(),
        sb.from('classes').select('*').eq('id', filters.classId).single(),
        sb.from('students').select('*, guardians(full_name, phone, address)').eq('school_id', schoolId).eq('current_class_id', filters.classId).order('surname'),
        sb.from('results').select('*, subjects(name, subject_code)').eq('school_id', schoolId).eq('class_id', filters.classId).eq('academic_year_id', filters.academicYearId).eq('term_id', filters.termId),
        sb.from('attendance').select('student_id, status').eq('school_id', schoolId).eq('class_id', filters.classId).eq('academic_year_id', filters.academicYearId).eq('term_id', filters.termId),
        sb.from('report_comments').select('*').eq('school_id', schoolId).eq('class_id', filters.classId).eq('academic_year_id', filters.academicYearId).eq('term_id', filters.termId),
      ]);

      const stList = (students || []) as Record<string, any>[];
      const resList = (results || []) as Record<string, any>[];

      const subTotals = new Map<string, { sum: number; count: number }>();
      resList.forEach((r) => {
        const c = subTotals.get(r.subject_id) || { sum: 0, count: 0 };
        c.sum += Number(r.total_score);
        c.count += 1;
        subTotals.set(r.subject_id, c);
      });

      const avgList = stList.map((st) => {
        const sr = resList.filter((r) => r.student_id === st.id);
        const sum = sr.reduce((a, r) => a + Number(r.total_score), 0);
        return { id: st.id, avg: sr.length ? Math.round((sum / sr.length) * 100) / 100 : 0, sum };
      });
      const sorted = [...avgList].sort((a, b) => b.avg - a.avg);
      const rankMap = new Map<string, number>();
      sorted.forEach((item, idx) => {
        if (idx > 0 && sorted[idx - 1].avg === item.avg) rankMap.set(item.id, rankMap.get(sorted[idx - 1].id)!);
        else rankMap.set(item.id, idx + 1);
      });

      return stList.map((st) => {
        const sr = resList.filter((r) => r.student_id === st.id);
        const att = (attendance || []).filter((a: any) => a.student_id === st.id);
        const present = att.filter((a: any) => a.status === 'Present').length;
        const avgObj = avgList.find((x) => x.id === st.id)!;
        return {
          school: school as School,
          settings: settings as SchoolSettings,
          academicYear: academicYear as AcademicYear,
          term: term as Term,
          student: { ...st, class_name: schoolClass?.name || '' } as Student,
          schoolClass: schoolClass as SchoolClass,
          subjects: sr.map((r) => {
            const stStat = subTotals.get(r.subject_id);
            return {
              subject_id: r.subject_id,
              subject_name: r.subjects?.name || '',
              subject_code: r.subjects?.subject_code || '',
              class_exercise: Number(r.class_exercise),
              homework: Number(r.homework),
              project: Number(r.project),
              sba_total: Number(r.class_exercise) + Number(r.homework) + Number(r.project),
              exam: Number(r.exam),
              total_score: Number(r.total_score),
              grade: r.grade,
              remarks: r.remarks,
              subject_average: stStat ? Math.round((stStat.sum / stStat.count) * 10) / 10 : 0,
            };
          }),
          overallAverage: avgObj.avg,
          totalScoreSum: avgObj.sum,
          classPosition: sr.length ? rankMap.get(st.id) || 0 : 0,
          classSize: stList.length,
          attendance: {
            presentDays: present,
            absentDays: att.length - present,
            totalDays: att.length,
            percentage: att.length ? Math.round((present / att.length) * 1000) / 10 : 0,
          },
          comment: ((comments || []) as ReportComment[]).find((c) => c.student_id === st.id) || null,
        };
      });
    }
    const p = new URLSearchParams(filters);
    return localFetch<StudentReportCardData[]>(`/api/reports/cards?${p.toString()}`);
  },

  async saveReportComment(payload: Partial<ReportComment>): Promise<void> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { error } = await sb.from('report_comments').upsert(
        { ...payload, school_id: requireActiveSchoolId() },
        { onConflict: 'school_id,student_id,academic_year_id,term_id' }
      );
      if (error) throw new Error(error.message);
      return;
    }
    await localFetch('/api/reports/comments', { method: 'POST', body: JSON.stringify(payload) });
  },

  async getGeneralReports(filters: { academicYearId?: string; termId?: string }): Promise<{
    enrollmentByClass: { class_name: string; level_number: number; total: number; male: number; female: number }[];
    classPerformance: { class_name: string; students_assessed: number; average_score: number | null; highest_score: number | null; lowest_score: number | null }[];
  }> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const schoolId = requireActiveSchoolId();
      const [{ data: classes }, { data: students }, { data: results }] = await Promise.all([
        sb.from('classes').select('id, name, level_number').eq('school_id', schoolId).order('level_number'),
        sb.from('students').select('current_class_id, gender').eq('school_id', schoolId).eq('status', 'Active'),
        sb.from('results').select('class_id, student_id, total_score, academic_year_id, term_id').eq('school_id', schoolId),
      ]);

      const filteredResults = (results || []).filter(
        (r) => (!filters.academicYearId || r.academic_year_id === filters.academicYearId) && (!filters.termId || r.term_id === filters.termId)
      );

      return {
        enrollmentByClass: (classes || []).map((c) => {
          const st = (students || []).filter((s) => s.current_class_id === c.id);
          return {
            class_name: c.name,
            level_number: c.level_number,
            total: st.length,
            male: st.filter((s) => s.gender === 'Male').length,
            female: st.filter((s) => s.gender === 'Female').length,
          };
        }),
        classPerformance: (classes || []).map((c) => {
          const cr = filteredResults.filter((r) => r.class_id === c.id);
          const scores = cr.map((r) => Number(r.total_score));
          return {
            class_name: c.name,
            students_assessed: new Set(cr.map((r) => r.student_id)).size,
            average_score: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null,
            highest_score: scores.length ? Math.max(...scores) : null,
            lowest_score: scores.length ? Math.min(...scores) : null,
          };
        }),
      };
    }
    const p = new URLSearchParams();
    if (filters.academicYearId) p.set('academicYearId', filters.academicYearId);
    if (filters.termId) p.set('termId', filters.termId);
    return localFetch(`/api/reports/general?${p.toString()}`);
  },

  // ==================== SETTINGS & USERS ====================
  async getSettings(): Promise<{
    school: School;
    settings: SchoolSettings | null;
    assessment: AssessmentConfig | null;
    gradingScale: GradingScaleItem[];
    users: (SchoolMembership & { email: string; full_name: string; phone: string; is_super_admin: boolean })[];
  }> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const schoolId = requireActiveSchoolId();
      const [{ data: school }, { data: settings }, { data: assessment }, { data: gradingScale }, { data: users }] = await Promise.all([
        sb.from('schools').select('*').eq('id', schoolId).single(),
        sb.from('school_settings').select('*').eq('school_id', schoolId).maybeSingle(),
        sb.from('assessments').select('*').eq('school_id', schoolId).eq('is_active', true).maybeSingle(),
        sb.from('grading_scales').select('*').eq('school_id', schoolId).order('sort_order'),
        sb.from('school_memberships').select('*, profiles(email, full_name, phone, is_super_admin)').eq('school_id', schoolId),
      ]);
      return {
        school: school as School,
        settings: settings as SchoolSettings | null,
        assessment: assessment as AssessmentConfig | null,
        gradingScale: (gradingScale || []) as GradingScaleItem[],
        users: (users || []).map((u: any) => ({
          ...u,
          email: u.profiles?.email || '',
          full_name: u.profiles?.full_name || '',
          phone: u.profiles?.phone || '',
          is_super_admin: Boolean(u.profiles?.is_super_admin),
        })),
      };
    }
    return localFetch('/api/settings');
  },

  async updateSchoolSettings(payload: Record<string, unknown>): Promise<void> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const schoolId = requireActiveSchoolId();
      await sb.from('schools').update({
        name: payload.name,
        motto: payload.motto,
        address: payload.address,
        region: payload.region,
        district: payload.district,
        phone: payload.phone,
        email: payload.email,
        logo_url: payload.logo_url,
      }).eq('id', schoolId);
      await sb.from('school_settings').update({
        headteacher_name: payload.headteacher_name,
        student_id_prefix: payload.student_id_prefix,
        teacher_id_prefix: payload.teacher_id_prefix,
        default_class_teacher_comment: payload.default_class_teacher_comment,
        default_headteacher_comment: payload.default_headteacher_comment,
        show_class_position_on_report: payload.show_class_position_on_report,
      }).eq('school_id', schoolId);
      return;
    }
    await localFetch('/api/settings/school', { method: 'PUT', body: JSON.stringify(payload) });
  },

  async updateAssessmentConfig(payload: { class_exercise_max: number; homework_max: number; project_max: number; exam_max: number }): Promise<void> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { error } = await sb.from('assessments').update(payload).eq('school_id', requireActiveSchoolId()).eq('is_active', true);
      if (error) throw new Error(error.message);
      return;
    }
    await localFetch('/api/settings/assessment', { method: 'PUT', body: JSON.stringify(payload) });
  },

  async updateGradingScale(scales: { grade: string; min_score: number; max_score: number; remark: string }[]): Promise<void> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const schoolId = requireActiveSchoolId();
      await sb.from('grading_scales').delete().eq('school_id', schoolId);
      const { error } = await sb.from('grading_scales').insert(
        scales.map((s, idx) => ({ ...s, school_id: schoolId, sort_order: idx + 1 }))
      );
      if (error) throw new Error(error.message);
      return;
    }
    await localFetch('/api/settings/grading', { method: 'PUT', body: JSON.stringify({ scales }) });
  },

  async createUserMembership(payload: {
    email: string;
    full_name: string;
    password?: string;
    role: UserRole;
    phone?: string;
    link_teacher_id?: string | null;
  }): Promise<{ userId: string; emailConfirmed: boolean; message: string }> {
    const cleanEmail = payload.email.trim().toLowerCase();
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const schoolId = requireActiveSchoolId();
      let createdUserId: string | null = null;
      let signupConfirmed = false;

      if (payload.password && payload.password.trim().length > 0) {
        const ephemeralSb = createEphemeralSupabaseClient()!;
        const { data, error } = await ephemeralSb.auth.signUp({
          email: cleanEmail,
          password: payload.password,
          options: { data: { full_name: payload.full_name.trim() } },
        });
        if (error) {
          const msg = error.message.toLowerCase();
          if (!msg.includes('already registered') && !msg.includes('already exists')) {
            throw new Error(error.message);
          }
        } else if (data.user) {
          createdUserId = data.user.id;
          signupConfirmed = Boolean(data.session || data.user.email_confirmed_at);
        }
      }

      const { data: rpcData, error: rpcErr } = await sb.rpc('provision_school_user', {
        p_school_id: schoolId,
        p_email: cleanEmail,
        p_full_name: payload.full_name.trim(),
        p_phone: payload.phone || '',
        p_role: payload.role,
        p_teacher_id: payload.link_teacher_id || null,
      });

      if (!rpcErr && rpcData) {
        const resObj = rpcData as { user_id: string; email_confirmed: boolean };
        const confirmed = Boolean(resObj.email_confirmed || signupConfirmed);
        return {
          userId: resObj.user_id,
          emailConfirmed: confirmed,
          message: confirmed
            ? `User ${cleanEmail} is active and ready to sign in.`
            : `User ${cleanEmail} added to school. Please confirm their email in Supabase Auth before sign-in.`,
        };
      }

      // Fallback if 007_user_provisioning_rpc.sql has not been applied yet
      if (rpcErr && !rpcErr.message.includes('provision_school_user')) {
        throw new Error(rpcErr.message);
      }
      if (!createdUserId) {
        throw new Error(
          'Could not locate existing user. Please run migration 007_user_provisioning_rpc.sql in Supabase SQL Editor or provide a password for a new account.'
        );
      }
      if (payload.role === 'super_admin') {
        await sb.from('profiles').update({ is_super_admin: true }).eq('id', createdUserId);
      }
      const { error: mErr } = await sb.from('school_memberships').upsert(
        { school_id: schoolId, user_id: createdUserId, role: payload.role, is_active: true },
        { onConflict: 'school_id,user_id' }
      );
      if (mErr) throw new Error(mErr.message);
      if (payload.link_teacher_id) {
        await sb.from('teachers').update({ user_id: createdUserId }).eq('id', payload.link_teacher_id).eq('school_id', schoolId);
      }
      return {
        userId: createdUserId,
        emailConfirmed: signupConfirmed,
        message: signupConfirmed
          ? `User ${cleanEmail} is active and ready to sign in.`
          : `User ${cleanEmail} created. Confirm their email or run migration 007 in Supabase SQL Editor so they can sign in immediately.`,
      };
    }

    const res = await localFetch<{ userId: string; emailConfirmed?: boolean }>('/api/settings/users', {
      method: 'POST',
      body: JSON.stringify({ ...payload, email: cleanEmail }),
    });
    return {
      userId: res.userId,
      emailConfirmed: true,
      message: `User ${cleanEmail} created and assigned to school.`,
    };
  },

  async updateUserMembership(membershipId: string, payload: { role?: UserRole; is_active?: boolean }): Promise<void> {
    if (isSupabaseConfigured()) {
      const sb = getSupabaseClient()!;
      const { error: rpcErr } = await sb.rpc('update_school_user_membership', {
        p_membership_id: membershipId,
        p_role: payload.role ?? null,
        p_is_active: payload.is_active ?? null,
      });
      if (!rpcErr) return;
      if (!rpcErr.message.includes('update_school_user_membership')) {
        throw new Error(rpcErr.message);
      }
      const { error } = await sb
        .from('school_memberships')
        .update(payload)
        .eq('id', membershipId)
        .eq('school_id', requireActiveSchoolId());
      if (error) throw new Error(error.message);
      return;
    }
    await localFetch(`/api/settings/users/${membershipId}`, { method: 'PUT', body: JSON.stringify(payload) });
  },
};
