import { AssessmentConfig, GradingScaleItem } from '../types/database';

export const DEFAULT_ASSESSMENT_CONFIG: Pick<
  AssessmentConfig,
  'class_exercise_max' | 'homework_max' | 'project_max' | 'exam_max'
> = {
  class_exercise_max: 10,
  homework_max: 10,
  project_max: 10,
  exam_max: 70,
};

export const DEFAULT_GRADING_SCALE: Omit<GradingScaleItem, 'id' | 'school_id'>[] = [
  { grade: 'A', min_score: 80, max_score: 100, remark: 'Excellent', sort_order: 1 },
  { grade: 'B', min_score: 70, max_score: 79.99, remark: 'Very Good', sort_order: 2 },
  { grade: 'C', min_score: 60, max_score: 69.99, remark: 'Good', sort_order: 3 },
  { grade: 'D', min_score: 50, max_score: 59.99, remark: 'Credit', sort_order: 4 },
  { grade: 'E', min_score: 40, max_score: 49.99, remark: 'Pass', sort_order: 5 },
  { grade: 'F', min_score: 0, max_score: 39.99, remark: 'Fail', sort_order: 6 },
];

export function calculateGradeAndRemark(
  score: number,
  scales: Pick<GradingScaleItem, 'grade' | 'min_score' | 'max_score' | 'remark'>[]
): { grade: string; remark: string } {
  const ordered = [...(scales.length ? scales : DEFAULT_GRADING_SCALE)].sort(
    (a, b) => b.min_score - a.min_score
  );
  for (const row of ordered) {
    if (score >= Number(row.min_score) && score <= Number(row.max_score) + 0.001) {
      return { grade: row.grade, remark: row.remark };
    }
  }
  const fallback = ordered[ordered.length - 1];
  return fallback ? { grade: fallback.grade, remark: fallback.remark } : { grade: 'F', remark: 'Fail' };
}

export function formatOrdinal(n: number): string {
  if (!n || n <= 0) return '-';
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function formatFullName(first: string, middle: string | undefined, surname: string): string {
  return [first, middle, surname].filter(Boolean).join(' ').trim();
}

export function downloadCSV(filename: string, headers: string[], rows: (string | number | null | undefined)[][]) {
  const escape = (val: string | number | null | undefined) => {
    const str = val === null || val === undefined ? '' : String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const csv = [headers.map(escape).join(','), ...rows.map((r) => r.map(escape).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
