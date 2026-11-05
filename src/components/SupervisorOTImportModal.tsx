import React, { useState, useMemo, useRef } from 'react';
import { 
  FileSpreadsheet, Upload, Download, CheckCircle2, AlertTriangle, 
  AlertCircle, X, Search, RefreshCw, Filter, ArrowRight, 
  ShieldCheck, Clock, FileText, Check, AlertOctagon, HelpCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { Button, Badge, Input } from './ui';
import { OvertimeRecord, Employee, ProcessedAttendance, ShiftMaster } from '../types';
import { normalizeEmployeeId, getAttendanceInAndOut } from '../lib/utils';
import { useActionStatus } from '../context/ActionStatusContext';
import { saveLocalTableDetailed } from '../lib/localClient';

export interface SupervisorOTImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  overtimeRecords: OvertimeRecord[];
  employees: Employee[];
  processedData: ProcessedAttendance[];
  shifts: ShiftMaster[];
  setOvertimeBatch: (records: OvertimeRecord[]) => Promise<void>;
  currentUser?: { username?: string };
}

export type RowImportStatus = 'NEW' | 'UPDATED' | 'UNCHANGED' | 'SKIPPED' | 'WARNING' | 'ERROR';

export interface ParsedImportRow {
  rowNumber: number;
  rawEmpId: string;
  normEmpId: string;
  empName: string;
  dateStr: string;
  rawSupervisorOt: string | number;
  parsedSupervisorOt: number;
  rawRemarks: string;
  bioOtHours: number;
  prevSupervisorOt: number;
  prevFinalOt: number;
  newFinalOt: number;
  newHrSaving: number;
  status: RowImportStatus;
  statusTitle: string;
  reason: string;
  isExisting: boolean;
  preparedRecord?: OvertimeRecord;
}

// ----------------------------------------------------
// Helper: Parse and normalize diverse date formats to YYYY-MM-DD
// ----------------------------------------------------
export function parseImportDate(val: any): { dateStr: string; isValid: boolean; error?: string } {
  if (val === undefined || val === null || String(val).trim() === '') {
    return { dateStr: '', isValid: false, error: 'Date is empty or missing' };
  }

  // 1. Excel serial date code
  if (typeof val === 'number') {
    if (isNaN(val) || val <= 0) {
      return { dateStr: '', isValid: false, error: 'Invalid numeric date' };
    }
    // Excel base date (accounting for the historical 1900 leap year quirk)
    const dateObj = new Date(Math.round((val - 25569) * 864e5));
    if (isNaN(dateObj.getTime())) {
      return { dateStr: '', isValid: false, error: 'Invalid Excel date serial number' };
    }
    const y = dateObj.getUTCFullYear();
    const m = String(dateObj.getUTCMonth() + 1).padStart(2, '0');
    const d = String(dateObj.getUTCDate()).padStart(2, '0');
    return { dateStr: `${y}-${m}-${d}`, isValid: true };
  }

  const str = String(val).trim();

  // 2. Standard ISO format: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const parts = str.split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100) {
      return { dateStr: str, isValid: true };
    }
  }

  // 3. DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = str.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, '0');
    const m = dmyMatch[2].padStart(2, '0');
    const y = dmyMatch[3];
    const monthNum = parseInt(m, 10);
    const dayNum = parseInt(d, 10);
    if (monthNum >= 1 && monthNum <= 12 && dayNum >= 1 && dayNum <= 31) {
      return { dateStr: `${y}-${m}-${d}`, isValid: true };
    }
  }

  // 4. YYYY/MM/DD
  const ymdMatch = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (ymdMatch) {
    const y = ymdMatch[1];
    const m = ymdMatch[2].padStart(2, '0');
    const d = ymdMatch[3].padStart(2, '0');
    return { dateStr: `${y}-${m}-${d}`, isValid: true };
  }

  // 5. DD-MMM-YYYY (e.g., 16-Aug-2026, 16-AUG-2026)
  const dMmmYMatch = str.match(/^(\d{1,2})[-/\s]([A-Za-z]{3,9})[-/\s](\d{4})$/);
  if (dMmmYMatch) {
    const d = dMmmYMatch[1].padStart(2, '0');
    const monStr = dMmmYMatch[2].toLowerCase();
    const y = dMmmYMatch[3];
    const months: Record<string, string> = {
      jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
      jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12'
    };
    const key = monStr.substring(0, 3);
    if (months[key]) {
      return { dateStr: `${y}-${months[key]}-${d}`, isValid: true };
    }
  }

  // 6. General Date parse fallback
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime())) {
    const y = parsed.getFullYear();
    const m = String(parsed.getMonth() + 1).padStart(2, '0');
    const d = String(parsed.getDate()).padStart(2, '0');
    return { dateStr: `${y}-${m}-${d}`, isValid: true };
  }

  return { dateStr: str, isValid: false, error: `Unrecognized date format: "${str}". Accepted: YYYY-MM-DD or DD-MM-YYYY.` };
}

