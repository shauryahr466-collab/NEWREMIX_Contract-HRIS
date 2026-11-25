import React from 'react';
import { 
  ShieldCheck, AlertTriangle, AlertOctagon, Sliders, CheckCircle2, 
  Clock, FileText, UserCheck, X, CheckCircle, XCircle, Edit2, 
  Layers, ArrowRight, ExternalLink
} from 'lucide-react';
import { OvertimeRecord, Employee, ProcessedAttendance, ShiftMaster, RawPunch } from '../types';
import { formatPunchTime } from '../lib/utils';
import { format, parseISO } from 'date-fns';

export interface AuditEvaluation {
  normId: string;
  emp?: Employee;
  att?: ProcessedAttendance;
  shift?: ShiftMaster;
  inTime: string;
  outTime: string;
  isSinglePunch: boolean;
  hasIn: boolean;
  hasOut: boolean;
  rawPunchTimes: string[];
  rawPunchCount: number;
  rawFirstPunch?: string;
  rawLastPunch?: string;
  workingHours: number;
  standardDutyHours: number;
  bioOtHours: number;
  supervisorOtHours: number;
  finalOt: number;
  hrSaving: number;
  variance: number;
  auditStatus: 'PASS' | 'WARNING' | 'MISMATCH' | 'ERROR';
  auditTitle: string;
  auditDescription: string;
  isIssue: boolean;
  inMismatch: boolean;
  outMismatch: boolean;
}

interface OTCrossCheckPanelProps {
  selectedRecord: OvertimeRecord | null;
  audit: AuditEvaluation | null;
  allRecords: { record: OvertimeRecord; audit: AuditEvaluation }[];
  onSelectRecord: (record: OvertimeRecord) => void;
  onEdit: (record: OvertimeRecord) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onClose: () => void;
  isSuperAdmin?: boolean;
  canApproveOt?: boolean;
  canEditOt?: boolean;
  isEmployeeOnly?: boolean;
}

