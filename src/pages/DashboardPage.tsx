import { useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import { AcademicYear, DashboardAnalytics, SchoolClass, Term } from '../types/database';

export function DashboardPage() {
  const { activeSchool } = useAuth();
  const [academicYears, setAcademicYears] = useState<AcademicYear[]>([]);
  const [terms, setTerms] = useState<Term[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);

  const [selectedYear, setSelectedYear] = useState('');
  const [selectedTerm, setSelectedTerm] = useState('');
  const [selectedClass, setSelectedClass] = useState('');

  const [data, setData] = useState<DashboardAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function loadMeta() {
      try {
        const [{ academicYears: yrs, terms: trms }, cls] = await Promise.all([
          api.getAcademicYearsAndTerms(),
          api.getClasses(),
        ]);
        if (!active) return;
        setAcademicYears(yrs);
        setTerms(trms);
        setClasses(cls);
        const curYear = yrs.find((y) => y.is_current) || yrs[0];
        const curTerm = trms.find((t) => t.is_current && t.academic_year_id === curYear?.id) || trms[0];
        if (curYear) setSelectedYear(curYear.id);
        if (curTerm) setSelectedTerm(curTerm.id);
      } catch (err: unknown) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load school context.');
      }
    }
    if (activeSchool) loadMeta();
    return () => {
      active = false;
    };
  }, [activeSchool]);

  useEffect(() => {
    let active = true;
    async function loadAnalytics() {
      setLoading(true);
      setError('');
      try {
        const res = await api.getDashboard({
          academicYearId: selectedYear || undefined,
          termId: selectedTerm || undefined,
          classId: selectedClass || undefined,
        });
        if (active) setData(res);
      } catch (err: unknown) {
        if (active) setError(err instanceof Error ? err.message : 'Failed to load dashboard statistics.');
      } finally {
        if (active) setLoading(false);
      }
    }
    if (activeSchool) loadAnalytics();
    return () => {
      active = false;
    };
  }, [activeSchool, selectedYear, selectedTerm, selectedClass]);

  const filteredTerms = selectedYear ? terms.filter((t) => t.academic_year_id === selectedYear) : terms;

  const handleYearChange = (yrId: string) => {
    setSelectedYear(yrId);
    const matchingTerms = terms.filter((t) => t.academic_year_id === yrId);
    if (matchingTerms.length && !matchingTerms.some((t) => t.id === selectedTerm)) {
      setSelectedTerm(matchingTerms[0].id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Filters */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 font-display">Academic Overview</h2>
          <p className="text-sm text-slate-500 mt-1">
            Live school enrollment, assessment performance, and termly trends for {activeSchool?.name}.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full md:w-auto">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Academic Year</label>
            <select
              value={selectedYear}
              onChange={(e) => handleYearChange(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900"
            >
              <option value="">All Years</option>
              {academicYears.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Term</label>
            <select
              value={selectedTerm}
              onChange={(e) => setSelectedTerm(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900"
            >
              <option value="">All Terms</option>
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
              value={selectedClass}
              onChange={(e) => setSelectedClass(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900"
            >
              <option value="">All Classes (Basic 1–9)</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {error && <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800">{error}</div>}

      {/* 6 Summary Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        {[
          { label: 'Total Students', value: data?.summary.totalStudents ?? 0 },
          { label: 'Male Students', value: data?.summary.maleStudents ?? 0 },
          { label: 'Female Students', value: data?.summary.femaleStudents ?? 0 },
          { label: 'Active Teachers', value: data?.summary.totalTeachers ?? 0 },
          { label: 'Active Subjects', value: data?.summary.totalSubjects ?? 0 },
          { label: 'Active Classes', value: data?.summary.totalClasses ?? 0 },
        ].map((stat) => (
          <div key={stat.label} className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs font-medium text-slate-500">{stat.label}</p>
            {loading ? (
              <div className="h-8 w-16 bg-slate-100 animate-pulse rounded mt-2" />
            ) : (
              <p className="text-2xl font-bold text-slate-900 mt-1.5 font-mono tabular-nums">{stat.value}</p>
            )}
          </div>
        ))}
      </div>

      {/* Performance Highlights Strip */}
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-semibold text-slate-900">Performance Highlights</h3>
          <span className="text-xs text-slate-500 font-mono tabular-nums">
            Overall Class Average: <strong className="text-emerald-900">{data?.highlights.overallAverage ?? 0}%</strong>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-100">
          <div className="pt-2 sm:pt-0 sm:pr-4">
            <p className="text-xs text-slate-500">Highest-Performing Student</p>
            {data?.highlights.highestStudent ? (
              <div className="mt-1">
                <p className="text-sm font-semibold text-slate-900">{data.highlights.highestStudent.name}</p>
                <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                  {data.highlights.highestStudent.className} · {data.highlights.highestStudent.average}%
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-400 mt-1">No assessment data</p>
            )}
          </div>

          <div className="pt-2 sm:pt-0 sm:px-4">
            <p className="text-xs text-slate-500">Lowest-Performing Student</p>
            {data?.highlights.lowestStudent ? (
              <div className="mt-1">
                <p className="text-sm font-semibold text-slate-900">{data.highlights.lowestStudent.name}</p>
                <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
                  {data.highlights.lowestStudent.className} · {data.highlights.lowestStudent.average}%
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-400 mt-1">No assessment data</p>
            )}
          </div>

          <div className="pt-2 sm:pt-0 sm:px-4">
            <p className="text-xs text-slate-500">Highest-Performing Subject</p>
            {data?.highlights.highestSubject ? (
              <div className="mt-1">
                <p className="text-sm font-semibold text-slate-900">{data.highlights.highestSubject.code}</p>
                <p className="text-xs text-emerald-800 font-mono tabular-nums mt-0.5">
                  Mean {data.highlights.highestSubject.average}%
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-400 mt-1">No assessment data</p>
            )}
          </div>

          <div className="pt-2 sm:pt-0 sm:pl-4">
            <p className="text-xs text-slate-500">Lowest-Performing Subject</p>
            {data?.highlights.lowestSubject ? (
              <div className="mt-1">
                <p className="text-sm font-semibold text-slate-900">{data.highlights.lowestSubject.code}</p>
                <p className="text-xs text-amber-700 font-mono tabular-nums mt-0.5">
                  Mean {data.highlights.lowestSubject.average}%
                </p>
              </div>
            ) : (
              <p className="text-sm text-slate-400 mt-1">No assessment data</p>
            )}
          </div>
        </div>
      </div>

      {/* 4 Interactive Visualizations */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 1. Subject Performance */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-slate-900">Subject Performance</h3>
            <p className="text-xs text-slate-500">Average total score (%) per subject for the selected filter</p>
          </div>
          <div className="h-72">
            {data && data.subjectPerformance.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.subjectPerformance} margin={{ top: 8, right: 16, left: -12, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="code" tick={{ fontSize: 12, fill: '#475569' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#475569' }} />
                  <Tooltip
                    formatter={(val: unknown) => [`${val}%`, 'Average Score']}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                  />
                  <Bar dataKey="average" fill="#064e3b" radius={[4, 4, 0, 0]} maxBarSize={44} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-slate-400">
                No subject results recorded for this filter.
              </div>
            )}
          </div>
        </div>

        {/* 2. Termly Academic Comparison */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-slate-900">Termly Performance Comparison</h3>
            <p className="text-xs text-slate-500">Average score trend across Term 1, Term 2, and Term 3</p>
          </div>
          <div className="h-72">
            {data && data.termComparison.some((t) => t.entries > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.termComparison} margin={{ top: 8, right: 20, left: -12, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="term" tick={{ fontSize: 12, fill: '#475569' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 12, fill: '#475569' }} />
                  <Tooltip
                    formatter={(val: unknown) => [`${val}%`, 'Term Average']}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                  />
                  <Line
                    type="monotone"
                    dataKey="average"
                    stroke="#064e3b"
                    strokeWidth={2.5}
                    dot={{ r: 5, fill: '#064e3b' }}
                    activeDot={{ r: 7 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-slate-400">
                Record results across terms to view academic progression.
              </div>
            )}
          </div>
        </div>

        {/* 3. Student Gender Distribution */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-slate-900">Student Gender Distribution</h3>
            <p className="text-xs text-slate-500">Enrolled male vs female student ratio</p>
          </div>
          <div className="h-64 flex flex-col sm:flex-row items-center">
            {data && data.summary.totalStudents > 0 ? (
              <>
                <div className="w-full sm:w-2/3 h-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={data.genderDistribution}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={85}
                        paddingAngle={3}
                      >
                        {data.genderDistribution.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="w-full sm:w-1/3 space-y-3 text-sm">
                  {data.genderDistribution.map((g) => {
                    const pct = data.summary.totalStudents
                      ? ((g.value / data.summary.totalStudents) * 100).toFixed(1)
                      : '0.0';
                    return (
                      <div key={g.name} className="flex items-center justify-between border-b border-slate-100 pb-2">
                        <span className="font-medium text-slate-700">{g.name}</span>
                        <span className="font-mono tabular-nums text-slate-900 font-semibold">
                          {g.value} ({pct}%)
                        </span>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="w-full h-full flex items-center justify-center text-sm text-slate-400">
                No students enrolled for this selection.
              </div>
            )}
          </div>
        </div>

        {/* 4. Grading Category Distribution */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="mb-4">
            <h3 className="text-base font-semibold text-slate-900">Student Performance Distribution</h3>
            <p className="text-xs text-slate-500">Count of subject scores across grading scale categories (A–F)</p>
          </div>
          <div className="h-64">
            {data && data.gradeDistribution.some((g) => g.count > 0) ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.gradeDistribution} margin={{ top: 8, right: 16, left: -12, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                  <XAxis dataKey="grade" tick={{ fontSize: 12, fill: '#475569' }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#475569' }} />
                  <Tooltip
                    formatter={(val) => [Number(val ?? 0), 'Entries']}
                    contentStyle={{ borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 12 }}
                  />
                  <Bar dataKey="count" fill="#b45309" radius={[4, 4, 0, 0]} maxBarSize={42} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-slate-400">
                No graded entries available yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
