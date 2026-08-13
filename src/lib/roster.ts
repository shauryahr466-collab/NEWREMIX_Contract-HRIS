import * as XLSX from 'xlsx';
import { format, parse, isValid } from 'date-fns';

export interface RosterRecord {
  date: string;
  employeeId: string;
  employeeName: string;
  shiftCode: string;
  shiftIn: string;
  shiftOut: string;
  isCrossover: boolean;
}

const SHIFT_MAP: Record<string, { in: string; out: string; crossover: boolean }> = {
  'A': { in: '06:00', out: '14:00', crossover: false },
  'B': { in: '14:00', out: '22:00', crossover: false },
  'C': { in: '22:00', out: '06:00', crossover: true },
  'D': { in: '08:00', out: '20:00', crossover: false },
  'N': { in: '20:00', out: '08:00', crossover: true },
  'DAY': { in: '08:00', out: '20:00', crossover: false },
  'NIGHT': { in: '20:00', out: '08:00', crossover: true },
  'GSD': { in: '06:00', out: '18:00', crossover: false },
  'GSN': { in: '18:00', out: '06:00', crossover: true },
  'OFFICE': { in: '10:00', out: '18:00', crossover: false },
  'G': { in: '09:00', out: '18:00', crossover: false },
  'DO': { in: '', out: '', crossover: false },
  'OFF': { in: '', out: '', crossover: false },
};

/**
 * Processes a matrix roster from an Excel sheet.
 * Supports:
 * 1. Horizontal Dates: Row 2 has dates, Rows 3+ have employees.
 * 2. Vertical Dates: Column A has dates, Row 2 has employee IDs.
 */
export async function processRosterUpload(sheetData: any[][]): Promise<RosterRecord[]> {
  if (sheetData.length < 2) {
    throw new Error('Invalid sheet format. Requires at least a header row and data.');
  }

  // Detect Orientation
  const row2 = sheetData[1] || [];
  const colA = sheetData.map(r => r[0]);

  const row2HasDates = row2.some(val => isValueADate(val));
  const colAHasDates = colA.some(val => isValueADate(val));

  if (colAHasDates && !row2HasDates) {
    return processVerticalRoster(sheetData);
  }

  return processHorizontalRoster(sheetData);
}

function isValueADate(val: any): boolean {
  if (typeof val === 'number') {
    const dateObj = new Date(Math.round((val - 25569) * 864e5));
    return isValid(dateObj) && dateObj.getFullYear() > 2000;
  }
  if (typeof val === 'string') {
    const parsed = new Date(val);
    return isValid(parsed) && parsed.getFullYear() > 2000;
  }
  return false;
}

function formatDateValue(val: any): string {
  if (typeof val === 'number') {
    return format(new Date(Math.round((val - 25569) * 864e5)), 'yyyy-MM-dd');
  }
  return format(new Date(val), 'yyyy-MM-dd');
}

/** Original Horizontal Logic */
async function processHorizontalRoster(sheetData: any[][]): Promise<RosterRecord[]> {
  const headers = sheetData[1]; // Row 2
  const dataRows = sheetData.slice(2); // Row 3 onwards

  const dateColumns: { index: number; date: string }[] = [];
  for (let i = 3; i < headers.length; i++) {
    if (isValueADate(headers[i])) {
      dateColumns.push({ index: i, date: formatDateValue(headers[i]) });
    }
  }

  if (dateColumns.length === 0) {
    throw new Error('No valid date headers found starting from Column D.');
  }

  const result: RosterRecord[] = [];
  for (const row of dataRows) {
    const employeeId = String(row[0] || '').trim();
    const employeeName = String(row[1] || '').trim();
    if (!employeeId) continue;

    for (const col of dateColumns) {
      const shiftCode = String(row[col.index] || '').trim().toUpperCase();
      if (!shiftCode) continue;

      const shiftInfo = SHIFT_MAP[shiftCode] || { in: '09:00', out: '18:00', crossover: false };
      result.push({
        date: col.date,
        employeeId,
        employeeName,
        shiftCode,
        shiftIn: shiftInfo.in,
        shiftOut: shiftInfo.out,
        isCrossover: shiftInfo.crossover
      });
    }
  }
  return result;
}

