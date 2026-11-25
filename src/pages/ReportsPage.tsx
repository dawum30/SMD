import React, { useEffect, useMemo, useState } from 'react';
import { Download, Eye, MessageSquare, Printer, Search } from 'lucide-react';
import { Modal } from '../components/ui/Modal';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { api } from '../services/api';
import {
  AcademicYear,
  DashboardAnalytics,
  SchoolClass,
  StudentReportCardData,
  Teacher,
  Term,
} from '../types/database';
import { downloadCSV, formatFullName, formatOrdinal } from '../utils/grading';
import { downloadReportCardsPDF, downloadTablePDF } from '../utils/pdfGenerator';

function ReportCardSheet({ card }: { card: StudentReportCardData }) {
  const fullName = formatFullName(card.student.first_name, card.student.middle_name, card.student.surname);
  const teacherComment =
    card.comment?.class_teacher_comment || card.settings?.default_class_teacher_comment || 'Good progress this term.';
  const headComment =
    card.comment?.headteacher_comment || card.settings?.default_headteacher_comment || 'Keep up the steady effort.';

  return (
    <div className="bg-white border-2 border-emerald-950 p-6 sm:p-8 text-slate-900 space-y-5">
      {/* School Header */}
      <div className="flex flex-col sm:flex-row items-center gap-4 pb-4 border-b border-slate-300 text-center sm:text-left">
        <img
          src={card.school.logo_url || '/crest-default.jpg'}
          alt={card.school.name}
          referrerPolicy="no-referrer"
          className="w-16 h-16 rounded-lg object-cover border border-slate-200 shrink-0"
        />
        <div className="flex-1">
          <h3 className="text-xl font-extrabold uppercase tracking-tight font-display text-slate-900">
            {card.school.name}
          </h3>
          {card.school.motto && <p className="text-xs italic text-slate-600">&ldquo;{card.school.motto}&rdquo;</p>}
          <p className="text-xs text-slate-600 mt-1">
            {[card.school.address, card.school.phone, card.school.email].filter(Boolean).join(' · ')}
          </p>
        </div>
        <div className="text-center sm:text-right shrink-0">
          <p className="text-xs font-bold uppercase tracking-wider text-emerald-950">Terminal Report Card</p>
          <p className="text-xs font-mono text-slate-600 mt-0.5">
            {card.academicYear.name} · {card.term.name}
          </p>
        </div>
      </div>

      {/* Student Metadata */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs bg-slate-50 border border-slate-200 rounded-lg p-3.5">
        <div>
          <span className="text-slate-500 block">Student Name</span>
          <span className="font-semibold text-slate-900 text-sm">{fullName}</span>
        </div>
        <div>
          <span className="text-slate-500 block">Student ID</span>
          <span className="font-mono font-semibold text-slate-900">{card.student.student_code}</span>
        </div>
        <div>
          <span className="text-slate-500 block">Class</span>
          <span className="font-semibold text-slate-900">{card.schoolClass.name}</span>
        </div>
        <div>
          <span className="text-slate-500 block">Overall Average</span>
          <span className="font-mono font-bold text-emerald-900 text-sm">{card.overallAverage.toFixed(1)}%</span>
        </div>
        <div>
          <span className="text-slate-500 block">Class Position</span>
          <span className="font-mono font-semibold text-slate-900">
            {card.settings?.show_class_position_on_report && card.classPosition > 0
              ? `${formatOrdinal(card.classPosition)} of ${card.classSize}`
              : '—'}
          </span>
        </div>
        <div>
          <span className="text-slate-500 block">Attendance Summary</span>
          <span className="font-mono font-semibold text-slate-900">
            {card.attendance.presentDays} / {card.attendance.totalDays} days ({card.attendance.percentage}%)
          </span>
        </div>
      </div>

      {/* Subject Scores Table */}
      <div className="border border-slate-300 rounded-lg overflow-hidden">
        <table className="w-full text-left text-xs border-collapse">
          <thead className="bg-slate-900 text-white">
            <tr>
              <th className="py-2.5 px-3">Subject</th>
              <th className="py-2.5 px-2 text-right">Ex.</th>
              <th className="py-2.5 px-2 text-right">HW</th>
              <th className="py-2.5 px-2 text-right">Proj.</th>
              <th className="py-2.5 px-2 text-right">SBA</th>
              <th className="py-2.5 px-2 text-right">Exam</th>
              <th className="py-2.5 px-2 text-right">Total</th>
              <th className="py-2.5 px-2 text-right">Subj Avg</th>
              <th className="py-2.5 px-2 text-center">Grade</th>
              <th className="py-2.5 px-3">Remarks</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 font-mono tabular-nums">
            {card.subjects.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-6 text-center font-sans text-slate-400">
                  No scores recorded for this student in {card.term.name}.
                </td>
              </tr>
            ) : (
              card.subjects.map((sub) => (
                <tr key={sub.subject_id}>
                  <td className="py-2 px-3 font-sans font-medium text-slate-900">{sub.subject_name}</td>
                  <td className="py-2 px-2 text-right">{sub.class_exercise}</td>
                  <td className="py-2 px-2 text-right">{sub.homework}</td>
                  <td className="py-2 px-2 text-right">{sub.project}</td>
                  <td className="py-2 px-2 text-right">{sub.sba_total}</td>
                  <td className="py-2 px-2 text-right">{sub.exam}</td>
                  <td className="py-2 px-2 text-right font-bold text-slate-900">{sub.total_score}</td>
                  <td className="py-2 px-2 text-right text-slate-600">{sub.subject_average}</td>
                  <td className="py-2 px-2 text-center font-bold text-emerald-950">{sub.grade}</td>
                  <td className="py-2 px-3 font-sans text-slate-700">{sub.remarks}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Remarks & Next Term Date */}
      <div className="border border-slate-200 rounded-lg p-4 text-xs space-y-2.5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pb-2 border-b border-slate-100">
          <p>
            <strong className="text-slate-700">Conduct:</strong> {card.comment?.conduct || 'Satisfactory'}
          </p>
          <p>
            <strong className="text-slate-700">Attitude:</strong> {card.comment?.attitude || 'Hardworking'}
          </p>
          <p>
            <strong className="text-slate-700">Interest:</strong> {card.comment?.interest || 'Reading & Science'}
          </p>
        </div>
        <p>
          <strong className="text-slate-800">Class Teacher&apos;s Comments:</strong> {teacherComment}
        </p>
        <p>
          <strong className="text-slate-800">Headteacher&apos;s Comments:</strong> {headComment}
        </p>
        <p>
          <strong className="text-slate-800">Next Term Reopening Date:</strong>{' '}
          <span className="font-mono">{card.term.next_reopening_date || 'To be announced'}</span>
        </p>
      </div>

      {/* Signature Lines */}
      <div className="grid grid-cols-2 gap-12 pt-8 text-xs text-center">
        <div>
          <div className="border-t border-slate-400 pt-1.5 font-semibold text-slate-700">
            Class Teacher&apos;s Signature
          </div>
        </div>
        <div>
          <div className="border-t border-slate-400 pt-1.5 font-semibold text-slate-700">
            {card.settings?.headteacher_name
              ? `Headteacher (${card.settings.headteacher_name})`
              : "Headteacher's Signature"}
          </div>
        </div>
      </div>
    </div>
  );
}

export function ReportsPage() {
  const { activeSchool } = useAuth();
  const { notify } = useToast();

  const [tab, setTab] = useState<'cards' | 'general'>('cards');
  const [years, setYears] = useState<AcademicYear[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);

  const [yearId, setYearId] = useState('');
  const [termId, setTermId] = useState('');
  const [classId, setClassId] = useState('');
  const [search, setSearch] = useState('');

  const [cards, setCards] = useState<StudentReportCardData[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [loadingCards, setLoadingCards] = useState(false);

  // Preview & Comment Editor Modal
  const [previewCard, setPreviewCard] = useState<StudentReportCardData | null>(null);
  const [commentForm, setCommentForm] = useState({
    conduct: 'Respectful & Disciplined',
    attitude: 'Attentive in class',
    interest: 'Reading & Science',
    class_teacher_comment: '',
    headteacher_comment: '',
  });
  const [savingComment, setSavingComment] = useState(false);

  // Print Mode Batch
  const [printBatch, setPrintBatch] = useState<StudentReportCardData[] | null>(null);

  // General Reports State
  const [generalType, setGeneralType] = useState<
    'enrollment' | 'gender' | 'teachers' | 'subjects' | 'classes' | 'terms'
  >('enrollment');
  const [generalData, setGeneralData] = useState<{
    enrollmentByClass: { class_name: string; level_number: number; total: number; male: number; female: number }[];
    classPerformance: {
      class_name: string;
      students_assessed: number;
      average_score: number | null;
      highest_score: number | null;
      lowest_score: number | null;
    }[];
  } | null>(null);
  const [dashboardStats, setDashboardStats] = useState<DashboardAnalytics | null>(null);
  const [teachersList, setTeachersList] = useState<Teacher[]>([]);

  useEffect(() => {
    let active = true;
    async function init() {
      try {
        const [{ academicYears, terms: trms }, cls] = await Promise.all([
          api.getAcademicYearsAndTerms(),
          api.getClasses(),
        ]);
        if (!active) return;
        setYears(academicYears);
        setTerms(trms);
        setClasses(cls);
        const cy = academicYears.find((y) => y.is_current) || academicYears[0];
        const ct = trms.find((t) => t.is_current && t.academic_year_id === cy?.id) || trms[0];
        const cc = cls.find((c) => c.name.includes('Basic 3')) || cls[0];
        if (cy) setYearId(cy.id);
        if (ct) setTermId(ct.id);
        if (cc) setClassId(cc.id);
      } catch (err: unknown) {
        notify('error', err instanceof Error ? err.message : 'Failed to initialize reports.');
      }
    }
    if (activeSchool) init();
    return () => {
      active = false;
    };
  }, [activeSchool]);

  const loadCards = async () => {
    if (!yearId || !termId || !classId) return;
    setLoadingCards(true);
    try {
      const data = await api.getReportCards({ academicYearId: yearId, termId, classId });
      setCards(data);
      setSelectedIds(data.map((c) => c.student.id));
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Failed to generate report cards.');
    } finally {
      setLoadingCards(false);
    }
  };

  useEffect(() => {
    if (tab === 'cards' && yearId && termId && classId) {
      loadCards();
    }
  }, [tab, yearId, termId, classId]);

  useEffect(() => {
    if (tab !== 'general' || !activeSchool) return;
    Promise.all([
      api.getGeneralReports({ academicYearId: yearId || undefined, termId: termId || undefined }),
      api.getDashboard({ academicYearId: yearId || undefined, termId: termId || undefined }),
      api.getTeachers(),
    ])
      .then(([gen, dash, tchs]) => {
        setGeneralData(gen);
        setDashboardStats(dash);
        setTeachersList(tchs);
      })
      .catch((err) => notify('error', err instanceof Error ? err.message : 'Failed to load general reports.'));
  }, [tab, activeSchool, yearId, termId]);

  const filteredCards = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return cards;
    return cards.filter((c) => {
      const name = formatFullName(c.student.first_name, c.student.middle_name, c.student.surname).toLowerCase();
      return name.includes(q) || c.student.student_code.toLowerCase().includes(q);
    });
  }, [cards, search]);

  const openPreview = (card: StudentReportCardData) => {
    setPreviewCard(card);
    setCommentForm({
      conduct: card.comment?.conduct || 'Respectful & Disciplined',
      attitude: card.comment?.attitude || 'Attentive in class',
      interest: card.comment?.interest || 'Reading & Science',
      class_teacher_comment:
        card.comment?.class_teacher_comment || card.settings?.default_class_teacher_comment || '',
      headteacher_comment:
        card.comment?.headteacher_comment || card.settings?.default_headteacher_comment || '',
    });
  };

  const handleSaveComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!previewCard) return;
    setSavingComment(true);
    try {
      await api.saveReportComment({
        student_id: previewCard.student.id,
        class_id: previewCard.schoolClass.id,
        academic_year_id: previewCard.academicYear.id,
        term_id: previewCard.term.id,
        ...commentForm,
      });
      notify('success', 'Report card comments saved.');
      await loadCards();
      setPreviewCard(null);
    } catch (err: unknown) {
      notify('error', err instanceof Error ? err.message : 'Failed to save comments.');
    } finally {
      setSavingComment(false);
    }
  };

  const handleDownloadBulkPDF = async (batch: StudentReportCardData[]) => {
    if (batch.length === 0) {
      notify('info', 'Select at least one student report card.');
      return;
    }
    const clsName = batch[0].schoolClass.name.replace(/\s+/g, '-');
    const trmName = batch[0].term.name.replace(/\s+/g, '-');
    await downloadReportCardsPDF(batch, `Report-Cards-${clsName}-${trmName}.pdf`);
    notify('success', `Downloaded PDF with ${batch.length} report card(s).`);
  };

  const handlePrintBatch = (batch: StudentReportCardData[]) => {
    if (batch.length === 0) {
      notify('info', 'Select at least one student report card.');
      return;
    }
    setPrintBatch(batch);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  const selectedCards = filteredCards.filter((c) => selectedIds.includes(c.student.id));
  const filteredTerms = yearId ? terms.filter((t) => t.academic_year_id === yearId) : terms;

  return (
    <div className="space-y-6">
      {/* Hidden Print Batch Container */}
      {printBatch && (
        <div className="hidden print-only space-y-8">
          {printBatch.map((card, idx) => (
            <div key={card.student.id} className={idx < printBatch.length - 1 ? 'print-break-after' : ''}>
              <ReportCardSheet card={card} />
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 font-display">Reports &amp; Terminal Report Cards</h2>
          <p className="text-sm text-slate-500 mt-1">
            Preview, print, and export official student terminal report cards and institutional analytics.
          </p>
        </div>

        <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start">
          <button
            type="button"
            onClick={() => setTab('cards')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              tab === 'cards' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Student Report Cards
          </button>
          <button
            type="button"
            onClick={() => setTab('general')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
              tab === 'general' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            General School Reports
          </button>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 no-print">
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
        {tab === 'cards' ? (
          <>
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
          </>
        ) : (
          <select
            value={generalType}
            onChange={(e) => setGeneralType(e.target.value as typeof generalType)}
            className="sm:col-span-2 px-3 py-2 text-sm border border-slate-200 rounded-lg bg-white"
          >
            <option value="enrollment">Student Enrollment Report (Basic 1–9)</option>
            <option value="gender">Gender Distribution Report</option>
            <option value="teachers">Teacher Directory &amp; GES Ranks Report</option>
            <option value="subjects">Subject Performance Report</option>
            <option value="classes">Class Performance Report</option>
            <option value="terms">Termly Performance Comparison Report</option>
          </select>
        )}
      </div>

      {tab === 'cards' ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden no-print">
          <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/70">
            <span className="text-xs text-slate-600">
              Selected: <strong className="font-mono">{selectedCards.length}</strong> of {filteredCards.length} student(s)
            </span>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => handlePrintBatch(selectedCards)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Selected ({selectedCards.length})</span>
              </button>
              <button
                type="button"
                onClick={() => handlePrintBatch(filteredCards)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print All Class</span>
              </button>
              <button
                type="button"
                onClick={() => handleDownloadBulkPDF(selectedCards)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-950 rounded-lg hover:bg-emerald-900"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download PDF ({selectedCards.length})</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <th className="py-3 px-4 w-10">
                    <input
                      type="checkbox"
                      aria-label="Select all students for printing"
                      checked={filteredCards.length > 0 && filteredCards.every((c) => selectedIds.includes(c.student.id))}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedIds(filteredCards.map((c) => c.student.id));
                        else setSelectedIds([]);
                      }}
                    />
                  </th>
                  <th className="py-3 px-4">Student</th>
                  <th className="py-3 px-4">Student ID</th>
                  <th className="py-3 px-4 text-right">Subjects</th>
                  <th className="py-3 px-4 text-right">Overall Avg</th>
                  <th className="py-3 px-4 text-right">Position</th>
                  <th className="py-3 px-4 text-right">Attendance</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {loadingCards ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500">
                      Computing report cards...
                    </td>
                  </tr>
                ) : filteredCards.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center text-slate-500">
                      No students found in this class.
                    </td>
                  </tr>
                ) : (
                  filteredCards.map((card) => {
                    const name = formatFullName(
                      card.student.first_name,
                      card.student.middle_name,
                      card.student.surname
                    );
                    return (
                      <tr key={card.student.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4">
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(card.student.id)}
                            onChange={() =>
                              setSelectedIds((prev) =>
                                prev.includes(card.student.id)
                                  ? prev.filter((x) => x !== card.student.id)
                                  : [...prev, card.student.id]
                              )
                            }
                          />
                        </td>
                        <td className="py-3 px-4 font-medium text-slate-900">{name}</td>
                        <td className="py-3 px-4 font-mono text-xs text-slate-600">{card.student.student_code}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">{card.subjects.length}</td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-emerald-900">
                          {card.overallAverage.toFixed(1)}%
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums">
                          {card.classPosition > 0 ? `${formatOrdinal(card.classPosition)} / ${card.classSize}` : '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono tabular-nums text-xs text-slate-600">
                          {card.attendance.presentDays}/{card.attendance.totalDays} ({card.attendance.percentage}%)
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openPreview(card)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Preview</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                downloadReportCardsPDF([card], `Report-${card.student.student_code}.pdf`)
                              }
                              className="p-1.5 rounded-lg text-slate-600 hover:text-emerald-900 hover:bg-slate-100"
                              title="Download PDF"
                            >
                              <Download className="w-4 h-4" />
                            </button>
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
      ) : (
        /* General Reports Section */
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden no-print">
          <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
            <h3 className="text-sm font-semibold text-slate-900 capitalize">{generalType} Report</h3>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  if (generalType === 'enrollment' && generalData) {
                    downloadCSV(
                      'enrollment-report.csv',
                      ['Class', 'Male', 'Female', 'Total'],
                      generalData.enrollmentByClass.map((r) => [r.class_name, r.male, r.female, r.total])
                    );
                  } else if (generalType === 'gender' && dashboardStats) {
                    downloadCSV(
                      'gender-distribution.csv',
                      ['Gender', 'Students'],
                      dashboardStats.genderDistribution.map((g) => [g.name, g.value])
                    );
                  } else if (generalType === 'teachers') {
                    downloadCSV(
                      'teacher-report.csv',
                      ['Code', 'Name', 'Gender', 'Rank', 'Status'],
                      teachersList.map((t) => [
                        t.teacher_code,
                        formatFullName(t.first_name, t.middle_name, t.surname),
                        t.gender,
                        t.current_rank,
                        t.employment_status,
                      ])
                    );
                  } else if (generalType === 'subjects' && dashboardStats) {
                    downloadCSV(
                      'subject-performance.csv',
                      ['Code', 'Subject', 'Entries', 'Average %'],
                      dashboardStats.subjectPerformance.map((s) => [s.code, s.subject, s.entries, s.average])
                    );
                  } else if (generalType === 'classes' && generalData) {
                    downloadCSV(
                      'class-performance.csv',
                      ['Class', 'Students Assessed', 'Average %', 'Highest', 'Lowest'],
                      generalData.classPerformance.map((c) => [
                        c.class_name,
                        c.students_assessed,
                        c.average_score ?? 0,
                        c.highest_score ?? 0,
                        c.lowest_score ?? 0,
                      ])
                    );
                  } else if (generalType === 'terms' && dashboardStats) {
                    downloadCSV(
                      'term-comparison.csv',
                      ['Term', 'Entries', 'Average %'],
                      dashboardStats.termComparison.map((t) => [t.term, t.entries, t.average])
                    );
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const title = `${activeSchool?.name || 'School'} — ${generalType.toUpperCase()} REPORT`;
                  if (generalType === 'enrollment' && generalData) {
                    downloadTablePDF(
                      title,
                      'Student enrollment breakdown across Basic 1–9',
                      ['Class', 'Male', 'Female', 'Total'],
                      generalData.enrollmentByClass.map((r) => [r.class_name, r.male, r.female, r.total]),
                      'enrollment-report.pdf'
                    );
                  } else if (generalType === 'teachers') {
                    downloadTablePDF(
                      title,
                      'Staff directory and Ghana Education Service ranks',
                      ['ID', 'Name', 'Gender', 'Rank', 'Status'],
                      teachersList.map((t) => [
                        t.teacher_code,
                        formatFullName(t.first_name, t.middle_name, t.surname),
                        t.gender,
                        t.current_rank,
                        t.employment_status,
                      ]),
                      'teachers-report.pdf'
                    );
                  } else if (generalType === 'subjects' && dashboardStats) {
                    downloadTablePDF(
                      title,
                      'Subject average performance',
                      ['Code', 'Subject', 'Entries', 'Mean Score (%)'],
                      dashboardStats.subjectPerformance.map((s) => [s.code, s.subject, s.entries, s.average]),
                      'subject-performance.pdf'
                    );
                  } else if (generalType === 'classes' && generalData) {
                    downloadTablePDF(
                      title,
                      'Class assessment averages',
                      ['Class', 'Students Assessed', 'Mean (%)', 'Highest', 'Lowest'],
                      generalData.classPerformance.map((c) => [
                        c.class_name,
                        c.students_assessed,
                        c.average_score ?? '-',
                        c.highest_score ?? '-',
                        c.lowest_score ?? '-',
                      ]),
                      'class-performance.pdf'
                    );
                  } else if (generalType === 'terms' && dashboardStats) {
                    downloadTablePDF(
                      title,
                      'Termly academic comparison',
                      ['Term', 'Entries', 'Mean Score (%)'],
                      dashboardStats.termComparison.map((t) => [t.term, t.entries, t.average]),
                      'term-comparison.pdf'
                    );
                  } else if (generalType === 'gender' && dashboardStats) {
                    downloadTablePDF(
                      title,
                      'Student gender distribution',
                      ['Gender', 'Students'],
                      dashboardStats.genderDistribution.map((g) => [g.name, g.value]),
                      'gender-distribution.pdf'
                    );
                  }
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-emerald-950 rounded-lg hover:bg-emerald-900"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download PDF</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            {generalType === 'enrollment' && generalData && (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="py-3 px-4">Class</th>
                    <th className="py-3 px-4 text-right">Male</th>
                    <th className="py-3 px-4 text-right">Female</th>
                    <th className="py-3 px-4 text-right">Total Enrolled</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                  {generalData.enrollmentByClass.map((r) => (
                    <tr key={r.class_name}>
                      <td className="py-3 px-4 font-sans font-medium text-slate-900">{r.class_name}</td>
                      <td className="py-3 px-4 text-right">{r.male}</td>
                      <td className="py-3 px-4 text-right">{r.female}</td>
                      <td className="py-3 px-4 text-right font-bold">{r.total}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {generalType === 'gender' && dashboardStats && (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="py-3 px-4">Gender</th>
                    <th className="py-3 px-4 text-right">Student Count</th>
                    <th className="py-3 px-4 text-right">Share (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                  {dashboardStats.genderDistribution.map((g) => (
                    <tr key={g.name}>
                      <td className="py-3 px-4 font-sans font-medium text-slate-900">{g.name}</td>
                      <td className="py-3 px-4 text-right">{g.value}</td>
                      <td className="py-3 px-4 text-right">
                        {dashboardStats.summary.totalStudents
                          ? ((g.value / dashboardStats.summary.totalStudents) * 100).toFixed(1)
                          : '0.0'}
                        %
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {generalType === 'teachers' && (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="py-3 px-4">Teacher ID</th>
                    <th className="py-3 px-4">Name</th>
                    <th className="py-3 px-4">Current Rank</th>
                    <th className="py-3 px-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {teachersList.map((t) => (
                    <tr key={t.id}>
                      <td className="py-3 px-4 font-mono text-xs">{t.teacher_code}</td>
                      <td className="py-3 px-4 font-medium text-slate-900">
                        {formatFullName(t.first_name, t.middle_name, t.surname)}
                      </td>
                      <td className="py-3 px-4 text-slate-700">{t.current_rank}</td>
                      <td className="py-3 px-4 text-xs text-slate-600">{t.employment_status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {generalType === 'subjects' && dashboardStats && (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="py-3 px-4">Code</th>
                    <th className="py-3 px-4">Subject</th>
                    <th className="py-3 px-4 text-right">Assessed Entries</th>
                    <th className="py-3 px-4 text-right">Mean Score (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                  {dashboardStats.subjectPerformance.map((s) => (
                    <tr key={s.code}>
                      <td className="py-3 px-4 text-xs">{s.code}</td>
                      <td className="py-3 px-4 font-sans font-medium text-slate-900">{s.subject}</td>
                      <td className="py-3 px-4 text-right">{s.entries}</td>
                      <td className="py-3 px-4 text-right font-bold">{s.average}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {generalType === 'classes' && generalData && (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="py-3 px-4">Class</th>
                    <th className="py-3 px-4 text-right">Students Assessed</th>
                    <th className="py-3 px-4 text-right">Mean Score</th>
                    <th className="py-3 px-4 text-right">Highest</th>
                    <th className="py-3 px-4 text-right">Lowest</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                  {generalData.classPerformance.map((c) => (
                    <tr key={c.class_name}>
                      <td className="py-3 px-4 font-sans font-medium text-slate-900">{c.class_name}</td>
                      <td className="py-3 px-4 text-right">{c.students_assessed}</td>
                      <td className="py-3 px-4 text-right font-bold">{c.average_score ?? '—'}</td>
                      <td className="py-3 px-4 text-right">{c.highest_score ?? '—'}</td>
                      <td className="py-3 px-4 text-right">{c.lowest_score ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {generalType === 'terms' && dashboardStats && (
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600">
                  <tr>
                    <th className="py-3 px-4">Term</th>
                    <th className="py-3 px-4 text-right">Assessment Entries</th>
                    <th className="py-3 px-4 text-right">Mean Score (%)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                  {dashboardStats.termComparison.map((t) => (
                    <tr key={t.term}>
                      <td className="py-3 px-4 font-sans font-medium text-slate-900">{t.term}</td>
                      <td className="py-3 px-4 text-right">{t.entries}</td>
                      <td className="py-3 px-4 text-right font-bold">{t.average}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Report Card Preview & Comment Editor Modal */}
      <Modal
        open={Boolean(previewCard)}
        onClose={() => setPreviewCard(null)}
        title="Terminal Report Card Preview"
        maxWidth="4xl"
      >
        {previewCard && (
          <div className="space-y-6">
            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => handlePrintBatch([previewCard])}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print Report Card</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  downloadReportCardsPDF([previewCard], `Report-${previewCard.student.student_code}.pdf`)
                }
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-emerald-950 text-white rounded-lg hover:bg-emerald-900"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download PDF</span>
              </button>
            </div>

            <ReportCardSheet card={previewCard} />

            {/* Teacher & Headteacher Comment Form */}
            <form onSubmit={handleSaveComment} className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <MessageSquare className="w-4 h-4 text-emerald-900" />
                <span>Update Student Remarks &amp; Conduct</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Conduct</label>
                  <input
                    type="text"
                    value={commentForm.conduct}
                    onChange={(e) => setCommentForm({ ...commentForm, conduct: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Attitude</label>
                  <input
                    type="text"
                    value={commentForm.attitude}
                    onChange={(e) => setCommentForm({ ...commentForm, attitude: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-700 mb-1">Interest</label>
                  <input
                    type="text"
                    value={commentForm.interest}
                    onChange={(e) => setCommentForm({ ...commentForm, interest: e.target.value })}
                    className="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Class Teacher&apos;s Comment</label>
                <textarea
                  rows={2}
                  value={commentForm.class_teacher_comment}
                  onChange={(e) => setCommentForm({ ...commentForm, class_teacher_comment: e.target.value })}
                  className="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Headteacher&apos;s Comment</label>
                <textarea
                  rows={2}
                  value={commentForm.headteacher_comment}
                  onChange={(e) => setCommentForm({ ...commentForm, headteacher_comment: e.target.value })}
                  className="w-full px-3 py-1.5 text-sm bg-white border border-slate-300 rounded-lg"
                />
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingComment}
                  className="px-4 py-2 text-xs font-semibold bg-emerald-950 text-white rounded-lg hover:bg-emerald-900"
                >
                  {savingComment ? 'Saving...' : 'Save Comments'}
                </button>
              </div>
            </form>
          </div>
        )}
      </Modal>
    </div>
  );
}
