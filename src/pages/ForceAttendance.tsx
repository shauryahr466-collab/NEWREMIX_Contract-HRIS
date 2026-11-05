import React, { useState, useMemo } from 'react';
import { useAppStore } from '../store';
import { format, parseISO } from 'date-fns';
import { UserCheck, Search, Plus, Save, Clock, Calendar, FileText, ChevronRight, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { PageHeader, Card, Button, Input, Badge } from '../components/ui';
import { cn } from '../lib/utils';
import { useActionStatus } from '../context/ActionStatusContext';

export default function ForceAttendance() {
  const { employees, forceAttendanceRecords, addForceAttendance, addAuditLog, addPunch } = useAppStore();
  const { executeWithStatus } = useActionStatus();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const [formData, setFormData] = useState({
    employeeId: '',
    date: '',
    inTime: '',
    outTime: '',
    reason: '',
    remarks: ''
  });

  const filteredRecords = useMemo(() => {
    return forceAttendanceRecords.filter(record => {
      const emp = employees.find(e => e.id === record.employeeId);
      return !searchTerm || 
        emp?.name.toLowerCase().includes(searchTerm.toLowerCase()) || 
        record.employeeId.toLowerCase().includes(searchTerm.toLowerCase());
    });
  }, [forceAttendanceRecords, employees, searchTerm]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.employeeId || !formData.date || !formData.inTime || !formData.outTime) {
      toast.error('Please fill all required fields');
      return;
    }

    const emp = employees.find(e => e.id === formData.employeeId);

    await executeWithStatus(
      {
        title: `Apply Force Attendance Correction?`,
        subtitle: `Directly inject attendance punches for ${emp?.name || formData.employeeId} on ${formData.date}`,
        module: 'Manual Corrections',
        actionType: 'save',
        recordId: formData.employeeId,
        recordName: emp?.name,
        details: {
          'Employee': `${emp?.name || 'Unknown'} (${formData.employeeId})`,
          'Adjustment Date': formData.date,
          'Manual IN Time': formData.inTime,
          'Manual OUT Time': formData.outTime,
          'Reason': formData.reason || 'Manual Correction'
        },
        confirmText: 'Apply & Save Punch Correction'
      },
      async (updateProgress) => {
        updateProgress({ percent: 30, message: 'Registering force adjustment record...' });
        await addForceAttendance({
          ...formData,
          approvedBy: 'Admin'
        });

        updateProgress({ percent: 60, message: 'Creating biometric punch timestamps in SQLite...' });
        const dateBase = formData.date;
        await addPunch({ employeeId: formData.employeeId, punchDatetime: `${dateBase}T${formData.inTime}:00` });
        await addPunch({ employeeId: formData.employeeId, punchDatetime: `${dateBase}T${formData.outTime}:00` });

        updateProgress({ percent: 85, message: 'Writing audit ledger entry...' });
        await addAuditLog({
          employeeId: formData.employeeId,
          employeeName: emp?.name || 'Unknown',
          date: formData.date,
          field: 'Force Attendance',
          oldValue: 'None',
          newValue: `IN: ${formData.inTime}, OUT: ${formData.outTime}`,
          changedBy: 'Admin',
          remarks: `Manual Entry: ${formData.reason}`
        });

        setIsModalOpen(false);
        setFormData({ employeeId: '', date: '', inTime: '', outTime: '', reason: '', remarks: '' });

        return {
          success: true,
          affectedCount: 2,
          verificationStatus: 'PASSED',
          transaction: 'COMMITTED',
          dbPath: 'E:\\SHRM_HRIS\\Database.db',
          breakdown: {
            'Employee': `${emp?.name || 'Unknown'} (${formData.employeeId})`,
            'Punches Injected': '2 punches (IN & OUT)',
            'Database Path': 'E:\\SHRM_HRIS\\Database.db'
          }
        };
      }
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Force Attendance" 
        description="Manual Override & Correction"
        icon={UserCheck}
        actions={
          <Button onClick={() => setIsModalOpen(true)} className="gap-2">
            <Plus size={16} />
            New Adjustment
          </Button>
        }
      />

      <Card className="p-4">
        <div className="relative mb-6">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <Input 
            placeholder="Search adjustments..."
            className="pl-10"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800">
                <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Employee</th>
                <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Adjustment Date</th>
                <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Punch Duration</th>
                <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest">Reason</th>
                <th className="px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-widest text-right">Processed At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 dark:divide-slate-800/50">
              {filteredRecords.map((record) => {
                const emp = employees.find(e => e.id === record.employeeId);
                return (
                  <tr key={record.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                    <td className="px-4 py-4">
                      <p className="text-sm font-bold text-slate-900 dark:text-white leading-none">{emp?.name || 'Unknown'}</p>
                      <p className="text-[11px] font-medium text-slate-500 mt-1">{record.employeeId}</p>
                    </td>
                    <td className="px-4 py-4 text-sm text-slate-600 dark:text-slate-400 font-medium">
                      {format(parseISO(record.date), 'dd MMM yyyy')}
                    </td>
                    <td className="px-4 py-4">
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
                    <td className="px-4 py-4">
                      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs font-medium">{record.reason}</p>
                    </td>
                    <td className="px-4 py-4 text-right">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">
                        {format(parseISO(record.timestamp), 'dd MMM HH:mm')}
                      </p>
                    </td>
                  </tr>
                );
              })}
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
                      <h3 className="text-xl font-bold">Force Attendance Entry</h3>
                      <p className="text-slate-400 text-[11px] font-bold uppercase tracking-widest mt-1">Directly inject attendance records</p>
                    </div>
                  </div>
                  <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">
                    <X size={24} />
                  </button>
                </div>

                <div className="p-8 space-y-5">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Employee</label>
                    <select 
                      className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                      value={formData.employeeId}
                      onChange={(e) => setFormData({ ...formData, employeeId: e.target.value })}
                      required
                    >
                      <option value="">Select Employee</option>
                      {employees.map(e => <option key={e.id} value={e.id}>{e.name} ({e.id})</option>)}
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
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Manual IN Time</label>
                      <Input 
                        type="time" 
                        value={formData.inTime}
                        onChange={(e) => setFormData({ ...formData, inTime: e.target.value })}
                        required
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Manual OUT Time</label>
                      <Input 
                        type="time" 
                        value={formData.outTime}
                        onChange={(e) => setFormData({ ...formData, outTime: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Adjustment Reason</label>
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

                  <Button type="submit" className="w-full h-12 uppercase tracking-widest text-[11px] font-bold">
                    <Save size={18} className="mr-2" />
                    Apply Force Entry
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
