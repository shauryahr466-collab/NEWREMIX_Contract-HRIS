import React, { useState, useRef, useMemo, useEffect } from 'react';
import { format } from 'date-fns';
import { useAppStore } from '../store';
import { Employee } from '../types';
import { generateId, cn, normalizeEmployeeId } from '../lib/utils';
import { Plus, Search, Edit2, Trash2, FileUp, Download, X, Filter, RefreshCw, ChevronLeft, ChevronRight, Users } from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { PageHeader, Card, Button, Badge, Input } from '../components/ui';
import { MultiSelect } from '../components/MultiSelect';

export function Employees() {
  const { 
    employees, 
    setEmployees, 
    deleteEmployeesBatch, 
    updateEmployee, 
    addEmployee, 
    settings, 
    quotaExceeded,
    globalSearchTerm,
    openEmployeeProfile,
    recalculate,
    isInitializing
  } = useAppStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSearch, setActiveSearch] = useState('');

  // Sync active search
  React.useEffect(() => {
    setActiveSearch(searchTerm || globalSearchTerm);
  }, [searchTerm, globalSearchTerm]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [isBulkShiftModalOpen, setIsBulkShiftModalOpen] = useState(false);
  const [bulkShiftId, setBulkShiftId] = useState('');
  const [sortConfig, setSortConfig] = useState<{ key: 'name' | 'department'; direction: 'asc' | 'desc' } | null>(null);
  const [deptFilter, setDeptFilter] = useState<string[]>(['All']);
  const [designationFilter, setDesignationFilter] = useState<string[]>(['All']);
  const [contractorFilter, setContractorFilter] = useState<string[]>(['All']);
  const [errors, setErrors] = useState<{ name?: string; id?: string }>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [formData, setFormData] = useState<Partial<Employee>>({
    name: '',
    department: '',
    designation: '',
    contractorName: '',
    shiftId: settings.shifts?.[0]?.id || '',
    status: 'Active',
    contactNumber: '',
    weeklyOff: 'Sunday',
    otEligible: true,
    targetWorkingHours: 8
  });

  const departments = useMemo(() => {
    const depts = employees.map(e => e.department).filter(Boolean) as string[];
    return ['All', ...new Set(depts)];
  }, [employees]);

  const contractors = useMemo(() => {
    const cons = employees.map(e => e.contractorName).filter(Boolean) as string[];
    return ['All', ...new Set(cons)];
  }, [employees]);

  const designations = useMemo(() => {
    const des = employees.map(e => e.designation).filter(Boolean) as string[];
    return ['All', ...new Set(des)];
  }, [employees]);

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  const filteredEmployees = useMemo(() => {
    const searchLower = activeSearch.toLowerCase();
    const searchNorm = normalizeEmployeeId(activeSearch);

    let result = employees.filter(e => {
      const nameMatch = e.name.toLowerCase().includes(searchLower);
      const idMatch = e.id.toLowerCase().includes(searchLower) || 
                      (searchNorm && normalizeEmployeeId(e.id).includes(searchNorm));
      const deptMatch = e.department.toLowerCase().includes(searchLower);
      const desigMatch = e.designation?.toLowerCase().includes(searchLower);
      
      const matchesSearch = searchLower === '' || nameMatch || idMatch || deptMatch || desigMatch;
      const matchesDept = deptFilter.includes('All') || deptFilter.includes(e.department);
      const matchesDesig = designationFilter.includes('All') || (e.designation && designationFilter.includes(e.designation));
      const matchesContractor = contractorFilter.includes('All') || (e.contractorName && contractorFilter.includes(e.contractorName));

      return matchesSearch && matchesDept && matchesDesig && matchesContractor;
    });

    if (sortConfig) {
      result.sort((a, b) => {
        const valA = String(a[sortConfig.key] || '').toLowerCase();
        const valB = String(b[sortConfig.key] || '').toLowerCase();
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [employees, activeSearch, deptFilter, designationFilter, contractorFilter, sortConfig]);

  const totalPages = Math.ceil(filteredEmployees.length / itemsPerPage);
  const paginatedEmployees = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredEmployees.slice(start, start + itemsPerPage);
  }, [filteredEmployees, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeSearch, deptFilter, designationFilter, contractorFilter]);

  const handleSort = (key: 'name' | 'department') => {
    setSortConfig(prev => ({
      key,
      direction: prev?.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleBulkDelete = async () => {
    if (quotaExceeded) {
      toast.error('Cannot delete: Database write limit reached. Please wait for daily reset.');
      return;
    }
    if (selectedEmployees.length === 0) return;
    
    const count = selectedEmployees.length;
    const choice = confirm(
      `Delete Employee Records?\n\nYou are about to modify ${count} employee records.\n\n` +
      `Click OK to Permanently Delete, or Cancel to keep records unchanged.`
    );

    if (!choice) return;

    setDeleteProgress({ active: true, current: 0, total: count, percent: 0 });
    try {
      const batchSize = 30;
      for (let i = 0; i < selectedEmployees.length; i += batchSize) {
        const batch = selectedEmployees.slice(i, i + batchSize);
        await deleteEmployeesBatch(batch);
        const currentCount = Math.min(i + batchSize, count);
        const pct = Math.round((currentCount / count) * 100);
        setDeleteProgress({ active: true, current: currentCount, total: count, percent: pct });
        await new Promise(r => setTimeout(r, 10));
      }
      toast.success(`Successfully deleted ${count} employee records.`);
      setSelectedEmployees([]);
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete employees');
    } finally {
      setDeleteProgress({ active: false, current: 0, total: 0, percent: 0 });
    }
  };

  const handlePurgeAll = async () => {
    const count = employees.length;
    if (count === 0) return;

    if (!confirm(`CRITICAL WARNING:\n\nYou are about to delete ALL ${count} employees from the directory.\nThis affects historical attendance, payroll, leave, and tax references.`)) {
      return;
    }

    const confirmation = prompt(`FINAL CONFIRMATION: Type "DELETE" to confirm permanent purge of all ${count} employees.`);
    if (confirmation !== 'DELETE') {
      toast.info("Purge cancelled.");
      return;
    }

    setDeleteProgress({ active: true, current: 0, total: count, percent: 0 });
    try {
      const allIds = employees.map(e => e.id);
      const batchSize = 30;
      for (let i = 0; i < allIds.length; i += batchSize) {
        const batch = allIds.slice(i, i + batchSize);
        await deleteEmployeesBatch(batch);
        const currentCount = Math.min(i + batchSize, count);
        const pct = Math.round((currentCount / count) * 100);
        setDeleteProgress({ active: true, current: currentCount, total: count, percent: pct });
        await new Promise(r => setTimeout(r, 10));
      }
      toast.success('Directory purged successfully.');
      setSelectedEmployees([]);
    } catch (e: any) {
      toast.error(e.message || 'Purge failed');
    } finally {
      setDeleteProgress({ active: false, current: 0, total: 0, percent: 0 });
    }
  };

  const handleBulkStatusToggle = async () => {
    if (quotaExceeded) return;
    const updatedEmployees = employees.map(emp => {
      if (selectedEmployees.includes(emp.id)) {
        return { ...emp, status: emp.status === 'Active' ? 'Inactive' : 'Active' as 'Active' | 'Inactive' };
      }
      return emp;
    });
    await setEmployees(updatedEmployees);
    toast.success(`Updated status for ${selectedEmployees.length} employees`);
    setSelectedEmployees([]);
  };

  const handleExportCSV = () => {
    const exportData = filteredEmployees.map((emp, i) => ({
      'S.No': i + 1,
      'Emp ID': emp.id,
      'Name': emp.name,
      'Department': emp.department,
      'Designation': emp.designation,
      'Shift': settings.shifts?.find(s => s.id === emp.shiftId)?.name || '-',
      'OT Eligible': emp.otEligible ? 'Yes' : 'No',
      'Weekly Off': emp.weeklyOff,
      'Status': emp.status
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Employees');
    XLSX.writeFile(workbook, `Employee_Directory_${format(new Date(), 'yyyy-MM-dd')}.csv`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (quotaExceeded) {
      alert('Cannot save: Database write limit reached.');
      return;
    }

    const newErrors: { name?: string; id?: string } = {};
    if (!formData.name?.trim()) newErrors.name = 'Employee name is required';
    if (!formData.id?.trim()) newErrors.id = 'Employee ID is required';
    
    // Check for duplicate ID if adding new
    if (!editingId && formData.id && employees.some(emp => emp.id === formData.id)) {
      newErrors.id = 'Employee ID already exists';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    if (editingId) {
      await updateEmployee(editingId, formData);
      toast.success('Employee updated successfully');
    } else {
      const newEmp: Employee = {
        ...formData,
        id: formData.id!.trim(),
        joiningDate: formData.joiningDate || new Date().toISOString().split('T')[0],
      } as Employee;
      await addEmployee(newEmp);
      toast.success('Employee added successfully');
    }
    setIsModalOpen(false);
    resetForm();
  };

  const resetForm = () => {
    setFormData({ 
      name: '', 
      department: '', 
      designation: '', 
      contractorName: '',
      shiftId: settings.shifts?.[0]?.id || '', 
      status: 'Active', 
      contactNumber: '',
      weeklyOff: 'Sunday',
      otEligible: true,
      targetWorkingHours: 8 
    });
    setEditingId(null);
    setErrors({});
  };

  const editEmp = (emp: Employee) => {
    setFormData(emp);
    setEditingId(emp.id);
    setIsModalOpen(true);
  };

  const deleteEmp = async (id: string) => {
    if (quotaExceeded) return;
    if (confirm('Are you sure you want to delete this employee?')) {
      try {
        await deleteEmployeesBatch([id]);
        setSelectedEmployees(prev => prev.filter(eid => eid !== id));
        toast.success('Employee deleted successfully');
      } catch (err: any) {
        toast.error("Failed to delete employee: " + err.message);
      }
    }
  };

  const handleBulkShiftUpdate = async () => {
    if (quotaExceeded) return;
    if (!bulkShiftId) return;
    const updatedEmployees = employees.map(emp => 
      selectedEmployees.includes(emp.id) ? { ...emp, shiftId: bulkShiftId } : emp
    );
    await setEmployees(updatedEmployees);
    setIsBulkShiftModalOpen(false);
    setSelectedEmployees([]);
    setBulkShiftId('');
  };

  const toggleSelectAll = () => {
    if (selectedEmployees.length === filteredEmployees.length) {
      setSelectedEmployees([]);
    } else {
      setSelectedEmployees(filteredEmployees.map(e => e.id));
    }
  };

  const toggleSelectEmployee = (id: string) => {
    setSelectedEmployees(prev => 
      prev.includes(id) ? prev.filter(eid => eid !== id) : [...prev, id]
    );
  };

  // Import preview & progress state
  interface ImportPreview {
    totalRows: number;
    validCount: number;
    newCount: number;
    existingCount: number;
    duplicateBioInFile: number;
    errors: string[];
    parsedEmps: Employee[];
  }
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [duplicateMode, setDuplicateMode] = useState<'skip' | 'update'>('skip');
  const [importProgress, setImportProgress] = useState<{ active: boolean; current: number; total: number; percent: number; currentName: string }>({
    active: false,
    current: 0,
    total: 0,
    percent: 0,
    currentName: ''
  });
  const [deleteProgress, setDeleteProgress] = useState<{ active: boolean; current: number; total: number; percent: number }>({
    active: false,
    current: 0,
    total: 0,
    percent: 0
  });

  const downloadTemplate = () => {
    const template = [
      {
        'Employee ID / Bio ID': 1256,
        'Employee Name': 'Ram Sharma',
        'Gender': 'Male',
        'Marital Status (Single/Married)': 'Single',
        'Date of Joining (YYYY-MM-DD)': '2024-01-15',
        'Department': 'Production',
        'Section': 'Assembly',
        'Designation': 'Machine Operator',
        'Employment Type (Permanent/Contract/Probation)': 'Permanent',
        'Grade': 'G1',
        'Level': 'L1',
        'Reporting Manager': 'Hari Prasad',
        'Weekly Off': 'Sunday',
        'Shift': 'Day Shift',
        'Status (Active/Inactive)': 'Active',
        'Basic Salary': 30000,
        'Dearness Allowance': 5000,
        'Other Allowance': 5000,
        'PAN Number': '123456789',
        'SSF Number': 'SSF100234',
        'CIT Number': 'CIT200567',
        'Tax Status (Single/Married)': 'Single',
        'Bank Name': 'Nabil Bank',
        'Bank Account Number': '0123456789012',
        'Branch': 'Kathmandu',
        'Phone': '9841234567',
        'Email': 'ram@example.com',
        'Address': 'Kathmandu, Nepal',
        'Emergency Contact': '9801234567'
      },
      {
        'Employee ID / Bio ID': 2,
        'Employee Name': 'Sita Devi',
        'Gender': 'Female',
        'Marital Status (Single/Married)': 'Married',
        'Date of Joining (YYYY-MM-DD)': '2023-05-10',
        'Department': 'Operations',
        'Section': 'Quality Control',
        'Designation': 'Quality Inspector',
        'Employment Type (Permanent/Contract/Probation)': 'Permanent',
        'Grade': 'G2',
        'Level': 'L2',
        'Reporting Manager': 'Gita Karki',
        'Weekly Off': 'Saturday',
        'Shift': 'Day Shift',
        'Status (Active/Inactive)': 'Active',
        'Basic Salary': 35000,
        'Dearness Allowance': 6000,
        'Other Allowance': 4000,
        'PAN Number': '987654321',
        'SSF Number': 'SSF100888',
        'CIT Number': 'CIT200999',
        'Tax Status (Single/Married)': 'Married',
        'Bank Name': 'Global IME Bank',
        'Bank Account Number': '9876543210987',
        'Branch': 'Lalitpur',
        'Phone': '9851234567',
        'Email': 'sita@example.com',
        'Address': 'Lalitpur, Nepal',
        'Emergency Contact': '9811234567'
      }
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Employee_Master");
    XLSX.writeFile(wb, "HRIS_Employee_Import_Template.xlsx");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImportFile(file);
      setImportPreview(null);
      parseAndPreviewFile(file);
    }
  };

  const parseAndPreviewFile = (file: File) => {
    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(worksheet) as any[];

        const existingMap = new Map(employees.map(e => [e.id.trim(), e]));
        const existingNormMap = new Map(employees.map(e => [normalizeEmployeeId(e.id), e]));

        const fileBioIds = new Set<string>();
        let duplicateInFileCount = 0;
        let validCount = 0;
        let existingCount = 0;
        let newCount = 0;
        const errors: string[] = [];
        const parsedEmps: Employee[] = [];

        json.forEach((row, idx) => {
          const rowNum = idx + 2; // header line 1
          const rawId = row['Employee ID / Bio ID'] || row['Employee ID'] || row['Bio ID'] || row['Emp ID'] || row['EMP ID'] || row['ID'] || row['AC-No.'] || row['Employee No.'];
          if (!rawId) {
            errors.push(`Row ${rowNum}: Missing Employee ID / Bio ID`);
            return;
          }
          const id = String(rawId).trim();
          const name = String(row['Employee Name'] || row['Name'] || row['Emp Name'] || '').trim();

          if (!name) {
            errors.push(`Row ${rowNum} (Bio ID ${id}): Missing Employee Name`);
            return;
          }

          if (fileBioIds.has(id)) {
            duplicateInFileCount++;
            errors.push(`Row ${rowNum}: Duplicate Bio ID ${id} within file`);
          } else {
            fileBioIds.add(id);
          }

          const normId = normalizeEmployeeId(id);
          const isExisting = existingMap.has(id) || (normId && existingNormMap.has(normId));
          if (isExisting) {
            existingCount++;
          } else {
            newCount++;
          }
          validCount++;

          const basicSalary = Number(row['Basic Salary'] || row['Basic'] || 0);
          const dearnessAllowance = Number(row['Dearness Allowance'] || row['DA'] || 0);
          const otherAllowance = Number(row['Other Allowance'] || row['Allowances'] || 0);
          const grossSalary = basicSalary + dearnessAllowance + otherAllowance;
          const employerSSF = Math.round(basicSalary * 0.20);
          const monthlyCTC = grossSalary + employerSSF;

          const shiftName = String(row['Shift'] || row['Shift Name'] || 'Day Shift').trim();
          const shift = settings.shifts?.find(s => s.name.toLowerCase() === shiftName.toLowerCase());

          const empRecord: Employee = {
            id,
            name,
            gender: row['Gender'] as any || 'Male',
            maritalStatus: String(row['Marital Status (Single/Married)'] || row['Marital Status'] || row['Tax Status'] || 'Single').toLowerCase().includes('marr') ? 'Married' : 'Single',
            joiningDate: row['Date of Joining (YYYY-MM-DD)'] || row['Joining Date'] || new Date().toISOString().split('T')[0],
            department: String(row['Department'] || row['Dept'] || 'General').trim(),
            section: String(row['Section'] || '').trim(),
            designation: String(row['Designation'] || row['Desig'] || 'Staff').trim(),
            employmentType: (row['Employment Type (Permanent/Contract/Probation)'] || row['Employment Type'] || 'Permanent') as any,
            grade: String(row['Grade'] || '').trim(),
            level: String(row['Level'] || '').trim(),
            reportingManager: String(row['Reporting Manager'] || '').trim(),
            weeklyOff: row['Weekly Off'] || 'Sunday',
            shiftId: shift?.id || settings.shifts?.[0]?.id || '',
            status: String(row['Status (Active/Inactive)'] || row['Status'] || 'Active').toLowerCase().includes('inact') ? 'Inactive' : 'Active',
            basicSalary,
            dearnessAllowance,
            otherAllowance,
            grossSalary,
            employerSSF,
            monthlyCTC,
            panNumber: String(row['PAN Number'] || row['PAN'] || '').trim(),
            ssfNumber: String(row['SSF Number'] || row['SSF No'] || '').trim(),
            citNumber: String(row['CIT Number'] || row['CIT No'] || '').trim(),
            bankName: String(row['Bank Name'] || row['Bank'] || '').trim(),
            accountNumber: String(row['Bank Account Number'] || row['Account No'] || '').trim(),
            branchName: String(row['Branch'] || '').trim(),
            phone: String(row['Phone'] || row['Contact'] || '').trim(),
            email: String(row['Email'] || '').trim(),
            address: String(row['Address'] || '').trim(),
            emergencyContact: String(row['Emergency Contact'] || '').trim(),
            otEligible: true,
            targetWorkingHours: 8
          };

          parsedEmps.push(empRecord);
        });

        setImportPreview({
          totalRows: json.length,
          validCount,
          newCount,
          existingCount,
          duplicateBioInFile: duplicateInFileCount,
          errors,
          parsedEmps
        });
      } catch (e: any) {
        toast.error("Failed to parse Excel file. Please ensure it follows standard format.");
      } finally {
        setIsUploading(false);
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleExecuteImport = async () => {
    if (!importPreview || importPreview.parsedEmps.length === 0) {
      toast.error("No valid employee records to import");
      return;
    }

    if (quotaExceeded) {
      toast.error('Cannot import: Database write limit reached.');
      return;
    }

    const totalToProcess = importPreview.parsedEmps.length;
    setImportProgress({
      active: true,
      current: 0,
      total: totalToProcess,
      percent: 0,
      currentName: 'Preparing transaction...'
    });

    try {
      const existingMap = new Map(employees.map(e => [e.id.trim(), e]));
      const updatedList = [...employees];

      const batchSize = 25;
      for (let i = 0; i < importPreview.parsedEmps.length; i += batchSize) {
        const batch = importPreview.parsedEmps.slice(i, i + batchSize);

        for (const newEmp of batch) {
          const idx = updatedList.findIndex(e => e.id.trim() === newEmp.id.trim() || normalizeEmployeeId(e.id) === normalizeEmployeeId(newEmp.id));
          if (idx >= 0) {
            if (duplicateMode === 'update') {
              updatedList[idx] = { ...updatedList[idx], ...newEmp };
            }
            // skip if duplicateMode === 'skip'
          } else {
            updatedList.push(newEmp);
          }
        }

        const processedCount = Math.min(i + batchSize, totalToProcess);
        const pct = Math.round((processedCount / totalToProcess) * 100);
        const lastEmpName = batch[batch.length - 1]?.name || 'Importing...';

        setImportProgress({
          active: true,
          current: processedCount,
          total: totalToProcess,
          percent: pct,
          currentName: `Updating Bio ID ${batch[batch.length - 1]?.id} (${lastEmpName})`
        });

        // Small pause to yield main thread for React UI progress render
        await new Promise(r => setTimeout(r, 15));
      }

      await setEmployees(updatedList);
      toast.success(`Import complete! Processed ${totalToProcess} employee records.`);
      setIsImportModalOpen(false);
      setImportFile(null);
      setImportPreview(null);
    } catch (err: any) {
      toast.error(`Import failed: ${err.message || 'Unknown error'}`);
    } finally {
      setImportProgress({ active: false, current: 0, total: 0, percent: 0, currentName: '' });
    }
  };



  return (
    <div className="space-y-6">
      <PageHeader 
        title="Employee Directory" 
        description={`Manage ${employees.length} enterprise identities and access records`}
        icon={Users}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={() => recalculate()} disabled={isInitializing}>
              <RefreshCw size={14} className={isInitializing ? "animate-spin" : ""} />
              {isInitializing ? 'Syncing' : 'Sync'}
            </Button>
            <Button variant="outline" onClick={handleExportCSV}>
              <Download size={14} /> Export
            </Button>
            <Button variant="outline" onClick={() => setIsImportModalOpen(true)}>
              <FileUp size={14} /> Bulk Import
            </Button>
            {employees.length > 0 && (
              <Button variant="danger" onClick={handlePurgeAll}>
                <Trash2 size={14} /> Purge All
              </Button>
            )}
            <Button onClick={() => {
                 resetForm();
                 setIsModalOpen(true);
              }}>
              <Plus size={14} /> New Identity
            </Button>
          </div>
        }
      />

      <Card className="p-4">
        <div className="flex flex-col md:flex-row items-center gap-4">
          <div className="flex-1 w-full">
            <Input 
              placeholder="Search by Name, Department, or ID..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              icon={<Search size={18} className="text-slate-400" />}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <div className="w-full sm:w-48">
              <MultiSelect 
                options={departments}
                selected={deptFilter}
                onChange={setDeptFilter}
                placeholder="All Departments"
              />
            </div>
            <div className="w-full sm:w-48">
              <MultiSelect 
                options={designations}
                selected={designationFilter}
                onChange={setDesignationFilter}
                placeholder="All Designations"
              />
            </div>
            <div className="w-full sm:w-48">
              <MultiSelect 
                options={contractors}
                selected={contractorFilter}
                onChange={setContractorFilter}
                placeholder="All Contractors"
              />
            </div>
          </div>
        </div>

        {selectedEmployees.length > 0 && (
          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-2">{selectedEmployees.length} Selected:</span>
            <Button variant="outline" size="sm" onClick={() => setIsBulkShiftModalOpen(true)}>
              <Edit2 size={14} /> Batch Shift
            </Button>
            <Button variant="outline" size="sm" onClick={handleBulkStatusToggle}>
              <RefreshCw size={14} /> Toggle Status
            </Button>
            <Button variant="danger" size="sm" onClick={handleBulkDelete}>
              <Trash2 size={14} /> Purge Records
            </Button>
          </div>
        )}
      </Card>

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse table-fixed min-w-[800px]">
            <thead className="bg-slate-50 dark:bg-slate-900/50">
              <tr className="text-[12px] font-semibold text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                <th className="px-4 py-3 w-12 text-center">
                  <input 
                    type="checkbox" 
                    checked={selectedEmployees.length > 0 && selectedEmployees.length === filteredEmployees.length}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                  />
                </th>
                <th className="px-4 py-3 w-16 text-center">S.No</th>
                <th className="px-6 py-3 w-32">Emp ID</th>
                <th className="px-6 py-3 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors" onClick={() => handleSort('name')}>
                  <div className="flex items-center gap-1">
                    Name {sortConfig?.key === 'name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </div>
                </th>
                <th className="px-6 py-3 cursor-pointer hover:text-slate-900 dark:hover:text-white transition-colors" onClick={() => handleSort('department')}>
                  <div className="flex items-center gap-1">
                    Department {sortConfig?.key === 'department' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                  </div>
                </th>
                <th className="px-6 py-3">Contractor</th>
                <th className="px-6 py-3 w-32">Shift</th>
                <th className="px-6 py-3 w-20 text-center">TWH</th>
                <th className="px-6 py-3 w-32 text-center">Status</th>
                <th className="px-6 py-3 w-24 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-[13px]">
              {paginatedEmployees.length > 0 ? paginatedEmployees.map((emp, index) => {
                const shift = settings.shifts?.find(s => s.id === emp.shiftId);
                const sNo = (currentPage - 1) * itemsPerPage + index + 1;
                return (
                <tr 
                  key={emp.id} 
                  onClick={() => openEmployeeProfile(emp.id)}
                  className={cn(
                    "hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer group",
                    selectedEmployees.includes(emp.id) && "bg-primary/[0.03] dark:bg-primary/[0.05]"
                  )}
                >
                  <td className="px-4 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                    <input 
                      type="checkbox" 
                      checked={selectedEmployees.includes(emp.id)}
                      onChange={() => toggleSelectEmployee(emp.id)}
                      className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                    />
                  </td>
                  <td className="px-4 py-2.5 text-center text-slate-400 font-mono text-[11px]">{sNo}</td>
                  <td className="px-6 py-2.5 font-mono text-slate-500 group-hover:text-primary transition-colors">{emp.id}</td>
                  <td className="px-6 py-2.5">
                    <div className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-500 uppercase shrink-0">
                        {emp.name.charAt(0)}
                      </div>
                      <span className="font-medium text-slate-900 dark:text-white truncate">{emp.name}</span>
                    </div>
                  </td>
                  <td className="px-6 py-2.5 text-slate-600 dark:text-slate-400">{emp.department || '-'}</td>
                  <td className="px-6 py-2.5 text-slate-500 dark:text-slate-500">{emp.contractorName || '-'}</td>
                  <td className="px-6 py-2.5">
                    <Badge variant="muted" className="text-[10px] font-semibold">{shift?.name || '-'}</Badge>
                  </td>
                  <td className="px-6 py-2.5 text-center font-semibold text-slate-600 dark:text-slate-400">
                    {emp.targetWorkingHours || 8}
                  </td>
                  <td className="px-6 py-2.5 text-center">
                    <Badge variant={emp.status === 'Active' ? 'success' : 'muted'} className="min-w-[60px] justify-center">
                      {emp.status}
                    </Badge>
                  </td>
                  <td className="px-6 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button variant="ghost" size="sm" onClick={() => editEmp(emp)} className="h-8 w-8 p-0" title="Edit Identity">
                        <Edit2 size={14} />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => deleteEmp(emp.id)} className="h-8 w-8 p-0 text-slate-400 hover:text-danger" title="Delete Identity">
                        <Trash2 size={14} />
                      </Button>
                    </div>
                  </td>
                </tr>
                );
              }) : (
                <tr>
                  <td colSpan={10} className="px-6 py-12 text-center text-slate-400 font-medium italic">
                    No employees found matching the filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Showing {Math.min(filteredEmployees.length, (currentPage - 1) * itemsPerPage + 1)}-{Math.min(filteredEmployees.length, currentPage * itemsPerPage)} of {filteredEmployees.length}
            </span>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft size={16} />
              </Button>
              <div className="flex items-center gap-1">
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  let pageNum = 1;
                  if (totalPages <= 5) pageNum = i + 1;
                  else if (currentPage <= 3) pageNum = i + 1;
                  else if (currentPage >= totalPages - 2) pageNum = totalPages - 4 + i;
                  else pageNum = currentPage - 2 + i;

                  return (
                    <Button
                      key={pageNum}
                      variant={currentPage === pageNum ? 'primary' : 'outline'}
                      size="sm"
                      onClick={() => setCurrentPage(pageNum)}
                      className="w-8 h-8 p-0"
                    >
                      {pageNum}
                    </Button>
                  );
                })}
              </div>
              <Button 
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>
        )}
      </Card>

      {/* Bulk Shift Modal */}
      {isBulkShiftModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-[100] backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-slate-900">Bulk Update Shift</h3>
              <button onClick={() => setIsBulkShiftModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400"><X /></button>
            </div>
            <p className="text-sm text-slate-500 mb-6 font-medium">Updating shift for <span className="text-indigo-600 font-bold">{selectedEmployees.length}</span> selected employees.</p>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Select New Shift</label>
                <div className="grid grid-cols-1 gap-2">
                  {settings.shifts?.map(shift => (
                    <button 
                      key={shift.id}
                      onClick={() => setBulkShiftId(shift.id)}
                      className={`p-4 text-left border rounded-xl transition-all ${bulkShiftId === shift.id ? 'border-indigo-600 bg-indigo-50 ring-2 ring-indigo-500/20' : 'border-slate-200 hover:bg-slate-50'}`}
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-bold text-slate-900">{shift.name}</p>
                        <span className="text-[10px] font-mono bg-white px-2 py-0.5 rounded border border-slate-100">{shift.startTime} - {shift.endTime}</span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-8">
                <button 
                  onClick={() => setIsBulkShiftModalOpen(false)}
                  className="px-6 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleBulkShiftUpdate}
                  disabled={!bulkShiftId}
                  className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold shadow-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Update Shifts
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Manual ENTRY Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-[100] backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-xl w-full p-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-slate-900">{editingId ? 'Edit' : 'Add'} Employee</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400"><X /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-1">
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Employee ID *</label>
                  <input 
                    type="text" 
                    value={formData.id || ''} 
                    onChange={e => {
                      setFormData({...formData, id: e.target.value});
                      if (errors.id) setErrors(prev => ({ ...prev, id: undefined }));
                    }} 
                    className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 ${errors.id ? 'border-red-500 bg-red-50' : 'border-slate-300 bg-white'}`}
                    placeholder="E.g. EMP001"
                  />
                  {errors.id && <p className="text-[10px] text-red-500 font-bold mt-1 uppercase">{errors.id}</p>}
                </div>
                <div className="col-span-1">
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Full Name *</label>
                  <input 
                    type="text" 
                    value={formData.name || ''} 
                    onChange={e => {
                      setFormData({...formData, name: e.target.value});
                      if (errors.name) setErrors(prev => ({ ...prev, name: undefined }));
                    }} 
                    className={`w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 ${errors.name ? 'border-red-500 bg-red-50' : 'border-slate-300 bg-white'}`} 
                  />
                  {errors.name && <p className="text-[10px] text-red-500 font-bold mt-1 uppercase">{errors.name}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Department</label>
                  <input type="text" value={formData.department || ''} onChange={e => setFormData({...formData, department: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Designation</label>
                  <input type="text" value={formData.designation || ''} onChange={e => setFormData({...formData, designation: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Contractor Name</label>
                  <input type="text" value={formData.contractorName || ''} onChange={e => setFormData({...formData, contractorName: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Shift</label>
                  <select 
                    value={formData.shiftId} 
                    onChange={e => setFormData({...formData, shiftId: e.target.value})} 
                    className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select Shift</option>
                    {settings.shifts?.map(s => <option key={s.id} value={s.id}>{s.name} ({s.startTime}-{s.endTime})</option>)}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Weekly Off</label>
                  <select value={formData.weeklyOff} onChange={e => setFormData({...formData, weeklyOff: e.target.value})} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500">
                    {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(day => <option key={day} value={day}>{day}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Working Hours</label>
                  <input type="number" value={formData.targetWorkingHours} onChange={e => setFormData({...formData, targetWorkingHours: Number(e.target.value)})} className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                </div>
                <div className="flex items-center gap-2 pt-6">
                  <input 
                    type="checkbox" 
                    id="otEligible"
                    checked={formData.otEligible} 
                    onChange={e => setFormData({...formData, otEligible: e.target.checked})} 
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <label htmlFor="otEligible" className="text-sm font-semibold text-slate-700">OT Eligible</label>
                </div>
              </div>

              {/* Salary & Statutory Setup */}
              <div className="border-t border-slate-200 pt-4 space-y-4">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Salary Master & Statutory Tax Configuration</h4>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Basic Salary (NPR)</label>
                    <input 
                      type="number" 
                      value={formData.basicSalary ?? ''} 
                      onChange={e => setFormData({...formData, basicSalary: Number(e.target.value)})} 
                      placeholder="e.g. 35000"
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono font-bold" 
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Allowances (NPR)</label>
                    <input 
                      type="number" 
                      value={formData.allowances ?? ''} 
                      onChange={e => setFormData({...formData, allowances: Number(e.target.value)})} 
                      placeholder="e.g. 8750"
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono font-bold" 
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Tax Status (IRD Nepal)</label>
                    <select 
                      value={formData.maritalStatus || 'Single'} 
                      onChange={e => setFormData({...formData, maritalStatus: e.target.value as 'Single' | 'Married'})} 
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                    >
                      <option value="Single">Single (Slab 1 Limit Rs. 5,00,000)</option>
                      <option value="Married">Married (Slab 1 Limit Rs. 6,00,000)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">SSF Enrollment</label>
                    <select 
                      value={formData.ssfEnrolled === false ? 'No' : 'Yes'} 
                      onChange={e => setFormData({...formData, ssfEnrolled: e.target.value === 'Yes'})} 
                      className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold"
                    >
                      <option value="Yes">Enrolled (11% Employee, 20% Employer)</option>
                      <option value="No">Non-SSF (10% PF, No 1% SST Waiver)</option>
                    </select>
                  </div>
                </div>

                {/* Auto Calculated Gross & CTC Breakdown Box */}
                {Boolean(formData.basicSalary) && (
                  <div className="bg-indigo-50/60 dark:bg-slate-800 p-3.5 rounded-xl border border-indigo-100 grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <span className="text-slate-400 text-[10px] uppercase font-bold block">Gross Salary</span>
                      <strong className="text-slate-900 dark:text-white font-mono text-sm">
                        Rs. {((formData.basicSalary || 0) + (formData.allowances || 0)).toLocaleString()}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] uppercase font-bold block">Employer SSF (20%)</span>
                      <strong className="text-indigo-600 font-mono text-sm">
                        Rs. {Math.round((formData.basicSalary || 0) * 0.20).toLocaleString()}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400 text-[10px] uppercase font-bold block">Total Monthly CTC</span>
                      <strong className="text-emerald-600 font-mono text-sm font-black">
                        Rs. {(((formData.basicSalary || 0) + (formData.allowances || 0)) + Math.round((formData.basicSalary || 0) * 0.20)).toLocaleString()}
                      </strong>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-3 mt-8">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-6 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">Cancel</button>
                <button type="submit" className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold shadow-lg hover:bg-indigo-700 transition-colors">Save Employee</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* IMPORT Modal */}
      {isImportModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-[100] backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Bulk Import Employees</h3>
                <p className="text-xs text-slate-500">Import Master Data via standard Excel template</p>
              </div>
              <button 
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportFile(null);
                  setImportPreview(null);
                }} 
                className="p-2 hover:bg-slate-100 rounded-lg text-slate-400"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="space-y-4">
              {/* File Upload Drop Zone */}
              <div className={cn(
                "p-5 border-2 border-dashed rounded-xl text-center space-y-3 transition-all",
                importFile ? "border-indigo-500 bg-indigo-50/20" : "border-slate-200"
              )}>
                <div className="flex justify-center">
                  <FileUp className={cn("w-8 h-8 transition-colors", importFile ? "text-indigo-600" : "text-slate-400")} />
                </div>
                <div className="text-xs text-slate-600 font-medium">
                  {importFile ? (
                    <div className="space-y-1">
                      <p className="text-slate-900 font-bold text-sm">{importFile.name}</p>
                      <p className="text-[10px] uppercase tracking-widest text-emerald-600 font-bold">File Loaded & Parsed</p>
                    </div>
                  ) : (
                    "Select an Excel workbook (.xlsx) containing employee records."
                  )}
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept=".xlsx, .xls" 
                  className="hidden" 
                />
                
                <div className="flex items-center justify-center gap-2 pt-1">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all"
                  >
                    {importFile ? "Change File" : "Choose Excel File"}
                  </button>
                  <button 
                    onClick={downloadTemplate}
                    className="px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-600 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5" /> Download Template
                  </button>
                </div>
              </div>

              {/* Validation & Preview Summary Box */}
              {importPreview && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-700">Import Validation Summary</h4>
                    <span className="text-xs font-mono font-bold text-slate-500">{importPreview.totalRows} Total Rows</span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center font-mono">
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Valid Rows</span>
                      <strong className="text-emerald-600 text-base">{importPreview.validCount}</strong>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">New Bio IDs</span>
                      <strong className="text-indigo-600 text-base">{importPreview.newCount}</strong>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">Existing IDs</span>
                      <strong className="text-amber-600 text-base">{importPreview.existingCount}</strong>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                      <span className="text-[10px] text-slate-400 uppercase font-bold block">In-File Dupes</span>
                      <strong className="text-red-500 text-base">{importPreview.duplicateBioInFile}</strong>
                    </div>
                  </div>

                  {/* Duplicate Strategy Option */}
                  {importPreview.existingCount > 0 && (
                    <div className="bg-amber-50/80 border border-amber-200 rounded-lg p-3 space-y-2 text-xs">
                      <p className="font-bold text-amber-900">Handling Existing Employee Records ({importPreview.existingCount} matches found):</p>
                      <div className="flex items-center gap-4 text-slate-700 font-medium">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input 
                            type="radio" 
                            name="duplicateMode" 
                            value="skip" 
                            checked={duplicateMode === 'skip'} 
                            onChange={() => setDuplicateMode('skip')}
                            className="text-indigo-600 focus:ring-indigo-500"
                          />
                          <span>Skip Existing (Safe Default)</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input 
                            type="radio" 
                            name="duplicateMode" 
                            value="update" 
                            checked={duplicateMode === 'update'} 
                            onChange={() => setDuplicateMode('update')}
                            className="text-indigo-600 focus:ring-indigo-500"
                          />
                          <span>Update Existing Master Data</span>
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Validation Error Logs */}
                  {importPreview.errors.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 space-y-1.5 text-xs">
                      <p className="font-bold text-red-800">Validation Warnings ({importPreview.errors.length}):</p>
                      <ul className="max-h-24 overflow-y-auto space-y-1 text-red-700 font-mono text-[11px] list-disc pl-4">
                        {importPreview.errors.slice(0, 5).map((err, i) => (
                          <li key={i}>{err}</li>
                        ))}
                        {importPreview.errors.length > 5 && (
                          <li className="font-bold text-red-900">+ {importPreview.errors.length - 5} more row warnings</li>
                        )}
                      </ul>
                    </div>
                  )}

                  <div className="flex justify-end gap-3 pt-2 border-t border-slate-200">
                    <button 
                      type="button" 
                      onClick={() => {
                        setIsImportModalOpen(false);
                        setImportFile(null);
                        setImportPreview(null);
                      }} 
                      className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors"
                    >
                      Cancel Import
                    </button>
                    <button 
                      type="button" 
                      onClick={handleExecuteImport}
                      disabled={importPreview.validCount === 0 || importProgress.active}
                      className="px-5 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold shadow-md hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                      <FileUp className="w-4 h-4" />
                      Import {importPreview.validCount} Valid Records
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* IMPORT PROGRESS MODAL */}
      {importProgress.active && (
        <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center p-4 z-[110] backdrop-blur-md">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 text-center">
            <div className="w-12 h-12 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto text-indigo-600">
              <RefreshCw className="w-6 h-6 animate-spin" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Importing Employee Master Data</h3>
              <p className="text-xs text-slate-500 font-medium mt-1">{importProgress.currentName}</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono font-bold">
                <span className="text-slate-600">{importProgress.current} / {importProgress.total}</span>
                <span className="text-indigo-600">{importProgress.percent}%</span>
              </div>
              <div className="w-full h-3 bg-slate-100 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-indigo-600 transition-all duration-150 rounded-full"
                  style={{ width: `${importProgress.percent}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      )}
      {/* DELETE PROGRESS MODAL */}
      {deleteProgress.active && (
        <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center p-4 z-[110] backdrop-blur-md">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 text-center">
            <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center mx-auto text-red-600">
              <Trash2 className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">Deleting Employee Records</h3>
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
