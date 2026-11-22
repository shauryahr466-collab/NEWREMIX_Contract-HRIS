import { format, parseISO } from 'date-fns';
import type { RawPunch, Employee, ProcessedAttendance } from '../types';
import { getNepaliDate } from '../utils/dateHelper';
import { formatAMPM, normalizeEmployeeId, toDeviceWallClockIso } from './utils';
import {
  type IsoDocumentMeta,
  type TimeStandardMode
} from './isoReportExporter';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ZkBioDataRow {
  employeeNo: string;
  name: string;
  department: string;
  section: string;
  dateStr: string;      // ISO 8601 YYYY-MM-DD
  bsDate: string;       // B.S. YYYY-MM-DD
  formattedDate: string; // ISO YYYY-MM-DD or legacy M/d/yyyy
  punchCount: number;
  timeString: string;    // Sorted h:mm AM/PM comma-separated
}

export function generateZkBioDataRows(
  punches: RawPunch[],
  employees: Employee[],
  processedData: ProcessedAttendance[],
  startDate?: string,
  endDate?: string,
  deptFilter?: string[],
  searchTerm?: string,
  timeStandard: TimeStandardMode = 'iso',
  sectionFilter?: string[]
): ZkBioDataRow[] {
  const empMap = new Map<string, Employee>();
  employees.forEach(e => {
    empMap.set(e.id, e);
    const norm = normalizeEmployeeId(e.id);
    if (norm) empMap.set(norm, e);
  });

  const groupMap = new Map<string, {
    employeeNo: string;
    name: string;
    department: string;
    section: string;
    dateStr: string;
    bsDate: string;
    formattedDate: string;
    rawWallTimes: string[];
  }>();

  const formatDateVal = (dateStr: string) => {
    if (timeStandard === 'iso') return dateStr;
    try {
      return format(parseISO(dateStr), 'M/d/yyyy');
    } catch {
      return dateStr;
    }
  };

  // 1. Process raw punches if present
  if (punches && punches.length > 0) {
    punches.forEach(p => {
      if (!p.punchDatetime) return;
      const cleanWallClock = toDeviceWallClockIso(p.punchDatetime);
      if (!cleanWallClock) return;
      const dateStr = cleanWallClock.includes('T') ? cleanWallClock.split('T')[0] : cleanWallClock.split(' ')[0];

      if (startDate && dateStr < startDate) return;
      if (endDate && dateStr > endDate) return;

      const normId = normalizeEmployeeId(p.employeeId);
      const emp = empMap.get(p.employeeId) || (normId ? empMap.get(normId) : undefined);

      const empIdToUse = emp?.id || p.employeeId;
      const key = `${empIdToUse}_${dateStr}`;

      let entry = groupMap.get(key);
      if (!entry) {
        const rawNo = p.deviceUserId || empIdToUse;
        const cleanNo = rawNo.replace(/^EMP[-_]?/i, '') || rawNo;

        entry = {
          employeeNo: cleanNo,
          name: emp?.name || `Employee ${empIdToUse}`,
          department: emp?.department || 'General',
          section: emp?.section || '-',
          dateStr,
          bsDate: getNepaliDate(dateStr),
          formattedDate: formatDateVal(dateStr),
          rawWallTimes: []
        };
        groupMap.set(key, entry);
      }

      if (!entry.rawWallTimes.includes(cleanWallClock)) {
        entry.rawWallTimes.push(cleanWallClock);
      }
    });
  }

  // 2. Also process processedData (to catch all processed logs if punches array wasn't fully passed)
  if (processedData && processedData.length > 0) {
    processedData.forEach(d => {
      const dateStr = d.date;
      if (startDate && dateStr < startDate) return;
      if (endDate && dateStr > endDate) return;

      const logsToUse = (d.rawLogs && d.rawLogs.length > 0) ? d.rawLogs : d.logs;
      if (!logsToUse || logsToUse.length === 0) return;

      const emp = empMap.get(d.employeeId);
      const key = `${d.employeeId}_${dateStr}`;

      let entry = groupMap.get(key);
      if (!entry) {
        const cleanNo = d.employeeId.replace(/^EMP[-_]?/i, '') || d.employeeId;

        entry = {
          employeeNo: cleanNo,
          name: emp?.name || d.employeeName || d.employeeId,
          department: emp?.department || d.department || 'General',
          section: emp?.section || '-',
          dateStr,
          bsDate: getNepaliDate(dateStr),
          formattedDate: formatDateVal(dateStr),
          rawWallTimes: []
        };
        groupMap.set(key, entry);
      }

      if (entry.rawWallTimes.length === 0) {
        logsToUse.forEach(l => {
          const clean = toDeviceWallClockIso(l);
          if (clean && !entry!.rawWallTimes.includes(clean)) {
            entry!.rawWallTimes.push(clean);
          }
        });
      }
    });
  }

  let rows: ZkBioDataRow[] = Array.from(groupMap.values()).map(g => {
    const sortedTimes = [...g.rawWallTimes].sort();
    const formattedTimes = sortedTimes.map(t => formatAMPM(t));
    return {
      employeeNo: g.employeeNo,
      name: g.name,
      department: g.department,
      section: g.section,
      dateStr: g.dateStr,
      bsDate: g.bsDate,
      formattedDate: g.formattedDate,
      punchCount: sortedTimes.length,
      timeString: formattedTimes.join(', ')
    };
  });

  if (deptFilter && deptFilter.length > 0 && !deptFilter.includes('All')) {
    rows = rows.filter(r => deptFilter.includes(r.department));
  }

  if (sectionFilter && sectionFilter.length > 0 && !sectionFilter.includes('All')) {
    rows = rows.filter(r => sectionFilter.includes(r.section));
  }

  if (searchTerm) {
    const s = searchTerm.toLowerCase();
    rows = rows.filter(r =>
      r.name.toLowerCase().includes(s) ||
      r.employeeNo.toLowerCase().includes(s) ||
      r.department.toLowerCase().includes(s) ||
      r.section.toLowerCase().includes(s) ||
      r.timeString.toLowerCase().includes(s)
    );
  }

  rows.sort((a, b) => {
    if (a.department !== b.department) {
      return a.department.localeCompare(b.department);
    }
    const numA = parseInt(a.employeeNo, 10);
    const numB = parseInt(b.employeeNo, 10);
    if (!isNaN(numA) && !isNaN(numB)) {
      if (numA !== numB) return numA - numB;
    } else {
      if (a.employeeNo !== b.employeeNo) return a.employeeNo.localeCompare(b.employeeNo);
    }
    return a.dateStr.localeCompare(b.dateStr);
  });

  return rows;
}

