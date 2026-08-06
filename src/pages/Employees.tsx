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
    
    if (!confirm(`Are you sure you want to delete ${selectedEmployees.length} selected employees? This action cannot be undone.`)) {
      return;
    }

    const tId = toast.loading(`Deleting ${selectedEmployees.length} employees...`);
    try {
      await deleteEmployeesBatch(selectedEmployees);
      toast.success('Employees deleted successfully', { id: tId });
      setSelectedEmployees([]);
    } catch (e: any) {
      toast.error(e.message || 'Failed to delete employees', { id: tId });
    }
  };

  const handlePurgeAll = async () => {
    const count = employees.length;
    if (count === 0) return;

    if (!confirm(`CRITICAL: This will permanently delete ALL ${count} employees from the directory. Are you sure you want to proceed?`)) {
      return;
    }

    const confirmation = prompt(`FINAL WARNING: This is irreversible. Type "PURGE" to confirm.`);
    if (confirmation !== 'PURGE') {
      return;
    }

    const tId = toast.loading(`Purging all ${count} records...`);
    try {
      await deleteEmployeesBatch(employees.map(e => e.id));
      toast.success('Directory purged successfully. You can now re-import.', { id: tId });
      setSelectedEmployees([]);
    } catch (e: any) {
      toast.error(e.message || 'Purge failed', { id: tId });
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

  const downloadTemplate = () => {
    const template = [
      {
        'Employee ID': 'EMP001',
        'Name': 'John Doe',
        'Department': 'Operations',
        'Designation': 'Machine Operator',
        'Contractor': 'ABC Manpower',
        'Shift': 'Day Shift',
        'Weekly Off': 'Sunday',
        'OT Eligible (Yes/No)': 'Yes',
        'Target Working Hours': 8
      }
    ];
    const ws = XLSX.utils.json_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Employees");
    XLSX.writeFile(wb, "Employee_Import_Template.xlsx");
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImportFile(file);
    }
  };

  const handleUpload = async () => {
    if (!importFile) {
      toast.error("Please select a file first");
      return;
    }
    
    if (quotaExceeded) {
      toast.error('Cannot import: Database write limit reached.');
      return;
    }

    setIsUploading(true);
    const tId = toast.loading('Processing employee data...');

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const data = new Uint8Array(event.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(worksheet) as any[];

        const importedEmps: Employee[] = json.map(row => {
          const rawId = row['Employee ID'] || row['Emp ID'] || row['EMP ID'] || row['ID'] || row['Employee No'] || row['AC-No.'] || row['Employee No.'] || generateId();
          const id = String(rawId).trim();
          const shiftName = String(row['Shift'] || row['Shift Name'] || 'Day Shift').trim();
          const shift = settings.shifts?.find(s => s.name.toLowerCase() === shiftName.toLowerCase());
          
          return {
            id,
            name: String(row['Name'] || row['Employee Name'] || row['Emp Name'] || 'Unknown').trim(),
            department: String(row['Department'] || row['Dept'] || '').trim(),
            designation: String(row['Designation'] || row['Desig'] || '').trim(),
            contractorName: String(row['Contractor'] || row['Contractor Name'] || row['Contract'] || '').trim(),
            shiftId: shift?.id || settings.shifts?.[0]?.id || '',
            status: 'Active',
            joiningDate: new Date().toISOString().split('T')[0],
            weeklyOff: row['Weekly Off'] || 'Sunday',
            otEligible: String(row['OT Eligible (Yes/No)'] || row['OT Eligible'] || 'No').toLowerCase().includes('yes'),
            targetWorkingHours: Number(row['Target Working Hours'] || row['Target Hours']) || 8
          } as Employee;
        });

        // Build quick lookup map for raw JSON rows by employee ID
        const jsonMap = new Map(json.map(r => [
          String(r['Employee ID'] || r['Emp ID'] || r['ID'] || r['Employee No'] || r['AC-No.'] || r['Employee No.'] || '').trim(),
          r
        ]));

        // Try to handle shift name mapping more robustly if initial mapping failed
        importedEmps.forEach(emp => {
          if (!emp.shiftId || emp.shiftId === settings.shifts?.[0]?.id) {
            const rawRow = jsonMap.get(emp.id);
            if (rawRow) {
              const sName = String(rawRow['Shift'] || rawRow['Shift Name'] || '').trim().toLowerCase();
              if (sName) {
                // If user says "Day" but we have "Day Shift", let's try to match
                const match = settings.shifts?.find(s => 
                  s.name.toLowerCase().includes(sName) || 
                  sName.includes(s.name.toLowerCase())
                );
                if (match) emp.shiftId = match.id;
              }
            }
          }
        });

        const existingIds = new Set(employees.map(e => e.id.trim()));
        const existingNormIds = new Set(employees.map(e => normalizeEmployeeId(e.id)).filter(Boolean));

        const newUniqueEmps = importedEmps.filter(e => {
          if (!e.id) return false;
          const trimmedId = e.id.trim();
          const normId = normalizeEmployeeId(trimmedId);
          
          // Avoid duplicates by exact ID OR by normalized similarity
          return !existingIds.has(trimmedId) && (!normId || !existingNormIds.has(normId));
        });
        
        if (newUniqueEmps.length === 0) {
          toast.info("No new unique employees found in file", { id: tId });
          setIsUploading(false);
          return;
        }

        await setEmployees([...employees, ...newUniqueEmps]);
        toast.success(`Successfully imported ${newUniqueEmps.length} new employees.`, { id: tId });
        setIsImportModalOpen(false);
        setImportFile(null);
      } catch (err) {
        toast.error("Failed to parse Excel file. Please ensure it follows the template format.", { id: tId });
      } finally {
        setIsUploading(false);
      }
    };
    reader.readAsArrayBuffer(importFile);
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
        <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-[100] backdrop-blur-sm">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-8">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-xl font-bold text-slate-900">Bulk Import Employees</h3>
              <button 
                onClick={() => {
                  setIsImportModalOpen(false);
                  setImportFile(null);
                }} 
                className="p-2 hover:bg-slate-100 rounded-lg text-slate-400"
              >
                <X />
              </button>
            </div>
            
            <div className="space-y-6">
              <div className={cn(
                "p-6 border-2 border-dashed rounded-xl text-center space-y-4 transition-all",
                importFile ? "border-indigo-500 bg-indigo-50/30" : "border-slate-200"
              )}>
                <div className="flex justify-center">
                  <FileUp className={cn("w-10 h-10 transition-colors", importFile ? "text-indigo-600" : "text-indigo-400")} />
                </div>
                <div className="text-sm text-slate-500 font-medium">
                  {importFile ? (
                    <div className="space-y-1">
                      <p className="text-slate-900 font-bold">{importFile.name}</p>
                      <p className="text-[10px] uppercase tracking-widest text-slate-400">File Loaded Successfully</p>
                    </div>
                  ) : (
                    "Select an Excel file to import employee master data."
                  )}
                </div>
                <input 
                  type="file" 
                  ref={fileInputRef} 
                  onChange={handleFileChange} 
                  accept=".xlsx, .xls" 
                  className="hidden" 
                />
                
                <div className="flex flex-col gap-2 pt-2">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      "px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest transition-all",
                      importFile 
                        ? "bg-white border border-slate-200 text-slate-600 hover:bg-slate-50" 
                        : "bg-indigo-600 text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700"
                    )}
                  >
                    {importFile ? "Change File (Load)" : "Choose File (Load)"}
                  </button>
                  
                  {importFile && (
                    <button 
                      onClick={handleUpload}
                      disabled={isUploading}
                      className="px-4 py-2.5 bg-emerald-600 text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-emerald-200 hover:bg-emerald-700 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {isUploading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <FileUp className="w-4 h-4" />}
                      {isUploading ? "Uploading..." : "Upload & Process"}
                    </button>
                  )}
                </div>
              </div>

              <div className="bg-slate-50 p-4 rounded-xl space-y-3">
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Instructions</h4>
                <p className="text-xs text-slate-600 leading-relaxed font-medium">
                  1. Use our standard template for best results.<br/>
                  2. Required fields: Employee ID (unique), Name.<br/>
                  3. Existing IDs in directory will be skipped.
                </p>
                <button 
                  onClick={downloadTemplate}
                  className="flex items-center gap-2 text-indigo-600 text-xs font-black hover:underline uppercase tracking-tighter"
                >
                  <Download className="w-3 h-3" /> Download Template
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
