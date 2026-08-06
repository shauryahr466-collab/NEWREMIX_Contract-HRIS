import React from 'react';
import { format, parseISO } from 'date-fns';
import { motion } from 'motion/react';
import { Edit2, CheckCircle, XCircle, Trash2 } from 'lucide-react';
import { OvertimeRecord, Employee, ProcessedAttendance, ShiftMaster } from '../types';

interface OTAuditLogProps {
  records: OvertimeRecord[];
  employees: Employee[];
  attendanceData: ProcessedAttendance[];
  shifts: ShiftMaster[];
  onEdit: (record: OvertimeRecord) => void;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
  onDelete?: (id: string) => void;
  onOpenProfile: (id: string) => void;
  selectedIds?: string[];
  onSelect?: (id: string) => void;
  onSelectAll?: (ids: string[]) => void;
}

export const OTAuditLog: React.FC<OTAuditLogProps> = ({ 
  records, 
  employees, 
  attendanceData, 
  shifts,
  onEdit,
  onApprove,
  onReject,
  onDelete,
  onOpenProfile,
  selectedIds = [],
  onSelect,
  onSelectAll
}) => {
  return (
    <div className="overflow-x-auto rounded-xl border border-slate-100 bg-white">
      <table className="w-full text-left border-collapse min-w-[1500px]">
        <thead className="sticky top-0 z-20 bg-white">
          <tr className="bg-slate-50/50 text-[10px] font-black text-slate-400 uppercase tracking-widest border-b border-slate-100">
            <th className="px-4 py-4 w-12 text-center">
              <input 
                type="checkbox"
                checked={records.length > 0 && selectedIds.length === records.length}
                onChange={(e) => onSelectAll?.(e.target.checked ? records.map(r => r.id) : [])}
                className="w-4 h-4 rounded border-slate-300 text-indigo-600 cursor-pointer"
              />
            </th>
            <th className="px-4 py-4 whitespace-nowrap">Employee Info</th>
            <th className="px-4 py-4 whitespace-nowrap">Date & Shift</th>
            <th className="px-4 py-4 whitespace-nowrap">Duty/Work</th>
            <th className="px-4 py-4 whitespace-nowrap">Attendance Punches</th>
            <th className="px-4 py-4 whitespace-nowrap">Bio OT</th>
            <th className="px-4 py-4 whitespace-nowrap">Sup. OT</th>
            <th className="px-4 py-4 whitespace-nowrap text-indigo-600">Eligible OT</th>
            <th className="px-4 py-4 whitespace-nowrap text-emerald-600">HR Saving</th>
            <th className="px-4 py-4 whitespace-nowrap">Status</th>
            <th className="px-4 py-4 text-right sticky right-0 bg-slate-50/80 backdrop-blur-sm z-10 border-l border-slate-100">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {records.map((record, idx) => {
            const emp = employees.find(e => e.id === record.employeeId);
            const att = attendanceData.find(p => p.employeeId === record.employeeId && p.date === record.date);
            const shift = shifts.find(s => s.id === record.shiftId);
            const hasSaving = record.hrSaving > 0;
            
            return (
              <motion.tr 
                key={record.id}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: idx * 0.01 }}
                className={`group transition-colors ${selectedIds.includes(record.id) ? 'bg-indigo-50/50' : hasSaving ? 'bg-emerald-50/30' : 'hover:bg-slate-50/50'}`}
              >
                <td className="px-4 py-4 text-center">
                  <input 
                    type="checkbox"
                    checked={selectedIds.includes(record.id)}
                    onChange={() => onSelect?.(record.id)}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 cursor-pointer"
                  />
                </td>
                <td className="px-4 py-4">
                  <div 
                    onClick={() => onOpenProfile(record.employeeId)}
                    className="cursor-pointer group"
                  >
                    <p className="text-sm font-black text-slate-900 leading-none group-hover:text-indigo-600 transition-colors">{emp?.name || 'Unknown'}</p>
                    <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase flex items-center gap-1">
                      {record.employeeId} <span className="opacity-40">|</span> {emp?.department}
                    </p>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <p className="text-sm font-bold text-slate-600">{record.date ? format(parseISO(record.date), 'dd MMM yy') : '-'}</p>
                  <p className="text-[10px] font-black text-indigo-500 uppercase">{shift?.name || 'Day Shift'}</p>
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-400">Std Duty: {record.standardDutyHours || 8}h</span>
                    <span className="text-sm font-black text-slate-700">Work: {att?.workingHours || 0}h</span>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="flex flex-col text-[10px] font-black uppercase text-slate-400">
                    <span>In: <span className="text-slate-600">{att?.firstPunch ? format(parseISO(att.firstPunch), 'HH:mm') : '--:--'}</span></span>
                    <span>Out: <span className="text-slate-600">{att?.lastPunch ? format(parseISO(att.lastPunch), 'HH:mm') : '--:--'}</span></span>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <span className="text-sm font-black text-slate-600">{record.bioOtHours}h</span>
                </td>
                <td className="px-4 py-4">
                  <span className="text-sm font-black text-slate-600">{record.supervisorOtHours}h</span>
                </td>
                <td className="px-4 py-4 italic">
                  <span className="text-sm font-black text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">{record.hours}h</span>
                </td>
                <td className="px-4 py-4">
                  <span className={`text-xs font-black ${hasSaving ? 'text-emerald-600 bg-emerald-100/50 px-1.5 py-0.5 rounded' : 'text-slate-300'}`}>
                    {record.hrSaving}h
                  </span>
                </td>
                <td className="px-4 py-4">
                  <span className={`text-[10px] font-black uppercase tracking-widest px-2 py-1 rounded-lg ${
                    record.status === 'Approved' ? 'bg-emerald-50 text-emerald-600' :
                    record.status === 'Rejected' ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-600'
                  }`}>
                    {record.status}
                  </span>
                </td>
                <td className="px-4 py-4 text-right space-x-1 sticky right-0 bg-white/90 backdrop-blur-sm group-hover:bg-slate-50/90 transition-colors border-l border-slate-100">
                  <button 
                    onClick={() => onEdit(record)}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-all"
                    title="Supervisor Entry"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  
                  {record.status === 'Pending' && (
                    <>
                      <button 
                        onClick={() => onApprove(record.id)}
                        className="p-1.5 text-emerald-500 hover:bg-emerald-50 rounded-lg transition-all"
                        title="HR Approve"
                      >
                        <CheckCircle className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => onReject(record.id)}
                        className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-all"
                        title="HR Reject"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                    </>
                  )}

                  <button 
                    onClick={() => {
                      if (window.confirm('Are you sure you want to delete this OT record? This will remove all verification data for this entry.')) {
                        onDelete?.(record.id);
                      }
                    }}
                    className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                    title="Delete Entry"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
};