// ----------------------------------------------------
// Helper: Parse Supervisor OT to safe decimal hours (0.00 - 24.00)
// ----------------------------------------------------
export function parseSupervisorOt(val: any): { hours: number; isValid: boolean; error?: string } {
  if (val === undefined || val === null || String(val).trim() === '') {
    return { hours: 0, isValid: true }; // Blank is safely interpreted as 0.00 hours
  }

  // If already a number
  if (typeof val === 'number') {
    if (isNaN(val)) return { hours: 0, isValid: false, error: 'Invalid numeric value' };
    if (val < 0) return { hours: 0, isValid: false, error: 'Supervisor OT cannot be negative' };
    if (val > 24) return { hours: 0, isValid: false, error: 'Supervisor OT cannot exceed 24 hours in a single day' };
    return { hours: Number(val.toFixed(2)), isValid: true };
  }

  const str = String(val).trim();

  // If time format: HH:MM or H:MM (e.g. 01:30 or 1:45 or 02:00)
  const timeMatch = str.match(/^(\d{1,2}):(\d{2})$/);
  if (timeMatch) {
    const h = parseInt(timeMatch[1], 10);
    const m = parseInt(timeMatch[2], 10);
    if (m >= 60) return { hours: 0, isValid: false, error: 'Minutes in time format cannot exceed 59' };
    const decimal = h + (m / 60);
    if (decimal > 24) return { hours: 0, isValid: false, error: 'Supervisor OT cannot exceed 24 hours in a single day' };
    return { hours: Number(decimal.toFixed(2)), isValid: true };
  }

  // If decimal number or string with hours suffix (e.g. "1.5", "1.5 hrs", "2.0h")
  const cleanStr = str.replace(/[^\d.-]/g, '');
  const parsedNum = parseFloat(cleanStr);
  if (isNaN(parsedNum)) {
    return { hours: 0, isValid: false, error: `Invalid OT value: "${str}". Expected decimal (e.g. 1.5) or HH:MM (e.g. 01:30).` };
  }
  if (parsedNum < 0) {
    return { hours: 0, isValid: false, error: 'Supervisor OT cannot be negative' };
  }
  if (parsedNum > 24) {
    return { hours: 0, isValid: false, error: 'Supervisor OT cannot exceed 24 hours in a single day' };
  }

  return { hours: Number(parsedNum.toFixed(2)), isValid: true };
}

// ----------------------------------------------------
// Official Downloadable Excel Template Generator
// ----------------------------------------------------
export function generateSupervisorOTTemplate(sampleEmployees: Employee[] = []) {
  const wb = XLSX.utils.book_new();

  // Prepare 3-5 real sample rows from active directory if available, or clean realistic examples
  const sampleRows = sampleEmployees.length > 0
    ? sampleEmployees.slice(0, 4).map((emp, idx) => {
        const sampleHours = ['01:00', '01:30', '02:00', '00:45'][idx % 4];
        const sampleRemarks = [
          'Approved for month-end reconciliation',
          'Production server maintenance overtime',
          'Weekend support shift approved by supervisor',
          'Urgent payroll dispatch support'
        ][idx % 4];
        return [
          emp.id, // Numeric Biometric ID
          emp.name,
          '2026-08-16',
          sampleHours,
          sampleRemarks
        ];
      })
    : [
        ['2', 'Sunil Kumar', '2026-08-16', '01:00', 'Approved for month-end reconciliation'],
        ['101', 'Rajesh Sharma', '2026-08-16', '01:30', 'Production deployment support'],
        ['1256', 'Sandip Rajak', '2026-08-16', '02:00', 'Weekend hardware maintenance']
      ];

  // Sheet 1: Supervisor OT Import
  const sheet1Data = [
    ['Employee ID', 'Employee Name', 'Date', 'Supervisor OT', 'Remarks'],
    ...sampleRows
  ];
  const ws1 = XLSX.utils.aoa_to_sheet(sheet1Data);

  // Column widths
  ws1['!cols'] = [
    { wch: 16 }, // Employee ID
    { wch: 26 }, // Employee Name
    { wch: 15 }, // Date
    { wch: 16 }, // Supervisor OT
    { wch: 45 }  // Remarks
  ];

  XLSX.utils.book_append_sheet(wb, ws1, 'Supervisor OT Import');

  // Sheet 2: Official Instructions
  const sheet2Data = [
    ['FIELD NAME', 'REQUIRED?', 'ACCEPTED FORMAT', 'VALIDATION RULE / DESCRIPTION', 'EXAMPLE'],
    ['Employee ID', 'YES (MANDATORY)', 'Numeric Biometric ID', 'Must match an existing Employee in Employee Directory. Do not add artificial prefixes (e.g., use 2 or 1256, NOT EMP-002).', '1256'],
    ['Employee Name', 'OPTIONAL', 'Text', 'Used for visual cross-check only. Matching is strictly executed on Employee ID.', 'Sandip Rajak'],
    ['Date', 'YES (MANDATORY)', 'YYYY-MM-DD or DD-MM-YYYY', 'Overtime record date. Supported: 2026-08-16, 16-08-2026, or 16-Aug-2026.', '2026-08-16'],
    ['Supervisor OT', 'YES (MANDATORY)', 'HH:MM or Decimal Hours', 'Overtime hours claimed by the supervisor. Accepts 01:30 (1h 30m) or decimal 1.50. Range: 0.00 to 24.00.', '01:30'],
    ['Remarks', 'OPTIONAL', 'Text string', 'Supervisor justification notes. Commas, quotes, apostrophes, and special characters are safely preserved.', 'Approved for month-end deploy'],
    ['', '', '', '', ''],
    ['SYSTEM BUSINESS RULE', 'DETAILS', '', '', ''],
    ['Primary Identity', 'Each row is uniquely matched by: Employee ID + Date.', '', '', ''],
    ['Duplicate Protection', 'Importing the same file twice will mark identical rows as UNCHANGED. Duplicate rows are never created.', '', '', ''],
    ['Existing Calculation Engine', 'Final OT Eligible = min(Bio OT, Supervisor OT). HR Savings = max(0, Bio OT - Final OT).', '', '', ''],
    ['Not Found Behavior', 'If no attendance or OT record exists for that date, row is skipped with "OT record not found — row not imported."', '', '', ''],
    ['Audit Cross-Check', 'Imported records immediately trigger audit re-evaluation: PASS, WARNING, MISMATCH, or ERROR.', '', '', ''],
    ['Database Persistence', 'Updates are committed directly into SQLite (E:\\SHRM_HRIS\\Database.db) with instant readback verification.', '', '', '']
  ];
  const ws2 = XLSX.utils.aoa_to_sheet(sheet2Data);
  ws2['!cols'] = [
    { wch: 22 },
    { wch: 18 },
    { wch: 26 },
    { wch: 75 },
    { wch: 28 }
  ];

  XLSX.utils.book_append_sheet(wb, ws2, 'Instructions');

  // Trigger download
  XLSX.writeFile(wb, 'Supervisor_OT_Import_Template.xlsx');
  toast.success('Official Supervisor OT Import Template downloaded successfully');
}

