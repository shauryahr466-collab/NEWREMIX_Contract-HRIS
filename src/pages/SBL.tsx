import React, { useMemo, useState } from 'react';
import { useAppStore } from '../store';
import { format, parseISO } from 'date-fns';
import { 
  CalendarRange, Search, Download, Clock, Info, Plus, Save, 
  ShieldCheck, ShieldAlert, Trash2, X, RefreshCw, Filter, 
  UserCheck, Layers, ArrowRight, CheckCircle2, Calendar, 
  Wallet, Award, Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { PageHeader, Card, Button, Input, KPICard, Badge } from '../components/ui';
import { cn } from '../lib/utils';
import { Employee, SBLRecord, ProcessedAttendance } from '../types';

export default function SBL() {
  const { 
    sblRecords, 
    employees, 
    processedData, 
    updateSBL, 
    addSBL, 
    deleteSBL, 
    setSBLBatch, 
    deleteSBLBatch, 
    globalSearchTerm,
    effectiveUserProfile,
    isSuperAdmin,
    user
  } = useAppStore();

  const isEmployeeOnly = effectiveUserProfile?.role === 'Employee';
  const linkedEmployeeId = effectiveUserProfile?.linkedEmployeeId || '';
  const canApproveLeave = isSuperAdmin || (!isEmployeeOnly && Boolean(effectiveUserProfile?.permissions?.canEditAttendance || effectiveUserProfile?.permissions?.canApproveOt));

  const [searchTerm, setSearchTerm] = useState('');
  const activeSearch = searchTerm || globalSearchTerm;

  const [dateRange, setDateRange] = useState({
    start: format(new Date(), 'yyyy-MM-01'),
    end: format(new Date(), 'yyyy-MM-dd')
  });

  const [sectionTab, setSectionTab] = useState<'all' | 'pwo_pending' | 'sbl_approved' | 'balances'>('all');
  const [leaveTypeFilter, setLeaveTypeFilter] = useState<string>('All');
  const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'Approved' | 'Rejected' | 'Final Confirmed' | 'Not Approved'>('All');
  const [eligibilityScope, setEligibilityScope] = useState<'Non-OT Only' | 'All Staff'>('Non-OT Only');
  const [designationFilter, setDesignationFilter] = useState<string>('All');
  const [contractorFilter, setContractorFilter] = useState<string>('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isBalanceModalOpen, setIsBalanceModalOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(50);

  const [formData, setFormData] = useState({
    employeeId: isEmployeeOnly ? linkedEmployeeId : '',
    date: format(new Date(), 'yyyy-MM-dd'),
    leaveType: (isEmployeeOnly ? 'Casual Leave' : 'SBL') as SBLRecord['leaveType'],
    duration: 'Full Day',
    reason: ''
  });

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [deleteConfirmModal, setDeleteConfirmModal] = useState<{
    isOpen: boolean;
    recordId?: string;
    recordName?: string;
    isBulk?: boolean;
  }>({ isOpen: false });

  // O(1) Employee Map
  const empMap = useMemo(() => new Map<string, Employee>(employees.map(e => [e.id, e])), [employees]);

  // Designations & Contractors lists
  const designations = useMemo(() => {
    const list = employees.map(e => e.designation).filter(Boolean);
    return Array.from(new Set(list));
  }, [employees]);

  const contractors = useMemo(() => {
    const list = employees.map(e => e.contractorName).filter(Boolean);
    return Array.from(new Set(list));
  }, [employees]);

  const handleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    const count = selectedIds.length;
    const tId = toast.loading(`Deleting ${count} selected records...`);
    try {
      await deleteSBLBatch(selectedIds);
      setSelectedIds([]);
      toast.success(`Successfully deleted ${count} record(s)`, { id: tId });
    } catch (e: any) {
      toast.error(e?.message || 'Bulk delete failed', { id: tId });
    }
  };

  const handleDeleteSBL = async (id: string) => {
    const tId = toast.loading('Deleting record...');
    try {
      await deleteSBL(id);
      toast.success('Record deleted successfully', { id: tId });
    } catch (e: any) {
      toast.error(e?.message || 'Delete failed', { id: tId });
    }
  };

  // Sync PWO & SBL from Reconciliation Attendance
  const handleSyncPWOAttendance = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    const tId = toast.loading('Syncing PWO & Substitute Leave from Reconciliation Attendance...');

    // Yield execution frame for smooth UI animation
    await new Promise(r => setTimeout(r, 40));

    try {
      let added = 0;
      let updated = 0;

      const sblMap = new Map<string, SBLRecord>(sblRecords.map(r => [`${r.employeeId}_${r.date}`, r]));
      const batchToUpsert: SBLRecord[] = [];
      const startDate = dateRange.start;
      const endDate = dateRange.end;

      for (let i = 0; i < processedData.length; i++) {
        const att = processedData[i];
        if (att.date < startDate || att.date > endDate) continue;

        const emp = empMap.get(att.employeeId);
        
        // Scope check: Non-OT staff vs All staff
        if (eligibilityScope === 'Non-OT Only' && emp?.otEligible === true) {
          continue; // OT eligible staff go to Overtime Audit Log, not PWO/SBL
        }

        // PWO condition: Attendance marked as PWO or worked on Weekly Off/Holiday
        const isPWOStatus = att.status === 'PWO';
        const isWorkedOffday = ((att.status as string) === 'Weekly Off' || (att.status as string) === 'Off') && (att.workingHours > 0 || !!att.firstPunch);
        const isPresentOnOff = (att.status === 'Present' || att.status === 'Late' || att.status === 'On Time') && (att.workingHours > 0) && (att.shiftName?.toLowerCase().includes('off') || att.shiftCode === 'WO');

        if (!isPWOStatus && !isWorkedOffday && !isPresentOnOff) {
          continue;
        }

        const existingKey = `${att.employeeId}_${att.date}`;
        const existingRecord = sblMap.get(existingKey);

        const workHrs = Number(att.workingHours) || Number(att.workHours) || 0;
        let duration = 'Full Day';
        if (workHrs < 3.5) {
          duration = `${workHrs.toFixed(1)} Hours`;
        } else if (workHrs < 7.0) {
          duration = 'Half Day';
        }

        // Extract punch times
        let inTimeStr = att.inTime || '-';
        if (inTimeStr === '-' && att.firstPunch) {
          inTimeStr = att.firstPunch.includes('T') ? att.firstPunch.split('T')[1].substring(0, 5) : att.firstPunch.substring(0, 5);
        }

        let outTimeStr = att.outTime || '-';
        if (outTimeStr === '-' && att.lastPunch) {
          outTimeStr = att.lastPunch.includes('T') ? att.lastPunch.split('T')[1].substring(0, 5) : att.lastPunch.substring(0, 5);
        }

        // Day Name & Weekly Off Name
        let dayName = '';
        try {
          dayName = format(parseISO(att.date), 'EEEE');
        } catch (e) {
          dayName = '';
        }

        const weeklyOffName = emp?.weeklyOff ? `Weekly Off (${emp.weeklyOff})` : (att.shiftName || 'Weekly Off');

        const isNonOtText = emp?.otEligible === false ? 'Non-OT Staff' : 'Staff';
        const autoReason = `PWO Initial Sync: Worked ${workHrs.toFixed(1)}h on Offday (${isNonOtText})`;

        if (!existingRecord) {
          added++;
          batchToUpsert.push({
            id: `sbl_pwo_${att.employeeId}_${att.date.replace(/-/g, '')}`,
            employeeId: att.employeeId,
            date: att.date,
            leaveType: 'PWO',
            duration,
            reason: autoReason,
            status: 'Pending', // PWO synced as Pending initial entry
            approvedBy: undefined,
            workingHours: workHrs,
            source: 'Reconciliation Attendance',
            inTime: inTimeStr,
            outTime: outTimeStr,
            dayName,
            weeklyOffName
          });
        } else {
          // Preserve existing approval status! Once approved by HR, it converts to SBL and stays saved in SBL balance
          updated++;
          batchToUpsert.push({
            ...existingRecord,
            duration: existingRecord.duration || duration,
            workingHours: workHrs || existingRecord.workingHours,
            inTime: inTimeStr !== '-' ? inTimeStr : existingRecord.inTime,
            outTime: outTimeStr !== '-' ? outTimeStr : existingRecord.outTime,
            dayName: dayName || existingRecord.dayName,
            weeklyOffName: weeklyOffName || existingRecord.weeklyOffName
          });
        }
      }

      if (batchToUpsert.length > 0) {
        await setSBLBatch(batchToUpsert);
      }

      toast.success(`PWO Sync Complete: ${added} new initial PWO entries found, ${updated} verified (${batchToUpsert.length} total)`, { id: tId });
    } catch (e) {
      console.error('PWO Sync Error:', e);
      toast.error('Sync failed', { id: tId });
    } finally {
      setIsSyncing(false);
    }
  };

  // Ultra-fast filtered records
  const filteredRecords = useMemo(() => {
    const activeLower = activeSearch ? activeSearch.toLowerCase() : '';
    const startDate = dateRange.start;
    const endDate = dateRange.end;

    return sblRecords.filter(record => {
      // Date bounds
      if (startDate && record.date < startDate) return false;
      if (endDate && record.date > endDate) return false;

      // Section tab logic: PWO is initial -> Converted to SBL on approval
      if (sectionTab === 'pwo_pending') {
        if (record.status !== 'Pending') return false;
      } else if (sectionTab === 'sbl_approved') {
        if (record.status !== 'Approved' && record.status !== 'Final Confirmed') return false;
      }

      // Status & Leave Type filter
      if (statusFilter !== 'All' && record.status !== statusFilter) return false;
      if (leaveTypeFilter !== 'All' && record.leaveType !== leaveTypeFilter) return false;

      const emp = empMap.get(record.employeeId);
      if (designationFilter !== 'All' && emp?.designation !== designationFilter) return false;
      if (contractorFilter !== 'All' && emp?.contractorName !== contractorFilter) return false;

      // Search match
      if (activeLower) {
        const nameMatch = emp?.name?.toLowerCase().includes(activeLower);
        const idMatch = record.employeeId.toLowerCase().includes(activeLower);
        const desigMatch = emp?.designation?.toLowerCase().includes(activeLower);
        if (!nameMatch && !idMatch && !desigMatch) return false;
      }

      return true;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [sblRecords, empMap, activeSearch, dateRange, sectionTab, statusFilter, leaveTypeFilter, designationFilter, contractorFilter]);

  // Employee SBL Balances calculation
  const employeeSblBalances = useMemo(() => {
    const map = new Map<string, { employee: Employee; totalApprovedDays: number; pwoCount: number; sblCount: number; pendingCount: number }>();
    
    employees.forEach(e => {
      map.set(e.id, { employee: e, totalApprovedDays: 0, pwoCount: 0, sblCount: 0, pendingCount: 0 });
    });

    sblRecords.forEach(r => {
      const item = map.get(r.employeeId);
      if (item) {
        if (r.status === 'Approved' || r.status === 'Final Confirmed') {
          let credit = 1.0;
          if (r.duration?.toLowerCase().includes('half')) credit = 0.5;
          else if (r.duration?.toLowerCase().includes('hours')) {
            const hrs = parseFloat(r.duration) || 0;
            credit = hrs >= 7 ? 1.0 : (hrs >= 3.5 ? 0.5 : 0.25);
          }
          item.totalApprovedDays += credit;
          if (r.leaveType === 'PWO') item.pwoCount += 1;
          else item.sblCount += 1;
        } else if (r.status === 'Pending') {
          item.pendingCount += 1;
        }
      }
    });

    return Array.from(map.values()).filter(b => b.totalApprovedDays > 0 || b.pendingCount > 0 || b.employee.otEligible === false);
  }, [sblRecords, employees]);

  // Single-pass Stats
  const stats = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let rejected = 0;
    let pwoCount = 0;
    let sblCount = 0;

    for (let i = 0; i < sblRecords.length; i++) {
      const r = sblRecords[i];
      if (r.status === 'Pending') pending++;
      else if (r.status === 'Approved' || r.status === 'Final Confirmed') approved++;
      else if (r.status === 'Rejected') rejected++;

      if (r.leaveType === 'PWO') pwoCount++;
      else sblCount++;
    }

    return {
      total: sblRecords.length,
      pending,
      approved,
      rejected,
      pwoCount,
      sblCount
    };
  }, [sblRecords]);

  // Paginated records
  const totalPages = Math.ceil(filteredRecords.length / pageSize) || 1;
  const paginatedRecords = useMemo(() => {
    if (pageSize === 0) return filteredRecords; // All
    const start = (currentPage - 1) * pageSize;
    return filteredRecords.slice(start, start + pageSize);
  }, [filteredRecords, currentPage, pageSize]);

  const handleStatusChange = async (id: string, status: 'Approved' | 'Rejected' | 'Final Confirmed' | 'Not Approved') => {
    if (!canApproveLeave) {
      toast.error('Your role does not have Leave / Substitute Leave approval permission.');
      return;
    }
    try {
      const target = sblRecords.find(r => r.id === id);
      const actorName = effectiveUserProfile?.username || user?.username || 'Admin';
      const actorRole = isSuperAdmin ? 'Super Admin' : (effectiveUserProfile?.role || 'Supervisor');
      const wasProcessed = target && target.status !== 'Pending';

      const updates: Partial<SBLRecord> = { 
        status, 
        approvedBy: actorName,
        approvedByRole: actorRole,
        reviewedBy: actorName,
        reviewedByRole: actorRole
      };

      // Key Workflow Logic: PWO is the initial stage of SBL.
      // When HR approves a PWO, convert its leaveType to 'SBL' so it moves into the SBL Section and adds to the SBL Balance!
      if (status === 'Approved' || status === 'Final Confirmed') {
        if (target?.leaveType === 'PWO') {
          updates.leaveType = 'SBL';
          updates.reason = target.reason ? `${target.reason} (PWO Approved -> Converted to SBL Credit)` : 'Approved PWO Converted to SBL Credit';
        }
      }

      await updateSBL(id, updates);
      if (status === 'Approved' || status === 'Final Confirmed') {
        toast.success(
          wasProcessed && isSuperAdmin
            ? `Super Admin Override → ${target?.leaveType || 'Leave'} marked ${status}`
            : target?.leaveType === 'PWO'
              ? `PWO Approved & Converted! Credited into SBL Balance Section.`
              : `Request marked ${status} by ${actorName}.`
        );
      } else {
        toast.success(`${wasProcessed && isSuperAdmin ? 'Super Admin Override → ' : ''}Status updated to ${status}`);
      }
    } catch (e: any) {
      toast.error(e?.message || 'Operation failed');
    }
  };

  const handleAddSBL = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetEmpId = isEmployeeOnly ? linkedEmployeeId : formData.employeeId;
    if (!targetEmpId || !formData.date || !formData.reason) {
      toast.error('Please fill all required fields');
      return;
    }

    try {
      const emp = empMap.get(targetEmpId);
      let dayName = '';
      try {
        dayName = format(parseISO(formData.date), 'EEEE');
      } catch (err) {
        dayName = '';
      }

      const actorName = effectiveUserProfile?.username || user?.username || targetEmpId;
      const actorRole = effectiveUserProfile?.role || 'Supervisor';
      const initialStatus: SBLRecord['status'] = isEmployeeOnly ? 'Pending' : 'Approved';

      await addSBL({
        ...formData,
        employeeId: targetEmpId,
        status: initialStatus,
        requestedBy: actorName,
        requestedByRole: actorRole,
        approvedBy: isEmployeeOnly ? undefined : actorName,
        approvedByRole: isEmployeeOnly ? undefined : (isSuperAdmin ? 'Super Admin' : actorRole),
        dayName,
        weeklyOffName: emp?.weeklyOff ? `Weekly Off (${emp.weeklyOff})` : 'Weekly Off'
      });
      toast.success(
        isEmployeeOnly
          ? `${formData.leaveType} request submitted and awaiting HOD / Supervisor / Super Admin approval`
          : `${formData.leaveType} record registered and approved`
      );
      setIsModalOpen(false);
      setFormData({
        employeeId: isEmployeeOnly ? linkedEmployeeId : '',
        date: format(new Date(), 'yyyy-MM-dd'),
        leaveType: isEmployeeOnly ? 'Casual Leave' : 'SBL',
        duration: 'Full Day',
        reason: ''
      });
    } catch (e: any) {
      toast.error(e?.message || 'Failed to add record');
    }
  };

  const handleExport = () => {
    try {
      const data = filteredRecords.map(record => {
        const emp = empMap.get(record.employeeId);
        return {
          'Employee Name': emp?.name || 'Unknown',
          'Employee ID': record.employeeId,
          'OT Eligible': emp?.otEligible ? 'Yes' : 'No (PWO/SBL Eligible)',
          'Department': emp?.department || '-',
          'Designation': emp?.designation || '-',
          'Contractor': emp?.contractorName || '-',
          'Date': record.date,
          'Day Name': record.dayName || '-',
          'Weekly Off Name': record.weeklyOffName || '-',
          'In Time': record.inTime || '-',
          'Out Time': record.outTime || '-',
          'Leave Type': record.leaveType,
          'Duration': record.duration,
          'Working Hours': record.workingHours || '-',
          'Status': record.status,
          'Approved By': record.approvedBy || '-',
          'Source': record.source || 'Manual Entry',
          'Reason': record.reason || ''
        };
      });

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'SBL_PWO_Summary');
      
      const fileName = `SBL_PWO_Summary_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success('SBL & PWO Summary exported successfully');
    } catch (error) {
      toast.error('Failed to export summary');
    }
  };

  const handleExportConfirmed = () => {
    try {
      const confirmedRecords = sblRecords.filter(r => r.status === 'Final Confirmed' || r.status === 'Approved');
      if (confirmedRecords.length === 0) {
        toast.error('No approved/confirmed records to export');
        return;
      }

      const data = confirmedRecords.map(record => {
        const emp = empMap.get(record.employeeId);
        return {
          'Employee Name': emp?.name || 'Unknown',
          'Employee ID': record.employeeId,
          'OT Eligible': emp?.otEligible ? 'Yes' : 'No',
          'Department': emp?.department || '-',
          'Date': record.date,
          'Day Name': record.dayName || '-',
          'Weekly Off Name': record.weeklyOffName || '-',
          'In Time': record.inTime || '-',
          'Out Time': record.outTime || '-',
          'Leave Type': record.leaveType,
          'Duration': record.duration,
          'Working Hours': record.workingHours || '-',
          'Status': record.status,
          'Approved By': record.approvedBy || '-',
          'Export Date': format(new Date(), 'dd MMM yyyy')
        };
      });

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Confirmed_SBL_PWO');
      
      const fileName = `Confirmed_SBL_PWO_${format(new Date(), 'MMMM_yyyy')}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success('Monthly Confirmed SBL Report exported');
    } catch (error) {
      toast.error('Export failed');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title={isEmployeeOnly ? "Leave & Substitute Leave" : "Leave, SBL & PWO Management"} 
        description={isEmployeeOnly ? "Apply for Casual, Sick, Annual, or Substitute Leave (SBL) and track approval status" : "Leave Requests, PWO Initial Entry → Approved SBL Credits & Super Admin Override"}
        icon={CalendarRange}
        actions={
          <div className="flex flex-wrap gap-2">
            {!isEmployeeOnly && (
              <Button 
                onClick={handleSyncPWOAttendance} 
                disabled={isSyncing}
                className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white border-none shadow-md shadow-indigo-500/20"
              >
                <RefreshCw size={16} className={cn(isSyncing && "animate-spin")} />
                {isSyncing ? 'Syncing PWO...' : 'Sync PWO Attendance'}
              </Button>
            )}
            <Button
              onClick={() => {
                setFormData({
                  employeeId: isEmployeeOnly ? linkedEmployeeId : '',
                  date: format(new Date(), 'yyyy-MM-dd'),
                  leaveType: isEmployeeOnly ? 'Casual Leave' : 'SBL',
                  duration: 'Full Day',
                  reason: ''
                });
                setIsModalOpen(true);
              }}
              className="gap-2"
            >
              <Plus size={16} />
              {isEmployeeOnly ? 'Apply Leave / Substitute Leave' : 'New Entry'}
            </Button>
            {!isEmployeeOnly && (
              <>
                <Button 
                  variant="outline" 
                  onClick={() => setIsBalanceModalOpen(true)}
                  className="gap-2 border-indigo-200 text-indigo-700 bg-indigo-50/50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:text-indigo-300 dark:border-indigo-800"
                >
                  <Wallet size={16} />
                  SBL Balances
                </Button>
                <Button variant="outline" onClick={handleExportConfirmed} className="gap-2 bg-success/10 text-success border-success/20 hover:bg-success hover:text-white">
                  <ShieldCheck size={16} />
                  Confirmed Summary
                </Button>
              </>
            )}
            <Button variant="outline" onClick={handleExport} className="gap-2">
              <Download size={16} />
              Export
            </Button>
            {!isEmployeeOnly && selectedIds.length > 0 && (
              <Button variant="danger" onClick={handleBulkDelete} className="gap-2">
                <Trash2 size={16} />
                Delete Selected ({selectedIds.length})
              </Button>
            )}
          </div>
        }
      />

      {/* PWO to SBL Workflow Banner (Admin/Supervisor Only) */}
      {!isEmployeeOnly && (
      <Card className="p-5 border-l-4 border-l-indigo-600 bg-gradient-to-r from-indigo-50/50 via-white to-purple-50/30 dark:from-indigo-950/20 dark:via-slate-900 dark:to-purple-950/10">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-sm shrink-0 mt-0.5">
              <UserCheck size={20} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  PWO is the Initial Stage of SBL (Substitute Leave)
                </h3>
                <Badge variant="info" className="text-[10px] uppercase font-bold">Initial → Approved SBL Flow</Badge>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 leading-relaxed max-w-4xl">
                Non-OT staff working on Offdays/Holidays are synced as <strong>PWO (Initial Entry)</strong>. 
                When HR approves a PWO, it automatically transforms into an <strong>SBL (Substitute Leave)</strong> credit in the SBL section and stays locked in their balance until manually deleted.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0 w-full lg:w-auto pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-1.5 bg-white dark:bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-800 text-xs">
              <span className="text-slate-400 font-bold uppercase text-[10px]">Target Scope:</span>
              <select 
                value={eligibilityScope}
                onChange={(e) => setEligibilityScope(e.target.value as any)}
                className="bg-transparent font-medium focus:outline-none cursor-pointer text-slate-800 dark:text-slate-200"
              >
                <option value="Non-OT Only">Non-OT Eligible Only</option>
                <option value="All Staff">All Staff</option>
              </select>
            </div>

            <Button 
              size="sm"
              onClick={handleSyncPWOAttendance} 
              disabled={isSyncing}
              className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9 px-4"
            >
              <RefreshCw size={14} className={cn(isSyncing && "animate-spin")} />
              Run PWO Route Sync
            </Button>
          </div>
        </div>
      </Card>
      )}

      <div className={cn("grid grid-cols-1 sm:grid-cols-2 gap-4", isEmployeeOnly ? "md:grid-cols-3" : "md:grid-cols-4")}>
        <KPICard 
          label="Total Requests" 
          value={stats.total} 
          icon={CalendarRange} 
          onClick={() => { setSectionTab('all'); setLeaveTypeFilter('All'); setStatusFilter('All'); }}
        />
        <KPICard 
          label="Pending Approval" 
          value={stats.pending} 
          icon={Clock} 
          trend="down"
          trendValue="Awaiting Decision"
          onClick={() => { setSectionTab('pwo_pending'); setStatusFilter('Pending'); }}
        />
        <KPICard 
          label="Approved Leave / SBL" 
          value={stats.approved} 
          icon={ShieldCheck} 
          trend="up"
          trendValue="Approved / Credited"
          onClick={() => { setSectionTab('sbl_approved'); setStatusFilter('Approved'); }}
        />
        {!isEmployeeOnly && (
          <KPICard 
            label="Total Staff Balances" 
            value={employeeSblBalances.length} 
            icon={Wallet} 
            onClick={() => setIsBalanceModalOpen(true)}
          />
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <Card className="p-4 space-y-4">
            {/* Main Stage Navigation Tabs */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800/60 rounded-xl">
                <button 
                  onClick={() => { setSectionTab('all'); setStatusFilter('All'); setLeaveTypeFilter('All'); }}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5",
                    sectionTab === 'all' 
                      ? "bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm" 
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                  )}
                >
                  <Layers size={14} />
                  All Records ({sblRecords.length})
                </button>

                <button 
                  onClick={() => { setSectionTab('pwo_pending'); setStatusFilter('Pending'); }}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5",
                    sectionTab === 'pwo_pending' 
                      ? "bg-amber-500 text-white shadow-sm" 
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                  )}
                >
                  <Clock size={14} />
                  1. Initial PWO Requests ({stats.pending})
                </button>

                <button 
                  onClick={() => { setSectionTab('sbl_approved'); setStatusFilter('Approved'); }}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5",
                    sectionTab === 'sbl_approved' 
                      ? "bg-success text-white shadow-sm" 
                      : "text-slate-600 dark:text-slate-400 hover:text-slate-900"
                  )}
                >
                  <CheckCircle2 size={14} />
                  2. Approved SBL Section ({stats.approved})
                </button>
              </div>

              {/* Date Range Controls */}
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Date Range:</span>
                <input 
                  type="date"
                  value={dateRange.start}
                  onChange={e => setDateRange({ ...dateRange, start: e.target.value })}
                  className="px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs"
                />
                <span className="text-slate-400 text-xs">to</span>
                <input 
                  type="date"
                  value={dateRange.end}
                  onChange={e => setDateRange({ ...dateRange, end: e.target.value })}
                  className="px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input 
                  placeholder="Search employee name, ID..."
                  className="pl-9 h-9 text-xs"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select 
                  value={leaveTypeFilter}
                  onChange={(e) => setLeaveTypeFilter(e.target.value)}
                  className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="All">All Types</option>
                  <option value="Casual Leave">Casual Leave</option>
                  <option value="Sick Leave">Sick Leave</option>
                  <option value="Annual Leave">Annual Leave</option>
                  <option value="Unpaid Leave">Unpaid Leave</option>
                  <option value="SBL">SBL (Substitute Leave)</option>
                  <option value="PWO">PWO (Initial)</option>
                  <option value="Comp Leave">Comp Leave</option>
                  <option value="Short Break">Short Break</option>
                </select>

                <select 
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as any)}
                  className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                >
                  <option value="All">All Status</option>
                  <option value="Pending">Pending</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                  <option value="Final Confirmed">Final Confirmed</option>
                </select>

                {!isEmployeeOnly && (
                  <select 
                    value={designationFilter}
                    onChange={(e) => setDesignationFilter(e.target.value)}
                    className="px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="All">All Designations</option>
                    {designations.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                )}
              </div>

              <div className="text-xs text-slate-500 font-medium">
                Showing {filteredRecords.length} records
              </div>
            </div>

            {/* Bulk Action Bar */}
            {selectedIds.length > 0 && (
              <div className="bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 rounded-xl p-3 flex items-center justify-between my-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                  <span className="text-xs font-bold text-rose-900 dark:text-rose-200">
                    {selectedIds.length} record(s) selected
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="danger"
                    size="sm"
                    onClick={() => setDeleteConfirmModal({ isOpen: true, isBulk: true })}
                    className="h-8 text-xs gap-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold"
                  >
                    <Trash2 size={14} />
                    Delete Selected ({selectedIds.length})
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setSelectedIds([])}
                    className="h-8 text-xs"
                  >
                    Clear Selection
                  </Button>
                </div>
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30">
                    {!isEmployeeOnly && (
                      <th className="px-3 py-3 w-10 text-center">
                        <input 
                          type="checkbox"
                          checked={paginatedRecords.length > 0 && selectedIds.length === paginatedRecords.length}
                          onChange={(e) => setSelectedIds(e.target.checked ? paginatedRecords.map(r => r.id) : [])}
                          className="rounded border-slate-300 text-primary focus:ring-primary"
                        />
                      </th>
                    )}
                    <th className="px-3 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Employee</th>
                    <th className="px-3 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Date & Day</th>
                    <th className="px-3 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Weekly Off</th>
                    <th className="px-3 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">In / Out Time</th>
                    <th className="px-3 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Type & Credit</th>
                    <th className="px-3 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Status & Reviewer</th>
                    <th className="px-3 py-3 text-right text-[10px] font-bold text-slate-400 uppercase tracking-widest">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 text-xs">
                  {paginatedRecords.map((record) => {
                    const emp = empMap.get(record.employeeId);
                    const isLockedBySuperAdmin =
                      !isSuperAdmin &&
                      Boolean(
                        record.superAdminOverride ||
                          record.approvedByRole === 'Super Admin' ||
                          record.reviewedByRole === 'Super Admin'
                      );
                    
                    let dayName = record.dayName;
                    if (!dayName && record.date) {
                      try {
                        dayName = format(parseISO(record.date), 'EEEE');
                      } catch (e) {
                        dayName = '';
                      }
                    }

                    const weeklyOffName = record.weeklyOffName || (emp?.weeklyOff ? `Weekly Off (${emp.weeklyOff})` : 'Weekly Off');

                    return (
                      <tr 
                        key={record.id}
                        className={cn(
                          "group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors",
                          selectedIds.includes(record.id) && "bg-primary/5 dark:bg-primary/10"
                        )}
                      >
                        {!isEmployeeOnly && (
                          <td className="px-3 py-3 text-center">
                            <input 
                              type="checkbox"
                              disabled={isLockedBySuperAdmin}
                              checked={selectedIds.includes(record.id)}
                              onChange={() => handleSelect(record.id)}
                              className="rounded border-slate-300 text-primary focus:ring-primary disabled:opacity-40"
                            />
                          </td>
                        )}
                        <td className="px-3 py-3">
                          <div>
                            <p className="font-bold text-slate-900 dark:text-white leading-none">{emp?.name || 'Unknown'}</p>
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="text-[10px] font-semibold text-slate-500">{record.employeeId}</span>
                              {emp?.otEligible === false && (
                                <span className="text-[9px] px-1 py-0.2 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-400 rounded font-bold border border-indigo-200 dark:border-indigo-800">
                                  Non-OT
                                </span>
                              )}
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-semibold text-slate-800 dark:text-slate-200">
                            {record.date}
                          </div>
                          {dayName && (
                            <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 block mt-0.5">
                              {dayName}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                            {weeklyOffName}
                          </span>
                        </td>
                        <td className="px-3 py-3 font-mono text-[11px] text-slate-700 dark:text-slate-300">
                          {record.inTime || '-'} <span className="text-slate-400 font-sans">→</span> {record.outTime || '-'}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex items-center gap-1.5">
                            <Badge 
                              variant={record.leaveType === 'SBL' ? 'success' : record.leaveType === 'PWO' ? 'info' : 'muted'} 
                              className={cn(
                                "uppercase text-[9px] px-2 py-0.5 font-bold",
                                record.leaveType === 'SBL' && "bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800",
                                record.leaveType === 'PWO' && "bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 border-amber-300 dark:border-amber-800"
                              )}
                            >
                              {record.leaveType === 'PWO' ? 'PWO (Initial)' : record.leaveType}
                            </Badge>
                          </div>
                          <span className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 block mt-0.5">
                            {record.duration} {record.workingHours ? `(${record.workingHours}h)` : ''}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex flex-col gap-0.5 items-start">
                            <Badge 
                              variant={
                                record.status === 'Final Confirmed' ? 'info' :
                                record.status === 'Approved' ? 'success' :
                                record.status === 'Rejected' ? 'danger' :
                                record.status === 'Not Approved' ? 'outline' : 'warning'
                              }
                              className="uppercase text-[9px] font-bold"
                            >
                              {record.status}
                            </Badge>
                            {(record.approvedBy || record.reviewedBy) && record.status !== 'Pending' && (
                              <span className="text-[9px] text-slate-500 dark:text-slate-400 font-medium">
                                By {record.reviewedBy || record.approvedBy}{(record.reviewedByRole || record.approvedByRole) ? ` (${record.reviewedByRole || record.approvedByRole})` : ''}
                              </span>
                            )}
                            {record.superAdminOverride && (
                              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                Super Admin Override
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-3 py-3 text-right">
                          <div className="flex items-center justify-end gap-1 opacity-90 group-hover:opacity-100 transition-opacity flex-wrap">
                            {isEmployeeOnly ? (
                              <span className="text-[10px] font-semibold text-slate-400">
                                {record.status === 'Pending' ? 'Awaiting Review' : 'Finalized'}
                              </span>
                            ) : isLockedBySuperAdmin ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded text-[9px] font-bold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                Locked by Super Admin
                              </span>
                            ) : (
                              <>
                                {canApproveLeave && record.status === 'Pending' && (
                                  <>
                                    <button 
                                      onClick={() => handleStatusChange(record.id, 'Approved')}
                                      className="flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-[10px] font-bold shadow-sm transition-all"
                                      title={record.leaveType === 'PWO' ? "Approve PWO -> Converts & Credits to SBL Section" : "Approve Request"}
                                    >
                                      <ShieldCheck size={14} />
                                      {record.leaveType === 'PWO' ? 'Approve to SBL' : 'Approve'}
                                    </button>
                                    <button 
                                      onClick={() => handleStatusChange(record.id, 'Rejected')}
                                      className="p-1 text-danger hover:bg-danger/10 rounded-lg transition-colors"
                                      title="Reject"
                                    >
                                      <ShieldAlert size={16} />
                                    </button>
                                  </>
                                )}
                                {(record.status === 'Approved' || record.status === 'Final Confirmed') && (
                                  <div className="flex items-center gap-1">
                                    <span className="text-[10px] text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1 bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded">
                                      <Check size={12} />
                                      {record.leaveType === 'SBL' || record.leaveType === 'PWO' ? 'SBL Credited' : 'Approved'}
                                    </span>
                                    {canApproveLeave && record.status === 'Approved' && (
                                      <Button 
                                        size="sm"
                                        variant="outline"
                                        onClick={() => handleStatusChange(record.id, 'Final Confirmed')}
                                        className="h-6 text-[9px] uppercase px-2"
                                      >
                                        Confirm
                                      </Button>
                                    )}
                                  </div>
                                )}
                                {isSuperAdmin && record.status !== 'Pending' && (
                                  <>
                                    {record.status !== 'Approved' && record.status !== 'Final Confirmed' && (
                                      <button
                                        onClick={() => handleStatusChange(record.id, 'Approved')}
                                        className="px-2 py-1 text-[10px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-md transition-all"
                                        title="Super Admin Override → Approve"
                                      >
                                        Override Approve
                                      </button>
                                    )}
                                    {record.status !== 'Rejected' && (
                                      <button
                                        onClick={() => handleStatusChange(record.id, 'Rejected')}
                                        className="px-2 py-1 text-[10px] font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-md transition-all"
                                        title="Super Admin Override → Reject"
                                      >
                                        Override Reject
                                      </button>
                                    )}
                                  </>
                                )}
                                {canApproveLeave && (
                                  <button 
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      const emp = empMap.get(record.employeeId);
                                      setDeleteConfirmModal({
                                        isOpen: true,
                                        isBulk: false,
                                        recordId: record.id,
                                        recordName: `${emp?.name || record.employeeId} (${record.date})`
                                      });
                                    }}
                                    className="p-1 text-slate-400 hover:text-danger hover:bg-danger/10 rounded-lg transition-colors ml-1"
                                    title="Delete Record"
                                  >
                                    <Trash2 size={16} />
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}

                  {paginatedRecords.length === 0 && (
                    <tr>
                      <td colSpan={isEmployeeOnly ? 7 : 8} className="px-4 py-8 text-center text-slate-400 text-xs">
                        No records found for the selected view.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
                <div className="flex items-center gap-2 text-slate-500">
                  <span>Rows per page:</span>
                  <select 
                    value={pageSize}
                    onChange={(e) => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
                    className="px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-md text-xs"
                  >
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                    <option value={100}>100</option>
                    <option value={0}>All</option>
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <Button 
                    size="sm" 
                    variant="outline" 
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    className="h-7 text-xs px-2.5"
                  >
                    Previous
                  </Button>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Page {currentPage} of {totalPages}
                  </span>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    disabled={currentPage >= totalPages}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    className="h-7 text-xs px-2.5"
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-[11px] font-bold text-slate-900 dark:text-white uppercase tracking-widest">Workflow Breakdown</h3>
              <Button 
                size="sm"
                variant="outline"
                onClick={() => setIsBalanceModalOpen(true)}
                className="h-7 text-[10px] font-bold uppercase gap-1"
              >
                <Wallet size={12} />
                Balances
              </Button>
            </div>

            <div className="space-y-6">
              <DistributionItem label="1. Initial PWO Pending" count={stats.pending} total={stats.total} color="bg-amber-500" />
              <DistributionItem label="2. Approved SBL Section" count={stats.approved} total={stats.total} color="bg-emerald-600" />
              <DistributionItem label="3. Rejected Entries" count={stats.rejected} total={stats.total} color="bg-danger" />
            </div>
             
            <div className="mt-8 p-4 bg-indigo-50/50 dark:bg-indigo-950/20 rounded-xl border border-indigo-100 dark:border-indigo-900/40">
              <div className="flex gap-3">
                 <Info size={18} className="text-indigo-600 shrink-0 mt-0.5" />
                 <div className="space-y-1">
                   <p className="text-[11px] text-slate-700 dark:text-slate-300 font-bold">
                     PWO → SBL Conversion Rule
                   </p>
                   <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                     PWO is the initial offday work record. When HR clicks <strong>Approve to SBL</strong>, the entry's type automatically converts to <strong>SBL (Substitute Leave)</strong> and is credited to the employee's permanent SBL balance.
                   </p>
                 </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      {/* SBL Balance Registry Modal */}
      <AnimatePresence>
        {isBalanceModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsBalanceModalOpen(false)}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-3xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl overflow-hidden max-h-[85vh] flex flex-col"
            >
              <div className="bg-slate-900 p-6 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-indigo-600 rounded-lg">
                    <Wallet size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold">SBL Staff Balances</h3>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">Accumulated Substitute Leave Credits</p>
                  </div>
                </div>
                <button onClick={() => setIsBalanceModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>

              <div className="p-6 overflow-y-auto space-y-4">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                        <th className="p-3">Employee</th>
                        <th className="p-3">Department</th>
                        <th className="p-3 text-center">Approved SBL</th>
                        <th className="p-3 text-center">Pending PWO</th>
                        <th className="p-3 text-right">Credit Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {employeeSblBalances.map(({ employee, totalApprovedDays, pwoCount, sblCount, pendingCount }) => (
                        <tr key={employee.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                          <td className="p-3">
                            <div>
                              <p className="font-bold text-slate-900 dark:text-white">{employee.name}</p>
                              <p className="text-[10px] text-slate-400">{employee.id} {employee.otEligible === false ? '• [Non-OT]' : ''}</p>
                            </div>
                          </td>
                          <td className="p-3 text-slate-600 dark:text-slate-400 font-medium">
                            {employee.department || '-'}
                          </td>
                          <td className="p-3 text-center font-bold text-emerald-600 dark:text-emerald-400">
                            {sblCount + pwoCount}
                          </td>
                          <td className="p-3 text-center font-bold text-amber-600 dark:text-amber-400">
                            {pendingCount}
                          </td>
                          <td className="p-3 text-right">
                            <span className={cn(
                              "inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold",
                              totalApprovedDays > 0 ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800"
                            )}>
                              {totalApprovedDays.toFixed(1)} Days
                            </span>
                          </td>
                        </tr>
                      ))}

                      {employeeSblBalances.length === 0 && (
                        <tr>
                          <td colSpan={5} className="p-8 text-center text-slate-400 text-xs">
                            No SBL balances recorded yet. Run PWO Sync or add manual SBL entries.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

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
              <div className="bg-slate-900 p-6 text-white flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-bold">{isEmployeeOnly ? 'Apply Leave / Substitute Leave' : 'New Leave / SBL Entry'}</h3>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                    {isEmployeeOnly ? 'Self-Service Request (Pending Approval)' : 'Leave, Substitute Leave (SBL) & PWO Credit'}
                  </p>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleAddSBL} className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2 col-span-2 sm:col-span-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Employee</label>
                    <select 
                      required
                      disabled={isEmployeeOnly}
                      value={isEmployeeOnly ? linkedEmployeeId : formData.employeeId}
                      onChange={e => setFormData({ ...formData, employeeId: e.target.value })}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-75"
                    >
                      {!isEmployeeOnly && <option value="">Staff Select...</option>}
                      {employees
                        .filter(emp => !isEmployeeOnly || emp.id === linkedEmployeeId)
                        .map(emp => (
                          <option key={emp.id} value={emp.id}>
                            {emp.name} ({emp.id}) {emp.otEligible === false ? '- [Non-OT]' : ''}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div className="space-y-2 col-span-2 sm:col-span-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Leave / Credit Date</label>
                    <Input 
                      type="date"
                      required
                      value={formData.date}
                      onChange={e => setFormData({ ...formData, date: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2 col-span-2 sm:col-span-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Leave Type</label>
                    <select 
                      value={formData.leaveType}
                      onChange={e => setFormData({ ...formData, leaveType: e.target.value as any })}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="Casual Leave">Casual Leave</option>
                      <option value="Sick Leave">Sick Leave</option>
                      <option value="Annual Leave">Annual Leave</option>
                      <option value="Unpaid Leave">Unpaid Leave</option>
                      <option value="SBL">SBL (Substitute Leave)</option>
                      <option value="PWO">PWO (Present Worked Offday)</option>
                      <option value="Comp Leave">Compensatory Leave</option>
                      <option value="Short Break">Short Break</option>
                    </select>
                  </div>

                  <div className="space-y-2 col-span-2 sm:col-span-1">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Duration</label>
                    <select 
                      value={formData.duration}
                      onChange={e => setFormData({ ...formData, duration: e.target.value })}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="Full Day">Full Day</option>
                      <option value="Half Day">Half Day</option>
                      <option value="Half Day (First)">Half Day (First)</option>
                      <option value="Half Day (Second)">Half Day (Second)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Official Reason / Remarks</label>
                  <textarea 
                    required
                    value={formData.reason}
                    onChange={e => setFormData({ ...formData, reason: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[80px] dark:text-white"
                    placeholder={isEmployeeOnly ? "State reason for Leave or Substitute Leave request..." : "E.g. Casual Leave / Worked on Public Holiday (SBL Credit)..."}
                  />
                </div>

                <Button type="submit" className="w-full h-12 uppercase tracking-widest text-[11px] font-bold">
                  <Save size={18} className="mr-2" />
                  {isEmployeeOnly ? 'Submit Leave / SBL Request' : 'Register Leave / SBL Entry'}
                </Button>
              </form>
            </motion.div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {deleteConfirmModal.isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setDeleteConfirmModal({ isOpen: false })}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              className="relative w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden z-10 p-6 text-center space-y-4"
            >
              <div className="w-12 h-12 rounded-full bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
                <Trash2 size={24} />
              </div>

              <div className="space-y-1">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                  {deleteConfirmModal.isBulk 
                    ? `Delete ${selectedIds.length} Selected Record(s)?` 
                    : 'Confirm Record Deletion'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  {deleteConfirmModal.isBulk 
                    ? `Are you sure you want to permanently delete these ${selectedIds.length} selected SBL/PWO entries? This action cannot be undone.`
                    : `Are you sure you want to delete the record for "${deleteConfirmModal.recordName || 'selected entry'}"? This record will be permanently removed.`
                  }
                </p>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setDeleteConfirmModal({ isOpen: false })}
                  className="flex-1 h-10 text-xs font-bold"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  onClick={async () => {
                    const isBulk = deleteConfirmModal.isBulk;
                    const recId = deleteConfirmModal.recordId;
                    setDeleteConfirmModal({ isOpen: false });
                    if (isBulk) {
                      await handleBulkDelete();
                    } else if (recId) {
                      await handleDeleteSBL(recId);
                    }
                  }}
                  className="flex-1 h-10 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white"
                >
                  Confirm Delete
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

function DistributionItem({ label, count, total, color }: any) {
  const percentage = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="space-y-2">
       <div className="flex justify-between text-[11px] font-bold uppercase tracking-widest">
          <span className="text-slate-500">{label}</span>
          <span className="text-slate-900 dark:text-white">{count} ({Math.round(percentage)}%)</span>
       </div>
       <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
          <motion.div 
            initial={{ width: 0 }}
            animate={{ width: `${percentage}%` }}
            className={cn("h-full", color)}
          />
       </div>
    </div>
  );
}
