import React, { useState, useMemo, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { Edit2, CheckCircle, XCircle, Trash2, ChevronLeft, ChevronRight, Layers } from 'lucide-react';
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
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number | 'All'>(50);
  const [deletingRecord, setDeletingRecord] = useState<OvertimeRecord | null>(null);

  // Reset to first page when record set changes
  useEffect(() => {
    setCurrentPage(1);
  }, [records.length]);

  // Fast O(1) Map Lookups
  const empMap = useMemo(() => new Map<string, Employee>(employees.map(e => [e.id, e])), [employees]);
  const attMap = useMemo(() => new Map<string, ProcessedAttendance>(attendanceData.map(a => [`${a.employeeId}_${a.date}`, a])), [attendanceData]);
  const shiftMap = useMemo(() => new Map<string, ShiftMaster>(shifts.map(s => [s.id, s])), [shifts]);

  const totalPages = useMemo(() => {
    if (pageSize === 'All') return 1;
    return Math.max(1, Math.ceil(records.length / Number(pageSize)));
  }, [records.length, pageSize]);

  const currentRecords = useMemo(() => {
    if (pageSize === 'All') return records;
    const start = (currentPage - 1) * Number(pageSize);
    return records.slice(start, start + Number(pageSize));
  }, [records, currentPage, pageSize]);

  const isAllPageSelected = useMemo(() => {
    if (currentRecords.length === 0) return false;
    return currentRecords.every(r => selectedIds.includes(r.id));
  }, [currentRecords, selectedIds]);

  const handleSelectPageToggle = (checked: boolean) => {
    if (!onSelectAll) return;
    if (checked) {
      const pageIds = currentRecords.map(r => r.id);
      const combined = Array.from(new Set([...selectedIds, ...pageIds]));
      onSelectAll(combined);
    } else {
      const pageIdsSet = new Set(currentRecords.map(r => r.id));
      onSelectAll(selectedIds.filter(id => !pageIdsSet.has(id)));
    }
  };

  const formatDateSafely = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      return format(parseISO(dateStr), 'dd MMM yy');
    } catch {
      return dateStr;
    }
  };

  const formatPunchTime = (punchStr?: string) => {
    if (!punchStr) return '--:--';
    try {
      if (punchStr.length === 5 && punchStr.includes(':')) return punchStr;
      return format(parseISO(punchStr), 'HH:mm');
    } catch {
      return punchStr;
    }
  };

  return (
    <div className="space-y-3">
      {/* Table Container */}
      <div className="overflow-x-auto rounded-xl border border-slate-200/80 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
        <table className="w-full text-left border-collapse min-w-[1400px]">
          <thead className="bg-slate-50 dark:bg-slate-800/60 sticky top-0 z-20">
            <tr className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest border-b border-slate-200/80 dark:border-slate-800">
              <th className="px-4 py-3.5 w-12 text-center">
                <input 
                  type="checkbox"
                  checked={isAllPageSelected}
                  onChange={(e) => handleSelectPageToggle(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  title="Select all on this page"
                />
              </th>
              <th className="px-4 py-3.5 whitespace-nowrap">Employee Info</th>
              <th className="px-4 py-3.5 whitespace-nowrap">Date & Shift</th>
              <th className="px-4 py-3.5 whitespace-nowrap">Duty / Work</th>
              <th className="px-4 py-3.5 whitespace-nowrap">Punches</th>
              <th className="px-4 py-3.5 whitespace-nowrap">Bio OT</th>
              <th className="px-4 py-3.5 whitespace-nowrap">Sup. OT</th>
              <th className="px-4 py-3.5 whitespace-nowrap text-indigo-600 dark:text-indigo-400">Eligible OT</th>
              <th className="px-4 py-3.5 whitespace-nowrap text-emerald-600 dark:text-emerald-400">HR Saving</th>
              <th className="px-4 py-3.5 whitespace-nowrap">Status</th>
              <th className="px-4 py-3.5 text-right sticky right-0 bg-slate-50 dark:bg-slate-800 z-10 border-l border-slate-200/80 dark:border-slate-800">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {currentRecords.length === 0 ? (
              <tr>
                <td colSpan={11} className="px-4 py-12 text-center text-slate-400 dark:text-slate-500">
                  <div className="flex flex-col items-center justify-center gap-2">
                    <Layers className="w-8 h-8 opacity-40" />
                    <p className="text-sm font-semibold">No overtime audit records found</p>
                    <p className="text-xs text-slate-400">Try adjusting date range, search filter, or click Sync</p>
                  </div>
                </td>
              </tr>
            ) : (
              currentRecords.map((record) => {
                const emp = empMap.get(record.employeeId);
                const att = attMap.get(`${record.employeeId}_${record.date}`);
                const shift = record.shiftId ? shiftMap.get(record.shiftId) : undefined;
                const hasSaving = (record.hrSaving || 0) > 0;
                const isSelected = selectedIds.includes(record.id);

                return (
                  <tr 
                    key={record.id}
                    className={`group transition-colors ${
                      isSelected 
                        ? 'bg-indigo-50/70 dark:bg-indigo-950/30' 
                        : hasSaving 
                          ? 'bg-emerald-50/20 dark:bg-emerald-950/10 hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20' 
                          : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    <td className="px-4 py-3 text-center">
                      <input 
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => onSelect?.(record.id)}
                        className="w-4 h-4 rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <div 
                        onClick={() => onOpenProfile(record.employeeId)}
                        className="cursor-pointer group/item"
                      >
                        <p className="text-xs font-bold text-slate-900 dark:text-white leading-tight group-hover/item:text-indigo-600 dark:group-hover/item:text-indigo-400 transition-colors">
                          {emp?.name || 'Unknown Staff'}
                        </p>
                        <p className="text-[10px] font-semibold text-slate-400 dark:text-slate-500 mt-0.5 flex items-center gap-1">
                          <span className="font-mono">{record.employeeId}</span>
                          <span className="opacity-30">|</span>
                          <span>{emp?.department || 'General'}</span>
                        </p>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">{formatDateSafely(record.date)}</p>
                      <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider">{shift?.name || 'Day Shift'}</p>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Std: {record.standardDutyHours || 8}h</span>
                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Work: {att?.workingHours || 0}h</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="flex flex-col text-[10px] font-mono text-slate-500 dark:text-slate-400">
                        <span>In: <span className="font-semibold text-slate-700 dark:text-slate-300">{formatPunchTime(att?.firstPunch)}</span></span>
                        <span>Out: <span className="font-semibold text-slate-700 dark:text-slate-300">{formatPunchTime(att?.lastPunch)}</span></span>
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{record.bioOtHours ?? 0}h</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{record.supervisorOtHours ?? 0}h</span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-md border border-indigo-100 dark:border-indigo-900/40">
                        {record.hours ?? 0}h
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`text-xs font-bold ${
                        hasSaving 
                          ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-100/70 dark:bg-emerald-950/60 px-1.5 py-0.5 rounded-md' 
                          : 'text-slate-400 dark:text-slate-600'
                      }`}>
                        {record.hrSaving ?? 0}h
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md ${
                        record.status === 'Approved' ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200/50 dark:border-emerald-900/40' :
                        record.status === 'Rejected' ? 'bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 border border-rose-200/50 dark:border-rose-900/40' : 
                        'bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 border border-amber-200/50 dark:border-amber-900/40'
                      }`}>
                        {record.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap space-x-1 sticky right-0 bg-white/95 dark:bg-slate-900/95 backdrop-blur-xs group-hover:bg-slate-50/95 dark:group-hover:bg-slate-800/95 transition-colors border-l border-slate-200/80 dark:border-slate-800">
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
            Showing <strong className="font-semibold text-slate-700 dark:text-slate-200">{records.length === 0 ? 0 : (currentPage - 1) * (pageSize === 'All' ? records.length : Number(pageSize)) + 1}</strong> to <strong className="font-semibold text-slate-700 dark:text-slate-200">{pageSize === 'All' ? records.length : Math.min(currentPage * Number(pageSize), records.length)}</strong> of <strong className="font-semibold text-slate-700 dark:text-slate-200">{records.length}</strong> entries
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

