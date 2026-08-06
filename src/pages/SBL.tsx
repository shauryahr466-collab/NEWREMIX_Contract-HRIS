import React, { useMemo, useState } from 'react';
import { useAppStore } from '../store';
import { format, parseISO } from 'date-fns';
import { CalendarRange, Search, Download, Clock, Info, Plus, Save, ShieldCheck, ShieldAlert, Trash2, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { PageHeader, Card, Button, Input, KPICard, Badge } from '../components/ui';
import { cn } from '../lib/utils';

export default function SBL() {
  const { sblRecords, employees, updateSBL, addSBL, deleteSBL, globalSearchTerm } = useAppStore();
  const [searchTerm, setSearchTerm] = useState('');
  const activeSearch = searchTerm || globalSearchTerm;
  const [statusFilter, setStatusFilter] = useState<'All' | 'Pending' | 'Approved' | 'Rejected' | 'Final Confirmed'>('All');
  const [designationFilter, setDesignationFilter] = useState<string>('All');
  const [contractorFilter, setContractorFilter] = useState<string>('All');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [formData, setFormData] = useState({
    employeeId: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    leaveType: 'SBL' as 'SBL' | 'Comp Leave',
    duration: 'Full Day',
    reason: ''
  });

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const handleSelect = (id: string) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.length} selected SBL records?`)) return;

    const tId = toast.loading('Deleting records...');
    try {
      for (const id of selectedIds) {
        await deleteSBL(id);
      }
      setSelectedIds([]);
      toast.success(`Successfully deleted ${selectedIds.length} records`, { id: tId });
    } catch (e) {
      toast.error('Bulk delete failed', { id: tId });
    }
  };

  const handleDeleteSBL = async (id: string) => {
    try {
      await deleteSBL(id);
      toast.success('SBL record deleted');
    } catch (e) {
      toast.error('Delete failed');
    }
  };

  const filteredRecords = useMemo(() => {
    return sblRecords.filter(record => {
      const emp = employees.find(e => e.id === record.employeeId);
      const matchesSearch = !activeSearch || 
        emp?.name.toLowerCase().includes(activeSearch.toLowerCase()) || 
        record.employeeId.toLowerCase().includes(activeSearch.toLowerCase()) ||
        emp?.designation?.toLowerCase().includes(activeSearch.toLowerCase());
      const matchesStatus = statusFilter === 'All' || record.status === statusFilter;
      const matchesDesignation = designationFilter === 'All' || emp?.designation === designationFilter;
      const matchesContractor = contractorFilter === 'All' || emp?.contractorName === contractorFilter;
      return matchesSearch && matchesStatus && matchesDesignation && matchesContractor;
    }).sort((a, b) => a.date.localeCompare(b.date));
  }, [sblRecords, employees, activeSearch, statusFilter, designationFilter, contractorFilter]);

  const stats = useMemo(() => ({
    total: sblRecords.length,
    pending: sblRecords.filter(r => r.status === 'Pending').length,
    approved: sblRecords.filter(r => r.status === 'Approved').length,
    rejected: sblRecords.filter(r => r.status === 'Rejected').length,
  }), [sblRecords]);

  const handleStatusChange = async (id: string, status: 'Approved' | 'Rejected' | 'Final Confirmed' | 'Not Approved') => {
    try {
      await updateSBL(id, { status, approvedBy: 'Admin' });
      toast.success(`Status updated to ${status}`);
    } catch (e) {
      toast.error('Operation failed');
    }
  };

  const handleAddSBL = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.employeeId || !formData.date || !formData.reason) {
      toast.error('Please fill all required fields');
      return;
    }

    try {
      await addSBL({
        ...formData,
        status: 'Approved',
        approvedBy: 'Admin'
      });
      toast.success('SBL record added successfully');
      setIsModalOpen(false);
      setFormData({
        employeeId: '',
        date: format(new Date(), 'yyyy-MM-dd'),
        leaveType: 'SBL',
        duration: 'Full Day',
        reason: ''
      });
    } catch (e) {
      toast.error('Failed to add record');
    }
  };

  const handleExport = () => {
    try {
      const data = filteredRecords.map(record => {
        const emp = employees.find(e => e.id === record.employeeId);
        return {
          'Employee Name': emp?.name || 'Unknown',
          'Employee ID': record.employeeId,
          'Department': emp?.department || '-',
          'Designation': emp?.designation || '-',
          'Contractor': emp?.contractorName || '-',
          'Date': format(parseISO(record.date), 'dd MMM yyyy'),
          'Leave Type': record.leaveType,
          'Duration': record.duration,
          'Status': record.status,
          'Approved By': record.approvedBy || '-',
          'Reason': record.reason || ''
        };
      });

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'SBL Summary');
      
      const fileName = `SBL_Summary_${format(new Date(), 'yyyy-MM-dd')}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success('SBL Summary exported successfully');
    } catch (error) {
      toast.error('Failed to export summary');
    }
  };

  const handleExportConfirmed = () => {
    try {
      const confirmedRecords = sblRecords.filter(r => r.status === 'Final Confirmed');
      if (confirmedRecords.length === 0) {
        toast.error('No confirmed records to export');
        return;
      }

      const data = confirmedRecords.map(record => {
        const emp = employees.find(e => e.id === record.employeeId);
        return {
          'Employee Name': emp?.name || 'Unknown',
          'Employee ID': record.employeeId,
          'Department': emp?.department || '-',
          'Date': format(parseISO(record.date), 'dd MMM yyyy'),
          'Leave Type': record.leaveType,
          'Duration': record.duration,
          'Audit Status': 'Final Confirmed',
          'Export Date': format(new Date(), 'dd MMM yyyy')
        };
      });

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Final Confirmed SBL');
      
      const fileName = `Confirmed_SBL_${format(new Date(), 'MMMM_yyyy')}.xlsx`;
      XLSX.writeFile(wb, fileName);
      toast.success('Monthly Final Report exported');
    } catch (error) {
      toast.error('Export failed');
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="SBL Management" 
        description="Short Break Leave Tracking"
        icon={CalendarRange}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setIsModalOpen(true)} className="gap-2">
              <Plus size={16} />
              New Request
            </Button>
            <Button variant="outline" onClick={handleExportConfirmed} className="gap-2 bg-success/10 text-success border-success/20 hover:bg-success hover:text-white">
              <ShieldCheck size={16} />
              Confirmed Summary
            </Button>
            <Button variant="outline" onClick={handleExport} className="gap-2">
              <Download size={16} />
              Export Summary
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

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard 
          label="Total Requests" 
          value={stats.total} 
          icon={CalendarRange} 
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
          label="Approved SBL" 
          value={stats.approved} 
          icon={CalendarRange} 
          trend="up"
          trendValue="Finalized"
          onClick={() => setStatusFilter('Approved')}
        />
        <KPICard 
          label="Rejected SBL" 
          value={stats.rejected} 
          icon={CalendarRange} 
          trend="down"
          trendValue="Declined Requests"
          onClick={() => setStatusFilter('Rejected')}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2">
          <Card className="p-4">
            <div className="flex flex-wrap items-center gap-4 mb-6">
              <div className="relative flex-1 min-w-[240px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input 
                  placeholder="Search employee..."
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
                  <option value="Pending">Pending</option>
                  <option value="Approved">Approved</option>
                  <option value="Rejected">Rejected</option>
                  <option value="Final Confirmed">Final Confirmed</option>
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

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-100 dark:border-slate-800">
                    <th className="px-4 py-3 w-12 text-center">
                      <input 
                        type="checkbox"
                        checked={filteredRecords.length > 0 && selectedIds.length === filteredRecords.length}
                        onChange={(e) => setSelectedIds(e.target.checked ? filteredRecords.map(r => r.id) : [])}
                        className="rounded border-slate-300 text-primary focus:ring-primary"
                      />
                    </th>
                    <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Employee</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Date</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Type</th>
                    <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Status</th>
                    <th className="px-4 py-3 text-right text-[11px] font-bold text-slate-400 uppercase tracking-widest">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
                  {filteredRecords.map((record) => {
                    const emp = employees.find(e => e.id === record.employeeId);
                    return (
                      <tr 
                        key={record.id}
                        className={cn(
                          "group hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors",
                          selectedIds.includes(record.id) && "bg-primary/5 dark:bg-primary/10"
                        )}
                      >
                        <td className="px-4 py-4 text-center">
                          <input 
                            type="checkbox"
                            checked={selectedIds.includes(record.id)}
                            onChange={() => handleSelect(record.id)}
                            className="rounded border-slate-300 text-primary focus:ring-primary"
                          />
                        </td>
                        <td className="px-4 py-4">
                          <p className="text-sm font-bold text-slate-900 dark:text-white leading-none">{emp?.name || 'Unknown'}</p>
                          <p className="text-[11px] font-medium text-slate-500 mt-1">{record.employeeId}</p>
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-400">
                          {format(parseISO(record.date), 'dd MMM yyyy')}
                        </td>
                        <td className="px-4 py-4">
                          <Badge variant="info" className="uppercase text-[10px]">
                            {record.leaveType}
                          </Badge>
                        </td>
                        <td className="px-4 py-4">
                          <Badge 
                            variant={
                              record.status === 'Final Confirmed' ? 'info' :
                              record.status === 'Approved' ? 'success' :
                              record.status === 'Rejected' ? 'danger' :
                              record.status === 'Not Approved' ? 'outline' : 'warning'
                            }
                            className="uppercase text-[10px]"
                          >
                            {record.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-4 text-right space-x-1">
                          <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {record.status === 'Pending' && (
                              <>
                                <button 
                                  onClick={() => handleStatusChange(record.id, 'Approved')}
                                  className="p-1.5 text-success hover:bg-success/10 rounded-lg transition-colors"
                                  title="Approve"
                                >
                                  <ShieldCheck size={16} />
                                </button>
                                <button 
                                  onClick={() => handleStatusChange(record.id, 'Rejected')}
                                  className="p-1.5 text-danger hover:bg-danger/10 rounded-lg transition-colors"
                                  title="Reject"
                                >
                                  <ShieldAlert size={16} />
                                </button>
                              </>
                            )}
                            {record.status === 'Approved' && (
                              <div className="flex gap-1">
                                 <Button 
                                  size="sm"
                                  variant="primary"
                                  onClick={() => handleStatusChange(record.id, 'Final Confirmed')}
                                  className="h-7 text-[9px] uppercase px-2"
                                >
                                  Final Confirm
                                </Button>
                                <Button 
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleStatusChange(record.id, 'Not Approved')}
                                  className="h-7 text-[9px] uppercase px-2"
                                >
                                  Not Approved
                                </Button>
                              </div>
                            )}
                            <button 
                              onClick={(e) => {
                                e.stopPropagation();
                                if (window.confirm('Are you sure you want to delete this SBL record?')) {
                                  handleDeleteSBL(record.id);
                                }
                              }}
                              className="p-1.5 text-slate-400 hover:text-danger hover:bg-danger/10 rounded-lg transition-colors"
                              title="Delete"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card className="p-6">
             <h3 className="text-[11px] font-bold text-slate-900 dark:text-white uppercase tracking-widest mb-6">Approval Distribution</h3>
             <div className="space-y-6">
                <DistributionItem label="Approved" count={stats.approved} total={stats.total} color="bg-success" />
                <DistributionItem label="Pending" count={stats.pending} total={stats.total} color="bg-warning" />
                <DistributionItem label="Rejected" count={stats.rejected} total={stats.total} color="bg-danger" />
             </div>
             
             <div className="mt-8 p-4 bg-primary/5 rounded-xl border border-primary/10">
                <div className="flex gap-3">
                   <Info size={18} className="text-primary shrink-0" />
                   <p className="text-[11px] text-slate-600 dark:text-slate-400 font-medium leading-relaxed">
                     SBL (Substitute Leave) is credited to non-OT eligible staff working on Weekly Offs or Holidays. Admin approval is final.
                   </p>
                </div>
             </div>
          </Card>
        </div>
      </div>

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
                  <h3 className="text-xl font-bold">New SBL Entry</h3>
                  <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mt-1">Substitute Leave Registration</p>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>

              <form onSubmit={handleAddSBL} className="p-8 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Employee</label>
                    <select 
                      required
                      value={formData.employeeId}
                      onChange={e => setFormData({ ...formData, employeeId: e.target.value })}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="">Staff Select...</option>
                      {employees.map(emp => (
                        <option key={emp.id} value={emp.id}>{emp.name} ({emp.id})</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Credited Date</label>
                    <Input 
                      type="date"
                      required
                      value={formData.date}
                      onChange={e => setFormData({ ...formData, date: e.target.value })}
                    />
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Leave Type</label>
                    <select 
                      value={formData.leaveType}
                      onChange={e => setFormData({ ...formData, leaveType: e.target.value as any })}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="SBL">Substitute Leave (SBL)</option>
                      <option value="Comp Leave">Compensatory Leave</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Duration</label>
                    <select 
                      value={formData.duration}
                      onChange={e => setFormData({ ...formData, duration: e.target.value })}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="Full Day">Full Day</option>
                      <option value="Half Day (First)">Half Day (First)</option>
                      <option value="Half Day (Second)">Half Day (Second)</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Official Reason</label>
                  <textarea 
                    required
                    value={formData.reason}
                    onChange={e => setFormData({ ...formData, reason: e.target.value })}
                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 min-h-[80px] dark:text-white"
                    placeholder="E.g. Worked on Public Holiday..."
                  />
                </div>

                <Button type="submit" className="w-full h-12 uppercase tracking-widest text-[11px] font-bold">
                  <Save size={18} className="mr-2" />
                  Register SBL Entry
                </Button>
              </form>
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
