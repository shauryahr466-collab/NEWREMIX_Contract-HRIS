import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, User, Mail, Phone, MapPin, Briefcase, 
  Calendar, Clock, Shield, Award, Fingerprint,
  TrendingUp, AlertCircle, FileText
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { useAppStore } from '../store';
import { cn } from '../lib/utils';
import { Employee, ProcessedAttendance, OvertimeRecord, SBLRecord } from '../types';

interface EmployeeDrawerProps {
  employee: Employee | null;
  isOpen: boolean;
  onClose: () => void;
}

export function EmployeeDrawer({ employee, isOpen, onClose }: EmployeeDrawerProps) {
  const { processedData, overtimeRecords, sblRecords, settings } = useAppStore();

  if (!employee) return null;

  const attendance = processedData.filter(d => d.employeeId === employee.id);
  const overtime = overtimeRecords.filter(r => r.employeeId === employee.id);
  const leaves = sblRecords.filter(r => r.employeeId === employee.id);
  
  const stats = {
    avgWork: attendance.length ? (attendance.reduce((acc, curr) => acc + curr.workingHours, 0) / attendance.length).toFixed(1) : 0,
    totalOt: overtime.reduce((acc, curr) => acc + curr.hours, 0),
    presence: attendance.length ? ((attendance.filter(a => a.status === 'Present').length / attendance.length) * 100).toFixed(0) : 0
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[110]"
          />
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="fixed top-0 right-0 bottom-0 w-full max-w-2xl bg-white dark:bg-slate-950 shadow-2xl z-[120] overflow-hidden flex flex-col"
          >
            {/* Header */}
            <div className="p-8 enterprise-gradient text-white shrink-0 relative">
              <button 
                onClick={onClose}
                className="absolute top-6 right-6 p-2 bg-white/10 hover:bg-white/20 rounded-xl text-white transition-colors"
              >
                <X size={20} />
              </button>

              <div className="flex items-center gap-6">
                <div className="w-24 h-24 rounded-3xl bg-white/20 backdrop-blur-md border border-white/30 flex items-center justify-center shadow-2xl overflow-hidden relative group">
                   {employee.profilePicture ? (
                     <img src={employee.profilePicture} alt={employee.name} className="w-full h-full object-cover" />
                   ) : (
                     <User size={40} className="text-white/40" />
                   )}
                </div>
                <div>
                  <h2 className="text-3xl font-black tracking-tight">{employee.name}</h2>
                  <div className="flex items-center gap-3 mt-2 text-white/60">
                    <span className="text-xs font-black uppercase tracking-widest bg-white/10 px-2 py-1 rounded-lg">ID: {employee.id}</span>
                    <span className="w-1 h-1 bg-white/30 rounded-full"></span>
                    <span className="text-xs font-bold uppercase tracking-widest">{employee.designation || 'Staff'}</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mt-8">
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5 backdrop-blur-sm">
                   <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Attendance</p>
                   <p className="text-xl font-black mt-1">{stats.presence}%</p>
                </div>
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5 backdrop-blur-sm">
                   <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Avg Work</p>
                   <p className="text-xl font-black mt-1">{stats.avgWork}h</p>
                </div>
                <div className="p-4 bg-white/5 rounded-2xl border border-white/5 backdrop-blur-sm">
                   <p className="text-[10px] font-black text-white/40 uppercase tracking-widest">Total OT</p>
                   <p className="text-xl font-black mt-1">{stats.totalOt}h</p>
                </div>
              </div>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-8 space-y-10 custom-scrollbar-light bg-slate-50/50 dark:bg-slate-900/50">
              {/* Personal Information */}
              <section className="space-y-4">
                <div className="flex items-center justify-between">
                   <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
                     <Award className="w-4 h-4 text-indigo-500" />
                     Professional Profile
                   </h3>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <InfoItem icon={Briefcase} label="Department" value={employee.department} />
                  <InfoItem icon={Shield} label="Contractor" value={employee.contractorName || 'Not Assigned'} />
                  <InfoItem icon={MapPin} label="Location" value={employee.accommodation || 'Off-site'} />
                  <InfoItem icon={Calendar} label="Joining Date" value={employee.joiningDate ? format(parseISO(employee.joiningDate), 'dd MMM yyyy') : 'N/A'} />
                  <InfoItem icon={Clock} label="Standard Shift" value={settings.shifts?.find(s => s.id === employee.shiftId)?.name || 'Day Shift'} />
                  <InfoItem icon={TrendingUp} label="Target Hours" value={`${employee.targetWorkingHours || 8} hrs/day`} />
                  <InfoItem icon={Shield} label="OT Eligible" value={employee.otEligible ? 'Yes' : 'No'} />
                </div>
              </section>

              {/* Financial & Compliance */}
              <section className="space-y-4">
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
                  <Shield className="w-4 h-4 text-blue-500" />
                  Compliance & Contact
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <InfoItem icon={Mail} label="Email Address" value={employee.email || 'N/A'} />
                  <InfoItem icon={Phone} label="Contact Number" value={employee.phone || 'N/A'} />
                  <InfoItem icon={Fingerprint} label="Aadhar/ID" value={employee.aadharNumber || 'N/A'} />
                  <InfoItem icon={FileText} label="Account Type" value="Contractual" />
                </div>
              </section>

              {/* Recent Activity Mini-Grids */}
              <div className="grid grid-cols-1 gap-6">
                <ActivitySection 
                  title="Recent Punches" 
                  icon={Clock} 
                  color="indigo"
                  items={attendance.slice(0, 5).map(a => ({
                    label: format(parseISO(a.date), 'dd MMM'),
                    value: `${a.firstPunch ? format(parseISO(a.firstPunch), 'HH:mm') : '--'} - ${a.lastPunch ? format(parseISO(a.lastPunch), 'HH:mm') : '--'}`,
                    status: a.status
                  }))} 
                />
                
                <ActivitySection 
                  title="Overtime Log" 
                  icon={TrendingUp} 
                  color="emerald"
                  items={overtime.slice(0, 5).map(o => ({
                    label: format(parseISO(o.date), 'dd MMM'),
                    value: `${o.hours} Hours`,
                    status: o.status
                  }))} 
                />

                <ActivitySection 
                  title="Leave Balances" 
                  icon={Calendar} 
                  color="amber"
                  items={leaves.slice(0, 5).map(l => ({
                    label: l.leaveType,
                    value: l.date,
                    status: l.status
                  }))} 
                />
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-6 bg-white dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800 flex gap-3 shadow-2xl">
               <button className="flex-1 py-4 bg-slate-900 dark:bg-indigo-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-800 dark:hover:bg-indigo-700 transition-all">
                 View Full Personnel File
               </button>
               <button className="flex-1 py-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-2xl text-xs font-black uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">
                 Contact Manager
               </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function InfoItem({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm flex items-start gap-3">
      <div className="w-10 h-10 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center shrink-0">
        <Icon size={18} className="text-slate-400" />
      </div>
      <div>
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">{label}</p>
        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{value}</p>
      </div>
    </div>
  );
}

function ActivitySection({ title, icon: Icon, items, color, colorHex }: any) {
  return (
    <div className="bg-white dark:bg-slate-900 rounded-[2rem] border border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm">
      <div className="px-6 py-4 border-b border-slate-50 dark:border-slate-800 flex items-center justify-between">
        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
          <Icon className={`w-3.5 h-3.5 text-${color}-500`} />
          {title}
        </h4>
      </div>
      <div className="divide-y divide-slate-50 dark:divide-slate-800">
        {items.length > 0 ? items.map((item: any, i: number) => (
          <div key={i} className="px-6 py-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors">
            <div className="flex items-center gap-4">
              <p className="text-xs font-black text-slate-900 dark:text-white">{item.label}</p>
              <p className="text-xs font-bold text-slate-400">{item.value}</p>
            </div>
            <span className={cn(
              "text-[8px] font-black uppercase tracking-[0.15em] px-2 py-0.5 rounded-full",
              item.status === 'Present' || item.status === 'Approved' ? "bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600" :
              item.status === 'Absent' || item.status === 'Rejected' ? "bg-rose-50 dark:bg-rose-900/20 text-rose-600" : "bg-slate-100 dark:bg-slate-800 text-slate-400"
            )}>
              {item.status}
            </span>
          </div>
        )) : (
          <div className="px-6 py-10 text-center">
            <p className="text-xs font-bold text-slate-400">No recent activity records</p>
          </div>
        )}
      </div>
    </div>
  );
}
