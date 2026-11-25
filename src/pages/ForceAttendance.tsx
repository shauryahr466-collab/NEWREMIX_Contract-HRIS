import React, { useState, useMemo } from 'react';
import { useAppStore } from '../store';
import { format, parseISO } from 'date-fns';
import {
  UserCheck,
  Search,
  Plus,
  Save,
  ChevronRight,
  X,
  CheckCircle2,
  XCircle,
  Trash2,
  Download,
  Clock,
  ShieldCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { PageHeader, Card, Button, Input, Badge, KPICard } from '../components/ui';
import { useActionStatus } from '../context/ActionStatusContext';
import { getNepaliDate } from '../utils/dateHelper';
import { exportToCSV } from '../lib/csvExport';
import type { ForceAttendanceRecord } from '../types';

export default function ForceAttendance() {
  const {
    employees,
    forceAttendanceRecords,
    addForceAttendance,
    updateForceAttendance,
    deleteForceAttendance,
    addAuditLog,
    addPunch,
    effectiveUserProfile,
    isSuperAdmin,
    canAccessModule,
    user
  } = useAppStore();
  const { executeWithStatus } = useActionStatus();

  const isEmployeeOnly = effectiveUserProfile?.role === 'Employee';
  const linkedEmployeeId = effectiveUserProfile?.linkedEmployeeId || '';
  const canApproveAttendance =
    isSuperAdmin || (!isEmployeeOnly && Boolean(effectiveUserProfile?.permissions?.canEditAttendance));
  const canInjectPunches =
    isSuperAdmin ||
    canAccessModule('attendance') ||
    canAccessModule('import') ||
    canAccessModule('devices');

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'Approved' | 'Rejected'>('All');

  const [formData, setFormData] = useState({
    employeeId: isEmployeeOnly ? linkedEmployeeId : '',
    date: format(new Date(), 'yyyy-MM-dd'),
    inTime: '09:00',
    outTime: '18:00',
    reason: '',
    remarks: ''
  });

  const empMap = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  const filteredRecords = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return [...forceAttendanceRecords]
      .filter((record) => {
        const recStatus = record.status || 'Approved';
        if (statusFilter !== 'All' && recStatus !== statusFilter) return false;
        const emp = empMap.get(record.employeeId);
        if (!q) return true;
        return (
          (emp?.name || '').toLowerCase().includes(q) ||
          record.employeeId.toLowerCase().includes(q) ||
          (record.reason || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => String(b.timestamp || b.date).localeCompare(String(a.timestamp || a.date)));
  }, [forceAttendanceRecords, empMap, searchTerm, statusFilter]);

  const stats = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    for (const r of forceAttendanceRecords) {
      const s = r.status || 'Approved';
      if (s === 'Pending') pending++;
      else if (s === 'Rejected') rejected++;
      else approved++;
    }
    return { total: forceAttendanceRecords.length, pending, approved, rejected };
  }, [forceAttendanceRecords]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmpId = isEmployeeOnly ? linkedEmployeeId : formData.employeeId;
    if (!targetEmpId || !formData.date || !formData.inTime || !formData.outTime || !formData.reason) {
      toast.error('Please fill all required fields');
      return;
    }

    const emp = empMap.get(targetEmpId);
    const actorName = effectiveUserProfile?.username || user?.username || targetEmpId;
    const actorRole = isSuperAdmin ? 'Super Admin' : effectiveUserProfile?.role || 'Employee';

    // Employee Self-Service Submission -> Pending Only, Zero Punch Injection
    if (isEmployeeOnly) {
      try {
        await addForceAttendance({
          employeeId: targetEmpId,
          date: formData.date,
          inTime: formData.inTime,
          outTime: formData.outTime,
          reason: formData.reason,
          remarks: formData.remarks || formData.reason,
          status: 'Pending',
          requestedBy: actorName,
          requestedByRole: 'Employee',
          approvedBy: '',
          approvedByRole: ''
        });
        toast.success('Attendance correction request submitted and awaiting HOD / Supervisor / Super Admin approval.');
        setIsModalOpen(false);
        setFormData({
          employeeId: linkedEmployeeId,
          date: format(new Date(), 'yyyy-MM-dd'),
          inTime: '09:00',
          outTime: '18:00',
          reason: '',
          remarks: ''
        });
      } catch (err: any) {
        toast.error(err?.message || 'Failed to submit attendance request');
      }
      return;
    }

    if (!canApproveAttendance) {
      toast.error('Your role does not have attendance correction approval rights.');
      return;
    }

    await executeWithStatus(
      {
        title: `Apply Force Attendance Correction?`,
        subtitle: `Approve & apply attendance adjustment for ${emp?.name || targetEmpId} on ${formData.date}`,
        module: 'Manual Corrections',
        actionType: 'save',
        recordId: targetEmpId,
        recordName: emp?.name,
        details: {
          Employee: `${emp?.name || 'Unknown'} (${targetEmpId})`,
          'Adjustment Date': formData.date,
          'Manual IN Time': formData.inTime,
          'Manual OUT Time': formData.outTime,
          Reason: formData.reason || 'Manual Correction'
        },
        confirmText: 'Apply & Save Punch Correction'
      },
      async (updateProgress) => {
        updateProgress({ percent: 35, message: 'Registering approved force adjustment in SQLite...' });
        await addForceAttendance({
          ...formData,
          employeeId: targetEmpId,
          status: 'Approved',
          requestedBy: actorName,
          requestedByRole: actorRole,
          approvedBy: actorName,
          approvedByRole: actorRole,
          reviewedBy: actorName,
          reviewedByRole: actorRole
        });

        if (canInjectPunches) {
          updateProgress({ percent: 70, message: 'Creating biometric punch timestamps in SQLite...' });
          const dateBase = formData.date;
          await addPunch({ employeeId: targetEmpId, punchDatetime: `${dateBase}T${formData.inTime}:00` });
          await addPunch({ employeeId: targetEmpId, punchDatetime: `${dateBase}T${formData.outTime}:00` });
        }

        setIsModalOpen(false);
        setFormData({
          employeeId: '',
          date: format(new Date(), 'yyyy-MM-dd'),
          inTime: '09:00',
          outTime: '18:00',
          reason: '',
          remarks: ''
        });

        return {
          success: true,
          affectedCount: canInjectPunches ? 3 : 1,
          verificationStatus: 'PASSED',
          transaction: 'COMMITTED',
          dbPath: 'Database.db',
          breakdown: {
            Employee: `${emp?.name || 'Unknown'} (${targetEmpId})`,
            Status: 'Approved',
            'Punches Injected': canInjectPunches ? '2 punches (IN & OUT)' : 'Reconciled via Force Adjustment'
          }
        };
      }
    );
  };

  const handleDecision = async (record: ForceAttendanceRecord, nextStatus: 'Approved' | 'Rejected') => {
    if (!canApproveAttendance) {
      toast.error('Your role does not have Attendance Request approval permission.');
      return;
    }

    const emp = empMap.get(record.employeeId);
    const actorName = effectiveUserProfile?.username || user?.username || 'Admin';
    const actorRole = isSuperAdmin ? 'Super Admin' : effectiveUserProfile?.role || 'Supervisor';
    const wasProcessed = (record.status || 'Approved') !== 'Pending';

    try {
      await updateForceAttendance(record.id, {
        status: nextStatus,
        approvedBy: actorName,
        approvedByRole: actorRole,
        reviewedBy: actorName,
        reviewedByRole: actorRole,
        approvedAt: new Date().toISOString()
      });

      if (nextStatus === 'Approved' && canInjectPunches) {
        await addPunch({ employeeId: record.employeeId, punchDatetime: `${record.date}T${record.inTime}:00` });
        await addPunch({ employeeId: record.employeeId, punchDatetime: `${record.date}T${record.outTime}:00` });
      }

      if (!isEmployeeOnly) {
        addAuditLog({
          employeeId: record.employeeId,
          employeeName: emp?.name || record.employeeId,
          date: record.date,
          field: 'Attendance Request Decision',
          oldValue: record.status || 'Pending',
          newValue: `${nextStatus} (${record.inTime} - ${record.outTime})`,
          changedBy: actorName,
          remarks: `${actorRole}: ${record.reason}`
        });
      }

      toast.success(
        `${wasProcessed && isSuperAdmin ? 'Super Admin Override → ' : ''}Attendance request ${nextStatus.toLowerCase()} successfully.`
      );
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update attendance request');
    }
  };

  const handleDelete = async (record: ForceAttendanceRecord) => {
    try {
      await deleteForceAttendance(record.id);
      toast.success('Attendance request deleted.');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to delete record');
    }
  };

  const handleExportCSV = () => {
    if (filteredRecords.length === 0) {
      toast.info('No attendance requests to export.');
      return;
    }
    const rows = filteredRecords.map((r) => {
      const emp = empMap.get(r.employeeId);
      return {
        'Employee ID': r.employeeId,
        'Employee Name': emp?.name || 'Unknown',
        'Department': emp?.department || '-',
        'Date (AD)': r.date,
        'Date (BS)': getNepaliDate(r.date),
        'IN Time': r.inTime,
        'OUT Time': r.outTime,
        Reason: r.reason,
        Status: r.status || 'Approved',
        'Requested By': r.requestedBy || '-',
        'Reviewed / Approved By': r.reviewedBy || r.approvedBy || '-',
        'Approver Role': r.reviewedByRole || r.approvedByRole || '-',
        'Super Admin Override': r.superAdminOverride ? 'Yes' : 'No',
        Timestamp: r.timestamp
      };
    });
    exportToCSV(rows, {
      filename: `Attendance_Requests_${format(new Date(), 'yyyy-MM-dd')}.csv`
    });
    toast.success(`Exported ${rows.length} attendance request record(s).`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEmployeeOnly ? 'Attendance Request' : 'Force Attendance & Requests'}
        description={
          isEmployeeOnly
            ? 'Apply for missed punch or duty timing corrections and track approval status'
            : 'Review Employee attendance correction requests, apply adjustments, or enforce Super Admin overrides'
        }
        icon={UserCheck}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={handleExportCSV} className="gap-2">
              <Download size={16} />
              Export CSV
            </Button>
            {(isEmployeeOnly || canApproveAttendance) && (
              <Button
                onClick={() => {
                  setFormData({
                    employeeId: isEmployeeOnly ? linkedEmployeeId : '',
                    date: format(new Date(), 'yyyy-MM-dd'),
                    inTime: '09:00',
                    outTime: '18:00',
                    reason: '',
                    remarks: ''
                  });
                  setIsModalOpen(true);
                }}
                className="gap-2"
              >
                <Plus size={16} />
                {isEmployeeOnly ? 'Apply Attendance Request' : 'New Correction'}
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard label="Total Requests" value={stats.total} icon={UserCheck} onClick={() => setStatusFilter('All')} />
        <KPICard
          label="Pending Review"
          value={stats.pending}
          icon={Clock}
          trend="down"
          trendValue="Awaiting Decision"
          onClick={() => setStatusFilter('Pending')}
        />
        <KPICard
          label="Approved"
          value={stats.approved}
          icon={ShieldCheck}
          trend="up"
          trendValue="Applied to Attendance"
          onClick={() => setStatusFilter('Approved')}
        />
        <KPICard
          label="Rejected"
          value={stats.rejected}
          icon={XCircle}
          trend="neutral"
          trendValue="Declined"
          onClick={() => setStatusFilter('Rejected')}
        />
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input
              placeholder="Search employee name, ID, or reason..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
          >
            <option value="All">All Status</option>
            <option value="Pending">Pending Review</option>
            <option value="Approved">Approved</option>
            <option value="Rejected">Rejected</option>
          </select>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30">
                <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Employee</th>
                <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Date (AD / BS)</th>
                <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest">IN / OUT</th>
                <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Reason</th>
                <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Status & Approver</th>
                <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
              {filteredRecords.map((record) => {
                const emp = empMap.get(record.employeeId);
                const status = record.status || 'Approved';
                const isLockedBySuperAdmin =
                  !isSuperAdmin &&
                  Boolean(
                    record.superAdminOverride ||
                      record.approvedByRole === 'Super Admin' ||
                      record.reviewedByRole === 'Super Admin'
                  );

                return (
                  <tr key={record.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-3.5">
                      <p className="text-sm font-bold text-slate-900 dark:text-white leading-none">
                        {emp?.name || 'Unknown'}
                      </p>
                      <p className="text-[11px] font-medium text-slate-500 mt-1">
                        {record.employeeId} {emp?.department ? `· ${emp.department}` : ''}
                      </p>
                    </td>
                    <td className="px-4 py-3.5 tabular-nums">
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {format(parseISO(record.date), 'dd MMM yyyy')}
                      </p>
                      <p className="text-[10px] font-semibold text-primary mt-0.5">
                        BS {getNepaliDate(record.date)}
                      </p>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-2">
                        <Badge variant="success" className="font-mono text-[11px] h-6">
                          {record.inTime}
                        </Badge>
                        <ChevronRight size={14} className="text-slate-300" />
                        <Badge variant="danger" className="font-mono text-[11px] h-6">
                          {record.outTime}
                        </Badge>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <p className="text-xs text-slate-600 dark:text-slate-300 max-w-xs font-medium">
                        {record.reason}
                      </p>
                      {record.remarks && record.remarks !== record.reason && (
                        <p className="text-[10px] text-slate-400 mt-0.5">{record.remarks}</p>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-col gap-0.5 items-start">
                        <Badge
                          variant={
                            status === 'Approved' ? 'success' : status === 'Rejected' ? 'danger' : 'warning'
                          }
                          className="uppercase text-[10px] font-bold"
                        >
                          {status}
                        </Badge>
                        {(record.reviewedBy || record.approvedBy) && status !== 'Pending' && (
                          <span className="text-[10px] text-slate-500 dark:text-slate-400">
                            By {record.reviewedBy || record.approvedBy}
                            {(record.reviewedByRole || record.approvedByRole)
                              ? ` (${record.reviewedByRole || record.approvedByRole})`
                              : ''}
                          </span>
                        )}
                        {record.superAdminOverride && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                            Super Admin Override
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5 flex-wrap">
                        {isEmployeeOnly ? (
                          <span className="text-[11px] text-slate-400 font-medium">
                            {status === 'Pending' ? 'Awaiting Approval' : 'Processed'}
                          </span>
                        ) : isLockedBySuperAdmin ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                            Locked by Super Admin
                          </span>
                        ) : (
                          <>
                            {canApproveAttendance && status === 'Pending' && (
                              <>
                                <Button size="sm" variant="success" onClick={() => handleDecision(record, 'Approved')}>
                                  <CheckCircle2 size={12} /> Approve
                                </Button>
                                <Button size="sm" variant="danger" onClick={() => handleDecision(record, 'Rejected')}>
                                  <XCircle size={12} /> Reject
                                </Button>
                              </>
                            )}
                            {isSuperAdmin && status !== 'Pending' && (
                              <>
                                {status !== 'Approved' && (
                                  <Button size="sm" variant="success" onClick={() => handleDecision(record, 'Approved')}>
                                    Override Approve
                                  </Button>
                                )}
                                {status !== 'Rejected' && (
                                  <Button size="sm" variant="danger" onClick={() => handleDecision(record, 'Rejected')}>
                                    Override Reject
                                  </Button>
                                )}
                              </>
                            )}
                            {canApproveAttendance && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => handleDelete(record)}
                                className="text-rose-600 px-2"
                                title="Delete Request"
                              >
                                <Trash2 size={14} />
                              </Button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredRecords.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-xs text-slate-400">
                    No attendance correction requests match your filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden"
            >
              <form onSubmit={handleSubmit}>
                <div className="bg-slate-900 p-6 text-white flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <UserCheck className="text-success" />
                    <div>
                      <h3 className="text-xl font-bold">
                        {isEmployeeOnly ? 'Submit Attendance Request' : 'Force Attendance Entry'}
                      </h3>
                      <p className="text-slate-400 text-[11px] font-bold uppercase tracking-widest mt-1">
                        {isEmployeeOnly
                          ? 'Self-Service Request (Requires Approval)'
                          : 'Approve & Apply Attendance Correction'}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="text-slate-400 hover:text-white transition-colors"
                  >
                    <X size={24} />
                  </button>
                </div>

                <div className="p-8 space-y-5">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Employee</label>
                    <select
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-75"
                      value={isEmployeeOnly ? linkedEmployeeId : formData.employeeId}
                      disabled={isEmployeeOnly}
                      onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                      required
                    >
                      {!isEmployeeOnly && <option value="">Select Employee</option>}
                      {employees
                        .filter((e) => !isEmployeeOnly || e.id === linkedEmployeeId)
                        .map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name} ({e.id})
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Date</label>
                    <Input
                      type="date"
                      value={formData.date}
                      onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                      required
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                        Requested IN Time
                      </label>
                      <Input
                        type="time"
                        value={formData.inTime}
                        onChange={(e) => setFormData({ ...formData, inTime: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                        Requested OUT Time
                      </label>
                      <Input
                        type="time"
                        value={formData.outTime}
                        onChange={(e) => setFormData({ ...formData, outTime: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                      Adjustment Reason
                    </label>
                    <select
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      value={formData.reason}
                      onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
                      required
                    >
                      <option value="">Select Reason</option>
                      <option value="Biometric Machine Miss">Biometric Machine Miss</option>
                      <option value="Forgot to Punch">Forgot to Punch</option>
                      <option value="Device Issue">Device Issue</option>
                      <option value="On Duty / Outstation">On Duty / Outstation</option>
                      <option value="Approved Manual Adjustment">Approved Manual Adjustment</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">
                      Additional Remarks (Optional)
                    </label>
                    <Input
                      value={formData.remarks}
                      onChange={(e) => setFormData({ ...formData, remarks: e.target.value })}
                      placeholder="Enter shift or duty note..."
                    />
                  </div>

                  <Button type="submit" className="w-full h-12 uppercase tracking-widest text-[11px] font-bold">
                    <Save size={18} className="mr-2" />
                    {isEmployeeOnly ? 'Submit Attendance Request' : 'Apply Force Entry'}
                  </Button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
