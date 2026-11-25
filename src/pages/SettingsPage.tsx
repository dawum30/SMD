import React, { useEffect, useState } from 'react';
import { Building2, Plus, Save, Upload, UserPlus } from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../services/api';
import {
  AcademicYear,
  GradingScaleItem,
  School,
  SchoolMembership,
  SchoolSettings,
  Teacher,
  Term,
  UserRole,
} from '../types/database';

export function SettingsPage() {
  const { isAdmin, isSuperAdmin, activeSchool, refreshSession, switchSchool } = useAuth();
  const { notify } = useToast();

  const [tab, setTab] = useState<'school' | 'calendar' | 'grading' | 'users' | 'schools'>('school');
  const [loading, setLoading] = useState(true);

  // School Profile & Settings
  const [schoolForm, setSchoolForm] = useState({
    name: '',
    motto: '',
    address: '',
    region: '',
    district: '',
    phone: '',
    email: '',
    logo_url: '',
    headteacher_name: '',
    student_id_prefix: 'STU',
    teacher_id_prefix: 'TCH',
    default_class_teacher_comment: '',
    default_headteacher_comment: '',
    show_class_position_on_report: true,
  });

  // Academic Calendar
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [newYearOpen, setNewYearOpen] = useState(false);
  const [newYearForm, setNewYearForm] = useState({
    name: '2026/2027',
    start_date: '2026-09-07',
    end_date: '2027-07-23',
    is_current: true,
  });

  // Assessment & Grading
  const [assessment, setAssessment] = useState({
    class_exercise_max: 10,
    homework_max: 10,
    project_max: 10,
    exam_max: 70,
  });
  const [gradingScale, setGradingScale] = useState<
    { grade: string; min_score: number; max_score: number; remark: string }[]
  >([]);

  // Users
  const [users, setUsers] = useState<
    (SchoolMembership & { email: string; full_name: string; phone: string; is_super_admin: boolean })[]
  >([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [userForm, setUserForm] = useState({
    full_name: '',
    email: '',
    password: '',
    phone: '',
    role: 'teacher' as UserRole,
    link_teacher_id: '',
    link_existing_only: false,
  });

  // Super Admin Multi-School
  const [allSchools, setAllSchools] = useState<School[]>([]);
  const [newSchoolOpen, setNewSchoolOpen] = useState(false);
  const [newSchoolForm, setNewSchoolForm] = useState({
    name: '',
    code: '',
    motto: '',
    address: '',
    region: 'Greater Accra',
    district: '',
    phone: '',
    email: '',
  });

  const loadAll = async () => {
    setLoading(true);
    try {
      const [settingsRes, calRes, schoolsList, teacherList] = await Promise.all([
        api.getSettings(),
        api.getAcademicYearsAndTerms(),
        isSuperAdmin ? api.getSchools() : Promise.resolve([]),
        api.getTeachers(),
      ]);
      const sch = settingsRes.school;
      const stg = settingsRes.settings as SchoolSettings | null;
      setSchoolForm({
        name: sch.name || '',
        motto: sch.motto || '',
        address: sch.address || '',
        region: sch.region || '',
        district: sch.district || '',
        phone: sch.phone || '',
        email: sch.email || '',
        logo_url: sch.logo_url || '',
        headteacher_name: stg?.headteacher_name || '',
        student_id_prefix: stg?.student_id_prefix || 'STU',
        teacher_id_prefix: stg?.teacher_id_prefix || 'TCH',
        default_class_teacher_comment: stg?.default_class_teacher_comment || '',
        default_headteacher_comment: stg?.default_headteacher_comment || '',
        show_class_position_on_report: stg?.show_class_position_on_report ?? true,
      });
      if (settingsRes.assessment) {
        setAssessment({
          class_exercise_max: settingsRes.assessment.class_exercise_max,
          homework_max: settingsRes.assessment.homework_max,
          project_max: settingsRes.assessment.project_max,
          exam_max: settingsRes.assessment.exam_max,
        });
      }
      setGradingScale(
        (settingsRes.gradingScale || []).map((g: GradingScaleItem) => ({
          grade: g.grade,
          min_score: g.min_score,
          max_score: g.max_score,
          remark: g.remark,
        }))
      );
      setUsers(settingsRes.users || []);
      setYears(calRes.academicYears);
      setTerms(calRes.terms);
      setAllSchools(schoolsList);
      setTeachers(teacherList);
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Failed to load settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeSchool) loadAll();
  }, [activeSchool]);

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const url = await api.uploadImage(file, 'school-logos');
      setSchoolForm((f) => ({ ...f, logo_url: url }));
      notify('success', 'School logo uploaded.');
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Logo upload failed.');
    }
  };

  const handleSaveSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.updateSchoolSettings(schoolForm);
      notify('success', 'School profile and default report settings updated.');
      await refreshSession();
      await loadAll();
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Failed to update school settings.');
    }
  };

  const handleSaveAssessment = async (e: React.FormEvent) => {
    e.preventDefault();
    const total =
      Number(assessment.class_exercise_max) +
      Number(assessment.homework_max) +
      Number(assessment.project_max) +
      Number(assessment.exam_max);
    if (Math.abs(total - 100) > 0.01) {
      notify('error', 'Assessment weights must add up to exactly 100 marks.');
      return;
    }
    try {
      await api.updateAssessmentConfig(assessment);
      notify('success', 'Assessment structure saved.');
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Failed to save assessment weights.');
    }
  };

  const handleSaveGrading = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.updateGradingScale(gradingScale);
      notify('success', 'Grading scale updated.');
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Failed to save grading scale.');
    }
  };

  const handleCreateYear = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.createAcademicYear(newYearForm);
      notify('success', 'Academic year created.');
      setNewYearOpen(false);
      await loadAll();
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Failed to create academic year.');
    }
  };

  const handleTermUpdate = async (t: Term, patch: Partial<Term>) => {
    try {
      await api.updateTerm(t.id, patch);
      notify('success', `${t.name} updated.`);
      await loadAll();
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Failed to update term.');
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingUser(true);
    try {
      const result = await api.createUserMembership({
        full_name: userForm.full_name,
        email: userForm.email,
        password: userForm.link_existing_only ? undefined : userForm.password,
        phone: userForm.phone,
        role: userForm.role,
        link_teacher_id: userForm.link_teacher_id || null,
      });
      notify(result.emailConfirmed ? 'success' : 'info', result.message);
      setUserModalOpen(false);
      setUserForm({
        full_name: '',
        email: '',
        password: '',
        phone: '',
        role: 'teacher',
        link_teacher_id: '',
        link_existing_only: false,
      });
      await loadAll();
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Failed to create user.');
    } finally {
      setCreatingUser(false);
    }
  };

  const handleCreateSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const created = await api.createSchool(newSchoolForm);
      notify('success', `School "${created.name}" provisioned with Basic 1–9 classes.`);
      setNewSchoolOpen(false);
      await refreshSession();
      await loadAll();
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Failed to create school.');
    }
  };

  if (!isAdmin) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
        <h2 className="text-lg font-bold text-slate-900">Administrator Access Required</h2>
        <p className="text-sm text-slate-500 mt-1">
          School settings, grading configuration, and user permissions can only be modified by a School Administrator
          or Super Administrator.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 font-display">School Settings &amp; Administration</h2>
          <p className="text-sm text-slate-500 mt-1">
            Configure school identity, academic terms, SBA weights, grading scales, and staff permissions.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
          {[
            { key: 'school', label: 'School Profile' },
            { key: 'calendar', label: 'Years & Terms' },
            { key: 'grading', label: 'Grading & SBA' },
            { key: 'users', label: 'Users & Roles' },
            ...(isSuperAdmin ? [{ key: 'schools', label: 'Multi-School' }] : []),
          ].map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setTab(item.key as typeof tab)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                tab === item.key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-sm text-slate-500">
          Loading school configuration...
        </div>
      ) : tab === 'school' ? (
        <form onSubmit={handleSaveSchool} className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
          <div className="flex items-center gap-4">
            <img
              src={schoolForm.logo_url || '/crest-default.jpg'}
              alt="School Crest"
              referrerPolicy="no-referrer"
              className="w-16 h-16 rounded-lg object-cover border border-slate-200"
            />
            <div>
              <label className="inline-flex items-center gap-2 px-3 py-2 text-xs font-medium border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                <Upload className="w-3.5 h-3.5" />
                <span>Upload School Logo</span>
                <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" />
              </label>
              <p className="text-xs text-slate-500 mt-1">Displayed on sidebar and printed PDF report cards.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">School Name *</label>
              <input
                type="text"
                required
                value={schoolForm.name}
                onChange={(e) => setSchoolForm({ ...schoolForm, name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">School Motto</label>
              <input
                type="text"
                value={schoolForm.motto}
                onChange={(e) => setSchoolForm({ ...schoolForm, motto: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Address</label>
              <input
                type="text"
                value={schoolForm.address}
                onChange={(e) => setSchoolForm({ ...schoolForm, address: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Headteacher Name</label>
              <input
                type="text"
                value={schoolForm.headteacher_name}
                onChange={(e) => setSchoolForm({ ...schoolForm, headteacher_name: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Contact Phone</label>
              <input
                type="tel"
                value={schoolForm.phone}
                onChange={(e) => setSchoolForm({ ...schoolForm, phone: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Official Email</label>
              <input
                type="email"
                value={schoolForm.email}
                onChange={(e) => setSchoolForm({ ...schoolForm, email: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Student ID Prefix</label>
              <input
                type="text"
                value={schoolForm.student_id_prefix}
                onChange={(e) => setSchoolForm({ ...schoolForm, student_id_prefix: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Teacher ID Prefix</label>
              <input
                type="text"
                value={schoolForm.teacher_id_prefix}
                onChange={(e) => setSchoolForm({ ...schoolForm, teacher_id_prefix: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div className="space-y-3 pt-4 border-t border-slate-100">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Default Class Teacher Report Comment
              </label>
              <textarea
                rows={2}
                value={schoolForm.default_class_teacher_comment}
                onChange={(e) => setSchoolForm({ ...schoolForm, default_class_teacher_comment: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Default Headteacher Report Comment
              </label>
              <textarea
                rows={2}
                value={schoolForm.default_headteacher_comment}
                onChange={(e) => setSchoolForm({ ...schoolForm, default_headteacher_comment: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={schoolForm.show_class_position_on_report}
                onChange={(e) => setSchoolForm({ ...schoolForm, show_class_position_on_report: e.target.checked })}
              />
              <span>Display class position on student terminal report cards</span>
            </label>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-emerald-950 text-white rounded-lg hover:bg-emerald-900"
            >
              <Save className="w-4 h-4" />
              <span>Save School Settings</span>
            </button>
          </div>
        </form>
      ) : tab === 'calendar' ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-slate-900">Academic Years &amp; Reopening Dates</h3>
            <button
              type="button"
              onClick={() => setNewYearOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-emerald-950 text-white rounded-lg hover:bg-emerald-900"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>New Academic Year</span>
            </button>
          </div>

          <div className="space-y-4">
            {years.map((y) => {
              const yearTerms = terms.filter((t) => t.academic_year_id === y.id);
              return (
                <div key={y.id} className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <div>
                      <h4 className="font-bold text-slate-900">{y.name}</h4>
                      <p className="text-xs text-slate-500 font-mono">
                        {y.start_date} to {y.end_date} · {y.is_current ? 'Current Active Year' : 'Inactive'}
                      </p>
                    </div>
                    {!y.is_current && (
                      <button
                        type="button"
                        onClick={async () => {
                          await api.activateAcademicYear(y.id);
                          notify('success', `${y.name} activated.`);
                          await loadAll();
                        }}
                        className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50"
                      >
                        Set Current Year
                      </button>
                    )}
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {yearTerms.map((t) => (
                      <div key={t.id} className="border border-slate-200 rounded-lg p-3.5 space-y-2.5 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-sm text-slate-900">{t.name}</span>
                          {t.is_current ? (
                            <span className="font-semibold text-emerald-800">Active Term</span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleTermUpdate(t, { is_current: true })}
                              className="text-emerald-900 hover:underline font-medium"
                            >
                              Activate
                            </button>
                          )}
                        </div>
                        <div>
                          <label className="block text-slate-500 mb-1">Next Term Reopening Date</label>
                          <input
                            type="date"
                            value={t.next_reopening_date || ''}
                            onChange={(e) => handleTermUpdate(t, { next_reopening_date: e.target.value })}
                            className="w-full px-2.5 py-1.5 border border-slate-200 rounded-md font-mono"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : tab === 'grading' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <form onSubmit={handleSaveAssessment} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-slate-900">Assessment Weight Structure (Total = 100)</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Class Exercises Max</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={assessment.class_exercise_max}
                  onChange={(e) => setAssessment({ ...assessment, class_exercise_max: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Homework Max</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={assessment.homework_max}
                  onChange={(e) => setAssessment({ ...assessment, homework_max: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Project Work Max</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={assessment.project_max}
                  onChange={(e) => setAssessment({ ...assessment, project_max: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Examination Max</label>
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={assessment.exam_max}
                  onChange={(e) => setAssessment({ ...assessment, exam_max: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
                />
              </div>
            </div>
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs font-mono text-slate-600">
                Sum:{' '}
                <strong>
                  {assessment.class_exercise_max +
                    assessment.homework_max +
                    assessment.project_max +
                    assessment.exam_max}{' '}
                  / 100
                </strong>
              </span>
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold bg-emerald-950 text-white rounded-lg hover:bg-emerald-900"
              >
                Save Weights
              </button>
            </div>
          </form>

          <form onSubmit={handleSaveGrading} className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
            <h3 className="text-base font-semibold text-slate-900">Grading Ranges</h3>
            <div className="space-y-2">
              {gradingScale.map((row, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center text-sm">
                  <input
                    type="text"
                    value={row.grade}
                    onChange={(e) =>
                      setGradingScale((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, grade: e.target.value } : x))
                      )
                    }
                    className="col-span-2 px-2 py-1.5 text-center font-mono font-bold border border-slate-300 rounded-lg"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={row.min_score}
                    onChange={(e) =>
                      setGradingScale((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, min_score: Number(e.target.value) } : x))
                      )
                    }
                    className="col-span-3 px-2 py-1.5 text-right font-mono border border-slate-300 rounded-lg"
                  />
                  <input
                    type="number"
                    step="0.01"
                    value={row.max_score}
                    onChange={(e) =>
                      setGradingScale((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, max_score: Number(e.target.value) } : x))
                      )
                    }
                    className="col-span-3 px-2 py-1.5 text-right font-mono border border-slate-300 rounded-lg"
                  />
                  <input
                    type="text"
                    value={row.remark}
                    onChange={(e) =>
                      setGradingScale((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, remark: e.target.value } : x))
                      )
                    }
                    className="col-span-4 px-2 py-1.5 border border-slate-300 rounded-lg"
                  />
                </div>
              ))}
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="submit"
                className="px-4 py-2 text-xs font-semibold bg-emerald-950 text-white rounded-lg hover:bg-emerald-900"
              >
                Save Grading Scale
              </button>
            </div>
          </form>
        </div>
      ) : tab === 'users' ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-4">
            <div>
              <h3 className="text-base font-semibold text-slate-900">School Users &amp; Role Permissions</h3>
              <p className="text-xs text-slate-500">
                {isSuperAdmin
                  ? `Add or manage School Administrator, Super Administrator, and Teacher accounts for ${activeSchool?.name}.`
                  : `Add or manage Teacher accounts scoped strictly to ${activeSchool?.name}.`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setUserModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-emerald-950 text-white rounded-lg hover:bg-emerald-900 shrink-0"
            >
              <UserPlus className="w-3.5 h-3.5" />
              <span>Add User</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                <tr>
                  <th className="py-3 px-4">Full Name</th>
                  <th className="py-3 px-4">Email</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="py-3 px-4 font-medium text-slate-900">
                      <div className="flex items-center gap-2">
                        <span>{u.full_name}</span>
                        {u.is_super_admin && (
                          <span className="text-[11px] font-semibold text-emerald-800">· Platform Super Admin</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-mono text-xs text-slate-600">{u.email}</td>
                    <td className="py-3 px-4">
                      <select
                        disabled={!isSuperAdmin && (u.role === 'super_admin' || u.role === 'school_admin')}
                        value={u.role}
                        onChange={async (e) => {
                          try {
                            await api.updateUserMembership(u.id, { role: e.target.value as UserRole });
                            notify('success', 'User role updated.');
                            await loadAll();
                          } catch (err: unknown) {
                            notify('error', err instanceof Error ? err.message : 'Unable to update role.');
                          }
                        }}
                        className="px-2.5 py-1 text-xs border border-slate-200 rounded-md bg-white disabled:bg-slate-100 disabled:text-slate-500"
                      >
                        <option value="teacher">Teacher</option>
                        {(isSuperAdmin || u.role === 'school_admin') && (
                          <option value="school_admin">School Administrator</option>
                        )}
                        {(isSuperAdmin || u.role === 'super_admin') && (
                          <option value="super_admin">Super Administrator</option>
                        )}
                      </select>
                    </td>
                    <td className="py-3 px-4">
                      <button
                        type="button"
                        disabled={!isSuperAdmin && (u.role === 'super_admin' || u.role === 'school_admin')}
                        onClick={async () => {
                          try {
                            await api.updateUserMembership(u.id, { is_active: !u.is_active });
                            notify('info', 'Account status updated.');
                            await loadAll();
                          } catch (err: unknown) {
                            notify('error', err instanceof Error ? err.message : 'Unable to update status.');
                          }
                        }}
                        className={`text-xs font-medium ${
                          u.is_active ? 'text-emerald-800' : 'text-red-700'
                        }`}
                      >
                        {u.is_active ? 'Active (Click to disable)' : 'Disabled (Click to enable)'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* Super Admin Multi-School Manager */
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-base font-semibold text-slate-900">Multi-School Tenant Directory</h3>
              <p className="text-xs text-slate-500">
                Create and manage isolated Ghanaian basic schools under the platform.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setNewSchoolOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-emerald-950 text-white rounded-lg hover:bg-emerald-900"
            >
              <Building2 className="w-3.5 h-3.5" />
              <span>Create New School</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {allSchools.map((s) => (
              <div key={s.id} className="bg-white border border-slate-200 rounded-xl p-5 flex items-start justify-between gap-4">
                <div>
                  <h4 className="font-bold text-slate-900">{s.name}</h4>
                  <p className="text-xs font-mono text-slate-500 mt-0.5">
                    {s.code} · {s.region}
                  </p>
                  <p className="text-xs text-slate-600 mt-2">{s.address || 'No address set'}</p>
                </div>
                {s.id === activeSchool?.id ? (
                  <span className="text-xs font-semibold text-emerald-800 whitespace-nowrap">Active Context</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => switchSchool(s.id)}
                    className="px-3 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50 whitespace-nowrap"
                  >
                    Switch School
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* New Academic Year Modal */}
      <Modal open={newYearOpen} onClose={() => setNewYearOpen(false)} title="Create Academic Year" maxWidth="md">
        <form onSubmit={handleCreateYear} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Academic Year Name *</label>
            <input
              type="text"
              required
              value={newYearForm.name}
              onChange={(e) => setNewYearForm({ ...newYearForm, name: e.target.value })}
              placeholder="2026/2027"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Start Date</label>
              <input
                type="date"
                required
                value={newYearForm.start_date}
                onChange={(e) => setNewYearForm({ ...newYearForm, start_date: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">End Date</label>
              <input
                type="date"
                required
                value={newYearForm.end_date}
                onChange={(e) => setNewYearForm({ ...newYearForm, end_date: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={newYearForm.is_current}
              onChange={(e) => setNewYearForm({ ...newYearForm, is_current: e.target.checked })}
            />
            <span>Set as current active academic year</span>
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setNewYearOpen(false)} className="px-4 py-2 text-xs border border-slate-200 rounded-lg">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold bg-emerald-950 text-white rounded-lg">
              Create Year &amp; Terms
            </button>
          </div>
        </form>
      </Modal>

      {/* Add User Modal */}
      <Modal
        open={userModalOpen}
        onClose={() => setUserModalOpen(false)}
        title="Add School User"
        subtitle={`Create a new login or assign an existing user to ${activeSchool?.name || 'this school'}.`}
        maxWidth="md"
      >
        <form onSubmit={handleCreateUser} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Full Name *</label>
              <input
                type="text"
                required
                value={userForm.full_name}
                onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
                placeholder="e.g. Abena Boateng"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Phone Number</label>
              <input
                type="tel"
                value={userForm.phone}
                onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
                placeholder="+233 24 000 0000"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Email *</label>
            <input
              type="email"
              required
              value={userForm.email}
              onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
              placeholder="staff@school.edu.gh"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-600 cursor-pointer">
            <input
              type="checkbox"
              checked={userForm.link_existing_only}
              onChange={(e) => setUserForm({ ...userForm, link_existing_only: e.target.checked })}
            />
            <span>User already has a login account (assign role by email without creating a password)</span>
          </label>

          {!userForm.link_existing_only && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Password *</label>
              <input
                type="password"
                required
                minLength={6}
                value={userForm.password}
                onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                placeholder="Minimum 6 characters"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-slate-700 mb-1">Role *</label>
            <select
              value={userForm.role}
              onChange={(e) => setUserForm({ ...userForm, role: e.target.value as UserRole })}
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
            >
              <option value="teacher">Teacher</option>
              {isSuperAdmin && <option value="school_admin">School Administrator</option>}
              {isSuperAdmin && <option value="super_admin">Super Administrator</option>}
            </select>
          </div>

          {userForm.role === 'teacher' && teachers.length > 0 && (
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">
                Link to Teacher Profile (Optional)
              </label>
              <select
                value={userForm.link_teacher_id}
                onChange={(e) => {
                  const tid = e.target.value;
                  const t = teachers.find((x) => x.id === tid);
                  setUserForm((prev) => ({
                    ...prev,
                    link_teacher_id: tid,
                    full_name: t && !prev.full_name ? `${t.first_name} ${t.surname}` : prev.full_name,
                    email: t && t.email && !prev.email ? t.email : prev.email,
                    phone: t && t.phone && !prev.phone ? t.phone : prev.phone,
                  }));
                }}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
              >
                <option value="">Auto-match by email (or link later)</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.first_name} {t.surname} ({t.teacher_code})
                    {t.user_id ? ' — Linked' : ''}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setUserModalOpen(false)} className="px-4 py-2 text-xs border border-slate-200 rounded-lg">
              Cancel
            </button>
            <button
              type="submit"
              disabled={creatingUser}
              className="px-4 py-2 text-xs font-semibold bg-emerald-950 text-white rounded-lg hover:bg-emerald-900 disabled:opacity-50"
            >
              {creatingUser ? 'Saving...' : 'Save User'}
            </button>
          </div>
        </form>
      </Modal>

      {/* New School Modal (Super Admin) */}
      <Modal open={newSchoolOpen} onClose={() => setNewSchoolOpen(false)} title="Provision New School" maxWidth="lg">
        <form onSubmit={handleCreateSchool} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-700 mb-1">School Name *</label>
              <input
                type="text"
                required
                value={newSchoolForm.name}
                onChange={(e) => setNewSchoolForm({ ...newSchoolForm, name: e.target.value })}
                placeholder="Kumasi Model Basic School"
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Unique Code *</label>
              <input
                type="text"
                required
                value={newSchoolForm.code}
                onChange={(e) => setNewSchoolForm({ ...newSchoolForm, code: e.target.value.toUpperCase() })}
                placeholder="KMBS-002"
                className="w-full px-3 py-2 text-sm font-mono border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Region</label>
              <input
                type="text"
                value={newSchoolForm.region}
                onChange={(e) => setNewSchoolForm({ ...newSchoolForm, region: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Address</label>
              <input
                type="text"
                value={newSchoolForm.address}
                onChange={(e) => setNewSchoolForm({ ...newSchoolForm, address: e.target.value })}
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setNewSchoolOpen(false)} className="px-4 py-2 text-xs border border-slate-200 rounded-lg">
              Cancel
            </button>
            <button type="submit" className="px-4 py-2 text-xs font-semibold bg-emerald-950 text-white rounded-lg">
              Create School
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
