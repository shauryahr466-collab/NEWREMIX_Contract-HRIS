import React, { useMemo, useState } from 'react';
import { useAppStore } from '../store';
import { format, parseISO, isWithinInterval } from 'date-fns';
import { 
  Clock, Search, Download, 
  RefreshCw, Plus, Save, Trash2,
  Calendar, ChevronLeft, ChevronRight, X,
  FileSpreadsheet, Upload, Calculator, CheckCircle2, CheckSquare, Square, Info, ShieldCheck, DollarSign
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { OTAuditLog } from '../components/OTAuditLog';
import { SupervisorOTImportModal, generateSupervisorOTTemplate } from '../components/SupervisorOTImportModal';
import { OvertimeRecord, Employee, ProcessedAttendance, ShiftMaster, RawPunch } from '../types';
import { PageHeader, Card, Button, Input, KPICard, Badge } from '../components/ui';
import { cn, normalizeEmployeeId, formatPunchTime, getAttendanceInAndOut, toDeviceWallClockIso } from '../lib/utils';

export default function Overtime() {
  const { 
    overtimeRecords, employees, processedData, settings, punches, setSettings,
    updateOvertime, addOvertime, deleteOvertime, setOvertimeBatch, deleteOvertimeBatch, user, openEmployeeProfile, globalSearchTerm,
    effectiveUserProfile
  } = useAppStore();
  const canApproveOt = !effectiveUserProfile || effectiveUserProfile.role === 'Super Admin' || Boolean(effectiveUserProfile.permissions?.canApproveOt);
  const canSubmitOt = !effectiveUserProfile || effectiveUserProfile.role === 'Super Admin' || Boolean(effectiveUserProfile.permissions?.canSubmitSupervisorOt);
  
  const [searchTerm, setSearchTerm] = useState('');
  const activeSearch = searchTerm || globalSearchTerm;
  const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'Approved' | 'Rejected'>('All');
  const [designationFilter, setDesignationFilter] = useState<string>('All');
  const [contractorFilter, setContractorFilter] = useState<string>('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<OvertimeRecord | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [dateRange, setDateRange] = useState({
    start: format(new Date(), 'yyyy-MM-01'),
    end: format(new Date(), 'yyyy-MM-dd')
  });

  const [formData, setFormData] = useState({
    employeeId: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    supervisorOtHours: 0,
    otStartTime: '',
    otEndTime: '',
    type: 'Regular' as 'Regular' | 'Holiday' | 'Weekly Off',
    remarks: ''
  });

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // O(1) Employee Map for instant lookups
  const empMap = useMemo(() => new Map<string, Employee>(employees.map(e => [e.id, e])), [employees]);

  // Memoize designation and contractor options
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
      await deleteOvertimeBatch(selectedIds);
      setSelectedIds([]);
      setIsDeleteModalOpen(false);
      toast.success(`Successfully deleted ${count} record(s)`, { id: tId });
    } catch (e) {
      toast.error('Bulk delete failed', { id: tId });
    }
  };

  // Ultra-fast filtered records using O(1) map and direct string comparison
  const filteredRecords = useMemo(() => {
    const activeLower = activeSearch ? activeSearch.toLowerCase() : '';
    const startDate = dateRange.start;
    const endDate = dateRange.end;

    return overtimeRecords.filter(record => {
      // Direct string date comparison (microsecond fast)
      if (record.date < startDate || record.date > endDate) return false;
      if (statusFilter !== 'All' && record.status !== statusFilter) return false;

      const emp = empMap.get(record.employeeId);
      if (designationFilter !== 'All' && emp?.designation !== designationFilter) return false;
      if (contractorFilter !== 'All' && emp?.contractorName !== contractorFilter) return false;

      if (activeLower) {
        const nameMatch = emp?.name?.toLowerCase().includes(activeLower);
        const idMatch = record.employeeId.toLowerCase().includes(activeLower);
        const desigMatch = emp?.designation?.toLowerCase().includes(activeLower);
        if (!nameMatch && !idMatch && !desigMatch) return false;
      }

      return true;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [overtimeRecords, empMap, activeSearch, statusFilter, dateRange, designationFilter, contractorFilter]);

  const otCalculationBasis: 'basic' | 'gross' = settings.payrollConfig?.overtimeCalculationBasis || 'basic';
  const otMultiplier = Number(settings.payrollConfig?.overtimeMultiplier || 1.5);

  const calculateOtDetails = (emp?: Employee, hours = 0, standardHours = 8, basisOverride?: 'basic' | 'gross') => {
    const effectiveBasis = basisOverride || otCalculationBasis;
    const monthlyBasic = Number(emp?.basicSalary || 0);
    const monthlyAllowances = Number(emp?.allowances || (Number(emp?.dearnessAllowance || 0) + Number(emp?.otherAllowance || 0)) || 0);
    const monthlyGross = Number(emp?.grossSalary && emp.grossSalary >= monthlyBasic ? emp.grossSalary : (monthlyBasic + monthlyAllowances));
    
    const wageBase = effectiveBasis === 'gross' ? monthlyGross : monthlyBasic;
    const dutyHours = Number(standardHours || emp?.targetWorkingHours || 8) || 8;
    const divisor = 26 * dutyHours;
    const hourlyRate = wageBase > 0 && divisor > 0 ? Number(((wageBase / divisor) * otMultiplier).toFixed(2)) : 0;
    const otAmount = Math.round(Number(hours || 0) * hourlyRate);

    return {
      basis: effectiveBasis,
      wageBase,
      hourlyRate,
      otAmount,
      otMultiplier
    };
  };

  const handleToggleOtBasis = async (newBasis: 'basic' | 'gross') => {
    const currentConfig = settings.payrollConfig || {
      fiscalYear: 'FY 2083/84',
      effectiveBsYear: 2083,
      singleSlabs: [],
      marriedSlabs: [],
      ssfEmployeeRate: 0.11,
      ssfEmployerRate: 0.20,
      pfNonSsfRate: 0.10,
      healthInsuranceRate: 0,
      ssfSlab1SstWaiver: true,
      overtimeMultiplier: 1.5,
      overtimeCalculationBasis: 'basic'
    };
    const updated = {
      ...currentConfig,
      overtimeCalculationBasis: newBasis
    };
    await setSettings({
      ...settings,
      payrollConfig: updated as any
    });
    toast.success(`OT Calculation Basis switched to ${newBasis === 'gross' ? 'Gross Salary' : 'Basic Salary'}. Approved OT will automatically reflect into Payroll.`);
  };

  // Single-pass stats calculation
  const stats = useMemo(() => {
    let pending = 0;
    let approved = 0;
    let totalHours = 0;
    let approvedHours = 0;
    let totalApprovedPayout = 0;

    for (let i = 0; i < overtimeRecords.length; i++) {
      const r = overtimeRecords[i];
      const h = Number(r.hours) || 0;
      totalHours += h;
      if (r.status === 'Pending') {
        pending++;
      } else if (r.status === 'Approved') {
        approved++;
        approvedHours += h;
        const emp = empMap.get(normalizeEmployeeId(r.employeeId)) || empMap.get(r.employeeId);
        const details = calculateOtDetails(emp, h, Number(r.standardDutyHours) || 8, r.otBasis);
        totalApprovedPayout += details.otAmount;
      }
    }
    return {
      total: overtimeRecords.length,
      pending,
      approved,
      totalHours,
      approvedHours,
      totalApprovedPayout
    };
  }, [overtimeRecords, empMap, otCalculationBasis, otMultiplier]);

  const handleSyncAttendance = async () => {
    if (isSyncing) return;
    setIsSyncing(true);
    const tId = toast.loading('Syncing OT audit log & attendance data...');
    
    // Non-blocking UI tick
    await new Promise(r => setTimeout(r, 40));

    try {
      let added = 0;
      let updated = 0;

      const otMap = new Map<string, OvertimeRecord>();
      overtimeRecords.forEach(r => {
        otMap.set(`${r.employeeId}_${r.date}`, r);
        otMap.set(`${normalizeEmployeeId(r.employeeId)}_${r.date}`, r);
      });
      const batchToUpsert: OvertimeRecord[] = [];
      const startDate = dateRange.start;
      const endDate = dateRange.end;

      for (let i = 0; i < processedData.length; i++) {
        const att = processedData[i];
        if (att.date < startDate || att.date > endDate) continue;

        const normId = normalizeEmployeeId(att.employeeId);
        const emp = empMap.get(normId) || empMap.get(att.employeeId);
        const standardDutyHours = Number(emp?.targetWorkingHours) || Number((att as any).expectedHours) || 8;
        const workingHours = Number(att.workingHours) || 0;
        const bioOtHours = Math.max(0, workingHours - standardDutyHours);
        
        if (bioOtHours <= 0 && att.status !== 'Present') continue;

        const punchInfo = getAttendanceInAndOut(att);
        const inTime = punchInfo.inTime !== '--:--' ? punchInfo.inTime : undefined;
        const outTime = punchInfo.outTime !== '--:--' ? punchInfo.outTime : undefined;

        const key = `${normId}_${att.date}`;
        const existing = otMap.get(key) || otMap.get(`${att.employeeId}_${att.date}`);
        
        if (existing) {
          const supOt = Number(existing.supervisorOtHours) || 0;
          const finalOtEligible = Math.min(bioOtHours, supOt);
          const hrSaving = Math.max(0, bioOtHours - finalOtEligible);
          
          if (
            existing.bioOtHours !== bioOtHours || 
            existing.standardDutyHours !== standardDutyHours ||
            existing.inTime !== inTime ||
            existing.outTime !== outTime
          ) {
            batchToUpsert.push({
              ...existing,
              inTime,
              outTime,
              bioOtHours: Number(bioOtHours.toFixed(2)),
              standardDutyHours: Number(standardDutyHours.toFixed(2)),
              hours: Number(finalOtEligible.toFixed(2)),
              hrSaving: Number(hrSaving.toFixed(2))
            });
            updated++;
          }
        } else {
          const id = `ot_${Math.random().toString(36).substr(2, 9)}`;
          const supervisorOtHours = 0; 
          const finalOtEligible = Math.min(bioOtHours, supervisorOtHours);
          const hrSaving = Math.max(0, bioOtHours - finalOtEligible);

          batchToUpsert.push({
            id,
            employeeId: att.employeeId,
            date: att.date,
            inTime,
            outTime,
            bioOtHours: Number(bioOtHours.toFixed(2)),
            supervisorOtHours,
            standardDutyHours: Number(standardDutyHours.toFixed(2)),
            hours: Number(finalOtEligible.toFixed(2)),
            hrSaving: Number(hrSaving.toFixed(2)),
            type: att.status === 'Weekly Off' ? 'Weekly Off' : 'Regular',
            status: 'Pending',
            remarks: '',
            shiftId: att.shiftId || null
          });
          added++;
        }
      }

      if (batchToUpsert.length > 0) {
        await setOvertimeBatch(batchToUpsert);
      }

      toast.success(`OT Audit Sync complete: ${added} added, ${updated} updated`, { id: tId });
    } catch (e) {
      console.error('OT Audit Log Sync Error:', e);
      toast.error('Sync failed', { id: tId });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleStatusChange = async (id: string, status: 'Approved' | 'Rejected') => {
    if (!canApproveOt) {
      toast.error('Your configured role does not have OT approval permission.');
      return;
    }
    try {
      const rec = overtimeRecords.find(r => r.id === id);
      const emp = rec ? (empMap.get(normalizeEmployeeId(rec.employeeId)) || empMap.get(rec.employeeId)) : undefined;
      const otDetails = rec ? calculateOtDetails(emp, Number(rec.hours) || 0, Number(rec.standardDutyHours) || 8, rec.otBasis) : null;

      await updateOvertime(id, { 
        status, 
        reviewedBy: effectiveUserProfile?.username || user?.username || 'Admin',
        reviewedDate: new Date().toISOString(),
        ...(status === 'Approved' && otDetails ? {
          otBasis: otDetails.basis,
          otRate: otDetails.hourlyRate,
          otAmount: otDetails.otAmount
        } : {})
      });
      toast.success(status === 'Approved' && otDetails
        ? `OT Approved: Rs. ${otDetails.otAmount.toLocaleString()} calculated pay (${otDetails.basis.toUpperCase()} basis, ${rec?.hours}h @ Rs.${otDetails.hourlyRate}/h) -> Linked to Payroll`
        : `OT ${status.toLowerCase()} successfully`
      );
    } catch (e) {
      toast.error('Operation failed');
    }
  };

  const handleBulkApprove = async () => {
    if (!canApproveOt) {
      toast.error('Your configured role does not have OT approval permission.');
      return;
    }
    if (selectedIds.length === 0) return;
    try {
      let totalAmount = 0;
      const updates = selectedIds.map(id => {
        const rec = overtimeRecords.find(r => r.id === id);
        const emp = rec ? (empMap.get(normalizeEmployeeId(rec.employeeId)) || empMap.get(rec.employeeId)) : undefined;
        const otDetails = rec ? calculateOtDetails(emp, Number(rec.hours) || 0, Number(rec.standardDutyHours) || 8, rec.otBasis) : null;
        if (otDetails) totalAmount += otDetails.otAmount;
        return {
          id,
          status: 'Approved' as const,
          reviewedBy: user?.username || 'Admin',
          reviewedDate: new Date().toISOString(),
          ...(otDetails ? {
            otBasis: otDetails.basis,
            otRate: otDetails.hourlyRate,
            otAmount: otDetails.otAmount
          } : {})
        };
      });

      for (const update of updates) {
        await updateOvertime(update.id, update);
      }

      toast.success(`Approved ${selectedIds.length} OT records (Total: Rs. ${totalAmount.toLocaleString()}) -> Linked to Payroll!`);
      setSelectedIds([]);
    } catch (e) {
      toast.error('Bulk approval failed');
    }
  };

  const handleSaveSupervisorOT = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmitOt && !canApproveOt) {
      toast.error('Your configured role is read-only for Overtime records.');
      return;
    }
    if (!selectedRecord) return;

    try {
      const bioOt = Number(selectedRecord.bioOtHours) || 0;
      const supOt = Number(formData.supervisorOtHours) || 0;
      const finalOt = Math.min(bioOt, supOt);
      const hrSaving = Math.max(0, bioOt - finalOt);
      const emp = empMap.get(normalizeEmployeeId(selectedRecord.employeeId)) || empMap.get(selectedRecord.employeeId);
      const otDetails = calculateOtDetails(emp, finalOt, Number(selectedRecord.standardDutyHours) || 8, selectedRecord.otBasis);

      await updateOvertime(selectedRecord.id, {
        supervisorOtHours: Number(supOt.toFixed(2)),
        hours: Number(finalOt.toFixed(2)),
        hrSaving: Number(hrSaving.toFixed(2)),
        otStartTime: formData.otStartTime,
        otEndTime: formData.otEndTime,
        remarks: formData.remarks,
        type: formData.type,
        otBasis: otDetails.basis,
        otRate: otDetails.hourlyRate,
        otAmount: otDetails.otAmount
      });

      toast.success('Supervisor OT saved successfully');
      setIsEditModalOpen(false);
    } catch (e) {
      toast.error('Failed to save record');
    }
  };

  const handleManualAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.employeeId || !formData.date) return;

    try {
      const bioOt = 0; 
      const supOt = Number(formData.supervisorOtHours) || 0;
      const finalOt = supOt;
      const hrSaving = 0;
      const emp = empMap.get(normalizeEmployeeId(formData.employeeId)) || empMap.get(formData.employeeId);
      const otDetails = calculateOtDetails(emp, finalOt, 8);

      await addOvertime({
        employeeId: formData.employeeId,
        date: formData.date,
        type: formData.type,
        remarks: formData.remarks,
        otStartTime: formData.otStartTime,
        otEndTime: formData.otEndTime,
        bioOtHours: bioOt,
        supervisorOtHours: supOt,
        standardDutyHours: 8, 
        hours: finalOt,
        hrSaving: hrSaving,
        status: 'Pending',
        shiftId: null,
        otBasis: otDetails.basis,
        otRate: otDetails.hourlyRate,
        otAmount: otDetails.otAmount
      });
      toast.success('OT record added successfully');
      setIsModalOpen(false);
    } catch (e) {
      toast.error('Failed to add record');
    }
  };

  const handleExportCSV = () => {
    try {
      const attMap = new Map<string, ProcessedAttendance>();
      processedData.forEach(p => {
        attMap.set(`${p.employeeId}_${p.date}`, p);
        attMap.set(`${normalizeEmployeeId(p.employeeId)}_${p.date}`, p);
      });
      const shiftMap = new Map<string, ShiftMaster>((settings.shifts || []).map(s => [s.id, s]));

      // Build punches lookup for CSV export audit cross-check
      const punchesMap = new Map<string, string[]>();
      (punches || []).forEach(p => {
        const cleanIso = toDeviceWallClockIso(p.punchDatetime);
        if (!cleanIso) return;
        const dateStr = cleanIso.includes('T') ? cleanIso.split('T')[0] : cleanIso.split(' ')[0];
        const normId = normalizeEmployeeId(p.employeeId);
        const key = `${normId}_${dateStr}`;
        const list = punchesMap.get(key) || [];
        list.push(formatPunchTime(cleanIso));
        punchesMap.set(key, list);
      });

      const data = filteredRecords.map(record => {
        const normId = normalizeEmployeeId(record.employeeId);
        const emp = empMap.get(normId) || empMap.get(record.employeeId);
        const att = attMap.get(`${normId}_${record.date}`) || attMap.get(`${record.employeeId}_${record.date}`);
        const shift = record.shiftId ? shiftMap.get(record.shiftId) : (att?.shiftId ? shiftMap.get(att.shiftId) : (emp?.shiftId ? shiftMap.get(emp.shiftId) : undefined));

        const punchInfo = getAttendanceInAndOut(att);
        const rawTimes = punchesMap.get(`${normId}_${record.date}`) || [];

        let inTime = record.inTime || punchInfo.inTime;
        let outTime = record.outTime || punchInfo.outTime;
        if (inTime === '--:--' && rawTimes.length > 0) inTime = rawTimes[0];
        if (outTime === '--:--' && rawTimes.length > 1) outTime = rawTimes[rawTimes.length - 1];

        // Audit verdict
        const bioOt = Number(record.bioOtHours || 0);
        const supOt = Number(record.supervisorOtHours || 0);
        let auditVerdict = 'PASS';
        if (punchInfo.isSinglePunch || (rawTimes.length === 1 && !att?.outTime)) {
          auditVerdict = 'SINGLE PUNCH (EXCEPTION)';
        } else if (supOt > bioOt) {
          auditVerdict = `OVER-CLAIM (+${(supOt - bioOt).toFixed(2)}h)`;
        } else if (bioOt > supOt && bioOt > 0) {
          auditVerdict = `HR SAVINGS (${record.hrSaving}h)`;
        }

        return {
          'Employee ID': record.employeeId,
          'Employee Name': emp?.name || 'Unknown',
          'Department': emp?.department || '-',
          'Date': record.date,
          'Shift': shift?.name || 'Day Shift',
          'Shift Window': shift ? `${shift.startTime} - ${shift.endTime}` : '-',
          'Standard Duty Hours': record.standardDutyHours || 8,
          'In Time': inTime,
          'Out Time': (punchInfo.isSinglePunch || (rawTimes.length === 1 && !att?.outTime)) && !punchInfo.hasOut ? '--:-- (Single Punch)' : outTime,
          'Raw Biometric Punches': rawTimes.join(', ') || '-',
          'Working Hours': att?.workingHours || 0,
          'Bio OT': record.bioOtHours,
          'Supervisor OT': record.supervisorOtHours,
          'Final OT Eligible': record.hours,
          'HR Saving': record.hrSaving,
          'Audit Cross-Check Verdict': auditVerdict,
          'OT Remarks': record.remarks || '',
          'Approval Status': record.status,
          'Reviewed By': record.reviewedBy || '-',
          'Reviewed Date': record.reviewedDate ? record.reviewedDate.substring(0, 10) : '-'
        };
      });

      const ws = XLSX.utils.json_to_sheet(data);
      const csvContent = XLSX.utils.sheet_to_csv(ws);
      
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `OT_Audit_Log_${dateRange.start}_to_${dateRange.end}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      toast.success('OT Audit Log exported as CSV');
    } catch (error) {
      toast.error('Failed to export CSV');
    }
  };

  const openEditModal = (record: OvertimeRecord) => {
    setSelectedRecord(record);
    setFormData({
      employeeId: record.employeeId,
      date: record.date,
      supervisorOtHours: record.supervisorOtHours,
      otStartTime: record.otStartTime || '',
      otEndTime: record.otEndTime || '',
      type: record.type,
      remarks: record.remarks
    });
    setIsEditModalOpen(true);
  };

  const handleDeleteRecord = async (id: string) => {
    try {
      await deleteOvertime(id);
      toast.success('Record deleted successfully');
    } catch (e) {
      toast.error('Failed to delete record');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="OT Audit Log" 
        description="Biometric vs Supervisor Verification"
        icon={Clock}
        actions={
          <div className="flex flex-wrap gap-2">
            <div className="flex flex-wrap items-center gap-2 relative z-30">
              <Input 
                type="date" 
                value={dateRange.start} 
                onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                className="w-[140px] h-9 text-[11px] pl-9 px-2"
              />
              <span className="text-slate-400 text-xs font-bold px-1">to</span>
              <Input 
                type="date" 
                value={dateRange.end} 
                onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                className="w-[140px] h-9 text-[11px] pl-9 px-2"
              />
            </div>
            <Button variant="outline" onClick={handleSyncAttendance} disabled={isSyncing} className="gap-2">
              <RefreshCw size={16} className={cn(isSyncing && "animate-spin")} />
              {isSyncing ? 'Syncing...' : 'Sync'}
            </Button>
            {canSubmitOt && (
              <>
                <Button onClick={() => setIsModalOpen(true)} className="gap-2">
                  <Plus size={16} />
                  Manual Entry
                </Button>
                <Button 
                  variant="outline" 
                  onClick={() => generateSupervisorOTTemplate(employees)} 
                  className="gap-2 border-emerald-300 dark:border-emerald-800 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
                  title="Download official Excel template with instructions and sample rows"
                >
                  <FileSpreadsheet size={16} />
                  Export Template
                </Button>
                <Button 
                  onClick={() => setIsImportModalOpen(true)} 
                  className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm"
                  title="Import Supervisor OT and Remarks from Excel"
                >
                  <Upload size={16} />
                  Import Supervisor OT & Remarks
                </Button>
              </>
            )}
            <Button variant="outline" onClick={handleExportCSV} className="gap-2">
              <Download size={16} />
              Export
            </Button>
            {selectedIds.length > 0 && canApproveOt && (
              <>
                <Button 
                  type="button" 
                  onClick={handleBulkApprove} 
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold shadow-xs"
                >
                  <CheckCircle2 size={16} />
                  Approve Selected ({selectedIds.length})
                </Button>
                <Button type="button" variant="danger" onClick={() => setIsDeleteModalOpen(true)} className="gap-2">
                  <Trash2 size={16} />
                  Delete Selected ({selectedIds.length})
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <KPICard 
          label="Total Records" 
          value={stats.total} 
          icon={Clock} 
          onClick={() => setStatusFilter('All')}
        />
        <KPICard 
          label="Pending Review" 
          value={stats.pending} 
          icon={Clock} 
          trend="down"
          trendValue="Awaiting Action"
          onClick={() => setStatusFilter('Pending')}
        />
        <KPICard 
          label="Approved Records" 
          value={stats.approved} 
          icon={CheckCircle2} 
          trend="up"
          trendValue={`${Math.round(stats.approvedHours)}h Approved`}
          onClick={() => setStatusFilter('Approved')}
        />
        <KPICard 
          label="Eligible Hours" 
          value={`${Math.round(stats.totalHours)}h`} 
          icon={Clock} 
          trend="up"
          trendValue="Total Cumulative"
        />
        <KPICard 
          label="Approved OT Payout" 
          value={`Rs. ${stats.totalApprovedPayout.toLocaleString()}`} 
          icon={DollarSign} 
          trend="up"
          trendValue={`${otCalculationBasis === 'gross' ? 'Gross' : 'Basic'} Salary Basis`}
        />
      </div>

      {/* Interactive OT Calculation Wage Basis Switcher (Basic Salary vs Gross Salary) */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400">
                <Calculator size={18} />
              </span>
              <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
                OT Calculation Wage Basis & Formula
              </h3>
              <Badge variant={otCalculationBasis === 'gross' ? 'info' : 'success'}>
                Active: {otCalculationBasis === 'gross' ? 'Gross Salary (Basic + Allowances)' : 'Basic Salary'}
              </Badge>
              <span className="text-[11px] font-mono text-slate-400">
                • Rate Multiplier: {otMultiplier}x
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 max-w-2xl">
              Choose calculation wage base for overtime hours. Hourly Rate = (Wage Basis ÷ (26 Days × Standard Duty Hours)) × {otMultiplier}x.
              Approved OT automatically links directly into Monthly Payroll calculations.
            </p>
          </div>

          {/* Interactive Checkmark / Option Buttons for Gross vs Basic */}
          <div className="flex items-center gap-2 bg-slate-100 dark:bg-slate-800/90 p-1.5 rounded-xl border border-slate-200/80 dark:border-slate-700 shrink-0">
            <button
              type="button"
              onClick={() => handleToggleOtBasis('basic')}
              className={cn(
                "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                otCalculationBasis === 'basic'
                  ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs border border-slate-200 dark:border-slate-700"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              )}
            >
              <div className={cn(
                "w-4 h-4 rounded flex items-center justify-center border transition-all",
                otCalculationBasis === 'basic' 
                  ? "bg-indigo-600 border-indigo-600 text-white" 
                  : "border-slate-400 bg-white dark:bg-slate-800"
              )}>
                {otCalculationBasis === 'basic' && <CheckCircle2 size={12} className="stroke-[3]" />}
              </div>
              <span>Basic Salary Basis (Default)</span>
            </button>

            <button
              type="button"
              onClick={() => handleToggleOtBasis('gross')}
              className={cn(
                "flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer",
                otCalculationBasis === 'gross'
                  ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-xs border border-slate-200 dark:border-slate-700"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              )}
            >
              <div className={cn(
                "w-4 h-4 rounded flex items-center justify-center border transition-all",
                otCalculationBasis === 'gross' 
                  ? "bg-indigo-600 border-indigo-600 text-white" 
                  : "border-slate-400 bg-white dark:bg-slate-800"
              )}>
                {otCalculationBasis === 'gross' && <CheckCircle2 size={12} className="stroke-[3]" />}
              </div>
              <span>Gross Salary Basis</span>
            </button>
          </div>
        </div>
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <Input 
              placeholder="Search employee or ID..."
              className="pl-10"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          
          <div className="flex items-center gap-2">
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

            <select 
              value={designationFilter}
              onChange={(e) => setDesignationFilter(e.target.value)}
              className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="All">All Designations</option>
              {designations.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>

            <select 
              value={contractorFilter}
              onChange={(e) => setContractorFilter(e.target.value)}
              className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="All">All Contractors</option>
              {contractors.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>

        <OTAuditLog 
          records={filteredRecords}
          employees={employees}
          attendanceData={processedData}
          shifts={settings.shifts || []}
          punches={punches || []}
          otBasis={otCalculationBasis}
          otMultiplier={otMultiplier}
          onEdit={openEditModal}
          onApprove={(id) => handleStatusChange(id, 'Approved')}
          onReject={(id) => handleStatusChange(id, 'Rejected')}
          onDelete={handleDeleteRecord}
          onOpenProfile={openEmployeeProfile}
          selectedIds={selectedIds}
          onSelect={handleSelect}
          onSelectAll={setSelectedIds}
        />
      </Card>
      
      <AnimatePresence>
        {isEditModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsEditModalOpen(false)}
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
                  <h3 className="text-xl font-bold">Supervisor OT Verification</h3>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                    {employees.find(e => e.id === selectedRecord?.employeeId)?.name} ({selectedRecord?.employeeId})
                  </p>
                </div>
                <button onClick={() => setIsEditModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleSaveSupervisorOT} className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-4 p-4 bg-primary/5 rounded-xl border border-primary/10">
                  <div className="text-center">
                    <p className="text-[10px] font-bold text-primary uppercase">Biometric OT</p>
                    <p className="text-2xl font-bold text-primary">{selectedRecord?.bioOtHours}h</p>
                  </div>
                  <div className="text-center border-l border-primary/10">
                    <p className="text-[10px] font-bold text-primary uppercase">Duty Status</p>
                    <p className="text-sm font-bold text-slate-900 dark:text-white mt-1 uppercase">
                      {processedData.find(p => p.employeeId === selectedRecord?.employeeId && p.date === selectedRecord?.date)?.status || 'Present'}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Supervisor OT Hours</label>
                    <Input 
                      type="number"
                      step="0.1"
                      required
                      value={formData.supervisorOtHours}
                      onChange={e => setFormData({ ...formData, supervisorOtHours: parseFloat(e.target.value) })}
                      className="font-bold"
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">OT Category</label>
                    <select 
                      value={formData.type}
                      onChange={e => setFormData({ ...formData, type: e.target.value as any })}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="Regular">Regular</option>
                      <option value="Holiday">Holiday</option>
                      <option value="Weekly Off">Weekly Off</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Start Time</label>
                    <Input 
                      type="time"
                      value={formData.otStartTime}
                      onChange={e => setFormData({ ...formData, otStartTime: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">End Time</label>
                    <Input 
                      type="time"
                      value={formData.otEndTime}
                      onChange={e => setFormData({ ...formData, otEndTime: e.target.value })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Process Remarks</label>
                  <textarea 
                    value={formData.remarks}
                    onChange={e => setFormData({ ...formData, remarks: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[100px] dark:text-white"
                    placeholder="Provide justification..."
                  />
                </div>

                <Button type="submit" className="w-full h-12 uppercase tracking-widest text-[11px] font-bold">
                  <Save size={18} className="mr-2" />
                  Save Supervisor OT
                </Button>
              </form>
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
                  <h3 className="text-xl font-bold">Add Manual OT</h3>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">Special Exception Entry</p>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleManualAdd} className="p-8 space-y-6">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Staff Member</label>
                  <select 
                    required
                    value={formData.employeeId}
                    onChange={e => setFormData({ ...formData, employeeId: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  >
                    <option value="">Choose Staff...</option>
                    {employees.map(emp => (
                      <option key={emp.id} value={emp.id}>{emp.name} ({emp.id})</option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Work Date</label>
                    <Input 
                      type="date"
                      required
                      value={formData.date}
                      onChange={e => setFormData({ ...formData, date: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">OT Hours</label>
                    <Input 
                      type="number"
                      step="0.5"
                      required
                      value={formData.supervisorOtHours}
                      onChange={e => setFormData({ ...formData, supervisorOtHours: parseFloat(e.target.value) })}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Remarks</label>
                  <textarea 
                    value={formData.remarks}
                    onChange={e => setFormData({ ...formData, remarks: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[100px] dark:text-white"
                    placeholder="Reason for manual entry..."
                  />
                </div>

                <Button type="submit" className="w-full h-12 uppercase tracking-widest text-[11px] font-bold">
                  <Save size={18} className="mr-2" />
                  Save Manual OT
                </Button>
              </form>
            </motion.div>
          </div>
        )}

        {/* Delete Confirmation Modal */}
        {isDeleteModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsDeleteModalOpen(false)}
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
                  Delete {selectedIds.length} Selected Record(s)?
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  Are you sure you want to permanently delete these {selectedIds.length} selected overtime records? This action cannot be undone.
                </p>
              </div>

              <div className="flex items-center gap-3 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsDeleteModalOpen(false)}
                  className="flex-1 h-10 text-xs font-bold"
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  variant="danger"
                  onClick={handleBulkDelete}
                  className="flex-1 h-10 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white"
                >
                  Confirm Delete
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Supervisor OT & Remarks Import Modal */}
      <SupervisorOTImportModal 
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        overtimeRecords={overtimeRecords}
        employees={employees}
        processedData={processedData}
        shifts={settings.shifts || []}
        setOvertimeBatch={setOvertimeBatch}
        currentUser={user}
      />
    </div>
  );
}

function StatCard({ label, value, icon, color, onClick }: any) {
  const colors: any = {
    indigo: 'bg-indigo-50/50 text-indigo-600 border-indigo-100/50 hover:bg-indigo-100/50',
    amber: 'bg-amber-50/50 text-amber-600 border-amber-100/50 hover:bg-amber-100/50',
    emerald: 'bg-emerald-50/50 text-emerald-600 border-emerald-100/50 hover:bg-emerald-100/50',
    sky: 'bg-sky-50/50 text-sky-600 border-sky-100/50 hover:bg-sky-100/50',
  };
  return (
    <div 
      onClick={onClick}
      className={`p-6 rounded-[2rem] border shadow-sm ${colors[color]} backdrop-blur-sm transition-all ${onClick ? 'cursor-pointer active:scale-95' : ''}`}
    >
       <div className="flex items-center justify-between mb-4">
          <div className="w-12 h-12 bg-white dark:bg-slate-800 rounded-2xl flex items-center justify-center shadow-sm border border-white/50 dark:border-slate-700">{icon}</div>
          <span className="text-3xl font-black tracking-tight">{value}</span>
       </div>
       <p className="text-[10px] font-black uppercase tracking-[0.2em] opacity-50 ml-1">{label}</p>
    </div>
  );
}
