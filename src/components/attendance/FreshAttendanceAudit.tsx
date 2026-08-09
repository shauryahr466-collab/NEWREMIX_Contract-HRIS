import React, { useState, useMemo } from 'react';
import { useAppStore } from '../../store';
import { 
  FieldAttendanceRecord, 
  AuditRecordComparison, 
  AuditResultCategory, 
  AuditGroupType 
} from '../../types/attendanceAudit';
import { 
  Upload, FileSpreadsheet, CheckCircle2, AlertOctagon, HelpCircle, ShieldAlert, 
  Filter, Search, Download, Printer, Eye, Check, X, RefreshCw, MessageSquare, 
  UserCheck, ShieldCheck, Flag, AlertTriangle, Calendar, Grid, List, Edit3, Save, Layers
} from 'lucide-react';
import { Card, Button, Input, Modal } from '../ui';
import { 
  formatADToBS, 
  NEPALI_MONTHS, 
  getCurrentNepaliDateInfo, 
  getNepaliMonthDays, 
  getNepaliMonthEnglishEquivalent 
} from '../../utils/nepaliCalendar';
import { formatAMPM, cn } from '../../lib/utils';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';

export function FreshAttendanceAudit() {
  const { employees, processedData, settings, shiftAssignments, addForceAttendance, addAuditLog } = useAppStore();

  // Selected Month/Year for matrix parsing context
  const [calendarType, setCalendarType] = useState<'BS' | 'AD'>('BS');
  const [selectedBsYear, setSelectedBsYear] = useState<number>(() => getCurrentNepaliDateInfo().year);
  const [selectedBsMonth, setSelectedBsMonth] = useState<number>(() => getCurrentNepaliDateInfo().monthIndex); // 0-11
  const [selectedMonth, setSelectedMonth] = useState<string>(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  });

  // State for Field Attendance records uploaded
  const [fieldRecords, setFieldRecords] = useState<FieldAttendanceRecord[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [importType, setImportType] = useState<'matrix' | 'flat' | 'sample'>('matrix');

  // View mode toggle: Matrix Grid vs Flat List
  const [viewMode, setViewMode] = useState<'matrix' | 'list'>('matrix');

  // State for HR Audit Decisions map: recordId -> { decision: 'Accepted' | 'Rejected', remarks: string, auditedBy: string, auditedAt: string, overrideStatus?: string }
  const [auditDecisions, setAuditDecisions] = useState<Record<string, {
    decision: 'Accepted' | 'Rejected';
    remarks: string;
    auditedBy: string;
    auditedAt: string;
    overrideStatus?: string;
  }>>({});

  // Filter states
  const [groupFilter, setGroupFilter] = useState<string>('All');
  const [categoryFilter, setCategoryFilter] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [flaggedOnly, setFlaggedOnly] = useState<boolean>(false);

  // Edit / Override Modal state
  const [editModal, setEditModal] = useState<{
    isOpen: boolean;
    record: AuditRecordComparison | null;
    customStatus: string;
    inTime: string;
    outTime: string;
    remarks: string;
    auditedBy: string;
  }>({
    isOpen: false,
    record: null,
    customStatus: 'Present',
    inTime: '09:00',
    outTime: '18:00',
    remarks: '',
    auditedBy: 'HR Manager'
  });

  // Fast map for Bio Attendance
  const processedDataMap = useMemo(() => {
    const map = new Map<string, typeof processedData[0]>();
    processedData.forEach(p => {
      map.set(`${p.employeeId}_${p.date}`, p);
    });
    return map;
  }, [processedData]);

  // Fast map for Employees with flexible numeric ID matching
  const employeeMap = useMemo(() => {
    const map = new Map<string, typeof employees[0]>();
    employees.forEach(e => {
      map.set(e.id, e);
      map.set(e.id.toLowerCase(), e);
      const numOnly = e.id.replace(/\D/g, '');
      if (numOnly) {
        map.set(numOnly, e);
      }
    });
    return map;
  }, [employees]);

  // Helper function to format arbitrary date string/number to YYYY-MM-DD
  const parseHeaderDateToISO = (dhStr: string, year: number, month: number, bsDays: ReturnType<typeof getNepaliMonthDays>): string => {
    const trimmed = dhStr.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
      return trimmed;
    }
    
    // Check M/D/YYYY or M/D/YY or D/M/YYYY (e.g., 7/17/2026, 07/17/2026)
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(trimmed)) {
      const parts = trimmed.split('/');
      let m = parseInt(parts[0], 10);
      let d = parseInt(parts[1], 10);
      let y = parseInt(parts[2], 10);
      if (y < 100) y += 2000;
      
      // If month > 12, assume D/M/YYYY
      if (m > 12 && d <= 12) {
        const temp = m;
        m = d;
        d = temp;
      }
      if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
    }

    // Check Day number (e.g. 1, 2, 17... 31)
    const num = parseInt(trimmed, 10);
    if (!isNaN(num) && num >= 1 && num <= 31 && String(num) === trimmed) {
      if (calendarType === 'BS' && bsDays.length >= num) {
        return bsDays[num - 1]?.adDateStr || '';
      }
      return `${year}-${String(month).padStart(2, '0')}-${String(num).padStart(2, '0')}`;
    }

    // Fallback parsing via JS Date
    const parsedDate = new Date(trimmed);
    if (!isNaN(parsedDate.getTime())) {
      const y = parsedDate.getFullYear();
      const m = String(parsedDate.getMonth() + 1).padStart(2, '0');
      const d = String(parsedDate.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }

    return '';
  };

  // Handle File Upload (Excel / CSV) - Supports both Matrix Format and Flat List Format
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();

    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const workbook = XLSX.read(bstr, { type: 'binary' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const rawJson: any[] = XLSX.utils.sheet_to_json(worksheet, { defval: '' });

        if (rawJson.length === 0) {
          toast.error('The uploaded file is empty or formatted incorrectly.');
          return;
        }

        const headers = Object.keys(rawJson[0] || {});

        let bsDays: ReturnType<typeof getNepaliMonthDays> = [];
        if (calendarType === 'BS') {
          bsDays = getNepaliMonthDays(selectedBsYear, selectedBsMonth);
        }
        const [yearStr, monthStr] = selectedMonth.split('-');
        const year = parseInt(yearStr, 10) || new Date().getFullYear();
        const month = parseInt(monthStr, 10) || (new Date().getMonth() + 1);

        // Check if headers contain date strings (7/17/2026) or day numbers (1..31) indicating Matrix Format
        const dateHeaders = headers.filter(h => {
          const trimmed = String(h).trim();
          const parsedIso = parseHeaderDateToISO(trimmed, year, month, bsDays);
          return parsedIso !== '';
        });

        const parsed: FieldAttendanceRecord[] = [];

        if (dateHeaders.length >= 3) {
          // --- MATRIX FORMAT PARSING ---
          setImportType('matrix');

          rawJson.forEach((row, idx) => {
            const keys = Object.keys(row);
            const empIdKey = keys.find(k => {
              const l = k.toLowerCase().replace(/[^a-z0-9]/g, '');
              return l === 'empid' || l === 'id' || l === 'empcode' || l.includes('empid') || l.includes('staffid');
            });
            const empNameKey = keys.find(k => k.toLowerCase().includes('name'));
            const deptKey = keys.find(k => k.toLowerCase().includes('dept') || k.toLowerCase().includes('department'));

            const rawId = row[empIdKey || ''] !== undefined && row[empIdKey || ''] !== '' ? String(row[empIdKey || '']).trim() : `EMP_${idx + 1}`;
            const empName = row[empNameKey || ''] ? String(row[empNameKey || '']).trim() : 'Unknown';
            const department = row[deptKey || ''] ? String(row[deptKey || '']).trim() : 'General';

            dateHeaders.forEach(dh => {
              const cellVal = String(row[dh] || '').trim();
              if (!cellVal) return;

              const formattedDate = parseHeaderDateToISO(dh, year, month, bsDays);

              if (formattedDate) {
                parsed.push({
                  id: `field_${rawId}_${formattedDate}`,
                  employeeId: rawId,
                  employeeName: empName,
                  department,
                  date: formattedDate,
                  fieldStatus: cellVal,
                  importedAt: new Date().toISOString()
                });
              }
            });
          });

          toast.success(`Parsed Matrix Muster: ${parsed.length} records imported across ${dateHeaders.length} date columns!`);
        } else {
          // --- FLAT LIST FORMAT PARSING ---
          setImportType('flat');
          rawJson.forEach((row, idx) => {
            const keys = Object.keys(row);
            const empIdKey = keys.find(k => k.toLowerCase().includes('id') || k.toLowerCase().includes('emp'));
            const empNameKey = keys.find(k => k.toLowerCase().includes('name'));
            const dateKey = keys.find(k => k.toLowerCase().includes('date'));
            const statusKey = keys.find(k => k.toLowerCase().includes('status') || k.toLowerCase().includes('attendance') || k.toLowerCase().includes('field'));
            const inKey = keys.find(k => k.toLowerCase().includes('in'));
            const outKey = keys.find(k => k.toLowerCase().includes('out'));
            const remarkKey = keys.find(k => k.toLowerCase().includes('remark'));

            const empId = row[empIdKey || ''] ? String(row[empIdKey || '']).trim() : `EMP_${idx + 1}`;
            const empName = row[empNameKey || ''] ? String(row[empNameKey || '']).trim() : 'Unknown';
            const dateStr = row[dateKey || ''] ? String(row[dateKey || '']).trim() : '';
            const fieldStatus = row[statusKey || ''] ? String(row[statusKey || '']).trim() : 'P';

            const parsedDate = dateStr ? parseHeaderDateToISO(dateStr, year, month, bsDays) : '';

            if (parsedDate) {
              parsed.push({
                id: `field_${empId}_${parsedDate}`,
                employeeId: empId,
                employeeName: empName,
                date: parsedDate,
                fieldStatus,
                inTime: row[inKey || ''] ? String(row[inKey || '']) : undefined,
                outTime: row[outKey || ''] ? String(row[outKey || '']) : undefined,
                remarks: row[remarkKey || ''] ? String(row[remarkKey || '']) : undefined,
                importedAt: new Date().toISOString()
              });
            }
          });

          toast.success(`Successfully imported ${parsed.length} Field Attendance records from ${file.name}`);
        }

        setFieldRecords(parsed);
      } catch (err) {
        toast.error('Failed to parse uploaded Excel/CSV file.');
      }
    };

    reader.readAsBinaryString(file);
  };

  // Generate and Download Sample Matrix Excel File for Import
  const handleDownloadSampleMatrix = () => {
    let sampleDays: { headerLabel: string; dateStr: string }[] = [];

    if (calendarType === 'BS') {
      const days = getNepaliMonthDays(selectedBsYear, selectedBsMonth);
      sampleDays = days.map(d => {
        const dateObj = new Date(d.adDateStr);
        const formattedDate = `${dateObj.getMonth() + 1}/${dateObj.getDate()}/${dateObj.getFullYear()}`;
        return {
          headerLabel: formattedDate,
          dateStr: d.adDateStr
        };
      });
    } else {
      const [yStr, mStr] = selectedMonth.split('-');
      const year = parseInt(yStr, 10) || new Date().getFullYear();
      const month = parseInt(mStr, 10) || (new Date().getMonth() + 1);
      const daysInMonth = new Date(year, month, 0).getDate();
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        const headerLabel = `${month}/${d}/${year}`;
        sampleDays.push({ headerLabel, dateStr });
      }
    }

    const templateSampleEmps = [
      { id: '2058', name: 'Ram Dhanik Kapar', department: 'Operations' },
      { id: '3', name: 'Chandreshwor Kapar', department: 'Production' },
      { id: '4', name: 'Garosh Yadav', department: 'Maintenance' },
      { id: '14', name: 'Gyan Kapar', department: 'Security' },
      { id: '1518', name: 'Kumar Pokherel', department: 'HR & Admin' },
      { id: '8019', name: 'Bikram Bahadur Mahat Kshetri', department: 'IT Support' },
      { id: '25', name: 'Shyam Kapari Kewat', department: 'Logistics' },
      { id: '20', name: 'Ram Sagar Kapari', department: 'Quality' },
      { id: '6', name: 'Ram Gulam Kapar', department: 'Production' },
      { id: '1548', name: 'Sanjay Malik', department: 'Finance' },
      { id: '2045', name: 'Ajay Kumar Sah', department: 'Store' },
      { id: '33', name: 'Dhanbir Kamati', department: 'Operations' },
      { id: '21', name: 'Ram Autar Yadav', department: 'Electrical' },
      { id: '1519', name: 'Jitendra Singh Danuwar', department: 'Civil' },
      { id: '1552', name: 'Bindeshwor Malik', department: 'Utility' },
    ];

    const sampleEmps = employees.length > 0 ? employees.slice(0, 15) : templateSampleEmps;

    const statusPattern = ['P', 'WO', 'P', 'PWO', 'P', 'A', 'WO', 'P', 'WO', 'P', 'P', 'PWO', 'P', 'A', 'WO', 'WO', 'A', 'P', 'P', 'PWO', 'P', 'A', 'WO', 'WO', 'A', 'P', 'P', 'P', 'PWO', 'WO', 'PWO'];

    const rows = sampleEmps.map((emp, empIdx) => {
      const rowData: Record<string, any> = {
        'Emp ID': emp.id,
        'Employee Name': emp.name,
      };

      sampleDays.forEach((dayInfo, dIdx) => {
        const dayOfWeek = new Date(dayInfo.dateStr).getDay();
        let code = statusPattern[(empIdx * 3 + dIdx) % statusPattern.length];
        if (dayOfWeek === 6) { // Saturday
          code = (empIdx + dIdx) % 3 === 0 ? 'PWO' : 'WO';
        }
        rowData[dayInfo.headerLabel] = code;
      });

      return rowData;
    });

    const monthLabel = calendarType === 'BS'
      ? `${NEPALI_MONTHS[selectedBsMonth].name}_${selectedBsYear}_BS`
      : selectedMonth;

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Field_Muster');

    const downloadFileName = `Sample_Field_Muster_${monthLabel}.xlsx`;
    XLSX.writeFile(workbook, downloadFileName);

    toast.success(`Downloaded Sample Field Muster Template: ${downloadFileName}`);
  };

  // Run Audit Engine & Compare Bio vs Field Attendance using precise rules
  const auditComparisons = useMemo<AuditRecordComparison[]>(() => {
    if (fieldRecords.length === 0 && processedData.length === 0) return [];

    const comparisons: AuditRecordComparison[] = [];

    // Build unique list of employee-date keys
    const allKeysSet = new Set<string>();
    fieldRecords.forEach(fr => allKeysSet.add(`${fr.employeeId}_${fr.date}`));

    // Also include Bio records to cross-check vice-versa (Bio exists, but Muster missing)
    processedData.forEach(p => allKeysSet.add(`${p.employeeId}_${p.date}`));

    allKeysSet.forEach(key => {
      const [empId, date] = key.split('_');
      const fieldRec = fieldRecords.find(f => f.employeeId === empId && f.date === date);
      const emp = employeeMap.get(empId) || employeeMap.get(empId.toLowerCase());
      const canonicalEmpId = emp ? emp.id : empId;
      const bioRec = processedDataMap.get(key) || processedDataMap.get(`${canonicalEmpId}_${date}`) || null;

      const bsDate = formatADToBS(date) || date;
      const isHoliday = settings.holidays?.some(h => h.date === date) || false;
      const dayName = new Date(date).toLocaleDateString('en-US', { weekday: 'long' });
      const assignment = shiftAssignments?.find(a => a.employeeId === canonicalEmpId && a.date === date);
      const assignedShift = settings.shifts?.find(s => s.id === (assignment?.shiftId || emp?.shiftId));
      const effectiveWeeklyOff = (assignedShift as any)?.weeklyOff || emp?.weeklyOff;
      const isWeeklyOff = bioRec?.status === 'Weekly Off' || bioRec?.status === 'PWO' || (
        effectiveWeeklyOff
          ? effectiveWeeklyOff.toLowerCase() === dayName.toLowerCase()
          : new Date(date).getDay() === 6
      );

      const fCode = fieldRec ? fieldRec.fieldStatus.trim().toUpperCase() : 'NO MUSTER';

      let group: AuditGroupType = 'VALID';
      let category = 'VALID — BIO MATCH';
      let issueReason = 'Field Attendance matches Biometric Attendance.';

      if (!emp) {
        group = 'REVIEW REQUIRED';
        category = 'REVIEW REQUIRED — MASTER DATA MISMATCH';
        issueReason = 'Employee ID does not exist in Employee Master Database.';
      } else if (!fieldRec) {
        // Vice Versa: Bio exists but Muster record is missing
        if (bioRec && bioRec.firstPunch) {
          group = 'REVIEW REQUIRED';
          category = 'REVIEW REQUIRED — BIO NOT FOUND';
          issueReason = 'Biometric punches exist on machine, but Employee was NOT recorded in Muster.';
        } else {
          group = 'NOT APPLICABLE';
          category = 'VALID — ABSENCE MATCH';
          issueReason = 'No Muster and no Biometric punch.';
        }
      } else if (fCode === 'PWO' || fCode === 'PRESENT ON OFF') {
        if (bioRec && bioRec.status === 'PWO') {
          group = 'VALID';
          category = 'VALID — WEEKLY OFF WORKED';
          issueReason = 'Worked on Weekly Off (PWO) confirmed by biometric punches with valid duration (>= 4 hrs).';
        } else if (bioRec && (bioRec.firstPunch || bioRec.lastPunch)) {
          group = 'REVIEW REQUIRED';
          category = 'REVIEW REQUIRED — INVALID PWO DURATION/PUNCH';
          issueReason = `Muster marks Weekly Off Worked (PWO), but biometric log has single/same punch or duration (${bioRec.workingHours || 0}h) is under 4 hours.`;
        } else {
          group = 'REVIEW REQUIRED';
          category = 'REVIEW REQUIRED — BIO NOT FOUND';
          issueReason = 'Muster marks Weekly Off Worked (PWO), but no biometric punches recorded.';
        }
      } else if (fCode === 'PPH' || fCode === 'PRESENT ON HOLIDAY') {
        if (bioRec && bioRec.firstPunch && (bioRec.workingHours || 0) >= 4) {
          group = 'VALID';
          category = 'VALID — PUBLIC HOLIDAY WORKED';
          issueReason = 'Worked on Public Holiday (PPH) confirmed by biometric punches.';
        } else {
          group = 'REVIEW REQUIRED';
          category = 'REVIEW REQUIRED — BIO NOT FOUND';
          issueReason = 'Muster marks Public Holiday Worked (PPH), but no valid biometric punches (>= 4 hrs) recorded.';
        }
      } else if (fCode === 'WO' || fCode === 'WEEKLY OFF') {
        if (bioRec && bioRec.status === 'PWO') {
          group = 'REVIEW REQUIRED';
          category = 'REVIEW REQUIRED — UNRECORDED PWO';
          issueReason = `Biometric log confirms valid PWO (${bioRec.workingHours}h worked), but Muster marks as Weekly Off (WO).`;
        } else {
          group = 'VALID';
          category = 'VALID — WEEKLY OFF';
          issueReason = 'Scheduled Weekly Off with no work or short duration (< 4 hrs).';
        }
      } else if (fCode === 'PH' || fCode === 'PUBLIC HOLIDAY') {
        group = 'VALID';
        category = 'VALID — PUBLIC HOLIDAY';
        issueReason = 'Public Holiday with no attendance required.';
      } else if (fCode === 'A' || fCode === 'ABSENT') {
        if (!bioRec || bioRec.status === 'Absent' || !bioRec.firstPunch) {
          group = 'VALID';
          category = 'VALID — ABSENCE MATCH';
          issueReason = 'Both Muster and Biometric record confirm Absence.';
        } else {
          group = 'REVIEW REQUIRED';
          category = 'REVIEW REQUIRED — ATTENDANCE STATUS MISMATCH';
          issueReason = 'Muster marks Absent, but Biometric log shows active attendance on machine.';
        }
      } else {
        // Field is Present (P / P+OT / L / etc)
        if (bioRec && bioRec.firstPunch && bioRec.lastPunch) {
          group = 'VALID';
          category = 'VALID — BIO MATCH';
          issueReason = 'Both Muster and Biometric logs confirm valid Present status.';
        } else if (bioRec && bioRec.status === 'SPF') {
          if (!bioRec.firstPunch && bioRec.lastPunch) {
            group = 'REVIEW REQUIRED';
            category = 'REVIEW REQUIRED — MISS IN';
            issueReason = 'Muster marks Present, but Biometric log has Missing IN punch.';
          } else if (bioRec.firstPunch && !bioRec.lastPunch) {
            group = 'REVIEW REQUIRED';
            category = 'REVIEW REQUIRED — MISS OUT';
            issueReason = 'Muster marks Present, but Biometric log has Missing OUT punch.';
          } else {
            group = 'REVIEW REQUIRED';
            category = 'REVIEW REQUIRED — SINGLE PUNCH';
            issueReason = 'Muster marks Present, but Biometric log only has a Single Punch.';
          }
        } else if (!bioRec || bioRec.status === 'Absent' || !bioRec.firstPunch) {
          group = 'REVIEW REQUIRED';
          category = 'REVIEW REQUIRED — BIO NOT FOUND';
          issueReason = 'Muster marks Present, but no Biometric punch was found on machine.';
        }
      }

      const prevDecision = auditDecisions[key];

      comparisons.push({
        id: key,
        employeeId: empId,
        employeeName: emp?.name || fieldRec?.employeeName || 'Unknown',
        department: emp?.department || fieldRec?.department || 'General',
        designation: emp?.designation || '-',
        date,
        bsDate,
        shiftName: assignedShift?.name || 'General Shift',
        fieldStatus: prevDecision?.overrideStatus || fieldRec?.fieldStatus || 'N/A',
        fieldInTime: fieldRec?.inTime,
        fieldOutTime: fieldRec?.outTime,
        fieldRemarks: fieldRec?.remarks,
        bioStatus: bioRec?.status || 'No Bio Log',
        bioInTime: bioRec?.firstPunch ? formatAMPM(bioRec.firstPunch) : undefined,
        bioOutTime: bioRec?.lastPunch ? formatAMPM(bioRec.lastPunch) : undefined,
        bioRawLogsCount: bioRec?.logs?.length || 0,
        isWeeklyOff,
        isPublicHoliday: isHoliday,
        auditResult: category as AuditResultCategory,
        auditGroup: group,
        issueReason,
        decision: prevDecision?.decision || 'Pending',
        hrRemarks: prevDecision?.remarks,
        auditedBy: prevDecision?.auditedBy,
        auditedAt: prevDecision?.auditedAt
      });
    });

    return comparisons;
  }, [fieldRecords, processedData, processedDataMap, employeeMap, settings.holidays, auditDecisions]);

  // KPI Metrics calculation
  const kpiMetrics = useMemo(() => {
    const total = auditComparisons.length;
    const valid = auditComparisons.filter(c => c.auditGroup === 'VALID' || c.decision === 'Accepted').length;
    const invalid = auditComparisons.filter(c => c.auditGroup === 'INVALID' && c.decision !== 'Accepted').length;
    const reviewRequired = auditComparisons.filter(c => c.auditGroup === 'REVIEW REQUIRED' && c.decision === 'Pending').length;
    const bioNotFound = auditComparisons.filter(c => c.auditResult.includes('BIO NOT FOUND')).length;
    const missPunches = auditComparisons.filter(c => c.auditResult.includes('MISS IN') || c.auditResult.includes('MISS OUT') || c.auditResult.includes('SINGLE PUNCH')).length;

    const accuracy = total > 0 ? ((valid / total) * 100).toFixed(1) : '100.0';

    return {
      total,
      valid,
      invalid,
      reviewRequired,
      bioNotFound,
      missPunches,
      accuracy
    };
  }, [auditComparisons]);

  // Filtered Audit Table List
  const filteredAuditList = useMemo(() => {
    const sLower = searchTerm.toLowerCase();
    return auditComparisons.filter(rec => {
      const matchSearch = !searchTerm || 
        rec.employeeId.toLowerCase().includes(sLower) || 
        rec.employeeName.toLowerCase().includes(sLower) ||
        rec.department.toLowerCase().includes(sLower);

      const matchGroup = groupFilter === 'All' || rec.auditGroup === groupFilter;
      const matchCategory = categoryFilter === 'All' || rec.auditResult === categoryFilter;
      const matchFlagged = !flaggedOnly || (rec.auditGroup === 'REVIEW REQUIRED' || rec.auditGroup === 'INVALID');

      return matchSearch && matchGroup && matchCategory && matchFlagged;
    });
  }, [auditComparisons, searchTerm, groupFilter, categoryFilter, flaggedOnly]);

  // Active dates in month for Matrix View
  const matrixDates = useMemo(() => {
    if (calendarType === 'BS') {
      const days = getNepaliMonthDays(selectedBsYear, selectedBsMonth);
      return days.map(d => ({
        dayNum: d.dayNumber,
        dateStr: d.adDateStr,
        bsDateStr: d.bsDateStr,
        dayName: d.dayOfWeek
      }));
    } else {
      const [yStr, mStr] = selectedMonth.split('-');
      const year = parseInt(yStr, 10) || new Date().getFullYear();
      const month = parseInt(mStr, 10) || (new Date().getMonth() + 1);
      const daysInMonth = new Date(year, month, 0).getDate();

      const dates: { dayNum: number; dateStr: string; bsDateStr: string; dayName: string }[] = [];
      for (let day = 1; day <= daysInMonth; day++) {
        const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const dayName = new Date(dateStr).toLocaleDateString('en-US', { weekday: 'short' });
        const bsDateStr = formatADToBS(dateStr) || dateStr;
        dates.push({ dayNum: day, dateStr, bsDateStr, dayName });
      }
      return dates;
    }
  }, [calendarType, selectedBsYear, selectedBsMonth, selectedMonth]);

  // Grouped employees for Matrix View
  const matrixEmployees = useMemo(() => {
    const sLower = searchTerm.toLowerCase();
    return employees.filter(emp => {
      if (!emp || !emp.id) return false;
      return !searchTerm || emp.id.toLowerCase().includes(sLower) || emp.name.toLowerCase().includes(sLower) || emp.department.toLowerCase().includes(sLower);
    });
  }, [employees, searchTerm]);

  // Open Cell Edit & Auto-Save Modal
  const handleOpenEditCell = (rec: AuditRecordComparison) => {
    setEditModal({
      isOpen: true,
      record: rec,
      customStatus: rec.fieldStatus && rec.fieldStatus !== 'N/A' ? rec.fieldStatus : 'P',
      inTime: rec.bioInTime || '09:00',
      outTime: rec.bioOutTime || '18:00',
      remarks: rec.hrRemarks || (rec.auditGroup === 'VALID' ? 'Verified by HR.' : `Audit Discrepancy Resolved: ${rec.issueReason}`),
      auditedBy: 'HR Manager'
    });
  };

  // Save Audit Override & Automatically Sync to System Attendance Field
  const handleSaveAndSyncAttendance = async () => {
    if (!editModal.record) return;

    const rec = editModal.record;
    const key = rec.id;

    try {
      // 1. Update audit decision state
      setAuditDecisions(prev => ({
        ...prev,
        [key]: {
          decision: 'Accepted',
          remarks: editModal.remarks,
          auditedBy: editModal.auditedBy,
          auditedAt: new Date().toISOString(),
          overrideStatus: editModal.customStatus
        }
      }));

      // 2. Automatically save into System Attendance field in Store
      await addForceAttendance({
        employeeId: rec.employeeId,
        date: rec.date,
        inTime: editModal.inTime || '09:00',
        outTime: editModal.outTime || '18:00',
        reason: editModal.remarks || 'HR Muster Audit Override',
        approvedBy: editModal.auditedBy || 'HR Manager',
        remarks: editModal.remarks
      });

      // 3. Log Audit Trail
      await addAuditLog({
        employeeId: rec.employeeId,
        employeeName: rec.employeeName,
        date: rec.date,
        field: 'Muster Audit Override & Attendance Sync',
        oldValue: `Muster: ${rec.fieldStatus} | Bio: ${rec.bioStatus}`,
        newValue: `Status: ${editModal.customStatus} (${editModal.inTime} - ${editModal.outTime})`,
        changedBy: editModal.auditedBy || 'HR Manager',
        remarks: editModal.remarks
      });

      toast.success(`Attendance automatically saved for ${rec.employeeName} on ${rec.date} with HR Remarks!`);
      setEditModal(prev => ({ ...prev, isOpen: false }));
    } catch (err) {
      toast.error('Failed to save attendance override.');
    }
  };

  // Export Matrix Muster Spreadsheet
  const handleExportMusterMatrix = () => {
    const headers = ['Emp ID', 'Employee Name', 'Department', ...matrixDates.map(d => `${d.dayNum}`)];

    const rows = matrixEmployees.map(emp => {
      const rowData: Record<string, any> = {
        'Emp ID': emp.id,
        'Employee Name': emp.name,
        'Department': emp.department
      };

      matrixDates.forEach(d => {
        const key = `${emp.id}_${d.dateStr}`;
        const comp = auditComparisons.find(c => c.id === key);
        rowData[`${d.dayNum}`] = comp?.fieldStatus || '-';
      });

      return rowData;
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, `Muster_Matrix_${selectedMonth}`);
    XLSX.writeFile(workbook, `Muster_Matrix_${selectedMonth}.xlsx`);
    toast.success(`Exported Muster Matrix for ${selectedMonth}!`);
  };

  // Export Detailed Audit Report
  const handleExportAuditExcel = () => {
    const rows = auditComparisons.map((rec, idx) => ({
      'S.No': idx + 1,
      'Emp ID': rec.employeeId,
      'Employee Name': rec.employeeName,
      'Department': rec.department,
      'Date (A.D.)': rec.date,
      'Date (B.S.)': rec.bsDate,
      'Muster Status': rec.fieldStatus || 'N/A',
      'Bio Status': rec.bioStatus || 'N/A',
      'Bio In': rec.bioInTime || '-',
      'Bio Out': rec.bioOutTime || '-',
      'Audit Classification': rec.auditResult,
      'Audit Group': rec.auditGroup,
      'Issue Reason': rec.issueReason,
      'HR Decision': rec.decision,
      'HR Remarks': rec.hrRemarks || '-',
      'Audited By': rec.auditedBy || '-'
    }));

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance Audit');
    XLSX.writeFile(workbook, `Fresh_Attendance_Audit_${new Date().toISOString().slice(0, 10)}.xlsx`);
    toast.success('Exported Audit Report Excel!');
  };

  return (
    <div className="space-y-6">

      {/* Header & File Upload Panel */}
      <Card className="p-6 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 pb-5 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
              <ShieldCheck className="text-indigo-600" size={20} /> Fresh Attendance Audit & Matrix Cross-Check
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Upload Muster in Matrix/List format, cross-check against Biometric logs vice-versa, inspect flags, edit fields and auto-save directly into Attendance.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* View Mode Switcher */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
              <button
                onClick={() => setViewMode('matrix')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition",
                  viewMode === 'matrix' ? "bg-white dark:bg-slate-900 text-indigo-600 shadow-xs" : "text-slate-600 dark:text-slate-400"
                )}
              >
                <Grid size={14} /> Matrix View
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition",
                  viewMode === 'list' ? "bg-white dark:bg-slate-900 text-indigo-600 shadow-xs" : "text-slate-600 dark:text-slate-400"
                )}
              >
                <List size={14} /> Audit List
              </button>
            </div>

            <Button variant="outline" size="sm" onClick={handleDownloadSampleMatrix} className="h-9 gap-1.5 text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900/50 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 font-bold">
              <Download size={14} /> Sample Matrix Download
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportMusterMatrix} disabled={fieldRecords.length === 0} className="h-9">
              <FileSpreadsheet size={14} className="text-emerald-600" /> Export Muster Matrix
            </Button>
            <Button variant="outline" size="sm" onClick={handleExportAuditExcel} disabled={auditComparisons.length === 0} className="h-9">
              <Download size={14} className="text-indigo-600" /> Export Audit Report
            </Button>
          </div>
        </div>

        {/* Upload & Context Selector Controls */}
        <div className="pt-4 grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
          <div className="md:col-span-5 bg-slate-50 dark:bg-slate-800/80 p-3 rounded-2xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Audit Month (for Matrix Headers)
              </label>
              <div className="flex items-center bg-slate-200 dark:bg-slate-700 p-0.5 rounded-lg text-[10px] font-bold">
                <button
                  type="button"
                  onClick={() => setCalendarType('BS')}
                  className={cn(
                    "px-2 py-0.5 rounded-md transition",
                    calendarType === 'BS' ? "bg-indigo-600 text-white shadow-xs" : "text-slate-600 dark:text-slate-300"
                  )}
                >
                  BS (Nepali)
                </button>
                <button
                  type="button"
                  onClick={() => setCalendarType('AD')}
                  className={cn(
                    "px-2 py-0.5 rounded-md transition",
                    calendarType === 'AD' ? "bg-indigo-600 text-white shadow-xs" : "text-slate-600 dark:text-slate-300"
                  )}
                >
                  AD (English)
                </button>
              </div>
            </div>

            {calendarType === 'BS' ? (
              <div className="space-y-1.5">
                <div className="grid grid-cols-12 gap-1.5">
                  <select
                    value={selectedBsYear}
                    onChange={(e) => setSelectedBsYear(parseInt(e.target.value, 10))}
                    className="col-span-4 h-9 px-2 text-xs font-mono font-bold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
                  >
                    {[2080, 2081, 2082, 2083, 2084, 2085, 2086].map(y => (
                      <option key={y} value={y}>{y} BS</option>
                    ))}
                  </select>

                  <select
                    value={selectedBsMonth}
                    onChange={(e) => setSelectedBsMonth(parseInt(e.target.value, 10))}
                    className="col-span-8 h-9 px-2 text-xs font-bold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
                  >
                    {NEPALI_MONTHS.map(m => {
                      const engLabelMap: Record<number, string> = {
                        0: 'Apr/May',
                        1: 'May/Jun',
                        2: 'Jun/Jul',
                        3: 'July/Aug',   // Shrawan
                        4: 'Aug/Sep',
                        5: 'Sep/Oct',
                        6: 'Oct/Nov',
                        7: 'Nov/Dec',
                        8: 'Dec/Jan',
                        9: 'Jan/Feb',
                        10: 'Feb/Mar',
                        11: 'Mar/Apr'
                      };
                      return (
                        <option key={m.value} value={m.value}>
                          {m.name} ({engLabelMap[m.value]}) — {m.nepaliName}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <div className="flex items-center justify-between text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold px-0.5">
                  <span>{NEPALI_MONTHS[selectedBsMonth].name} {selectedBsYear} BS</span>
                  <span className="font-mono">{getNepaliMonthEnglishEquivalent(selectedBsYear, selectedBsMonth)} A.D.</span>
                </div>
              </div>
            ) : (
              <div>
                <input 
                  type="month" 
                  value={selectedMonth} 
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="w-full h-9 px-3 text-xs font-mono font-semibold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
                />
              </div>
            )}
          </div>

          <div className="md:col-span-4">
            <div className="border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-indigo-500 dark:hover:border-indigo-500 rounded-2xl p-3 flex items-center justify-between gap-2 bg-slate-50/50 dark:bg-slate-800/30 transition group">
              <label className="flex items-center gap-2.5 cursor-pointer flex-1 min-w-0">
                <Upload size={18} className="text-indigo-500 group-hover:scale-110 transition-transform shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate">
                    {fileName ? `Uploaded: ${fileName}` : 'Click to Upload Muster File (.xlsx, .csv)'}
                  </p>
                  <p className="text-[10px] text-slate-400 truncate">
                    Supports Matrix Format (1..31) or Flat List
                  </p>
                </div>
                <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" />
              </label>

              <button
                type="button"
                onClick={handleDownloadSampleMatrix}
                className="px-2 py-1 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 border border-indigo-200/80 dark:border-indigo-800/60 rounded-lg flex items-center gap-1 shrink-0 transition"
                title="Download Sample Matrix Excel Template"
              >
                <Download size={11} /> Sample Matrix
              </button>
            </div>
          </div>

          <div className="md:col-span-3 bg-indigo-50/60 dark:bg-indigo-950/40 p-3 rounded-2xl border border-indigo-100 dark:border-indigo-900/50">
            <div className="flex items-center justify-between text-xs font-bold text-indigo-900 dark:text-indigo-200">
              <span>Muster Records:</span>
              <span className="font-mono text-sm">{fieldRecords.length}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-indigo-700 dark:text-indigo-300 mt-1">
              <span>Bio Records Loaded:</span>
              <span className="font-mono">{processedData.length}</span>
            </div>
          </div>
        </div>
      </Card>

      {/* KPI Audit Metrics */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
        <div 
          onClick={() => { setGroupFilter('All'); setFlaggedOnly(false); }} 
          className={cn(
            "p-3.5 rounded-2xl border cursor-pointer transition shadow-xs",
            groupFilter === 'All' && !flaggedOnly ? "bg-slate-900 text-white border-slate-900" : "bg-white dark:bg-slate-900 border-slate-200/80 dark:border-slate-800"
          )}
        >
          <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Audited</p>
          <p className="text-lg font-black mt-1 font-mono">{kpiMetrics.total}</p>
        </div>

        <div 
          onClick={() => { setGroupFilter('VALID'); setFlaggedOnly(false); }}
          className={cn(
            "p-3.5 rounded-2xl border cursor-pointer transition shadow-xs",
            groupFilter === 'VALID' ? "bg-emerald-600 text-white border-emerald-600" : "bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-900/40"
          )}
        >
          <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Valid Matches</p>
          <p className="text-lg font-black mt-1 font-mono text-emerald-800 dark:text-emerald-200">{kpiMetrics.valid}</p>
        </div>

        <div 
          onClick={() => { setFlaggedOnly(true); }}
          className={cn(
            "p-3.5 rounded-2xl border cursor-pointer transition shadow-xs",
            flaggedOnly ? "bg-rose-600 text-white border-rose-600" : "bg-rose-50/50 dark:bg-rose-950/20 border-rose-200/60 dark:border-rose-900/40"
          )}
        >
          <p className="text-[10px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">Flagged Exceptions</p>
          <p className="text-lg font-black mt-1 font-mono text-rose-800 dark:text-rose-200">{kpiMetrics.reviewRequired + kpiMetrics.invalid}</p>
        </div>

        <div 
          onClick={() => { setGroupFilter('REVIEW REQUIRED'); setFlaggedOnly(false); }}
          className={cn(
            "p-3.5 rounded-2xl border cursor-pointer transition shadow-xs",
            groupFilter === 'REVIEW REQUIRED' && !flaggedOnly ? "bg-amber-600 text-white border-amber-600" : "bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/60 dark:border-amber-900/40"
          )}
        >
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Review Required</p>
          <p className="text-lg font-black mt-1 font-mono text-amber-800 dark:text-amber-200">{kpiMetrics.reviewRequired}</p>
        </div>

        <div className="bg-orange-50/50 dark:bg-orange-950/20 p-3.5 rounded-2xl border border-orange-200/60 dark:border-orange-900/40">
          <p className="text-[10px] font-bold uppercase tracking-wider text-orange-600 dark:text-orange-400">Bio Not Found</p>
          <p className="text-lg font-black mt-1 font-mono text-orange-800 dark:text-orange-200">{kpiMetrics.bioNotFound}</p>
        </div>

        <div className="bg-indigo-50/50 dark:bg-indigo-950/20 p-3.5 rounded-2xl border border-indigo-200/60 dark:border-indigo-900/40">
          <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Audit Accuracy %</p>
          <p className="text-lg font-black mt-1 font-mono text-indigo-800 dark:text-indigo-200">{kpiMetrics.accuracy}%</p>
        </div>
      </div>

      {/* Filter Row */}
      <Card className="p-4 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm">
        <div className="grid grid-cols-1 sm:grid-cols-3 md:grid-cols-12 gap-3 items-center">
          <div className="md:col-span-4">
            <Input 
              placeholder="Search Employee ID, Name, Department..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              icon={<Search size={14} className="text-slate-400" />}
              className="h-9 text-xs"
            />
          </div>

          <div className="md:col-span-3">
            <select 
              value={groupFilter}
              onChange={(e) => setGroupFilter(e.target.value)}
              className="h-9 w-full px-3 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
            >
              <option value="All">All Audit Groups</option>
              <option value="VALID">VALID</option>
              <option value="INVALID">INVALID</option>
              <option value="REVIEW REQUIRED">REVIEW REQUIRED</option>
              <option value="NOT APPLICABLE">NOT APPLICABLE</option>
            </select>
          </div>

          <div className="md:col-span-3">
            <select 
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="h-9 w-full px-3 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none"
            >
              <option value="All">All Classifications</option>
              <option value="VALID — BIO MATCH">VALID — BIO MATCH</option>
              <option value="VALID — WEEKLY OFF WORKED">VALID — WEEKLY OFF WORKED</option>
              <option value="VALID — PUBLIC HOLIDAY WORKED">VALID — PUBLIC HOLIDAY WORKED</option>
              <option value="VALID — WEEKLY OFF">VALID — WEEKLY OFF</option>
              <option value="VALID — PUBLIC HOLIDAY">VALID — PUBLIC HOLIDAY</option>
              <option value="VALID — ABSENCE MATCH">VALID — ABSENCE MATCH</option>
              <option value="REVIEW REQUIRED — BIO NOT FOUND">REVIEW REQUIRED — BIO NOT FOUND</option>
              <option value="REVIEW REQUIRED — MISS IN">REVIEW REQUIRED — MISS IN</option>
              <option value="REVIEW REQUIRED — MISS OUT">REVIEW REQUIRED — MISS OUT</option>
              <option value="REVIEW REQUIRED — SINGLE PUNCH">REVIEW REQUIRED — SINGLE PUNCH</option>
              <option value="REVIEW REQUIRED — ATTENDANCE STATUS MISMATCH">REVIEW REQUIRED — ATTENDANCE STATUS MISMATCH</option>
            </select>
          </div>

          <div className="md:col-span-2 flex items-center justify-end">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-300">
              <input 
                type="checkbox" 
                checked={flaggedOnly} 
                onChange={(e) => setFlaggedOnly(e.target.checked)} 
                className="rounded text-indigo-600 focus:ring-indigo-500"
              />
              <span>Flagged Only</span>
            </label>
          </div>
        </div>
      </Card>

      {/* MATRIX VIEW (GRID) */}
      {viewMode === 'matrix' && (
        <Card className="overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="p-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs text-slate-600 dark:text-slate-400">
            <span className="font-bold flex items-center gap-1.5">
              <Grid size={14} className="text-indigo-600" />
              Muster Matrix Grid ({selectedMonth}) — Click any cell to inspect, edit flag & save into Attendance
            </span>
            <div className="flex items-center gap-3 text-[11px]">
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span> Valid Match</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Review / Discrepancy Flag</span>
              <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span> Bio / Master Missing</span>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[650px] custom-scrollbar">
            <table className="w-full text-left border-collapse text-[11px]">
              <thead className="bg-slate-900 text-white sticky top-0 z-20">
                <tr>
                  <th className="p-2.5 w-12 text-center font-bold sticky left-0 z-30 bg-slate-900">#</th>
                  <th className="p-2.5 min-w-[180px] font-bold sticky left-12 z-30 bg-slate-900 border-r border-slate-800">
                    Employee
                  </th>
                  {matrixDates.map(d => (
                    <th key={d.dateStr} className="p-2 min-w-[42px] text-center font-mono font-bold border-r border-slate-800">
                      <div>{d.dayNum}</div>
                      <div className="text-[9px] text-slate-400 font-normal">{d.dayName}</div>
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900 font-mono">
                {matrixEmployees.length > 0 ? matrixEmployees.map((emp, empIdx) => (
                  <tr key={emp.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                    <td className="p-2 text-center text-slate-400 font-mono sticky left-0 z-10 bg-white dark:bg-slate-900">
                      {empIdx + 1}
                    </td>

                    <td className="p-2 font-sans sticky left-12 z-10 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800">
                      <p className="font-bold text-slate-800 dark:text-slate-100 truncate max-w-[160px]">{emp.name}</p>
                      <p className="text-[10px] text-slate-400 font-mono truncate">{emp.id} • {emp.department}</p>
                    </td>

                    {matrixDates.map(d => {
                      const key = `${emp.id}_${d.dateStr}`;
                      const comp = auditComparisons.find(c => c.id === key);

                      if (!comp) {
                        return (
                          <td key={d.dateStr} className="p-1 text-center border-r border-slate-100 dark:border-slate-800/60 text-slate-300">
                            -
                          </td>
                        );
                      }

                      const isFlagged = comp.auditGroup === 'REVIEW REQUIRED' || comp.auditGroup === 'INVALID';
                      const isAccepted = comp.decision === 'Accepted';

                      let badgeClass = "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";
                      if (isAccepted) {
                        badgeClass = "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 ring-1 ring-emerald-500/50";
                      } else if (isFlagged) {
                        badgeClass = "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 ring-1 ring-amber-500";
                      } else if (comp.fieldStatus === 'P' || comp.fieldStatus === 'PWO' || comp.fieldStatus === 'PPH') {
                        badgeClass = "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300";
                      } else if (comp.fieldStatus === 'A') {
                        badgeClass = "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300";
                      }

                      return (
                        <td 
                          key={d.dateStr}
                          onClick={() => handleOpenEditCell(comp)}
                          title={`${comp.employeeName} (${comp.date}): Muster [${comp.fieldStatus || 'N/A'}] vs Bio [${comp.bioStatus || 'No Log'}] — ${comp.issueReason}`}
                          className="p-1 text-center border-r border-slate-100 dark:border-slate-800/60 cursor-pointer hover:scale-105 transition group relative"
                        >
                          <div className={cn("py-1 px-1 rounded text-[10px] font-bold flex items-center justify-center gap-0.5", badgeClass)}>
                            <span>{comp.fieldStatus || 'N/A'}</span>
                            {isFlagged && !isAccepted && (
                              <AlertTriangle size={10} className="text-amber-600 dark:text-amber-400 animate-pulse" />
                            )}
                            {isAccepted && (
                              <Check size={10} className="text-emerald-600 dark:text-emerald-400 font-black" />
                            )}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={matrixDates.length + 2} className="p-12 text-center text-slate-400 italic">
                      No employees match search criteria or no Muster matrix records loaded.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* LIST VIEW (DETAILED COMPARISON TABLE) */}
      {viewMode === 'list' && (
        <Card className="overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="overflow-x-auto max-h-[600px] custom-scrollbar">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-900 text-white sticky top-0 z-10">
                <tr>
                  <th className="p-3 w-10 text-center font-bold">#</th>
                  <th className="p-3 font-bold">Employee</th>
                  <th className="p-3 font-bold">Date (AD / BS)</th>
                  <th className="p-3 font-bold text-center">Muster Status</th>
                  <th className="p-3 font-bold text-center">Bio Status</th>
                  <th className="p-3 font-bold text-center">Bio In / Out</th>
                  <th className="p-3 font-bold">Audit Classification & Flags</th>
                  <th className="p-3 font-bold text-center">HR Status</th>
                  <th className="p-3 font-bold text-center">Action</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                {filteredAuditList.length > 0 ? filteredAuditList.map((rec, index) => {
                  const isFlagged = rec.auditGroup === 'REVIEW REQUIRED' || rec.auditGroup === 'INVALID';

                  return (
                    <tr key={rec.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition">
                      <td className="p-3 text-center text-slate-400 font-mono text-[11px]">{index + 1}</td>

                      <td className="p-3">
                        <p className="font-bold text-slate-800 dark:text-slate-100">{rec.employeeName}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{rec.employeeId} • {rec.department}</p>
                      </td>

                      <td className="p-3 font-mono">
                        <p className="text-slate-800 dark:text-slate-200 font-bold">{rec.date}</p>
                        <p className="text-[10px] text-slate-400">BS: {rec.bsDate}</p>
                      </td>

                      <td className="p-3 text-center">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-mono">
                          {rec.fieldStatus || 'N/A'}
                        </span>
                      </td>

                      <td className="p-3 text-center">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[10px] font-bold font-mono",
                          rec.bioStatus?.includes('Present') ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" :
                          rec.bioStatus === 'Absent' ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300" :
                          "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                        )}>
                          {rec.bioStatus || 'No Log'}
                        </span>
                      </td>

                      <td className="p-3 text-center font-mono text-[11px]">
                        <span className="text-emerald-600 font-bold">{rec.bioInTime || '--:--'}</span>
                        <span className="text-slate-300 mx-1">|</span>
                        <span className="text-indigo-600 font-bold">{rec.bioOutTime || '--:--'}</span>
                      </td>

                      <td className="p-3 max-w-xs">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider block w-fit",
                            rec.auditGroup === 'VALID' ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" :
                            rec.auditGroup === 'INVALID' ? "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300" :
                            "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300"
                          )}>
                            {rec.auditResult}
                          </span>
                          {isFlagged && rec.decision !== 'Accepted' && (
                            <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/60 px-1.5 py-0.5 rounded border border-amber-200">
                              <AlertTriangle size={10} /> Flagged
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-500 leading-snug">{rec.issueReason}</p>
                      </td>

                      <td className="p-3 text-center">
                        <span className={cn(
                          "px-2 py-1 rounded-full text-[10px] font-black uppercase tracking-wider border",
                          rec.decision === 'Accepted' ? "bg-emerald-50 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300" :
                          rec.decision === 'Rejected' ? "bg-rose-50 text-rose-700 border-rose-300 dark:bg-rose-950 dark:text-rose-300" :
                          "bg-slate-100 text-slate-600 border-slate-300 dark:bg-slate-800 dark:text-slate-400"
                        )}>
                          {rec.decision}
                        </span>
                      </td>

                      <td className="p-3 text-center">
                        <Button 
                          size="sm" 
                          variant={isFlagged && rec.decision !== 'Accepted' ? 'primary' : 'outline'} 
                          onClick={() => handleOpenEditCell(rec)}
                          className="h-7 text-[11px] px-2.5 gap-1"
                        >
                          <Edit3 size={12} /> Edit & Sync
                        </Button>
                      </td>

                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={9} className="p-12 text-center text-slate-400 italic">
                      {fieldRecords.length === 0 
                        ? "No Field/Muster Attendance uploaded yet. Click 'Upload Muster File' or 'Load Sample Matrix' to run the audit cross-check."
                        : "No audit records match the current filter selection."
                      }
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* EDIT & AUTO-SAVE ATTENDANCE MODAL */}
      {editModal.isOpen && editModal.record && (
        <Modal
          isOpen={editModal.isOpen}
          onClose={() => setEditModal(prev => ({ ...prev, isOpen: false }))}
          title={`Edit Attendance & Auto-Save to Master Record — ${editModal.record.employeeName}`}
        >
          <div className="space-y-4 text-xs">
            
            {/* Context Summary Box */}
            <div className="p-3.5 bg-slate-50 dark:bg-slate-800/80 rounded-2xl border border-slate-200 dark:border-slate-700 space-y-1.5">
              <div className="flex items-center justify-between font-bold text-slate-800 dark:text-slate-200">
                <span>{editModal.record.employeeName} ({editModal.record.employeeId})</span>
                <span className="font-mono text-indigo-600 dark:text-indigo-400">{editModal.record.date} (BS: {editModal.record.bsDate})</span>
              </div>
              
              <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                <div className="bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400 font-semibold block">Uploaded Muster Status:</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200 font-mono text-sm">{editModal.record.fieldStatus || 'N/A'}</span>
                </div>
                <div className="bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400 font-semibold block">Biometric Log Status:</span>
                  <span className="font-bold text-indigo-600 dark:text-indigo-400 font-mono text-sm">{editModal.record.bioStatus || 'No Log'}</span>
                  <span className="text-[10px] text-slate-400 block mt-0.5 font-mono">In: {editModal.record.bioInTime || '--'} | Out: {editModal.record.bioOutTime || '--'}</span>
                </div>
              </div>

              <div className="p-2 bg-amber-50 dark:bg-amber-950/50 rounded-xl border border-amber-200/60 dark:border-amber-900/50 text-amber-800 dark:text-amber-200 font-medium text-[11px] flex items-start gap-2 mt-2">
                <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-600" />
                <div>
                  <strong>Audit Finding:</strong> {editModal.record.auditResult}
                  <p className="text-[10px] text-amber-700 dark:text-amber-300">{editModal.record.issueReason}</p>
                </div>
              </div>
            </div>

            {/* Attendance Status Selection */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Final Attendance Status to Save into System
              </label>
              <select
                value={editModal.customStatus}
                onChange={(e) => setEditModal(prev => ({ ...prev, customStatus: e.target.value }))}
                className="w-full h-10 px-3 text-xs font-bold text-slate-800 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="P">P — Present (Standard)</option>
                <option value="PWO">PWO — Present on Weekly Off</option>
                <option value="PPH">PPH — Present on Public Holiday</option>
                <option value="A">A — Absent</option>
                <option value="WO">WO — Weekly Off</option>
                <option value="PH">PH — Public Holiday</option>
                <option value="L">L — Paid Leave</option>
                <option value="MI">MI — Missing In Punch</option>
                <option value="MO">MO — Missing Out Punch</option>
              </select>
            </div>

            {/* Time Adjustments */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Shift In Time (HH:mm)
                </label>
                <input
                  type="time"
                  value={editModal.inTime}
                  onChange={(e) => setEditModal(prev => ({ ...prev, inTime: e.target.value }))}
                  className="w-full h-9 px-2 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Shift Out Time (HH:mm)
                </label>
                <input
                  type="time"
                  value={editModal.outTime}
                  onChange={(e) => setEditModal(prev => ({ ...prev, outTime: e.target.value }))}
                  className="w-full h-9 px-2 text-xs font-mono rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 outline-none"
                />
              </div>
            </div>

            {/* HR Remarks */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                HR Audit Remarks / Justification <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                value={editModal.remarks}
                onChange={(e) => setEditModal(prev => ({ ...prev, remarks: e.target.value }))}
                placeholder="Enter justification for overriding attendance (e.g. Site supervisor physical signoff verified)..."
                className="w-full p-2.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Audited By */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                Audited By (HR Signature)
              </label>
              <input
                type="text"
                value={editModal.auditedBy}
                onChange={(e) => setEditModal(prev => ({ ...prev, auditedBy: e.target.value }))}
                className="w-full h-9 px-3 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 outline-none"
              />
            </div>

            {/* Modal Actions */}
            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
              <Button variant="outline" size="sm" onClick={() => setEditModal(prev => ({ ...prev, isOpen: false }))}>
                Cancel
              </Button>
              <Button variant="primary" size="sm" onClick={handleSaveAndSyncAttendance} className="gap-1.5">
                <Save size={14} /> Save & Auto-Sync to Attendance Field
              </Button>
            </div>

          </div>
        </Modal>
      )}

    </div>
  );
}
