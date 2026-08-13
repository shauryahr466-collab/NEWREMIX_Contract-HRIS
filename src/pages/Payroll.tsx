import React, { useState, useEffect } from 'react';
import { 
  DollarSign, Calendar, Calculator, CheckCircle2, Send, Download, 
  FileSpreadsheet, FileText, Search, Building2, User, CreditCard, 
  ChevronRight, Eye, Edit2, Trash2, Printer, Sparkles, ShieldCheck,
  Building, RefreshCw, AlertCircle, ArrowUpRight, Upload, FileUp, Table, Check,
  Sliders, RotateCcw, Plus, Save, Settings as SettingsIcon
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useAppStore } from '../store';
import { saveLocalTable } from '../lib/localClient';
import { PageHeader, Card, KPICard, Button, Input, Badge } from '../components/ui';
import type { PayrollRun, PayrollRecord, DisbursementMethod, PayrollConfig, TaxSlabConfig, Employee } from '../types';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import { NEPALI_MONTHS, FY_NEPALI_MONTHS, getNepalFiscalYear, calculateTaxAndDeductions, DEFAULT_PAYROLL_CONFIG, getPayrollPeriod } from '../lib/payrollEngine';

export function Payroll() {
  const { 
    employees, 
    setEmployees,
    payrollRuns, 
    createPayrollRun, 
    recalculatePayrollRun,
    updatePayrollRecord, 
    approvePayrollRun, 
    disbursePayrollRun, 
    deletePayrollRun,
    updateEmployee,
    addEmployee,
    deleteEmployeesBatch,
    settings,
    setSettings
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<'processing' | 'disbursement' | 'tax' | 'employees' | 'setup'>('processing');

  // Setup Configuration Local State
  const [setupConfig, setSetupConfig] = useState<PayrollConfig>(() => {
    return settings.payrollConfig || DEFAULT_PAYROLL_CONFIG;
  });

  useEffect(() => {
    if (settings.payrollConfig) {
      setSetupConfig(settings.payrollConfig);
    }
  }, [settings.payrollConfig]);

  const handleSavePayrollSetup = async () => {
    try {
      await setSettings({
        ...settings,
        payrollConfig: setupConfig
      });
      toast.success('Payroll setup rules updated! Future payroll calculations will operate effective immediately.');
    } catch (err) {
      toast.error('Failed to save payroll setup settings.');
    }
  };

  const handleResetPayrollSetup = async () => {
    if (confirm('Reset all payroll setup rules and IRD tax slabs to default Nepal standards?')) {
      setSetupConfig(DEFAULT_PAYROLL_CONFIG);
      await setSettings({
        ...settings,
        payrollConfig: DEFAULT_PAYROLL_CONFIG
      });
      toast.success('Reset payroll rules to default Nepal IRD tax slabs & SSF standards.');
    }
  };
  
  // Nepali Date (Bikram Sambat) selector
  const [selectedBsYear, setSelectedBsYear] = useState<number>(2083);
  const [selectedBsMonth, setSelectedBsMonth] = useState<string>('04'); // Default Shrawan (Month 04)
  const currentFiscalYear = getNepalFiscalYear(selectedBsYear, selectedBsMonth);

  // Date Range selector for calculation window
  const [startDate, setStartDate] = useState<string>('2026-07-17');
  const [endDate, setEndDate] = useState<string>('2026-08-16');

  // Sync default AD Start & End Date based on Nepali BS Month selection
  useEffect(() => {
    const period = getPayrollPeriod(selectedBsYear, selectedBsMonth);
    setStartDate(period.startDate);
    setEndDate(period.endDate);
  }, [selectedBsYear, selectedBsMonth]);

  // Date selector for new run creation
  const now = new Date();
  const defaultMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const [selectedMonth, setSelectedMonth] = useState<string>(defaultMonthStr);
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  
  // Search & Filter for Payroll Runs
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedDept, setSelectedDept] = useState('All');
  
  // Employee Pay Setup Tab States
  const [empPaySearch, setEmpPaySearch] = useState('');
  const [empPayDept, setEmpPayDept] = useState('All');
  const [selectedPayEmpIds, setSelectedPayEmpIds] = useState<string[]>([]);
  const [deletingPayEmp, setDeletingPayEmp] = useState<Employee | null>(null);
  const [isBulkDeletePayOpen, setIsBulkDeletePayOpen] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState({ active: false, current: 0, total: 0, percent: 0 });
  

  // Modal States
  const [runToDelete, setRunToDelete] = useState<PayrollRun | null>(null);
  const [activePayslipRecord, setActivePayslipRecord] = useState<PayrollRecord | null>(null);
  const [editingRecord, setEditingRecord] = useState<{ runId: string; record: PayrollRecord } | null>(null);
  const [editingEmployeeSalary, setEditingEmployeeSalary] = useState<any | null>(null);
  const [disbursementMethod, setDisbursementMethod] = useState<DisbursementMethod>('Bank Transfer');
  const [isProcessingRun, setIsProcessingRun] = useState(false);

  // Excel Import States
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importPreviewData, setImportPreviewData] = useState<any[]>([]);
  const [isApplyingImport, setIsApplyingImport] = useState(false);

  // Get active run or default to most recent run
  const currentRun = payrollRuns.find(r => r.id === selectedRunId) || payrollRuns[0] || null;

  // Filter records in current run
  const filteredRecords = currentRun?.records.filter(rec => {
    const matchesSearch = rec.employeeName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          rec.employeeId.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          (rec.panNumber && rec.panNumber.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesDept = selectedDept === 'All' || rec.department === selectedDept;
    return matchesSearch && matchesDept;
  }) || [];

  const departments = ['All', ...Array.from(new Set(employees.map(e => e.department).filter(Boolean)))];

  // Employee Pay Setup filtering & selection logic
  const filteredPayEmployees = employees.filter(emp => {
    const matchesSearch = emp.name.toLowerCase().includes(empPaySearch.toLowerCase()) ||
                          emp.id.toLowerCase().includes(empPaySearch.toLowerCase()) ||
                          (emp.panNumber && emp.panNumber.toLowerCase().includes(empPaySearch.toLowerCase())) ||
                          (emp.bankName && emp.bankName.toLowerCase().includes(empPaySearch.toLowerCase()));
    const matchesDept = empPayDept === 'All' || emp.department === empPayDept;
    return matchesSearch && matchesDept;
  });

  const isAllPayEmpSelected = filteredPayEmployees.length > 0 && filteredPayEmployees.every(e => selectedPayEmpIds.includes(e.id));

  const toggleSelectAllPayEmp = () => {
    if (isAllPayEmpSelected) {
      setSelectedPayEmpIds([]);
    } else {
      setSelectedPayEmpIds(filteredPayEmployees.map(e => e.id));
    }
  };

  const toggleSelectPayEmp = (id: string) => {
    setSelectedPayEmpIds(prev => 
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  };

  const handleConfirmDeletePayEmp = async () => {
    if (!deletingPayEmp) return;
    try {
      await deleteEmployeesBatch([deletingPayEmp.id]);
      toast.success(`Deleted employee ${deletingPayEmp.name} (ID: ${deletingPayEmp.id}) from local SQLite database!`);
      setSelectedPayEmpIds(prev => prev.filter(id => id !== deletingPayEmp.id));
      setDeletingPayEmp(null);
    } catch (err: any) {
      toast.error(`Failed to delete employee: ${err.message}`);
    }
  };

  const handleConfirmBulkDeletePayEmp = async () => {
    if (selectedPayEmpIds.length === 0) return;
    const count = selectedPayEmpIds.length;
    setDeleteProgress({ active: true, current: 0, total: count, percent: 0 });
    try {
      const batchSize = 30;
      for (let i = 0; i < selectedPayEmpIds.length; i += batchSize) {
        const batch = selectedPayEmpIds.slice(i, i + batchSize);
        await deleteEmployeesBatch(batch);
        const currentCount = Math.min(i + batchSize, count);
        const pct = Math.round((currentCount / count) * 100);
        setDeleteProgress({ active: true, current: currentCount, total: count, percent: pct });
        await new Promise(r => setTimeout(r, 10));
      }
      toast.success(`Deleted ${count} employee pay setup records from local SQLite database!`);
      setSelectedPayEmpIds([]);
      setIsBulkDeletePayOpen(false);
    } catch (err: any) {
      toast.error(`Failed to delete selected employees: ${err.message}`);
    } finally {
      setDeleteProgress({ active: false, current: 0, total: 0, percent: 0 });
    }
  };

  const handleConfirmDeleteRun = async () => {
    if (!runToDelete) return;
    try {
      const runId = runToDelete.id;
      const monthName = runToDelete.monthName;
      await deletePayrollRun(runId);
      if (selectedRunId === runId) {
        setSelectedRunId(null);
      }
      toast.success(`Permanently deleted draft payroll run for ${monthName}!`);
      setRunToDelete(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete payroll run');
    }
  };

  // Aggregated YTD KPIs (Only counts finalized/disbursed or approved runs)
  const disbursedRuns = payrollRuns.filter(r => r.status === 'Disbursed' || r.status === 'Approved');
  const totalYTDNet = disbursedRuns.reduce((sum, r) => sum + r.totalNetSalary, 0);
  const totalYTDGross = disbursedRuns.reduce((sum, r) => sum + r.totalGrossSalary, 0);
  const totalYTDTax = disbursedRuns.reduce((sum, r) => sum + r.totalTaxTDS, 0);
  const totalYTDSocial = disbursedRuns.reduce((sum, r) => sum + r.totalSocialSecurity, 0);

  // Handle Calculate Payroll (BS Month date system)
  const handleGeneratePayroll = async () => {
    setIsProcessingRun(true);
    try {
      const monthObj = NEPALI_MONTHS.find(m => m.id === selectedBsMonth) || NEPALI_MONTHS[3];
      const monthKey = `BS-${selectedBsYear}-${selectedBsMonth}`;
      const bsDetails = { bsYear: selectedBsYear, monthObj };
      const newRun = await createPayrollRun(monthKey, bsDetails, { startDate, endDate });
      setSelectedRunId(newRun.id);
      toast.success(`Payroll run generated for ${newRun.monthName} (${startDate} to ${endDate})!`);
    } catch (e: any) {
      toast.error(e.message || 'Failed to generate payroll');
    } finally {
      setIsProcessingRun(false);
    }
  };

  const handleRecalculateRun = async (runId: string) => {
    try {
      setIsProcessingRun(true);
      const updated = await recalculatePayrollRun(runId);
      if (updated) {
        toast.success(`Payroll recalculated with latest reconciled attendance & tax rules for ${updated.monthName}!`);
      } else {
        toast.error('Unable to find payroll run to recalculate.');
      }
    } catch (err: any) {
      toast.error(err.message || 'Failed to recalculate payroll run');
    } finally {
      setIsProcessingRun(false);
    }
  };

  // Download Sample Excel Template for Importing Employee Pay Details
  const handleDownloadPayTemplate = () => {
    const templateRows = [
      {
        'Employee ID / Bio ID': 1256,
        'Employee Name': 'Ram Sharma',
        'Basic Salary (NPR)': 55000,
        'Allowances (NPR)': 15000,
        'Marital Status (Single/Married)': 'Married',
        'SSF Enrolled (Yes/No)': 'Yes',
        'PAN Number': '109283741',
        'Bank Name': 'Nabil Bank',
        'Account Number': '0192837465012'
      },
      {
        'Employee ID / Bio ID': 2,
        'Employee Name': 'Sita Devi',
        'Basic Salary (NPR)': 48000,
        'Allowances (NPR)': 12000,
        'Marital Status (Single/Married)': 'Single',
        'SSF Enrolled (Yes/No)': 'Yes',
        'PAN Number': '108273642',
        'Bank Name': 'Global IME Bank',
        'Account Number': '0203948576101'
      },
      {
        'Employee ID / Bio ID': 45,
        'Employee Name': 'Hari Prasad',
        'Basic Salary (NPR)': 60000,
        'Allowances (NPR)': 16000,
        'Marital Status (Single/Married)': 'Single',
        'SSF Enrolled (Yes/No)': 'No',
        'PAN Number': '107382910',
        'Bank Name': 'NIC Asia Bank',
        'Account Number': '0304958671203'
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employee Pay Details');
    XLSX.writeFile(wb, 'Nepal_Payroll_Employee_Pay_Details_Template.xlsx');
    toast.success('Excel pay details import template downloaded!');
  };

  // Upload and Parse Excel File
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const wsname = wb.SheetNames[0];
        const ws = wb.Sheets[wsname];
        const data = XLSX.utils.sheet_to_json(ws);

        if (!data || data.length === 0) {
          toast.error('The uploaded Excel file appears to be empty.');
          return;
        }

        const parsed = data.map((row: any, idx: number) => {
          // Dynamic case-insensitive key extractor
          const getValue = (keys: string[]) => {
            for (const k of keys) {
              const matchedKey = Object.keys(row).find(rk => rk.trim().toLowerCase() === k.toLowerCase());
              if (matchedKey && row[matchedKey] !== undefined && row[matchedKey] !== null && row[matchedKey] !== '') {
                return row[matchedKey];
              }
            }
            return null;
          };

          const rawEmpId = getValue(['Employee ID', 'Emp ID', 'ID', 'Emp Code', 'Employee Code', 'EmpNo', 'Code', 'Emp_ID', 'S.No']) || `EMP-${idx + 1}`;
          const rawName = getValue(['Employee Name', 'Name', 'Full Name', 'Emp Name', 'Staff Name', 'Employee']) || `Employee ${idx + 1}`;
          const rawBasic = getValue(['Basic Salary (NPR)', 'Basic Salary', 'Basic', 'Basic Pay', 'Base Salary', 'Salary']);
          const rawAllowances = getValue(['Allowances (NPR)', 'Allowances', 'Allowance', 'Other Allowances', 'Allow']);
          const rawMarital = getValue(['Marital Status (Single/Married)', 'Marital Status', 'Marital', 'MaritalStatus', 'Status (Marital)', 'Marital_Status']);
          const rawSSF = getValue(['SSF Enrolled (Yes/No)', 'SSF Enrolled', 'SSF', 'SSF Status', 'Social Security', 'SSF_Enrolled']);
          const rawPan = getValue(['PAN Number', 'PAN', 'Pan No', 'Tax ID', 'PAN ID', 'Pan_Number']);
          const rawBank = getValue(['Bank Name', 'Bank', 'Bank Details', 'Bank_Name']);
          const rawAcc = getValue(['Account Number', 'Account', 'Acc No', 'Account No', 'Bank Account', 'Account_Number']);
          const rawDept = getValue(['Department', 'Dept', 'Division']);
          const rawDesig = getValue(['Designation', 'Role', 'Position', 'Title']);

          const empIdStr = rawEmpId.toString().trim();
          const nameStr = rawName.toString().trim();
          const basic = parseFloat(rawBasic) || 45000;
          const allowances = parseFloat(rawAllowances) || 10000;

          const maritalStr = (rawMarital || 'Single').toString().trim().toLowerCase();
          const maritalStatus: 'Single' | 'Married' = maritalStr.includes('mar') ? 'Married' : 'Single';

          const ssfStr = (rawSSF || 'Yes').toString().trim().toLowerCase();
          const ssfEnrolled = !ssfStr.includes('no') && !ssfStr.includes('false') && ssfStr !== '0';

          const pan = rawPan ? rawPan.toString().trim() : `10${Math.floor(1000000 + Math.random() * 9000000)}`;
          const bank = rawBank ? rawBank.toString().trim() : 'Nabil Bank';
          const acc = rawAcc ? rawAcc.toString().trim() : `ACC-${Math.floor(10000000 + Math.random() * 90000000)}`;

          // Find match in current employee list
          const matchedEmp = employees.find(emp => 
            emp.id.trim().toLowerCase() === empIdStr.toLowerCase() ||
            emp.id.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() === empIdStr.replace(/[^a-zA-Z0-9]/g, '').toLowerCase() ||
            emp.name.trim().toLowerCase() === nameStr.toLowerCase() ||
            emp.name.toLowerCase().includes(nameStr.toLowerCase()) ||
            nameStr.toLowerCase().includes(emp.name.toLowerCase())
          );

          return {
            rowId: idx,
            empId: matchedEmp ? matchedEmp.id : empIdStr,
            matchedEmpId: matchedEmp?.id,
            name: matchedEmp ? matchedEmp.name : nameStr,
            basicSalary: basic,
            allowances,
            maritalStatus,
            ssfEnrolled,
            panNumber: pan,
            bankName: bank,
            accountNumber: acc,
            department: rawDept ? rawDept.toString().trim() : matchedEmp?.department,
            designation: rawDesig ? rawDesig.toString().trim() : matchedEmp?.designation,
            isMatched: !!matchedEmp
          };
        });

        setImportPreviewData(parsed);
        toast.success(`Parsed ${parsed.length} employee pay detail records from Excel!`);
      } catch (err: any) {
        toast.error(`Error parsing Excel file: ${err.message}`);
      }
    };
    reader.readAsBinaryString(file);
  };

  // Apply imported pay details and persist directly to local SQLite database
  const handleApplyImportedPayDetails = async () => {
    if (importPreviewData.length === 0) return;
    setIsApplyingImport(true);

    try {
      let updatedCount = 0;
      let createdCount = 0;

      // Copy current employees array
      const updatedEmployeesList = [...employees];

      for (const item of importPreviewData) {
        const existingIdx = updatedEmployeesList.findIndex(e => 
          (item.matchedEmpId && e.id === item.matchedEmpId) ||
          e.id.trim().toLowerCase() === item.empId.trim().toLowerCase() ||
          e.name.trim().toLowerCase() === item.name.trim().toLowerCase()
        );

        if (existingIdx >= 0) {
          const target = updatedEmployeesList[existingIdx];
          updatedEmployeesList[existingIdx] = {
            ...target,
            basicSalary: item.basicSalary,
            allowances: item.allowances,
            maritalStatus: item.maritalStatus,
            ssfEnrolled: item.ssfEnrolled,
            panNumber: item.panNumber || target.panNumber,
            bankName: item.bankName || target.bankName,
            accountNumber: item.accountNumber || target.accountNumber,
            department: item.department || target.department,
            designation: item.designation || target.designation
          };
          updatedCount++;
        } else {
          const newEmp: Employee = {
            id: item.empId || `EMP-${Date.now().toString().slice(-4)}`,
            name: item.name,
            department: item.department || 'General',
            designation: item.designation || 'Staff',
            joiningDate: new Date().toISOString().split('T')[0],
            status: 'Active',
            basicSalary: item.basicSalary,
            allowances: item.allowances,
            maritalStatus: item.maritalStatus,
            ssfEnrolled: item.ssfEnrolled,
            panNumber: item.panNumber || `10${Math.floor(1000000 + Math.random() * 9000000)}`,
            bankName: item.bankName || 'Nabil Bank',
            accountNumber: item.accountNumber || `ACC-${Math.floor(10000000 + Math.random() * 90000000)}`
          };
          updatedEmployeesList.push(newEmp);
          createdCount++;
        }
      }

      // Update in-memory state in Zustand store
      await setEmployees(updatedEmployeesList);

      // Persist directly into local SQLite database via saveLocalTable
      const savedToSqlite = await saveLocalTable('employees', updatedEmployeesList);

      if (savedToSqlite) {
        toast.success(
          `Successfully imported and saved pay details to local SQLite! (${updatedCount} updated, ${createdCount} new created)`
        );
      } else {
        toast.success(`Imported pay details for ${importPreviewData.length} employees into workspace!`);
      }

      setIsImportModalOpen(false);
      setImportPreviewData([]);
    } catch (err: any) {
      toast.error(`Import failed: ${err.message}`);
    } finally {
      setIsApplyingImport(false);
    }
  };

  // Handle Approve Run
  const handleApprove = async (runId: string) => {
    try {
      await approvePayrollRun(runId);
      toast.success('Payroll run approved and locked for disbursement!');
    } catch (e: any) {
      toast.error(e.message || 'Approval failed');
    }
  };

  // Handle Disburse
  const handleDisburse = async (runId: string) => {
    try {
      await disbursePayrollRun(runId, disbursementMethod);
      toast.success(`Salaries disbursed successfully via ${disbursementMethod}! Transaction refs generated.`);
    } catch (e: any) {
      toast.error(e.message || 'Disbursement failed');
    }
  };

  // Handle Export Bank Transfer CSV / Excel
  const handleExportBankFile = (run: PayrollRun) => {
    const exportData = run.records.map((r, i) => ({
      'S.No': i + 1,
      'Employee ID': r.employeeId,
      'Employee Name': r.employeeName,
      'Bank Name': r.bankName || 'Nabil Bank',
      'Account Number': r.accountNumber || 'ACC-001',
      'Bank SWIFT/Branch Code': r.ifscCode || 'NABLNPKA',
      'Net Salary Payable (NPR)': r.netSalary,
      'Disbursement Status': r.disbursementStatus,
      'Transaction Ref': r.transactionRef || 'Pending',
      'PAN Number': r.panNumber || 'N/A'
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Nepal Bank Transfer File');
    XLSX.writeFile(wb, `${settings?.companyName || 'Company'}_Nepal_Bank_Disbursement_${run.month}.xlsx`);
    toast.success('Nepal Bank Transfer Direct Deposit file downloaded!');
  };

  // Handle Export Tax TDS Report
  const handleExportTaxReport = (run: PayrollRun) => {
    const exportData = (run.records || []).map((r, i) => ({
      'S.No': i + 1,
      'Employee ID': r.employeeId,
      'Employee Name': r.employeeName,
      'PAN Number': r.panNumber || 'N/A',
      'Gross Salary (NPR)': r.grossSalary,
      'Taxable Income (NPR)': r.taxableIncome,
      'Nepal IRD Tax (TDS) Withheld (NPR)': r.incomeTaxTDS,
      'Social Security Fund (SSF 11%) (NPR)': r.socialSecurity,
      'Health Insurance (NPR)': r.healthInsurance,
      'Total Deductions (NPR)': r.totalDeductions,
      'Net Salary Paid (NPR)': r.netSalary
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Nepal IRD Tax & SSF Report');
    XLSX.writeFile(wb, `${settings?.companyName || 'Company'}_Nepal_IRD_TDS_Report_${run.month}.xlsx`);
    toast.success('Nepal IRD Tax TDS & SSF Statutory Report downloaded!');
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageHeader 
        title="Nepal Payroll & Disbursement System"
        description="End-to-end Nepalese salary processing, progressive tax (TDS) calculations under Nepal IRD slabs, statutory Social Security Fund (SSF), and batch bank disbursements."
        icon={DollarSign}
        actions={
          <div className="flex items-center gap-3 flex-wrap">
            {/* Bikram Sambat (BS) Nepali Month & Fiscal Year Selector */}
            <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 shadow-sm">
              <Calendar size={15} className="text-indigo-600 dark:text-indigo-400" />
              <div className="flex items-center gap-1.5">
                <select
                  value={selectedBsYear}
                  onChange={(e) => setSelectedBsYear(parseInt(e.target.value, 10))}
                  className="bg-transparent text-xs font-black text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
                >
                  <option value={2084}>BS 2084</option>
                  <option value={2083}>BS 2083</option>
                  <option value={2082}>BS 2082</option>
                  <option value={2081}>BS 2081</option>
                  <option value={2080}>BS 2080</option>
                </select>
                <span className="text-slate-300 dark:text-slate-700">/</span>
                <select
                  value={selectedBsMonth}
                  onChange={(e) => setSelectedBsMonth(e.target.value)}
                  className="bg-transparent text-xs font-black text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
                >
                  {FY_NEPALI_MONTHS.map(m => (
                    <option key={m.id} value={m.id}>
                      {m.fyLabel}: {m.en} ({m.np})
                    </option>
                  ))}
                </select>
              </div>
              <Badge 
                variant={selectedBsMonth === '04' ? "success" : "info"} 
                className="text-[10px] font-black uppercase px-2 py-0.5 flex items-center gap-1"
              >
                {selectedBsMonth === '04' && <Sparkles size={11} className="text-emerald-300" />}
                {currentFiscalYear} (M{FY_NEPALI_MONTHS.find(m => m.id === selectedBsMonth)?.fyMonth})
              </Badge>
            </div>

            {/* Attendance Calculation Date Range Selector */}
            <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-1.5 shadow-sm">
              <span className="text-[10px] uppercase font-black tracking-wider text-slate-400">Date Range:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
                title="Start Date"
              />
              <span className="text-slate-400 text-xs font-bold">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-800 dark:text-slate-100 focus:outline-none cursor-pointer"
                title="End Date"
              />
            </div>

            {/* Import Pay Details via Excel Button */}
            <Button
              variant="outline"
              onClick={() => setIsImportModalOpen(true)}
              className="gap-2 border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200"
            >
              <FileUp size={16} className="text-emerald-600 dark:text-emerald-400" />
              Import Pay Details (Excel)
            </Button>

            {/* Generate Payroll Run Button */}
            <Button 
              onClick={handleGeneratePayroll}
              disabled={isProcessingRun}
              className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-500/20"
            >
              <Calculator size={16} className={isProcessingRun ? "animate-spin" : ""} />
              {isProcessingRun ? 'Calculating...' : 'Run Nepal Payroll Calculation'}
            </Button>
          </div>
        }
      />

      {/* Top KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard 
          label="YTD Total Disbursed Net"
          value={`Rs. ${totalYTDNet.toLocaleString()}`}
          trendValue={`${payrollRuns.filter(r => r.status === 'Disbursed').length} Disbursed Runs`}
          icon={DollarSign}
        />
        <KPICard 
          label="YTD Total Gross Salary"
          value={`Rs. ${totalYTDGross.toLocaleString()}`}
          trendValue={`Across ${employees.length} active employees`}
          icon={Building2}
        />
        <KPICard 
          label="YTD Tax Withheld (Nepal TDS)"
          value={`Rs. ${totalYTDTax.toLocaleString()}`}
          trendValue="Progressive IRD income tax withholdings"
          icon={ShieldCheck}
        />
        <KPICard 
          label="YTD Social Security (SSF)"
          value={`Rs. ${totalYTDSocial.toLocaleString()}`}
          trendValue="11% statutory pension & SSF contribution"
          icon={CreditCard}
        />
      </div>

      {/* Main Tabs Navigation */}
      <div className="border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-4 flex-wrap pb-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('processing')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'processing' 
                ? 'bg-indigo-600 text-white shadow-sm' 
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Calculator size={15} />
            Payroll Processing ({payrollRuns.length})
          </button>
          <button
            onClick={() => setActiveTab('disbursement')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'disbursement' 
                ? 'bg-indigo-600 text-white shadow-sm' 
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Send size={15} />
            Disbursement Center
          </button>
          <button
            onClick={() => setActiveTab('tax')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'tax' 
                ? 'bg-indigo-600 text-white shadow-sm' 
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <ShieldCheck size={15} />
            Tax & Statutory Compliance
          </button>
          <button
            onClick={() => setActiveTab('employees')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'employees' 
                ? 'bg-indigo-600 text-white shadow-sm' 
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <User size={15} />
            Employee Pay Setup
          </button>
          <button
            onClick={() => setActiveTab('setup')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
              activeTab === 'setup' 
                ? 'bg-indigo-600 text-white shadow-sm' 
                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Sliders size={15} />
            Payroll Setup & Rules
          </button>
        </div>

        {currentRun && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Selected Batch:</span>
            <select
              value={currentRun.id}
              onChange={(e) => setSelectedRunId(e.target.value)}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-xs font-bold px-3 py-1.5 focus:ring-2 focus:ring-indigo-500/20"
            >
              {payrollRuns.map(run => (
                <option key={run.id} value={run.id}>
                  {run.monthName} ({run.status}) - Rs. {run.totalNetSalary.toLocaleString()}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* TAB 1: PAYROLL PROCESSING */}
      {activeTab === 'processing' && (
        <div className="space-y-6">
          {!currentRun ? (
            <Card className="p-12 text-center space-y-4">
              <div className="w-16 h-16 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 rounded-full flex items-center justify-center mx-auto">
                <Calculator size={32} />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">No Nepal Payroll Runs Generated Yet</h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto mt-1">
                  Select a target month above and click "Run Nepal Payroll Calculation" to calculate pro-rated salaries, overtime pay, Nepal IRD tax (TDS) withholdings, and SSF contributions.
                </p>
              </div>
              <Button onClick={handleGeneratePayroll} className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white mx-auto">
                <Sparkles size={16} />
                Calculate {selectedMonth} Nepal Payroll
              </Button>
            </Card>
          ) : (
            <>
              {/* Batch Overview Header */}
              <Card className="p-5 bg-white dark:bg-slate-900 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-black tracking-tight">{currentRun.monthName} Nepal Payroll Batch</h2>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                        currentRun.status === 'Disbursed' ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800' :
                        currentRun.status === 'Approved' ? 'bg-indigo-100 dark:bg-indigo-950/80 text-indigo-800 dark:text-indigo-300 border border-indigo-300 dark:border-indigo-800' :
                        'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-300 dark:border-amber-800'
                      }`}>
                        {currentRun.status}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2 flex-wrap">
                      <span>Created on {new Date(currentRun.createdAt).toLocaleDateString()} by {currentRun.createdBy}</span>
                      <span>•</span>
                      <span>{currentRun.totalEmployees} Employees Processed</span>
                      {currentRun.startDate && currentRun.endDate && (
                        <>
                          <span>•</span>
                          <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                            Range: {currentRun.startDate} to {currentRun.endDate}
                          </span>
                        </>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-3 flex-wrap">
                    {currentRun.status === 'Draft' && (
                      <>
                        <Button 
                          onClick={() => handleRecalculateRun(currentRun.id)}
                          disabled={isProcessingRun}
                          variant="outline"
                          className="gap-2 text-xs font-bold border-indigo-200 dark:border-indigo-800 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 dark:hover:bg-indigo-900 text-indigo-700 dark:text-indigo-300"
                        >
                          <RotateCcw size={14} className={isProcessingRun ? 'animate-spin' : ''} />
                          {isProcessingRun ? 'Recalculating...' : 'Recalculate Batch'}
                        </Button>
                        <Button 
                          onClick={() => handleApprove(currentRun.id)}
                          className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-sm"
                        >
                          <CheckCircle2 size={14} />
                          Approve & Lock Run
                        </Button>
                      </>
        

                    )}
                    {currentRun.status === 'Approved' && (
                      <Button 
                        onClick={() => {
                          setSelectedRunId(currentRun.id);
                          setActiveTab('disbursement');
                        }}
                        className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm"
                      >
                        <Send size={14} />
                        Go to Disbursement Center
                      </Button>
                    )}
                    <Button variant="outline" onClick={() => handleExportBankFile(currentRun)}
                      className="gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <FileSpreadsheet size={14} />
                      Nepal Bank Transfer CSV
                    </Button>

                    <Button 
                      variant="outline"
                      onClick={() => handleExportTaxReport(currentRun)}
                      className="gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      <FileText size={14} />
                      Nepal IRD TDS Report
                    </Button>

                    {currentRun.status === 'Draft' && (
                      <button 
                        onClick={() => setRunToDelete(currentRun)}
                        className="p-2 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors"
                        title="Delete Draft Payroll Run"
                      >
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Batch Metrics Grid */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mt-6 pt-5 border-t border-slate-200 dark:border-slate-800 text-center">
                  <div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-black tracking-widest">Total Gross</p>
                    <p className="text-base font-black text-slate-900 dark:text-white mt-0.5">Rs. {currentRun.totalGrossSalary.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-black tracking-widest">Tax (TDS) Withheld</p>
                    <p className="text-base font-black text-amber-600 dark:text-amber-400 mt-0.5">Rs. {currentRun.totalTaxTDS.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-black tracking-widest">Social Security (SSF)</p>
                    <p className="text-base font-black text-sky-600 dark:text-sky-400 mt-0.5">Rs. {currentRun.totalSocialSecurity.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-black tracking-widest">Total Deductions</p>
                    <p className="text-base font-black text-rose-600 dark:text-rose-400 mt-0.5">Rs. {currentRun.totalDeductions.toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400 uppercase font-black tracking-widest">Total Net Disbursable</p>
                    <p className="text-base font-black text-emerald-600 dark:text-emerald-400 mt-0.5">Rs. {currentRun.totalNetSalary.toLocaleString()}</p>
                  </div>
                </div>
              </Card>

              {/* Search & Filter Controls */}
              <div className="flex items-center justify-between gap-4 flex-wrap">
                <div className="flex items-center gap-3 flex-1 min-w-[280px]">
                  <div className="relative flex-1">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input 
                      type="text" 
                      placeholder="Search employee, ID or PAN..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                    />
                  </div>

                  <select
                    value={selectedDept}
                    onChange={(e) => setSelectedDept(e.target.value)}
                    className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold px-3 py-2 focus:ring-2 focus:ring-indigo-500/20"
                  >
                    {departments.map(d => <option key={d} value={d}>{d}</option>)}
                  </select>
                </div>
              </div>

              {/* Detailed Payroll Itemized Table */}
              <Card className="overflow-hidden border border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="overflow-x-auto custom-scrollbar">
                  <table className="w-full text-left border-collapse min-w-[1000px]">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-slate-900/80 text-[10px] uppercase font-black text-slate-400 tracking-wider border-b border-slate-200 dark:border-slate-800">
                        <th className="py-3 px-4">Employee</th>
                        <th className="py-3 px-4">Department</th>
                        <th className="py-3.5 px-4 text-center">Payable Days</th>
                        <th className="py-3.5 px-4 text-right">Earned Basic</th>
                        <th className="py-3.5 px-4 text-right">Allowances</th>
                        <th className="py-3.5 px-4 text-right">OT Pay</th>
                        <th className="py-3.5 px-4 text-right">Gross Pay</th>
                        <th className="py-3.5 px-4 text-right">Tax (TDS)</th>
                        <th className="py-3.5 px-4 text-right">SSF (11%)</th>
                        <th className="py-3.5 px-4 text-right font-black text-slate-900 dark:text-white">Net Pay</th>
                        <th className="py-3.5 px-4 text-center">Status</th>
                        <th className="py-3.5 px-4 text-center">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                      {filteredRecords.map((rec) => (
                        <tr key={rec.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="py-3 px-4">
                            <div className="font-bold text-slate-900 dark:text-white">{rec.employeeName}</div>
                            <div className="text-[10px] text-slate-400 font-mono">ID: {rec.employeeId} • PAN: {rec.panNumber || 'N/A'}</div>
                          </td>
                          <td className="py-3 px-4">
                            <span className="inline-block px-2 py-0.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded text-[10px] font-bold">
                              {rec.department}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center font-bold">
                            {rec.payableDays} / {rec.totalDaysInMonth}
                            {rec.overtimeHours > 0 && (
                              <span className="block text-[9px] text-indigo-500 font-semibold">+{rec.overtimeHours} hrs OT</span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-medium">Rs. {rec.earnedBasicSalary.toLocaleString()}</td>
                          <td className="py-3 px-4 text-right font-medium">Rs. {rec.earnedAllowances.toLocaleString()}</td>
                          <td className="py-3 px-4 text-right font-medium text-indigo-600 dark:text-indigo-400">
                            +Rs. {rec.overtimePay.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-white">
                            Rs. {rec.grossSalary.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right font-medium text-amber-600 dark:text-amber-400">
                            -Rs. {rec.incomeTaxTDS.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right font-medium text-sky-600 dark:text-sky-400">
                            -Rs. {rec.socialSecurity.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-right font-black text-emerald-600 dark:text-emerald-400 text-sm">
                            Rs. {rec.netSalary.toLocaleString()}
                          </td>
                          <td className="py-3 px-4 text-center">
                            <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                              rec.disbursementStatus === 'Disbursed' ? 'bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300' :
                              'bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300'
                            }`}>
                              {rec.disbursementStatus}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                onClick={() => setActivePayslipRecord(rec)}
                                className="p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950 rounded-lg transition-colors"
                                title="View Payslip"
                              >
                                <Eye size={14} />
                              </button>
                              {currentRun.status === 'Draft' && (
                                <button
                                  onClick={() => setEditingRecord({ runId: currentRun.id, record: rec })}
                                  className="p-1.5 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                                  title="Edit Adjustment"
                                >
                                  <Edit2 size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            </>
          )}
        </div>
      )}

      {/* TAB 2: DISBURSEMENT CENTER */}
      {activeTab === 'disbursement' && (
        <div className="space-y-6">
          <Card className="p-6 space-y-6">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4 flex-wrap gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <Send className="text-indigo-600" size={18} />
                  Salaries Batch Direct Deposit & Disbursement Engine
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Execute batch bank transfers, generate automated payment transaction IDs, and produce bank-formatted direct deposit files.
                </p>
              </div>

              <div className="flex items-center gap-3 flex-wrap">
                {payrollRuns.length > 0 && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-500">Run:</span>
                    <select
                      value={selectedRunId || currentRun?.id || ''}
                      onChange={(e) => setSelectedRunId(e.target.value)}
                      className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold px-3 py-1.5 focus:ring-2 focus:ring-indigo-500/20"
                    >
                      {payrollRuns.map(run => (
                        <option key={run.id} value={run.id}>
                          {run.monthName} ({run.status}) - Rs. {run.totalNetSalary.toLocaleString()}
                        </option>
                      ))}
                    </select>
                  </div>
    
                )}

                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-500">Channel:</span>
                  <select
                    value={disbursementMethod}
                    onChange={(e) => setDisbursementMethod(e.target.value as DisbursementMethod)}
                    className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold px-3 py-1.5 focus:ring-2 focus:ring-indigo-500/20"
                  >
                    <option value="Bank Transfer">Bank Direct Deposit / ACH</option>
                    <option value="Cheque">Corporate Cheque</option>
                    <option value="Cash">Cash Pay Slip</option>
                  </select>
                </div>

                {currentRun && (
                  <Button 
                    variant="outline"
                    onClick={() => setActiveTab('processing')}
                    className="gap-1.5 text-xs font-bold text-indigo-600 border-indigo-200 dark:border-indigo-900 hover:bg-indigo-50 dark:hover:bg-indigo-950"
                  >
                    <Eye size={14} />
                    View Details in Tab 1
                  </Button>
    
                )}
              </div>
            </div>

            {currentRun ? (
              <>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="p-5 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-slate-500 uppercase">Target Batch</span>
                      <Badge variant={currentRun.status === 'Disbursed' ? 'success' : currentRun.status === 'Approved' ? 'info' : 'warning'}>
                        {currentRun.status}
                      </Badge>
                    </div>
                    <p className="text-xl font-black text-slate-900 dark:text-white">{currentRun.monthName}</p>
                    <p className="text-xs text-slate-500">{currentRun.totalEmployees} Employee Records</p>
                  </div>

                  <div className="p-5 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                    <span className="text-xs font-bold text-slate-500 uppercase">Total Net Disbursement</span>
                    <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">Rs. {currentRun.totalNetSalary.toLocaleString()}</p>
                    <p className="text-xs text-slate-500">Channel: {disbursementMethod}</p>
                  </div>

                  <div className="p-5 bg-indigo-50 dark:bg-indigo-950/40 rounded-2xl border border-indigo-100 dark:border-indigo-900 flex flex-col justify-between space-y-4">
                    <div>
                      <p className="text-xs font-bold text-indigo-900 dark:text-indigo-300">Execute Disbursement Action</p>
                      <p className="text-[11px] text-indigo-700 dark:text-indigo-400 mt-0.5">
                        {currentRun.status === 'Disbursed' 
                          ? `Disbursed on ${currentRun.disbursedAt ? new Date(currentRun.disbursedAt).toLocaleDateString() : 'Today'} by ${currentRun.disbursedBy || 'HR Admin'}` 
                          : currentRun.status === 'Approved'
                          ? 'Ready for instant automated bank payout execution.'
                          : 'Approval required before executing final payout.'}
                      </p>
                    </div>

                    {currentRun.status === 'Approved' ? (
                      <Button onClick={() => handleDisburse(currentRun.id)} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white gap-2 font-bold shadow-lg">
                        <Send size={16} />
                        Disburse Rs. {currentRun.totalNetSalary.toLocaleString()}
                      </Button>
                    ) : currentRun.status === 'Draft' ? (
                      <Button onClick={() => handleApprove(currentRun.id)} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white gap-2 font-bold">
                        <CheckCircle2 size={16} />
                        Approve Batch First
                      </Button>
                    ) : (
                      <Button variant="outline" onClick={() => handleExportBankFile(currentRun)} className="w-full gap-2 font-bold">
                        <Download size={16} />
                        Re-download Bank Transfer File
                      </Button>
        
                    )}
                  </div>
                </div>

                {/* Employee Disbursement Schedule Table */}
                <div className="pt-4 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                      Employee Disbursement Pay Schedule ({currentRun.records.length} Employees)
                    </h4>
                    <Button 
                      variant="outline" 
                      onClick={() => handleExportBankFile(currentRun)}
                      className="gap-1.5 text-xs text-slate-700 dark:text-slate-300"
                    >
                      <FileSpreadsheet size={14} />
                      Export Bank File
                    </Button>
                  </div>

                  <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl">
                    <table className="w-full text-left text-xs divide-y divide-slate-100 dark:divide-slate-800">
                      <thead className="bg-slate-50 dark:bg-slate-900 font-bold text-slate-500 text-[10px] uppercase">
                        <tr>
                          <th className="py-2.5 px-3">Employee</th>
                          <th className="py-2.5 px-3">Bank Details</th>
                          <th className="py-2.5 px-3 text-right">Payable Days</th>
                          <th className="py-2.5 px-3 text-right">Gross Salary</th>
                          <th className="py-2.5 px-3 text-right">Tax TDS</th>
                          <th className="py-2.5 px-3 text-right">Net Payable</th>
                          <th className="py-2.5 px-3 text-center">Status</th>
                          <th className="py-2.5 px-3">Transaction Ref</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {currentRun.records.map((rec) => (
                          <tr key={rec.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                            <td className="py-2.5 px-3">
                              <p className="font-bold text-slate-900 dark:text-white">{rec.employeeName}</p>
                              <p className="text-[10px] font-mono text-slate-400">{rec.employeeId} • {rec.department}</p>
                            </td>
                            <td className="py-2.5 px-3">
                              <p className="font-semibold text-slate-800 dark:text-slate-200">{rec.bankName || 'Nabil Bank'}</p>
                              <p className="text-[10px] font-mono text-slate-400">{rec.accountNumber || 'ACC-001'}</p>
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-700 dark:text-slate-300">
                              {rec.payableDays} days
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900 dark:text-white">
                              Rs. {rec.grossSalary.toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono text-amber-600 dark:text-amber-400">
                              Rs. {rec.incomeTaxTDS.toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 text-right font-mono font-black text-emerald-600 dark:text-emerald-400">
                              Rs. {rec.netSalary.toLocaleString()}
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <Badge variant={rec.disbursementStatus === 'Disbursed' ? 'success' : 'warning'}>
                                {rec.disbursementStatus}
                              </Badge>
                            </td>
                            <td className="py-2.5 px-3 font-mono text-[10px] text-slate-500">
                              {rec.transactionRef || 'Pending'}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <p className="text-xs text-slate-400 italic">No payroll batch currently selected.</p>

            )}
          </Card>
        </div>
      )}

      {/* TAB 3: TAX & STATUTORY COMPLIANCE */}
      {activeTab === 'tax' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                  <ShieldCheck className="text-amber-500" size={18} />
                  Nepal IRD Individual Income Tax Slabs - FY 83/84
                </h3>
              </div>

              <div className="space-y-2 text-xs">
                {(settings.payrollConfig?.singleSlabs || DEFAULT_PAYROLL_CONFIG.singleSlabs).map((slab, i) => {
                  const limit = slab.limitSingle;
                  const isSlab1 = i === 0;
                  const ratePercent = (slab.rate * 100).toFixed(0);
                  const isWaiver = isSlab1 && (settings.payrollConfig?.ssfSlab1SstWaiver ?? true);

                  return (
                    <div key={slab.id} className="flex justify-between items-center p-2.5 bg-slate-50 dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-800">
                      <span className="font-semibold text-slate-600 dark:text-slate-300">
                        {slab.label}: Threshold Rs. {limit >= 10000000 ? '4,000,000+' : limit.toLocaleString()} / yr
                      </span>
                      <span className={`font-bold ${isSlab1 ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-900 dark:text-white'}`}>
                        {ratePercent}% Tax {isWaiver ? '(0% for SSF Enrolled)' : ''}
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>

            <Card className="p-6 space-y-4">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <CreditCard className="text-sky-500" size={18} />
                Statutory Social Security Fund (SSF - Nepal)
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Under the Nepal Social Security Act & Inland Revenue Department (IRD) Finance Act, employees registered with SSF contribute 11% of basic salary (PF 10% + Pension 1%). Additionally, SSF-enrolled employees receive a 100% waiver on the 1% Social Security Tax on Slab 1 income.
              </p>
              {currentRun && (
                <div className="p-4 bg-sky-50 dark:bg-sky-950/40 rounded-xl space-y-2 border border-sky-100 dark:border-sky-900">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600 dark:text-slate-300">Current Month SSF (11%) Contribution:</span>
                    <span className="font-bold text-sky-700 dark:text-sky-300">Rs. {currentRun.totalSocialSecurity.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-600 dark:text-slate-300">Current Month Tax TDS Withheld:</span>
                    <span className="font-bold text-amber-700 dark:text-amber-300">Rs. {currentRun.totalTaxTDS.toLocaleString()}</span>
                  </div>
                </div>
  
              )}
            </Card>
          </div>
              <Card className="p-6 space-y-4 md:col-span-2">
                <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <ShieldCheck className="text-emerald-500" size={18} />
                    Tax Reconciliation & Annual Tax Preview
                  </h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs whitespace-nowrap">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-500 uppercase tracking-wider font-bold">
                        <th className="py-2 px-2">Employee</th>
                        <th className="py-2 px-2 text-right">Ann. Gross</th>
                        <th className="py-2 px-2 text-right">Taxable Inc.</th>
                        <th className="py-2 px-2 text-right">Ann. Tax</th>
                        <th className="py-2 px-2 text-right">Current Month TDS</th>
                        <th className="py-2 px-2 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                      {currentRun && currentRun.records && currentRun.records.length > 0 ? (
                        currentRun.records.map(r => {
                          const annGross = (r.grossSalary || 0) * 12;
                          return (
                            <tr key={r.id}>
                              <td className="py-2 px-2">
                                <p className="text-slate-900 dark:text-white font-bold">{r.employeeName}</p>
                                <p className="text-[10px] text-slate-400">{r.panNumber || 'No PAN'}</p>
                              </td>
                              <td className="py-2 px-2 text-right font-mono">Rs. {annGross.toLocaleString()}</td>
                              <td className="py-2 px-2 text-right font-mono">Rs. {(r.annualizedTaxableIncome || 0).toLocaleString()}</td>
                              <td className="py-2 px-2 text-right font-mono text-amber-600 font-bold">Rs. {(r.annualTaxLiability || 0).toLocaleString()}</td>
                              <td className="py-2 px-2 text-right font-mono text-indigo-600 font-bold">Rs. {(r.incomeTaxTDS || 0).toLocaleString()}</td>
                              <td className="py-2 px-2 text-center">
                                <span className="px-2 py-0.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 rounded text-[10px] font-bold">Balanced</span>
                              </td>
                            </tr>
                          );
                        })
                      ) : (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-400 italic font-normal">
                            No payroll batch selected or records found. Run or select a payroll batch to preview tax reconciliation.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>


        </div>
      )}

      {/* TAB 4: EMPLOYEE COMPENSATION & PAY SETUP */}
      {activeTab === 'employees' && (
        <Card className="p-6 space-y-5">
          <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4 flex-wrap gap-4">
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <User className="text-indigo-600 dark:text-indigo-400" size={18} />
                Employee Pay Setup & Bank Directory
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Set basic salary benchmarks, allowances, PAN tax identification numbers, and bank account details for each employee.
              </p>
            </div>

            <div className="flex items-center gap-2">
              {selectedPayEmpIds.length > 0 && (
                <Button 
                  onClick={() => setIsBulkDeletePayOpen(true)}
                  className="gap-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shadow-md shadow-rose-600/20"
                >
                  <Trash2 size={14} />
                  Delete Selected ({selectedPayEmpIds.length})
                </Button>
  
              )}
              <Button 
                variant="outline"
                onClick={() => setIsImportModalOpen(true)}
                className="gap-2 text-xs border-emerald-300 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
              >
                <FileUp size={14} />
                Import Pay Details (Excel)
              </Button>
            </div>
          </div>

          {/* Search & Department Filter Bar */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3 flex-1 min-w-[280px]">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input 
                  type="text" 
                  placeholder="Search by Employee Name, ID, PAN, or Bank..."
                  value={empPaySearch}
                  onChange={(e) => setEmpPaySearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-medium focus:ring-2 focus:ring-indigo-500/20 transition-all outline-none"
                />
              </div>

              <select
                value={empPayDept}
                onChange={(e) => setEmpPayDept(e.target.value)}
                className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold px-3 py-2 focus:ring-2 focus:ring-indigo-500/20"
              >
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>

            <span className="text-xs text-slate-400 font-medium">
              Showing {filteredPayEmployees.length} of {employees.length} employees
            </span>
          </div>

          {/* Employee Pay Setup Table */}
          <div className="overflow-x-auto custom-scrollbar border border-slate-200 dark:border-slate-800 rounded-2xl">
            <table className="w-full text-left border-collapse min-w-[850px]">
              <thead>
                <tr className="bg-slate-100 dark:bg-slate-900/80 text-[10px] uppercase font-black text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                  <th className="py-3 px-4 w-10 text-center">
                    <input 
                      type="checkbox"
                      checked={isAllPayEmpSelected}
                      onChange={toggleSelectAllPayEmp}
                      className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500"
                    />
                  </th>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Department / Designation</th>
                  <th className="py-3 px-4 text-right">Basic Monthly Salary</th>
                  <th className="py-3 px-4 text-right">Allowances</th>
                  <th className="py-3 px-4 text-center">Marital / SSF</th>
                  <th className="py-3 px-4">PAN Tax ID</th>
                  <th className="py-3 px-4">Bank Name & Account</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                {filteredPayEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-8 text-center text-slate-400 italic">
                      No employee pay setup records match your search query.
                    </td>
                  </tr>
                ) : (
                  filteredPayEmployees.map(emp => {
                    const isSelected = selectedPayEmpIds.includes(emp.id);
                    return (
                      <tr key={emp.id} className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors ${isSelected ? 'bg-indigo-50/40 dark:bg-indigo-950/20' : ''}`}>
                        <td className="py-3 px-4 text-center">
                          <input 
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => toggleSelectPayEmp(emp.id)}
                            className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500"
                          />
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900 dark:text-white">
                          {emp.name}
                          <span className="block text-[10px] font-mono text-slate-400">ID: {emp.id}</span>
                        </td>
                        <td className="py-3 px-4">
                          {emp.department}
                          <span className="block text-[10px] text-slate-400">{emp.designation}</span>
                        </td>
                        <td className="py-3 px-4 text-right font-bold text-slate-900 dark:text-white">
                          Rs. {(emp.basicSalary || 45000).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right font-medium text-slate-600 dark:text-slate-300">
                          Rs. {(emp.allowances || 10000).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-center space-y-1">
                          <div>
                            <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 font-bold">
                              {emp.maritalStatus || 'Single'}
                            </span>
                          </div>
                          <div>
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${emp.ssfEnrolled !== false ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-100 text-slate-600'}`}>
                              SSF: {emp.ssfEnrolled !== false ? 'Yes' : 'No'}
                            </span>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono">{emp.panNumber || `PAN-${emp.id}`}</td>
                        <td className="py-3 px-4">
                          <div className="font-semibold">{emp.bankName || 'Standard Chartered Bank'}</div>
                          <div className="text-[10px] text-slate-400 font-mono">{emp.accountNumber || `ACC-${emp.id}982`}</div>
                        </td>
                        <td className="py-3 px-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <button 
                              onClick={() => setEditingEmployeeSalary(emp)}
                              className="p-1.5 text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950 rounded-lg transition-colors"
                              title="Edit Pay Profile"
                            >
                              <Edit2 size={14} />
                            </button>
                            <button 
                              onClick={() => setDeletingPayEmp(emp)}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/60 rounded-lg transition-colors"
                              title="Delete Employee Pay Setup & Record"
                            >
                              <Trash2 size={14} />
                            </button>
                  </div>
                        </td>
                      </tr>
                    );
                  })
                )}
    
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* TAB 5: PAYROLL SETUP & IRD TAX RULES CONFIGURATION */}
      {activeTab === 'setup' && (
        <div className="space-y-6">
          <Card className="p-6 space-y-6 border-l-4 border-l-indigo-600">
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4 flex-wrap gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <Sliders className="text-indigo-600 dark:text-indigo-400" size={20} />
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Nepal Payroll & IRD Tax Rules Setup</h3>
                </div>
                <p className="text-xs text-slate-500 mt-1">
                  Configure system parameters, Social Security Fund (SSF) contribution percentages, and IRD progressive tax slabs. Changes operate effective immediately for all subsequent payroll runs.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <Button 
                  variant="outline" 
                  onClick={handleResetPayrollSetup}
                  className="gap-2 text-xs border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300"
                >
                  <RotateCcw size={14} />
                  Reset to IRD Standard Defaults
                </Button>
                <Button 
                  onClick={handleSavePayrollSetup}
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md shadow-emerald-600/20"
                >
                  <Save size={15} />
                  Save Configuration & Operate Effective
                </Button>
              </div>
            </div>

            {/* Grid of Global Parameters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 bg-slate-50 dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs">
              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Fiscal Year Label</label>
                <Input 
                  value={setupConfig.fiscalYear}
                  onChange={(e) => setSetupConfig({ ...setupConfig, fiscalYear: e.target.value })}
                  placeholder="e.g. FY 2083/84"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">Official IRD tax year descriptor</span>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Effective BS Year</label>
                <Input 
                  type="number"
                  value={setupConfig.effectiveBsYear}
                  onChange={(e) => setSetupConfig({ ...setupConfig, effectiveBsYear: parseInt(e.target.value, 10) || 2083 })}
                  placeholder="2083"
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">Bikram Sambat tax anchor year</span>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Standard Days / Month</label>
                <Input 
                  type="number"
                  value={setupConfig.standardDaysInMonth}
                  onChange={(e) => setSetupConfig({ ...setupConfig, standardDaysInMonth: parseInt(e.target.value, 10) || 30 })}
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">Base working days per pay cycle</span>
              </div>

              <div>
                <label className="font-bold text-slate-700 dark:text-slate-300 block mb-1">Overtime Multiplier Rate</label>
                <Input 
                  type="number"
                  step="0.1"
                  value={setupConfig.overtimeMultiplier}
                  onChange={(e) => setSetupConfig({ ...setupConfig, overtimeMultiplier: parseFloat(e.target.value) || 1.5 })}
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">Hourly OT multiplier (default 1.5x)</span>
              </div>
            </div>

            {/* SSF & Provident Fund Section */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                <CreditCard size={15} className="text-sky-500" />
                Social Security Fund (SSF) & Statutory Deductions
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Employee SSF Rate (%)</label>
                  <div className="relative">
                    <Input 
                      type="number"
                      step="0.1"
                      value={+(setupConfig.ssfEmployeeRate * 100).toFixed(1)}
                      onChange={(e) => setSetupConfig({ ...setupConfig, ssfEmployeeRate: (parseFloat(e.target.value) || 0) / 100 })}
                    />
                    <span className="absolute right-3 top-2.5 text-slate-400 font-bold">%</span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Deducted from basic salary (default 11%)</span>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Employer SSF Rate (%)</label>
                  <div className="relative">
                    <Input 
                      type="number"
                      step="0.1"
                      value={+(setupConfig.ssfEmployerRate * 100).toFixed(1)}
                      onChange={(e) => setSetupConfig({ ...setupConfig, ssfEmployerRate: (parseFloat(e.target.value) || 0) / 100 })}
                    />
                    <span className="absolute right-3 top-2.5 text-slate-400 font-bold">%</span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Employer match share (default 20%)</span>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Non-SSF Provident Fund (%)</label>
                  <div className="relative">
                    <Input 
                      type="number"
                      step="0.1"
                      value={+(setupConfig.pfNonSsfRate * 100).toFixed(1)}
                      onChange={(e) => setSetupConfig({ ...setupConfig, pfNonSsfRate: (parseFloat(e.target.value) || 0) / 100 })}
                    />
                    <span className="absolute right-3 top-2.5 text-slate-400 font-bold">%</span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">For un-enrolled staff (default 10%)</span>
                </div>

                <div>
                  <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">Health Insurance Rate (%)</label>
                  <div className="relative">
                    <Input 
                      type="number"
                      step="0.1"
                      value={+(setupConfig.healthInsuranceRate * 100).toFixed(1)}
                      onChange={(e) => setSetupConfig({ ...setupConfig, healthInsuranceRate: (parseFloat(e.target.value) || 0) / 100 })}
                    />
                    <span className="absolute right-3 top-2.5 text-slate-400 font-bold">%</span>
                  </div>
                  <span className="text-[10px] text-slate-400 mt-0.5 block">Medical coverage allocation (default 1%)</span>
                </div>
              </div>

              {/* SSF SST Waiver Toggle Box */}
              <div className="p-4 bg-emerald-50/60 dark:bg-emerald-950/30 rounded-2xl border border-emerald-200 dark:border-emerald-800/50 flex items-center justify-between gap-4">
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-emerald-900 dark:text-emerald-300 flex items-center gap-1.5">
                    <ShieldCheck size={16} className="text-emerald-600" />
                    Slab 1 Social Security Tax (SST 1%) Waiver for SSF Employees
                  </span>
                  <p className="text-[11px] text-emerald-700 dark:text-emerald-400">
                    Under Nepal IRD Finance Act regulations, employees who actively contribute 11% to SSF are granted 100% exemption on the 1% Slab 1 Social Security Tax (SST).
                  </p>
                </div>

                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input 
                    type="checkbox"
                    checked={setupConfig.ssfSlab1SstWaiver}
                    onChange={(e) => setSetupConfig({ ...setupConfig, ssfSlab1SstWaiver: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:after:border-slate-600 peer-checked:bg-emerald-600"></div>
                </label>
              </div>
            </div>

            {/* IRD Progressive Tax Slabs Table Editor */}
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider flex items-center gap-2">
                    <Table size={15} className="text-indigo-500" />
                    Nepal IRD Progressive Income Tax Slabs Configuration
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Specify the annualized income thresholds (NPR) for Single and Married tax categories, along with respective tax rates.
                  </p>
                </div>

                <Button 
                  variant="outline" 
                  onClick={() => {
                    const newSlab: TaxSlabConfig = {
                      id: Math.random().toString(36).substr(2, 6),
                      label: `Custom Slab ${setupConfig.singleSlabs.length + 1}`,
                      limitSingle: 10000000,
                      limitMarried: 10000000,
                      rate: 0.40
                    };
                    setSetupConfig({
                      ...setupConfig,
                      singleSlabs: [...setupConfig.singleSlabs, newSlab]
                    });
                  }}
                  className="gap-1.5 text-xs text-indigo-600 border-indigo-200 hover:bg-indigo-50 dark:border-indigo-900 dark:hover:bg-indigo-950"
                >
                  <Plus size={14} />
                  Add Tax Slab
                </Button>
              </div>

              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl">
                <table className="w-full text-left text-xs divide-y divide-slate-100 dark:divide-slate-800">
                  <thead className="bg-slate-100 dark:bg-slate-800 font-bold text-slate-500 text-[10px] uppercase">
                    <tr>
                      <th className="py-2.5 px-3">Slab Descriptor</th>
                      <th className="py-2.5 px-3">Single Limit (NPR)</th>
                      <th className="py-2.5 px-3">Married Limit (NPR)</th>
                      <th className="py-2.5 px-3 w-32">Tax Rate (%)</th>
                      <th className="py-2.5 px-3 text-center w-16">Remove</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {setupConfig.singleSlabs.map((slab, index) => (
                      <tr key={slab.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                        <td className="py-2 px-3 font-semibold text-slate-900 dark:text-white">
                          <Input 
                            value={slab.label}
                            onChange={(e) => {
                              const updated = [...setupConfig.singleSlabs];
                              updated[index].label = e.target.value;
                              setSetupConfig({ ...setupConfig, singleSlabs: updated });
                            }}
                            className="text-xs h-8"
                          />
                        </td>
                        <td className="py-2 px-3 font-mono">
                          <Input 
                            type="number"
                            value={slab.limitSingle}
                            onChange={(e) => {
                              const updated = [...setupConfig.singleSlabs];
                              const val = parseFloat(e.target.value) || 0;
                              updated[index].limitSingle = val;
                              setSetupConfig({ ...setupConfig, singleSlabs: updated });
                            }}
                            className="text-xs h-8 font-mono"
                          />
                        </td>
                        <td className="py-2 px-3 font-mono">
                          <Input 
                            type="number"
                            value={slab.limitMarried !== undefined ? slab.limitMarried : slab.limitSingle}
                            onChange={(e) => {
                              const updated = [...setupConfig.singleSlabs];
                              const val = parseFloat(e.target.value) || 0;
                              updated[index].limitMarried = val;
                              setSetupConfig({ ...setupConfig, singleSlabs: updated });
                            }}
                            className="text-xs h-8 font-mono"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <div className="relative">
                            <Input 
                              type="number"
                              step="0.1"
                              value={+(slab.rate * 100).toFixed(1)}
                              onChange={(e) => {
                                const updated = [...setupConfig.singleSlabs];
                                updated[index].rate = (parseFloat(e.target.value) || 0) / 100;
                                setSetupConfig({ ...setupConfig, singleSlabs: updated });
                              }}
                              className="text-xs h-8 font-bold text-indigo-600 dark:text-indigo-400"
                            />
                            <span className="absolute right-2 top-1.5 text-[10px] font-bold text-slate-400">%</span>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button 
                            onClick={() => {
                              if (setupConfig.singleSlabs.length <= 1) {
                                toast.error('Minimum 1 tax slab is required.');
                                return;
                              }
                              const updated = setupConfig.singleSlabs.filter((_, i) => i !== index);
                              setSetupConfig({ ...setupConfig, singleSlabs: updated });
                            }}
                            className="p-1.5 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950 rounded-lg transition-colors"
                            title="Delete Slab"
                          >
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bottom Save Action Bar */}
            <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
              <Button 
                variant="outline" 
                onClick={handleResetPayrollSetup}
                className="gap-2 text-xs"
              >
                <RotateCcw size={14} />
                Reset Defaults
              </Button>
              <Button 
                onClick={handleSavePayrollSetup}
                className="gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-lg shadow-emerald-600/20 px-6 py-2.5"
              >
                <Save size={16} />
                Save Configuration & Operate Effective
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* INDIVIDUAL PAYSLIP MODAL */}
      <AnimatePresence>
        {activePayslipRecord && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-2xl w-full p-8 border border-slate-200 dark:border-slate-800 max-h-[90vh] overflow-y-auto space-y-6"
            >
              <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-black text-lg">
                    {settings.companyName.charAt(0)}
                  </div>
                  <div>
                    <h2 className="text-base font-black text-slate-900 dark:text-white">{settings.companyName}</h2>
                    <p className="text-xs text-slate-500 font-medium">Official Employee Salary Payslip</p>
                  </div>
                </div>

                <div className="text-right">
                  <span className="px-3 py-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 rounded-full text-xs font-black uppercase">
                    {activePayslipRecord.disbursementStatus}
                  </span>
                </div>
              </div>

              {/* Employee Metadata Box */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl text-xs">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-black">Employee Name</span>
                  <p className="font-bold text-slate-900 dark:text-white">{activePayslipRecord.employeeName}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-black">Employee ID</span>
                  <p className="font-mono text-slate-700 dark:text-slate-300">{activePayslipRecord.employeeId}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-black">Department</span>
                  <p className="font-semibold text-slate-700 dark:text-slate-300">{activePayslipRecord.department}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-black">Designation</span>
                  <p className="font-semibold text-slate-700 dark:text-slate-300">{activePayslipRecord.designation}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-black">PAN Tax ID</span>
                  <p className="font-mono text-slate-700 dark:text-slate-300">{activePayslipRecord.panNumber}</p>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-black">Payable Days</span>
                  <p className="font-bold text-indigo-600">{activePayslipRecord.payableDays} / {activePayslipRecord.totalDaysInMonth} Days</p>
                </div>
              </div>

              {/* Itemized Salary Breakdown */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 text-xs">
                {/* Earnings */}
                <div className="space-y-2">
                  <h4 className="font-black text-slate-900 dark:text-white uppercase tracking-wider text-[11px] border-b border-slate-200 dark:border-slate-800 pb-1 text-emerald-600">
                    Gross Earnings
                  </h4>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Basic Salary (Earned)</span>
                    <span className="font-bold text-slate-900 dark:text-white">Rs. {activePayslipRecord.earnedBasicSalary.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Allowances (Earned)</span>
                    <span className="font-bold text-slate-900 dark:text-white">Rs. {activePayslipRecord.earnedAllowances.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Overtime Pay ({activePayslipRecord.overtimeHours} hrs)</span>
                    <span className="font-bold text-indigo-600">+Rs. {activePayslipRecord.overtimePay.toLocaleString()}</span>
                  </div>
                  {activePayslipRecord.bonus > 0 && (
                    <div className="flex justify-between py-1">
                      <span className="text-slate-500">Incentives / Dashain Bonus</span>
                      <span className="font-bold text-emerald-600">+Rs. {activePayslipRecord.bonus.toLocaleString()}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-2 border-t border-slate-200 dark:border-slate-800 font-black text-sm">
                    <span>Total Gross Salary</span>
                    <span className="text-slate-900 dark:text-white">Rs. {activePayslipRecord.grossSalary.toLocaleString()}</span>
                  </div>
                </div>

                {/* Deductions */}
                <div className="space-y-2">
                  <h4 className="font-black text-slate-900 dark:text-white uppercase tracking-wider text-[11px] border-b border-slate-200 dark:border-slate-800 pb-1 text-rose-500">
                    Statutory Deductions (Nepal IRD & SSF)
                  </h4>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Income Tax (Nepal IRD TDS)</span>
                    <span className="font-bold text-amber-600">-Rs. {activePayslipRecord.incomeTaxTDS.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Social Security Fund (SSF 11%)</span>
                    <span className="font-bold text-sky-600">-Rs. {activePayslipRecord.socialSecurity.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-500">Health / Medical Insurance</span>
                    <span className="font-bold text-slate-700 dark:text-slate-300">-Rs. {activePayslipRecord.healthInsurance.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between py-2 border-t border-slate-200 dark:border-slate-800 font-black text-sm text-rose-600">
                    <span>Total Deductions</span>
                    <span>-Rs. {activePayslipRecord.totalDeductions.toLocaleString()}</span>
                  </div>
                </div>
              </div>

              {/* Diagnostic Mode: Annualized Tax & IRD Slab Breakdown */}
              {activePayslipRecord.taxSlabBreakdown && activePayslipRecord.taxSlabBreakdown.length > 0 && (
                <div className="bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <ShieldCheck size={16} className="text-indigo-600 dark:text-indigo-400" />
                      <h4 className="text-xs font-black text-slate-900 dark:text-white uppercase tracking-wider">
                        Diagnostic Mode: IRD Annual Tax Slab Calculation Breakdown (FY 2083/84)
                      </h4>
                    </div>
                    <Badge variant="info" className="text-[10px]">
                      {activePayslipRecord.taxStatus || 'Single'}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                    <div>
                      <span className="text-slate-400 text-[9px] uppercase font-bold">Monthly Taxable</span>
                      <p className="font-black text-slate-800 dark:text-slate-200">Rs. {activePayslipRecord.annualizedTaxableIncome.toLocaleString()}</p>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[9px] uppercase font-bold">Annualized Taxable</span>
                      <p className="font-black text-slate-800 dark:text-slate-200">Rs. {(activePayslipRecord.annualizedTaxableIncome * 12).toLocaleString()}</p>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[9px] uppercase font-bold">Annual Total Tax</span>
                      <p className="font-black text-amber-600">Rs. {(activePayslipRecord.incomeTaxTDS * 12).toLocaleString()}</p>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[9px] uppercase font-bold">Monthly TDS (÷ 12)</span>
                      <p className="font-black text-indigo-600">Rs. {activePayslipRecord.incomeTaxTDS.toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[11px]">
                      <thead>
                        <tr className="border-b border-slate-200 dark:border-slate-700 text-slate-400 font-black uppercase text-[9px]">
                          <th className="py-1 px-2">Tax Slab</th>
                          <th className="py-1 px-2 text-right">Bracket Range</th>
                          <th className="py-1 px-2 text-right">Taxable Amount</th>
                          <th className="py-1 px-2 text-center">Rate</th>
                          <th className="py-1 px-2 text-right">Tax Amount</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
                        {(activePayslipRecord.taxSlabBreakdown || []).map((s, idx) => (
                          <tr key={idx} className={s.taxableAmount > 0 ? "text-slate-900 dark:text-white font-bold" : "text-slate-400"}>
                            <td className="py-1.5 px-2">{s.slabName}</td>
                            <td className="py-1.5 px-2 text-right font-mono">
                              Rs. {s.minAmount.toLocaleString()} - {s.maxAmount === Infinity ? 'Above' : `Rs. ${s.maxAmount.toLocaleString()}`}
                            </td>
                            <td className="py-1.5 px-2 text-right font-mono">Rs. {s.taxableAmount.toLocaleString()}</td>
                            <td className="py-1.5 px-2 text-center">
                              <span className="px-1.5 py-0.5 bg-indigo-50 dark:bg-indigo-950 text-indigo-600 dark:text-indigo-300 rounded font-black text-[10px]">
                                {(s.rate * 100)}%
                              </span>
                            </td>
                            <td className="py-1.5 px-2 text-right font-bold text-amber-600">Rs. {s.taxAmount.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
  

                )}
              {/* Net Payable Highlight */}
              <div className="p-5 bg-gradient-to-r from-emerald-600 to-teal-700 text-white rounded-2xl flex items-center justify-between shadow-lg">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-emerald-100">Net Salary Disbursed (NPR)</span>
                  <p className="text-2xl font-black">Rs. {activePayslipRecord.netSalary.toLocaleString()}</p>
                </div>
                <div className="text-right text-xs text-emerald-100">
                  <p className="font-bold">{activePayslipRecord.bankName}</p>
                  <p className="font-mono">{activePayslipRecord.accountNumber}</p>
                  {activePayslipRecord.transactionRef && (
                    <p className="text-[10px] font-mono mt-1 bg-white/10 px-2 py-0.5 rounded">
                      Ref: {activePayslipRecord.transactionRef}
                    </p>
      
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <Button variant="outline" onClick={() => window.print()} className="gap-2">
                  <Printer size={16} />
                  Print Payslip
                </Button>
                <Button onClick={() => setActivePayslipRecord(null)}>Close</Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* EDIT PAYROLL RECORD MODAL */}
      <AnimatePresence>
        {editingRecord && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 space-y-4"
            >
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Adjust Payroll Record</h3>
              <p className="text-xs text-slate-500">Modify earned basic, overtime, or bonus adjustments before approval.</p>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300">Earned Basic Salary (Rs.)</label>
                  <Input 
                    type="number"
                    value={editingRecord.record.earnedBasicSalary}
                    onChange={(e) => setEditingRecord({
                      ...editingRecord,
                      record: { ...editingRecord.record, earnedBasicSalary: parseFloat(e.target.value) || 0 }
                    })}
                    className="mt-1"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300">Earned Allowances (Rs.)</label>
                  <Input 
                    type="number"
                    value={editingRecord.record.earnedAllowances}
                    onChange={(e) => setEditingRecord({
                      ...editingRecord,
                      record: { ...editingRecord.record, earnedAllowances: parseFloat(e.target.value) || 0 }
                    })}
                    className="mt-1"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300">Overtime Pay (Rs.)</label>
                  <Input 
                    type="number"
                    value={editingRecord.record.overtimePay}
                    onChange={(e) => setEditingRecord({
                      ...editingRecord,
                      record: { ...editingRecord.record, overtimePay: parseFloat(e.target.value) || 0 }
                    })}
                    className="mt-1"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300">Performance / Dashain Bonus (Rs.)</label>
                  <Input 
                    type="number"
                    value={editingRecord.record.bonus}
                    onChange={(e) => setEditingRecord({
                      ...editingRecord,
                      record: { ...editingRecord.record, bonus: parseFloat(e.target.value) || 0 }
                    })}
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <Button variant="outline" onClick={() => setEditingRecord(null)}>Cancel</Button>
                <Button 
                  onClick={async () => {
                    await updatePayrollRecord(editingRecord.runId, editingRecord.record.id, editingRecord.record);
                    toast.success('Payroll record adjusted!');
                    setEditingRecord(null);
                  }}
                  className="bg-indigo-600 text-white"
                >
                  Save Adjustments
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* EDIT EMPLOYEE SALARY SETUP MODAL */}
      <AnimatePresence>
        {editingEmployeeSalary && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 space-y-4 max-h-[90vh] overflow-y-auto"
            >
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Update Compensation & IRD Profile</h3>
              <p className="text-xs text-slate-500">Edit base monthly salary, IRD marital tax slab status, SSF enrollment, tax PAN, and bank details for {editingEmployeeSalary.name}.</p>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300">Basic Monthly Salary (NPR)</label>
                  <Input 
                    type="number"
                    value={editingEmployeeSalary.basicSalary || 45000}
                    onChange={(e) => setEditingEmployeeSalary({
                      ...editingEmployeeSalary,
                      basicSalary: parseFloat(e.target.value) || 0
                    })}
                    className="mt-1"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300">Monthly Allowances (NPR)</label>
                  <Input 
                    type="number"
                    value={editingEmployeeSalary.allowances || 10000}
                    onChange={(e) => setEditingEmployeeSalary({
                      ...editingEmployeeSalary,
                      allowances: parseFloat(e.target.value) || 0
                    })}
                    className="mt-1"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300">Marital Status (IRD Tax)</label>
                    <select
                      value={editingEmployeeSalary.maritalStatus || 'Single'}
                      onChange={(e) => setEditingEmployeeSalary({
                        ...editingEmployeeSalary,
                        maritalStatus: e.target.value as 'Single' | 'Married'
                      })}
                      className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 font-semibold text-slate-900 dark:text-white"
                    >
                      <option value="Single">Single (Up to 5L 1%)</option>
                      <option value="Married">Married (Up to 6L 1%)</option>
                    </select>
                  </div>

                  <div>
                    <label className="font-bold text-slate-700 dark:text-slate-300">SSF Enrolled?</label>
                    <select
                      value={editingEmployeeSalary.ssfEnrolled !== false ? 'Yes' : 'No'}
                      onChange={(e) => setEditingEmployeeSalary({
                        ...editingEmployeeSalary,
                        ssfEnrolled: e.target.value === 'Yes'
                      })}
                      className="mt-1 w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg p-2.5 font-semibold text-slate-900 dark:text-white"
                    >
                      <option value="Yes">Yes (11% SSF, 1% SST waived)</option>
                      <option value="No">No (Standard Tax Slabs)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300">PAN Tax Number</label>
                  <Input 
                    type="text"
                    value={editingEmployeeSalary.panNumber || ''}
                    onChange={(e) => setEditingEmployeeSalary({
                      ...editingEmployeeSalary,
                      panNumber: e.target.value
                    })}
                    placeholder="e.g. 109283741"
                    className="mt-1"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300">Bank Name</label>
                  <Input 
                    type="text"
                    value={editingEmployeeSalary.bankName || ''}
                    onChange={(e) => setEditingEmployeeSalary({
                      ...editingEmployeeSalary,
                      bankName: e.target.value
                    })}
                    placeholder="e.g. Nabil Bank"
                    className="mt-1"
                  />
                </div>

                <div>
                  <label className="font-bold text-slate-700 dark:text-slate-300">Account Number</label>
                  <Input 
                    type="text"
                    value={editingEmployeeSalary.accountNumber || ''}
                    onChange={(e) => setEditingEmployeeSalary({
                      ...editingEmployeeSalary,
                      accountNumber: e.target.value
                    })}
                    placeholder="e.g. 0192837465012"
                    className="mt-1"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <Button variant="outline" onClick={() => setEditingEmployeeSalary(null)}>Cancel</Button>
                <Button 
                  onClick={async () => {
                    await updateEmployee(editingEmployeeSalary.id, {
                      basicSalary: editingEmployeeSalary.basicSalary,
                      allowances: editingEmployeeSalary.allowances,
                      maritalStatus: editingEmployeeSalary.maritalStatus,
                      ssfEnrolled: editingEmployeeSalary.ssfEnrolled,
                      panNumber: editingEmployeeSalary.panNumber,
                      bankName: editingEmployeeSalary.bankName,
                      accountNumber: editingEmployeeSalary.accountNumber
                    });
                    toast.success(`Compensation profile updated for ${editingEmployeeSalary.name}!`);
                    setEditingEmployeeSalary(null);
                  }}
                  className="bg-indigo-600 text-white"
                >
                  Save Salary Profile
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* IMPORT EMPLOYEE PAY DETAILS VIA EXCEL MODAL */}
      <AnimatePresence>
        {isImportModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-3xl w-full p-6 border border-slate-200 dark:border-slate-800 space-y-5 max-h-[90vh] overflow-y-auto"
            >
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="text-emerald-600 dark:text-emerald-400" size={24} />
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">Import Employee Pay Details from Excel</h3>
                    <p className="text-xs text-slate-500">Bulk upload employee basic salary, allowances, IRD marital status, SSF enrollment, PAN numbers, and bank account details.</p>
                  </div>
                </div>
                <Button 
                  variant="outline" 
                  onClick={handleDownloadPayTemplate}
                  className="gap-2 border-emerald-300 text-emerald-700 dark:text-emerald-400 text-xs"
                >
                  <Download size={14} />
                  Download Sample Excel Template
                </Button>
              </div>

              {/* Upload Zone */}
              <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-indigo-500/50 rounded-2xl p-6 text-center space-y-3 bg-slate-50/50 dark:bg-slate-900/50 transition-all">
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-xl w-fit mx-auto">
                  <Upload size={28} />
                </div>
                <div>
                  <label htmlFor="excel-file-input" className="cursor-pointer text-sm font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
                    Click to select Excel spreadsheet (.xlsx, .xls)
                  </label>
                  <p className="text-xs text-slate-400 mt-1">Supports standard columns: Employee ID, Name, Basic Salary, Allowances, Marital Status, SSF Enrolled, PAN, Bank Name, Account Number</p>
                  <input
                    id="excel-file-input"
                    type="file"
                    accept=".xlsx, .xls"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </div>
              </div>

              {/* Parsed Preview Table */}
              {importPreviewData.length > 0 && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Table size={14} className="text-indigo-500" />
                      Parsed Preview ({importPreviewData.length} records ready)
                    </span>
                    <Badge variant="info" className="text-[10px]">
                      {importPreviewData.filter(d => d.isMatched).length} Matched Employees
                    </Badge>
                  </div>

                  <div className="overflow-x-auto max-h-60 border border-slate-200 dark:border-slate-800 rounded-xl">
                    <table className="w-full text-left text-xs divide-y divide-slate-100 dark:divide-slate-800">
                      <thead className="bg-slate-100 dark:bg-slate-800 font-bold text-slate-500 text-[10px] uppercase sticky top-0">
                        <tr>
                          <th className="py-2 px-3">Emp ID</th>
                          <th className="py-2 px-3">Name</th>
                          <th className="py-2 px-3 text-right">Basic (NPR)</th>
                          <th className="py-2 px-3 text-right">Allowances</th>
                          <th className="py-2 px-3 text-center">Marital</th>
                          <th className="py-2 px-3 text-center">SSF</th>
                          <th className="py-2 px-3">PAN</th>
                          <th className="py-2 px-3">Bank Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {importPreviewData.map((row) => (
                          <tr key={row.rowId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                            <td className="py-2 px-3 font-mono font-bold text-slate-900 dark:text-white">{row.empId}</td>
                            <td className="py-2 px-3 font-semibold">{row.name}</td>
                            <td className="py-2 px-3 text-right font-bold">Rs. {row.basicSalary.toLocaleString()}</td>
                            <td className="py-2 px-3 text-right text-slate-600">Rs. {row.allowances.toLocaleString()}</td>
                            <td className="py-2 px-3 text-center">
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300 font-bold">
                                {row.maritalStatus}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-center">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${row.ssfEnrolled ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-100 text-slate-600'}`}>
                                {row.ssfEnrolled ? 'Yes' : 'No'}
                              </span>
                            </td>
                            <td className="py-2 px-3 font-mono text-[11px]">{row.panNumber}</td>
                            <td className="py-2 px-3 text-[11px]">
                              <div>{row.bankName}</div>
                              <div className="font-mono text-[10px] text-slate-400">{row.accountNumber}</div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
  

                )}
              {/* Modal Actions */}
              <div className="flex justify-between items-center pt-3 border-t border-slate-100 dark:border-slate-800">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setIsImportModalOpen(false);
                    setImportPreviewData([]);
                  }}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleApplyImportedPayDetails}
                  disabled={importPreviewData.length === 0 || isApplyingImport}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2 font-bold"
                >
                  <Check size={16} />
                  {isApplyingImport ? 'Applying Data...' : `Apply & Update ${importPreviewData.length} Employee Records`}
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* SINGLE EMPLOYEE DELETE CONFIRMATION MODAL */}
      <AnimatePresence>
        {deletingPayEmp && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 space-y-4"
            >
              <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
                <div className="p-3 bg-rose-50 dark:bg-rose-950/60 rounded-2xl">
                  <AlertCircle size={24} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Delete Employee Pay Setup?</h3>
                  <p className="text-xs text-slate-500 font-medium">This operation will sync and delete from SQLite.</p>
                </div>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl space-y-1.5 border border-slate-100 dark:border-slate-800 text-xs">
                <div><span className="text-slate-400">Name:</span> <strong className="text-slate-900 dark:text-white">{deletingPayEmp.name}</strong></div>
                <div><span className="text-slate-400">Employee ID:</span> <code className="font-mono bg-slate-200 dark:bg-slate-700 px-1 py-0.5 rounded">{deletingPayEmp.id}</code></div>
                <div><span className="text-slate-400">Department:</span> <span className="font-semibold">{deletingPayEmp.department}</span></div>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">
                Are you sure you want to delete this employee pay setup profile? This action will remove the record from your workspace and connected local SQLite database.
              </p>

              <div className="flex justify-end items-center gap-3 pt-2">
                <Button 
                  variant="outline" 
                  onClick={() => setDeletingPayEmp(null)}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleConfirmDeletePayEmp}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-bold gap-2"
                >
                  <Trash2 size={16} />
                  Delete Employee Record
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* BULK EMPLOYEE DELETE CONFIRMATION MODAL */}
      <AnimatePresence>
        {isBulkDeletePayOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-md w-full p-6 border border-slate-200 dark:border-slate-800 space-y-4"
            >
              <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
                <div className="p-3 bg-rose-50 dark:bg-rose-950/60 rounded-2xl">
                  <AlertCircle size={24} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">Delete {selectedPayEmpIds.length} Selected Employees?</h3>
                  <p className="text-xs text-slate-500 font-medium">Batch removal from local SQLite database.</p>
                </div>
              </div>

              <p className="text-xs text-slate-500 leading-relaxed">
                You are about to permanently remove <strong>{selectedPayEmpIds.length} employee records</strong> and compensation profiles from the system and local SQLite database.
              </p>

              <div className="flex justify-end items-center gap-3 pt-2">
                <Button 
                  variant="outline" 
                  onClick={() => setIsBulkDeletePayOpen(false)}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleConfirmBulkDeletePayEmp}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-bold gap-2 shadow-lg shadow-rose-600/20"
                >
                  <Trash2 size={16} />
                  Delete {selectedPayEmpIds.length} Employees
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DRAFT PAYROLL RUN DELETE CONFIRMATION MODAL */}
      <AnimatePresence>
        {runToDelete && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-lg w-full p-6 border border-slate-200 dark:border-slate-800 space-y-5"
            >
              <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400 border-b border-slate-100 dark:border-slate-800 pb-4">
                <div className="p-3 bg-rose-50 dark:bg-rose-950/60 rounded-2xl">
                  <AlertCircle size={26} />
                </div>
                <div>
                  <h3 className="text-lg font-black tracking-tight text-slate-900 dark:text-white uppercase">DELETE PAYROLL RUN</h3>
                  <p className="text-xs text-slate-500 font-medium">Permanent removal of draft payroll calculation batch.</p>
                </div>
              </div>

              {/* Payroll Run Metadata Summary Grid */}
              <div className="grid grid-cols-2 gap-3 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-100 dark:border-slate-800 text-xs">
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Fiscal Year</span>
                  <strong className="text-slate-900 dark:text-white font-mono text-sm">{currentFiscalYear}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Month</span>
                  <strong className="text-slate-900 dark:text-white text-sm">{runToDelete.monthName}</strong>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Payroll Period</span>
                  <span className="font-mono text-slate-700 dark:text-slate-300 font-bold">{runToDelete.startDate || '2026-07-17'} → {runToDelete.endDate || '2026-08-16'}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px] uppercase font-bold">Total Batch Employees</span>
                  <span className="font-bold text-slate-900 dark:text-white text-sm">{runToDelete.records.length} Employees</span>
                </div>
                <div className="col-span-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex justify-between items-center">
                  <span className="text-slate-500 font-bold">Total Batch Net Payroll:</span>
                  <span className="text-base font-black text-rose-600 dark:text-rose-400 font-mono">
                    Rs. {runToDelete.totalNetSalary.toLocaleString()}
                  </span>
                </div>
              </div>

              {/* Explicit Data Preservation Warning Box */}
              <div className="p-3.5 bg-amber-50/80 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/60 rounded-2xl text-xs text-amber-900 dark:text-amber-200 leading-relaxed flex gap-2.5">
                <AlertCircle size={18} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Source Data Is Preserved</p>
                  <p className="text-[11px] mt-0.5 text-amber-800 dark:text-amber-300">
                    This action will delete the draft payroll calculation record. <strong>Employee Master, Attendance, Leave and Overtime (OT) source data will NOT be deleted</strong> and can be recalculated at any time.
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex justify-end items-center gap-3 pt-2">
                <Button 
                  variant="outline" 
                  onClick={() => setRunToDelete(null)}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleConfirmDeleteRun}
                  className="bg-rose-600 hover:bg-rose-700 text-white font-bold gap-2 shadow-lg shadow-rose-600/20"
                >
                  <Trash2 size={16} />
                  Delete Payroll Run
                </Button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* BULK DELETE PROGRESS MODAL */}
      {deleteProgress.active && (
        <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center p-4 z-[110] backdrop-blur-md">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 text-center">
            <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center mx-auto text-red-600">
              <Trash2 className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Deleting Pay Setup Records</h3>
              <p className="text-xs text-slate-500 font-medium mt-1">Please do not close browser</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono font-bold">
                <span className="text-slate-600">{deleteProgress.current} / {deleteProgress.total}</span>
                <span className="text-red-600">{deleteProgress.percent}%</span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-red-600 transition-all duration-150 rounded-full"
                  style={{ width: `${deleteProgress.percent}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