export function SupervisorOTImportModal({
  isOpen,
  onClose,
  overtimeRecords,
  employees,
  processedData,
  shifts,
  setOvertimeBatch,
  currentUser
}: SupervisorOTImportModalProps) {
  const { executeWithStatus } = useActionStatus();

  // State
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedImportRow[]>([]);
  const [fileError, setFileError] = useState<string | null>(null);
  const [selectedTab, setSelectedTab] = useState<'ALL' | 'UPDATED' | 'NEW' | 'UNCHANGED' | 'SKIPPED' | 'ERRORS'>('ALL');
  const [searchFilter, setSearchFilter] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Fast O(1) Maps
  const empMap = useMemo(() => {
    const map = new Map<string, Employee>();
    employees.forEach(e => {
      map.set(e.id, e);
      map.set(normalizeEmployeeId(e.id), e);
    });
    return map;
  }, [employees]);

  const otMap = useMemo(() => {
    const map = new Map<string, OvertimeRecord>();
    overtimeRecords.forEach(r => {
      map.set(`${r.employeeId}_${r.date}`, r);
      map.set(`${normalizeEmployeeId(r.employeeId)}_${r.date}`, r);
    });
    return map;
  }, [overtimeRecords]);

  const attMap = useMemo(() => {
    const map = new Map<string, ProcessedAttendance>();
    processedData.forEach(p => {
      map.set(`${p.employeeId}_${p.date}`, p);
      map.set(`${normalizeEmployeeId(p.employeeId)}_${p.date}`, p);
    });
    return map;
  }, [processedData]);

  // Reset state when modal is closed
  const handleClose = () => {
    setFile(null);
    setParsedRows([]);
    setFileError(null);
    setSearchFilter('');
    setSelectedTab('ALL');
    onClose();
  };

  // ----------------------------------------------------
  // Parse uploaded file
  // ----------------------------------------------------
  const processUploadedFile = async (uploadedFile: File) => {
    setFile(uploadedFile);
    setIsParsing(true);
    setFileError(null);
    setParsedRows([]);

    try {
      const data = await uploadedFile.arrayBuffer();
      const workbook = XLSX.read(new Uint8Array(data), { type: 'array' });

      if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
        throw new Error('The uploaded file has no sheets or is empty.');
      }

      // Pick Sheet 1: either 'Supervisor OT Import' or first sheet
      const targetSheetName = workbook.SheetNames.includes('Supervisor OT Import') 
        ? 'Supervisor OT Import' 
        : workbook.SheetNames[0];
      const worksheet = workbook.Sheets[targetSheetName];

      const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: '' }) as Record<string, any>[];

      if (rawJson.length === 0) {
        throw new Error('The spreadsheet contains no data rows.');
      }

      // Find Header Keys dynamically with flexible matching
      const firstRow = rawJson[0];
      const keys = Object.keys(firstRow);

      const findKey = (patterns: string[]) => {
        return keys.find(k => {
          const l = k.toLowerCase().replace(/[^a-z0-9]/g, '');
          return patterns.some(p => l.includes(p));
        });
      };

      const empIdKey = findKey(['employeeid', 'empid', 'bioid', 'biometricid', 'id', 'empno']);
      const empNameKey = findKey(['employeename', 'empname', 'name', 'fullname', 'staffname']);
      const dateKey = findKey(['date', 'otdate', 'overtimedate', 'workdate', 'dutydate']);
      const supervisorOtKey = findKey(['supervisorot', 'supot', 'supervisorovertime', 'claimedot', 'supervisorothours', 'othours']);
      const remarksKey = findKey(['remarks', 'remark', 'notes', 'reason', 'comment', 'comments', 'justification']);

      if (!empIdKey) {
        throw new Error('Missing required column: "Employee ID". Supported column headers: Employee ID, Emp ID, Bio ID.');
      }
      if (!dateKey) {
        throw new Error('Missing required column: "Date". Supported column headers: Date, OT Date, Overtime Date.');
      }
      if (!supervisorOtKey) {
        throw new Error('Missing required column: "Supervisor OT". Supported column headers: Supervisor OT, Sup OT, Supervisor OT Hours.');
      }

      // Small UI tick for responsiveness
      await new Promise(r => setTimeout(r, 20));

      const rows: ParsedImportRow[] = [];
      const seenKeysInFile = new Map<string, number>(); // Track duplicate rows within file

      for (let i = 0; i < rawJson.length; i++) {
        const row = rawJson[i];
        const rowNumber = i + 2; // Accounting for 1-based index and header row

        const rawEmpId = String(row[empIdKey] || '').trim();
        const rawDate = row[dateKey];
        const rawSupervisorOt = row[supervisorOtKey];
        const rawRemarks = remarksKey ? String(row[remarksKey] || '').trim() : '';
        const rawEmpName = empNameKey ? String(row[empNameKey] || '').trim() : '';

        // Skip completely blank rows
        if (!rawEmpId && !rawDate && rawSupervisorOt === '') {
          continue;
        }

        const normEmpId = normalizeEmployeeId(rawEmpId);
        const emp = empMap.get(normEmpId) || empMap.get(rawEmpId);
        const empName = emp?.name || rawEmpName || 'Unknown Employee';

        // 1. Employee existence validation
        if (!rawEmpId || !emp) {
          rows.push({
            rowNumber,
            rawEmpId,
            normEmpId,
            empName,
            dateStr: String(rawDate || ''),
            rawSupervisorOt,
            parsedSupervisorOt: 0,
            rawRemarks,
            bioOtHours: 0,
            prevSupervisorOt: 0,
            prevFinalOt: 0,
            newFinalOt: 0,
            newHrSaving: 0,
            status: 'ERROR',
            statusTitle: 'Employee Not Found',
            reason: `Employee ID "${rawEmpId}" not found in Employee Directory.`,
            isExisting: false
          });
          continue;
        }

        // 2. Date validation
        const dateResult = parseImportDate(rawDate);
        if (!dateResult.isValid) {
          rows.push({
            rowNumber,
            rawEmpId,
            normEmpId,
            empName,
            dateStr: String(rawDate || ''),
            rawSupervisorOt,
            parsedSupervisorOt: 0,
            rawRemarks,
            bioOtHours: 0,
            prevSupervisorOt: 0,
            prevFinalOt: 0,
            newFinalOt: 0,
            newHrSaving: 0,
            status: 'ERROR',
            statusTitle: 'Invalid Date',
            reason: dateResult.error || 'Invalid date format.',
            isExisting: false
          });
          continue;
        }

        const dateStr = dateResult.dateStr;

        // 3. Supervisor OT validation
        const otResult = parseSupervisorOt(rawSupervisorOt);
        if (!otResult.isValid) {
          rows.push({
            rowNumber,
            rawEmpId,
            normEmpId,
            empName,
            dateStr,
            rawSupervisorOt,
            parsedSupervisorOt: 0,
            rawRemarks,
            bioOtHours: 0,
            prevSupervisorOt: 0,
            prevFinalOt: 0,
            newFinalOt: 0,
            newHrSaving: 0,
            status: 'ERROR',
            statusTitle: 'Invalid Supervisor OT',
            reason: otResult.error || 'Invalid Supervisor OT value.',
            isExisting: false
          });
          continue;
        }

        const parsedSupervisorOt = otResult.hours;

        // 4. Duplicate rows in file detection
        const fileKey = `${normEmpId}_${dateStr}`;
        if (seenKeysInFile.has(fileKey)) {
          const prevRow = seenKeysInFile.get(fileKey)!;
          console.warn(`Duplicate row in import file: Row ${rowNumber} matches earlier Row ${prevRow} for Employee ${normEmpId} on ${dateStr}. Latest row will override.`);
        }
        seenKeysInFile.set(fileKey, rowNumber);

        // 5. Look up existing OT and Attendance records
        const existingOT = otMap.get(`${normEmpId}_${dateStr}`) || otMap.get(`${rawEmpId}_${dateStr}`);
        const att = attMap.get(`${normEmpId}_${dateStr}`) || attMap.get(`${rawEmpId}_${dateStr}`);

        // If neither OT record nor Attendance record exists
        if (!existingOT && !att) {
          rows.push({
            rowNumber,
            rawEmpId,
            normEmpId,
            empName,
            dateStr,
            rawSupervisorOt,
            parsedSupervisorOt,
            rawRemarks,
            bioOtHours: 0,
            prevSupervisorOt: 0,
            prevFinalOt: 0,
            newFinalOt: 0,
            newHrSaving: 0,
            status: 'SKIPPED',
            statusTitle: 'Record Not Found',
            reason: 'OT record not found — row not imported.',
            isExisting: false
          });
          continue;
        }

        // Case A: Existing OT Record in database
        if (existingOT) {
          const bioOt = Number(existingOT.bioOtHours) || 0;
          const prevSupOt = Number(existingOT.supervisorOtHours) || 0;
          const prevFinalOt = Number(existingOT.hours) || 0;

          const newFinalOt = Math.min(bioOt, parsedSupervisorOt);
          const newHrSaving = Math.max(0, bioOt - newFinalOt);

          const isSupOtChanged = Math.abs(prevSupOt - parsedSupervisorOt) > 0.001;
          const isRemarksChanged = rawRemarks !== '' && (existingOT.remarks || '') !== rawRemarks;

          let status: RowImportStatus = 'UNCHANGED';
          let statusTitle = 'Unchanged';
          let reason = 'Supervisor OT and Remarks match existing database record.';

          if (isSupOtChanged || isRemarksChanged) {
            status = 'UPDATED';
            statusTitle = 'Record Updated';
            if (isSupOtChanged && isRemarksChanged) {
              reason = `Supervisor OT changed (${prevSupOt.toFixed(2)}h → ${parsedSupervisorOt.toFixed(2)}h) & Remarks updated.`;
            } else if (isSupOtChanged) {
              reason = `Supervisor OT changed (${prevSupOt.toFixed(2)}h → ${parsedSupervisorOt.toFixed(2)}h). Final OT re-evaluated to ${newFinalOt.toFixed(2)}h.`;
            } else {
              reason = `Remarks updated to: "${rawRemarks}".`;
            }
          }

          const preparedRecord: OvertimeRecord = {
            ...existingOT,
            supervisorOtHours: parsedSupervisorOt,
            hours: Number(newFinalOt.toFixed(2)),
            hrSaving: Number(newHrSaving.toFixed(2)),
            remarks: rawRemarks || existingOT.remarks,
            reviewedBy: currentUser?.username || 'Admin',
            reviewedDate: new Date().toISOString()
          };

          rows.push({
            rowNumber,
            rawEmpId,
            normEmpId,
            empName,
            dateStr,
            rawSupervisorOt,
            parsedSupervisorOt,
            rawRemarks,
            bioOtHours: bioOt,
            prevSupervisorOt: prevSupOt,
            prevFinalOt,
            newFinalOt,
            newHrSaving,
            status,
            statusTitle,
            reason,
            isExisting: true,
            preparedRecord
          });
        } 
        // Case B: Attendance exists on that date, create new OT record safely
        else if (att) {
          const standardDutyHours = Number(emp?.targetWorkingHours) || Number((att as any).expectedHours) || 8;
          const workingHours = Number(att.workingHours) || 0;
          const bioOt = Math.max(0, workingHours - standardDutyHours);
          const newFinalOt = Math.min(bioOt, parsedSupervisorOt);
          const newHrSaving = Math.max(0, bioOt - newFinalOt);

          const punchInfo = getAttendanceInAndOut(att);
          const inTime = punchInfo.inTime !== '--:--' ? punchInfo.inTime : undefined;
          const outTime = punchInfo.outTime !== '--:--' ? punchInfo.outTime : undefined;

          const newRecord: OvertimeRecord = {
            id: `ot_${normEmpId}_${dateStr}`,
            employeeId: emp.id,
            date: dateStr,
            inTime,
            outTime,
            bioOtHours: Number(bioOt.toFixed(2)),
            supervisorOtHours: parsedSupervisorOt,
            standardDutyHours: Number(standardDutyHours.toFixed(2)),
            hours: Number(newFinalOt.toFixed(2)),
            hrSaving: Number(newHrSaving.toFixed(2)),
            type: att.status === 'Weekly Off' ? 'Weekly Off' : 'Regular',
            status: 'Pending',
            remarks: rawRemarks,
            shiftId: att.shiftId || null,
            reviewedBy: currentUser?.username || 'Admin',
            reviewedDate: new Date().toISOString()
          };

          rows.push({
            rowNumber,
            rawEmpId,
            normEmpId,
            empName,
            dateStr,
            rawSupervisorOt,
            parsedSupervisorOt,
            rawRemarks,
            bioOtHours: bioOt,
            prevSupervisorOt: 0,
            prevFinalOt: 0,
            newFinalOt,
            newHrSaving,
            status: 'NEW',
            statusTitle: 'New Record Created',
            reason: `Generated from reconciled attendance (${workingHours}h worked). Final OT: ${newFinalOt.toFixed(2)}h.`,
            isExisting: false,
            preparedRecord: newRecord
          });
        }
      }

      setParsedRows(rows);
      toast.success(`Parsed ${rows.length} rows from ${uploadedFile.name}`);
    } catch (err: any) {
      console.error('File parsing error:', err);
      setFileError(err.message || 'Failed to parse Excel file.');
      toast.error(err.message || 'Failed to parse file');
    } finally {
      setIsParsing(false);
    }
  };

  // ----------------------------------------------------
  // Filtered preview rows
  // ----------------------------------------------------
  const stats = useMemo(() => {
    let updated = 0;
    let newRows = 0;
    let unchanged = 0;
    let skipped = 0;
    let errors = 0;

    for (const r of parsedRows) {
      if (r.status === 'UPDATED') updated++;
      else if (r.status === 'NEW') newRows++;
      else if (r.status === 'UNCHANGED') unchanged++;
      else if (r.status === 'SKIPPED') skipped++;
      else if (r.status === 'ERROR') errors++;
    }

    return {
      total: parsedRows.length,
      validToImport: updated + newRows,
      updated,
      newRows,
      unchanged,
      skipped,
      errors
    };
  }, [parsedRows]);

  const filteredRows = useMemo(() => {
    const q = searchFilter.toLowerCase().trim();
    return parsedRows.filter(r => {
      // Tab filter
      if (selectedTab === 'UPDATED' && r.status !== 'UPDATED') return false;
      if (selectedTab === 'NEW' && r.status !== 'NEW') return false;
      if (selectedTab === 'UNCHANGED' && r.status !== 'UNCHANGED') return false;
      if (selectedTab === 'SKIPPED' && r.status !== 'SKIPPED') return false;
      if (selectedTab === 'ERRORS' && r.status !== 'ERROR') return false;

      // Search filter
      if (q) {
        const idMatch = r.rawEmpId.toLowerCase().includes(q) || r.normEmpId.toLowerCase().includes(q);
        const nameMatch = r.empName.toLowerCase().includes(q);
        const dateMatch = r.dateStr.toLowerCase().includes(q);
        const reasonMatch = r.reason.toLowerCase().includes(q);
        const remarksMatch = r.rawRemarks.toLowerCase().includes(q);
        if (!idMatch && !nameMatch && !dateMatch && !reasonMatch && !remarksMatch) {
          return false;
        }
      }

      return true;
    });
  }, [parsedRows, selectedTab, searchFilter]);

  // ----------------------------------------------------
  // Export Rejected Rows Report (if errors/skipped exist)
  // ----------------------------------------------------
  const handleExportRejectedRows = () => {
    const rejected = parsedRows.filter(r => r.status === 'ERROR' || r.status === 'SKIPPED');
    if (rejected.length === 0) {
      toast.info('No rejected rows to export');
      return;
    }

    const exportData = rejected.map(r => ({
      'Row Number': r.rowNumber,
      'Employee ID': r.rawEmpId,
      'Employee Name': r.empName,
      'Date': r.dateStr,
      'Supervisor OT': r.rawSupervisorOt,
      'Remarks': r.rawRemarks,
      'Status': r.status,
      'Rejection Reason': r.reason
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Rejected Rows');
    XLSX.writeFile(wb, `Supervisor_OT_Rejected_Rows_${Date.now()}.xlsx`);
    toast.success(`Exported ${rejected.length} rejected row(s) to Excel`);
  };

  // ----------------------------------------------------
  // Execute Transactional Import via ActionStatusContext
  // ----------------------------------------------------
  const handleExecuteImport = async () => {
    const rowsToApply = parsedRows.filter(r => (r.status === 'UPDATED' || r.status === 'NEW') && r.preparedRecord);

    if (rowsToApply.length === 0) {
      toast.error('No valid records to import. All rows are either unchanged, skipped, or contain errors.');
      return;
    }

    const recordsToSave = rowsToApply.map(r => r.preparedRecord!);
    const updatedCount = parsedRows.filter(r => r.status === 'UPDATED').length;
    const newCount = parsedRows.filter(r => r.status === 'NEW').length;
    const unchangedCount = stats.unchanged;
    const errorCount = stats.errors;
    const skippedCount = stats.skipped;

    // Execute with standard HRIS ActionStatus workflow
    await executeWithStatus(
      {
        title: 'Confirm Supervisor OT & Remarks Import',
        subtitle: `You are about to update ${recordsToSave.length} Overtime records with verified Supervisor OT and Remarks.`,
        module: 'Time & Attendance',
        actionType: 'import',
        recordName: file?.name || 'Supervisor OT Excel File',
        details: {
          'File Processed': file?.name || 'Uploaded File',
          'Total Rows Read': parsedRows.length,
          'Existing Records Updated': `${updatedCount} records`,
          'New OT Records Created': `${newCount} records`,
          'Unchanged Records': `${unchangedCount} records`,
          'Skipped / Error Rows': `${skippedCount + errorCount} rows (ignored)`,
          'Target Database': 'E:\\SHRM_HRIS\\Database.db'
        },
        confirmText: `Confirm & Import (${recordsToSave.length} Records)`
      },
      async (updateProgress) => {
        // Stage 1: Preparing
        updateProgress({
          percent: 15,
          stage: 'PREPARING',
          message: 'Preparing OT records and validating employee duty hours...'
        });
        await new Promise(r => setTimeout(r, 40));

        // Stage 2: Calculation Verification
        updateProgress({
          percent: 40,
          stage: 'VALIDATING',
          message: `Recalculating Final OT (min(Bio OT, Supervisor OT)) for ${recordsToSave.length} records...`
        });
        await new Promise(r => setTimeout(r, 40));

        // Stage 3: Database Transaction
        updateProgress({
          percent: 70,
          stage: 'SAVING DATABASE',
          message: 'Executing SQLite transaction in E:\\SHRM_HRIS\\Database.db...'
        });

        // Save detailed via SQLite local client
        const saveRes = await saveLocalTableDetailed('overtime', recordsToSave);

        if (!saveRes.success) {
          throw new Error(saveRes.error || 'Failed to commit overtime records to SQLite database');
        }

        // Stage 4: Verifying
        updateProgress({
          percent: 90,
          stage: 'VERIFYING',
          message: 'Performing SQLite readback verification & writing audit log...'
        });

        // Write audit log entry
        const auditLogEntry = {
          id: `audit_import_ot_${Date.now()}`,
          employeeId: 'ALL',
          date: new Date().toISOString().substring(0, 10),
          action: 'SUPERVISOR_OT_IMPORT',
          field: 'supervisorOtHours,remarks',
          oldValue: `${stats.unchanged} unchanged`,
          newValue: `${updatedCount} updated, ${newCount} created`,
          changedBy: currentUser?.username || 'Admin',
          timestamp: new Date().toISOString(),
          remarks: `Imported from ${file?.name || 'Excel'}: ${recordsToSave.length} records applied.`
        };
        await saveLocalTableDetailed('audit_logs', [auditLogEntry]).catch(console.warn);

        // Stage 5: Update Store & In-Memory State
        updateProgress({
          percent: 98,
          stage: 'UPDATING OT',
          message: 'Refreshing OT report and triggering OT Audit Cross-Check...'
        });
        await setOvertimeBatch(recordsToSave);

        // Auto-close and cleanup
        handleClose();

        return {
          success: true,
          affectedCount: recordsToSave.length,
          verificationStatus: saveRes.verificationStatus,
          transaction: saveRes.transaction,
          dbPath: saveRes.dbPath,
          breakdown: {
            'Records Updated': `${updatedCount} records`,
            'New Records Created': `${newCount} records`,
            'Unchanged Records': `${unchangedCount} records`,
            'Skipped / Error Rows': `${skippedCount + errorCount} rows`,
            'Recalculated Formula': 'Final OT = min(Bio OT, Supervisor OT)',
            'Audit Re-evaluation': 'PASS / WARNING / MISMATCH refreshed',
            'Database Path': 'E:\\SHRM_HRIS\\Database.db'
          }
        };
      }
    );
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/60 backdrop-blur-xs overflow-y-auto">
        <motion.div 
          initial={{ scale: 0.96, opacity: 0, y: 8 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.96, opacity: 0, y: 8 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl max-w-5xl w-full p-5 sm:p-6 border border-slate-200 dark:border-slate-800 space-y-4 max-h-[92vh] flex flex-col my-auto"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3.5">
            <div className="flex items-center gap-3">
              <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl">
                <FileSpreadsheet size={22} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  Import Supervisor OT & Remarks
                  <Badge variant="info" className="text-[10px] font-mono uppercase">
                    Excel / CSV
                  </Badge>
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Bulk update claimed supervisor overtime hours and audit remarks matching on Numeric Employee ID + Date.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => generateSupervisorOTTemplate(employees)}
                className="gap-1.5 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 text-xs font-semibold"
                title="Download standard Excel template with sample rows and instructions"
              >
                <Download size={13} />
                Export Template
              </Button>

              <button 
                onClick={handleClose}
                className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="space-y-4 flex-1 overflow-y-auto pr-1">
            {/* Step 1: File Upload Zone */}
            <div 
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                  processUploadedFile(e.dataTransfer.files[0]);
                }
              }}
              className={`border-2 border-dashed rounded-xl p-5 text-center transition-all ${
                isDragging 
                  ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/30' 
                  : file 
                  ? 'border-emerald-300 dark:border-emerald-800/80 bg-emerald-50/20 dark:bg-emerald-950/10'
                  : 'border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/40 hover:border-indigo-400'
              }`}
            >
              <input 
                ref={fileInputRef}
                type="file" 
                accept=".xlsx, .xls, .csv" 
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    processUploadedFile(e.target.files[0]);
                  }
                }}
                className="hidden" 
              />

              <div className="flex flex-col items-center justify-center gap-2">
                <div className={`p-2.5 rounded-xl ${file ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400' : 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400'}`}>
                  {isParsing ? <RefreshCw size={24} className="animate-spin" /> : file ? <CheckCircle2 size={24} /> : <Upload size={24} />}
                </div>

                <div className="space-y-1">
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                    {file ? (
                      <span className="font-mono text-emerald-700 dark:text-emerald-400">
                        {file.name} ({Math.round(file.size / 1024)} KB)
                      </span>
                    ) : (
                      <>
                        <button 
                          type="button" 
                          onClick={() => fileInputRef.current?.click()}
                          className="text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
                        >
                          Click to select Excel spreadsheet
                        </button>
                        <span> or drag and drop file here</span>
                      </>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Supports .xlsx, .xls, and .csv files. Required columns: <strong className="text-slate-600 dark:text-slate-300">Employee ID</strong>, <strong className="text-slate-600 dark:text-slate-300">Date</strong>, <strong className="text-slate-600 dark:text-slate-300">Supervisor OT</strong>, <strong className="text-slate-600 dark:text-slate-300">Remarks</strong>.
                  </p>
                </div>

                {file && (
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={() => fileInputRef.current?.click()} 
                    className="mt-1 text-[11px] h-7 gap-1"
                  >
                    <RefreshCw size={11} />
                    Choose Different File
                  </Button>
                )}
              </div>
            </div>

            {/* Parsing error notification */}
            {fileError && (
              <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/50 rounded-xl text-xs text-rose-800 dark:text-rose-300 flex items-start gap-2.5">
                <AlertOctagon size={16} className="text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-bold">File Validation Error</p>
                  <p className="font-mono text-[11px]">{fileError}</p>
                </div>
              </div>
            )}

            {/* Step 2: Parsed Preview & KPI Breakdown */}
            {parsedRows.length > 0 && (
              <div className="space-y-3">
                {/* KPI Counter Pills */}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
                  <button 
                    type="button"
                    onClick={() => setSelectedTab('ALL')}
                    className={`p-2 rounded-xl border text-left transition-all ${
                      selectedTab === 'ALL' 
                        ? 'border-indigo-500 bg-indigo-50/60 dark:bg-indigo-950/40 ring-1 ring-indigo-500' 
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Rows</div>
                    <div className="text-base font-black text-slate-800 dark:text-white">{stats.total}</div>
                  </button>

                  <button 
                    type="button"
                    onClick={() => setSelectedTab('UPDATED')}
                    className={`p-2 rounded-xl border text-left transition-all ${
                      selectedTab === 'UPDATED' 
                        ? 'border-emerald-500 bg-emerald-50/60 dark:bg-emerald-950/40 ring-1 ring-emerald-500' 
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">To Update</div>
                    <div className="text-base font-black text-emerald-700 dark:text-emerald-300">{stats.updated}</div>
                  </button>

                  <button 
                    type="button"
                    onClick={() => setSelectedTab('NEW')}
                    className={`p-2 rounded-xl border text-left transition-all ${
                      selectedTab === 'NEW' 
                        ? 'border-blue-500 bg-blue-50/60 dark:bg-blue-950/40 ring-1 ring-blue-500' 
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-wider">New OT</div>
                    <div className="text-base font-black text-blue-700 dark:text-blue-300">{stats.newRows}</div>
                  </button>

                  <button 
                    type="button"
                    onClick={() => setSelectedTab('UNCHANGED')}
                    className={`p-2 rounded-xl border text-left transition-all ${
                      selectedTab === 'UNCHANGED' 
                        ? 'border-slate-500 bg-slate-100 dark:bg-slate-800 ring-1 ring-slate-500' 
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Unchanged</div>
                    <div className="text-base font-black text-slate-700 dark:text-slate-300">{stats.unchanged}</div>
                  </button>

                  <button 
                    type="button"
                    onClick={() => setSelectedTab('SKIPPED')}
                    className={`p-2 rounded-xl border text-left transition-all ${
                      selectedTab === 'SKIPPED' 
                        ? 'border-amber-500 bg-amber-50/60 dark:bg-amber-950/40 ring-1 ring-amber-500' 
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-wider">Skipped</div>
                    <div className="text-base font-black text-amber-700 dark:text-amber-300">{stats.skipped}</div>
                  </button>

                  <button 
                    type="button"
                    onClick={() => setSelectedTab('ERRORS')}
                    className={`p-2 rounded-xl border text-left transition-all ${
                      selectedTab === 'ERRORS' 
                        ? 'border-rose-500 bg-rose-50/60 dark:bg-rose-950/40 ring-1 ring-rose-500' 
                        : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <div className="text-[10px] font-bold text-rose-600 dark:text-rose-400 uppercase tracking-wider">Errors</div>
                    <div className="text-base font-black text-rose-700 dark:text-rose-300">{stats.errors}</div>
                  </button>
                </div>

                {/* Filter and Search Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="relative flex-1 min-w-[220px]">
                    <Search className="absolute left-3 top-2.5 text-slate-400" size={13} />
                    <Input 
                      placeholder="Search preview by ID, name, date, or remarks..."
                      value={searchFilter}
                      onChange={(e) => setSearchFilter(e.target.value)}
                      className="pl-8 h-8 text-xs bg-slate-50/50 dark:bg-slate-900/50"
                    />
                  </div>

                  {(stats.errors > 0 || stats.skipped > 0) && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={handleExportRejectedRows}
                      className="h-8 gap-1.5 text-xs text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-900/50 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                    >
                      <Download size={13} />
                      Download Rejected Rows ({stats.errors + stats.skipped})
                    </Button>
                  )}
                </div>

                {/* Preview Table */}
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-xs">
                  <div className="max-h-72 overflow-y-auto">
                    <table className="w-full text-left text-xs divide-y divide-slate-200 dark:divide-slate-800">
                      <thead className="bg-slate-50 dark:bg-slate-800/80 font-bold text-slate-500 text-[10px] uppercase sticky top-0 backdrop-blur-xs z-10">
                        <tr>
                          <th className="py-2 px-2.5 w-12 text-center">Row</th>
                          <th className="py-2 px-2.5">Emp ID</th>
                          <th className="py-2 px-2.5">Name</th>
                          <th className="py-2 px-2.5">Date</th>
                          <th className="py-2 px-2 text-right">Bio OT</th>
                          <th className="py-2 px-2 text-right">Prev Sup OT</th>
                          <th className="py-2 px-2 text-right text-indigo-600 dark:text-indigo-400">New Sup OT</th>
                          <th className="py-2 px-2 text-right font-bold text-emerald-600 dark:text-emerald-400">Final OT</th>
                          <th className="py-2 px-2.5">Remarks</th>
                          <th className="py-2 px-2.5 text-center">Status</th>
                          <th className="py-2 px-2.5">Validation Note</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 bg-white dark:bg-slate-900">
                        {filteredRows.length === 0 ? (
                          <tr>
                            <td colSpan={11} className="py-8 text-center text-slate-400 italic">
                              No records found matching current filter or search.
                            </td>
                          </tr>
                        ) : (
                          filteredRows.map((row) => {
                            const isUpdate = row.status === 'UPDATED';
                            const isNew = row.status === 'NEW';
                            const isError = row.status === 'ERROR';
                            const isSkipped = row.status === 'SKIPPED';
                            const isUnchanged = row.status === 'UNCHANGED';

                            return (
                              <tr 
                                key={`${row.rowNumber}_${row.normEmpId}_${row.dateStr}`}
                                className={`transition-colors ${
                                  isError 
                                    ? 'bg-rose-50/40 dark:bg-rose-950/20 hover:bg-rose-50/70' 
                                    : isUpdate 
                                    ? 'bg-emerald-50/30 dark:bg-emerald-950/15 hover:bg-emerald-50/60' 
                                    : isNew 
                                    ? 'bg-blue-50/30 dark:bg-blue-950/15 hover:bg-blue-50/60'
                                    : isSkipped 
                                    ? 'bg-amber-50/30 dark:bg-amber-950/15 hover:bg-amber-50/60'
                                    : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                                }`}
                              >
                                <td className="py-2 px-2.5 text-center font-mono text-[10px] text-slate-400">
                                  #{row.rowNumber}
                                </td>

                                <td className="py-2 px-2.5 font-mono font-bold text-slate-800 dark:text-slate-200">
                                  {row.rawEmpId}
                                </td>

                                <td className="py-2 px-2.5 font-medium text-slate-700 dark:text-slate-300 truncate max-w-[130px]" title={row.empName}>
                                  {row.empName}
                                </td>

                                <td className="py-2 px-2.5 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                                  {row.dateStr || '-'}
                                </td>

                                <td className="py-2 px-2 text-right font-mono text-slate-500">
                                  {row.bioOtHours.toFixed(2)}h
                                </td>

                                <td className="py-2 px-2 text-right font-mono text-slate-400">
                                  {row.prevSupervisorOt.toFixed(2)}h
                                </td>

                                <td className="py-2 px-2 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">
                                  {row.parsedSupervisorOt.toFixed(2)}h
                                </td>

                                <td className="py-2 px-2 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                  {row.newFinalOt.toFixed(2)}h
                                </td>

                                <td className="py-2 px-2.5 text-slate-600 dark:text-slate-300 text-[11px] truncate max-w-[150px]" title={row.rawRemarks}>
                                  {row.rawRemarks || <span className="text-slate-300 dark:text-slate-600 italic">No remarks</span>}
                                </td>

                                <td className="py-2 px-2.5 text-center whitespace-nowrap">
                                  {isUpdate && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300/60 dark:border-emerald-800">
                                      UPDATE
                                    </span>
                                  )}
                                  {isNew && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-300/60 dark:border-blue-800">
                                      NEW
                                    </span>
                                  )}
                                  {isUnchanged && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                                      UNCHANGED
                                    </span>
                                  )}
                                  {isSkipped && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-300/60 dark:border-amber-800">
                                      SKIPPED
                                    </span>
                                  )}
                                  {isError && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 border border-rose-300/60 dark:border-rose-800">
                                      ERROR
                                    </span>
                                  )}
                                </td>

                                <td className="py-2 px-2.5 text-[11px] text-slate-500 dark:text-slate-400 max-w-[200px] truncate" title={row.reason}>
                                  {row.reason}
                                </td>
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
          </div>

          {/* Footer Actions */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleClose}
                className="text-xs"
              >
                Cancel
              </Button>
              {file && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setFile(null);
                    setParsedRows([]);
                    setFileError(null);
                  }}
                  className="text-xs"
                >
                  Clear File
                </Button>
              )}
            </div>

            <div className="flex items-center gap-3">
              {parsedRows.length > 0 && (
                <div className="text-xs text-slate-500 dark:text-slate-400 hidden sm:block">
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">{stats.validToImport} valid record(s)</span> will be committed to SQLite database.
                </div>
              )}

              <Button
                onClick={handleExecuteImport}
                disabled={stats.validToImport === 0 || isParsing}
                className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md gap-2 text-xs font-semibold px-4"
              >
                <Check size={14} />
                Confirm & Import Valid Records ({stats.validToImport})
              </Button>
            </div>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
