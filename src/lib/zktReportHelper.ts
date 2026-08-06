import { format, parseISO } from 'date-fns';
import type { RawPunch, Employee, ProcessedAttendance } from '../types';
import { formatAMPM, normalizeEmployeeId } from './utils';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface ZkBioDataRow {
  employeeNo: string;
  name: string;
  department: string;
  dateStr: string;
  formattedDate: string; // e.g. "8/3/2026"
  timeString: string;    // e.g. "8:03 AM, 8:03 AM, 4:00 PM, 6:00 PM"
}

export function generateZkBioDataRows(
  punches: RawPunch[],
  employees: Employee[],
  processedData: ProcessedAttendance[],
  startDate?: string,
  endDate?: string,
  deptFilter?: string[],
  searchTerm?: string
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
    dateStr: string;
    formattedDate: string;
    punchTimes: string[];
  }>();

  // 1. Process raw punches if present
  if (punches && punches.length > 0) {
    punches.forEach(p => {
      if (!p.punchDatetime) return;
      const cleanIso = String(p.punchDatetime).replace(' ', 'T');
      const dateStr = cleanIso.includes('T') ? cleanIso.split('T')[0] : cleanIso.split(' ')[0];
      
      if (startDate && dateStr < startDate) return;
      if (endDate && dateStr > endDate) return;

      const normId = normalizeEmployeeId(p.employeeId);
      const emp = empMap.get(p.employeeId) || (normId ? empMap.get(normId) : undefined);

      const empIdToUse = emp?.id || p.employeeId;
      const key = `${empIdToUse}_${dateStr}`;

      let parsedDate = parseISO(cleanIso);
      if (isNaN(parsedDate.getTime())) parsedDate = new Date(cleanIso);
      if (isNaN(parsedDate.getTime())) return;

      const timeStr = formatAMPM(parsedDate.toISOString());

      let entry = groupMap.get(key);
      if (!entry) {
        let fDate = dateStr;
        try {
          fDate = format(parseISO(dateStr), 'M/d/yyyy');
        } catch {
          fDate = dateStr;
        }

        const rawNo = p.deviceUserId || empIdToUse;
        const cleanNo = rawNo.replace(/^EMP[-_]?/i, '') || rawNo;

        entry = {
          employeeNo: cleanNo,
          name: emp?.name || `Employee ${empIdToUse}`,
          department: emp?.department || 'General',
          dateStr,
          formattedDate: fDate,
          punchTimes: []
        };
        groupMap.set(key, entry);
      }

      entry.punchTimes.push(timeStr);
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
        let fDate = dateStr;
        try {
          fDate = format(parseISO(dateStr), 'M/d/yyyy');
        } catch {
          fDate = dateStr;
        }

        const cleanNo = d.employeeId.replace(/^EMP[-_]?/i, '') || d.employeeId;

        entry = {
          employeeNo: cleanNo,
          name: emp?.name || d.employeeId,
          department: emp?.department || 'General',
          dateStr,
          formattedDate: fDate,
          punchTimes: []
        };
        groupMap.set(key, entry);
      }

      if (entry.punchTimes.length === 0) {
        logsToUse.forEach(l => {
          const tStr = formatAMPM(l);
          if (tStr) entry!.punchTimes.push(tStr);
        });
      }
    });
  }

  // Convert to rows array
  let rows: ZkBioDataRow[] = Array.from(groupMap.values()).map(g => ({
    employeeNo: g.employeeNo,
    name: g.name,
    department: g.department,
    dateStr: g.dateStr,
    formattedDate: g.formattedDate,
    timeString: g.punchTimes.join(', ')
  }));

  // Apply Department Filter
  if (deptFilter && deptFilter.length > 0 && !deptFilter.includes('All')) {
    rows = rows.filter(r => deptFilter.includes(r.department));
  }

  // Apply Search
  if (searchTerm) {
    const s = searchTerm.toLowerCase();
    rows = rows.filter(r => 
      r.name.toLowerCase().includes(s) ||
      r.employeeNo.toLowerCase().includes(s) ||
      r.department.toLowerCase().includes(s) ||
      r.timeString.toLowerCase().includes(s)
    );
  }

  // Sort by Department -> Employee No (numeric ascending) -> Date
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

export function exportZkBioDataExcel(rows: ZkBioDataRow[], companyName: string = 'ZKTeco') {
  const exportObjects = rows.map(r => ({
    'Employee No.': r.employeeNo,
    'Name': r.name,
    'Department': r.department,
    'Date': r.formattedDate,
    'Time': r.timeString
  }));

  const ws = XLSX.utils.json_to_sheet(exportObjects);
  
  // Custom column widths to mirror the Excel screenshot exactly
  ws['!cols'] = [
    { wch: 15 }, // Employee No.
    { wch: 28 }, // Name
    { wch: 20 }, // Department
    { wch: 15 }, // Date
    { wch: 75 }  // Time
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Bio Data Log");
  XLSX.writeFile(wb, `${companyName}_ZKT_BioData_Automation.xlsx`);
}

export function exportZkBioDataCSV(rows: ZkBioDataRow[], companyName: string = 'ZKTeco') {
  const exportObjects = rows.map(r => ({
    'Employee No.': r.employeeNo,
    'Name': r.name,
    'Department': r.department,
    'Date': r.formattedDate,
    'Time': r.timeString
  }));

  const ws = XLSX.utils.json_to_sheet(exportObjects);
  const csvContent = XLSX.utils.sheet_to_csv(ws);
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `${companyName}_ZKT_BioData_Automation.csv`);
  link.click();
}

export function exportZkBioDataPDF(rows: ZkBioDataRow[], companyName: string = 'ZKTeco') {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(30, 41, 59);
  doc.text(`${companyName.toUpperCase()} - ZKT BIOMETRIC BIO DATA REPORT`, pageWidth / 2, 12, { align: 'center' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text(`Generated On: ${format(new Date(), 'dd/MM/yyyy HH:mm')} | Total Records: ${rows.length}`, pageWidth / 2, 17, { align: 'center' });

  doc.setDrawColor(200, 200, 200);
  doc.line(8, 20, pageWidth - 8, 20);

  const head = [['Employee No.', 'Name', 'Department', 'Date', 'Time']];
  const body = rows.map(r => [
    r.employeeNo,
    r.name,
    r.department,
    r.formattedDate,
    r.timeString
  ]);

  autoTable(doc, {
    startY: 23,
    head,
    body,
    theme: 'striped',
    headStyles: {
      fillColor: [30, 58, 138], // Dark Blue / ZKT style
      textColor: [255, 255, 255],
      fontSize: 9,
      fontStyle: 'bold',
      halign: 'left',
      cellPadding: 2
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [30, 41, 59],
      cellPadding: 2,
      valign: 'middle'
    },
    columnStyles: {
      0: { cellWidth: 25 },
      1: { cellWidth: 50 },
      2: { cellWidth: 40 },
      3: { cellWidth: 25 },
      4: { cellWidth: 'auto' }
    },
    margin: { left: 8, right: 8, top: 10, bottom: 15 }
  });

  const pageCount = (doc as any).internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    const footerY = doc.internal.pageSize.getHeight() - 8;
    doc.text(`Page ${i} of ${pageCount}`, pageWidth - 8, footerY, { align: 'right' });
  }

  doc.save(`${companyName}_ZKT_BioData_Report.pdf`);
}
