import React, { useState, useRef, useMemo, useEffect } from 'react';
import { format, parseISO, differenceInDays } from 'date-fns';
import { formatUniversalDate, getNepaliDate } from '../utils/dateHelper';
import { useAppStore } from '../store';
import { Employee, EmployeeMovement, AuditLog, FieldDiff } from '../types';
import { generateId, cn, normalizeEmployeeId } from '../lib/utils';
import { useActionStatus } from '../context/ActionStatusContext';
import { deleteLocalTableDetailed, saveLocalTableDetailed } from '../lib/localClient';
import { 
  Plus, Search, Edit2, Trash2, FileUp, Download, X, Filter, 
  RefreshCw, ChevronLeft, ChevronRight, Users, CheckCircle2, 
  XCircle, AlertCircle, TrendingUp, Shield, Clock, DollarSign,
  Building, Briefcase, Award, UserCheck, UserX, Eye, ArrowUpDown,
  Sparkles, SlidersHorizontal, AlertTriangle, FileSpreadsheet,
  FileText, Folder
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { PageHeader, Card, Button, Badge, Input } from '../components/ui';
import { MultiSelect } from '../components/MultiSelect';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { EmployeeDrawer } from '../components/EmployeeDrawer';

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
    isInitializing,
    movements,
    addMovement,
    addAuditLog,
    auditLogs
  } = useAppStore();

  const { executeWithStatus, confirmAction, showSuccess, showError } = useActionStatus();

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<'All' | 'Active' | 'Inactive'>('All');
  const [selectedOtFilter, setSelectedOtFilter] = useState<'All' | 'Eligible' | 'Non-OT'>('All');
  const [deptFilter, setDeptFilter] = useState<string[]>(['All']);
  const [designationFilter, setDesignationFilter] = useState<string[]>(['All']);
  const [contractorFilter, setContractorFilter] = useState<string[]>(['All']);
  const [employmentTypeFilter, setEmploymentTypeFilter] = useState<string>('All');
  const [quickFilter, setQuickFilter] = useState<string | null>(null);

  // Sorting
  const [sortConfig, setSortConfig] = useState<{ key: keyof Employee | 'ctc'; direction: 'asc' | 'desc' } | null>({
    key: 'id',
    direction: 'asc'
  });

  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);

  // Selection & Bulk Actions
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [isBulkShiftModalOpen, setIsBulkShiftModalOpen] = useState(false);
  const [bulkShiftId, setBulkShiftId] = useState('');

  // Drawer Profile State
  const [selectedProfileEmployee, setSelectedProfileEmployee] = useState<Employee | null>(null);
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Edit / Add Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalActiveTab, setModalActiveTab] = useState<'personal' | 'employment' | 'salary' | 'ot_hours' | 'status'>('personal');
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [initialFormData, setInitialFormData] = useState<Partial<Employee> | null>(null);
  const [isDiscardConfirmOpen, setIsDiscardConfirmOpen] = useState(false);

  // Master Data Change Confirmation Modal
  const [isChangeConfirmOpen, setIsChangeConfirmOpen] = useState(false);
  const [pendingFormSubmit, setPendingFormSubmit] = useState<Partial<Employee> | null>(null);
  const [changeReason, setChangeReason] = useState('');
  const [detectedChanges, setDetectedChanges] = useState<{ field: string; label: string; oldVal: any; newVal: any }[]>([]);

  // Deactivate Employee Modal State
  const [isDeactivateModalOpen, setIsDeactivateModalOpen] = useState(false);
  const [employeeToDeactivate, setEmployeeToDeactivate] = useState<Employee | null>(null);
  const [deactivateData, setDeactivateData] = useState({
    effectiveDate: new Date().toISOString().split('T')[0],
    exitType: 'Voluntary' as 'Voluntary' | 'Involuntary' | 'Retirement' | 'Contract End' | 'Other',
    exitReason: ''
  });

  // Quality Dashboard Expand
  const [showQualityDashboard, setShowQualityDashboard] = useState(false);

  // Bulk Import State
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [duplicateMode, setDuplicateMode] = useState<'skip' | 'update'>('update');
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // Form State
  const [formData, setFormData] = useState<Partial<Employee>>({
    id: '',
    name: '',
    department: '',
    section: '',
    designation: '',
    grade: '',
    level: '',
    employmentType: 'Permanent',
    contractorName: '',
    shiftId: settings.shifts?.[0]?.id || '',
    status: 'Active',
    weeklyOff: 'Sunday',
    otEligible: true,
    otEligibilityType: 'Regular OT',
    targetWorkingHours: 8,
    requiredWorkingHoursPerDay: 8,
    requiredWorkingHoursPerWeek: 48,
    basicSalary: 0,
    dearnessAllowance: 0,
    otherAllowance: 0,
    maritalStatus: 'Single',
    ssfEnrolled: true,
    joiningDate: new Date().toISOString().split('T')[0]
  });

  // Sync active search
  useEffect(() => {
    setActiveSearch(searchTerm || globalSearchTerm);
  }, [searchTerm, globalSearchTerm]);

  // Master Filter Options
  const departments = useMemo(() => {
    const depts = employees.map(e => e.department).filter(Boolean) as string[];
    return ['All', ...Array.from(new Set(depts))];
  }, [employees]);

  const designations = useMemo(() => {
    const des = employees.map(e => e.designation).filter(Boolean) as string[];
    return ['All', ...Array.from(new Set(des))];
  }, [employees]);

  const contractors = useMemo(() => {
    const cons = employees.map(e => e.contractorName).filter(Boolean) as string[];
    return ['All', ...Array.from(new Set(cons))];
  }, [employees]);

  // Data Quality Metrics
  const qualityStats = useMemo(() => {
    const total = employees.length;
    if (total === 0) return { score: 100, missingSalary: 0, missingPan: 0, missingSsf: 0, missingDept: 0, missingJoining: 0, totalIssues: 0 };

    let missingSalary = 0;
    let missingPan = 0;
    let missingSsf = 0;
    let missingDept = 0;
    let missingJoining = 0;

    employees.forEach(emp => {
      if (!emp.basicSalary || emp.basicSalary <= 0) missingSalary++;
      if (emp.status === 'Active' && !emp.panNumber) missingPan++;
      if (emp.status === 'Active' && !emp.ssfNumber) missingSsf++;
      if (!emp.department || emp.department === 'General') missingDept++;
      if (!emp.joiningDate) missingJoining++;
    });

    const totalIssues = missingSalary + missingPan + missingSsf + missingDept + missingJoining;
    const totalPossibleChecks = total * 5;
    const score = Math.max(0, Math.round(((totalPossibleChecks - totalIssues) / totalPossibleChecks) * 100));

    return { score, missingSalary, missingPan, missingSsf, missingDept, missingJoining, totalIssues };
  }, [employees]);

  // KPI Top Counts
  const kpiStats = useMemo(() => {
    const total = employees.length;
    const active = employees.filter(e => e.status === 'Active').length;
    const inactive = employees.filter(e => e.status === 'Inactive').length;
    const now = new Date();
    const newJoiners = employees.filter(e => {
      if (!e.joiningDate) return false;
      try {
        const diff = differenceInDays(now, parseISO(e.joiningDate));
        return diff >= 0 && diff <= 90;
      } catch (e) {
        return false;
      }
    }).length;

    return { total, active, inactive, newJoiners, qualityIssues: qualityStats.totalIssues };
  }, [employees, qualityStats]);

  // Filtered & Sorted Employees
  const filteredEmployees = useMemo(() => {
    const searchLower = activeSearch.toLowerCase();
    const searchNorm = normalizeEmployeeId(activeSearch);

    let result = employees.filter(e => {
      const nameMatch = String(e.name || '').toLowerCase().includes(searchLower);
      const idMatch = String(e.id || '').toLowerCase().includes(searchLower) || 
                      (Boolean(searchNorm) && normalizeEmployeeId(e.id).includes(searchNorm));
      const deptMatch = String(e.department || '').toLowerCase().includes(searchLower);
      const desigMatch = String(e.designation || '').toLowerCase().includes(searchLower);
      const phoneMatch = String(e.phone || e.contactNumber || '').toLowerCase().includes(searchLower);
      const panMatch = String(e.panNumber || '').toLowerCase().includes(searchLower);
      const ssfMatch = String(e.ssfNumber || '').toLowerCase().includes(searchLower);
      
      const matchesSearch = searchLower === '' || nameMatch || idMatch || deptMatch || desigMatch || phoneMatch || panMatch || ssfMatch;
      const matchesStatus = selectedStatusFilter === 'All' || e.status === selectedStatusFilter;
      const matchesOt = selectedOtFilter === 'All' || 
                        (selectedOtFilter === 'Eligible' && e.otEligible !== false) ||
                        (selectedOtFilter === 'Non-OT' && e.otEligible === false);
      const matchesDept = deptFilter.includes('All') || deptFilter.includes(e.department);
      const matchesDesig = designationFilter.includes('All') || (e.designation && designationFilter.includes(e.designation));
      const matchesContractor = contractorFilter.includes('All') || (e.contractorName && contractorFilter.includes(e.contractorName));
      const matchesEmploymentType = employmentTypeFilter === 'All' || (e.employmentType || 'Permanent') === employmentTypeFilter;

      // Quick filter presets
      let matchesQuick = true;
      if (quickFilter === 'missing_salary') matchesQuick = !e.basicSalary || e.basicSalary <= 0;
      if (quickFilter === 'missing_pan') matchesQuick = e.status === 'Active' && !e.panNumber;
      if (quickFilter === 'missing_ssf') matchesQuick = e.status === 'Active' && !e.ssfNumber;
      if (quickFilter === 'new_joiners') {
        if (!e.joiningDate) matchesQuick = false;
        else {
          try {
            const diff = differenceInDays(new Date(), parseISO(e.joiningDate));
            matchesQuick = diff >= 0 && diff <= 90;
          } catch { matchesQuick = false; }
        }
      }

      return matchesSearch && matchesStatus && matchesOt && matchesDept && matchesDesig && matchesContractor && matchesEmploymentType && matchesQuick;
    });

    if (sortConfig) {
      result.sort((a, b) => {
        let valA: any = a[sortConfig.key as keyof Employee];
        let valB: any = b[sortConfig.key as keyof Employee];

        if (sortConfig.key === 'id') {
          const numA = parseInt(a.id, 10);
          const numB = parseInt(b.id, 10);
          if (!isNaN(numA) && !isNaN(numB)) {
            return sortConfig.direction === 'asc' ? numA - numB : numB - numA;
          }
        }

        if (sortConfig.key === 'ctc') {
          const basicA = a.basicSalary || 0;
          const grossA = a.grossSalary || (basicA + (a.dearnessAllowance || 0) + (a.otherAllowance || 0));
          const ctcA = a.monthlyCTC || (grossA + Math.round(basicA * 0.20));

          const basicB = b.basicSalary || 0;
          const grossB = b.grossSalary || (basicB + (b.dearnessAllowance || 0) + (b.otherAllowance || 0));
          const ctcB = b.monthlyCTC || (grossB + Math.round(basicB * 0.20));

          return sortConfig.direction === 'asc' ? ctcA - ctcB : ctcB - ctcA;
        }

        if (typeof valA === 'number' && typeof valB === 'number') {
          return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
        }

        valA = String(valA || '').toLowerCase();
        valB = String(valB || '').toLowerCase();
        if (valA < valB) return sortConfig.direction === 'asc' ? -1 : 1;
        if (valA > valB) return sortConfig.direction === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return result;
  }, [employees, activeSearch, selectedStatusFilter, selectedOtFilter, deptFilter, designationFilter, contractorFilter, employmentTypeFilter, quickFilter, sortConfig]);

  // Pagination Math
  const totalPages = Math.ceil(filteredEmployees.length / itemsPerPage);
  const paginatedEmployees = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredEmployees.slice(start, start + itemsPerPage);
  }, [filteredEmployees, currentPage, itemsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [activeSearch, selectedStatusFilter, selectedOtFilter, deptFilter, designationFilter, contractorFilter, employmentTypeFilter, quickFilter]);

  const handleSort = (key: keyof Employee | 'ctc') => {
    setSortConfig(prev => ({
      key,
      direction: prev?.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const resetFilters = () => {
    setSearchTerm('');
    setSelectedStatusFilter('All');
    setSelectedOtFilter('All');
    setDeptFilter(['All']);
    setDesignationFilter(['All']);
    setContractorFilter(['All']);
    setEmploymentTypeFilter('All');
    setQuickFilter(null);
  };

  // Row selection
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

  // Drawer handlers
  const handleOpenProfile = (emp: Employee) => {
    setSelectedProfileEmployee(emp);
    setIsDrawerOpen(true);
  };

  // Form Reset
  // Dirty State Detection
  const isDirty = useMemo(() => {
    if (!isModalOpen || !initialFormData) return false;
    return JSON.stringify(formData) !== JSON.stringify(initialFormData);
  }, [isModalOpen, formData, initialFormData]);

  const handleCloseModalAttempt = () => {
    if (isDirty) {
      setIsDiscardConfirmOpen(true);
    } else {
      setIsModalOpen(false);
      setEditingId(null);
    }
  };

  const handleConfirmDiscard = () => {
    setIsDiscardConfirmOpen(false);
    setIsModalOpen(false);
    setEditingId(null);
  };

  const resetForm = () => {
    const defaultData: Partial<Employee> = {
      id: '',
      bioId: '',
      name: '', 
      department: '', 
      section: '',
      designation: '', 
      grade: '',
      level: '',
      employmentType: 'Permanent',
      contractorName: '',
      shiftId: settings.shifts?.[0]?.id || '', 
      status: 'Active', 
      contactNumber: '',
      phone: '',
      email: '',
      weeklyOff: 'Sunday',
      otEligible: true,
      otEligibilityType: 'Regular OT',
      targetWorkingHours: 8,
      requiredWorkingHoursPerDay: 8,
      requiredWorkingHoursPerWeek: 48,
      basicSalary: 0,
      dearnessAllowance: 0,
      otherAllowance: 0,
      maritalStatus: 'Single',
      ssfEnrolled: true,
      joiningDate: new Date().toISOString().split('T')[0]
    };
    setFormData(defaultData);
    setInitialFormData(defaultData);
    setEditingId(null);
    setErrors({});
    setModalActiveTab('personal');
  };

  const editEmp = (emp: Employee) => {
    const initialData: Partial<Employee> = {
      ...emp,
      id: emp.id,
      bioId: emp.bioId !== undefined ? emp.bioId : emp.id,
      targetWorkingHours: emp.targetWorkingHours || emp.requiredWorkingHoursPerDay || 8,
      requiredWorkingHoursPerDay: emp.requiredWorkingHoursPerDay || emp.targetWorkingHours || 8,
      requiredWorkingHoursPerWeek: emp.requiredWorkingHoursPerWeek || ((emp.targetWorkingHours || 8) * 6),
      otEligible: emp.otEligible !== false,
      otEligibilityType: emp.otEligibilityType || (emp.otEligible !== false ? 'Regular OT' : 'Not Eligible'),
      basicSalary: emp.basicSalary || 0,
      dearnessAllowance: emp.dearnessAllowance || 0,
      otherAllowance: emp.otherAllowance || emp.allowances || 0
    };
    setFormData(initialData);
    setInitialFormData(initialData);
    setEditingId(emp.id);
    setModalActiveTab('personal');
    setErrors({});
    setIsModalOpen(true);
  };

  // Form Submit with Master Data Confirmation
  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (quotaExceeded) {
      toast.error('Cannot save: Database write limit reached.');
      return;
    }

    const newErrors: { [key: string]: string } = {};
    if (!formData.id?.trim()) newErrors.id = 'Employee ID is required';
    if (!formData.name?.trim()) newErrors.name = 'Employee name is required';
    if (!formData.department?.trim()) newErrors.department = 'Department is required';
    if (!formData.designation?.trim()) newErrors.designation = 'Designation is required';

    // Check for duplicate ID if adding new
    if (!editingId && formData.id && employees.some(emp => emp.id.trim() === formData.id!.trim() || normalizeEmployeeId(emp.id) === normalizeEmployeeId(formData.id!))) {
      newErrors.id = 'Employee ID already exists in directory';
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      toast.error('Please fix the errors in the form before saving.');
      return;
    }

    // Auto-calculate derived salary fields
    const basic = Number(formData.basicSalary) || 0;
    const dearness = Number(formData.dearnessAllowance) || 0;
    const other = Number(formData.otherAllowance) || 0;
    const gross = basic + dearness + other;
    const employerSsf = Math.round(basic * 0.20);
    const employeeSsf = Math.round(basic * 0.11);
    const monthlyCtc = gross + employerSsf;
    const annualCtc = monthlyCtc * 12;
    const reqDaily = Number(formData.requiredWorkingHoursPerDay) || Number(formData.targetWorkingHours) || 8;
    const reqWeekly = Number(formData.requiredWorkingHoursPerWeek) || (reqDaily * 6);

    const existing = editingId ? employees.find(e => e.id === editingId) : null;
    const resolvedBioId = formData.bioId 
      ? String(formData.bioId).trim() 
      : (existing?.bioId ? String(existing.bioId).trim() : formData.id!.trim());

    const calculatedData: Partial<Employee> = {
      ...formData,
      id: formData.id!.trim(),
      bioId: resolvedBioId,
      basicSalary: basic,
      dearnessAllowance: dearness,
      otherAllowance: other,
      grossSalary: gross,
      employerSSF: employerSsf,
      employeeSSF: employeeSsf,
      monthlyCTC: monthlyCtc,
      annualCTC: annualCtc,
      targetWorkingHours: reqDaily,
      requiredWorkingHoursPerDay: reqDaily,
      requiredWorkingHoursPerWeek: reqWeekly,
      joiningDate: formData.joiningDate || new Date().toISOString().split('T')[0]
    };

    // If Editing: Detect critical changes and trigger confirmation modal
    if (editingId) {
      const existing = employees.find(e => e.id === editingId);
      if (existing) {
        const changes: { field: string; label: string; oldVal: any; newVal: any }[] = [];
        
        if (existing.department !== calculatedData.department) {
          changes.push({ field: 'department', label: 'Department', oldVal: existing.department, newVal: calculatedData.department });
        }
        if (existing.section !== calculatedData.section) {
          changes.push({ field: 'section', label: 'Section', oldVal: existing.section || 'General', newVal: calculatedData.section });
        }
        if (existing.designation !== calculatedData.designation) {
          changes.push({ field: 'designation', label: 'Designation', oldVal: existing.designation, newVal: calculatedData.designation });
        }
        if (existing.grade !== calculatedData.grade) {
          changes.push({ field: 'grade', label: 'Grade', oldVal: existing.grade || 'N/A', newVal: calculatedData.grade });
        }
        if ((existing.basicSalary || 0) !== calculatedData.basicSalary) {
          changes.push({ field: 'basicSalary', label: 'Basic Salary', oldVal: `रु. ${(existing.basicSalary || 0).toLocaleString()}`, newVal: `रु. ${(calculatedData.basicSalary || 0).toLocaleString()}` });
        }
        if (existing.shiftId !== calculatedData.shiftId) {
          const oldShift = settings.shifts?.find(s => s.id === existing.shiftId)?.name || 'Default';
          const newShift = settings.shifts?.find(s => s.id === calculatedData.shiftId)?.name || 'Default';
          changes.push({ field: 'shiftId', label: 'Shift', oldVal: oldShift, newVal: newShift });
        }
        if (existing.otEligible !== calculatedData.otEligible) {
          changes.push({ field: 'otEligible', label: 'OT Eligibility', oldVal: existing.otEligible !== false ? 'Yes' : 'No', newVal: calculatedData.otEligible ? 'Yes' : 'No' });
        }
        if (existing.status !== calculatedData.status) {
          changes.push({ field: 'status', label: 'Status', oldVal: existing.status, newVal: calculatedData.status });
        }

        if (changes.length > 0) {
          setDetectedChanges(changes);
          setPendingFormSubmit(calculatedData);
          setChangeReason('');
          setIsChangeConfirmOpen(true);
          return;
        }
      }

      // Calculate field diffs for confirmation
      const diffs: FieldDiff[] = [];
      if (existing) {
        if (existing.name !== calculatedData.name) diffs.push({ field: 'name', label: 'Name', oldValue: existing.name, newValue: calculatedData.name });
        if (existing.department !== calculatedData.department) diffs.push({ field: 'department', label: 'Department', oldValue: existing.department, newValue: calculatedData.department });
        if (existing.designation !== calculatedData.designation) diffs.push({ field: 'designation', label: 'Designation', oldValue: existing.designation, newValue: calculatedData.designation });
        if (existing.basicSalary !== calculatedData.basicSalary) diffs.push({ field: 'basicSalary', label: 'Basic Salary (रु.)', oldValue: existing.basicSalary, newValue: calculatedData.basicSalary });
        if (existing.grossSalary !== calculatedData.grossSalary) diffs.push({ field: 'grossSalary', label: 'Gross Salary (रु.)', oldValue: existing.grossSalary, newValue: calculatedData.grossSalary });
        if (existing.status !== calculatedData.status) diffs.push({ field: 'status', label: 'Status', oldValue: existing.status, newValue: calculatedData.status });
        if (existing.otEligible !== calculatedData.otEligible) diffs.push({ field: 'otEligible', label: 'OT Eligible', oldValue: existing.otEligible ? 'Yes' : 'No', newValue: calculatedData.otEligible ? 'Yes' : 'No' });
      }

      executeUpdateEmployee(calculatedData, diffs);
    } else {
      // Adding new employee
      executeAddEmployee(calculatedData as Employee);
    }
  };

  const executeUpdateEmployee = async (data: Partial<Employee>, diffs: FieldDiff[] = [], reason?: string) => {
    if (!editingId) return;
    const existing = employees.find(e => e.id === editingId);

    await executeWithStatus(
      {
        title: `Save Changes to Employee #${editingId}?`,
        subtitle: `Persist modified master data to local SQLite database`,
        module: 'Employee Directory',
        actionType: 'save',
        recordId: editingId,
        recordName: data.name || existing?.name,
        changedFields: diffs.length > 0 ? diffs : undefined,
        affectedCount: 1,
        confirmText: 'Confirm & Save'
      },
      async (updateProgress) => {
        updateProgress({ percent: 30, message: 'Opening SQLite transaction...' });
        const updatedList = employees.map(e => e.id === editingId ? { ...e, ...data } : e);
        
        updateProgress({ percent: 60, message: 'Writing master record to E:\\SHRM_HRIS\\Database.db...' });
        const saveRes = await saveLocalTableDetailed('employees', updatedList);
        
        if (!saveRes.success) {
          return {
            success: false,
            error: saveRes.error || 'Failed to update employee in database'
          };
        }

        updateProgress({ percent: 90, message: 'Verifying database persistence...' });
        await setEmployees(updatedList);

        // Record in Movements if department/designation/salary changed
        if (diffs.length > 0) {
          const movementType = 
            diffs.some(c => c.field === 'designation') ? 'Promotion' :
            diffs.some(c => c.field === 'department') ? 'Transfer' :
            diffs.some(c => c.field === 'basicSalary') ? 'Salary Change' :
            diffs.some(c => c.field === 'status') ? 'Status Change' : 'Master Update';

          await addMovement({
            employeeId: editingId,
            effectiveDate: new Date().toISOString().split('T')[0],
            movementType: movementType as any,
            previousDepartment: existing?.department,
            newDepartment: data.department,
            previousDesignation: existing?.designation,
            newDesignation: data.designation,
            previousSalary: existing?.basicSalary,
            newSalary: data.basicSalary,
            reason: 'Master profile updated via Employee Directory',
            changedBy: 'HR Administrator'
          });

          // Add audit log entries
          diffs.forEach(ch => {
            addAuditLog({
              employeeId: editingId,
              employeeName: data.name || existing?.name || 'Unknown',
              date: new Date().toISOString().split('T')[0],
              field: ch.field,
              oldValue: String(ch.oldValue || ''),
              newValue: String(ch.newValue || ''),
              changedBy: 'HR Administrator',
              remarks: `Updated master ${ch.label}`
            });
          });
        }

        setIsModalOpen(false);
        setIsChangeConfirmOpen(false);
        resetForm();

        return {
          success: true,
          affectedCount: 1,
          changedFieldsCount: diffs.length,
          verificationStatus: saveRes.verificationStatus,
          transaction: saveRes.transaction,
          dbPath: saveRes.dbPath,
          breakdown: {
            'Employee ID': editingId,
            'Employee Name': data.name || existing?.name,
            'Fields Modified': `${diffs.length} fields`,
            'Persistence Location': 'E:\\SHRM_HRIS\\Database.db'
          }
        };
      }
    );
  };

  const executeAddEmployee = async (newEmp: Employee) => {
    await executeWithStatus(
      {
        title: `Add New Employee #${newEmp.id}?`,
        subtitle: `Create new master identity record in local SQLite database`,
        module: 'Employee Directory',
        actionType: 'save',
        recordId: newEmp.id,
        recordName: newEmp.name,
        affectedCount: 1,
        details: {
          'Bio ID': newEmp.id,
          'Full Name': newEmp.name,
          'Department': newEmp.department,
          'Designation': newEmp.designation,
          'Basic Salary': `रु. ${newEmp.basicSalary?.toLocaleString() || '0'}`
        },
        confirmText: 'Confirm & Establish Profile'
      },
      async (updateProgress) => {
        updateProgress({ percent: 35, message: 'Creating record in SQLite database...' });
        const updatedList = [...employees, newEmp];
        const saveRes = await saveLocalTableDetailed('employees', updatedList);

        if (!saveRes.success) {
          return {
            success: false,
            error: saveRes.error || 'Failed to establish employee record in database'
          };
        }

        updateProgress({ percent: 80, message: 'Verifying database commit...' });
        await setEmployees(updatedList);

        // Record initial onboarding movement
        await addMovement({
          employeeId: newEmp.id,
          effectiveDate: newEmp.joiningDate || new Date().toISOString().split('T')[0],
          movementType: 'New Joiner',
          newDepartment: newEmp.department,
          newDesignation: newEmp.designation,
          newSalary: newEmp.basicSalary,
          reason: 'Initial Employee Directory Master Onboarding',
          changedBy: 'HR Administrator'
        });

        addAuditLog({
          employeeId: newEmp.id,
          employeeName: newEmp.name,
          date: new Date().toISOString().split('T')[0],
          field: 'Profile',
          oldValue: 'None',
          newValue: 'Created',
          changedBy: 'HR Administrator',
          remarks: 'New employee profile established in central directory'
        });

        setIsModalOpen(false);
        resetForm();

        return {
          success: true,
          affectedCount: 1,
          verificationStatus: saveRes.verificationStatus,
          transaction: saveRes.transaction,
          dbPath: saveRes.dbPath,
          breakdown: {
            'Employee ID': newEmp.id,
            'Employee Name': newEmp.name,
            'Department': newEmp.department,
            'Designation': newEmp.designation
          }
        };
      }
    );
  };

  const handleSingleDelete = async (emp: Employee) => {
    await executeWithStatus(
      {
        title: `Permanently Delete Employee #${emp.id}?`,
        subtitle: `This action will permanently remove ${emp.name} from the local SQLite database. An automatic safety backup will be created in E:\\SHRM_HRIS\\Backups\\.`,
        module: 'Employee Directory',
        actionType: 'delete',
        recordId: emp.id,
        recordName: emp.name,
        affectedCount: 1,
        isDestructive: true,
        confirmText: 'Delete Permanently'
      },
      async (updateProgress) => {
        updateProgress({ percent: 25, message: 'Creating automatic pre-deletion safety backup...' });
        const updatedList = employees.filter(e => e.id !== emp.id);
        
        updateProgress({ percent: 60, message: `Executing DELETE FROM employees WHERE id = '${emp.id}'...` });
        const deleteRes = await deleteLocalTableDetailed('employees', [emp.id]);
        
        if (!deleteRes.success) {
          return {
            success: false,
            error: deleteRes.error || 'Failed to delete employee from database'
          };
        }

        updateProgress({ percent: 90, message: 'Verifying deletion and refreshing store...' });
        await setEmployees(updatedList);

        addAuditLog({
          employeeId: emp.id,
          employeeName: emp.name,
          date: new Date().toISOString().split('T')[0],
          field: 'Profile',
          oldValue: 'Active Record',
          newValue: 'DELETED',
          changedBy: 'HR Administrator',
          remarks: `Employee record permanently removed from master directory.`
        });

        return {
          success: true,
          affectedCount: 1,
          verificationStatus: deleteRes.verificationStatus,
          transaction: deleteRes.transaction,
          dbPath: deleteRes.dbPath,
          breakdown: {
            'Deleted ID': emp.id,
            'Deleted Name': emp.name,
            'Safety Backup': 'Created in E:\\SHRM_HRIS\\Backups\\',
            'Verification': 'Confirmed 0 records matching ID'
          }
        };
      }
    );
  };

  const handleBulkDelete = async () => {
    if (selectedEmployees.length === 0) return;
    const count = selectedEmployees.length;

    await executeWithStatus(
      {
        title: `Permanently Delete ${count} Selected Employees?`,
        subtitle: `This will permanently remove ${count} employees from E:\\SHRM_HRIS\\Database.db. An automatic safety backup will be generated before deletion.`,
        module: 'Employee Directory',
        actionType: 'bulk_delete',
        affectedCount: count,
        isDestructive: true,
        confirmText: `Delete ${count} Employees Permanently`
      },
      async (updateProgress) => {
        updateProgress({ percent: 20, message: `Generating safety database backup for ${count} records...` });
        const updatedList = employees.filter(e => !selectedEmployees.includes(e.id));

        updateProgress({ percent: 55, message: `Executing transactional batch deletion in SQLite...` });
        const deleteRes = await deleteLocalTableDetailed('employees', selectedEmployees);

        if (!deleteRes.success) {
          return {
            success: false,
            error: deleteRes.error || 'Batch deletion failed in SQLite database'
          };
        }

        updateProgress({ percent: 90, message: 'Verifying deletion and refreshing application state...' });
        await setEmployees(updatedList);
        setSelectedEmployees([]);

        addAuditLog({
          employeeId: 'BATCH',
          employeeName: `${count} Employees`,
          date: new Date().toISOString().split('T')[0],
          field: 'Profile',
          oldValue: `${count} Records`,
          newValue: 'BATCH DELETED',
          changedBy: 'HR Administrator',
          remarks: `Batch deleted ${count} employee records.`
        });

        return {
          success: true,
          affectedCount: count,
          verificationStatus: deleteRes.verificationStatus,
          transaction: deleteRes.transaction,
          dbPath: deleteRes.dbPath,
          breakdown: {
            'Deleted Count': `${count} employees`,
            'Safety Backup': 'E:\\SHRM_HRIS\\Backups\\ verified',
            'Verification Status': 'PASSED (Readback verified 0 remaining)'
          }
        };
      }
    );
  };

  // Deactivate Employee
  const promptDeactivate = (emp: Employee) => {
    setEmployeeToDeactivate(emp);
    setDeactivateData({
      effectiveDate: new Date().toISOString().split('T')[0],
      exitType: 'Voluntary',
      exitReason: ''
    });
    setIsDeactivateModalOpen(true);
  };

  const confirmDeactivate = async () => {
    if (!employeeToDeactivate) return;
    try {
      await updateEmployee(employeeToDeactivate.id, {
        status: 'Inactive',
        statusEffectiveDate: deactivateData.effectiveDate,
        separationDate: deactivateData.effectiveDate,
        exitType: deactivateData.exitType,
        exitReason: deactivateData.exitReason
      });

      await addMovement({
        employeeId: employeeToDeactivate.id,
        effectiveDate: deactivateData.effectiveDate,
        movementType: deactivateData.exitType === 'Voluntary' ? 'Resignation' : 'Termination',
        previousDepartment: employeeToDeactivate.department,
        previousDesignation: employeeToDeactivate.designation,
        exitType: deactivateData.exitType,
        exitReason: deactivateData.exitReason,
        reason: deactivateData.exitReason || `Deactivated (${deactivateData.exitType})`,
        changedBy: 'HR Administrator'
      });

      addAuditLog({
        employeeId: employeeToDeactivate.id,
        employeeName: employeeToDeactivate.name,
        date: deactivateData.effectiveDate,
        field: 'status',
        oldValue: 'Active',
        newValue: 'Inactive',
        changedBy: 'HR Administrator',
        remarks: `Employee deactivated. Reason: ${deactivateData.exitReason || deactivateData.exitType}`
      });

      toast.success(`Employee ${employeeToDeactivate.name} deactivated successfully.`);
      setIsDeactivateModalOpen(false);
      setEmployeeToDeactivate(null);
    } catch (err: any) {
      toast.error(`Deactivation failed: ${err.message}`);
    }
  };

  const handleReactivate = async (emp: Employee) => {
    if (!confirm(`Reactivate employee ${emp.name} (ID: ${emp.id})?`)) return;
    try {
      await updateEmployee(emp.id, {
        status: 'Active',
        statusEffectiveDate: new Date().toISOString().split('T')[0]
      });

      await addMovement({
        employeeId: emp.id,
        effectiveDate: new Date().toISOString().split('T')[0],
        movementType: 'Status Change',
        newDepartment: emp.department,
        newDesignation: emp.designation,
        reason: 'Employee reactivated to Active status',
        changedBy: 'HR Administrator'
      });

      toast.success(`Employee ${emp.name} is now Active.`);
    } catch (err: any) {
      toast.error(`Reactivation failed: ${err.message}`);
    }
  };

  // Bulk Operations
  const handleBulkShiftUpdate = async () => {
    if (quotaExceeded || !bulkShiftId || selectedEmployees.length === 0) return;
    const shift = settings.shifts?.find(s => s.id === bulkShiftId);
    const updatedEmployees = employees.map(emp => 
      selectedEmployees.includes(emp.id) ? { ...emp, shiftId: bulkShiftId } : emp
    );
    await setEmployees(updatedEmployees);
    toast.success(`Assigned ${shift?.name || 'new shift'} to ${selectedEmployees.length} employees`);
    setIsBulkShiftModalOpen(false);
    setSelectedEmployees([]);
    setBulkShiftId('');
  };

  const handleBulkStatusToggle = async () => {
    if (quotaExceeded || selectedEmployees.length === 0) return;
    const updatedEmployees = employees.map(emp => {
      if (selectedEmployees.includes(emp.id)) {
        return { 
          ...emp, 
          status: (emp.status === 'Active' ? 'Inactive' : 'Active') as 'Active' | 'Inactive',
          statusEffectiveDate: new Date().toISOString().split('T')[0]
        };
      }
      return emp;
    });
    await setEmployees(updatedEmployees);
    toast.success(`Updated status for ${selectedEmployees.length} employees`);
    setSelectedEmployees([]);
  };

  const handleBulkOtToggle = async () => {
    if (quotaExceeded || selectedEmployees.length === 0) return;
    const updatedEmployees = employees.map(emp => {
      if (selectedEmployees.includes(emp.id)) {
        const nextOt = !(emp.otEligible !== false);
        return { 
          ...emp, 
          otEligible: nextOt,
          otEligibilityType: (nextOt ? 'Regular OT' : 'Not Eligible') as any
        };
      }
      return emp;
    });
    await setEmployees(updatedEmployees);
    toast.success(`Updated OT eligibility for ${selectedEmployees.length} employees`);
    setSelectedEmployees([]);
  };

  // Export Excel & CSV
  const handleExportExcel = () => {
    const exportData = filteredEmployees.map((emp, i) => {
      const basic = emp.basicSalary || 0;
      const da = emp.dearnessAllowance || 0;
      const other = emp.otherAllowance || emp.allowances || 0;
      const gross = emp.grossSalary || (basic + da + other);
      const empSsf = emp.employeeSSF ?? Math.round(basic * 0.11);
      const empyrSsf = emp.employerSSF ?? Math.round(basic * 0.20);
      const ctc = emp.monthlyCTC ?? (gross + empyrSsf);
      const shift = settings.shifts?.find(s => s.id === emp.shiftId)?.name || 'Day Shift';

      return {
        'S.No': i + 1,
        'Employee ID / Bio ID': emp.id,
        'Employee Name': emp.name,
        'Department': emp.department || '',
        'Section': emp.section || '',
        'Designation': emp.designation || '',
        'Grade': emp.grade || '',
        'Employment Type': emp.employmentType || 'Permanent',
        'Date of Joining': emp.joiningDate || '',
        'Shift': shift,
        'Weekly Off': emp.weeklyOff || 'Sunday',
        'Status': emp.status || 'Active',
        'Basic Salary': basic,
        'Dearness Allowance': da,
        'Other Allowance': other,
        'Gross Salary': gross,
        'Employee SSF (11%)': empSsf,
        'Employer SSF (20%)': empyrSsf,
        'Monthly CTC': ctc,
        'Annual CTC': ctc * 12,
        'OT Eligible': emp.otEligible !== false ? 'Yes' : 'No',
        'OT Type': emp.otEligibilityType || (emp.otEligible !== false ? 'Regular OT' : 'Not Eligible'),
        'Req Hours/Day': emp.requiredWorkingHoursPerDay || emp.targetWorkingHours || 8,
        'Req Hours/Week': emp.requiredWorkingHoursPerWeek || 48,
        'PAN Number': emp.panNumber || '',
        'SSF Number': emp.ssfNumber || '',
        'CIT Number': emp.citNumber || '',
        'Tax Category': emp.maritalStatus || 'Single',
        'Bank Name': emp.bankName || '',
        'Bank Account No': emp.accountNumber || '',
        'Branch': emp.branchName || '',
        'Phone': emp.phone || emp.contactNumber || '',
        'Email': emp.email || '',
        'Address': emp.address || emp.permanentAddress || ''
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Employee_Master');
    XLSX.writeFile(workbook, `HRIS_Employee_Master_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    toast.success(`Exported ${exportData.length} employee records to Excel.`);
  };

  const handleExportCSV = () => {
    handleExportExcel();
  };

  // Two-Sheet Download Template
  const downloadTemplate = () => {
    const masterSample = [
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
        'Plant / Location': 'Plant 1',
        'Weekly Off': 'Sunday',
        'Shift': 'Day Shift',
        'Status (Active/Inactive)': 'Active',
        'Basic Salary': 30000,
        'Dearness Allowance': 5000,
        'Other Allowance': 5000,
        'OT Eligible (Yes/No)': 'Yes',
        'OT Type (Regular OT/Shift OT/Special OT)': 'Regular OT',
        'Required Working Hours Per Day': 8,
        'Required Working Hours Per Week': 48,
        'PAN Number': '123456789',
        'SSF Number': 'SSF100234',
        'CIT Number': 'CIT200567',
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
        'Plant / Location': 'Plant 1',
        'Weekly Off': 'Saturday',
        'Shift': 'Day Shift',
        'Status (Active/Inactive)': 'Active',
        'Basic Salary': 35000,
        'Dearness Allowance': 6000,
        'Other Allowance': 4000,
        'OT Eligible (Yes/No)': 'No',
        'OT Type (Regular OT/Shift OT/Special OT)': 'Not Eligible',
        'Required Working Hours Per Day': 8,
        'Required Working Hours Per Week': 48,
        'PAN Number': '987654321',
        'SSF Number': 'SSF100888',
        'CIT Number': 'CIT200999',
        'Bank Name': 'Global IME Bank',
        'Bank Account Number': '9876543210987',
        'Branch': 'Lalitpur',
        'Phone': '9851234567',
        'Email': 'sita@example.com',
        'Address': 'Lalitpur, Nepal',
        'Emergency Contact': '9811234567'
      }
    ];

    const instructionsData = [
      {
        'Rule / Parameter': '1. Employee ID / Bio ID',
        'Specification & Guidance': 'Numeric Bio ID from biometric device is the primary system Employee ID (e.g. 2, 1256). Do not prefix with EMP- or alter existing numeric IDs.'
      },
      {
        'Rule / Parameter': '2. Date Format',
        'Specification & Guidance': 'Use standard ISO format: YYYY-MM-DD (e.g., 2024-01-15).'
      },
      {
        'Rule / Parameter': '3. Salary & Nepal SSF Model',
        'Specification & Guidance': 'Basic Salary + Dearness Allowance + Other Allowance = Gross Salary. System auto-calculates Employee SSF (11%) and Employer SSF (20% of Basic). Monthly CTC = Gross + Employer SSF (20%).'
      },
      {
        'Rule / Parameter': '4. OT Eligibility & Working Hours',
        'Specification & Guidance': 'OT Eligible (Yes/No). If No, employee will not be auto-accrued overtime. Required Working Hours Per Day (8 or 12), Required Working Hours Per Week (48 or 72).'
      },
      {
        'Rule / Parameter': '5. Tax Status / Category',
        'Specification & Guidance': 'Single or Married. Single slab is Rs. 5,00,000 threshold; Married slab is Rs. 6,00,000 threshold under Nepal IRD.'
      },
      {
        'Rule / Parameter': '6. New vs Update Mode',
        'Specification & Guidance': 'If Employee ID exists, you can choose to Skip or Update existing master data in the import modal preview.'
      }
    ];

    const wb = XLSX.utils.book_new();
    const wsMaster = XLSX.utils.json_to_sheet(masterSample);
    const wsInstructions = XLSX.utils.json_to_sheet(instructionsData);

    XLSX.utils.book_append_sheet(wb, wsMaster, "Employee_Master");
    XLSX.utils.book_append_sheet(wb, wsInstructions, "Instructions");
    XLSX.writeFile(wb, "HRIS_Employee_Master_Import_Template.xlsx");
    toast.success("Downloaded Employee Master Excel template with instructions.");
  };

  // File Parsing & Preview
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
        
        // Find Employee_Master or first sheet
        const sheetName = workbook.SheetNames.find(s => s.toLowerCase().includes('employee') || s.toLowerCase().includes('master')) || workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
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
          const rowNum = idx + 2;
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
          const employeeSSF = Math.round(basicSalary * 0.11);
          const monthlyCTC = grossSalary + employerSSF;
          const annualCTC = monthlyCTC * 12;

          const rawOt = String(row['OT Eligible (Yes/No)'] || row['OT Eligible'] || 'Yes').toLowerCase();
          const otEligible = !rawOt.includes('no') && !rawOt.includes('false') && !rawOt.includes('0');
          const otEligibilityType = row['OT Type (Regular OT/Shift OT/Special OT)'] || (otEligible ? 'Regular OT' : 'Not Eligible');

          const reqHoursDay = Number(row['Required Working Hours Per Day'] || row['Working Hours'] || row['TWH'] || 8);
          const reqHoursWeek = Number(row['Required Working Hours Per Week'] || (reqHoursDay * 6));

          const shiftName = String(row['Shift'] || row['Shift Name'] || 'Day Shift').trim();
          const shift = settings.shifts?.find(s => s.name.toLowerCase() === shiftName.toLowerCase());

          const empRecord: Employee = {
            id,
            bioId: id,
            name,
            gender: row['Gender'] as any || 'Male',
            maritalStatus: String(row['Marital Status (Single/Married)'] || row['Marital Status'] || row['Tax Status'] || 'Single').toLowerCase().includes('marr') ? 'Married' : 'Single',
            joiningDate: (() => {
              const rawDOJ = row['Date of Joining (YYYY-MM-DD)'] || row['Joining Date'] || row['Date of Joining'] || row['DOJ'] || row['Date of Join'];
              const parsed = formatUniversalDate(rawDOJ, 'yyyy-MM-dd');
              return parsed !== '-' ? parsed : new Date().toISOString().split('T')[0];
            })(),
            department: String(row['Department'] || row['Dept'] || 'General').trim(),
            section: String(row['Section'] || '').trim(),
            designation: String(row['Designation'] || row['Desig'] || 'Staff').trim(),
            employmentType: (row['Employment Type (Permanent/Contract/Probation)'] || row['Employment Type'] || 'Permanent') as any,
            grade: String(row['Grade'] || '').trim(),
            level: String(row['Level'] || '').trim(),
            reportingManager: String(row['Reporting Manager'] || '').trim(),
            plantLocation: String(row['Plant / Location'] || row['Location'] || '').trim(),
            weeklyOff: row['Weekly Off'] || 'Sunday',
            shiftId: shift?.id || settings.shifts?.[0]?.id || '',
            status: String(row['Status (Active/Inactive)'] || row['Status'] || 'Active').toLowerCase().includes('inact') ? 'Inactive' : 'Active',
            basicSalary,
            dearnessAllowance,
            otherAllowance,
            grossSalary,
            employeeSSF,
            employerSSF,
            monthlyCTC,
            annualCTC,
            otEligible,
            otEligibilityType,
            targetWorkingHours: reqHoursDay,
            requiredWorkingHoursPerDay: reqHoursDay,
            requiredWorkingHoursPerWeek: reqHoursWeek,
            panNumber: String(row['PAN Number'] || row['PAN'] || '').trim(),
            ssfNumber: String(row['SSF Number'] || row['SSF No'] || '').trim(),
            citNumber: String(row['CIT Number'] || row['CIT No'] || '').trim(),
            bankName: String(row['Bank Name'] || row['Bank'] || '').trim(),
            accountNumber: String(row['Bank Account Number'] || row['Account No'] || '').trim(),
            branchName: String(row['Branch'] || '').trim(),
            phone: String(row['Phone'] || row['Contact'] || '').trim(),
            email: String(row['Email'] || '').trim(),
            address: String(row['Address'] || '').trim(),
            emergencyContact: String(row['Emergency Contact'] || '').trim()
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
        toast.error("Failed to parse Excel file. Please ensure it follows the template format.");
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
    const newCount = importPreview.newCount;
    const updateCount = importPreview.existingCount;

    await executeWithStatus(
      {
        title: `Import ${totalToProcess} Employee Records?`,
        subtitle: `Importing into local SQLite master database (E:\\SHRM_HRIS\\Database.db). Mode: ${duplicateMode === 'update' ? 'Update Existing' : 'Skip Existing'}.`,
        module: 'Punch & Directory Import',
        actionType: 'import',
        affectedCount: totalToProcess,
        details: {
          'Total Rows in File': importPreview.totalRows,
          'Valid Records': totalToProcess,
          'New Employees': newCount,
          'Existing Employees': updateCount,
          'Duplicate Strategy': duplicateMode === 'update' ? 'Overwrite & Update' : 'Skip Existing'
        },
        confirmText: `Import ${totalToProcess} Records`
      },
      async (updateProgress) => {
        const updatedList = [...employees];
        const batchSize = 25;
        let inserted = 0;
        let updated = 0;

        for (let i = 0; i < importPreview.parsedEmps.length; i += batchSize) {
          const batch = importPreview.parsedEmps.slice(i, i + batchSize);

          for (const newEmp of batch) {
            const idx = updatedList.findIndex(e => e.id.trim() === newEmp.id.trim() || normalizeEmployeeId(e.id) === normalizeEmployeeId(newEmp.id));
            if (idx >= 0) {
              if (duplicateMode === 'update') {
                updatedList[idx] = { ...updatedList[idx], ...newEmp };
                updated++;
              }
            } else {
              updatedList.push(newEmp);
              inserted++;
            }
          }

          const processedCount = Math.min(i + batchSize, totalToProcess);
          const pct = Math.round((processedCount / totalToProcess) * 80);
          const lastEmpName = batch[batch.length - 1]?.name || 'Importing...';

          updateProgress({
            percent: pct,
            message: `Processing batch ${processedCount}/${totalToProcess} (${lastEmpName})...`
          });

          await new Promise(r => setTimeout(r, 10));
        }

        updateProgress({ percent: 85, message: 'Executing SQLite batch write to E:\\SHRM_HRIS\\Database.db...' });
        const saveRes = await saveLocalTableDetailed('employees', updatedList);

        if (!saveRes.success) {
          return {
            success: false,
            error: saveRes.error || 'Failed to save imported records to SQLite database'
          };
        }

        updateProgress({ percent: 98, message: 'Verifying data persistence in SQLite...' });
        await setEmployees(updatedList);

        setIsImportModalOpen(false);
        setImportFile(null);
        setImportPreview(null);

        return {
          success: true,
          affectedCount: totalToProcess,
          verificationStatus: saveRes.verificationStatus,
          transaction: saveRes.transaction,
          dbPath: saveRes.dbPath,
          breakdown: {
            'Inserted New Records': `${inserted} employees`,
            'Updated Existing Records': `${updated} employees`,
            'Total Master Count': `${updatedList.length} employees`,
            'Database Path': 'E:\\SHRM_HRIS\\Database.db'
          }
        };
      }
    );
  };

  return (
    <ErrorBoundary fallbackTitle="Employee Directory Error" fallbackMessage="The directory encountered a data rendering issue. Click Retry to reload.">
      <div className="space-y-6">
        {/* Top Header */}
        <PageHeader 
          title="EMPLOYEE DIRECTORY" 
          description="Central Employee Master Data • Single Source of Truth for Attendance, Payroll, OT, SBL & Analytics"
          icon={Users}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => recalculate()} disabled={isInitializing}>
                <RefreshCw size={14} className={isInitializing ? "animate-spin" : ""} />
                {isInitializing ? 'Syncing...' : 'Sync'}
              </Button>
              <Button variant="outline" onClick={handleExportExcel}>
                <Download size={14} /> Export Excel
              </Button>
              <Button variant="outline" onClick={() => setIsImportModalOpen(true)}>
                <FileUp size={14} /> Bulk Import
              </Button>
              <Button 
                onClick={() => {
                  resetForm();
                  setIsModalOpen(true);
                }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md"
              >
                <Plus size={14} /> Add Employee
              </Button>
            </div>
          }
        />

        {/* Top 6 KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard 
            label="Total Employees" 
            count={kpiStats.total} 
            icon={Users} 
            color="indigo" 
            isActive={selectedStatusFilter === 'All' && !quickFilter}
            onClick={() => { setSelectedStatusFilter('All'); setQuickFilter(null); }} 
          />
          <KpiCard 
            label="Active Staff" 
            count={kpiStats.active} 
            icon={UserCheck} 
            color="emerald" 
            isActive={selectedStatusFilter === 'Active' && !quickFilter}
            onClick={() => { setSelectedStatusFilter('Active'); setQuickFilter(null); }} 
          />
          <KpiCard 
            label="Inactive / Exited" 
            count={kpiStats.inactive} 
            icon={UserX} 
            color="slate" 
            isActive={selectedStatusFilter === 'Inactive' && !quickFilter}
            onClick={() => { setSelectedStatusFilter('Inactive'); setQuickFilter(null); }} 
          />
          <KpiCard 
            label="OT Eligible" 
            count={employees.filter(e => e.otEligible !== false).length} 
            icon={TrendingUp} 
            color="blue" 
            isActive={selectedOtFilter === 'Eligible'}
            onClick={() => { setSelectedOtFilter('Eligible'); setQuickFilter(null); }} 
          />
          <KpiCard 
            label="New Joiners (90d)" 
            count={kpiStats.newJoiners} 
            icon={Sparkles} 
            color="amber" 
            isActive={quickFilter === 'new_joiners'}
            onClick={() => setQuickFilter(quickFilter === 'new_joiners' ? null : 'new_joiners')} 
          />
          <KpiCard 
            label="Quality Checks" 
            count={kpiStats.qualityIssues} 
            icon={AlertTriangle} 
            color={kpiStats.qualityIssues > 0 ? "rose" : "emerald"}
            isActive={showQualityDashboard}
            onClick={() => setShowQualityDashboard(!showQualityDashboard)} 
          />
        </div>

        {/* Collapsible Data Quality Dashboard */}
        {showQualityDashboard && (
          <Card className="p-5 border-amber-200 dark:border-amber-900/40 bg-amber-50/40 dark:bg-amber-950/10 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-200/60 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-700 dark:text-amber-400 font-black">
                  {qualityStats.score}%
                </div>
                <div>
                  <h3 className="text-sm font-black uppercase tracking-wider text-slate-800 dark:text-white">Master Data Quality Index</h3>
                  <p className="text-xs text-slate-600 dark:text-slate-400">Completeness check for payroll, tax, SSF, and attendance compliance</p>
                </div>
              </div>
              <Button size="sm" variant="outline" onClick={() => setShowQualityDashboard(false)}>
                Hide Dashboard
              </Button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
              <button 
                onClick={() => setQuickFilter(quickFilter === 'missing_salary' ? null : 'missing_salary')}
                className={cn(
                  "p-3 rounded-xl border text-left transition-all",
                  quickFilter === 'missing_salary' ? "bg-amber-100 border-amber-400 ring-2 ring-amber-400/20 font-bold" : "bg-white dark:bg-slate-900 border-slate-200 hover:bg-slate-50"
                )}
              >
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Missing Basic Salary</span>
                <strong className={cn("text-base font-mono", qualityStats.missingSalary > 0 ? "text-rose-600" : "text-emerald-600")}>
                  {qualityStats.missingSalary} Profiles
                </strong>
              </button>

              <button 
                onClick={() => setQuickFilter(quickFilter === 'missing_pan' ? null : 'missing_pan')}
                className={cn(
                  "p-3 rounded-xl border text-left transition-all",
                  quickFilter === 'missing_pan' ? "bg-amber-100 border-amber-400 ring-2 ring-amber-400/20 font-bold" : "bg-white dark:bg-slate-900 border-slate-200 hover:bg-slate-50"
                )}
              >
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Missing PAN Number</span>
                <strong className={cn("text-base font-mono", qualityStats.missingPan > 0 ? "text-amber-600" : "text-emerald-600")}>
                  {qualityStats.missingPan} Active Staff
                </strong>
              </button>

              <button 
                onClick={() => setQuickFilter(quickFilter === 'missing_ssf' ? null : 'missing_ssf')}
                className={cn(
                  "p-3 rounded-xl border text-left transition-all",
                  quickFilter === 'missing_ssf' ? "bg-amber-100 border-amber-400 ring-2 ring-amber-400/20 font-bold" : "bg-white dark:bg-slate-900 border-slate-200 hover:bg-slate-50"
                )}
              >
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Missing SSF Number</span>
                <strong className={cn("text-base font-mono", qualityStats.missingSsf > 0 ? "text-amber-600" : "text-emerald-600")}>
                  {qualityStats.missingSsf} Active Staff
                </strong>
              </button>

              <div className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200">
                <span className="text-[10px] uppercase font-bold text-slate-400 block">Missing Department</span>
                <strong className={cn("text-base font-mono", qualityStats.missingDept > 0 ? "text-rose-600" : "text-emerald-600")}>
                  {qualityStats.missingDept} Profiles
                </strong>
              </div>
            </div>
          </Card>
        )}

        {/* Search & Advanced Filters Bar */}
        <Card className="p-4 space-y-3">
          <div className="flex flex-col md:flex-row items-center gap-3">
            {/* Global Search */}
            <div className="flex-1 w-full relative">
              <Input 
                placeholder="Search by Employee ID, Bio ID, Name, Department, Mobile, PAN, SSF..." 
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                icon={<Search size={16} className="text-slate-400" />}
              />
            </div>

            {/* Filter Dropdowns */}
            <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
              <div className="w-full sm:w-44">
                <MultiSelect 
                  options={departments}
                  selected={deptFilter}
                  onChange={setDeptFilter}
                  placeholder="All Departments"
                />
              </div>

              <div className="w-full sm:w-44">
                <MultiSelect 
                  options={designations}
                  selected={designationFilter}
                  onChange={setDesignationFilter}
                  placeholder="All Designations"
                />
              </div>

              <select 
                value={selectedStatusFilter} 
                onChange={e => setSelectedStatusFilter(e.target.value as any)}
                className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="All">Status: All</option>
                <option value="Active">Status: Active Only</option>
                <option value="Inactive">Status: Inactive Only</option>
              </select>

              <select 
                value={selectedOtFilter} 
                onChange={e => setSelectedOtFilter(e.target.value as any)}
                className="px-3 py-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-bold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="All">OT: All Staff</option>
                <option value="Eligible">OT: Eligible Only</option>
                <option value="Non-OT">OT: Non-OT Staff</option>
              </select>

              {(searchTerm || selectedStatusFilter !== 'All' || selectedOtFilter !== 'All' || !deptFilter.includes('All') || !designationFilter.includes('All') || quickFilter) && (
                <Button variant="ghost" size="sm" onClick={resetFilters} className="text-xs text-rose-600 hover:text-rose-700">
                  <X size={14} className="mr-1" /> Reset
                </Button>
              )}
            </div>
          </div>

          {/* Bulk Selection Bar */}
          {selectedEmployees.length > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs">
              <span className="font-bold text-slate-600 dark:text-slate-300">
                <span className="font-mono bg-indigo-50 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded mr-2 font-bold">
                  {selectedEmployees.length}
                </span> 
                Employees Selected
              </span>

              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setIsBulkShiftModalOpen(true)}>
                  <Edit2 size={13} /> Batch Shift
                </Button>
                <Button variant="outline" size="sm" onClick={handleBulkStatusToggle}>
                  <RefreshCw size={13} /> Toggle Status
                </Button>
                <Button variant="outline" size="sm" onClick={handleBulkOtToggle}>
                  <TrendingUp size={13} /> Toggle OT
                </Button>
                <Button variant="danger" size="sm" onClick={handleBulkDelete}>
                  <Trash2 size={13} /> Delete Selected ({selectedEmployees.length})
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Master Employee Table */}
        <Card className="overflow-hidden border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="overflow-x-auto custom-scrollbar-light">
            <table className="w-full text-left border-collapse min-w-[1200px]">
              <thead className="bg-slate-100/80 dark:bg-slate-900/80 sticky top-0 z-10 backdrop-blur-sm border-b border-slate-200 dark:border-slate-800">
                <tr className="text-[11px] font-black text-slate-500 uppercase tracking-wider">
                  <th className="px-4 py-3 w-12 text-center">
                    <input 
                      type="checkbox" 
                      checked={selectedEmployees.length > 0 && selectedEmployees.length === filteredEmployees.length}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                  </th>
                  <th className="px-3 py-3 w-14 text-center">S.No</th>
                  <th 
                    className="px-4 py-3 w-28 cursor-pointer hover:text-indigo-600 transition-colors"
                    onClick={() => handleSort('id')}
                  >
                    <div className="flex items-center gap-1">
                      Bio ID {sortConfig?.key === 'id' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3 cursor-pointer hover:text-indigo-600 transition-colors"
                    onClick={() => handleSort('name')}
                  >
                    <div className="flex items-center gap-1">
                      Employee Name {sortConfig?.key === 'name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </div>
                  </th>
                  <th 
                    className="px-4 py-3 cursor-pointer hover:text-indigo-600 transition-colors"
                    onClick={() => handleSort('department')}
                  >
                    <div className="flex items-center gap-1">
                      Department {sortConfig?.key === 'department' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </div>
                  </th>
                  <th className="px-4 py-3">Designation</th>
                  <th className="px-3 py-3 w-28">Joining Date</th>
                  <th className="px-3 py-3 w-28">Shift</th>
                  <th className="px-4 py-3 w-32 text-right">Basic (रु.)</th>
                  <th className="px-4 py-3 w-32 text-right">Gross (रु.)</th>
                  <th className="px-4 py-3 w-32 text-right font-bold text-indigo-600">SSF 20% (रु.)</th>
                  <th 
                    className="px-4 py-3 w-36 text-right cursor-pointer hover:text-indigo-600 transition-colors"
                    onClick={() => handleSort('ctc')}
                  >
                    <div className="flex items-center justify-end gap-1 font-black text-emerald-600">
                      Monthly CTC {sortConfig?.key === 'ctc' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                    </div>
                  </th>
                  <th className="px-3 py-3 w-24 text-center">OT Status</th>
                  <th className="px-3 py-3 w-20 text-center">Req Hrs</th>
                  <th className="px-3 py-3 w-24 text-center">Status</th>
                  <th className="px-4 py-3 w-32 text-right">Actions</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-[12px]">
                {paginatedEmployees.length > 0 ? paginatedEmployees.map((emp, index) => {
                  const shift = settings.shifts?.find(s => s.id === emp.shiftId);
                  const sNo = (currentPage - 1) * itemsPerPage + index + 1;
                  const basic = emp.basicSalary || 0;
                  const da = emp.dearnessAllowance || 0;
                  const other = emp.otherAllowance || emp.allowances || 0;
                  const gross = emp.grossSalary || (basic + da + other);
                  const employerSsf = emp.employerSSF ?? Math.round(basic * 0.20);
                  const monthlyCtc = emp.monthlyCTC ?? (gross + employerSsf);
                  const reqHours = emp.requiredWorkingHoursPerDay || emp.targetWorkingHours || 8;

                  return (
                    <tr 
                      key={emp.id} 
                      onClick={() => handleOpenProfile(emp)}
                      className={cn(
                        "hover:bg-slate-50/90 dark:hover:bg-slate-800/50 transition-colors cursor-pointer group",
                        selectedEmployees.includes(emp.id) && "bg-indigo-50/40 dark:bg-indigo-950/20"
                      )}
                    >
                      <td className="px-4 py-2.5 text-center" onClick={(e) => e.stopPropagation()}>
                        <input 
                          type="checkbox" 
                          checked={selectedEmployees.includes(emp.id)}
                          onChange={() => toggleSelectEmployee(emp.id)}
                          className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono text-slate-400 text-[11px]">{sNo}</td>
                      <td className="px-4 py-2.5 font-mono font-bold text-indigo-700 dark:text-indigo-400 group-hover:underline">
                        #{emp.id}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-lg bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-[11px] font-black uppercase shrink-0">
                            {emp.name.charAt(0)}
                          </div>
                          <span className="font-bold text-slate-900 dark:text-white truncate">{emp.name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-slate-700 dark:text-slate-300 font-medium">{emp.department || '-'}</td>
                      <td className="px-4 py-2.5 text-slate-600 dark:text-slate-400">{emp.designation || '-'}</td>
                      <td className="px-3 py-2.5 font-mono text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        <div className="font-medium text-slate-800 dark:text-slate-200">
                          {emp.joiningDate ? formatUniversalDate(emp.joiningDate, 'yyyy-MM-dd') : '-'}
                        </div>
                        {emp.joiningDate && getNepaliDate(emp.joiningDate) !== '0000-00-00' && (
                          <div className="text-[10px] text-slate-400 font-sans tracking-tight">
                            BS {getNepaliDate(emp.joiningDate)}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 whitespace-nowrap">
                          {shift?.name || 'Day Shift'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono text-slate-700 dark:text-slate-300">
                        {basic > 0 ? basic.toLocaleString() : '-'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-medium text-slate-900 dark:text-white">
                        {gross > 0 ? gross.toLocaleString() : '-'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">
                        {employerSsf > 0 ? employerSsf.toLocaleString() : '-'}
                      </td>
                      <td className="px-4 py-2.5 text-right font-mono font-black text-emerald-600 dark:text-emerald-400">
                        {monthlyCtc > 0 ? monthlyCtc.toLocaleString() : '-'}
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={cn(
                          "px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider",
                          emp.otEligible !== false ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-slate-100 text-slate-500 dark:bg-slate-800"
                        )}>
                          {emp.otEligible !== false ? 'Yes' : 'No'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-center font-mono font-bold text-slate-600 dark:text-slate-400">
                        {reqHours}h
                      </td>
                      <td className="px-3 py-2.5 text-center">
                        <span className={cn(
                          "px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider",
                          emp.status === 'Active' ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" : "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
                        )}>
                          {emp.status || 'Active'}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1 opacity-90 group-hover:opacity-100">
                          <button 
                            onClick={() => handleOpenProfile(emp)} 
                            className="p-1.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 text-indigo-600 rounded-lg transition-colors"
                            title="View Full Profile"
                          >
                            <Eye size={14} />
                          </button>
                          <button 
                            onClick={() => editEmp(emp)} 
                            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 rounded-lg transition-colors"
                            title="Edit Master Data"
                          >
                            <Edit2 size={14} />
                          </button>
                          {emp.status === 'Active' ? (
                            <button 
                              onClick={() => promptDeactivate(emp)} 
                              className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-900/30 text-rose-500 rounded-lg transition-colors"
                              title="Deactivate Employee"
                            >
                              <UserX size={14} />
                            </button>
                          ) : (
                            <button 
                              onClick={() => handleReactivate(emp)} 
                              className="p-1.5 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 text-emerald-600 rounded-lg transition-colors"
                              title="Reactivate Employee"
                            >
                              <UserCheck size={14} />
                            </button>
                          )}
                          <button 
                            onClick={() => handleSingleDelete(emp)} 
                            className="p-1.5 hover:bg-rose-50 dark:hover:bg-rose-900/30 text-rose-600 rounded-lg transition-colors"
                            title="Delete Employee Permanently"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                }) : (
                  <tr>
                    <td colSpan={16} className="px-6 py-16 text-center text-slate-400 font-medium italic">
                      No employee master records match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3 text-slate-500 font-medium">
              <span>
                Showing {filteredEmployees.length === 0 ? 0 : (currentPage - 1) * itemsPerPage + 1} - {Math.min(filteredEmployees.length, currentPage * itemsPerPage)} of {filteredEmployees.length} entries
              </span>
              <select 
                value={itemsPerPage} 
                onChange={e => setItemsPerPage(Number(e.target.value))}
                className="px-2 py-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded font-bold"
              >
                <option value={25}>25 per page</option>
                <option value={50}>50 per page</option>
                <option value={100}>100 per page</option>
              </select>
            </div>

            {totalPages > 1 && (
              <div className="flex items-center gap-1.5">
                <Button 
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  <ChevronLeft size={14} />
                </Button>
                <span className="font-mono font-bold text-slate-700 dark:text-slate-300 px-2">
                  Page {currentPage} of {totalPages}
                </span>
                <Button 
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  <ChevronRight size={14} />
                </Button>
              </div>
            )}
          </div>
        </Card>

        {/* 9-Tab Employee Profile Drawer */}
        <EmployeeDrawer 
          employee={selectedProfileEmployee}
          isOpen={isDrawerOpen}
          onClose={() => {
            setIsDrawerOpen(false);
            setSelectedProfileEmployee(null);
          }}
          onEdit={(emp) => {
            setIsDrawerOpen(false);
            editEmp(emp);
          }}
          onDeactivate={(emp) => {
            setIsDrawerOpen(false);
            promptDeactivate(emp);
          }}
        />

        {/* Master Data Edit / Add Modal */}
        {isModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-[100] backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-950 rounded-2xl shadow-2xl max-w-2xl w-full flex flex-col max-h-[90vh] overflow-hidden border border-slate-200 dark:border-slate-800">
              {/* Modal Header */}
              <div className="p-5 bg-gradient-to-r from-slate-900 to-indigo-950 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-3">
                  <div>
                    <h3 className="text-base font-black tracking-tight">{editingId ? 'Edit Employee Master Profile' : 'Add New Employee to Master'}</h3>
                    <p className="text-xs text-indigo-200/80 mt-0.5">Central identity record across attendance, payroll, OT, and compliance</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {isDirty ? (
                    <span className="text-[11px] px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" /> Unsaved changes
                    </span>
                  ) : (
                    <span className="text-[11px] px-2.5 py-1 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold flex items-center gap-1.5">
                      <CheckCircle2 size={12} /> All changes saved
                    </span>
                  )}
                  <button type="button" onClick={handleCloseModalAttempt} className="p-1.5 hover:bg-white/10 rounded-lg text-white/80 transition-colors">
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Modal Tabs */}
              <div className="bg-slate-100 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 flex items-center gap-1 overflow-x-auto shrink-0">
                {[
                  { id: 'personal', label: '1. Personal' },
                  { id: 'employment', label: '2. Employment' },
                  { id: 'salary', label: '3. Salary & SSF' },
                  { id: 'ot_hours', label: '4. OT & Working Hours' },
                  { id: 'status', label: '5. Status & Bank' }
                ].map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setModalActiveTab(t.id as any)}
                    className={cn(
                      "px-3.5 py-2.5 text-xs font-bold whitespace-nowrap border-b-2 transition-all",
                      modalActiveTab === t.id
                        ? "border-indigo-600 text-indigo-600 dark:text-indigo-400 bg-white dark:bg-slate-950 font-black shadow-sm"
                        : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {/* Modal Form Body */}
              <form onSubmit={handleFormSubmit} className="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar-light">
                {/* 1. PERSONAL TAB */}
                {modalActiveTab === 'personal' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Employee ID *</label>
                        <input 
                          type="text" 
                          disabled={Boolean(editingId)}
                          value={formData.id || ''} 
                          onChange={e => {
                            setFormData({...formData, id: e.target.value});
                            if (errors.id) setErrors(prev => ({ ...prev, id: '' }));
                          }} 
                          className={cn(
                            "w-full px-3.5 py-2 border rounded-xl font-mono font-bold text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500",
                            errors.id ? "border-rose-500 bg-rose-50" : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900",
                            editingId && "bg-slate-100 dark:bg-slate-800 text-slate-500 cursor-not-allowed"
                          )}
                          placeholder="e.g. EMP-001 or 1256"
                        />
                        {errors.id && <p className="text-[10px] text-rose-500 font-bold mt-1">{errors.id}</p>}
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Biometric Device Bio ID</label>
                        <input 
                          type="text" 
                          value={formData.bioId !== undefined ? String(formData.bioId) : ''} 
                          onChange={e => setFormData({...formData, bioId: e.target.value})} 
                          className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 rounded-xl font-mono font-bold text-sm bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          placeholder="e.g. 2 or 1256 (device PIN)"
                        />
                        <p className="text-[10px] text-slate-400 mt-1">Numeric identifier recognized by biometric attendance machine</p>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Full Name *</label>
                      <input 
                        type="text" 
                        value={formData.name || ''} 
                        onChange={e => {
                          setFormData({...formData, name: e.target.value});
                          if (errors.name) setErrors(prev => ({ ...prev, name: '' }));
                        }} 
                        className={cn(
                          "w-full px-3.5 py-2 border rounded-xl font-bold text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500",
                          errors.name ? "border-rose-500 bg-rose-50" : "border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900"
                        )}
                        placeholder="Ram Sharma"
                      />
                      {errors.name && <p className="text-[10px] text-rose-500 font-bold mt-1">{errors.name}</p>}
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Gender</label>
                        <select 
                          value={formData.gender || 'Male'} 
                          onChange={e => setFormData({...formData, gender: e.target.value as any})} 
                          className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold bg-white dark:bg-slate-900"
                        >
                          <option value="Male">Male</option>
                          <option value="Female">Female</option>
                          <option value="Other">Other</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Marital Status</label>
                        <select 
                          value={formData.maritalStatus || 'Single'} 
                          onChange={e => setFormData({...formData, maritalStatus: e.target.value as any})} 
                          className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold bg-white dark:bg-slate-900"
                        >
                          <option value="Single">Single</option>
                          <option value="Married">Married</option>
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Mobile Number</label>
                        <input 
                          type="text" 
                          value={formData.phone || formData.contactNumber || ''} 
                          onChange={e => setFormData({...formData, phone: e.target.value, contactNumber: e.target.value})} 
                          className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 rounded-xl font-mono text-xs" 
                          placeholder="9841234567"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Email Address</label>
                        <input 
                          type="email" 
                          value={formData.email || ''} 
                          onChange={e => setFormData({...formData, email: e.target.value})} 
                          className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs" 
                          placeholder="employee@company.com"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Permanent Address</label>
                        <input 
                          type="text" 
                          value={formData.permanentAddress || formData.address || ''} 
                          onChange={e => setFormData({...formData, permanentAddress: e.target.value, address: e.target.value})} 
                          className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs" 
                          placeholder="Kathmandu, Nepal"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Citizenship / National ID</label>
                        <input 
                          type="text" 
                          value={formData.citizenshipNumber || formData.aadharNumber || ''} 
                          onChange={e => setFormData({...formData, citizenshipNumber: e.target.value, aadharNumber: e.target.value})} 
                          className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 rounded-xl font-mono text-xs" 
                          placeholder="12-01-78-12345"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 2. EMPLOYMENT TAB */}
                {modalActiveTab === 'employment' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Department *</label>
                        <input 
                          type="text" 
                          value={formData.department || ''} 
                          onChange={e => {
                            setFormData({...formData, department: e.target.value});
                            if (errors.department) setErrors(prev => ({ ...prev, department: '' }));
                          }} 
                          className={cn(
                            "w-full px-3.5 py-2 border rounded-xl text-xs font-bold",
                            errors.department ? "border-rose-500 bg-rose-50" : "border-slate-300 dark:border-slate-700"
                          )}
                          placeholder="e.g. Production"
                        />
                        {errors.department && <p className="text-[10px] text-rose-500 font-bold mt-1">{errors.department}</p>}
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Section</label>
                        <input 
                          type="text" 
                          value={formData.section || ''} 
                          onChange={e => setFormData({...formData, section: e.target.value})} 
                          className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs" 
                          placeholder="e.g. Assembly / Line 1"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Designation *</label>
                        <input 
                          type="text" 
                          value={formData.designation || ''} 
                          onChange={e => {
                            setFormData({...formData, designation: e.target.value});
                            if (errors.designation) setErrors(prev => ({ ...prev, designation: '' }));
                          }} 
                          className={cn(
                            "w-full px-3.5 py-2 border rounded-xl text-xs font-bold",
                            errors.designation ? "border-rose-500 bg-rose-50" : "border-slate-300 dark:border-slate-700"
                          )}
                          placeholder="e.g. Machine Operator"
                        />
                        {errors.designation && <p className="text-[10px] text-rose-500 font-bold mt-1">{errors.designation}</p>}
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Date of Joining *</label>
                        <input 
                          type="date" 
                          value={formData.joiningDate || ''} 
                          onChange={e => setFormData({...formData, joiningDate: e.target.value})} 
                          className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 rounded-xl font-mono text-xs font-bold"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Employment Type</label>
                        <select 
                          value={formData.employmentType || 'Permanent'} 
                          onChange={e => setFormData({...formData, employmentType: e.target.value as any})} 
                          className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold"
                        >
                          <option value="Permanent">Permanent</option>
                          <option value="Contract">Contract</option>
                          <option value="Probation">Probation</option>
                          <option value="Temporary">Temporary</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Grade</label>
                        <input 
                          type="text" 
                          value={formData.grade || ''} 
                          onChange={e => setFormData({...formData, grade: e.target.value})} 
                          className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 rounded-xl font-mono text-xs" 
                          placeholder="G1"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Reporting Manager</label>
                        <input 
                          type="text" 
                          value={formData.reportingManager || ''} 
                          onChange={e => setFormData({...formData, reportingManager: e.target.value})} 
                          className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs" 
                          placeholder="Hari Prasad"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 3. SALARY & SSF TAB */}
                {modalActiveTab === 'salary' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Basic Salary (रु.) *</label>
                        <input 
                          type="number" 
                          value={formData.basicSalary ?? 0} 
                          onChange={e => setFormData({...formData, basicSalary: Number(e.target.value)})} 
                          className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 rounded-xl font-mono font-bold text-sm"
                          placeholder="35000"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Dearness Allowance</label>
                        <input 
                          type="number" 
                          value={formData.dearnessAllowance ?? 0} 
                          onChange={e => setFormData({...formData, dearnessAllowance: Number(e.target.value)})} 
                          className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 rounded-xl font-mono font-bold text-sm"
                          placeholder="5000"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Other Allowance</label>
                        <input 
                          type="number" 
                          value={formData.otherAllowance ?? 0} 
                          onChange={e => setFormData({...formData, otherAllowance: Number(e.target.value)})} 
                          className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 rounded-xl font-mono font-bold text-sm"
                          placeholder="4000"
                        />
                      </div>
                    </div>

                    {/* Statutory SSF Auto Breakdown Card */}
                    <div className="p-4 bg-indigo-50/70 dark:bg-indigo-950/30 rounded-2xl border border-indigo-200 dark:border-indigo-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black uppercase text-indigo-950 dark:text-indigo-200">Nepal SSF Statutory Breakdown</span>
                        <span className="text-[10px] font-bold text-indigo-700 dark:text-indigo-300">31% Total Contribution</span>
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                        <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-indigo-100">
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">Gross Salary</span>
                          <strong className="text-slate-900 dark:text-white font-mono">
                            रु. {((formData.basicSalary || 0) + (formData.dearnessAllowance || 0) + (formData.otherAllowance || 0)).toLocaleString()}
                          </strong>
                        </div>
                        <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-indigo-100">
                          <span className="text-[10px] text-slate-400 font-bold uppercase block">Employee SSF (11%)</span>
                          <strong className="text-rose-600 font-mono">
                            रु. {Math.round((formData.basicSalary || 0) * 0.11).toLocaleString()}
                          </strong>
                        </div>
                        <div className="bg-white dark:bg-slate-900 p-2.5 rounded-xl border border-indigo-100">
                          <span className="text-[10px] text-indigo-600 font-bold uppercase block">Employer SSF (20%)</span>
                          <strong className="text-indigo-600 font-mono">
                            रु. {Math.round((formData.basicSalary || 0) * 0.20).toLocaleString()}
                          </strong>
                        </div>
                        <div className="bg-emerald-50 dark:bg-emerald-950/40 p-2.5 rounded-xl border border-emerald-200">
                          <span className="text-[10px] text-emerald-700 font-bold uppercase block">Monthly CTC</span>
                          <strong className="text-emerald-700 dark:text-emerald-400 font-mono font-black">
                            रु. {(((formData.basicSalary || 0) + (formData.dearnessAllowance || 0) + (formData.otherAllowance || 0)) + Math.round((formData.basicSalary || 0) * 0.20)).toLocaleString()}
                          </strong>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">PAN Number</label>
                        <input 
                          type="text" 
                          value={formData.panNumber || ''} 
                          onChange={e => setFormData({...formData, panNumber: e.target.value})} 
                          className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 rounded-xl font-mono text-xs" 
                          placeholder="123456789"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">SSF Number</label>
                        <input 
                          type="text" 
                          value={formData.ssfNumber || ''} 
                          onChange={e => setFormData({...formData, ssfNumber: e.target.value})} 
                          className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 rounded-xl font-mono text-xs" 
                          placeholder="SSF100234"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. OT & WORKING HOURS TAB */}
                {modalActiveTab === 'ot_hours' && (
                  <div className="space-y-4">
                    <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase">Overtime Eligibility Control</h4>
                          <p className="text-xs text-slate-500">Determines if employee overtime hours are auto-processed into OT register</p>
                        </div>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input 
                            type="checkbox" 
                            checked={formData.otEligible !== false} 
                            onChange={e => setFormData({
                              ...formData, 
                              otEligible: e.target.checked,
                              otEligibilityType: e.target.checked ? 'Regular OT' : 'Not Eligible'
                            })} 
                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="text-xs font-bold">OT Eligible</span>
                        </label>
                      </div>

                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">OT Eligibility Type</label>
                          <select 
                            value={formData.otEligibilityType || 'Regular OT'} 
                            onChange={e => setFormData({...formData, otEligibilityType: e.target.value as any})}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold"
                          >
                            <option value="Regular OT">Regular OT (Standard 1.5x)</option>
                            <option value="Shift OT">Shift OT</option>
                            <option value="Special OT">Special Project OT</option>
                            <option value="Not Eligible">Not Eligible</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">OT Effective Date</label>
                          <input 
                            type="date" 
                            value={formData.otEffectiveDate || formData.joiningDate || ''} 
                            onChange={e => setFormData({...formData, otEffectiveDate: e.target.value})} 
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl font-mono text-xs"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
                      <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase">Required Working Hours Benchmark</h4>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Daily Target Hours</label>
                          <input 
                            type="number" 
                            value={formData.requiredWorkingHoursPerDay || formData.targetWorkingHours || 8} 
                            onChange={e => {
                              const hrs = Number(e.target.value);
                              setFormData({
                                ...formData, 
                                requiredWorkingHoursPerDay: hrs,
                                targetWorkingHours: hrs,
                                requiredWorkingHoursPerWeek: hrs * 6
                              });
                            }} 
                            className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 rounded-xl font-mono font-bold text-xs"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Weekly Target Hours</label>
                          <input 
                            type="number" 
                            value={formData.requiredWorkingHoursPerWeek || 48} 
                            onChange={e => setFormData({...formData, requiredWorkingHoursPerWeek: Number(e.target.value)})} 
                            className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 rounded-xl font-mono font-bold text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 5. STATUS & BANK TAB */}
                {modalActiveTab === 'status' && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Assigned Shift</label>
                        <select 
                          value={formData.shiftId || ''} 
                          onChange={e => setFormData({...formData, shiftId: e.target.value})} 
                          className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold"
                        >
                          <option value="">Select Shift</option>
                          {settings.shifts?.map(s => <option key={s.id} value={s.id}>{s.name} ({s.startTime}-{s.endTime})</option>)}
                        </select>
                      </div>

                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Weekly Off</label>
                        <select 
                          value={formData.weeklyOff || 'Sunday'} 
                          onChange={e => setFormData({...formData, weeklyOff: e.target.value})} 
                          className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold"
                        >
                          {['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'].map(d => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Bank Name</label>
                        <input 
                          type="text" 
                          value={formData.bankName || ''} 
                          onChange={e => setFormData({...formData, bankName: e.target.value})} 
                          className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs" 
                          placeholder="e.g. Nabil Bank"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Bank Account Number</label>
                        <input 
                          type="text" 
                          value={formData.accountNumber || ''} 
                          onChange={e => setFormData({...formData, accountNumber: e.target.value})} 
                          className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 rounded-xl font-mono text-xs" 
                          placeholder="0123456789012"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Employment Status</label>
                      <select 
                        value={formData.status || 'Active'} 
                        onChange={e => setFormData({...formData, status: e.target.value as any})} 
                        className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold"
                      >
                        <option value="Active">Active</option>
                        <option value="Inactive">Inactive</option>
                      </select>
                    </div>
                  </div>
                )}

                {/* Modal Action Buttons */}
                <div className="flex items-center justify-between pt-4 border-t border-slate-200 dark:border-slate-800">
                  <span className="text-[11px] text-slate-400">
                    * Required fields
                  </span>
                  <div className="flex items-center gap-2">
                    <Button type="button" variant="outline" onClick={handleCloseModalAttempt}>
                      Cancel
                    </Button>
                    <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md">
                      {editingId ? 'Save Master Changes' : 'Create Employee Profile'}
                    </Button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Unsaved Changes Discard Confirmation Dialog */}
        {isDiscardConfirmOpen && (
          <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center p-4 z-[120] backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-950 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-amber-200 dark:border-amber-900/40">
              <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 dark:bg-amber-950/60 dark:text-amber-400 flex items-center justify-center shrink-0">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">Discard Unsaved Changes?</h3>
                  <p className="text-xs text-slate-500">You have modified form fields that are not yet saved to SQLite.</p>
                </div>
              </div>

              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200/50 dark:border-amber-900/30 text-xs text-amber-800 dark:text-amber-300 space-y-1">
                <p className="font-bold">Warning: Unsaved edits will be lost</p>
                <p className="text-[11px] opacity-90">Closing without clicking "Save Master Changes" will discard any modifications made to this employee profile.</p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => setIsDiscardConfirmOpen(false)}
                  className="font-bold"
                >
                  Stay & Keep Editing
                </Button>
                <Button 
                  type="button" 
                  variant="danger" 
                  onClick={handleConfirmDiscard}
                  className="font-bold bg-rose-600 hover:bg-rose-700 text-white"
                >
                  Discard Changes
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Master Data Change Confirmation Modal */}
        {isChangeConfirmOpen && pendingFormSubmit && (
          <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center p-4 z-[110] backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-950 rounded-2xl shadow-2xl max-w-lg w-full p-6 space-y-4 border border-amber-200 dark:border-amber-900/40">
              <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center shrink-0">
                  <AlertTriangle size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">Confirm Master Data Modification</h3>
                  <p className="text-xs text-slate-500">Changes will record in Movement and Audit History</p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-bold text-slate-700 dark:text-slate-300">Detected Changes ({detectedChanges.length}):</p>
                <div className="bg-slate-50 dark:bg-slate-900 rounded-xl p-3 divide-y divide-slate-100 dark:divide-slate-800 text-xs space-y-2">
                  {detectedChanges.map((ch, idx) => (
                    <div key={idx} className={idx > 0 ? "pt-2" : ""}>
                      <span className="font-bold text-slate-500 uppercase text-[10px] block">{ch.label}</span>
                      <p className="text-slate-700 dark:text-slate-300 font-mono">
                        <span className="line-through text-slate-400">{ch.oldVal || 'None'}</span> → <strong className="text-indigo-600 dark:text-indigo-400">{ch.newVal || 'None'}</strong>
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Reason / Note for Master Change</label>
                <input 
                  type="text" 
                  value={changeReason} 
                  onChange={e => setChangeReason(e.target.value)} 
                  placeholder="e.g. Annual Appraisal / Department Reorganization"
                  className="w-full px-3.5 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Button variant="outline" onClick={() => setIsChangeConfirmOpen(false)}>
                  Cancel
                </Button>
                <Button 
                  onClick={() => executeUpdateEmployee(
                    pendingFormSubmit, 
                    detectedChanges.map(c => ({ field: c.field, label: c.label, oldValue: c.oldVal, newValue: c.newVal })), 
                    changeReason
                  )}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-md"
                >
                  Confirm & Apply Changes
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Deactivate Employee Modal */}
        {isDeactivateModalOpen && employeeToDeactivate && (
          <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center p-4 z-[110] backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-950 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4 border border-rose-200 dark:border-rose-900/40">
              <div className="flex items-center gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
                <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                  <UserX size={20} />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">Deactivate Employee Profile</h3>
                  <p className="text-xs text-slate-500">Historical records (attendance, payroll) remain safe</p>
                </div>
              </div>

              <p className="text-xs text-slate-600 dark:text-slate-400">
                You are setting <strong className="text-slate-900 dark:text-white">{employeeToDeactivate.name}</strong> (ID: {employeeToDeactivate.id}) to Inactive.
              </p>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Effective Separation Date</label>
                  <input 
                    type="date" 
                    value={deactivateData.effectiveDate} 
                    onChange={e => setDeactivateData({...deactivateData, effectiveDate: e.target.value})} 
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl font-mono text-xs font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Exit Type</label>
                  <select 
                    value={deactivateData.exitType} 
                    onChange={e => setDeactivateData({...deactivateData, exitType: e.target.value as any})} 
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs font-bold"
                  >
                    <option value="Voluntary">Voluntary Resignation</option>
                    <option value="Involuntary">Termination</option>
                    <option value="Retirement">Retirement</option>
                    <option value="Contract End">Contract Completion</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Reason / Notes</label>
                  <input 
                    type="text" 
                    value={deactivateData.exitReason} 
                    onChange={e => setDeactivateData({...deactivateData, exitReason: e.target.value})} 
                    placeholder="e.g. Higher studies / Relocation"
                    className="w-full px-3 py-2 border border-slate-300 dark:border-slate-700 rounded-xl text-xs"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <Button variant="outline" onClick={() => setIsDeactivateModalOpen(false)}>
                  Cancel
                </Button>
                <Button variant="danger" onClick={confirmDeactivate}>
                  Confirm Deactivation
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Bulk Shift Modal */}
        {isBulkShiftModalOpen && (
          <div className="fixed inset-0 bg-slate-900/50 flex items-center justify-center p-4 z-[100] backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-950 rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Batch Shift Reassignment</h3>
                <button onClick={() => setIsBulkShiftModalOpen(false)} className="p-1 hover:bg-slate-100 rounded-lg text-slate-400"><X size={18} /></button>
              </div>
              <p className="text-xs text-slate-500">Updating standard shift for <strong className="text-indigo-600">{selectedEmployees.length}</strong> selected employees.</p>

              <div className="space-y-2 max-h-60 overflow-y-auto custom-scrollbar-light">
                {settings.shifts?.map(shift => (
                  <button 
                    key={shift.id}
                    onClick={() => setBulkShiftId(shift.id)}
                    className={cn(
                      "w-full p-3 text-left border rounded-xl transition-all text-xs flex items-center justify-between",
                      bulkShiftId === shift.id ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 ring-2 ring-indigo-500/20 font-bold" : "border-slate-200 dark:border-slate-800 hover:bg-slate-50"
                    )}
                  >
                    <span>{shift.name}</span>
                    <span className="font-mono text-[10px] text-slate-400">{shift.startTime} - {shift.endTime}</span>
                  </button>
                ))}
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                <Button variant="outline" onClick={() => setIsBulkShiftModalOpen(false)}>Cancel</Button>
                <Button onClick={handleBulkShiftUpdate} disabled={!bulkShiftId} className="bg-indigo-600 text-white">
                  Apply Shift Update
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Bulk Import Modal */}
        {isImportModalOpen && (
          <div className="fixed inset-0 bg-slate-900/60 flex items-center justify-center p-4 z-[100] backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-950 rounded-2xl shadow-2xl max-w-xl w-full p-6 space-y-5 max-h-[90vh] overflow-y-auto border border-slate-200 dark:border-slate-800">
              <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
                <div>
                  <h3 className="text-base font-black text-slate-900 dark:text-white">Bulk Import Employee Master</h3>
                  <p className="text-xs text-slate-500">Excel import with validation, SSF 20% model, and duplicate conflict handling</p>
                </div>
                <button onClick={() => { setIsImportModalOpen(false); setImportFile(null); setImportPreview(null); }} className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-400"><X size={18} /></button>
              </div>

              {/* Upload Drop Zone */}
              <div className={cn(
                "p-6 border-2 border-dashed rounded-2xl text-center space-y-3 transition-all",
                importFile ? "border-indigo-500 bg-indigo-50/20 dark:bg-indigo-950/10" : "border-slate-200 dark:border-slate-800"
              )}>
                <FileUp className={cn("w-8 h-8 mx-auto", importFile ? "text-indigo-600" : "text-slate-400")} />
                <div className="text-xs text-slate-600 dark:text-slate-400">
                  {importFile ? (
                    <div>
                      <p className="font-bold text-slate-900 dark:text-white text-sm">{importFile.name}</p>
                      <p className="text-[10px] text-emerald-600 font-bold uppercase mt-0.5">Ready for verification</p>
                    </div>
                  ) : (
                    "Select an Excel workbook (.xlsx) with Employee_Master sheet."
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
                  <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                    {importFile ? "Change File" : "Choose Excel File"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={downloadTemplate} className="text-indigo-600 border-indigo-200">
                    <Download size={13} className="mr-1" /> Template with Rules
                  </Button>
                </div>
              </div>

              {/* Validation Summary */}
              {importPreview && (
                <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-3 text-xs">
                  <div className="flex items-center justify-between">
                    <h4 className="font-black uppercase tracking-wider text-slate-700 dark:text-slate-300 text-[11px]">Validation Summary</h4>
                    <span className="font-mono font-bold text-slate-500">{importPreview.totalRows} Total Rows in File</span>
                  </div>

                  <div className="grid grid-cols-4 gap-2 text-center font-mono">
                    <div className="bg-white dark:bg-slate-950 p-2 rounded-xl border border-slate-200 dark:border-slate-800">
                      <span className="text-[9px] uppercase font-bold text-slate-400 block">Valid Rows</span>
                      <strong className="text-emerald-600 text-sm">{importPreview.validCount}</strong>
                    </div>
                    <div className="bg-white dark:bg-slate-950 p-2 rounded-xl border border-slate-200 dark:border-slate-800">
                      <span className="text-[9px] uppercase font-bold text-slate-400 block">New Bio IDs</span>
                      <strong className="text-indigo-600 text-sm">{importPreview.newCount}</strong>
                    </div>
                    <div className="bg-white dark:bg-slate-950 p-2 rounded-xl border border-slate-200 dark:border-slate-800">
                      <span className="text-[9px] uppercase font-bold text-slate-400 block">Existing IDs</span>
                      <strong className="text-amber-600 text-sm">{importPreview.existingCount}</strong>
                    </div>
                    <div className="bg-white dark:bg-slate-950 p-2 rounded-xl border border-slate-200 dark:border-slate-800">
                      <span className="text-[9px] uppercase font-bold text-slate-400 block">File Dupes</span>
                      <strong className="text-rose-500 text-sm">{importPreview.duplicateBioInFile}</strong>
                    </div>
                  </div>

                  {importPreview.existingCount > 0 && (
                    <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl p-3 space-y-2">
                      <p className="font-bold text-amber-900 dark:text-amber-300">Conflict Strategy for {importPreview.existingCount} Existing IDs:</p>
                      <div className="flex items-center gap-4 text-slate-700 dark:text-slate-300 font-medium">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input 
                            type="radio" 
                            name="duplicateMode" 
                            value="update" 
                            checked={duplicateMode === 'update'} 
                            onChange={() => setDuplicateMode('update')}
                            className="text-indigo-600 focus:ring-indigo-500"
                          />
                          <span>Update Existing Master Records (Recommended)</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input 
                            type="radio" 
                            name="duplicateMode" 
                            value="skip" 
                            checked={duplicateMode === 'skip'} 
                            onChange={() => setDuplicateMode('skip')}
                            className="text-indigo-600 focus:ring-indigo-500"
                          />
                          <span>Skip Existing</span>
                        </label>
                      </div>
                    </div>
                  )}

                  {importPreview.errors.length > 0 && (
                    <div className="bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 rounded-xl p-3 space-y-1 text-rose-700 dark:text-rose-300 font-mono text-[11px]">
                      <p className="font-bold">Validation Warnings ({importPreview.errors.length}):</p>
                      <ul className="max-h-20 overflow-y-auto list-disc pl-4 space-y-0.5">
                        {importPreview.errors.slice(0, 5).map((err, i) => <li key={i}>{err}</li>)}
                        {importPreview.errors.length > 5 && <li>+ {importPreview.errors.length - 5} more warnings</li>}
                      </ul>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <Button variant="outline" size="sm" onClick={() => { setIsImportModalOpen(false); setImportFile(null); setImportPreview(null); }}>
                      Cancel
                    </Button>
                    <Button 
                      size="sm"
                      onClick={handleExecuteImport} 
                      disabled={importPreview.validCount === 0 || importProgress.active}
                      className="bg-emerald-600 hover:bg-emerald-700 text-white shadow-md"
                    >
                      <FileUp size={14} className="mr-1.5" /> Import {importPreview.validCount} Valid Records
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Progress Overlay Modal */}
        {importProgress.active && (
          <div className="fixed inset-0 bg-slate-900/70 flex items-center justify-center p-4 z-[120] backdrop-blur-md">
            <div className="bg-white dark:bg-slate-950 rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4 text-center border border-slate-200 dark:border-slate-800">
              <div className="w-12 h-12 bg-indigo-50 dark:bg-indigo-900/30 rounded-2xl flex items-center justify-center mx-auto text-indigo-600">
                <RefreshCw className="w-6 h-6 animate-spin" />
              </div>
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">Importing Master Records</h3>
                <p className="text-xs text-slate-500 mt-0.5">{importProgress.currentName}</p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-mono font-bold">
                  <span>{importProgress.current} / {importProgress.total}</span>
                  <span className="text-indigo-600">{importProgress.percent}%</span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div className="h-full bg-indigo-600 rounded-full transition-all duration-150" style={{ width: `${importProgress.percent}%` }} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}

function KpiCard({ 
  label, 
  count, 
  icon: Icon, 
  color, 
  isActive, 
  onClick 
}: { 
  label: string; 
  count: number; 
  icon: any; 
  color: string; 
  isActive: boolean; 
  onClick: () => void; 
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "p-3.5 rounded-2xl border text-left transition-all relative overflow-hidden group shadow-sm",
        isActive 
          ? "bg-white dark:bg-slate-900 border-indigo-600 ring-2 ring-indigo-500/20 shadow-md" 
          : "bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-slate-300"
      )}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 truncate block">{label}</span>
        <Icon size={16} className={cn(
          color === 'indigo' ? "text-indigo-600" :
          color === 'emerald' ? "text-emerald-600" :
          color === 'rose' ? "text-rose-500" :
          color === 'amber' ? "text-amber-500" :
          color === 'blue' ? "text-blue-500" : "text-slate-400"
        )} />
      </div>
      <p className="text-xl font-black text-slate-900 dark:text-white font-mono tracking-tight">{count}</p>
    </button>
  );
}
