import React from 'react';
import { X, Clock, Calendar, ShieldCheck, UserCheck, CheckCircle2, AlertTriangle, Fingerprint, FileText } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { formatAMPM, formatMinutes, formatDuration } from '../../lib/utils';
import { ProcessedAttendance, Employee, ShiftMaster, RawPunch } from '../../types';

interface MusterCellModalProps {
  isOpen: boolean;
  onClose: () => void;
  employee: Employee | null;
  bsDateStr: string;
  adDateStr: string;
  dayOfWeek: string;
  processedRecord: ProcessedAttendance | null;
  shift: ShiftMaster | null;
  rawPunches: RawPunch[];
}

export function MusterCellModal({
  isOpen,
  onClose,
  employee,
  bsDateStr,
  adDateStr,
  dayOfWeek,
  processedRecord,
  shift,
  rawPunches
}: MusterCellModalProps) {
  if (!isOpen || !employee) return null;

  // Determine source
  let source = 'BIO';
  if (processedRecord) {
    if (processedRecord.status === 'Weekly Off') source = 'WEEKLY OFF';
    else if (rawPunches.length === 0 && processedRecord.firstPunch) source = 'MANUAL';
  } else {
    source = 'NO LOG';
  }

  const inTimeStr = processedRecord?.firstPunch ? formatAMPM(processedRecord.firstPunch) : '--:--';
  const outTimeStr = (processedRecord?.lastPunch && processedRecord.lastPunch !== processedRecord.firstPunch) 
    ? formatAMPM(processedRecord.lastPunch) 
    : '--:--';

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-xl overflow-hidden border border-slate-100 dark:border-slate-800 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center font-bold text-white text-base shadow-md">
              {employee.name.charAt(0)}
            </div>
            <div>
              <h3 className="font-bold text-base text-white leading-tight">{employee.name}</h3>
              <p className="text-xs text-slate-300 font-mono mt-0.5">
                {employee.id} • {employee.department} • {employee.designation}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 custom-scrollbar flex-1">
          
          {/* Date & Shift Info */}
          <div className="grid grid-cols-2 gap-3 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-xl border border-slate-200/60 dark:border-slate-800">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-1">
                <Calendar size={12} className="text-indigo-500" /> Attendance Date
              </p>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100 font-mono">
                BS: {bsDateStr} ({dayOfWeek})
              </p>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                AD: {adDateStr}
              </p>
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5 mb-1">
                <Clock size={12} className="text-indigo-500" /> Assigned Shift
              </p>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100">
                {shift?.name || 'General Shift'}
              </p>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                {shift ? `${shift.startTime} - ${shift.endTime}` : '09:00 - 18:00'}
              </p>
            </div>
          </div>

          {/* Key Metrics Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="p-3 bg-emerald-50/70 dark:bg-emerald-950/30 rounded-xl border border-emerald-200/60 dark:border-emerald-900/40">
              <p className="text-[10px] font-bold uppercase text-emerald-600 dark:text-emerald-400 tracking-wider">Bio In</p>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100 font-mono mt-1">{inTimeStr}</p>
            </div>

            <div className="p-3 bg-indigo-50/70 dark:bg-indigo-950/30 rounded-xl border border-indigo-200/60 dark:border-indigo-900/40">
              <p className="text-[10px] font-bold uppercase text-indigo-600 dark:text-indigo-400 tracking-wider">Bio Out</p>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100 font-mono mt-1">{outTimeStr}</p>
            </div>

            <div className="p-3 bg-amber-50/70 dark:bg-amber-950/30 rounded-xl border border-amber-200/60 dark:border-amber-900/40">
              <p className="text-[10px] font-bold uppercase text-amber-600 dark:text-amber-400 tracking-wider">Late Entry</p>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100 font-mono mt-1">
                {processedRecord?.lateMinutes ? formatMinutes(processedRecord.lateMinutes) : '0m'}
              </p>
            </div>

            <div className="p-3 bg-purple-50/70 dark:bg-purple-950/30 rounded-xl border border-purple-200/60 dark:border-purple-900/40">
              <p className="text-[10px] font-bold uppercase text-purple-600 dark:text-purple-400 tracking-wider">Overtime</p>
              <p className="text-sm font-bold text-slate-800 dark:text-slate-100 font-mono mt-1">
                {processedRecord?.overtime ? formatDuration(processedRecord.overtime) : '0h 0m'}
              </p>
            </div>
          </div>

          {/* Reconciliation Status & Metadata */}
          <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <ShieldCheck size={14} className="text-indigo-500" /> Attendance Reconciliation
            </h4>
            
            <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Status:</span>
                <span className="font-bold text-slate-800 dark:text-slate-100">
                  {processedRecord?.status || 'Absent'}
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Source:</span>
                <span className="font-semibold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-2 py-0.5 rounded font-mono text-[10px]">
                  {source}
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Work Duration:</span>
                <span className="font-bold font-mono text-slate-800 dark:text-slate-100">
                  {processedRecord ? formatDuration(processedRecord.workingHours) : '0h'}
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                <span className="text-slate-500">Early Departure:</span>
                <span className="font-bold font-mono text-amber-600">
                  {processedRecord?.earlyMinutes ? formatMinutes(processedRecord.earlyMinutes) : '0m'}
                </span>
              </div>
            </div>
          </div>

          {/* All Raw Punches List */}
          <div className="space-y-2 border-t border-slate-100 dark:border-slate-800 pt-4">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Fingerprint size={14} className="text-indigo-500" /> Raw Bio Punches ({rawPunches.length})
              </h4>
            </div>

            {rawPunches.length > 0 ? (
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1 custom-scrollbar">
                {rawPunches.map((punch, idx) => {
                  const pDate = parseISO(punch.punchDatetime);
                  return (
                    <div 
                      key={punch.id || idx} 
                      className="flex items-center justify-between p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-lg text-xs border border-slate-200/50 dark:border-slate-700/50"
                    >
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-bold text-[10px] flex items-center justify-center">
                          {idx + 1}
                        </span>
                        <span className="font-bold font-mono text-slate-800 dark:text-slate-200">
                          {format(pDate, 'hh:mm:ss a')}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {punch.source || 'Biometric Device'} {punch.deviceName ? `(${punch.deviceName})` : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl text-center text-xs text-slate-400 italic">
                No biometric punch recordings found for this date.
              </div>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-100 dark:border-slate-800 flex justify-end shrink-0">
          <button 
            onClick={onClose}
            className="px-5 py-2 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-lg text-xs font-bold hover:opacity-90 transition shadow-sm"
          >
            Close Window
          </button>
        </div>

      </div>
    </div>
  );
}
