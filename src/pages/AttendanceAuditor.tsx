import React, { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppStore } from '../store';
import { detectExceptions } from '../lib/engine';
import { format, parseISO } from 'date-fns';
import { 
  ShieldAlert, 
  Search, 
  CheckCircle2, 
  Clock, 
  Calendar, 
  History,
  Info,
  X,
  Save,
  RefreshCw,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  MoreVertical
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import type { AttendanceException } from '../types';
import { PageHeader, Card, Button, Input, StatusBadge, KPICard, Badge } from '../components/ui';
import { cn } from '../lib/utils';

export default function AttendanceAuditor() {
  const { 
    processedData, 
    employees, 
    settings, 
    auditLogs, 
    addAuditLog, 
    addPunch,
    fetchPunches,
    recalculate,
    exceptions,
    updateException,
    openEmployeeProfile,
    globalSearchTerm
  } = useAppStore();
  
  const [searchParams] = useSearchParams();
  const initialType = searchParams.get('type') || 'All';
  const initialDate = searchParams.get('date') || '';
  
  const [typeFilter, setTypeFilter] = useState(initialType);
  const [dateFilter, setDateFilter] = useState(initialDate);
  const [searchTerm, setSearchTerm] = useState('');
  const activeSearch = searchTerm || globalSearchTerm;
  const [statusFilter, setStatusFilter] = useState('pending');
  
  const [selectedException, setSelectedException] = useState<AttendanceException | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  
  const allExceptions = useMemo(() => {
    const detected = detectExceptions(processedData, employees, settings);
    return detected.map(d => {
      const stored = exceptions.find(e => e.id === d.id);
      if (stored) return { ...d, ...stored };
      return d;
    });
  }, [processedData, employees, settings, exceptions]);

  const filteredExceptions = useMemo(() => {
    return allExceptions.filter(ex => {
      const matchesType = typeFilter === 'All' || ex.type === typeFilter;
      const matchesDate = !dateFilter || ex.date === dateFilter;
      const emp = employees.find(e => e.id === ex.employeeId);
      const matchesSearch = !activeSearch || 
        emp?.name.toLowerCase().includes(activeSearch.toLowerCase()) || 
        ex.employeeId.toLowerCase().includes(activeSearch.toLowerCase());
      const matchesStatus = statusFilter === 'All' || ex.status === statusFilter;
      
      return matchesType && matchesDate && matchesSearch && matchesStatus;
    });
  }, [allExceptions, typeFilter, dateFilter, activeSearch, statusFilter, employees]);

  const summary = useMemo(() => {
    return {
      total: allExceptions.length,
      pending: allExceptions.filter(e => e.status === 'pending').length,
      spf: allExceptions.filter(e => e.type === 'SPF').length,
      timing: allExceptions.filter(e => e.type === 'Punch Outside Shift').length,
    };
  }, [allExceptions]);

  const handleRecalculate = async () => {
     const tId = toast.loading('Recalculating attendance data...');
     try {
       await recalculate();
       toast.success('Attendance records refreshed', { id: tId });
     } catch (e) {
       toast.error('Recalculation failed', { id: tId });
     }
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Attendance Auditor" 
        description="Quality control & data exception detection"
        actions={
          <Button variant="outline" onClick={handleRecalculate} className="gap-2">
            <RefreshCw size={16} />
            Recalculate
          </Button>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard 
          label="Total Exceptions" 
          value={summary.total} 
          icon={ShieldAlert} 
          trend="up"
          trendValue="Issues Detected"
          onClick={() => setTypeFilter('All')}
        />
        <KPICard 
          label="Pending Review" 
          value={summary.pending} 
          icon={Clock} 
          trend="down"
          trendValue="Awaiting Action"
          onClick={() => setStatusFilter('pending')}
        />
        <KPICard 
          label="SPF Detected" 
          value={summary.spf} 
          icon={AlertTriangle} 
          trend="up"
          trendValue="Single Punch"
          onClick={() => setTypeFilter('SPF')}
        />
        <KPICard 
          label="Timing Issues" 
          value={summary.timing} 
          icon={Calendar} 
          trend="up"
          trendValue="Shift Mismatch"
          onClick={() => setTypeFilter('Punch Outside Shift')}
        />
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input 
              placeholder="Search employee name or ID..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="flex items-center gap-2">
            <select 
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="All">All Types</option>
              <option value="SPF">SPF (Single Punch)</option>
              <option value="Short Hours">Short Hours</option>
              <option value="Long Hours">Long Hours</option>
              <option value="Punch Outside Shift">Timing Mismatch</option>
              <option value="Duplicate Punch">Duplicates</option>
            </select>

            <Input 
              type="date" 
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="w-40"
            />

            <select 
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="pending">Pending</option>
              <option value="resolved">Resolved</option>
              <option value="All">All Status</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
              <tr className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4">Employee</th>
                <th className="px-6 py-4">Date</th>
                <th className="px-6 py-4">Exception Type</th>
                <th className="px-6 py-4">Details</th>
                <th className="px-6 py-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredExceptions.map((ex) => {
                const emp = employees.find(e => e.id === ex.employeeId);
                return (
                  <tr key={ex.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors group">
                    <td className="px-6 py-4 text-center">
                      {ex.status === 'pending' ? (
                        <div className="w-2.5 h-2.5 rounded-full bg-warning mx-auto animate-pulse" />
                      ) : (
                        <CheckCircle2 className="w-5 h-5 text-success mx-auto" />
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="font-semibold text-slate-900 dark:text-white cursor-pointer hover:text-primary transition-colors" onClick={() => openEmployeeProfile(ex.employeeId)}>
                          {emp?.name || 'Unknown'}
                        </span>
                        <span className="text-[11px] font-mono text-slate-400 uppercase tracking-tighter">{ex.employeeId}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-sm font-medium text-slate-600 dark:text-slate-400">{format(parseISO(ex.date), 'dd MMM yyyy')}</span>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge 
                        status={ex.type}
                        type={
                          ex.severity === 'high' ? 'danger' : 
                          ex.severity === 'medium' ? 'warning' : 'info'
                        }
                      />
                    </td>
                    <td className="px-6 py-4">
                      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs">{ex.description}</p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => {
                          setSelectedException(ex);
                          setIsEditModalOpen(true);
                        }}
                        className="text-primary font-bold text-[11px] uppercase tracking-wider"
                      >
                        Correct Issue
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {filteredExceptions.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center justify-center opacity-30">
                       <ShieldAlert className="w-12 h-12 text-slate-300 mb-2" />
                       <p className="text-sm font-bold text-slate-400 uppercase tracking-widest">No exceptions found</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="space-y-4">
        <div className="flex items-center gap-2 px-1">
          <History size={20} className="text-slate-400" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">Recent Audit Trail</h3>
        </div>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800">
                <tr className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <th className="px-6 py-4">Timestamp</th>
                  <th className="px-6 py-4">Modifier</th>
                  <th className="px-6 py-4">Employee</th>
                  <th className="px-6 py-4">Field</th>
                  <th className="px-6 py-4">Change</th>
                  <th className="px-6 py-4">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {auditLogs.slice(0, 50).map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-6 py-4 text-[11px] font-bold text-slate-400 uppercase">
                      {format(parseISO(log.timestamp), 'dd MMM HH:mm')}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{log.changedBy}</span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-900 dark:text-white leading-none">{log.employeeName}</span>
                        <span className="text-[10px] font-mono text-slate-400 uppercase mt-0.5">{log.employeeId}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge variant="muted" className="text-[10px] font-bold uppercase tracking-widest">
                        {log.field}
                      </Badge>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2 text-[11px]">
                        <span className="text-slate-400 line-through truncate max-w-[80px]">{log.oldValue || '-'}</span>
                        <span className="text-slate-300">→</span>
                        <span className="text-success font-bold truncate max-w-[80px]">{log.newValue || '-'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-xs italic text-slate-500 dark:text-slate-400">{log.remarks}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <AnimatePresence>
        {isEditModalOpen && selectedException && (
          <CorrectionModal 
            exception={selectedException} 
            onClose={() => setIsEditModalOpen(false)}
            onSuccess={() => {
              setIsEditModalOpen(false);
              fetchPunches();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

function CorrectionModal({ exception, onClose, onSuccess }: { exception: AttendanceException, onClose: () => void, onSuccess: () => void }) {
  const { employees, processedData, addAuditLog, addPunch, updateException } = useAppStore();
  const emp = employees.find(e => e.id === exception.employeeId);
  const attendance = processedData.find(p => p.id === `${exception.employeeId}_${exception.date}`);

  const [inTime, setInTime] = useState(attendance?.firstPunch ? format(parseISO(attendance.firstPunch), 'HH:mm') : '');
  const [outTime, setOutTime] = useState(attendance?.lastPunch ? format(parseISO(attendance.lastPunch), 'HH:mm') : '');
  const [remarks, setRemarks] = useState('');
  const [loading, setLoading] = useState(false);

  const handleApplyCorrection = async () => {
    if (!inTime && !outTime) {
      toast.error('Please specify at least one time');
      return;
    }
    
    setLoading(true);
    const tId = toast.loading('Applying correction...');
    
    try {
      await addAuditLog({
        employeeId: exception.employeeId,
        employeeName: emp?.name || 'Unknown',
        date: exception.date,
        field: 'Punch Timings',
        oldValue: `IN: ${attendance?.firstPunch || 'None'}, OUT: ${attendance?.lastPunch || 'None'}`,
        newValue: `IN: ${inTime}, OUT: ${outTime}`,
        changedBy: 'Admin',
        remarks: remarks || `Resolved ${exception.type}`
      });

      const dateBase = exception.date;
      
      if (inTime) {
        const timestampIn = `${dateBase}T${inTime}:00`;
        await addPunch({ employeeId: exception.employeeId, punchDatetime: timestampIn });
      }
      
      if (outTime) {
        const timestampOut = `${dateBase}T${outTime}:00`;
        await addPunch({ employeeId: exception.employeeId, punchDatetime: timestampOut });
      }

      await updateException(exception.id, { status: 'resolved', remarks });

      toast.success('Correction applied and recalculated', { id: tId });
      onSuccess();
    } catch (e) {
      toast.error('Failed to apply correction', { id: tId });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden"
      >
        <div className="bg-slate-900 p-6 text-white relative">
           <div className="flex items-center gap-3 mb-2">
              <div className="w-8 h-8 bg-danger rounded-lg flex items-center justify-center">
                 <ShieldAlert className="w-5 h-5 text-white" />
              </div>
              <h3 className="text-xl font-bold">Issue Correction</h3>
           </div>
           <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">{exception.type} — {format(parseISO(exception.date), 'dd MMM yyyy')}</p>
           <button onClick={onClose} className="absolute top-6 right-6 text-slate-400 hover:text-white transition-colors">
              <X className="w-6 h-6" />
           </button>
        </div>

        <div className="p-8 space-y-6">
          <div className="flex items-center gap-4 bg-slate-50 dark:bg-slate-800 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
             <div className="w-12 h-12 bg-primary rounded-lg flex items-center justify-center text-white text-lg font-bold">
                {emp?.name.charAt(0)}
             </div>
             <div>
                <p className="text-sm font-bold text-slate-900 dark:text-white">{emp?.name}</p>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none mt-1">{emp?.id} • {emp?.department}</p>
             </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Proposed IN Time</label>
              <Input 
                type="time" 
                value={inTime}
                onChange={(e) => setInTime(e.target.value)}
                className="font-bold"
              />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Proposed OUT Time</label>
              <Input 
                type="time" 
                value={outTime}
                onChange={(e) => setOutTime(e.target.value)}
                className="font-bold"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Resolution Remarks</label>
            <textarea 
              placeholder="Explain why this change is being made..."
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              className="w-full h-24 p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm italic focus:ring-2 focus:ring-primary/20 resize-none dark:text-white"
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button 
              variant="outline"
              onClick={onClose}
              disabled={loading}
              className="flex-1 h-12 uppercase tracking-widest text-[11px]"
            >
              Cancel
            </Button>
            <Button 
              onClick={handleApplyCorrection}
              disabled={loading}
              className="flex-[2] h-12 bg-danger hover:bg-danger/90 border-none uppercase tracking-widest text-[11px]"
            >
              {loading ? (
                <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Save size={18} />
                  Save & Resolve
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="bg-warning/10 p-4 border-t border-warning/20">
           <div className="flex gap-3">
              <Info className="w-5 h-5 text-warning shrink-0 mt-0.5" />
              <p className="text-[10px] text-warning-foreground font-bold uppercase tracking-tight leading-relaxed">
                Saving this correction will trigger an automatic recalculation of the attendance record, overtime, and monthly reports.
              </p>
           </div>
        </div>
      </motion.div>
    </div>
  );
}
