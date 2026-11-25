import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, ClipboardEdit, Lock, Save, Search, Trash2, Unlock } from 'lucide-react';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../services/api';
import {
  AcademicYear,
  AssessmentConfig,
  ClassSubjectAssignment,
  GradingScaleItem,
  ResultRecord,
  SchoolClass,
  Student,
  Subject,
  Term,
} from '../types/database';
import { calculateGradeAndRemark, DEFAULT_ASSESSMENT_CONFIG, formatFullName, formatOrdinal } from '../utils/grading';

interface SheetRow {
  student_id: string;
  student_code: string;
  student_name: string;
  class_exercise: number;
  homework: number;
  project: number;
  exam: number;
  is_locked: boolean;
  existing_id?: string;
}

interface StudentFormRow {
  subject_id: string;
  subject_code: string;
  subject_name: string;
  is_class_subject: boolean;
  class_exercise: string;
  homework: string;
  project: string;
  exam: string;
  is_locked: boolean;
  dirty: boolean;
  existing_id?: string;
}

export function ResultsPage() {
  const { isAdmin, activeSchool } = useAuth();
  const { notify } = useToast();

  const [years, setYears] = useState<AcademicYear[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [classSubjects, setClassSubjects] = useState<ClassSubjectAssignment[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [assessment, setAssessment] = useState<
    Pick<AssessmentConfig, 'class_exercise_max' | 'homework_max' | 'project_max' | 'exam_max'>
  >(DEFAULT_ASSESSMENT_CONFIG);
  const [gradingScale, setGradingScale] = useState<GradingScaleItem[]>([]);

  const [yearId, setYearId] = useState('');
  const [termId, setTermId] = useState('');
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [selectedStudentId, setSelectedStudentId] = useState('');
  const [tab, setTab] = useState<'student' | 'entry' | 'register'>('student');
  const [search, setSearch] = useState('');

  const [results, setResults] = useState<ResultRecord[]>([]);
  const [sheetRows, setSheetRows] = useState<SheetRow[]>([]);
  const [studentFormRows, setStudentFormRows] = useState<StudentFormRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ResultRecord | null>(null);

  useEffect(() => {
    let active = true;
    async function init() {
      setLoading(true);
      try {
        const [{ academicYears, terms: trms }, cls, subs, clsSubs, stus, settingsData] = await Promise.all([
          api.getAcademicYearsAndTerms(),
          api.getClasses(),
          api.getSubjects(),
          api.getClassSubjects(),
          api.getStudents(),
          api.getSettings(),
        ]);
        if (!active) return;
        setYears(academicYears);
        setTerms(trms);
        setClasses(cls);
        setSubjects(subs);
        setClassSubjects(clsSubs);
        setStudents(stus);
        if (settingsData.assessment) setAssessment(settingsData.assessment);
        setGradingScale(settingsData.gradingScale);

        const cy = academicYears.find((y) => y.is_current) || academicYears[0];
        const ct = trms.find((t) => t.is_current && t.academic_year_id === cy?.id) || trms[0];
        const cc = cls.find((c) => c.name.includes('Basic 3')) || cls[0];
        if (cy) setYearId(cy.id);
        if (ct) setTermId(ct.id);
        if (cc) setClassId(cc.id);
        if (subs[0]) setSubjectId(subs[0].id);
      } catch (err: unknown) {
        notify('error', err instanceof Error ? err.message : 'Failed to load assessment configuration.');
      } finally {
        if (active) setLoading(false);
      }
    }
    if (activeSchool) init();
    return () => {
      active = false;
    };
  }, [activeSchool]);

  const classStudents = useMemo(
    () => students.filter((s) => s.current_class_id === classId && s.status === 'Active'),
    [students, classId]
  );

  useEffect(() => {
    if (classStudents.length === 0) {
      setSelectedStudentId('');
      return;
    }
    if (!classStudents.some((s) => s.id === selectedStudentId)) {
      setSelectedStudentId(classStudents[0].id);
    }
  }, [classStudents, selectedStudentId]);

  const loadResults = async () => {
    if (!yearId || !termId || !classId) return;
    try {
      const data = await api.getResults({
        academicYearId: yearId,
        termId: termId,
        classId: classId,
        subjectId: tab === 'entry' ? subjectId || undefined : undefined,
      });
      setResults(data);
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Failed to load results.');
    }
  };

  useEffect(() => {
    if (yearId && termId && classId) {
      loadResults();
    }
  }, [yearId, termId, classId, subjectId, tab]);

  // Ensure a subject is always selected when entering marks on bulk sheet
  useEffect(() => {
    if (tab === 'entry' && !subjectId && subjects.length > 0) {
      setSubjectId(subjects[0].id);
    }
  }, [tab, subjectId, subjects]);

  // Build editable bulk entry sheet whenever class/subject/results change
  useEffect(() => {
    if (!classId || !subjectId) {
      setSheetRows([]);
      return;
    }
    const rows: SheetRow[] = classStudents.map((st) => {
      const existing = results.find((r) => r.student_id === st.id && r.subject_id === subjectId);
      return {
        student_id: st.id,
        student_code: st.student_code,
        student_name: formatFullName(st.first_name, st.middle_name, st.surname),
        class_exercise: existing ? Number(existing.class_exercise) : 0,
        homework: existing ? Number(existing.homework) : 0,
        project: existing ? Number(existing.project) : 0,
        exam: existing ? Number(existing.exam) : 0,
        is_locked: existing ? Boolean(existing.is_locked) : false,
        existing_id: existing?.id,
      };
    });
    setSheetRows(rows);
  }, [classId, subjectId, classStudents, results]);

  // Build per-student form rows whenever student, subjects, or results change
  useEffect(() => {
    if (!classId || !selectedStudentId) {
      setStudentFormRows([]);
      return;
    }
    const assignedSubjectIds = new Set(
      classSubjects.filter((cs) => cs.class_id === classId).map((cs) => cs.subject_id)
    );
    const activeSubjects = subjects.filter((s) => s.status === 'Active');
    const orderedSubjects = [...activeSubjects].sort((a, b) => {
      const aAssigned = assignedSubjectIds.has(a.id) ? 0 : 1;
      const bAssigned = assignedSubjectIds.has(b.id) ? 0 : 1;
      if (aAssigned !== bAssigned) return aAssigned - bAssigned;
      return a.name.localeCompare(b.name);
    });

    const rows: StudentFormRow[] = orderedSubjects.map((sub) => {
      const existing = results.find((r) => r.student_id === selectedStudentId && r.subject_id === sub.id);
      return {
        subject_id: sub.id,
        subject_code: sub.subject_code,
        subject_name: sub.name,
        is_class_subject: assignedSubjectIds.has(sub.id),
        class_exercise: existing ? String(existing.class_exercise) : '',
        homework: existing ? String(existing.homework) : '',
        project: existing ? String(existing.project) : '',
        exam: existing ? String(existing.exam) : '',
        is_locked: existing ? Boolean(existing.is_locked) : false,
        dirty: Boolean(existing),
        existing_id: existing?.id,
      };
    });
    setStudentFormRows(rows);
  }, [classId, selectedStudentId, subjects, classSubjects, results]);

  const filteredTerms = yearId ? terms.filter((t) => t.academic_year_id === yearId) : terms;
  const selectedStudent = classStudents.find((s) => s.id === selectedStudentId) || null;
  const selectedStudentIndex = classStudents.findIndex((s) => s.id === selectedStudentId);

  const updateCell = (
    studentId: string,
    field: 'class_exercise' | 'homework' | 'project' | 'exam',
    rawVal: string
  ) => {
    const val = rawVal === '' ? 0 : Number(rawVal);
    if (Number.isNaN(val)) return;
    setSheetRows((prev) =>
      prev.map((row) => (row.student_id === studentId ? { ...row, [field]: val } : row))
    );
  };

  const updateStudentFormCell = (
    subId: string,
    field: 'class_exercise' | 'homework' | 'project' | 'exam',
    rawVal: string
  ) => {
    setStudentFormRows((prev) =>
      prev.map((row) => {
        if (row.subject_id !== subId) return row;
        const next = { ...row, [field]: rawVal };
        const hasAnyInput =
          next.class_exercise.trim() !== '' ||
          next.homework.trim() !== '' ||
          next.project.trim() !== '' ||
          next.exam.trim() !== '';
        next.dirty = Boolean(next.existing_id) || hasAnyInput;
        return next;
      })
    );
  };

  const hasValidationError = useMemo(() => {
    return sheetRows.some(
      (r) =>
        r.class_exercise < 0 ||
        r.class_exercise > assessment.class_exercise_max ||
        r.homework < 0 ||
        r.homework > assessment.homework_max ||
        r.project < 0 ||
        r.project > assessment.project_max ||
        r.exam < 0 ||
        r.exam > assessment.exam_max
    );
  }, [sheetRows, assessment]);

  const hasStudentFormValidationError = useMemo(() => {
    return studentFormRows
      .filter((r) => r.dirty && !r.is_locked)
      .some((r) => {
        const ce = Number(r.class_exercise || 0);
        const hw = Number(r.homework || 0);
        const pr = Number(r.project || 0);
        const ex = Number(r.exam || 0);
        return (
          Number.isNaN(ce) ||
          Number.isNaN(hw) ||
          Number.isNaN(pr) ||
          Number.isNaN(ex) ||
          ce < 0 ||
          ce > assessment.class_exercise_max ||
          hw < 0 ||
          hw > assessment.homework_max ||
          pr < 0 ||
          pr > assessment.project_max ||
          ex < 0 ||
          ex > assessment.exam_max
        );
      });
  }, [studentFormRows, assessment]);

  const anyLockedInSheet = sheetRows.some((r) => r.is_locked);

  const studentFormStats = useMemo(() => {
    const entered = studentFormRows.filter((r) => r.dirty);
    if (entered.length === 0) return { count: 0, avg: 0 };
    const sum = entered.reduce((acc, r) => {
      const total =
        (Number(r.class_exercise || 0) || 0) +
        (Number(r.homework || 0) || 0) +
        (Number(r.project || 0) || 0) +
        (Number(r.exam || 0) || 0);
      return acc + total;
    }, 0);
    return {
      count: entered.length,
      avg: Math.round((sum / entered.length) * 10) / 10,
    };
  }, [studentFormRows]);

  const handleSaveStudentForm = async (goToNext = false) => {
    if (!yearId || !termId || !classId || !selectedStudentId) return;
    if (hasStudentFormValidationError) {
      notify(
        'error',
        `One or more marks exceed maximum limits (${assessment.class_exercise_max}/${assessment.homework_max}/${assessment.project_max}/${assessment.exam_max}).`
      );
      return;
    }
    const entries = studentFormRows
      .filter((r) => r.dirty && !r.is_locked)
      .map((r) => ({
        subject_id: r.subject_id,
        class_exercise: Number(r.class_exercise || 0) || 0,
        homework: Number(r.homework || 0) || 0,
        project: Number(r.project || 0) || 0,
        exam: Number(r.exam || 0) || 0,
      }));

    if (entries.length === 0) {
      notify('info', 'Enter scores for at least one unlocked subject before saving.');
      return;
    }

    setSaving(true);
    try {
      await api.saveStudentResults({
        academic_year_id: yearId,
        term_id: termId,
        class_id: classId,
        student_id: selectedStudentId,
        entries,
      });
      const studentName = selectedStudent
        ? formatFullName(selectedStudent.first_name, selectedStudent.middle_name, selectedStudent.surname)
        : 'student';
      notify('success', `Saved ${entries.length} subject score(s) for ${studentName}.`);
      await loadResults();
      if (goToNext && selectedStudentIndex >= 0 && selectedStudentIndex < classStudents.length - 1) {
        setSelectedStudentId(classStudents[selectedStudentIndex + 1].id);
      }
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Failed to save student results.');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveSheet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!yearId || !termId || !classId || !subjectId) return;
    if (hasValidationError) {
      notify(
        'error',
        `One or more marks exceed maximum limits (${assessment.class_exercise_max}/${assessment.homework_max}/${assessment.project_max}/${assessment.exam_max}).`
      );
      return;
    }
    const unlockedEntries = sheetRows.filter((r) => !r.is_locked);
    if (unlockedEntries.length === 0) {
      notify('info', 'All results in this sheet are locked.');
      return;
    }

    setSaving(true);
    try {
      await api.saveResultsBulk({
        academic_year_id: yearId,
        term_id: termId,
        class_id: classId,
        subject_id: subjectId,
        entries: unlockedEntries.map((r) => ({
          student_id: r.student_id,
          class_exercise: r.class_exercise,
          homework: r.homework,
          project: r.project,
          exam: r.exam,
        })),
      });
      notify('success', `Saved ${unlockedEntries.length} student result(s).`);
      await loadResults();
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Failed to save results.');
    } finally {
      setSaving(false);
    }
  };

  const handleLockToggle = async (locked: boolean) => {
    if (!yearId || !termId || !classId) return;
    try {
      await api.lockResults({
        academic_year_id: yearId,
        term_id: termId,
        class_id: classId,
        subject_id: tab === 'entry' ? subjectId || undefined : undefined,
        locked,
      });
      notify('success', locked ? 'Results locked against unauthorized changes.' : 'Results unlocked for editing.');
      await loadResults();
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Failed to update lock status.');
    }
  };

  const handleDeleteResult = async () => {
    if (!deleteTarget) return;
    try {
      await api.deleteResult(deleteTarget.id);
      notify('success', 'Result entry deleted.');
      setDeleteTarget(null);
      await loadResults();
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Failed to delete result.');
    }
  };

  // Class rankings summary for Register tab
  const classPositionMap = useMemo(() => {
    const byStudent = new Map<string, { sum: number; count: number }>();
    results.forEach((r) => {
      const cur = byStudent.get(r.student_id) || { sum: 0, count: 0 };
      cur.sum += Number(r.total_score);
      cur.count += 1;
      byStudent.set(r.student_id, cur);
    });
    const list = Array.from(byStudent.entries())
      .map(([id, v]) => ({ id, avg: v.count ? v.sum / v.count : 0 }))
      .sort((a, b) => b.avg - a.avg);
    const map = new Map<string, { avg: number; pos: number }>();
    list.forEach((item, idx) => {
      const prev = idx > 0 ? list[idx - 1] : null;
      const pos = prev && Math.abs(prev.avg - item.avg) < 0.001 ? map.get(prev.id)!.pos : idx + 1;
      map.set(item.id, { avg: Math.round(item.avg * 10) / 10, pos });
    });
    return map;
  }, [results]);

  const sheetStats = useMemo(() => {
    if (sheetRows.length === 0) return { avg: 0, highest: 0 };
    const totals = sheetRows.map((r) => r.class_exercise + r.homework + r.project + r.exam);
    const sum = totals.reduce((a, b) => a + b, 0);
    return {
      avg: Math.round((sum / totals.length) * 10) / 10,
      highest: Math.max(...totals),
    };
  }, [sheetRows]);

  const filteredRegister = useMemo(() => {
    const q = search.trim().toLowerCase();
    return results.filter((r) => {
      if (subjectId && r.subject_id !== subjectId) return false;
      if (!q) return true;
      return (
        (r.student_name || '').toLowerCase().includes(q) ||
        (r.student_code || '').toLowerCase().includes(q) ||
        (r.subject_name || '').toLowerCase().includes(q)
      );
    });
  }, [results, search, subjectId]);

  const openStudentFormFor = (studentId: string) => {
    setSelectedStudentId(studentId);
    setTab('student');
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 font-display">Results Entry &amp; Grading</h2>
          <p className="text-sm text-slate-500 mt-1">
            Assessment weights: Ex ({assessment.class_exercise_max}) + HW ({assessment.homework_max}) + Proj (
            {assessment.project_max}) + Exam ({assessment.exam_max}) = 100 marks
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
          <button
            type="button"
            onClick={() => setTab('student')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              tab === 'student' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Student Result Form
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('entry');
              if (!subjectId && subjects[0]) setSubjectId(subjects[0].id);
            }}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              tab === 'entry' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Bulk Subject Sheet
          </button>
          <button
            type="button"
            onClick={() => setTab('register')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              tab === 'register' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Results Register &amp; Positions
          </button>
        </div>
      </div>

      {/* Context Selectors */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Academic Year</label>
          <select
            value={yearId}
            onChange={(e) => {
              const nextYearId = e.target.value;
              setYearId(nextYearId);
              const matching = terms.filter((t) => t.academic_year_id === nextYearId);
              if (matching.length && !matching.some((t) => t.id === termId)) {
                const cur = matching.find((t) => t.is_current) || matching[0];
                setTermId(cur.id);
              }
            }}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
          >
            {years.map((y) => (
              <option key={y.id} value={y.id}>
                {y.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Term</label>
          <select
            value={termId}
            onChange={(e) => setTermId(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
          >
            {filteredTerms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Class</label>
          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {tab === 'student' ? (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Student</label>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={selectedStudentIndex <= 0}
                onClick={() =>
                  selectedStudentIndex > 0 && setSelectedStudentId(classStudents[selectedStudentIndex - 1].id)
                }
                className="p-2 border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                title="Previous student"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <select
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white min-w-0"
              >
                {classStudents.length === 0 ? (
                  <option value="">No active students in class</option>
                ) : (
                  classStudents.map((st) => (
                    <option key={st.id} value={st.id}>
                      {formatFullName(st.first_name, st.middle_name, st.surname)} ({st.student_code})
                    </option>
                  ))
                )}
              </select>
              <button
                type="button"
                disabled={selectedStudentIndex < 0 || selectedStudentIndex >= classStudents.length - 1}
                onClick={() =>
                  selectedStudentIndex >= 0 &&
                  selectedStudentIndex < classStudents.length - 1 &&
                  setSelectedStudentId(classStudents[selectedStudentIndex + 1].id)
                }
                className="p-2 border border-slate-200 rounded-lg bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                title="Next student"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        ) : (
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Subject</label>
            <select
              value={subjectId}
              onChange={(e) => setSubjectId(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
            >
              {tab === 'register' ? (
                <option value="">All Subjects</option>
              ) : (
                subjects.length === 0 && <option value="">No subjects available</option>
              )}
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.subject_code} — {s.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-sm text-slate-500">
          Loading class assessment sheet...
        </div>
      ) : tab === 'student' ? (
        !selectedStudent ? (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-sm text-slate-500">
            No active students enrolled in this class yet. Add or enroll a student on the Students or Classes page first.
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveStudentForm(false);
            }}
            className="bg-white border border-slate-200 rounded-xl overflow-hidden"
          >
            <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {formatFullName(
                    selectedStudent.first_name,
                    selectedStudent.middle_name,
                    selectedStudent.surname
                  )}{' '}
                  <span className="text-xs font-mono font-normal text-slate-500 ml-1">
                    ({selectedStudent.student_code})
                  </span>
                </h3>
                <p className="text-xs text-slate-600 mt-0.5 font-mono tabular-nums">
                  Student {selectedStudentIndex + 1} of {classStudents.length} · Subjects Entered:{' '}
                  <strong className="text-slate-900">{studentFormStats.count}</strong> · Overall Mean:{' '}
                  <strong className="text-emerald-900">{studentFormStats.avg}%</strong>
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {selectedStudentIndex < classStudents.length - 1 && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleSaveStudentForm(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-950 bg-emerald-50 border border-emerald-200 rounded-lg hover:bg-emerald-100 disabled:opacity-50"
                  >
                    <span>Save &amp; Next Student</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                )}
                <button
                  type="submit"
                  disabled={saving || studentFormRows.length === 0}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-emerald-950 rounded-lg hover:bg-emerald-900 disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{saving ? 'Saving...' : 'Save Student Results'}</span>
                </button>
              </div>
            </div>

            <div className="p-4 sm:p-5 space-y-3">
              {studentFormRows.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">
                  No active subjects configured for this school yet.
                </p>
              ) : (
                <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
                  {studentFormRows.map((row) => {
                    const ceNum = Number(row.class_exercise || 0) || 0;
                    const hwNum = Number(row.homework || 0) || 0;
                    const prNum = Number(row.project || 0) || 0;
                    const exNum = Number(row.exam || 0) || 0;
                    const total = Math.round((ceNum + hwNum + prNum + exNum) * 100) / 100;
                    const { grade, remark } = calculateGradeAndRemark(total, gradingScale);

                    const invalidCe = ceNum < 0 || ceNum > assessment.class_exercise_max;
                    const invalidHw = hwNum < 0 || hwNum > assessment.homework_max;
                    const invalidPr = prNum < 0 || prNum > assessment.project_max;
                    const invalidEx = exNum < 0 || exNum > assessment.exam_max;

                    return (
                      <div
                        key={row.subject_id}
                        className={`p-4 grid grid-cols-1 lg:grid-cols-12 gap-3 items-center ${
                          row.dirty ? 'bg-white' : 'bg-slate-50/40'
                        }`}
                      >
                        <div className="lg:col-span-4">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                              {row.subject_code}
                            </span>
                            <span className="font-semibold text-sm text-slate-900">{row.subject_name}</span>
                          </div>
                          <p className="text-xs text-slate-500 mt-1">
                            {row.is_locked
                              ? 'Locked by administrator'
                              : row.existing_id
                                ? 'Saved score — edit to update'
                                : 'Leave blank if student does not take this subject'}
                          </p>
                        </div>

                        <div className="lg:col-span-6 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                          <div>
                            <label className="block text-[11px] font-medium text-slate-600 mb-1">
                              Class Ex. (/{assessment.class_exercise_max})
                            </label>
                            <input
                              type="number"
                              step="0.5"
                              min={0}
                              max={assessment.class_exercise_max}
                              disabled={row.is_locked}
                              placeholder="0"
                              value={row.class_exercise}
                              onChange={(e) => updateStudentFormCell(row.subject_id, 'class_exercise', e.target.value)}
                              className={`w-full px-2.5 py-1.5 text-sm font-mono tabular-nums border rounded-lg ${
                                invalidCe ? 'border-red-500 bg-red-50' : 'border-slate-300 bg-white'
                              } disabled:bg-slate-100 disabled:text-slate-500`}
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-slate-600 mb-1">
                              Homework (/{assessment.homework_max})
                            </label>
                            <input
                              type="number"
                              step="0.5"
                              min={0}
                              max={assessment.homework_max}
                              disabled={row.is_locked}
                              placeholder="0"
                              value={row.homework}
                              onChange={(e) => updateStudentFormCell(row.subject_id, 'homework', e.target.value)}
                              className={`w-full px-2.5 py-1.5 text-sm font-mono tabular-nums border rounded-lg ${
                                invalidHw ? 'border-red-500 bg-red-50' : 'border-slate-300 bg-white'
                              } disabled:bg-slate-100 disabled:text-slate-500`}
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-slate-600 mb-1">
                              Project (/{assessment.project_max})
                            </label>
                            <input
                              type="number"
                              step="0.5"
                              min={0}
                              max={assessment.project_max}
                              disabled={row.is_locked}
                              placeholder="0"
                              value={row.project}
                              onChange={(e) => updateStudentFormCell(row.subject_id, 'project', e.target.value)}
                              className={`w-full px-2.5 py-1.5 text-sm font-mono tabular-nums border rounded-lg ${
                                invalidPr ? 'border-red-500 bg-red-50' : 'border-slate-300 bg-white'
                              } disabled:bg-slate-100 disabled:text-slate-500`}
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] font-medium text-slate-600 mb-1">
                              Exam (/{assessment.exam_max})
                            </label>
                            <input
                              type="number"
                              step="0.5"
                              min={0}
                              max={assessment.exam_max}
                              disabled={row.is_locked}
                              placeholder="0"
                              value={row.exam}
                              onChange={(e) => updateStudentFormCell(row.subject_id, 'exam', e.target.value)}
                              className={`w-full px-2.5 py-1.5 text-sm font-mono tabular-nums border rounded-lg ${
                                invalidEx ? 'border-red-500 bg-red-50' : 'border-slate-300 bg-white'
                              } disabled:bg-slate-100 disabled:text-slate-500`}
                            />
                          </div>
                        </div>

                        <div className="lg:col-span-2 flex lg:flex-col lg:items-end justify-between border-t lg:border-t-0 pt-2 lg:pt-0 border-slate-100">
                          <div className="flex items-baseline gap-2">
                            <span className="text-base font-bold font-mono tabular-nums text-slate-900">
                              {row.dirty ? `${total.toFixed(1)}%` : '—'}
                            </span>
                            {row.dirty && (
                              <span className="text-sm font-bold font-mono text-emerald-900">{grade}</span>
                            )}
                          </div>
                          <span className="text-xs text-slate-500">{row.dirty ? remark : 'Not entered'}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </form>
        )
      ) : tab === 'entry' ? (
        <form onSubmit={handleSaveSheet} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
            <div className="text-xs text-slate-600 font-mono tabular-nums">
              Subject Mean: <strong className="text-slate-900">{sheetStats.avg}%</strong> · Highest:{' '}
              <strong className="text-slate-900">{sheetStats.highest}%</strong> ·{' '}
              <span
                className={
                  anyLockedInSheet ? 'text-amber-700 font-sans font-medium' : 'text-emerald-800 font-sans font-medium'
                }
              >
                {anyLockedInSheet ? 'Locked entries present' : 'Open for entry'}
              </span>
            </div>

            <div className="flex items-center gap-2">
              {isAdmin && (
                <>
                  <button
                    type="button"
                    onClick={() => handleLockToggle(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Lock Results</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleLockToggle(false)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    <span>Unlock</span>
                  </button>
                </>
              )}
              <button
                type="submit"
                disabled={saving || sheetRows.length === 0}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-emerald-950 rounded-lg hover:bg-emerald-900 disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? 'Saving...' : 'Save All Scores'}</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-3 text-right">Class Ex. (/{assessment.class_exercise_max})</th>
                  <th className="py-3 px-3 text-right">Homework (/{assessment.homework_max})</th>
                  <th className="py-3 px-3 text-right">Project (/{assessment.project_max})</th>
                  <th className="py-3 px-3 text-right">Exam (/{assessment.exam_max})</th>
                  <th className="py-3 px-3 text-right">Total (/100)</th>
                  <th className="py-3 px-3 text-center">Grade</th>
                  <th className="py-3 px-4">Remarks</th>
                  <th className="py-3 px-4 text-right">Form</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {sheetRows.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center text-slate-500">
                      No active students enrolled in this class yet.
                    </td>
                  </tr>
                ) : (
                  sheetRows.map((row) => {
                    const total =
                      Math.round((row.class_exercise + row.homework + row.project + row.exam) * 100) / 100;
                    const { grade, remark } = calculateGradeAndRemark(total, gradingScale);
                    const invalidCe = row.class_exercise < 0 || row.class_exercise > assessment.class_exercise_max;
                    const invalidHw = row.homework < 0 || row.homework > assessment.homework_max;
                    const invalidPr = row.project < 0 || row.project > assessment.project_max;
                    const invalidEx = row.exam < 0 || row.exam > assessment.exam_max;

                    return (
                      <tr key={row.student_id} className="hover:bg-slate-50/60">
                        <td className="py-2.5 px-4">
                          <p className="font-medium text-slate-900">{row.student_name}</p>
                          <p className="text-xs font-mono text-slate-500">{row.student_code}</p>
                        </td>
                        <td className="py-2 px-3 text-right">
                          <input
                            type="number"
                            step="0.5"
                            min={0}
                            max={assessment.class_exercise_max}
                            disabled={row.is_locked}
                            value={row.class_exercise}
                            onChange={(e) => updateCell(row.student_id, 'class_exercise', e.target.value)}
                            className={`w-20 px-2 py-1.5 text-right text-sm font-mono tabular-nums border rounded-md ${
                              invalidCe ? 'border-red-500 bg-red-50' : 'border-slate-300'
                            } disabled:bg-slate-100 disabled:text-slate-500`}
                          />
                        </td>
                        <td className="py-2 px-3 text-right">
                          <input
                            type="number"
                            step="0.5"
                            min={0}
                            max={assessment.homework_max}
                            disabled={row.is_locked}
                            value={row.homework}
                            onChange={(e) => updateCell(row.student_id, 'homework', e.target.value)}
                            className={`w-20 px-2 py-1.5 text-right text-sm font-mono tabular-nums border rounded-md ${
                              invalidHw ? 'border-red-500 bg-red-50' : 'border-slate-300'
                            } disabled:bg-slate-100 disabled:text-slate-500`}
                          />
                        </td>
                        <td className="py-2 px-3 text-right">
                          <input
                            type="number"
                            step="0.5"
                            min={0}
                            max={assessment.project_max}
                            disabled={row.is_locked}
                            value={row.project}
                            onChange={(e) => updateCell(row.student_id, 'project', e.target.value)}
                            className={`w-20 px-2 py-1.5 text-right text-sm font-mono tabular-nums border rounded-md ${
                              invalidPr ? 'border-red-500 bg-red-50' : 'border-slate-300'
                            } disabled:bg-slate-100 disabled:text-slate-500`}
                          />
                        </td>
                        <td className="py-2 px-3 text-right">
                          <input
                            type="number"
                            step="0.5"
                            min={0}
                            max={assessment.exam_max}
                            disabled={row.is_locked}
                            value={row.exam}
                            onChange={(e) => updateCell(row.student_id, 'exam', e.target.value)}
                            className={`w-24 px-2 py-1.5 text-right text-sm font-mono tabular-nums border rounded-md ${
                              invalidEx ? 'border-red-500 bg-red-50' : 'border-slate-300'
                            } disabled:bg-slate-100 disabled:text-slate-500`}
                          />
                        </td>
                        <td className="py-2 px-3 text-right font-mono tabular-nums font-bold text-slate-900">
                          {total.toFixed(1)}
                        </td>
                        <td className="py-2 px-3 text-center font-mono font-bold text-emerald-900">{grade}</td>
                        <td className="py-2 px-4 text-xs text-slate-600">
                          {remark} {row.is_locked && '· Locked'}
                        </td>
                        <td className="py-2 px-4 text-right">
                          <button
                            type="button"
                            onClick={() => openStudentFormFor(row.student_id)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-emerald-900 border border-emerald-200 bg-emerald-50 rounded-md hover:bg-emerald-100 whitespace-nowrap"
                          >
                            <ClipboardEdit className="w-3.5 h-3.5" />
                            <span>Open Form</span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search student or subject..."
                className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg"
              />
            </div>
            {isAdmin && (
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => handleLockToggle(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Lock Class Results</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleLockToggle(false)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  <Unlock className="w-3.5 h-3.5" />
                  <span>Unlock Class</span>
                </button>
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                    <th className="py-3 px-4">Student</th>
                    <th className="py-3 px-4">Subject</th>
                    <th className="py-3 px-3 text-right">SBA</th>
                    <th className="py-3 px-3 text-right">Exam</th>
                    <th className="py-3 px-3 text-right">Total</th>
                    <th className="py-3 px-3 text-center">Grade</th>
                    <th className="py-3 px-3 text-right">Term Avg / Pos</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredRegister.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-12 text-center text-slate-500">
                        No recorded results match this selection.
                      </td>
                    </tr>
                  ) : (
                    filteredRegister.map((r) => {
                      const posInfo = classPositionMap.get(r.student_id);
                      const sba = Number(r.class_exercise) + Number(r.homework) + Number(r.project);
                      return (
                        <tr key={r.id} className="hover:bg-slate-50/60">
                          <td className="py-2.5 px-4">
                            <p className="font-medium text-slate-900">{r.student_name}</p>
                            <p className="text-xs font-mono text-slate-500">{r.student_code}</p>
                          </td>
                          <td className="py-2.5 px-4 text-slate-800">{r.subject_name}</td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">{sba}</td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums">{r.exam}</td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums font-bold text-slate-900">
                            {r.total_score}
                          </td>
                          <td className="py-2.5 px-3 text-center font-mono font-bold text-emerald-900">{r.grade}</td>
                          <td className="py-2.5 px-3 text-right font-mono tabular-nums text-xs text-slate-600">
                            {posInfo ? `${posInfo.avg}% · ${formatOrdinal(posInfo.pos)}` : '—'}
                          </td>
                          <td className="py-2.5 px-4 text-xs text-slate-600">
                            {r.is_locked ? 'Locked' : 'Editable'}
                          </td>
                          <td className="py-2.5 px-4 text-right whitespace-nowrap">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => openStudentFormFor(r.student_id)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-900 hover:bg-slate-100"
                                title="Edit in student form"
                              >
                                <ClipboardEdit className="w-4 h-4" />
                              </button>
                              {isAdmin && (
                                <button
                                  type="button"
                                  disabled={r.is_locked}
                                  onClick={() => setDeleteTarget(r)}
                                  className="p-1.5 rounded-lg text-slate-500 hover:text-red-700 disabled:opacity-30"
                                  title={r.is_locked ? 'Unlock before deleting' : 'Delete result'}
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        open={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteResult}
        title="Delete Result Entry"
        message={
          deleteTarget
            ? `Delete ${deleteTarget.subject_name} result for ${deleteTarget.student_name}?`
            : ''
        }
      />
    </div>
  );
}