/** Vertical orientation: Dates in Col A, Employees in Row 2 (Headers) */
async function processVerticalRoster(sheetData: any[][]): Promise<RosterRecord[]> {
  const headerRow = sheetData[1]; // Row 2 has Emp IDs
  const dataRows = sheetData.slice(2); // Row 3 onwards have dates and shifts

  const empColumns: { index: number; id: string }[] = [];
  for (let i = 1; i < headerRow.length; i++) {
    const id = String(headerRow[i] || '').trim();
    if (id) empColumns.push({ index: i, id });
  }

  if (empColumns.length === 0) {
    throw new Error('No valid Employee IDs found in Row 2.');
  }

  const result: RosterRecord[] = [];
  for (const row of dataRows) {
    if (!isValueADate(row[0])) continue;
    const dateStr = formatDateValue(row[0]);

    for (const emp of empColumns) {
      const shiftCode = String(row[emp.index] || '').trim().toUpperCase();
      if (!shiftCode) continue;

      const shiftInfo = SHIFT_MAP[shiftCode] || { in: '09:00', out: '18:00', crossover: false };
      result.push({
        date: dateStr,
        employeeId: emp.id,
        employeeName: emp.id, // Fallback name
        shiftCode,
        shiftIn: shiftInfo.in,
        shiftOut: shiftInfo.out,
        isCrossover: shiftInfo.crossover
      });
    }
  }
  return result;
}

export function generateRosterTemplate(startDateStr?: string, endDateStr?: string, employeesList: any[] = []) {
  let dateList: string[] = [];

  if (startDateStr && endDateStr) {
    const start = new Date(startDateStr);
    const end = new Date(endDateStr);
    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start <= end) {
      let curr = new Date(start);
      while (curr <= end) {
        dateList.push(format(curr, 'yyyy-MM-dd'));
        curr.setDate(curr.getDate() + 1);
      }
    }
  }

  if (dateList.length === 0) {
    const currentMonth = new Date();
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    for (let day = 1; day <= daysInMonth; day++) {
      dateList.push(format(new Date(year, month, day), 'yyyy-MM-dd'));
    }
  }

  const headers = ['Employee ID', 'Employee Name', 'Department', ...dateList];

  const rows: any[][] = [
    [`Roster Template (${dateList[0]} to ${dateList[dateList.length - 1]} - ${dateList.length} Days)`],
    headers
  ];

  if (employeesList && employeesList.length > 0) {
    employeesList.slice(0, 50).forEach((emp, i) => {
      // Shift pattern sample rotation A, B, C, DO
      const shiftPatterns = ['A', 'A', 'A', 'A', 'A', 'DO', 'DO', 'B', 'B', 'B', 'B', 'B', 'DO', 'DO'];
      const empRow = [emp.id, emp.name, emp.department || 'General'];
      dateList.forEach((_, idx) => {
        empRow.push(shiftPatterns[(idx + i) % shiftPatterns.length]);
      });
      rows.push(empRow);
    });
  } else {
    // Default sample employees with Bio ID / numeric Employee ID
    const sampleEmps = [
      ['2', 'Rajesh Sharma', 'Production'],
      ['1256', 'Mukesh Kumar', 'RA Energy'],
      ['3058', 'Hemant Dahal', 'HR/Admin'],
      ['4012', 'Sita Dev', 'Quality']
    ];
    sampleEmps.forEach((emp, i) => {
      const shiftPatterns = ['A', 'A', 'A', 'A', 'A', 'DO', 'DO'];
      const empRow = [...emp];
      dateList.forEach((_, idx) => {
        empRow.push(shiftPatterns[idx % shiftPatterns.length]);
      });
      rows.push(empRow);
    });
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Roster");
  return wb;
}
