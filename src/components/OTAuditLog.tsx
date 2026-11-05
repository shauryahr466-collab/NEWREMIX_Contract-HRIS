import React, { useState, useMemo, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { 
  Edit2, CheckCircle, XCircle, Trash2, ChevronLeft, ChevronRight, 
  Layers, ShieldCheck, AlertTriangle, AlertCircle, Info, 
  ChevronDown, ChevronUp, Clock, FileCheck, CheckCircle2, UserCheck,
  AlertOctagon, Sliders, Eye
} from 'lucide-react';
import { OvertimeRecord, Employee, ProcessedAttendance, ShiftMaster, RawPunch } from '../types';
import { normalizeEmployeeId, formatPunchTime, getAttendanceInAndOut, toDeviceWallClockIso } from '../lib/utils';
import { Badge } from './ui';
import { OTCrossCheckPanel, AuditEvaluation } from './OTCrossCheckPanel';

interface OTAuditLogProps {
  records: OvertimeRecord[];
  employees: Employee[];
  attendanceData: ProcessedAttendance[];
  shifts: ShiftMaster[];
  punches?: RawPunch[];
  onEdit: (record: OvertimeRecord) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onDelete?: (id: string) => void;
  onOpenProfile: (id: string) => void;
  selectedIds?: string[];
  onSelect?: (id: string) => void;
  onSelectAll?: (ids: string[]) => void;
}

export type AuditFilterType = 'ALL' | 'ISSUES' | 'ERROR' | 'MISMATCH' | 'WARNING' | 'PASS';

export const OTAuditLog: React.FC<OTAuditLogProps> = ({ 
  records, 
  employees, 
  attendanceData, 
  shifts,
  punches = [],
  onEdit,
  onApprove,
  onReject,
  onDelete,
  onOpenProfile,
  selectedIds = [],
  onSelect,
  onSelectAll
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number | 'All'>(50);
  const [deletingRecord, setDeletingRecord] = useState<OvertimeRecord | null>(null);
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);
  const [auditFilter, setAuditFilter] = useState<AuditFilterType>('ALL');
  const [isAuditMode, setIsAuditMode] = useState<boolean>(true);
  const [inspectRecord, setInspectRecord] = useState<OvertimeRecord | null>(null);

  // Reset to first page when record set changes
  useEffect(() => {
    setCurrentPage(1);
  }, [records.length, auditFilter]);

  // Fast O(1) Map Lookups using normalized employee IDs
  const empMap = useMemo(() => {
    const map = new Map<string, Employee>();
    employees.forEach(e => {
      map.set(e.id, e);
      map.set(normalizeEmployeeId(e.id), e);
    });
    return map;
  }, [employees]);

  const attMap = useMemo(() => {
    const map = new Map<string, ProcessedAttendance>();
    attendanceData.forEach(a => {
      map.set(`${a.employeeId}_${a.date}`, a);
      map.set(`${normalizeEmployeeId(a.employeeId)}_${a.date}`, a);
    });
    return map;
  }, [attendanceData]);

  const shiftMap = useMemo(() => {
    const map = new Map<string, ShiftMaster>();
    shifts.forEach(s => map.set(s.id, s));
    return map;
  }, [shifts]);

  // Fast O(1) grouping for raw biometric punches by normalized employee and date
  const punchesByEmpDate = useMemo(() => {
    const map = new Map<string, RawPunch[]>();
    punches.forEach(p => {
      const cleanIso = toDeviceWallClockIso(p.punchDatetime);
      if (!cleanIso) return;
      const dateStr = cleanIso.includes('T') ? cleanIso.split('T')[0] : cleanIso.split(' ')[0];
      const normId = normalizeEmployeeId(p.employeeId);
      const key = `${normId}_${dateStr}`;
      const list = map.get(key) || [];
      list.push({ ...p, punchDatetime: cleanIso });
      map.set(key, list);
    });
    // Sort each day's punches chronologically
    map.forEach(list => {
      list.sort((a, b) => a.punchDatetime.localeCompare(b.punchDatetime));
    });
    return map;
  }, [punches]);

  // Audit evaluation engine for any single record
  const evaluateAudit = (record: OvertimeRecord) => {
    const normId = normalizeEmployeeId(record.employeeId);
    const emp = empMap.get(normId) || empMap.get(record.employeeId);
    const att = attMap.get(`${normId}_${record.date}`) || attMap.get(`${record.employeeId}_${record.date}`);
    const dayPunches = punchesByEmpDate.get(`${normId}_${record.date}`) || [];
    const shift = record.shiftId ? shiftMap.get(record.shiftId) : (att?.shiftId ? shiftMap.get(att.shiftId) : (emp?.shiftId ? shiftMap.get(emp.shiftId) : shifts[0]));

    // Accurate In/Out time resolution
    const punchInfo = getAttendanceInAndOut(att);
    
    // Fallback to raw punches if attendance didn't capture punch boundaries
    let inTime = record.inTime || punchInfo.inTime;
    let outTime = record.outTime || punchInfo.outTime;
    let isSinglePunch = punchInfo.isSinglePunch;

    if (inTime === '--:--' && dayPunches.length > 0) {
      inTime = formatPunchTime(dayPunches[0].punchDatetime);
    }
    if (outTime === '--:--' && dayPunches.length > 1) {
      outTime = formatPunchTime(dayPunches[dayPunches.length - 1].punchDatetime);
      isSinglePunch = false;
    } else if (dayPunches.length === 1 && !att?.outTime) {
      isSinglePunch = true;
      outTime = '--:--';
    }

    const rawPunchTimes = dayPunches.map(p => formatPunchTime(p.punchDatetime));
    const workingHours = Number((att?.workingHours || 0).toFixed(2));
    const standardDutyHours = Number((record.standardDutyHours || emp?.targetWorkingHours || (att as any)?.expectedHours || 8).toFixed(2));
    const bioOtHours = Number((record.bioOtHours ?? Math.max(0, workingHours - standardDutyHours)).toFixed(2));
    const supervisorOtHours = Number((record.supervisorOtHours ?? 0).toFixed(2));
    const finalOt = Number((record.hours ?? Math.min(bioOtHours, supervisorOtHours)).toFixed(2));
    const hrSaving = Number((record.hrSaving ?? Math.max(0, bioOtHours - finalOt)).toFixed(2));
    const variance = Number((supervisorOtHours - bioOtHours).toFixed(2));

    const rawFirstPunch = rawPunchTimes.length > 0 ? rawPunchTimes[0] : undefined;
    const rawLastPunch = rawPunchTimes.length > 1 ? rawPunchTimes[rawPunchTimes.length - 1] : undefined;
    const isManualForced = Boolean(att?.remarks?.toLowerCase().includes('forced') || att?.remarks?.toLowerCase().includes('manual'));

    const inMismatch = Boolean(rawFirstPunch && inTime !== '--:--' && rawFirstPunch !== inTime && !isManualForced);
    const outMismatch = Boolean(rawLastPunch && outTime !== '--:--' && rawLastPunch !== outTime && !isManualForced);

    let auditStatus: 'PASS' | 'WARNING' | 'MISMATCH' | 'ERROR' = 'PASS';
    let auditTitle = 'Audit Verified (PASS)';
    let auditDescription = 'Raw punches, reconciled times, roster duration, and claimed OT cross-checked without discrepancy.';
    let isIssue = false;

    if ((workingHours <= 0 || att?.status === 'Absent' || att?.status === 'Paid Leave') && (supervisorOtHours > 0 || record.hours > 0)) {
      auditStatus = 'ERROR';
      auditTitle = 'Zero Work / Absent Day Claim';
      auditDescription = `Attendance status is ${att?.status || 'Zero Hours'} with 0h worked, but ${supervisorOtHours}h overtime is recorded.`;
      isIssue = true;
    } else if (supervisorOtHours > bioOtHours) {
      auditStatus = 'ERROR';
      auditTitle = 'Claim Exceeds Biometrics (Over-Claim)';
      auditDescription = `Supervisor OT (${supervisorOtHours}h) exceeds actual biometric presence (${bioOtHours}h) by +${variance}h.`;
      isIssue = true;
    } else if (inMismatch || outMismatch) {
      auditStatus = 'MISMATCH';
      auditTitle = 'In/Out Timestamp Mismatch';
      auditDescription = inMismatch && outMismatch 
        ? `Both In (${inTime} vs raw ${rawFirstPunch}) and Out (${outTime} vs raw ${rawLastPunch}) diverge from biometric punches.`
        : inMismatch 
          ? `Reconciled In (${inTime}) diverges from raw first punch (${rawFirstPunch}).`
          : `Reconciled Out (${outTime}) diverges from raw last punch (${rawLastPunch}).`;
      isIssue = true;
    } else if (isSinglePunch || (dayPunches.length === 1 && !att?.outTime)) {
      auditStatus = 'WARNING';
      auditTitle = 'Single Punch Recorded';
      auditDescription = `Only one punch (${inTime}) recorded. Physical departure punch is missing; supervisor verification needed.`;
      isIssue = true;
    } else if (isManualForced) {
      auditStatus = 'WARNING';
      auditTitle = 'Manual Reconciliation Applied';
      auditDescription = `Attendance adjusted via Admin Force Attendance: ${att?.remarks}`;
      isIssue = false;
    } else if (bioOtHours > supervisorOtHours && bioOtHours > 0) {
      auditStatus = 'WARNING';
      auditTitle = 'HR Cost Saving Realized';
      auditDescription = `Biometric OT (${bioOtHours}h) exceeds claimed OT (${supervisorOtHours}h). Company realized ${hrSaving}h cost saving.`;
      isIssue = false;
    }

    return {
      normId,
      emp,
      att,
      shift,
      inTime,
      outTime,
      isSinglePunch,
      hasIn: inTime !== '--:--',
      hasOut: outTime !== '--:--',
      rawPunchTimes,
      rawPunchCount: dayPunches.length,
      rawFirstPunch,
      rawLastPunch,
      workingHours,
      standardDutyHours,
      bioOtHours,
      supervisorOtHours,
      finalOt,
      hrSaving,
      variance,
      auditStatus,
      auditTitle,
      auditDescription,
      isIssue,
      inMismatch,
      outMismatch
    } as AuditEvaluation;
  };

  // Pre-calculate audit status for filtering and summary counts
  const recordsWithAudit = useMemo(() => {
    return records.map(record => ({
      record,
      audit: evaluateAudit(record)
    }));
  }, [records, empMap, attMap, shiftMap, punchesByEmpDate]);

  // Audit filter counts
  const auditCounts = useMemo(() => {
    let issues = 0;
    let errors = 0;
    let mismatches = 0;
    let warnings = 0;
    let pass = 0;

    recordsWithAudit.forEach(({ audit }) => {
      if (audit.isIssue) issues++;
      if (audit.auditStatus === 'ERROR') errors++;
      if (audit.auditStatus === 'MISMATCH') mismatches++;
      if (audit.auditStatus === 'WARNING') warnings++;
      if (audit.auditStatus === 'PASS') pass++;
    });

    return {
      total: records.length,
      issues,
      errors,
      mismatches,
      warnings,
      pass
    };
  }, [recordsWithAudit, records.length]);

  // Filtered by audit criteria
  const auditFilteredRecords = useMemo(() => {
    if (auditFilter === 'ALL') return recordsWithAudit;
    if (auditFilter === 'ISSUES') return recordsWithAudit.filter(r => r.audit.isIssue);
    if (auditFilter === 'ERROR') return recordsWithAudit.filter(r => r.audit.auditStatus === 'ERROR');
    if (auditFilter === 'MISMATCH') return recordsWithAudit.filter(r => r.audit.auditStatus === 'MISMATCH');
    if (auditFilter === 'WARNING') return recordsWithAudit.filter(r => r.audit.auditStatus === 'WARNING');
    if (auditFilter === 'PASS') return recordsWithAudit.filter(r => r.audit.auditStatus === 'PASS');
    return recordsWithAudit;
  }, [recordsWithAudit, auditFilter]);

  const totalPages = useMemo(() => {
    if (pageSize === 'All') return 1;
    return Math.max(1, Math.ceil(auditFilteredRecords.length / Number(pageSize)));
  }, [auditFilteredRecords.length, pageSize]);

  const currentRecords = useMemo(() => {
    if (pageSize === 'All') return auditFilteredRecords;
    const start = (currentPage - 1) * Number(pageSize);
    return auditFilteredRecords.slice(start, start + Number(pageSize));
  }, [auditFilteredRecords, currentPage, pageSize]);

  const isAllPageSelected = useMemo(() => {
    if (currentRecords.length === 0) return false;
    return currentRecords.every(r => selectedIds.includes(r.record.id));
  }, [currentRecords, selectedIds]);

  const handleSelectPageToggle = (checked: boolean) => {
    if (!onSelectAll) return;
    if (checked) {
      const pageIds = currentRecords.map(r => r.record.id);
      const combined = Array.from(new Set([...selectedIds, ...pageIds]));
      onSelectAll(combined);
    } else {
      const pageIdsSet = new Set(currentRecords.map(r => r.record.id));
      onSelectAll(selectedIds.filter(id => !pageIdsSet.has(id)));
    }
  };

  const formatDateSafely = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      return format(parseISO(dateStr), 'dd MMM yyyy');
    } catch {
      return dateStr;
    }
  };

  const renderAuditBadge = (status: 'PASS' | 'WARNING' | 'MISMATCH' | 'ERROR', size: 'sm' | 'md' = 'sm') => {
    switch (status) {
      case 'PASS':
        return (
          <span className={`inline-flex items-center gap-1 font-bold rounded-md bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 ${size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1'}`}>
            <ShieldCheck size={size === 'sm' ? 12 : 14} className="text-emerald-600 dark:text-emerald-400" />
            PASS
          </span>
        );
      case 'WARNING':
        return (
          <span className={`inline-flex items-center gap-1 font-bold rounded-md bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800 ${size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1'}`}>
            <AlertTriangle size={size === 'sm' ? 12 : 14} className="text-amber-600 dark:text-amber-400" />
            WARNING
          </span>
        );
      case 'MISMATCH':
        return (
          <span className={`inline-flex items-center gap-1 font-bold rounded-md bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800 ${size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1'}`}>
            <Sliders size={size === 'sm' ? 12 : 14} className="text-purple-600 dark:text-purple-400" />
            MISMATCH
          </span>
        );
      case 'ERROR':
        return (
          <span className={`inline-flex items-center gap-1 font-bold rounded-md bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 ${size === 'sm' ? 'text-[10px] px-2 py-0.5' : 'text-xs px-2.5 py-1'}`}>
            <AlertOctagon size={size === 'sm' ? 12 : 14} className="text-rose-600 dark:text-rose-400" />
            ERROR
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="space-y-4">
      {/* OT Audit Cross-Check Control Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-slate-50/80 dark:bg-slate-900/80 rounded-xl border border-slate-200/80 dark:border-slate-800">
        {/* Left: Audit Filter Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mr-1 flex items-center gap-1">
            <ShieldCheck size={14} className="text-indigo-600 dark:text-indigo-400" />
            Audit Cross-Check:
          </span>
          <button
            onClick={() => setAuditFilter('ALL')}
            className={`text-xs font-bold px-2.5 py-1 rounded-lg transition-all ${
              auditFilter === 'ALL'
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800'
            }`}
          >
            All Records ({auditCounts.total})
          </button>
          <button
            onClick={() => setAuditFilter('ISSUES')}
            className={`text-xs font-bold px-2.5 py-1 rounded-lg transition-all flex items-center gap-1.5 ${
              auditFilter === 'ISSUES'
                ? 'bg-rose-600 text-white shadow-xs'
                : auditCounts.issues > 0
                  ? 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800'
            }`}
          >
            <AlertCircle size={12} />
            Audit Issues ({auditCounts.issues})
          </button>
          <button
            onClick={() => setAuditFilter('ERROR')}
            className={`text-xs font-bold px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
              auditFilter === 'ERROR'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800'
            }`}
          >
            <AlertOctagon size={12} className={auditCounts.errors > 0 ? "text-rose-600" : ""} />
            Errors ({auditCounts.errors})
          </button>
          <button
            onClick={() => setAuditFilter('MISMATCH')}
            className={`text-xs font-bold px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
              auditFilter === 'MISMATCH'
                ? 'bg-purple-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800'
            }`}
          >
            <Sliders size={12} className={auditCounts.mismatches > 0 ? "text-purple-600" : ""} />
            Mismatches ({auditCounts.mismatches})
          </button>
          <button
            onClick={() => setAuditFilter('WARNING')}
            className={`text-xs font-bold px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
              auditFilter === 'WARNING'
                ? 'bg-amber-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800'
            }`}
          >
            <AlertTriangle size={12} className={auditCounts.warnings > 0 ? "text-amber-600" : ""} />
            Warnings ({auditCounts.warnings})
          </button>
          <button
            onClick={() => setAuditFilter('PASS')}
            className={`text-xs font-bold px-2.5 py-1 rounded-lg transition-all flex items-center gap-1 ${
              auditFilter === 'PASS'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-slate-800'
            }`}
          >
            <CheckCircle2 size={12} className="text-emerald-600" />
            Passed ({auditCounts.pass})
          </button>
        </div>

        {/* Right: Side-by-Side Toggle & Mode Toggle */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              if (inspectRecord) {
                setInspectRecord(null);
              } else {
                setInspectRecord(currentRecords[0]?.record || null);
              }
            }}
            className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${
              inspectRecord 
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs' 
                : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
            }`}
            title="Open side-by-side comparison panel for detailed audit"
          >
            <Eye size={14} />
            <span>Side-by-Side Panel: <strong>{inspectRecord ? 'OPEN' : 'CLOSED'}</strong></span>
          </button>

          <button
            onClick={() => setIsAuditMode(!isAuditMode)}
            className={`text-xs font-bold px-3 py-1.5 rounded-lg border transition-all flex items-center gap-1.5 ${
              isAuditMode 
                ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800' 
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
            }`}
            title="Toggle between Compact view and Detailed Audit Cross-Check view"
          >
            <ShieldCheck size={14} className={isAuditMode ? "text-indigo-600" : "text-slate-400"} />
            <span>Audit Mode: <strong>{isAuditMode ? 'ON' : 'OFF'}</strong></span>
          </button>
        </div>
      </div>

      {/* Side-by-Side Comparison Panel */}
      {inspectRecord && (
        <OTCrossCheckPanel
          selectedRecord={inspectRecord}
          audit={recordsWithAudit.find(r => r.record.id === inspectRecord.id)?.audit || evaluateAudit(inspectRecord)}
          allRecords={recordsWithAudit}
          onSelectRecord={(r) => setInspectRecord(r)}
          onEdit={onEdit}
          onApprove={onApprove}
          onReject={onReject}
          onClose={() => setInspectRecord(null)}
        />
      )}

      {/* Main Table Container */}
      <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
        <table className="w-full text-left border-collapse min-w-[1450px]">
          <thead className="bg-slate-50 dark:bg-slate-800/60 sticky top-0 z-20">
            <tr className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-200/80 dark:border-slate-800">
              <th className="px-3 py-3.5 w-10 text-center">
                <input 
                  type="checkbox"
                  checked={isAllPageSelected}
                  onChange={(e) => handleSelectPageToggle(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  title="Select all on this page"
                />
              </th>
              <th className="px-3 py-3.5 whitespace-nowrap">Employee Info</th>
              <th className="px-3 py-3.5 whitespace-nowrap">Date & Shift</th>
              <th className="px-3 py-3.5 whitespace-nowrap">Duty / Work</th>
              <th className="px-3 py-3.5 whitespace-nowrap">
                <div className="flex flex-col">
                  <span>Reconciled Punches</span>
                  <span className="text-[9px] font-normal text-slate-400 lowercase">actual 24-hr local in/out</span>
                </div>
              </th>
              <th className="px-3 py-3.5 whitespace-nowrap">Bio OT</th>
              <th className="px-3 py-3.5 whitespace-nowrap">Sup. OT</th>
              <th className="px-3 py-3.5 whitespace-nowrap text-indigo-600 dark:text-indigo-400">Final OT</th>
              <th className="px-3 py-3.5 whitespace-nowrap text-emerald-600 dark:text-emerald-400">HR Saving</th>
              <th className="px-3 py-3.5 whitespace-nowrap">Audit Status</th>
              <th className="px-3 py-3.5 whitespace-nowrap">OT Status</th>
              <th className="px-3 py-3.5 text-right sticky right-0 bg-slate-50 dark:bg-slate-800 z-10 border-l border-slate-200/80 dark:border-slate-800">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {currentRecords.length === 0 ? (
              <tr>
                <td colSpan={12} className="px-4 py-12 text-center text-slate-400 dark:text-slate-500">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Layers className="w-8 h-8 opacity-40" />
                    <p className="text-sm font-semibold">No overtime audit records found matching criteria</p>
                    <p className="text-xs text-slate-400">Try selecting "All Records" or adjust the date range</p>
                  </div>
                </td>
              </tr>
            ) : (
              currentRecords.map(({ record, audit }) => {
                const isSelected = selectedIds.includes(record.id);
                const isExpanded = expandedRecordId === record.id;
                const hasSaving = audit.hrSaving > 0;

                return (
                  <React.Fragment key={record.id}>
                    <tr 
                      className={`group transition-colors ${
                        isSelected 
                          ? 'bg-indigo-50/70 dark:bg-indigo-950/30' 
                          : inspectRecord?.id === record.id
                            ? 'bg-indigo-50/50 dark:bg-indigo-950/40 ring-1 ring-inset ring-indigo-500/30'
                            : audit.isIssue
                              ? 'bg-rose-50/20 dark:bg-rose-950/10 hover:bg-rose-50/40 dark:hover:bg-rose-950/20'
                              : hasSaving 
                                ? 'bg-teal-50/20 dark:bg-teal-950/10 hover:bg-teal-50/40 dark:hover:bg-teal-950/20' 
                                : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      {/* Selection */}
                      <td className="px-3 py-3 text-center">
                        <input 
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => onSelect?.(record.id)}
                          className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>

                      {/* Employee Info */}
                      <td className="px-3 py-3">
                        <div 
                          onClick={() => onOpenProfile(record.employeeId)}
                          className="cursor-pointer group/item"
                        >
                          <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight group-hover/item:text-indigo-600 dark:group-hover/item:text-indigo-400 transition-colors">
                            {audit.emp?.name || 'Unknown Staff'}
                          </p>
                          <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 mt-0.5 flex items-center gap-1">
                            <span className="font-mono">{record.employeeId}</span>
                            <span className="opacity-30">|</span>
                            <span>{audit.emp?.department || 'General'}</span>
                          </p>
                        </div>
                      </td>

                      {/* Date & Shift */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{formatDateSafely(record.date)}</p>
                        <div className="flex items-center gap-1 mt-0.5">
                          <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">
                            {audit.shift?.name || 'Day Shift'}
                          </span>
                          <span className="text-[10px] font-mono text-slate-400">
                            ({audit.shift?.startTime || '09:00'}-{audit.shift?.endTime || '18:00'})
                          </span>
                        </div>
                      </td>

                      {/* Duty / Work */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="flex flex-col">
                          <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400">
                            Std: <strong>{audit.standardDutyHours}h</strong>
                          </span>
                          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                            Work: {audit.workingHours}h
                          </span>
                        </div>
                      </td>

                      {/* Reconciled Punches */}
                      <td className="px-3 py-3 whitespace-nowrap font-mono">
                        <div className="flex flex-col text-[11px] gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-slate-400 w-7">IN:</span>
                            <span className={audit.hasIn ? "font-bold text-slate-800 dark:text-slate-200" : "text-amber-600 font-semibold"}>
                              {audit.inTime}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-slate-400 w-7">OUT:</span>
                            <span className={audit.hasOut ? "font-bold text-slate-800 dark:text-slate-200" : (audit.isSinglePunch ? "text-amber-600 font-semibold" : "text-slate-400")}>
                              {audit.isSinglePunch && !audit.hasOut ? '--:-- (Single)' : audit.outTime}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Bio OT */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">
                          {audit.bioOtHours}h
                        </span>
                      </td>

                      {/* Supervisor OT */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`text-xs font-bold ${audit.supervisorOtHours > audit.bioOtHours ? 'text-rose-600 font-black' : 'text-slate-700 dark:text-slate-300'}`}>
                          {audit.supervisorOtHours}h
                        </span>
                      </td>

                      {/* Final Eligible OT */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-md border border-indigo-100 dark:border-indigo-900/40">
                          {audit.finalOt}h
                        </span>
                      </td>

                      {/* HR Saving */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`text-xs font-bold ${
                          hasSaving 
                            ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-100/70 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded-md' 
                            : 'text-slate-400 dark:text-slate-600'
                        }`}>
                          {audit.hrSaving}h
                        </span>
                      </td>

                      {/* Audit Cross-Check Status */}
                      <td 
                        className="px-3 py-3 whitespace-nowrap cursor-pointer hover:bg-indigo-50/50 dark:hover:bg-indigo-950/30 transition-colors"
                        onClick={() => setInspectRecord(inspectRecord?.id === record.id ? null : record)}
                        title="Click to view full side-by-side audit comparison"
                      >
                        <div className="flex flex-col gap-0.5">
                          {renderAuditBadge(audit.auditStatus)}
                          {audit.isIssue && (
                            <span className="text-[9px] text-rose-500 dark:text-rose-400 font-semibold max-w-[150px] truncate" title={audit.auditDescription}>
                              {audit.auditTitle}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* OT Status */}
                      <td className="px-3 py-3 whitespace-nowrap">
                        <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                          record.status === 'Approved' ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-900/40' :
                          record.status === 'Rejected' ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200/50 dark:border-rose-900/40' : 
                          'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200/50 dark:border-amber-900/40'
                        }`}>
                          {record.status}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="px-3 py-3 text-right whitespace-nowrap space-x-1 sticky right-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs group-hover:bg-slate-50/95 dark:group-hover:bg-slate-800/95 transition-colors border-l border-slate-200/80 dark:border-slate-800">
                        {/* Side-by-Side Audit Details Toggle */}
                        <button
                          type="button"
                          onClick={() => {
                            setInspectRecord(inspectRecord?.id === record.id ? null : record);
                            setExpandedRecordId(isExpanded ? null : record.id);
                          }}
                          className={`p-1.5 rounded-lg border transition-all ${
                            inspectRecord?.id === record.id || isExpanded 
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs' 
                              : 'text-indigo-600 dark:text-indigo-400 border-indigo-200 dark:border-indigo-900/50 hover:bg-indigo-50 dark:hover:bg-indigo-950/50'
                          }`}
                          title={inspectRecord?.id === record.id ? "Close Side-by-Side Audit Panel" : "Open Side-by-Side Audit Cross-Check"}
                        >
                          <ShieldCheck size={14} />
                        </button>

                        <button 
                          onClick={() => onEdit(record)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 rounded-lg transition-all"
                          title="Edit Supervisor OT"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        
                        {record.status === 'Pending' && (
                          <>
                            <button 
                              onClick={() => onApprove(record.id)}
                              className="p-1.5 text-emerald-500 hover:bg-emerald-50 dark:hover:bg-emerald-950/50 rounded-lg transition-all"
                              title="Approve OT"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={() => onReject(record.id)}
                              className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-all"
                              title="Reject OT"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}

                        <button 
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setDeletingRecord(record);
                          }}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-all"
                          title="Delete Record"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>

                    {/* Inline Expandable Audit Cross-Check Panel */}
                    {isExpanded && (
                      <tr className="bg-slate-50/90 dark:bg-slate-950/70 border-y-2 border-indigo-500/30">
                        <td colSpan={12} className="p-4 sm:p-5">
                          <div className="space-y-4">
                            {/* Panel Header */}
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-3">
                              <div className="flex items-center gap-2">
                                <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                                <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                                  Professional OT Audit Cross-Check Ledger
                                </h4>
                                <span className="text-xs font-mono text-slate-400">
                                  [{audit.normId} - {audit.emp?.name} on {formatDateSafely(record.date)}]
                                </span>
                              </div>
                              <div className="flex items-center gap-2">
                                {renderAuditBadge(audit.auditStatus, 'md')}
                                <button
                                  onClick={() => setExpandedRecordId(null)}
                                  className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                >
                                  Close
                                </button>
                              </div>
                            </div>

                            {/* 4-Box Cross-Check Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                              {/* Box 1: Raw Biometric Punches */}
                              <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                    <Clock size={12} />
                                    1. Raw Biometric Punches
                                  </span>
                                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                                    {audit.rawPunchCount} Punches
                                  </span>
                                </div>
                                <div className="space-y-1">
                                  <p className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                                    Timestamp Trail:
                                  </p>
                                  {audit.rawPunchTimes.length > 0 ? (
                                    <div className="flex flex-wrap gap-1 mt-1">
                                      {audit.rawPunchTimes.map((t, idx) => (
                                        <span 
                                          key={idx} 
                                          className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold ${
                                            idx === 0 
                                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 border border-emerald-200' 
                                              : idx === audit.rawPunchTimes.length - 1 
                                                ? 'bg-indigo-50 text-indigo-700 dark:bg-indigo-950/60 dark:text-indigo-400 border border-indigo-200' 
                                                : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                          }`}
                                          title={`Raw punch ${idx + 1}`}
                                        >
                                          {t}
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    <p className="text-[11px] text-amber-600 font-semibold italic">
                                      No raw machine punches found on this date (Manual / Force Attendance)
                                    </p>
                                  )}
                                </div>
                                <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 text-[11px] font-mono text-slate-500">
                                  <span>First: <strong>{audit.rawPunchTimes[0] || '--:--'}</strong></span>
                                  <span className="mx-2 opacity-30">|</span>
                                  <span>Last: <strong>{audit.rawPunchTimes[audit.rawPunchTimes.length - 1] || '--:--'}</strong></span>
                                </div>
                              </div>

                              {/* Box 2: Reconciled Attendance */}
                              <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                    <FileCheck size={12} />
                                    2. Reconciled Attendance
                                  </span>
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                    audit.att?.status === 'Present' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400'
                                  }`}>
                                    {audit.att?.status || 'Present'}
                                  </span>
                                </div>
                                <div className="space-y-1.5 font-mono text-xs">
                                  <div className="flex justify-between items-center">
                                    <span className="text-slate-400">Reconciled IN:</span>
                                    <strong className="text-slate-800 dark:text-slate-200">{audit.inTime}</strong>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-slate-400">Reconciled OUT:</span>
                                    <strong className="text-slate-800 dark:text-slate-200">{audit.outTime}</strong>
                                  </div>
                                  <div className="flex justify-between items-center pt-1 border-t border-slate-100 dark:border-slate-800">
                                    <span className="text-slate-400 font-sans">Total Work:</span>
                                    <strong className="text-indigo-600 dark:text-indigo-400">{audit.workingHours} hrs</strong>
                                  </div>
                                </div>
                                {audit.att?.remarks && (
                                  <p className="text-[10px] text-slate-400 italic truncate" title={audit.att.remarks}>
                                    Note: {audit.att.remarks}
                                  </p>
                                )}
                              </div>

                              {/* Box 3: Shift & Roster Timing */}
                              <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                    <Clock size={12} />
                                    3. Shift & Roster Timing
                                  </span>
                                  <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950 px-1.5 py-0.5 rounded">
                                    {audit.shift?.name || 'Day Shift'}
                                  </span>
                                </div>
                                <div className="space-y-1.5 text-xs">
                                  <div className="flex justify-between items-center">
                                    <span className="text-slate-400">Shift Window:</span>
                                    <strong className="font-mono text-slate-800 dark:text-slate-200">
                                      {audit.shift?.startTime || '09:00'} - {audit.shift?.endTime || '18:00'}
                                    </strong>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-slate-400">Standard Duty:</span>
                                    <strong className="text-slate-800 dark:text-slate-200">{audit.standardDutyHours} hrs</strong>
                                  </div>
                                  <div className="flex justify-between items-center pt-1 border-t border-slate-100 dark:border-slate-800">
                                    <span className="text-slate-400">Night Shift:</span>
                                    <strong className="text-slate-700 dark:text-slate-300">
                                      {audit.shift?.isNightShift ? 'Yes (Overnight)' : 'No'}
                                    </strong>
                                  </div>
                                </div>
                              </div>

                              {/* Box 4: OT Settlement & Cost Impact */}
                              <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                                    <ShieldCheck size={12} />
                                    4. OT Settlement
                                  </span>
                                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                                    audit.variance > 0 
                                      ? 'bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-400' 
                                      : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400'
                                  }`}>
                                    Variance: {audit.variance > 0 ? `+${audit.variance}h` : `${audit.variance}h`}
                                  </span>
                                </div>
                                <div className="space-y-1.5 text-xs">
                                  <div className="flex justify-between items-center">
                                    <span className="text-slate-400">Biometric OT:</span>
                                    <strong className="text-slate-800 dark:text-slate-200">{audit.bioOtHours} hrs</strong>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-slate-400">Supervisor OT:</span>
                                    <strong className={audit.supervisorOtHours > audit.bioOtHours ? "text-rose-600 font-black" : "text-slate-800 dark:text-slate-200"}>
                                      {audit.supervisorOtHours} hrs
                                    </strong>
                                  </div>
                                  <div className="flex justify-between items-center pt-1 border-t border-slate-100 dark:border-slate-800">
                                    <span className="font-bold text-indigo-600 dark:text-indigo-400">Final OT:</span>
                                    <strong className="text-indigo-600 dark:text-indigo-400">{audit.finalOt} hrs</strong>
                                  </div>
                                  <div className="flex justify-between items-center">
                                    <span className="text-emerald-600 font-semibold">HR Saving:</span>
                                    <strong className="text-emerald-600">{audit.hrSaving} hrs</strong>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Audit Findings & Recommendation Banner */}
                            <div className={`p-3 rounded-xl border flex items-start gap-2.5 ${
                              audit.isIssue 
                                ? 'bg-rose-50/80 dark:bg-rose-950/40 border-rose-200/80 dark:border-rose-900/40 text-rose-900 dark:text-rose-200' 
                                : hasSaving
                                  ? 'bg-teal-50/80 dark:bg-teal-950/40 border-teal-200/80 dark:border-teal-900/40 text-teal-900 dark:text-teal-200'
                                  : 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-200/80 dark:border-emerald-900/40 text-emerald-900 dark:text-emerald-200'
                            }`}>
                              {audit.isIssue ? (
                                <AlertTriangle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                              ) : (
                                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                              )}
                              <div className="text-xs space-y-0.5">
                                <p className="font-bold">
                                  {audit.auditTitle}
                                </p>
                                <p className="opacity-90 leading-relaxed">
                                  {audit.auditDescription}
                                </p>
                              </div>
                              <div className="ml-auto flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => onEdit(record)}
                                  className="text-xs font-bold px-3 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-50 text-slate-700 dark:text-slate-200 transition"
                                >
                                  Adjust Supervisor OT
                                </button>
                                {record.status === 'Pending' && (
                                  <button
                                    type="button"
                                    onClick={() => onApprove(record.id)}
                                    className="text-xs font-bold px-3 py-1 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition"
                                  >
                                    Approve Settlement
                                  </button>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination & Summary Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-2 py-1 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-3">
          <span>
            Showing <strong className="font-semibold text-slate-700 dark:text-slate-200">{auditFilteredRecords.length === 0 ? 0 : (currentPage - 1) * (pageSize === 'All' ? auditFilteredRecords.length : Number(pageSize)) + 1}</strong> to <strong className="font-semibold text-slate-700 dark:text-slate-200">{pageSize === 'All' ? auditFilteredRecords.length : Math.min(currentPage * Number(pageSize), auditFilteredRecords.length)}</strong> of <strong className="font-semibold text-slate-700 dark:text-slate-200">{auditFilteredRecords.length}</strong> entries
          </span>

          <div className="flex items-center gap-1.5 ml-2 border-l border-slate-200 dark:border-slate-800 pl-3">
            <span className="text-slate-400">Rows per page:</span>
            <select
              value={pageSize}
              onChange={(e) => {
                const val = e.target.value === 'All' ? 'All' : Number(e.target.value);
                setPageSize(val);
                setCurrentPage(1);
              }}
              className="px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md text-xs font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            >
              <option value={25}>25</option>
              <option value={50}>50</option>
              <option value={100}>100</option>
              <option value={200}>200</option>
              <option value="All">All</option>
            </select>
          </div>
        </div>

        {pageSize !== 'All' && totalPages > 1 && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer disabled:cursor-not-allowed"
              title="Previous Page"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="px-2 font-medium text-slate-600 dark:text-slate-300">
              Page {currentPage} of {totalPages}
            </span>

            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 disabled:hover:bg-transparent transition-colors cursor-pointer disabled:cursor-not-allowed"
              title="Next Page"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deletingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div 
            onClick={() => setDeletingRecord(null)}
            className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
          />
          <div className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden z-10 p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
              <Trash2 size={24} />
            </div>

            <div className="space-y-1">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Confirm Delete Overtime Record
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Are you sure you want to delete the OT record for employee <strong className="text-slate-700 dark:text-slate-200">{deletingRecord.employeeId}</strong> on {deletingRecord.date}?
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeletingRecord(null)}
                className="flex-1 h-10 text-xs font-bold px-4 py-2 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  const id = deletingRecord.id;
                  setDeletingRecord(null);
                  onDelete?.(id);
                }}
                className="flex-1 h-10 text-xs font-bold px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl transition-all"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