export function exportZkBioDataExcel(
  rows: ZkBioDataRow[],
  companyName: string = 'ZKTeco',
  meta?: IsoDocumentMeta
) {
  const wb = XLSX.utils.book_new();

  if (meta) {
    const docControlRows = [
      { Field: 'Document ID', Value: meta.documentId },
      { Field: 'Standard Reference', Value: meta.standardReference },
      { Field: 'Classification', Value: meta.classification },
      { Field: 'Organization', Value: meta.organization },
      { Field: 'Report Title', Value: meta.reportTitle },
      { Field: 'Reporting Period (ISO 8601)', Value: `${meta.periodStart} to ${meta.periodEnd}` },
      { Field: 'Data Scope', Value: meta.scopeSummary },
      { Field: 'Prepared By', Value: meta.preparedBy },
      { Field: 'Generated At (ISO 8601)', Value: meta.generatedAtIso },
      { Field: 'Total Records', Value: rows.length }
    ];
    const wsMeta = XLSX.utils.json_to_sheet(docControlRows);
    wsMeta['!cols'] = [{ wch: 30 }, { wch: 56 }];
    XLSX.utils.book_append_sheet(wb, wsMeta, '1_ISO_Document_Control');
  }

  const exportObjects = rows.map(r => ({
    'Employee No.': r.employeeNo,
    'Name': r.name,
    'Department': r.department,
    'Section': r.section,
    'BS Date': r.bsDate,
    'Date': r.formattedDate,
    'Punch Count': r.punchCount,
    'Time Sequence': r.timeString
  }));

  const ws = XLSX.utils.json_to_sheet(exportObjects);
  ws['!cols'] = [
    { wch: 14 },
    { wch: 28 },
    { wch: 20 },
    { wch: 18 },
    { wch: 14 },
    { wch: 14 },
    { wch: 12 },
    { wch: 70 }
  ];
  if (ws['!ref']) {
    ws['!autofilter'] = { ref: ws['!ref'] };
  }

  XLSX.utils.book_append_sheet(wb, ws, 'Biometric_Punch_Log');
  XLSX.writeFile(wb, `${companyName}_ISO_ZKT_BioData_${format(new Date(), 'yyyyMMdd')}.xlsx`);
}

