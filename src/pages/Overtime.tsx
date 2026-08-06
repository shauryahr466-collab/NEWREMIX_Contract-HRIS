import React, { useMemo, useState } from 'react';
import { useAppStore } from '../store';
import { format, parseISO, isWithinInterval } from 'date-fns';
import { 
  Clock, Search, Download, 
  RefreshCw, Plus, Save, Trash2,
  Calendar, ChevronLeft, ChevronRight, X
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { OTAuditLog } from '../components/OTAuditLog';
import { OvertimeRecord } from '../types';
import { PageHeader, Card, Button, Input, KPICard, Badge } from '../components/ui';
import { cn } from '../lib/utils';

export default function Overtime() {
  const { 
    overtimeRecords, employees, processedData, settings,
    updateOvertime, addOvertime, deleteOvertime, user, openEmployeeProfile, globalSearchTerm 
  } = useAppStore();
  
  const [searchTerm, setSearchTerm] = useState('');
  const activeSearch = searchTerm || globalSearchTerm;
  const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'Approved' | 'Rejected'>('All');
  const [designationFilter, setDesignationFilter] = useState<string>('All');
  const [contractorFilter, setContractorFilter] = useState<string>('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState<OvertimeRecord | null>(null);
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

  const handleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.length} selected records?`)) return;

    const tId = toast.loading('Deleting records...');
    try {
      for (const id of selectedIds) {
        await deleteOvertime(id);
      }
      setSelectedIds([]);
      toast.success(`Successfully deleted ${selectedIds.length} records`, { id: tId });
    } catch (e) {
      toast.error('Bulk delete failed', { id: tId });
    }
  };

  const filteredRecords = useMemo(() => {
    return overtimeRecords.filter(record => {
      const emp = employees.find(e => e.id === record.employeeId);
      const matchesSearch = !activeSearch || 
        emp?.name.toLowerCase().includes(activeSearch.toLowerCase()) || 
        record.employeeId.toLowerCase().includes(activeSearch.toLowerCase()) ||
        emp?.designation?.toLowerCase().includes(activeSearch.toLowerCase());
      const matchesStatus = statusFilter === 'All' || record.status === statusFilter;
      const matchesDesignation = designationFilter === 'All' || emp?.designation === designationFilter;
      const matchesContractor = contractorFilter === 'All' || emp?.contractorName === contractorFilter;
      const matchesDate = isWithinInterval(parseISO(record.date), {
        start: parseISO(dateRange.start),
        end: parseISO(dateRange.end)
      });
      return matchesSearch && matchesStatus && matchesDate && matchesDesignation && matchesContractor;
    }).sort((a, b) => a.date.localeCompare(b.date));
  }, [overtimeRecords, employees, activeSearch, statusFilter, dateRange, designationFilter, contractorFilter]);

  const stats = useMemo(() => ({
    total: overtimeRecords.length,
    pending: overtimeRecords.filter(r => r.status === 'Pending').length,
    approved: overtimeRecords.filter(r => r.status === 'Approved').length,
    totalHours: overtimeRecords.reduce((acc, curr) => acc + (Number(curr.hours) || 0), 0)
  }), [overtimeRecords]);

  const handleSyncAttendance = async () => {
    toast.loading('Syncing attendance data...', { id: 'sync' });
    try {
      let added = 0;
      let updated = 0;

      for (const att of processedData) {
        if (!isWithinInterval(parseISO(att.date), {
          start: parseISO(dateRange.start),
          end: parseISO(dateRange.end)
        })) continue;

        const emp = employees.find(e => e.id === att.employeeId);
        const standardDutyHours = Number(emp?.targetWorkingHours) || Number(att.expectedHours) || 8;
        const workingHours = Number(att.workingHours) || 0;
        const bioOtHours = Math.max(0, workingHours - standardDutyHours);
        
        if (bioOtHours <= 0 && att.status !== 'Present') continue;

        const existing = overtimeRecords.find(r => r.employeeId === att.employeeId && r.date === att.date);
        
        if (existing) {
          if (existing.bioOtHours !== bioOtHours || existing.standardDutyHours !== standardDutyHours) {
            const supOt = Number(existing.supervisorOtHours) || 0;
            const finalOtEligible = Math.min(bioOtHours, supOt);
            const hrSaving = Math.max(0, bioOtHours - finalOtEligible);
            await updateOvertime(existing.id, {
              bioOtHours: Number(bioOtHours.toFixed(2)),
              standardDutyHours: Number(standardDutyHours.toFixed(2)),
              hours: Number(finalOtEligible.toFixed(2)),
              hrSaving: Number(hrSaving.toFixed(2))
            });
            updated++;
          }
        } else {
          const supervisorOtHours = 0; 
          const finalOtEligible = Math.min(bioOtHours, supervisorOtHours);
          const hrSaving = Math.max(0, bioOtHours - finalOtEligible);

          await addOvertime({
            employeeId: att.employeeId,
            date: att.date,
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
      toast.success(`Sync complete: ${added} added, ${updated} updated`, { id: 'sync' });
    } catch (e) {
      toast.error('Sync failed', { id: 'sync' });
    }
  };

  const handleStatusChange = async (id: string, status: 'Approved' | 'Rejected') => {
    try {
      await updateOvertime(id, { 
        status, 
        reviewedBy: user?.username || 'Admin',
        reviewedDate: new Date().toISOString()
      });
      toast.success(`OT ${status.toLowerCase()} successfully`);
    } catch (e) {
      toast.error('Operation failed');
    }
  };

  const handleSaveSupervisorOT = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRecord) return;

    try {
      const bioOt = Number(selectedRecord.bioOtHours) || 0;
      const supOt = Number(formData.supervisorOtHours) || 0;
      const finalOt = Math.min(bioOt, supOt);
      const hrSaving = Math.max(0, bioOt - finalOt);

      await updateOvertime(selectedRecord.id, {
        supervisorOtHours: Number(supOt.toFixed(2)),
        hours: Number(finalOt.toFixed(2)),
        hrSaving: Number(hrSaving.toFixed(2)),
        otStartTime: formData.otStartTime,
        otEndTime: formData.otEndTime,
        remarks: formData.remarks,
        type: formData.type
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
      const finalOt = Math.min(bioOt, supOt);
      const hrSaving = Math.max(0, bioOt - finalOt);

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
        shiftId: null 
      });
      toast.success('OT record added successfully');
      setIsModalOpen(false);
    } catch (e) {
      toast.error('Failed to add record');
    }
  };

  const handleExportCSV = () => {
    try {
      const data = filteredRecords.map(record => {
        const emp = employees.find(e => e.id === record.employeeId);
        const att = processedData.find(p => p.employeeId === record.employeeId && p.date === record.date);
        const shift = settings.shifts?.find(s => s.id === record.shiftId);

        return {
          'Employee ID': record.employeeId,
          'Employee Name': emp?.name || 'Unknown',
          'Department': emp?.department || '-',
          'Date': record.date,
          'Shift': shift?.name || '-',
          'Standard Duty Hours': record.standardDutyHours || 8,
          'In Time': att?.firstPunch ? format(parseISO(att.firstPunch), 'HH:mm') : '-',
          'Out Time': att?.lastPunch ? format(parseISO(att.lastPunch), 'HH:mm') : '-',
          'Working Hours': att?.workingHours || 0,
          'Bio OT': record.bioOtHours,
          'Supervisor OT': record.supervisorOtHours,
          'Final OT Eligible': record.hours,
          'HR Saving': record.hrSaving,
          'OT Remarks': record.remarks || '',
          'Approval Status': record.status,
          'Reviewed By': record.reviewedBy || '-',
          'Reviewed Date': record.reviewedDate ? format(parseISO(record.reviewedDate), 'dd MMM yyyy') : '-'
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
            <Button variant="outline" onClick={handleSyncAttendance} className="gap-2">
              <RefreshCw size={16} />
              Sync
            </Button>
            <Button onClick={() => setIsModalOpen(true)} className="gap-2">
              <Plus size={16} />
              Manual Entry
            </Button>
            <Button variant="outline" onClick={handleExportCSV} className="gap-2">
              <Download size={16} />
              Export
            </Button>
            {selectedIds.length > 0 && (
              <Button variant="danger" onClick={handleBulkDelete} className="gap-2">
                <Trash2 size={16} />
                Delete Selected ({selectedIds.length})
              </Button>
            )}
          </div>
        }
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
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
          label="Approved OT" 
          value={stats.approved} 
          icon={Clock} 
          trend="up"
          trendValue="Finalized"
          onClick={() => setStatusFilter('Approved')}
        />
        <KPICard 
          label="Eligible Hours" 
          value={`${Math.round(stats.totalHours)}h`} 
          icon={Clock} 
          trend="up"
          trendValue="Total Cumulative"
        />
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
              {[...new Set(employees.map(e => e.designation).filter(Boolean))].map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>

            <select 
              value={contractorFilter}
              onChange={(e) => setContractorFilter(e.target.value)}
              className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            >
              <option value="All">All Contractors</option>
              {[...new Set(employees.map(e => e.contractorName).filter(Boolean))].map(c => (
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
      </AnimatePresence>
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
