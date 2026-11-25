import React, { useEffect, useMemo, useState } from 'react';
import { CheckCheck, Save, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../services/api';
import { AcademicYear, AttendanceRecord, SchoolClass, Student, Term } from '../types/database';
import { formatFullName } from '../utils/grading';

export function AttendancePage() {
  const { activeSchool } = useAuth();
  const { notify } = useToast();

  const [years, setYears] = useState<AcademicYear[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [students, setStudents] = useState<Student[]>([]);

  const [yearId, setYearId] = useState('');
  const [termId, setTermId] = useState('');
  const [classId, setClassId] = useState('');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState<'daily' | 'summary'>('daily');

  const [dailyEntries, setDailyEntries] = useState<
    { student_id: string; student_code: string; student_name: string; status: 'Present' | 'Absent'; remarks: string }[]
  >([]);
  const [termRecords, setTermRecords] = useState<AttendanceRecord[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    async function init() {
      try {
        const [{ academicYears, terms: trms }, cls, stus] = await Promise.all([
          api.getAcademicYearsAndTerms(),
          api.getClasses(),
          api.getStudents(),
        ]);
        if (!active) return;
        setYears(academicYears);
        setTerms(trms);
        setClasses(cls);
        setStudents(stus);

        const cy = academicYears.find((y) => y.is_current) || academicYears[0];
        const ct = trms.find((t) => t.is_current && t.academic_year_id === cy?.id) || trms[0];
        const cc = cls.find((c) => c.name.includes('Basic 3')) || cls[0];
        if (cy) setYearId(cy.id);
        if (ct) setTermId(ct.id);
        if (cc) setClassId(cc.id);
      } catch (err: unknown) {
        notify('error', err instanceof Error ? err.message : 'Failed to load attendance data.');
      }
    }
    if (activeSchool) init();
    return () => {
      active = false;
    };
  }, [activeSchool]);

  const loadAttendance = async () => {
    if (!classId || !termId) return;
    try {
      const [dayRows, termRows] = await Promise.all([
        api.getAttendance({ classId, date }),
        api.getAttendance({ classId, academicYearId: yearId, termId }),
      ]);
      setTermRecords(termRows);

      const classStudents = students.filter((s) => s.current_class_id === classId && s.status === 'Active');
      const dayMap = new Map(dayRows.map((r) => [r.student_id, r]));
      setDailyEntries(
        classStudents.map((st) => {
          const existing = dayMap.get(st.id);
          return {
            student_id: st.id,
            student_code: st.student_code,
            student_name: formatFullName(st.first_name, st.middle_name, st.surname),
            status: existing ? existing.status : 'Present',
            remarks: existing?.remarks || '',
          };
        })
      );
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Failed to load attendance.');
    }
  };

  useEffect(() => {
    if (classId && termId && date) loadAttendance();
  }, [classId, termId, date, students]);

  const markAllPresent = () => {
    setDailyEntries((prev) => prev.map((e) => ({ ...e, status: 'Present' })));
  };

  const handleSave = async () => {
    if (!classId || !yearId || !termId || !date || dailyEntries.length === 0) return;
    setSaving(true);
    try {
      await api.saveAttendanceBulk({
        class_id: classId,
        academic_year_id: yearId,
        term_id: termId,
        attendance_date: date,
        entries: dailyEntries.map((e) => ({
          student_id: e.student_id,
          status: e.status,
          remarks: e.remarks,
        })),
      });
      notify('success', `Attendance saved for ${date}.`);
      await loadAttendance();
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Failed to save attendance.');
    } finally {
      setSaving(false);
    }
  };

  // Individual attendance summary across the selected term
  const studentSummaries = useMemo(() => {
    const classStudents = students.filter((s) => s.current_class_id === classId);
    const q = search.trim().toLowerCase();
    return classStudents
      .map((st) => {
        const recs = termRecords.filter((r) => r.student_id === st.id);
        const present = recs.filter((r) => r.status === 'Present').length;
        const total = recs.length;
        const pct = total > 0 ? Math.round((present / total) * 1000) / 10 : 0;
        return {
          id: st.id,
          code: st.student_code,
          name: formatFullName(st.first_name, st.middle_name, st.surname),
          present,
          absent: total - present,
          total,
          pct,
        };
      })
      .filter((s) => !q || s.name.toLowerCase().includes(q) || s.code.toLowerCase().includes(q));
  }, [students, classId, termRecords, search]);

  const filteredDaily = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return dailyEntries;
    return dailyEntries.filter(
      (e) => e.student_name.toLowerCase().includes(q) || e.student_code.toLowerCase().includes(q)
    );
  }, [dailyEntries, search]);

  const filteredTerms = yearId ? terms.filter((t) => t.academic_year_id === yearId) : terms;
  const presentToday = dailyEntries.filter((e) => e.status === 'Present').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 font-display">Attendance Management</h2>
          <p className="text-sm text-slate-500 mt-1">
            Daily class roll call, editable attendance register, and termly attendance percentages.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
          <button
            type="button"
            onClick={() => setTab('daily')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              tab === 'daily' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Daily Roll Call
          </button>
          <button
            type="button"
            onClick={() => setTab('summary')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              tab === 'summary' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Term Attendance Reports
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
        <select
          value={yearId}
          onChange={(e) => setYearId(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
        >
          {years.map((y) => (
            <option key={y.id} value={y.id}>
              {y.name}
            </option>
          ))}
        </select>
        <select
          value={termId}
          onChange={(e) => setTermId(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
        >
          {filteredTerms.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <select
          value={classId}
          onChange={(e) => setClassId(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
        >
          {classes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
        />
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search student..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-slate-200 rounded-lg"
          />
        </div>
      </div>

      {tab === 'daily' ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
            <div className="text-xs text-slate-600 font-mono tabular-nums">
              Date: <strong className="text-slate-900">{date}</strong> · Present:{' '}
              <strong className="text-emerald-800">{presentToday}</strong> / {dailyEntries.length}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={markAllPresent}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border border-slate-200 bg-white rounded-lg hover:bg-slate-50"
              >
                <CheckCheck className="w-3.5 h-3.5" />
                <span>Mark All Present</span>
              </button>
              <button
                type="button"
                disabled={saving || dailyEntries.length === 0}
                onClick={handleSave}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-emerald-950 rounded-lg hover:bg-emerald-900 disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{saving ? 'Saving...' : 'Save Attendance'}</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4">Student ID</th>
                  <th className="py-3 px-4">Attendance Status</th>
                  <th className="py-3 px-4">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {filteredDaily.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-12 text-center text-slate-500">
                      No active students in this class.
                    </td>
                  </tr>
                ) : (
                  filteredDaily.map((entry) => (
                    <tr key={entry.student_id} className="hover:bg-slate-50/60">
                      <td className="py-2.5 px-4 font-medium text-slate-900">{entry.student_name}</td>
                      <td className="py-2.5 px-4 font-mono text-xs text-slate-600">{entry.student_code}</td>
                      <td className="py-2.5 px-4">
                        <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
                          <button
                            type="button"
                            onClick={() =>
                              setDailyEntries((prev) =>
                                prev.map((x) =>
                                  x.student_id === entry.student_id ? { ...x, status: 'Present' } : x
                                )
                              )
                            }
                            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                              entry.status === 'Present'
                                ? 'bg-emerald-950 text-white'
                                : 'bg-white text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            Present
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setDailyEntries((prev) =>
                                prev.map((x) =>
                                  x.student_id === entry.student_id ? { ...x, status: 'Absent' } : x
                                )
                              )
                            }
                            className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                              entry.status === 'Absent'
                                ? 'bg-red-600 text-white'
                                : 'bg-white text-slate-600 hover:bg-slate-50'
                            }`}
                          >
                            Absent
                          </button>
                        </div>
                      </td>
                      <td className="py-2.5 px-4">
                        <input
                          type="text"
                          value={entry.remarks}
                          onChange={(e) =>
                            setDailyEntries((prev) =>
                              prev.map((x) =>
                                x.student_id === entry.student_id ? { ...x, remarks: e.target.value } : x
                              )
                            )
                          }
                          placeholder="Optional note (e.g. Excused)"
                          className="w-full max-w-xs px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg"
                        />
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4">Student ID</th>
                  <th className="py-3 px-4 text-right">Days Present</th>
                  <th className="py-3 px-4 text-right">Days Absent</th>
                  <th className="py-3 px-4 text-right">Total Days Marked</th>
                  <th className="py-3 px-4 text-right">Attendance %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm font-mono tabular-nums">
                {studentSummaries.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-12 text-center font-sans text-slate-500">
                      No attendance records found for this term.
                    </td>
                  </tr>
                ) : (
                  studentSummaries.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50/60">
                      <td className="py-3 px-4 font-sans font-medium text-slate-900">{s.name}</td>
                      <td className="py-3 px-4 text-xs text-slate-600">{s.code}</td>
                      <td className="py-3 px-4 text-right text-emerald-800 font-semibold">{s.present}</td>
                      <td className="py-3 px-4 text-right text-red-700">{s.absent}</td>
                      <td className="py-3 px-4 text-right">{s.total}</td>
                      <td className="py-3 px-4 text-right font-bold text-slate-900">{s.pct}%</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