export function exportZkBioDataCSV(rows: ZkBioDataRow[], companyName: string = 'ZKTeco') {
  const exportObjects = rows.map(r => ({
    'Employee No.': r.employeeNo,
    'Name': r.name,
    'Department': r.department,
    'Section': r.section,
    'BS Date': r.bsDate,
    'Date': r.formattedDate,
    'Punch Count': r.punchCount,
    'Time Sequence': r.timeString
  }));

  const ws = XLSX.utils.json_to_sheet(exportObjects);
  const csvContent = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', `${companyName}_ISO_ZKT_BioData_${format(new Date(), 'yyyyMMdd')}.csv`);
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportZkBioDataPDF(
  rows: ZkBioDataRow[],
  companyName: string = 'ZKTeco',
  meta?: IsoDocumentMeta
) {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 8;

  if (meta) {
    doc.setFillColor(15, 23, 42);
    doc.rect(marginX, 7, pageWidth - marginX * 2, 16, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(255, 255, 255);
    doc.text(meta.organization.toUpperCase(), marginX + 4, 13);
    doc.setFontSize(9.5);
    doc.setTextColor(203, 213, 225);
    doc.text(meta.reportTitle, marginX + 4, 19);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(226, 232, 240);
    doc.text(`DOC ID: ${meta.documentId}`, pageWidth - marginX - 4, 12, { align: 'right' });
    doc.text(meta.classification, pageWidth - marginX - 4, 16.5, { align: 'right' });
    doc.text(meta.standardReference, pageWidth - marginX - 4, 21, { align: 'right' });

    doc.setDrawColor(203, 213, 225);
    doc.setFillColor(248, 250, 252);
    doc.rect(marginX, 24, pageWidth - marginX * 2, 10, 'FD');
    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.text(`Period: ${meta.periodStart} to ${meta.periodEnd} | Scope: ${meta.scopeSummary}`, marginX + 3, 29.8);
    doc.text(`Prepared By: ${meta.preparedBy} | Generated: ${meta.generatedAtIso}`, pageWidth - marginX - 3, 29.8, { align: 'right' });
  } else {
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59);
    doc.text(`${companyName.toUpperCase()} - ZKT BIOMETRIC BIO DATA REPORT`, pageWidth / 2, 12, { align: 'center' });
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text(`Generated On: ${format(new Date(), 'yyyy-MM-dd HH:mm:ss')} | Total Records: ${rows.length}`, pageWidth / 2, 17, { align: 'center' });
  }

  const head = [['Emp No.', 'Name', 'Department', 'Section', 'BS Date', 'Date', 'Count', 'Time Sequence']];
  const body = rows.map(r => [
    r.employeeNo,
    r.name,
    r.department,
    r.section,
    r.bsDate,
    r.formattedDate,
    String(r.punchCount),
    r.timeString
  ]);

  autoTable(doc, {
    startY: meta ? 37 : 23,
    head,
    body,
    theme: 'grid',
    headStyles: {
      fillColor: [30, 41, 59],
      textColor: [255, 255, 255],
      fontSize: 7.5,
      fontStyle: 'bold',
      halign: 'left',
      cellPadding: 1.5
    },
    bodyStyles: {
      fontSize: 7,
      textColor: [30, 41, 59],
      cellPadding: 1.3,
      valign: 'middle'
    },
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: 38 },
      2: { cellWidth: 28 },
      3: { cellWidth: 26 },
      4: { cellWidth: 18, halign: 'center' },
      5: { cellWidth: 22, halign: 'center' },
      6: { cellWidth: 14, halign: 'center' },
      7: { cellWidth: 'auto' }
    },
    margin: { left: marginX, right: marginX, top: 10, bottom: 14 },
    showHead: 'everyPage'
  });

  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(203, 213, 225);
    doc.line(marginX, pageHeight - 10.5, pageWidth - marginX, pageHeight - 10.5);
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    if (meta) {
      doc.text(`${meta.documentId} · ${meta.standardReference}`, marginX, pageHeight - 6.5);
    }
    doc.text(`ISO 216 A4 · Page ${i} of ${pageCount}`, pageWidth - marginX, pageHeight - 6.5, { align: 'right' });
  }

  doc.save(`${companyName}_ISO_ZKT_BioData_${format(new Date(), 'yyyyMMdd')}.pdf`);
}
