import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, User, Mail, Phone, MapPin, Briefcase, 
  Calendar, Clock, Shield, Award, Fingerprint,
  TrendingUp, FileText, Building, DollarSign,
  Layers, CheckCircle2, XCircle, AlertCircle,
  History, ArrowRight, UserCheck, UserX, ChevronRight,
  Sparkles, Sliders, Info, Edit, FileSpreadsheet, Lock
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { formatUniversalDate, getNepaliDate } from '../utils/dateHelper';
import { useAppStore } from '../store';
import { cn } from '../lib/utils';
import { Employee, ProcessedAttendance, OvertimeRecord, SBLRecord, EmployeeMovement, AuditLog } from '../types';
import { EmployeeDocuments } from './EmployeeDocuments';
import { Badge } from './ui';

interface EmployeeDrawerProps {
  employee: Employee | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (employee: Employee) => void;
  onDeactivate?: (employee: Employee) => void;
}

type TabType = 
  | 'personal'
  | 'employment'
  | 'salary'
  | 'ot_hours'
  | 'attendance'
  | 'leaves'
  | 'documents'
  | 'movements'
  | 'audit';

export function EmployeeDrawer({ employee, isOpen, onClose, onEdit, onDeactivate }: EmployeeDrawerProps) {
  const { processedData, overtimeRecords, sblRecords, settings, movements, auditLogs } = useAppStore();
  const [activeTab, setActiveTab] = useState<TabType>('personal');

  if (!employee) return null;

  const attendance = processedData.filter(d => d.employeeId === employee.id);
  const overtime = overtimeRecords.filter(r => r.employeeId === employee.id);
  const leaves = sblRecords.filter(r => r.employeeId === employee.id);
  const empMovements = movements.filter(m => m.employeeId === employee.id);
  const empAuditLogs = auditLogs.filter(a => a.employeeId === employee.id);

  // Derived financial & working metrics
  const basic = employee.basicSalary || 0;
  const dearness = employee.dearnessAllowance || 0;
  const other = employee.otherAllowance || employee.allowances || 0;
  const gross = employee.grossSalary || (basic + dearness + other);
  const employerSsf = employee.employerSSF ?? Math.round(basic * 0.20);
  const employeeSsf = employee.employeeSSF ?? Math.round(basic * 0.11);
  const monthlyCtc = employee.monthlyCTC ?? (gross + employerSsf);
  const annualCtc = employee.annualCTC ?? (monthlyCtc * 12);
  const reqDailyHours = employee.requiredWorkingHoursPerDay || employee.targetWorkingHours || 8;
  const reqWeeklyHours = employee.requiredWorkingHoursPerWeek || (reqDailyHours * 6);

  const presentCount = attendance.filter(a => a.status === 'Present' || a.status === 'On Time' || a.status === 'Late').length;
  const presencePct = attendance.length ? Math.round((presentCount / attendance.length) * 100) : 100;
  const avgWorkHours = attendance.length ? (attendance.reduce((acc, curr) => acc + (curr.workingHours || 0), 0) / attendance.length).toFixed(1) : reqDailyHours.toString();
  const totalOtHours = overtime.reduce((acc, curr) => acc + (curr.hours || 0), 0);

  const tabs: { id: TabType; label: string; count?: number }[] = [
    { id: 'personal', label: '1. Personal' },
    { id: 'employment', label: '2. Employment' },
    { id: 'salary', label: '3. Salary & SSF' },
    { id: 'ot_hours', label: '4. OT & Hours' },
    { id: 'attendance', label: '5. Attendance', count: attendance.length },
    { id: 'leaves', label: '6. Leave & SBL', count: leaves.length },
    { id: 'documents', label: '7. Documents' },
    { id: 'movements', label: '8. Movements', count: empMovements.length },
    { id: 'audit', label: '9. Audit History', count: empAuditLogs.length }
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110]"
          />
          <motion.div 
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 28, stiffness: 220 }}
            className="fixed top-0 right-0 bottom-0 w-full max-w-3xl bg-white dark:bg-slate-950 shadow-2xl z-[120] overflow-hidden flex flex-col border-l border-slate-200 dark:border-slate-800"
          >
            {/* Top Identity Header */}
            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white p-6 shrink-0 relative border-b border-indigo-900/50">
              <button 
                onClick={onClose}
                className="absolute top-5 right-5 p-2 bg-white/10 hover:bg-white/20 rounded-xl text-white/80 hover:text-white transition-colors"
                title="Close Profile"
              >
                <X size={18} />
              </button>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pr-12">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-indigo-600/30 border-2 border-indigo-400/40 flex items-center justify-center text-white font-black text-2xl shadow-inner shrink-0 overflow-hidden">
                    {employee.profilePicture ? (
                      <img src={employee.profilePicture} alt={employee.name} className="w-full h-full object-cover" />
                    ) : (
                      employee.name ? employee.name.charAt(0).toUpperCase() : <User size={28} />
                    )}
                  </div>
                  <div>
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <h2 className="text-xl font-black tracking-tight text-white">{employee.name}</h2>
                      <span className={cn(
                        "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider",
                        employee.status === 'Active' ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" : "bg-rose-500/20 text-rose-300 border border-rose-500/30"
                      )}>
                        {employee.status || 'Active'}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1.5 text-xs text-indigo-200/80 flex-wrap font-medium">
                      <span className="font-mono bg-white/10 px-2 py-0.5 rounded-md text-[11px] font-bold text-white tracking-wide">
                        ID: {employee.id}
                      </span>
                      <span>•</span>
                      <span>{employee.designation || 'Staff'}</span>
                      <span>•</span>
                      <span>{employee.department || 'General'}</span>
                    </div>
                  </div>
                </div>

                {/* Header Action Buttons */}
                <div className="flex items-center gap-2 self-start sm:self-center">
                  {onEdit && (
                    <button 
                      onClick={() => onEdit(employee)}
                      className="px-3.5 py-1.5 bg-indigo-500 hover:bg-indigo-600 text-white rounded-xl text-xs font-bold transition-colors flex items-center gap-1.5 shadow-md"
                    >
                      <Edit size={13} /> Edit Master Data
                    </button>
                  )}
                  {onDeactivate && employee.status === 'Active' && (
                    <button 
                      onClick={() => onDeactivate(employee)}
                      className="px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/30 text-rose-200 rounded-xl text-xs font-bold transition-colors flex items-center gap-1"
                    >
                      <UserX size={13} /> Deactivate
                    </button>
                  )}
                </div>
              </div>

              {/* Quick Metrics Bar */}
              <div className="grid grid-cols-4 gap-2 mt-5 pt-4 border-t border-white/10 text-center">
                <div className="bg-white/5 rounded-xl p-2.5 border border-white/5">
                  <p className="text-[9px] uppercase font-bold tracking-wider text-indigo-200/60">Attendance</p>
                  <p className="text-sm font-black text-white mt-0.5">{presencePct}%</p>
                </div>
                <div className="bg-white/5 rounded-xl p-2.5 border border-white/5">
                  <p className="text-[9px] uppercase font-bold tracking-wider text-indigo-200/60">Avg Daily</p>
                  <p className="text-sm font-black text-white mt-0.5">{avgWorkHours}h</p>
                </div>
                <div className="bg-white/5 rounded-xl p-2.5 border border-white/5">
                  <p className="text-[9px] uppercase font-bold tracking-wider text-indigo-200/60">Total OT</p>
                  <p className="text-sm font-black text-emerald-400 mt-0.5">{totalOtHours}h</p>
                </div>
                <div className="bg-white/5 rounded-xl p-2.5 border border-white/5">
                  <p className="text-[9px] uppercase font-bold tracking-wider text-indigo-200/60">Monthly CTC</p>
                  <p className="text-sm font-black text-amber-300 mt-0.5 font-mono">रु. {monthlyCtc.toLocaleString()}</p>
                </div>
              </div>
            </div>

            {/* Tab Navigation */}
            <div className="bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 flex items-center gap-1 overflow-x-auto custom-scrollbar-light shrink-0">
              {tabs.map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "px-3.5 py-3 text-xs font-bold whitespace-nowrap border-b-2 transition-all flex items-center gap-1.5",
                    activeTab === tab.id
                      ? "border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-950 font-black shadow-sm"
                      : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                  )}
                >
                  <span>{tab.label}</span>
                  {tab.count !== undefined && (
                    <span className={cn(
                      "text-[10px] px-1.5 py-0.2 rounded-full font-mono font-bold",
                      activeTab === tab.id ? "bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300" : "bg-slate-200 dark:bg-slate-800 text-slate-500"
                    )}>
                      {tab.count}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Tab Content Area */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/50 dark:bg-slate-900/40 custom-scrollbar-light">
              {/* 1. PERSONAL TAB */}
              {activeTab === 'personal' && (
                <div className="space-y-6">
                  <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <User className="w-4 h-4 text-indigo-600" /> Personal Identity
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                      <InfoCard label="Employee ID / Bio ID" value={employee.id} mono isHighlight />
                      <InfoCard label="Full Name" value={employee.name} />
                      <InfoCard label="Gender" value={employee.gender || 'Male'} />
                      <InfoCard label="Marital Status" value={employee.maritalStatus || 'Single'} />
                      <InfoCard label="Date of Birth (AD)" value={employee.dobAD || 'Not Provided'} />
                      <InfoCard label="Date of Birth (BS)" value={employee.dobBS || 'Not Provided'} />
                      <InfoCard label="Nationality" value={employee.nationality || 'Nepali'} />
                      <InfoCard label="Citizenship / National ID" value={employee.citizenshipNumber || employee.aadharNumber || 'Not Provided'} mono />
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <Phone className="w-4 h-4 text-emerald-600" /> Contact & Residence
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                      <InfoCard label="Mobile Number" value={employee.phone || employee.contactNumber || 'Not Provided'} mono />
                      <InfoCard label="Email Address" value={employee.email || 'Not Provided'} />
                      <InfoCard label="Permanent Address" value={employee.permanentAddress || employee.address || 'Not Provided'} />
                      <InfoCard label="Current Address" value={employee.currentAddress || employee.address || 'Not Provided'} />
                      <InfoCard label="Emergency Contact Person" value={employee.emergencyContact || 'Not Provided'} />
                      <InfoCard label="Emergency Contact Number" value={employee.emergencyContactNumber || employee.emergencyContact || 'Not Provided'} mono />
                    </div>
                  </div>
                </div>
              )}

              {/* 2. EMPLOYMENT TAB */}
              {activeTab === 'employment' && (
                <div className="space-y-6">
                  <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <Briefcase className="w-4 h-4 text-indigo-600" /> Organizational Master
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                      <InfoCard 
                        label="Date of Joining" 
                        value={employee.joiningDate ? `${formatUniversalDate(employee.joiningDate, 'dd MMMM yyyy')} (${formatUniversalDate(employee.joiningDate, 'yyyy-MM-dd')})${getNepaliDate(employee.joiningDate) !== '0000-00-00' ? ` • BS ${getNepaliDate(employee.joiningDate)}` : ''}` : 'N/A'} 
                        isHighlight 
                      />
                      <InfoCard label="Employment Type" value={employee.employmentType || 'Permanent'} />
                      <InfoCard label="Department" value={employee.department} isHighlight />
                      <InfoCard label="Section" value={employee.section || 'General'} />
                      <InfoCard label="Designation" value={employee.designation} isHighlight />
                      <InfoCard label="Grade / Level" value={`${employee.grade || 'N/A'} / ${employee.level || 'N/A'}`} />
                      <InfoCard label="Reporting Manager" value={employee.reportingManager || 'Not Assigned'} />
                      <InfoCard label="Plant / Location" value={employee.plantLocation || employee.location || employee.accommodation || 'Main Site'} />
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-600" /> Work Schedule & Shift
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                      <InfoCard label="Assigned Shift" value={settings.shifts?.find(s => s.id === employee.shiftId)?.name || 'Day Shift'} isHighlight />
                      <InfoCard label="Weekly Off" value={employee.weeklyOff || 'Sunday'} />
                      <InfoCard label="Contractor / Agency" value={employee.contractorName || 'Direct Employee'} />
                      <InfoCard label="Status Effective Date" value={employee.statusEffectiveDate || employee.joiningDate || 'N/A'} />
                    </div>
                  </div>
                </div>
              )}

              {/* 3. SALARY & SSF TAB */}
              {activeTab === 'salary' && (
                <div className="space-y-6">
                  {/* Salary Summary Card */}
                  <div className="bg-gradient-to-br from-indigo-900 to-slate-900 text-white p-6 rounded-2xl shadow-lg border border-indigo-700/40 space-y-4">
                    <div className="flex items-center justify-between border-b border-white/10 pb-3">
                      <div>
                        <h4 className="text-xs font-black uppercase tracking-wider text-indigo-300">Nepal IRD & SSF Statutory Package</h4>
                        <p className="text-xs text-white/70 mt-0.5">31% Total SSF Contribution Model (11% Employee + 20% Employer)</p>
                      </div>
                      <span className="px-3 py-1 bg-emerald-500/20 text-emerald-300 rounded-full font-mono text-xs font-bold border border-emerald-500/30">
                        {employee.maritalStatus === 'Married' ? 'Married Slab (Rs. 6L)' : 'Single Slab (Rs. 5L)'}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                      <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                        <span className="text-[10px] uppercase font-bold text-indigo-200/60 block">Basic Salary</span>
                        <strong className="text-base font-mono font-black text-white mt-1 block">रु. {basic.toLocaleString()}</strong>
                      </div>
                      <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                        <span className="text-[10px] uppercase font-bold text-indigo-200/60 block">Gross Salary</span>
                        <strong className="text-base font-mono font-black text-white mt-1 block">रु. {gross.toLocaleString()}</strong>
                      </div>
                      <div className="bg-white/5 p-3 rounded-xl border border-white/10">
                        <span className="text-[10px] uppercase font-bold text-indigo-200/60 block">Employer SSF (20%)</span>
                        <strong className="text-base font-mono font-black text-indigo-300 mt-1 block">रु. {employerSsf.toLocaleString()}</strong>
                      </div>
                      <div className="bg-emerald-500/10 p-3 rounded-xl border border-emerald-500/20">
                        <span className="text-[10px] uppercase font-bold text-emerald-300/80 block">Monthly CTC</span>
                        <strong className="text-base font-mono font-black text-emerald-400 mt-1 block">रु. {monthlyCtc.toLocaleString()}</strong>
                      </div>
                    </div>
                  </div>

                  {/* Detailed Components Grid */}
                  <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-emerald-600" /> Salary Breakdown Details
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                      <InfoCard label="Basic Salary" value={`रु. ${basic.toLocaleString()}`} mono isHighlight />
                      <InfoCard label="Dearness Allowance (DA)" value={`रु. ${dearness.toLocaleString()}`} mono />
                      <InfoCard label="Other Allowances" value={`रु. ${other.toLocaleString()}`} mono />
                      <InfoCard label="Gross Monthly Earnings" value={`रु. ${gross.toLocaleString()}`} mono isHighlight />
                      <InfoCard label="Employee SSF Deduction (11%)" value={`रु. ${employeeSsf.toLocaleString()}`} mono />
                      <InfoCard label="Employer SSF Contribution (20%)" value={`रु. ${employerSsf.toLocaleString()}`} mono isHighlight />
                      <InfoCard label="Total Monthly CTC" value={`रु. ${monthlyCtc.toLocaleString()}`} mono isHighlight />
                      <InfoCard label="Total Annual CTC" value={`रु. ${annualCtc.toLocaleString()}`} mono isHighlight />
                      <InfoCard label="Salary Effective Date" value={employee.salaryEffectiveDate || employee.joiningDate || 'System Start'} />
                      <InfoCard label="SSF Status" value={employee.ssfEnrolled !== false ? 'Enrolled (11% + 20%)' : 'Non-SSF'} />
                    </div>
                  </div>

                  {/* Bank & Tax Identifiers */}
                  <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <Building className="w-4 h-4 text-indigo-600" /> Bank & Statutory Numbers
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                      <InfoCard label="PAN Number" value={employee.panNumber || 'Not Provided'} mono />
                      <InfoCard label="SSF Number" value={employee.ssfNumber || 'Not Provided'} mono />
                      <InfoCard label="CIT Number" value={employee.citNumber || 'Not Provided'} mono />
                      <InfoCard label="Tax Status (IRD)" value={employee.maritalStatus || 'Single'} />
                      <InfoCard label="Bank Name" value={employee.bankName || 'Not Provided'} />
                      <InfoCard label="Bank Account Number" value={employee.accountNumber || 'Not Provided'} mono />
                      <InfoCard label="Branch Name" value={employee.branchName || 'Not Provided'} />
                      <InfoCard label="Disbursement Method" value={employee.paymentMethod || 'Bank Transfer'} />
                    </div>
                  </div>
                </div>
              )}

              {/* 4. OT & WORKING HOURS TAB */}
              {activeTab === 'ot_hours' && (
                <div className="space-y-6">
                  <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <TrendingUp className="w-4 h-4 text-indigo-600" /> Overtime Policy Configuration
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                      <div className="p-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">OT Eligibility Status</span>
                        <div className="flex items-center gap-2">
                          <span className={cn(
                            "px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider",
                            employee.otEligible !== false ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
                          )}>
                            {employee.otEligible !== false ? 'OT Eligible (Yes)' : 'Non-OT Staff (No)'}
                          </span>
                        </div>
                      </div>
                      <InfoCard label="OT Eligibility Type" value={employee.otEligibilityType || (employee.otEligible !== false ? 'Regular OT' : 'Not Eligible')} />
                      <InfoCard label="OT Effective Date" value={employee.otEffectiveDate || employee.joiningDate || 'System Start'} />
                      <InfoCard label="OT Rate Multiplier" value="1.5x (Nepal Labor Act)" mono />
                    </div>
                  </div>

                  <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-4">
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-blue-600" /> Required Working Hours Benchmark
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                      <InfoCard label="Required Working Hours Per Day" value={`${reqDailyHours} Hours / Day`} mono isHighlight />
                      <InfoCard label="Required Working Hours Per Week" value={`${reqWeeklyHours} Hours / Week`} mono isHighlight />
                      <InfoCard label="Grace Period" value={`${settings.graceTime || 15} Minutes`} />
                      <InfoCard label="Late Penalty Threshold" value={`${settings.lateThreshold || 30} Minutes`} />
                    </div>
                  </div>
                </div>
              )}

              {/* 5. ATTENDANCE TAB */}
              {activeTab === 'attendance' && (
                <div className="space-y-4">
                  <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">Attendance Log History</h4>
                      <p className="text-xs text-slate-500 mt-0.5">Showing last {Math.min(attendance.length, 30)} biometric processed sessions</p>
                    </div>
                    <span className="px-3 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full font-mono text-xs font-bold">
                      {attendance.length} Records Found
                    </span>
                  </div>

                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-sm">
                    {attendance.length > 0 ? (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-96 overflow-y-auto custom-scrollbar-light text-xs">
                        {attendance.slice(0, 30).map(att => (
                          <div key={att.id} className="p-3.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <div className="space-y-0.5">
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900 dark:text-white">{att.date}</span>
                                <span className="text-[10px] text-slate-400">({att.shiftName || 'Day Shift'})</span>
                              </div>
                              <p className="text-slate-500 font-mono text-[11px]">
                                IN: {att.firstPunch ? format(parseISO(att.firstPunch), 'HH:mm:ss') : '--:--'} • OUT: {att.lastPunch ? format(parseISO(att.lastPunch), 'HH:mm:ss') : '--:--'}
                              </p>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="font-mono font-bold text-slate-700 dark:text-slate-300">{att.workingHours || 0}h</span>
                              <span className={cn(
                                "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider",
                                att.status === 'Present' || att.status === 'On Time' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                                att.status === 'Late' ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" :
                                att.status === 'Absent' ? "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                              )}>
                                {att.status}
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-8 text-center text-slate-400 text-xs font-medium">
                        No biometric attendance punches processed for this employee yet.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 6. LEAVES & SBL TAB */}
              {activeTab === 'leaves' && (
                <div className="space-y-4">
                  <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">Leave & Short Break Logs (SBL)</h4>
                      <p className="text-xs text-slate-500 mt-0.5">Approved leaves, SBL, and paid weekly off adjustments</p>
                    </div>
                    <span className="px-3 py-1 bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 rounded-full font-mono text-xs font-bold">
                      {leaves.length} Leave Records
                    </span>
                  </div>

                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-sm">
                    {leaves.length > 0 ? (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-96 overflow-y-auto custom-scrollbar-light text-xs">
                        {leaves.map(l => (
                          <div key={l.id} className="p-3.5 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-bold text-slate-900 dark:text-white">{l.leaveType}</span>
                                <span className="font-mono text-slate-500">{l.date}</span>
                              </div>
                              <p className="text-[11px] text-slate-400 mt-0.5">{l.reason || 'Standard Leave'}</p>
                            </div>
                            <span className={cn(
                              "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider",
                              l.status === 'Approved' || l.status === 'Final Confirmed' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                              l.status === 'Pending' ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
                            )}>
                              {l.status}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-8 text-center text-slate-400 text-xs font-medium">
                        No leave or SBL records registered for this employee.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 7. DOCUMENTS TAB */}
              {activeTab === 'documents' && (
                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm">
                  <EmployeeDocuments employeeId={employee.id} employeeName={employee.name} />
                </div>
              )}

              {/* 8. MOVEMENTS TAB */}
              {activeTab === 'movements' && (
                <div className="space-y-4">
                  <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">Movement & Career Progression History</h4>
                      <p className="text-xs text-slate-500 mt-0.5">Chronological record of promotions, transfers, increments, and role shifts</p>
                    </div>
                    <span className="px-3 py-1 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full font-mono text-xs font-bold">
                      {empMovements.length} Movements
                    </span>
                  </div>

                  <div className="space-y-3">
                    {empMovements.length > 0 ? (
                      empMovements.map(m => (
                        <div key={m.id} className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm text-xs space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <span className="px-2.5 py-0.5 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 rounded-md font-bold uppercase text-[10px]">
                                {m.movementType}
                              </span>
                              <span className="font-mono font-bold text-slate-900 dark:text-white">{m.effectiveDate}</span>
                            </div>
                            {m.changedBy && (
                              <span className="text-[10px] text-slate-400">By: {m.changedBy}</span>
                            )}
                          </div>

                          <div className="p-2.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200/60 dark:border-slate-700/60 space-y-1">
                            {(m.previousDepartment || m.newDepartment) && (
                              <p className="text-slate-600 dark:text-slate-300">
                                Department: <span className="line-through text-slate-400">{m.previousDepartment || '-'}</span> → <strong className="text-slate-900 dark:text-white">{m.newDepartment || '-'}</strong>
                              </p>
                            )}
                            {(m.previousDesignation || m.newDesignation) && (
                              <p className="text-slate-600 dark:text-slate-300">
                                Designation: <span className="line-through text-slate-400">{m.previousDesignation || '-'}</span> → <strong className="text-slate-900 dark:text-white">{m.newDesignation || '-'}</strong>
                              </p>
                            )}
                            {(m.previousSalary || m.newSalary) && (
                              <p className="text-slate-600 dark:text-slate-300 font-mono">
                                Basic Salary: <span className="line-through text-slate-400">रु. {m.previousSalary?.toLocaleString()}</span> → <strong className="text-emerald-600">रु. {m.newSalary?.toLocaleString()}</strong>
                              </p>
                            )}
                            {m.reason && (
                              <p className="text-[11px] text-slate-500 italic pt-1">
                                Note: {m.reason}
                              </p>
                            )}
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="bg-white dark:bg-slate-900 p-8 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm text-center text-slate-400 text-xs">
                        No movement records recorded yet. Initial onboarding is baseline.
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* 9. AUDIT HISTORY TAB */}
              {activeTab === 'audit' && (
                <div className="space-y-4">
                  <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex items-center justify-between">
                    <div>
                      <h4 className="text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-300">Master Data Change Audit</h4>
                      <p className="text-xs text-slate-500 mt-0.5">Immutable audit trail of master data modifications, timestamps, and authors</p>
                    </div>
                    <span className="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-full font-mono text-xs font-bold">
                      {empAuditLogs.length} Entries
                    </span>
                  </div>

                  <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-sm">
                    {empAuditLogs.length > 0 ? (
                      <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-96 overflow-y-auto custom-scrollbar-light text-xs">
                        {empAuditLogs.map(log => {
                          const tsStr = log.timestamp || log.changedAt || log.date || '';
                          let formattedTs = tsStr;
                          try {
                            if (tsStr) {
                              const parsed = parseISO(String(tsStr).replace(' ', 'T'));
                              if (!isNaN(parsed.getTime())) {
                                formattedTs = format(parsed, 'yyyy-MM-dd HH:mm');
                              }
                            }
                          } catch {}
                          return (
                            <div key={log.id} className="p-3.5 space-y-1 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-indigo-600 dark:text-indigo-400 uppercase text-[10px]">
                                  Field: {log.field || 'Update'}
                                </span>
                                <span className="font-mono text-[10px] text-slate-400">{formattedTs}</span>
                              </div>
                              <p className="text-slate-600 dark:text-slate-300 font-mono text-[11px]">
                                <span className="line-through text-slate-400">{log.oldValue || 'null'}</span> → <strong className="text-slate-900 dark:text-white">{log.newValue || 'null'}</strong>
                              </p>
                              {(log.remarks || log.reason) && (
                                <p className="text-[10px] text-slate-400 italic">{log.remarks || log.reason}</p>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="p-8 text-center text-slate-400 text-xs font-medium">
                        No audit changes recorded for this employee profile yet.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Footer Actions */}
            <div className="p-4 bg-white dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0 shadow-lg">
              <span className="text-xs text-slate-500 font-mono">
                Employee Master • ID #{employee.id}
              </span>
              <div className="flex items-center gap-2">
                {onEdit && (
                  <button 
                    onClick={() => onEdit(employee)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-md flex items-center gap-1.5"
                  >
                    <Edit size={13} /> Edit Master Profile
                  </button>
                )}
                <button 
                  onClick={onClose}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition-all"
                >
                  Close
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function InfoCard({ label, value, mono = false, isHighlight = false }: { label: string; value: React.ReactNode; mono?: boolean; isHighlight?: boolean }) {
  return (
    <div className={cn(
      "p-3 rounded-xl border transition-all",
      isHighlight 
        ? "bg-indigo-50/40 dark:bg-indigo-950/20 border-indigo-200/70 dark:border-indigo-800/40" 
        : "bg-slate-50/60 dark:bg-slate-800/40 border-slate-200/60 dark:border-slate-800/60"
    )}>
      <span className="text-[10px] uppercase font-bold tracking-wider text-slate-400 block mb-1">{label}</span>
      <p className={cn(
        "text-xs font-bold text-slate-800 dark:text-slate-200 truncate",
        mono && "font-mono font-semibold text-slate-900 dark:text-white"
      )}>
        {value}
      </p>
    </div>
  );
}
