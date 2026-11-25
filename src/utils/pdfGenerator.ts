import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { StudentReportCardData } from '../types/database';
import { formatFullName, formatOrdinal } from './grading';

async function loadImageDataUrl(url: string): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function renderReportCardPage(doc: jsPDF, card: StudentReportCardData, logoDataUrl: string | null) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 14;

  // Outer institutional border
  doc.setDrawColor(6, 78, 59);
  doc.setLineWidth(0.7);
  doc.rect(8, 8, pageWidth - 16, doc.internal.pageSize.getHeight() - 16);

  // Header
  if (logoDataUrl) {
    try {
      doc.addImage(logoDataUrl, 'JPEG', margin, 13, 20, 20);
    } catch {
      // ignore invalid image
    }
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.setTextColor(15, 23, 42);
  doc.text(card.school.name.toUpperCase(), pageWidth / 2, 18, { align: 'center' });

  doc.setFont('helvetica', 'italic');
  doc.setFontSize(9);
  doc.setTextColor(71, 85, 105);
  if (card.school.motto) {
    doc.text(`"${card.school.motto}"`, pageWidth / 2, 23, { align: 'center' });
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(
    [card.school.address, card.school.phone, card.school.email].filter(Boolean).join('  |  '),
    pageWidth / 2,
    28,
    { align: 'center' }
  );

  doc.setFillColor(6, 78, 59);
  doc.rect(margin, 35, pageWidth - margin * 2, 7.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text(
    `TERMINAL REPORT CARD — ${card.academicYear.name} (${card.term.name.toUpperCase()})`,
    pageWidth / 2,
    40.2,
    { align: 'center' }
  );

  // Student Metadata Grid
  const studentName = formatFullName(card.student.first_name, card.student.middle_name, card.student.surname);
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9);

  const infoY = 49;
  doc.setFont('helvetica', 'bold');
  doc.text('Student Name:', margin, infoY);
  doc.setFont('helvetica', 'normal');
  doc.text(studentName, margin + 27, infoY);

  doc.setFont('helvetica', 'bold');
  doc.text('Student ID:', pageWidth / 2 + 6, infoY);
  doc.setFont('helvetica', 'normal');
  doc.text(card.student.student_code, pageWidth / 2 + 28, infoY);

  doc.setFont('helvetica', 'bold');
  doc.text('Class:', margin, infoY + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(card.schoolClass.name, margin + 27, infoY + 6);

  doc.setFont('helvetica', 'bold');
  doc.text('Class Position:', pageWidth / 2 + 6, infoY + 6);
  doc.setFont('helvetica', 'normal');
  const posText =
    card.settings?.show_class_position_on_report && card.classPosition > 0
      ? `${formatOrdinal(card.classPosition)} out of ${card.classSize}`
      : '—';
  doc.text(posText, pageWidth / 2 + 32, infoY + 6);

  doc.setFont('helvetica', 'bold');
  doc.text('Overall Average:', margin, infoY + 12);
  doc.setFont('helvetica', 'normal');
  doc.text(`${card.overallAverage.toFixed(1)}%`, margin + 29, infoY + 12);

  doc.setFont('helvetica', 'bold');
  doc.text('Attendance:', pageWidth / 2 + 6, infoY + 12);
  doc.setFont('helvetica', 'normal');
  doc.text(
    `${card.attendance.presentDays} / ${card.attendance.totalDays} days (${card.attendance.percentage}%)`,
    pageWidth / 2 + 28,
    infoY + 12
  );

  // Results Table
  const tableRows = card.subjects.map((s) => [
    s.subject_name,
    s.class_exercise.toFixed(0),
    s.homework.toFixed(0),
    s.project.toFixed(0),
    s.sba_total.toFixed(0),
    s.exam.toFixed(0),
    s.total_score.toFixed(1),
    s.subject_average.toFixed(1),
    s.grade,
    s.remarks,
  ]);

  autoTable(doc, {
    startY: infoY + 18,
    margin: { left: margin, right: margin },
    head: [['Subject', 'Ex.', 'HW', 'Proj.', 'SBA', 'Exam', 'Total', 'Class Avg', 'Grade', 'Remarks']],
    body: tableRows.length ? tableRows : [['No assessment scores recorded for this term', '-', '-', '-', '-', '-', '-', '-', '-', '-']],
    theme: 'grid',
    headStyles: { fillColor: [15, 23, 42], textColor: 255, fontSize: 8, halign: 'center' },
    styles: { fontSize: 8, cellPadding: 2.2, textColor: [15, 23, 42] },
    columnStyles: {
      0: { halign: 'left', cellWidth: 44 },
      1: { halign: 'right', cellWidth: 11 },
      2: { halign: 'right', cellWidth: 11 },
      3: { halign: 'right', cellWidth: 12 },
      4: { halign: 'right', cellWidth: 12 },
      5: { halign: 'right', cellWidth: 13 },
      6: { halign: 'right', cellWidth: 14, fontStyle: 'bold' },
      7: { halign: 'right', cellWidth: 16 },
      8: { halign: 'center', cellWidth: 13, fontStyle: 'bold' },
      9: { halign: 'left' },
    },
  });

  const finalY = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

  // Comments & Conduct Section
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.rect(margin, finalY, pageWidth - margin * 2, 46);

  const conduct = card.comment?.conduct || 'Satisfactory';
  const attitude = card.comment?.attitude || 'Hardworking';
  const interest = card.comment?.interest || 'Reading & Science';
  const teacherComment =
    card.comment?.class_teacher_comment || card.settings?.default_class_teacher_comment || 'Good progress this term.';
  const headComment =
    card.comment?.headteacher_comment || card.settings?.default_headteacher_comment || 'Keep up the effort.';

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.text('Conduct:', margin + 3, finalY + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(conduct, margin + 22, finalY + 6);

  doc.setFont('helvetica', 'bold');
  doc.text('Attitude:', margin + 70, finalY + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(attitude, margin + 87, finalY + 6);

  doc.setFont('helvetica', 'bold');
  doc.text('Interest:', margin + 128, finalY + 6);
  doc.setFont('helvetica', 'normal');
  doc.text(interest, margin + 144, finalY + 6);

  doc.setFont('helvetica', 'bold');
  doc.text("Class Teacher's Remarks:", margin + 3, finalY + 15);
  doc.setFont('helvetica', 'normal');
  doc.text(doc.splitTextToSize(teacherComment, pageWidth - margin * 2 - 48), margin + 45, finalY + 15);

  doc.setFont('helvetica', 'bold');
  doc.text("Headteacher's Remarks:", margin + 3, finalY + 28);
  doc.setFont('helvetica', 'normal');
  doc.text(doc.splitTextToSize(headComment, pageWidth - margin * 2 - 48), margin + 45, finalY + 28);

  doc.setFont('helvetica', 'bold');
  doc.text('Next Term Reopening Date:', margin + 3, finalY + 41);
  doc.setFont('helvetica', 'normal');
  doc.text(card.term.next_reopening_date || 'To be announced', margin + 48, finalY + 41);

  // Signatures
  const sigY = finalY + 64;
  doc.setDrawColor(100, 116, 139);
  doc.line(margin, sigY, margin + 62, sigY);
  doc.line(pageWidth - margin - 62, sigY, pageWidth - margin, sigY);

  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text("Class Teacher's Signature", margin + 31, sigY + 5, { align: 'center' });
  doc.text(
    card.settings?.headteacher_name ? `Headteacher (${card.settings.headteacher_name})` : "Headteacher's Signature",
    pageWidth - margin - 31,
    sigY + 5,
    { align: 'center' }
  );
}

export async function downloadReportCardsPDF(cards: StudentReportCardData[], filename: string) {
  if (!cards.length) return;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const logoUrl = cards[0].school.logo_url || '/crest-default.jpg';
  const logoDataUrl = await loadImageDataUrl(logoUrl);

  for (let i = 0; i < cards.length; i++) {
    if (i > 0) doc.addPage();
    await renderReportCardPage(doc, cards[i], logoDataUrl);
  }
  doc.save(filename);
}

export function downloadTablePDF(
  title: string,
  subtitle: string,
  headers: string[],
  rows: (string | number)[][],
  filename: string
) {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(title, 14, 16);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9.5);
  doc.setTextColor(71, 85, 105);
  doc.text(subtitle, 14, 22);

  autoTable(doc, {
    startY: 28,
    head: [headers],
    body: rows,
    theme: 'striped',
    headStyles: { fillColor: [6, 78, 59], textColor: 255, fontSize: 8.5 },
    styles: { fontSize: 8.5, cellPadding: 2.5 },
  });

  doc.save(filename);
}