export const OTCrossCheckPanel: React.FC<OTCrossCheckPanelProps> = ({
  selectedRecord,
  audit,
  allRecords,
  onSelectRecord,
  onEdit,
  onApprove,
  onReject,
  onClose,
  isSuperAdmin = false,
  canApproveOt = true,
  canEditOt = true,
  isEmployeeOnly = false
}) => {
  if (!selectedRecord || !audit) return null;
  const lockedBySuperAdmin =
    !isSuperAdmin &&
    Boolean(
      selectedRecord.superAdminOverride ||
        selectedRecord.approvedByRole === 'Super Admin' ||
        selectedRecord.reviewedByRole === 'Super Admin'
    );

  const formatDateSafely = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      return format(parseISO(dateStr), 'dd MMMM yyyy (EEEE)');
    } catch {
      return dateStr;
    }
  };

  const renderStatusBadge = (status: 'PASS' | 'WARNING' | 'MISMATCH' | 'ERROR') => {
    switch (status) {
      case 'PASS':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black tracking-wider bg-emerald-100 text-emerald-800 dark:bg-emerald-950/80 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
            <CheckCircle2 size={14} className="text-emerald-600 dark:text-emerald-400" />
            AUDIT PASS
          </span>
        );
      case 'WARNING':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black tracking-wider bg-amber-100 text-amber-800 dark:bg-amber-950/80 dark:text-amber-300 border border-amber-300 dark:border-amber-800">
            <AlertTriangle size={14} className="text-amber-600 dark:text-amber-400" />
            AUDIT WARNING
          </span>
        );
      case 'MISMATCH':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black tracking-wider bg-purple-100 text-purple-800 dark:bg-purple-950/80 dark:text-purple-300 border border-purple-300 dark:border-purple-800">
            <Sliders size={14} className="text-purple-600 dark:text-purple-400" />
            AUDIT MISMATCH
          </span>
        );
      case 'ERROR':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black tracking-wider bg-rose-100 text-rose-800 dark:bg-rose-950/80 dark:text-rose-300 border border-rose-300 dark:border-rose-800">
            <AlertOctagon size={14} className="text-rose-600 dark:text-rose-400" />
            AUDIT ERROR
          </span>
        );
    }
  };

  const getCheckStatusBadge = (isPass: boolean, isWarning: boolean = false) => {
    if (isPass) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 size={13} />
          PASS
        </span>
      );
    }
    if (isWarning) {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400">
          <AlertTriangle size={13} />
          WARNING
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400">
        <AlertOctagon size={13} />
        FAILED
      </span>
    );
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border-2 border-indigo-500/40 dark:border-indigo-500/30 shadow-xl overflow-hidden transition-all">
      {/* Panel Header */}
      <div className="px-5 py-4 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-600 rounded-xl text-white shadow-xs">
            <ShieldCheck size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-base font-bold tracking-tight text-white">
                OT Audit / Cross-Check Side-by-Side Comparison
              </h3>
              <span className="text-xs bg-slate-800 text-slate-300 px-2.5 py-0.5 rounded-full font-mono">
                {selectedRecord.employeeId} - {selectedRecord.date}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Multi-source audit reconciling Biometric Punches, Reconciled Attendance, Roster Baseline, and Supervisor Claims.
            </p>
          </div>
        </div>

        {/* Quick Switcher & Close */}
        <div className="flex items-center gap-2">
          <label className="text-xs text-slate-400 font-semibold hidden sm:inline">
            Inspect Another:
          </label>
          <select
            value={selectedRecord.id}
            onChange={(e) => {
              const found = allRecords.find(r => r.record.id === e.target.value);
              if (found) onSelectRecord(found.record);
            }}
            className="px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs font-medium text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 max-w-[220px]"
          >
            {allRecords.map(item => (
              <option key={item.record.id} value={item.record.id}>
                {item.record.employeeId} - {item.audit.emp?.name || 'Staff'} ({item.record.date})
              </option>
            ))}
          </select>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition"
            title="Close Audit Panel"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div className="p-5 space-y-5">
        {/* Selected Record Banner */}
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/80 dark:border-slate-800">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-black text-slate-900 dark:text-white">
                {audit.emp?.name || 'Unknown Employee'}
              </span>
              <span className="text-xs font-mono font-bold text-slate-500 bg-slate-200/70 dark:bg-slate-700 px-2 py-0.5 rounded">
                ID: {selectedRecord.employeeId}
              </span>
              <span className="text-xs text-slate-500">
                • {audit.emp?.department || 'General'}
              </span>
              {audit.emp?.designation && (
                <span className="text-xs text-slate-400">
                  ({audit.emp.designation})
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
              Attendance & OT Audit Date: <strong>{formatDateSafely(selectedRecord.date)}</strong>
            </p>
          </div>

          <div className="flex items-center gap-3">
            {renderStatusBadge(audit.auditStatus)}
            <div className="text-right">
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block">
                Final Eligible OT
              </span>
              <span className="text-base font-black text-indigo-600 dark:text-indigo-400 font-mono">
                {audit.finalOt} hrs
              </span>
            </div>
          </div>
        </div>

        {/* Audit Finding Callout */}
        <div className={`p-4 rounded-xl border flex items-start gap-3 ${
          audit.auditStatus === 'ERROR'
            ? 'bg-rose-50/80 dark:bg-rose-950/40 border-rose-200 dark:border-rose-900/60 text-rose-950 dark:text-rose-200'
            : audit.auditStatus === 'MISMATCH'
              ? 'bg-purple-50/80 dark:bg-purple-950/40 border-purple-200 dark:border-purple-900/60 text-purple-950 dark:text-purple-200'
              : audit.auditStatus === 'WARNING'
                ? 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-200 dark:border-amber-900/60 text-amber-950 dark:text-amber-200'
                : 'bg-emerald-50/80 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-900/60 text-emerald-950 dark:text-emerald-200'
        }`}>
          {audit.auditStatus === 'ERROR' && <AlertOctagon className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />}
          {audit.auditStatus === 'MISMATCH' && <Sliders className="w-5 h-5 text-purple-600 dark:text-purple-400 shrink-0 mt-0.5" />}
          {audit.auditStatus === 'WARNING' && <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />}
          {audit.auditStatus === 'PASS' && <ShieldCheck className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />}

          <div className="space-y-0.5 text-xs leading-relaxed flex-1">
            <h4 className="font-bold text-sm">
              {audit.auditTitle}
            </h4>
            <p className="opacity-90">
              {audit.auditDescription}
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {!isEmployeeOnly && canEditOt && !lockedBySuperAdmin && (
              <button
                type="button"
                onClick={() => onEdit(selectedRecord)}
                className="text-xs font-bold px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg hover:bg-slate-100 text-slate-800 dark:text-slate-200 transition shadow-xs flex items-center gap-1.5"
              >
                <Edit2 size={13} />
                Adjust Supervisor OT
              </button>
            )}
            {lockedBySuperAdmin && (
              <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                Locked by Super Admin
              </span>
            )}
            {!isEmployeeOnly && canApproveOt && !lockedBySuperAdmin && selectedRecord.status === 'Pending' && (
              <>
                <button
                  type="button"
                  onClick={() => onApprove(selectedRecord.id)}
                  className="text-xs font-bold px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition shadow-xs flex items-center gap-1.5"
                >
                  <CheckCircle size={13} />
                  Approve Settlement
                </button>
                <button
                  type="button"
                  onClick={() => onReject(selectedRecord.id)}
                  className="text-xs font-bold px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition shadow-xs flex items-center gap-1.5"
                >
                  <XCircle size={13} />
                  Reject
                </button>
              </>
            )}
            {isSuperAdmin && selectedRecord.status !== 'Pending' && (
              <>
                {selectedRecord.status !== 'Approved' && (
                  <button
                    type="button"
                    onClick={() => onApprove(selectedRecord.id)}
                    className="text-xs font-bold px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition shadow-xs flex items-center gap-1.5"
                  >
                    <CheckCircle size={13} />
                    Override → Approve
                  </button>
                )}
                {selectedRecord.status !== 'Rejected' && (
                  <button
                    type="button"
                    onClick={() => onReject(selectedRecord.id)}
                    className="text-xs font-bold px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg transition shadow-xs flex items-center gap-1.5"
                  >
                    <XCircle size={13} />
                    Override → Reject
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        {/* 4-Column Side-by-Side Source Data Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Column 1: Raw Punch Data */}
          <div className="bg-slate-50/70 dark:bg-slate-800/40 rounded-xl p-4 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Clock size={14} className="text-indigo-600 dark:text-indigo-400" />
                1. Raw Biometric Punches
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-full">
                {audit.rawPunchCount} Punches
              </span>
            </div>
            <div className="space-y-2 text-xs font-mono">
              <div>
                <span className="text-[10px] text-slate-400 font-sans block mb-1 font-bold">
                  All Timestamps on {selectedRecord.date}:
                </span>
                {audit.rawPunchTimes.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {audit.rawPunchTimes.map((t, idx) => (
                      <span
                        key={idx}
                        className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                          idx === 0
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-300'
                            : idx === audit.rawPunchTimes.length - 1
                              ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 border border-indigo-300'
                              : 'bg-white text-slate-700 dark:bg-slate-900 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
                        }`}
                        title={idx === 0 ? 'Raw First Punch (In)' : idx === audit.rawPunchTimes.length - 1 ? 'Raw Last Punch (Out)' : `Punch ${idx + 1}`}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-amber-600 font-semibold text-[11px] italic">
                    No raw biometric punches recorded
                  </span>
                )}
              </div>

              <div className="pt-2 border-t border-slate-200 dark:border-slate-800/60 space-y-1">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-sans">Raw First Punch:</span>
                  <strong className="text-slate-800 dark:text-slate-200">{audit.rawFirstPunch || '--:--'}</strong>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-sans">Raw Last Punch:</span>
                  <strong className="text-slate-800 dark:text-slate-200">{audit.rawLastPunch || '--:--'}</strong>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-sans">Source Table:</span>
                  <span className="text-[10px] text-slate-500 font-sans">attendance_punches</span>
                </div>
              </div>
            </div>
          </div>

          {/* Column 2: Reconciled Attendance */}
          <div className="bg-slate-50/70 dark:bg-slate-800/40 rounded-xl p-4 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <FileText size={14} className="text-indigo-600 dark:text-indigo-400" />
                2. Reconciled Attendance
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                audit.att?.status === 'Present'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
              }`}>
                {audit.att?.status || 'Present'}
              </span>
            </div>
            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-sans">Reconciled IN:</span>
                <strong className={`font-bold ${audit.inMismatch ? 'text-rose-600' : 'text-slate-800 dark:text-slate-200'}`}>
                  {audit.inTime}
                </strong>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-sans">Reconciled OUT:</span>
                <strong className={`font-bold ${audit.outMismatch ? 'text-rose-600' : 'text-slate-800 dark:text-slate-200'}`}>
                  {audit.isSinglePunch && !audit.hasOut ? '--:-- (Single)' : audit.outTime}
                </strong>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-800/60">
                <span className="text-slate-400 font-sans">Total Work Hours:</span>
                <strong className="text-indigo-600 dark:text-indigo-400 text-sm font-black">
                  {audit.workingHours} hrs
                </strong>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-sans">Source Engine:</span>
                <span className="text-[10px] text-slate-500 font-sans">
                  {audit.att?.remarks?.toLowerCase().includes('forced') ? 'Force Attendance' : 'Biometric Engine'}
                </span>
              </div>
              {audit.att?.remarks && (
                <p className="text-[10px] text-slate-500 italic truncate" title={audit.att.remarks}>
                  Remarks: {audit.att.remarks}
                </p>
              )}
            </div>
          </div>

          {/* Column 3: Shift / Roster Timing */}
          <div className="bg-slate-50/70 dark:bg-slate-800/40 rounded-xl p-4 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Clock size={14} className="text-indigo-600 dark:text-indigo-400" />
                3. Shift / Roster Baseline
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 rounded-full">
                {audit.shift?.name || 'Day Shift'}
              </span>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Scheduled Window:</span>
                <strong className="font-mono text-slate-800 dark:text-slate-200">
                  {audit.shift?.startTime || '09:00'} - {audit.shift?.endTime || '18:00'}
                </strong>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Standard Duty Hours:</span>
                <strong className="font-mono text-slate-800 dark:text-slate-200">
                  {audit.standardDutyHours} hrs
                </strong>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-800/60">
                <span className="text-slate-400">Overnight Shift:</span>
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                  {audit.shift?.isNightShift ? 'Yes (Overnight)' : 'No'}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Source Table:</span>
                <span className="text-[10px] text-slate-500">shifts / roster_assignments</span>
              </div>
            </div>
          </div>

          {/* Column 4: OT Settlement & Approvals */}
          <div className="bg-slate-50/70 dark:bg-slate-800/40 rounded-xl p-4 border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <UserCheck size={14} className="text-indigo-600 dark:text-indigo-400" />
                4. Approvals & Overtime
              </span>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                selectedRecord.status === 'Approved'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : selectedRecord.status === 'Rejected'
                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
              }`}>
                {selectedRecord.status}
              </span>
            </div>
            <div className="space-y-2 text-xs font-mono">
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-sans">Biometric OT:</span>
                <strong className="text-slate-800 dark:text-slate-200">{audit.bioOtHours} hrs</strong>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-sans">Supervisor OT Claim:</span>
                <strong className={audit.supervisorOtHours > audit.bioOtHours ? "text-rose-600 font-black" : "text-slate-800 dark:text-slate-200"}>
                  {audit.supervisorOtHours} hrs
                </strong>
              </div>
              <div className="flex justify-between items-center pt-2 border-t border-slate-200 dark:border-slate-800/60">
                <span className="font-bold text-indigo-600 dark:text-indigo-400 font-sans">Final Eligible OT:</span>
                <strong className="text-indigo-600 dark:text-indigo-400 text-sm font-black">
                  {audit.finalOt} hrs
                </strong>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-emerald-600 font-sans font-semibold">HR Cost Saving:</span>
                <strong className="text-emerald-600">{audit.hrSaving} hrs</strong>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-400 font-sans">Variance (Sup - Bio):</span>
                <span className={`text-xs font-bold ${audit.variance > 0 ? 'text-rose-600' : 'text-slate-600 dark:text-slate-400'}`}>
                  {audit.variance > 0 ? `+${audit.variance}h` : `${audit.variance}h`}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Side-by-Side Audit Rules Verification Table */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-2.5 bg-slate-100/70 dark:bg-slate-800/70 flex items-center justify-between border-b border-slate-200 dark:border-slate-800">
            <span className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
              <Layers size={14} className="text-indigo-600" />
              Side-by-Side Source Cross-Check Matrix
            </span>
            <span className="text-[11px] text-slate-500">
              Deterministic rule checks for payroll compliance
            </span>
          </div>

          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/40 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                <th className="px-4 py-2">Verification Check</th>
                <th className="px-4 py-2">Raw Punch Source</th>
                <th className="px-4 py-2">Reconciled / Assigned</th>
                <th className="px-4 py-2">Delta / Finding</th>
                <th className="px-4 py-2 text-right">Result</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono">
              {/* Check 1: In Time */}
              <tr>
                <td className="px-4 py-2.5 font-sans font-semibold text-slate-800 dark:text-slate-200">
                  In-Time Alignment
                </td>
                <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
                  {audit.rawFirstPunch || '--:--'}
                </td>
                <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
                  {audit.inTime}
                </td>
                <td className="px-4 py-2.5 font-sans text-slate-500 text-[11px]">
                  {audit.inMismatch ? 'Raw and Reconciled In time diverge' : 'Punches match reconciled In boundary'}
                </td>
                <td className="px-4 py-2.5 text-right font-sans">
                  {getCheckStatusBadge(!audit.inMismatch)}
                </td>
              </tr>

              {/* Check 2: Out Time */}
              <tr>
                <td className="px-4 py-2.5 font-sans font-semibold text-slate-800 dark:text-slate-200">
                  Out-Time Alignment
                </td>
                <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
                  {audit.rawLastPunch || '--:--'}
                </td>
                <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
                  {audit.isSinglePunch && !audit.hasOut ? '--:-- (Single Punch)' : audit.outTime}
                </td>
                <td className="px-4 py-2.5 font-sans text-slate-500 text-[11px]">
                  {audit.isSinglePunch ? 'Single punch on record; out time missing' : audit.outMismatch ? 'Raw and Reconciled Out time diverge' : 'Punches match reconciled Out boundary'}
                </td>
                <td className="px-4 py-2.5 text-right font-sans">
                  {getCheckStatusBadge(!audit.outMismatch && !audit.isSinglePunch, audit.isSinglePunch)}
                </td>
              </tr>

              {/* Check 3: Single Punch Exception */}
              <tr>
                <td className="px-4 py-2.5 font-sans font-semibold text-slate-800 dark:text-slate-200">
                  Punch Boundary Integrity
                </td>
                <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400 font-sans">
                  Count: {audit.rawPunchCount}
                </td>
                <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400 font-sans">
                  {audit.isSinglePunch ? '1 Punch (Incomplete)' : '2+ Punches (Complete)'}
                </td>
                <td className="px-4 py-2.5 font-sans text-slate-500 text-[11px]">
                  {audit.isSinglePunch ? 'Out-punch missing; requires physical departure verification' : 'Both arrival and departure recorded'}
                </td>
                <td className="px-4 py-2.5 text-right font-sans">
                  {getCheckStatusBadge(!audit.isSinglePunch, true)}
                </td>
              </tr>

              {/* Check 4: Duty vs Work Duration */}
              <tr>
                <td className="px-4 py-2.5 font-sans font-semibold text-slate-800 dark:text-slate-200">
                  Work Duration vs Duty Hours
                </td>
                <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
                  Work: {audit.workingHours}h
                </td>
                <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
                  Standard Duty: {audit.standardDutyHours}h
                </td>
                <td className="px-4 py-2.5 font-sans text-slate-500 text-[11px]">
                  Bio OT = Max(0, {audit.workingHours}h - {audit.standardDutyHours}h) = {audit.bioOtHours}h
                </td>
                <td className="px-4 py-2.5 text-right font-sans">
                  {getCheckStatusBadge(audit.workingHours > 0 || (audit.supervisorOtHours === 0 && audit.bioOtHours === 0))}
                </td>
              </tr>

              {/* Check 5: Supervisor Claim vs Biometric OT */}
              <tr>
                <td className="px-4 py-2.5 font-sans font-semibold text-slate-800 dark:text-slate-200">
                  Supervisor Claim Legitimacy
                </td>
                <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
                  Bio OT: {audit.bioOtHours}h
                </td>
                <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">
                  Sup Claim: {audit.supervisorOtHours}h
                </td>
                <td className="px-4 py-2.5 font-sans text-slate-500 text-[11px]">
                  {audit.supervisorOtHours > audit.bioOtHours
                    ? `Over-claim by +${audit.variance}h (Supervisor claim exceeds physical presence)`
                    : audit.bioOtHours > audit.supervisorOtHours
                      ? `Company saved ${audit.hrSaving}h (Biometric exceeded supervisor claim)`
                      : 'Supervisor claim matches biometric overtime'}
                </td>
                <td className="px-4 py-2.5 text-right font-sans">
                  {getCheckStatusBadge(audit.supervisorOtHours <= audit.bioOtHours)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
