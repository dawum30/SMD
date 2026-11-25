import React, { useEffect, useMemo, useState } from 'react';
import { Lock, Save, Search, Trash2, Unlock } from 'lucide-react';
import { ConfirmModal } from '../components/ui/ConfirmModal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../services/api';
import {
  AcademicYear,
  AssessmentConfig,
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

export function ResultsPage() {
  const { isAdmin, activeSchool } = useAuth();
  const { notify } = useToast();

  const [years, setYears] = useState<AcademicYear[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [assessment, setAssessment] = useState<Pick<AssessmentConfig, 'class_exercise_max' | 'homework_max' | 'project_max' | 'exam_max'>>(
    DEFAULT_ASSESSMENT_CONFIG
  );
  const [gradingScale, setGradingScale] = useState<GradingScaleItem[]>([]);

  const [yearId, setYearId] = useState('');
  const [termId, setTermId] = useState('');
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [tab, setTab] = useState<'entry' | 'register'>('entry');
  const [search, setSearch] = useState('');

  const [results, setResults] = useState<ResultRecord[]>([]);
  const [sheetRows, setSheetRows] = useState<SheetRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ResultRecord | null>(null);

  useEffect(() => {
    let active = true;
    async function init() {
      setLoading(true);
      try {
        const [{ academicYears, terms: trms }, cls, subs, stus, settingsData] = await Promise.all([
          api.getAcademicYearsAndTerms(),
          api.getClasses(),
          api.getSubjects(),
          api.getStudents(),
          api.getSettings(),
        ]);
        if (!active) return;
        setYears(academicYears);
        setTerms(trms);
        setClasses(cls);
        setSubjects(subs);
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

  // Build editable bulk entry sheet whenever class/subject/results change
  useEffect(() => {
    if (!classId || !subjectId) return;
    const classStudents = students.filter((s) => s.current_class_id === classId && s.status === 'Active');
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
  }, [classId, subjectId, students, results]);

  const filteredTerms = yearId ? terms.filter((t) => t.academic_year_id === yearId) : terms;

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

  const anyLockedInSheet = sheetRows.some((r) => r.is_locked);

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

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 font-display">Results &amp; Grading</h2>
          <p className="text-sm text-slate-500 mt-1">
            Assessment weights: Ex ({assessment.class_exercise_max}) + HW ({assessment.homework_max}) + Proj (
            {assessment.project_max}) + Exam ({assessment.exam_max}) = 100 marks
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
          <button
            type="button"
            onClick={() => setTab('entry')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              tab === 'entry' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Bulk Score Sheet
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
            onChange={(e) => setYearId(e.target.value)}
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
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Subject</label>
          <select
            value={subjectId}
            onChange={(e) => setSubjectId(e.target.value)}
            className="w-full px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
          >
            {tab === 'register' && <option value="">All Subjects</option>}
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>
                {s.subject_code} — {s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-sm text-slate-500">
          Loading class assessment sheet...
        </div>
      ) : tab === 'entry' ? (
        <form onSubmit={handleSaveSheet} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
            <div className="text-xs text-slate-600 font-mono tabular-nums">
              Subject Mean: <strong className="text-slate-900">{sheetStats.avg}%</strong> · Highest:{' '}
              <strong className="text-slate-900">{sheetStats.highest}%</strong> ·{' '}
              <span className={anyLockedInSheet ? 'text-amber-700 font-sans font-medium' : 'text-emerald-800 font-sans font-medium'}>
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
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {sheetRows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500">
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
                    {isAdmin && <th className="py-3 px-4 text-right">Action</th>}
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
                          {isAdmin && (
                            <td className="py-2.5 px-4 text-right">
                              <button
                                type="button"
                                disabled={r.is_locked}
                                onClick={() => setDeleteTarget(r)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-red-700 disabled:opacity-30"
                                title={r.is_locked ? 'Unlock before deleting' : 'Delete result'}
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </td>
                          )}
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
