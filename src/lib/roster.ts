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

export function generateRosterTemplate() {
  const currentMonth = new Date();
  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const headers = ['Employee ID', 'Employee Name', 'Department'];
  for (let day = 1; day <= daysInMonth; day++) {
    headers.push(format(new Date(year, month, day), 'yyyy-MM-dd'));
  }

  const sampleData = [
    ['Roster Template - ' + format(currentMonth, 'MMMM yyyy')],
    headers,
    ['3058', 'Mukesh Kumar', 'RA Energy', 'DAY', 'DAY', 'DAY', 'DAY', 'DAY', 'DO', 'DO'],
    ['1246', 'Hemant Dahal', 'HR/Admin', 'A', 'A', 'A', 'B', 'B', 'DO', 'DO'],
    ['4012', 'Sita Dev', 'Quality', 'C', 'C', 'C', 'NIGHT', 'NIGHT', 'DO', 'DO']
  ];

  const ws = XLSX.utils.aoa_to_sheet(sampleData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Roster");
  return wb;
}
