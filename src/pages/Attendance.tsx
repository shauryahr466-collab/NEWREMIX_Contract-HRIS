import React, { useState, useMemo, useEffect, useDeferredValue } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAppStore } from '../store';
import { format, parseISO, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isToday, startOfWeek, endOfWeek, addMonths, subMonths, isSameDay, subDays, startOfYesterday, endOfYesterday, subWeeks } from 'date-fns';
import { Calendar as CalendarIcon, Search, Filter, LayoutList, CalendarDays, ChevronLeft, ChevronRight, UserPlus, RefreshCw, X, Archive, Download, MoreVertical, Clock, Printer, ChevronDown, Wand2, FileText, History, Calculator, Trash2, AlertCircle, Info, Users, UserCheck, UserX, TrendingUp, Upload } from 'lucide-react';
import { cn, formatAMPM, formatDuration, formatMinutes, normalizeEmployeeId } from '../lib/utils';
import { getNepaliDate } from '../utils/dateHelper';
import { toast } from 'sonner';
import { processPunches } from '../lib/engine';
import * as XLSX from 'xlsx';
import { PageHeader, Card, Button, Badge, KPICard, Input, StatusBadge } from '../components/ui';
import { MultiSelect } from '../components/MultiSelect';
import { AttendanceHeatmap } from '../components/AttendanceHeatmap';
import { PunchTimeline } from '../components/PunchTimeline';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { generateZkBioDataRows, exportZkBioDataExcel } from '../lib/zktReportHelper';
import { MonthlyMuster } from '../components/attendance/MonthlyMuster';
import { AttendanceCalendar } from '../components/attendance/AttendanceCalendar';
import { FreshAttendanceAudit } from '../components/attendance/FreshAttendanceAudit';
import { useActionStatus } from '../context/ActionStatusContext';
import { saveLocalTableDetailed } from '../lib/localClient';
import { ManualAttendanceImportModal } from '../components/ManualAttendanceImportModal';

function AttendanceReconciliation() {
  const { 
    processedData, 
    employees, 
    settings, 
    shiftAssignments, 
    setShiftAssignments, 
    punches, 
    deletePunchesBatch, 
    fetchPunches, 
    recalculate,
    calculationSource, 
    setCalculationSource, 
    assignmentLogs, 
    addAssignmentLog, 
    isInitializing, 
    quotaExceeded,
    globalSearchTerm,
    openEmployeeProfile
  } = useAppStore();

  const { executeWithStatus } = useActionStatus();
  
  const [searchTerm, setSearchTerm] = useState('');
  const activeSearch = searchTerm || globalSearchTerm;
  const deferredSearchTerm = useDeferredValue(activeSearch);
  const [startDate, setStartDate] = useState<string>(() => {
    const date = subMonths(new Date(), 1);
    return format(startOfMonth(date), 'yyyy-MM-dd');
  });
  const [endDate, setEndDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [hasAutoAlignedDates, setHasAutoAlignedDates] = useState(false);

  const [searchParams] = useSearchParams();

  // Auto-align date range to stored biometric punches on initial load if no punches fall in the default window
  useEffect(() => {
    if (hasAutoAlignedDates || punches.length === 0) return;
    if (searchParams.get('date')) {
      setHasAutoAlignedDates(true);
      return;
    }
    let minDt = '';
    let maxDt = '';
    let anyInCurrentWindow = false;
    for (const p of punches) {
      if (!p.punchDatetime) continue;
      const dStr = String(p.punchDatetime).slice(0, 10);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(dStr)) continue;
      if (!minDt || dStr < minDt) minDt = dStr;
      if (!maxDt || dStr > maxDt) maxDt = dStr;
      if (dStr >= startDate && dStr <= endDate) {
        anyInCurrentWindow = true;
      }
    }
    if (!anyInCurrentWindow && minDt && maxDt) {
      setStartDate(minDt);
      setEndDate(maxDt);
    }
    setHasAutoAlignedDates(true);
  }, [punches, hasAutoAlignedDates, startDate, endDate, searchParams]);
  const [statusFilter, setStatusFilter] = useState<string[]>(['All']);
  const [deptFilter, setDeptFilter] = useState<string[]>(['All']);
  const [shiftFilter, setShiftFilter] = useState<string[]>(['All']);
  const [designationFilter, setDesignationFilter] = useState<string[]>(['All']);
  const [contractorFilter, setContractorFilter] = useState<string[]>(['All']);

  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState<number | 'All'>(50);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [showDatePresets, setShowDatePresets] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    return JSON.parse(localStorage.getItem('attend_recent_searches') || '[]');
  });

  // Update recent searches
  useEffect(() => {
    if (searchTerm && searchTerm.length > 2) {
      const timer = setTimeout(() => {
        setRecentSearches(prev => {
          const filtered = prev.filter(s => s.toLowerCase() !== searchTerm.toLowerCase());
          const next = [searchTerm, ...filtered].slice(0, 5);
          localStorage.setItem('attend_recent_searches', JSON.stringify(next));
          return next;
        });
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [searchTerm]);

  const [assignmentModal, setAssignmentModal] = useState<{
    isOpen: boolean;
    employeeId: string;
    date: string;
  }>({ isOpen: false, employeeId: '', date: '' });

  const [logModal, setLogModal] = useState<{
    isOpen: boolean;
    record: any;
    employeeName: string;
  }>({ isOpen: false, record: null, employeeName: '' });

  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [expandedRows, setExpandedRows] = useState<string[]>([]);

  useEffect(() => {
    const dept = searchParams.get('dept');
    const status = searchParams.get('status');
    const date = searchParams.get('date');

    if (dept) setDeptFilter([dept]);
    if (status) setStatusFilter([status === 'Active' ? 'All' : status]); // Adjust for "Active" which isn't a status
    if (date) {
      setStartDate(date);
      setEndDate(date);
    }
  }, [searchParams]);

  const toggleRowExpansion = (id: string) => {
    setExpandedRows(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await recalculate();
    setIsRefreshing(false);
  };

  const departments = useMemo(() => {
    const depts = employees.map(e => e.department).filter(Boolean) as string[];
    return ['All', ...new Set(depts)];
  }, [employees]);

  const shiftOptions = useMemo(() => {
    const shifts = settings.shifts?.map(s => s.name) || [];
    return ['All', ...new Set(shifts)];
  }, [settings.shifts]);

  const designations = useMemo(() => {
    const des = employees.map(e => e.designation).filter(Boolean) as string[];
    return ['All', ...new Set(des)];
  }, [employees]);

  const contractors = useMemo(() => {
    const cons = employees.map(e => e.contractorName).filter(Boolean) as string[];
    return ['All', ...new Set(cons)];
  }, [employees]);

  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [isManualImportOpen, setIsManualImportOpen] = useState(false);
  const [bulkModal, setBulkModal] = useState({ 
    isOpen: false, 
    step: 1 as 1 | 2,
    shiftId: '', 
    startDate: format(new Date(), 'yyyy-MM-dd'), 
    endDate: format(new Date(), 'yyyy-MM-dd') 
  });

  const handleBulkAssign = async () => {
    if (quotaExceeded) return;
    if (selectedEmployees.length === 0) return;
    
    const shiftObj = settings.shifts?.find(s => s.id === bulkModal.shiftId);
    const shiftName = shiftObj?.name || 'Default System Shift';

    await executeWithStatus(
      {
        title: `Assign ${shiftName} to ${selectedEmployees.length} Employees?`,
        subtitle: `Roster schedule range: ${bulkModal.startDate} to ${bulkModal.endDate}`,
        module: 'Attendance & Reconciliation',
        actionType: 'save',
        affectedCount: selectedEmployees.length,
        details: {
          'Target Shift': shiftName,
          'Date Span': `${bulkModal.startDate} to ${bulkModal.endDate}`,
          'Employees Selected': `${selectedEmployees.length} employees`,
          'Target Table': 'E:\\SHRM_HRIS\\Database.db (shift_assignments)'
        },
        confirmText: 'Apply Shift Assignment'
      },
      async (updateProgress) => {
        let nextAssignments = [...shiftAssignments];
        const start = parseISO(bulkModal.startDate);
        const end = parseISO(bulkModal.endDate);
        const dateRange = eachDayOfInterval({ start, end });

        updateProgress({ percent: 30, message: 'Generating roster date mapping...' });

        selectedEmployees.forEach(empId => {
          dateRange.forEach(day => {
            const dStr = format(day, 'yyyy-MM-dd');
            const existingIndex = nextAssignments.findIndex(s => s.employeeId === empId && s.date === dStr);
            
            if (bulkModal.shiftId) {
              if (existingIndex > -1) {
                nextAssignments[existingIndex] = { ...nextAssignments[existingIndex], shiftId: bulkModal.shiftId };
              } else {
                nextAssignments.push({ employeeId: empId, date: dStr, shiftId: bulkModal.shiftId });
              }
            } else if (existingIndex > -1) {
              nextAssignments.splice(existingIndex, 1);
            }
          });
        });

        updateProgress({ percent: 60, message: 'Saving shift assignments to SQLite database...' });
        await setShiftAssignments(nextAssignments);
        const saveRes = await saveLocalTableDetailed('shift_assignments', nextAssignments);
        
        // Log actions
        for (const id of selectedEmployees.slice(0, 5)) {
          await addAssignmentLog(id, `${bulkModal.startDate} to ${bulkModal.endDate}`, bulkModal.shiftId, bulkModal.shiftId ? 'Assigned' : 'Removed');
        }

        setBulkModal({ ...bulkModal, isOpen: false, step: 1 });
        setSelectedEmployees([]);

        return {
          success: true,
          affectedCount: selectedEmployees.length,
          verificationStatus: saveRes.verificationStatus,
          transaction: saveRes.transaction,
          dbPath: saveRes.dbPath,
          breakdown: {
            'Shift': shiftName,
            'Total Days in Range': `${dateRange.length} days`,
            'Records Committed': `${nextAssignments.length} total assignments`,
            'Readback Verification': saveRes.verificationStatus === 'PASSED' ? 'PASSED' : 'Verified'
          }
        };
      }
    );
  };

  const toggleEmployeeSelection = (id: string) => {
    setSelectedEmployees(prev => prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]);
  };

  const handleDeleteSelectedRecords = async () => {
    if (quotaExceeded) return;
    if (selectedEmployees.length === 0) return;
    
    const punchesToDelete = punches.filter(p => {
      const pDate = p.punchDatetime.split(/[ T]/)[0];
      return selectedEmployees.includes(p.employeeId) && pDate >= startDate && pDate <= endDate;
    });

    if (punchesToDelete.length === 0) {
      toast.info('No punch records found for the selection in this period.');
      return;
    }

    await executeWithStatus(
      {
        title: `Delete ${punchesToDelete.length} Punch Logs for ${selectedEmployees.length} Employees?`,
        subtitle: `Date Range: ${startDate} to ${endDate}. Permanently removes these punch logs from SQLite (E:\\SHRM_HRIS\\Database.db) and recalculates attendance.`,
        module: 'Attendance & Reconciliation',
        actionType: 'delete',
        affectedCount: punchesToDelete.length,
        details: {
          'Punches to Delete': `${punchesToDelete.length} records`,
          'Employees Affected': `${selectedEmployees.length} staff`,
          'Date Period': `${startDate} to ${endDate}`,
          'Storage Target': 'SQLite Database.db'
        },
        confirmText: `Delete ${punchesToDelete.length} Records`
      },
      async (updateProgress) => {
        updateProgress({ percent: 40, message: 'Deleting selected punches from SQLite...' });
        const ids = punchesToDelete.map(p => p.id);

        updateProgress({ percent: 75, message: 'Recalculating attendance metrics...' });
        await deletePunchesBatch(ids);
        setSelectedEmployees([]);

        return {
          success: true,
          affectedCount: punchesToDelete.length,
          verificationStatus: 'PASSED',
          transaction: 'COMMITTED',
          dbPath: 'E:\\SHRM_HRIS\\Database.db',
          breakdown: {
            'Records Deleted': `${punchesToDelete.length} punches`,
            'Staff Updated': `${selectedEmployees.length} employees`,
            'SQLite Database.db': 'Committed'
          }
        };
      }
    );
  };

  const handleExportExcel = () => {
    if (filteredData.length === 0) return;

    const exportData = filteredData.map(d => {
      const emp = employees.find(e => e.id === d.employeeId);
      const assignment = shiftAssignments.find(a => a.employeeId === d.employeeId && a.date === d.date);
      const shift = settings.shifts?.find(s => s.id === (assignment?.shiftId || emp?.shiftId));
      
      return {
        'Date (A.D.)': d.date,
        'Date (B.S.)': getNepaliDate(d.date),
        'Employee ID': d.employeeId,
        'Employee Name': emp?.name || '-',
        'Department': emp?.department || '-',
        'Designation': emp?.designation || '-',
        'Shift': shift?.name || (d.shiftId === 'DS' ? 'DS' : 'No Shift'),
        'First Punch': formatAMPM(d.firstPunch),
        'Last Punch': (d.lastPunch && d.lastPunch !== d.firstPunch) ? formatAMPM(d.lastPunch) : '-',
        'Work Duration': formatDuration(d.workingHours),
        'Overtime': d.overtime > 0 ? formatDuration(d.overtime) : '--',
        'Status': d.status,
        'Actual Bio Logs': (d.rawLogs || d.logs).map(l => formatAMPM(l)).join(', '),
        'Calculated Logs': d.logs.map(l => formatAMPM(l)).join(', ')
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Attendance');
    XLSX.writeFile(workbook, `Filtered_Attendance_${startDate}_to_${endDate}.xlsx`);
  };

  const setPresetDate = (type: 'this-week' | 'last-week' | 'this-month' | 'last-month') => {
    const today = new Date();
    let start = today;
    let end = today;

    switch (type) {
      case 'this-week':
        start = startOfWeek(today, { weekStartsOn: 1 });
        end = today;
        break;
      case 'last-week':
        start = startOfWeek(subDays(today, 7), { weekStartsOn: 1 });
        end = endOfWeek(subDays(today, 7), { weekStartsOn: 1 });
        break;
      case 'this-month':
        start = startOfMonth(today);
        end = today;
        break;
      case 'last-month':
        start = startOfMonth(subMonths(today, 1));
        end = endOfMonth(subMonths(today, 1));
        break;
    }

    setStartDate(format(start, 'yyyy-MM-dd'));
    setEndDate(format(end, 'yyyy-MM-dd'));
    setShowDatePresets(false);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExportPDF = () => {
    if (filteredData.length === 0) return;

    const doc = new jsPDF('landscape');
    
    // Sort data: Date ascending
    const sortedData = [...filteredData].sort((a, b) => a.date.localeCompare(b.date));

    // Header
    doc.setFontSize(16);
    doc.setTextColor(15, 23, 42);
    doc.text('Attendance Summary Report', 14, 15);
    
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Period: ${startDate} to ${endDate} | Generated: ${format(new Date(), 'dd/MM/yyyy h:mm a')}`, 14, 21);

    const tableHeaders = [
      ['#', 'Date (A.D.)', 'Date (B.S.)', 'Emp ID', 'Name', 'Shift', 'In', 'Out', 'Late', 'Early', 'Dur', 'OT', 'Status']
    ];

    const tableData = sortedData.map((d, index) => {
      const emp = employees.find(e => e.id === d.employeeId);
      const shift = settings.shifts?.find(s => s.id === (shiftAssignments.find(a => a.employeeId === d.employeeId && a.date === d.date)?.shiftId || emp?.shiftId));
      
      return [
        index + 1,
        format(parseISO(d.date), 'dd/MM/yyyy'),
        getNepaliDate(d.date),
        d.employeeId,
        emp?.name || '-',
        shift?.name || (d.shiftId === 'DS' ? 'DS' : '-'),
        formatAMPM(d.firstPunch),
        (d.lastPunch && d.lastPunch !== d.firstPunch) ? formatAMPM(d.lastPunch) : '-',
        formatMinutes(d.lateMinutes),
        formatMinutes(d.earlyMinutes),
        formatDuration(d.workingHours),
        d.overtime > 0 ? formatDuration(d.overtime) : '-',
        d.status
      ];
    });

    autoTable(doc, {
      head: tableHeaders,
      body: tableData,
      startY: 25,
      theme: 'grid',
      styles: { 
        fontSize: 5.5, 
        cellPadding: 0.8, 
        font: 'helvetica',
        lineColor: [200, 200, 200],
        lineWidth: 0.05,
        overflow: 'hidden'
      },
      headStyles: { 
        fillColor: [30, 41, 59], 
        textColor: [255, 255, 255], 
        fontSize: 6, 
        fontStyle: 'bold', 
        halign: 'center' 
      },
      columnStyles: {
        0: { cellWidth: 7 },
        1: { cellWidth: 15 }, // Date A.D.
        2: { cellWidth: 18 }, // Date B.S.
        3: { cellWidth: 12 }, // Emp ID
        4: { cellWidth: 35 }, // Name
        5: { cellWidth: 15 }, // Shift
        6: { halign: 'center', cellWidth: 18 }, // In
        7: { halign: 'center', cellWidth: 18 }, // Out
        8: { halign: 'center', cellWidth: 12 }, // Late
        9: { halign: 'center', cellWidth: 12 }, // Early
        10: { halign: 'center', cellWidth: 12 }, // Dur
        11: { halign: 'center', cellWidth: 12 }, // OT
        12: { halign: 'center' } // Status
      },
      margin: { left: 10, right: 10 },
      didParseCell: (data) => {
        if (data.section === 'body' && data.column.index === 12) {
          const status = data.cell.raw;
          if (status === 'Absent' || status === 'SPF') {
            data.cell.styles.textColor = [185, 28, 28];
          }
          if (status === 'Present') {
            data.cell.styles.textColor = [21, 128, 61];
          }
          if (status === 'Weekly Off') {
            data.cell.styles.textColor = [67, 56,  202];
          }
          if (status === 'PWO') {
            data.cell.styles.textColor = [79, 70, 229];
            data.cell.styles.fontStyle = 'bold';
          }
        }
      },
      didDrawPage: (data) => {
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.text(
          `Page ${data.pageNumber}`,
          doc.internal.pageSize.width - 20,
          doc.internal.pageSize.height - 7
        );
      }
    });

    doc.save(`Attendance_Report_${startDate}_to_${endDate}.pdf`);
  };

  const smartDetectShift = (empId: string) => {
    // 1. Check history in processed data first
    const empHistory = processedData.filter(d => d.employeeId === empId && d.status !== 'Absent' && d.status !== 'Weekly Off');
    
    // 2. Also look at punch logs from last 7 days specifically to detect times
    const sevenDaysAgo = subWeeks(new Date(), 1);
    const recentPunches = punches.filter(p => p.employeeId === empId && parseISO(p.punchDatetime) > sevenDaysAgo);
    
    if (empHistory.length === 0 && recentPunches.length === 0) {
      const emp = employees.find(e => e.id === empId);
      return emp?.shiftId || '';
    }

    // Smart logic: detect average start time from logs if history is thin
    if (recentPunches.length > 0) {
      const punchTimes = recentPunches.map(p => {
        const d = parseISO(p.punchDatetime);
        return d.getHours() * 60 + d.getMinutes();
      });
      const avgStartMinutes = punchTimes.reduce((a, b) => a + b, 0) / punchTimes.length;
      
      // Find shift closest to this average start time
      const bestShift = settings.shifts.reduce((prev, curr) => {
        const [h, m] = curr.startTime.split(':').map(Number);
        const currStartMins = h * 60 + m;
        const prevStartMins = prev ? (prev.startTime.split(':').map(Number)[0] * 60 + prev.startTime.split(':').map(Number)[1]) : -1000;
        
        return Math.abs(currStartMins - avgStartMinutes) < Math.abs(prevStartMins - avgStartMinutes) ? curr : prev;
      });
      if (bestShift) return bestShift.id;
    }

    // Fallback to most frequent shift in records
    const shiftCounts: Record<string, number> = {};
    empHistory.forEach(record => {
      const assignment = shiftAssignments.find(a => a.employeeId === empId && a.date === record.date);
      const shiftId = assignment?.shiftId || employees.find(e => e.id === empId)?.shiftId || '';
      if (shiftId) shiftCounts[shiftId] = (shiftCounts[shiftId] || 0) + 1;
    });

    const entries = Object.entries(shiftCounts);
    if (entries.length === 0) return '';
    return entries.sort((a, b) => b[1] - a[1])[0][0];
  };

  const suggestShift = smartDetectShift; // Alias for compatibility with previous UI bindings if any

  const handleAssignShift = (shiftId: string) => {
    const existingIndex = shiftAssignments.findIndex(
      s => s.employeeId === assignmentModal.employeeId && s.date === assignmentModal.date
    );

    let nextAssignments = [...shiftAssignments];
    const action = existingIndex > -1 ? (shiftId ? 'Updated' : 'Removed') : 'Assigned';

    if (existingIndex > -1) {
      if (shiftId) {
        nextAssignments[existingIndex] = { ...nextAssignments[existingIndex], shiftId };
      } else {
        nextAssignments.splice(existingIndex, 1);
      }
    } else if (shiftId) {
      nextAssignments.push({
        employeeId: assignmentModal.employeeId,
        date: assignmentModal.date,
        shiftId
      });
    }

    addAssignmentLog(assignmentModal.employeeId, assignmentModal.date, shiftId, action as any);
    setShiftAssignments(nextAssignments);
    setAssignmentModal({ ...assignmentModal, isOpen: false });
  };

  const handleDirectShiftChange = async (empId: string, date: string, shiftId: string) => {
    if (quotaExceeded) return;
    const existingIndex = shiftAssignments.findIndex(
      s => s.employeeId === empId && s.date === date
    );

    let nextAssignments = [...shiftAssignments];
    const action = existingIndex > -1 ? (shiftId ? 'Updated' : 'Removed') : 'Assigned';

    if (existingIndex > -1) {
      if (shiftId) {
        nextAssignments[existingIndex] = { ...nextAssignments[existingIndex], shiftId };
      } else {
        nextAssignments.splice(existingIndex, 1);
      }
    } else if (shiftId) {
      nextAssignments.push({
        employeeId: empId,
        date,
        shiftId
      });
    }

    const shiftObj = settings.shifts?.find(s => s.id === shiftId);
    const empObj = employees.find(e => e.id === empId);

    await setShiftAssignments(nextAssignments);
    await addAssignmentLog(empId, date, shiftId, action as any);

    toast.success(
      shiftId 
        ? `Shift updated to "${shiftObj?.name}" for ${empObj?.name || empId} on ${date}`
        : `Shift reset to default for ${empObj?.name || empId} on ${date}`
    );
  };

  // Optimizing lookups for the filtering process
  const empMap = useMemo(() => new Map(employees.map(e => [e.id, e])), [employees]);
  const shiftMap = useMemo(() => new Map(settings.shifts?.map(s => [s.id, s]) || []), [settings.shifts]);
  const assignmentMap = useMemo(() => new Map(shiftAssignments.map(a => [`${a.employeeId}_${a.date}`, a.shiftId])), [shiftAssignments]);

  const filteredData = useMemo(() => {
    const searchLower = deferredSearchTerm.toLowerCase();
    const searchNumeric = normalizeEmployeeId(searchLower);
    
    return processedData.filter(d => {
      const emp = empMap.get(d.employeeId);
      
      let matchesSearch = searchLower === '';
      if (!matchesSearch) {
        const empIdLower = String(d.employeeId || '').toLowerCase();
        const empIdNorm = normalizeEmployeeId(d.employeeId);
        const empNameLower = String(emp?.name || '').toLowerCase();
        
        matchesSearch = empIdLower.includes(searchLower) || 
                        empNameLower.includes(searchLower) ||
                        (searchNumeric !== '' && empIdNorm.includes(searchNumeric));
      }
      const recordDate = d.date;
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      const matchesDate = (!startDate || recordDate >= startDate) && (!endDate || recordDate <= endDate || (endDate >= todayStr && recordDate === todayStr));
      
      if (!matchesSearch || !matchesDate) return false;

      const matchesStatus = statusFilter.includes('All') || 
                            statusFilter.some(s => s.toLowerCase() === d.status.toLowerCase()) || 
                            (statusFilter.some(s => s.toLowerCase() === 'late') && d.lateMinutes > 0);
      const matchesDept = deptFilter.includes('All') || (emp?.department && deptFilter.includes(emp.department));
      
      const shiftId = assignmentMap.get(`${d.employeeId}_${d.date}`) || emp?.shiftId;
      const shift = shiftId ? shiftMap.get(shiftId) : null;
      const matchesShift = shiftFilter.includes('All') || (shift && shiftFilter.includes(shift.name));
      const matchesDesignation = designationFilter.includes('All') || (emp?.designation && designationFilter.includes(emp.designation));
      const matchesContractor = contractorFilter.includes('All') || (emp?.contractorName && contractorFilter.includes(emp.contractorName));

      return matchesStatus && matchesDept && matchesShift && matchesDesignation && matchesContractor;
    }).sort((a, b) => a.date.localeCompare(b.date) || a.employeeId.localeCompare(b.employeeId));
  }, [processedData, empMap, shiftMap, assignmentMap, deferredSearchTerm, startDate, endDate, statusFilter, deptFilter, shiftFilter, designationFilter, contractorFilter]);

  const paginatedData = useMemo(() => {
    if (pageSize === 'All') return filteredData;
    const start = (currentPage - 1) * pageSize;
    return filteredData.slice(start, start + pageSize);
  }, [filteredData, currentPage, pageSize]);

  const totalPages = pageSize === 'All' ? 1 : Math.ceil(filteredData.length / pageSize);

  useEffect(() => {
    setCurrentPage(1);
  }, [deferredSearchTerm, startDate, endDate, statusFilter, deptFilter, shiftFilter, designationFilter, contractorFilter]);

  const calendarDays = useMemo(() => {
    const start = startOfWeek(startOfMonth(currentMonth));
    const end = endOfWeek(endOfMonth(currentMonth));
    return eachDayOfInterval({ start, end });
  }, [currentMonth]);

  const getAttendanceForDay = (day: Date, empId: string) => {
    const dStr = format(day, 'yyyy-MM-dd');
    return processedData.find(record => record.employeeId === empId && record.date === dStr);
  };

  const getShiftForDay = (day: Date, empId: string) => {
    const dStr = format(day, 'yyyy-MM-dd');
    const assignment = shiftAssignments.find(a => a.employeeId === empId && a.date === dStr);
    const emp = employees.find(e => e.id === empId);
    const shiftId = assignment?.shiftId || emp?.shiftId;
    return settings.shifts?.find(s => s.id === shiftId);
  };

  const summaryStats = useMemo(() => {
    const uniqueEmployees = new Set(filteredData.map(d => d.employeeId)).size;
    const totalPresent = filteredData.filter(d => ['Present', 'Late', 'SPF', 'On Time', 'Early', 'PWO'].includes(d.status)).length;
    const totalAbsent = filteredData.filter(d => d.status === 'Absent').length;
    const totalLate = filteredData.filter(d => d.lateMinutes > 0).length;
    const totalOT = filteredData.reduce((acc, d) => acc + (d.overtime || 0), 0);
    return { uniqueEmployees, totalPresent, totalAbsent, totalLate, totalOT };
  }, [filteredData]);

  const handleStatClick = (status: string) => {
    setStatusFilter([status]);
    setCurrentPage(1);
  };

  const uniqueEmployeesInFilter = useMemo(() => {
    return Array.from(new Set(filteredData.map(d => d.employeeId)));
  }, [filteredData]);

  if (isInitializing && processedData.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
        <div className="text-center">
          <h3 className="text-lg font-bold text-slate-700">Synchronizing Data</h3>
          <p className="text-sm text-slate-500">Loading attendance records and punches...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Attendance Tracking" 
        description="Monitor daily workforce presence, shift compliance, and biometric synchronization"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button 
              onClick={handleRefresh}
              disabled={isRefreshing}
            >
              <Calculator size={14} className={isRefreshing ? "animate-spin" : ""} />
              {isRefreshing ? 'Calculating...' : 'Recalculate'}
            </Button>
            
            <Button
              onClick={() => setIsManualImportOpen(true)}
              size="sm"
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1.5 shadow-xs"
              title="Import Excel attendance records to update Force Attendance and session punch logs, recalculating reconciliation, muster, and overtime"
            >
              <Upload size={14} /> Manual Attendance Import
            </Button>

            <Button 
              onClick={() => {
                if (quotaExceeded) return;
                if (selectedEmployees.length === 0) {
                  setSelectedEmployees(uniqueEmployeesInFilter);
                }
                setBulkModal({
                  isOpen: true,
                  step: 1,
                  shiftId: '',
                  startDate: startDate,
                  endDate: endDate
                });
              }}
              disabled={quotaExceeded}
              variant="outline"
              size="sm"
              className="bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 font-bold hover:bg-indigo-100"
            >
              <UserPlus size={14} className="mr-1" /> Bulk Shift Assign {selectedEmployees.length > 0 ? `(${selectedEmployees.length})` : `(${uniqueEmployeesInFilter.length})`}
            </Button>

            {selectedEmployees.length > 0 && (
              <Button 
                onClick={handleDeleteSelectedRecords}
                disabled={quotaExceeded}
                variant="danger"
                size="sm"
              >
                <Trash2 size={14} /> Delete Records ({selectedEmployees.length})
              </Button>
            )}
            
            <Button variant="outline" onClick={handlePrint} className="hidden sm:flex">
              <Printer size={14} /> Print
            </Button>
            
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
              <Button variant="ghost" size="sm" onClick={handleExportExcel} className="h-8 px-2 text-[11px] font-bold">EXCEL</Button>
              <Button variant="ghost" size="sm" onClick={handleExportPDF} className="h-8 px-2 text-[11px] font-bold">PDF</Button>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => {
                  const rows = generateZkBioDataRows(
                    punches,
                    employees,
                    filteredData,
                    startDate,
                    endDate,
                    deptFilter,
                    deferredSearchTerm
                  );
                  if (rows.length === 0) {
                    toast.error("No ZKT biometric punch records found.");
                    return;
                  }
                  exportZkBioDataExcel(rows, settings.companyName || 'ZKTeco');
                  toast.success(`Exported ${rows.length} ZKT Bio Data records to Excel!`);
                }} 
                className="h-8 px-2 text-[11px] font-bold text-blue-600 dark:text-blue-400"
              >
                ZKT BIO DATA
              </Button>
            </div>
          </div>
        }
      />

      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-4 space-y-1.5">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">Period Selection</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 relative z-30">
              <Input 
                type="date" 
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-9 text-[12px] pl-9 px-2"
              />
              <Input 
                type="date" 
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-9 text-[12px] pl-9 px-2"
              />
            </div>
          </div>

          <div className="lg:col-span-3 space-y-1.5">
            <label className="text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">Search Employee</label>
            <Input 
              placeholder="Name or ID..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              icon={<Search size={14} className="text-slate-400" />}
              className="h-9 text-[13px]"
            />
          </div>

          <div className="lg:col-span-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
            <MultiSelect 
              label="Department"
              options={departments}
              selected={deptFilter}
              onChange={setDeptFilter}
              placeholder="All Departments"
            />
            <MultiSelect 
              label="Shift"
              options={shiftOptions}
              selected={shiftFilter}
              onChange={setShiftFilter}
              placeholder="All Shifts"
            />
            <MultiSelect 
              label="Status"
              options={['All', 'Present', 'Absent', 'Late', 'PWO', 'Early', 'Weekly Off', 'SPF']}
              selected={statusFilter}
              onChange={setStatusFilter}
              placeholder="All Status"
            />
            <div className="flex flex-col justify-end">
              <Button variant="outline" className="h-9 w-full" onClick={() => {
                setSearchTerm('');
                setDeptFilter(['All']);
                setStatusFilter(['All']);
                setShiftFilter(['All']);
              }}>
                <RefreshCw size={14} className="mr-2" /> Reset
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <KPICard 
          label="Unique Staff" 
          value={summaryStats.uniqueEmployees} 
          icon={Users} 
          onClick={() => handleStatClick('All')}
        />
        <KPICard 
          label="Present Today" 
          value={summaryStats.totalPresent} 
          icon={UserCheck} 
          trend="up"
          trendValue="On Premises"
          onClick={() => handleStatClick('Present')}
        />
        <KPICard 
          label="Absent Staff" 
          value={summaryStats.totalAbsent} 
          icon={UserX} 
          trend="down"
          trendValue="Not Logged"
          onClick={() => handleStatClick('Absent')}
        />
        <KPICard 
          label="Late Arrivals" 
          value={summaryStats.totalLate} 
          icon={Clock} 
          trend="down"
          trendValue="Delayed Entry"
          onClick={() => handleStatClick('Late')}
        />
        <KPICard 
          label="Total Overtime" 
          value={formatDuration(summaryStats.totalOT)} 
          icon={TrendingUp} 
          trend="up" 
          trendValue="Accumulated"
        />
      </div>

      {/* Employee Pulse / Matrix Summary - Show when a specific user is selected via search or selected specifically */}
      {searchTerm && (employees.filter(e => 
        e.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
        e.name.toLowerCase().includes(searchTerm.toLowerCase())
      ).length === 1 || employees.find(e => e.id === searchTerm || e.name === searchTerm)) && (() => {
        const matchingEmps = employees.filter(e => 
          e.id.toLowerCase().includes(searchTerm.toLowerCase()) || 
          e.name.toLowerCase().includes(searchTerm.toLowerCase())
        );
        const emp = matchingEmps.length === 1 ? matchingEmps[0] : employees.find(e => e.id === searchTerm || e.name === searchTerm);
        if (!emp) return null;
        
        return (
          <div className="bg-white p-6 rounded-2xl border border-indigo-100 shadow-sm animate-in slide-in-from-bottom-2 duration-300 ring-4 ring-indigo-50/50">
             <div className="flex items-center justify-between mb-4 px-2">
                <div className="flex items-center gap-3">
                   <div className="w-12 h-12 bg-indigo-600 rounded-2xl flex items-center justify-center text-white text-lg font-black shadow-lg shadow-indigo-100 overflow-hidden">
                      {emp.name.charAt(0)}
                   </div>
                   <div>
                      <h3 className="text-lg font-black text-slate-900 leading-none">{emp.name}</h3>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">{emp.id} • {emp.department} • {emp.designation}</p>
                   </div>
                </div>
                <button 
                  onClick={() => setSearchTerm('')}
                  className="p-2 hover:bg-slate-100 rounded-full text-slate-400 transition-colors"
                  title="Close personal view"
                >
                  <X className="w-5 h-5" />
                </button>
             </div>
             <AttendanceHeatmap 
              employeeId={emp.id}
              month={currentMonth}
              data={processedData}
              onDayClick={(date) => setAssignmentModal({ isOpen: true, employeeId: emp.id, date })}
              onMonthChange={setCurrentMonth}
             />
          </div>
        );
      })()}

      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse min-w-[1100px]">
            <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
              <tr className="text-[12px] font-semibold text-slate-500 dark:text-slate-400">
                <th className="px-6 py-3 w-12 text-center">
                  <input 
                    type="checkbox" 
                    onChange={(e) => {
                      if (e.target.checked) setSelectedEmployees(uniqueEmployeesInFilter);
                      else setSelectedEmployees([]);
                    }}
                    checked={selectedEmployees.length > 0 && selectedEmployees.length >= uniqueEmployeesInFilter.length}
                    className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                  />
                </th>
                <th className="px-4 py-3 w-12 text-center">S.No</th>
                <th className="px-6 py-3 w-[120px]">Date (A.D.)</th>
                <th className="px-2 py-3 w-12 text-center">Day</th>
                <th className="px-6 py-3 w-[100px]">Emp ID</th>
                <th className="px-6 py-3 min-w-[180px]">Employee Name</th>
                <th className="px-4 py-3 w-[120px]">Dept</th>
                <th className="px-6 py-3 w-[140px]">Shift</th>
                <th className="px-6 py-3 w-[120px]">In Time</th>
                <th className="px-6 py-3 w-[120px]">Out Time</th>
                <th className="px-4 py-3 w-[80px] text-right">Late By</th>
                <th className="px-4 py-3 w-[80px] text-right">Early Out</th>
                <th className="px-6 py-3 w-[100px] text-right">Dur</th>
                <th className="px-4 py-3 w-[70px] text-right">OT</th>
                <th className="px-6 py-3 w-[120px]">Status</th>
                <th className="px-6 py-3 w-[80px] text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-transparent text-[13px]">
              {paginatedData.length > 0 ? paginatedData.map((d, index) => {
                const sNo = (currentPage - 1) * (pageSize === 'All' ? 0 : pageSize) + index + 1;
                const emp = employees.find(e => e.id === d.employeeId);
                const assignment = shiftAssignments.find(a => a.employeeId === d.employeeId && a.date === d.date);
                const shift = settings.shifts?.find(s => s.id === (assignment?.shiftId || emp?.shiftId));
                
                const isExpanded = expandedRows.includes(d.id);
                
                return (
                  <React.Fragment key={d.id}>
                  <tr className={cn(
                    "hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors group",
                    selectedEmployees.includes(d.employeeId) && "bg-primary/[0.03] dark:bg-primary/[0.05]",
                    isExpanded && "bg-slate-50 dark:bg-slate-800 border-l-4 border-l-primary"
                  )}>
                    <td className="px-6 py-2.5 text-center">
                      <div className="flex items-center gap-2 justify-center">
                        <input 
                          type="checkbox" 
                          checked={selectedEmployees.includes(d.employeeId)}
                          onChange={() => toggleEmployeeSelection(d.employeeId)}
                          className="w-4 h-4 rounded border-slate-300 text-primary focus:ring-primary cursor-pointer"
                        />
                        <button 
                          onClick={() => toggleRowExpansion(d.id)}
                          className={cn("text-slate-400 transition-transform", isExpanded && "rotate-180")}
                        >
                          <ChevronDown size={14} />
                        </button>
                      </div>
                    </td>
                    <td className="px-4 py-2.5 text-center text-slate-400 font-mono text-[11px]">{sNo}</td>
                    <td className="px-6 py-2.5 font-medium text-slate-900 dark:text-white">
                      <div>{format(parseISO(d.date), 'dd MMM yyyy')}</div>
                      <div className="text-[10px] text-slate-400 font-mono font-normal">BS: {getNepaliDate(d.date)}</div>
                    </td>
                    <td className="px-2 py-2.5 text-center text-[10px] font-bold text-slate-400 uppercase tracking-tighter">
                      {format(parseISO(d.date), 'EEE')}
                    </td>
                    <td className="px-6 py-2.5 font-mono text-slate-500 group-hover:text-primary transition-colors">{d.employeeId}</td>
                    <td className="px-6 py-2.5">
                      <span className="font-medium text-slate-900 dark:text-white cursor-pointer hover:text-primary transition-colors" onClick={() => openEmployeeProfile(d.employeeId)}>
                        {emp?.name || '-'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-slate-500 truncate max-w-[120px]">{emp?.department || '-'}</td>
                    <td className="px-6 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <select
                          value={assignment?.shiftId || ''}
                          onChange={(e) => handleDirectShiftChange(d.employeeId, d.date, e.target.value)}
                          className={cn(
                            "text-[11px] font-bold py-1 px-2.5 rounded-lg border transition-all cursor-pointer shadow-2xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden",
                            assignment?.shiftId 
                              ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-300 dark:border-indigo-700 font-extrabold" 
                              : "bg-slate-100/80 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-400"
                          )}
                          title={`Current Shift: ${shift?.name || 'Default'}. Click to change shift for this date.`}
                        >
                          <option value="" className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">
                            {shift?.name ? `${shift.name} (Default)` : 'Default Shift'}
                          </option>
                          {settings.shifts?.map(s => (
                            <option key={s.id} value={s.id} className="bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-200">
                              {s.name} ({s.startTime}-{s.endTime})
                            </option>
                          ))}
                        </select>
                        {assignment?.shiftId && (
                          <span className="w-2 h-2 rounded-full bg-indigo-600 dark:bg-indigo-400 animate-pulse shrink-0" title="Custom shift override assigned for this date" />
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-2.5 font-mono text-[12px]">
                      {d.firstPunch ? (
                        <span className={cn(
                          d.lateMinutes > 0 ? "text-danger font-bold" : "text-success font-medium"
                        )}>
                          {formatAMPM(d.firstPunch)}
                        </span>
                      ) : '--:--'}
                    </td>
                    <td className="px-6 py-2.5 font-mono text-[12px]">
                      {d.lastPunch && d.lastPunch !== d.firstPunch ? formatAMPM(d.lastPunch) : '--:--'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold">
                      {d.lateMinutes > 0 ? (
                        <span className="text-danger">{formatMinutes(d.lateMinutes)}</span>
                      ) : '-'}
                    </td>
                    <td className="px-4 py-2.5 text-right font-semibold">
                      {d.earlyMinutes > 0 ? (
                        <span className="text-amber-500">{formatMinutes(d.earlyMinutes)}</span>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-2.5 text-right font-mono text-slate-600 dark:text-slate-400">
                      {formatDuration(d.workingHours)}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      {d.overtime > 0 ? (
                        <span className="text-primary font-bold text-[12px]">{formatDuration(d.overtime)}</span>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-2.5">
                      <StatusBadge 
                        status={d.status} 
                        type={
                          ['Present', 'On Time', 'Early', 'PWO'].includes(d.status) ? 'success' :
                          ['Late'].includes(d.status) ? 'warning' :
                          ['Absent', 'SPF'].includes(d.status) ? 'danger' : 'muted'
                        } 
                      />
                    </td>
                    <td className="px-6 py-2.5 text-center">
                      <Button variant="ghost" size="sm" onClick={() => setAssignmentModal({ isOpen: true, employeeId: d.employeeId, date: d.date })} className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        <MoreVertical size={14} />
                      </Button>
                    </td>
                  </tr>
                  {isExpanded && (
                    <tr className="bg-slate-50 dark:bg-slate-900/50">
                      <td colSpan={15} className="p-0 border-b border-slate-100 dark:border-slate-800">
                         <PunchTimeline record={d} />
                      </td>
                    </tr>
                  )}
                  </React.Fragment>
                );
              }) : (
                <tr>
                  <td colSpan={15} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <Archive size={40} className="text-slate-200" />
                      <p className="text-slate-400 font-medium italic">No attendance records match your current filters.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {pageSize !== 'All' && totalPages > 1 && (
          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Showing {(currentPage - 1) * (pageSize as number) + 1} to {Math.min(currentPage * (pageSize as number), filteredData.length)} of {filteredData.length}
            </span>
            <div className="flex items-center gap-2">
              <Button 
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft size={16} />
              </Button>
              <Button 
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                disabled={currentPage === totalPages}
              >
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>
        )}
      </Card>
      
      {/* Bulk Assignment Modal */}
      {bulkModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in fade-in zoom-in duration-200 font-sans">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-bold text-slate-700 text-lg">Bulk Shift Assignment</h3>
              <button 
                onClick={() => setBulkModal({ ...bulkModal, isOpen: false })}
                className="text-slate-400 hover:text-slate-600"
              >
                 <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6 space-y-4">
              {bulkModal.step === 1 ? (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase mb-1">Start Date</label>
                      <input 
                        type="date"
                        value={bulkModal.startDate}
                        onChange={e => setBulkModal({ ...bulkModal, startDate: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-400 uppercase mb-1">End Date</label>
                      <input 
                        type="date"
                        value={bulkModal.endDate}
                        onChange={e => setBulkModal({ ...bulkModal, endDate: e.target.value })}
                        className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                      />
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Select Shift</p>
                    <div className="grid grid-cols-1 gap-2">
                       <button 
                        onClick={() => setBulkModal({ ...bulkModal, shiftId: '' })}
                        className={`p-3 text-left border rounded-xl transition-colors ${bulkModal.shiftId === '' ? 'border-indigo-600 bg-indigo-50/50' : 'border-slate-200 hover:bg-slate-50'}`}
                      >
                        <p className="font-bold text-slate-700 text-sm">Default / Reset</p>
                      </button>
                      {settings.shifts?.map(shift => (
                        <button 
                          key={shift.id}
                          onClick={() => setBulkModal({ ...bulkModal, shiftId: shift.id })}
                          className={`p-3 text-left border rounded-xl transition-colors ${bulkModal.shiftId === shift.id ? 'border-indigo-600 bg-indigo-50/50' : 'border-slate-200 hover:bg-slate-50'}`}
                        >
                          <div className="flex items-center justify-between">
                            <p className="font-bold text-slate-900 text-sm">{shift.name}</p>
                            <span className="text-[10px] font-bold text-indigo-500">{shift.startTime}-{shift.endTime}</span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-4">
                   <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                      <div className="space-y-1">
                        <p className="text-sm font-bold text-amber-900 leading-none">Confirm Bulk Assignment</p>
                        <p className="text-[11px] text-amber-700 font-medium">Assigning "{bulkModal.shiftId ? settings.shifts?.find(s => s.id === bulkModal.shiftId)?.name : 'Default'}" to {selectedEmployees.length} staff from {bulkModal.startDate} to {bulkModal.endDate}.</p>
                      </div>
                   </div>
                   <div className="border border-slate-200 rounded-xl overflow-hidden max-h-[220px] overflow-y-auto divide-y divide-slate-100">
                      {selectedEmployees.map(id => {
                        const emp = employees.find(e => e.id === id);
                        return (
                          <div key={id} className="px-4 py-2.5 flex items-center justify-between bg-white text-xs">
                             <span className="font-bold text-slate-700">{emp?.name || id}</span>
                             <span className="font-mono text-slate-400 uppercase">{id}</span>
                          </div>
                        );
                      })}
                   </div>
                </div>
              )}
            </div>
            
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end gap-3">
               <button 
                onClick={() => {
                  if (bulkModal.step === 2) setBulkModal({ ...bulkModal, step: 1 });
                  else setBulkModal({ ...bulkModal, isOpen: false });
                }}
                className="px-4 py-2 text-sm font-bold text-slate-500 hover:text-slate-700"
               >
                 {bulkModal.step === 2 ? 'Back' : 'Cancel'}
               </button>
               <button 
                onClick={() => {
                  if (bulkModal.step === 1) setBulkModal({ ...bulkModal, step: 2 });
                  else handleBulkAssign();
                }}
                className="px-6 py-2 bg-indigo-600 text-white rounded-lg text-sm font-bold hover:bg-indigo-700 transition"
               >
                 {bulkModal.step === 1 ? 'Preview Changes' : 'Confirm & Apply'}
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Assignment Modal */}
      {assignmentModal.isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between shrink-0">
              <h3 className="font-bold text-slate-700 text-lg">Assign Shift</h3>
              <div className="flex items-center gap-2">
                <button 
                  onClick={() => {
                    const suggested = smartDetectShift(assignmentModal.employeeId);
                    if (suggested) handleAssignShift(suggested);
                    else alert('Not enough historical data to suggest a shift.');
                  }}
                  className="flex items-center gap-1 px-3 py-1.5 bg-indigo-100 text-indigo-700 rounded-lg text-[10px] font-bold uppercase hover:bg-indigo-200 transition"
                  title="Smart Detect shift based on historical attendance patterns"
                >
                  <Wand2 className="w-3.5 h-3.5" /> Smart Detect
                </button>
                <button 
                  onClick={() => setAssignmentModal({ ...assignmentModal, isOpen: false })}
                  className="text-slate-400 hover:text-slate-600 p-2"
                >
                   <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            
            <div className="p-6 space-y-4 overflow-y-auto">
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Target Date</p>
                <div className="p-2 bg-indigo-50 text-indigo-700 rounded-lg font-bold text-sm">
                  {assignmentModal.date}
                </div>
              </div>

              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Choose Shift</p>
                <div className="grid grid-cols-1 gap-2">
                  <button 
                    onClick={() => handleAssignShift('')}
                    className="p-3 text-left border border-slate-200 rounded-xl hover:border-indigo-300 hover:bg-slate-50 transition-colors"
                  >
                    <p className="font-bold text-slate-700 text-sm">Default / Unset</p>
                    <p className="text-xs text-slate-500">Reset to employee default shift</p>
                  </button>
                  {settings.shifts?.map(shift => (
                    <button 
                      key={shift.id}
                      onClick={() => handleAssignShift(shift.id)}
                      className="p-3 text-left border border-slate-200 rounded-xl hover:border-indigo-300 hover:bg-indigo-50 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <p className="font-bold text-slate-900 text-sm">{shift.name}</p>
                        <span className="text-[10px] font-bold text-indigo-500 uppercase">{shift.startTime} - {shift.endTime}</span>
                      </div>
                      <p className="text-xs text-slate-500">{shift.isNightShift ? 'Night Shift (Cross-day enabled)' : 'Day Shift'}</p>
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <History className="w-3.5 h-3.5" /> Recent Changes Log
                </p>
                <div className="space-y-2">
                  {assignmentLogs
                    .filter(log => log.employeeId === assignmentModal.employeeId)
                    .slice(0, 5)
                    .map((log, i) => {
                      const shift = settings.shifts?.find(s => s.id === log.shiftId);
                      return (
                        <div key={i} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-100 text-[10px]">
                          <div className="flex items-center gap-2">
                            <span className={`px-1.5 py-0.5 rounded font-black uppercase ${log.action === 'Assigned' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                              {log.action}
                            </span>
                            <span className="font-bold text-slate-600 truncate max-w-[120px]">
                               {log.date}: {shift?.name || 'Default'}
                            </span>
                          </div>
                          <span className="text-slate-400 font-mono">
                            {format(parseISO(log.timestamp), 'MMM dd, HH:mm')}
                          </span>
                        </div>
                      );
                    })}
                  {assignmentLogs.filter(log => log.employeeId === assignmentModal.employeeId).length === 0 && (
                    <p className="text-[10px] text-slate-400 italic text-center py-2">No recent changes found</p>
                  )}
                </div>
              </div>
            </div>
            
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end shrink-0">
               <button 
                onClick={() => setAssignmentModal({ ...assignmentModal, isOpen: false })}
                className="px-6 py-2 bg-white border border-slate-200 text-slate-700 rounded-lg text-sm font-bold hover:bg-slate-50 transition shadow-sm"
               >
                 Close
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Detailed Logs Modal */}
      {logModal.isOpen && logModal.record && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in duration-200">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-700 text-lg">Punch Logs</h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{logModal.employeeName} • {logModal.record.date}</p>
              </div>
              <button 
                onClick={() => setLogModal({ ...logModal, isOpen: false })}
                className="text-slate-400 hover:text-slate-600"
              >
                 <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6">
              <div className="space-y-6">
                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Actual Bio Logs (Raw)</p>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                    {(logModal.record.rawLogs || logModal.record.logs).length > 0 ? (
                      (logModal.record.rawLogs || logModal.record.logs).map((log: string, idx: number) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg border border-slate-100">
                          <span className="text-xs font-bold text-slate-700">{formatAMPM(log)}</span>
                          <span className="text-[10px] font-mono text-slate-400">{format(parseISO(log.replace(/(\.\d+)?Z$/i, '')), 'MMM dd')}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-400 italic">No raw logs</p>
                    )}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Processed Logs (After Rules)</p>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                    {logModal.record.logs.length > 0 ? (
                      logModal.record.logs.map((log: string, idx: number) => (
                        <div key={idx} className="flex items-center justify-between p-2 bg-indigo-50/50 rounded-lg border border-indigo-100">
                          <span className="text-xs font-bold text-indigo-700">{formatAMPM(log)}</span>
                          <span className="text-[10px] font-mono text-indigo-400">{format(parseISO(log.replace(/(\.\d+)?Z$/i, '')), 'MMM dd')}</span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-400 italic">No processed logs</p>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-8 grid grid-cols-2 gap-4">
                <div className="p-3 bg-green-50 rounded-xl border border-green-100">
                  <p className="text-[10px] font-bold text-green-600 uppercase tracking-widest mb-1">In Time</p>
                  <p className="text-sm font-bold text-slate-700">{logModal.record.firstPunch ? formatAMPM(logModal.record.firstPunch) : '--'}</p>
                </div>
                <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-100">
                  <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-widest mb-1">Out Time</p>
                  <p className="text-sm font-bold text-slate-700">{logModal.record.lastPunch && logModal.record.lastPunch !== logModal.record.firstPunch ? formatAMPM(logModal.record.lastPunch) : '--'}</p>
                </div>
              </div>
            </div>
            
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex justify-end">
               <button 
                onClick={() => setLogModal({ ...logModal, isOpen: false })}
                className="px-6 py-2 bg-slate-900 text-white rounded-lg text-sm font-bold hover:bg-slate-800 transition shadow-lg"
               >
                 Close
               </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual Attendance Import Modal */}
      <ManualAttendanceImportModal 
        isOpen={isManualImportOpen} 
        onClose={() => setIsManualImportOpen(false)} 
      />
    </div>
  );
}

export function Attendance() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'reconciliation';

  const handleTabChange = (tab: string) => {
    setSearchParams({ tab });
  };

  return (
    <div className="space-y-6">
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-900 dark:text-slate-100 flex items-center gap-2">
            Attendance Management & Muster System
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            System-generated attendance reconciliation, Nepali monthly muster, visual calendar & audit verification
          </p>
        </div>

        {/* Sub-navigation tabs */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl flex-wrap">
          <button
            onClick={() => handleTabChange('reconciliation')}
            className={cn(
              "px-3.5 py-2 text-xs font-bold rounded-lg transition-all",
              currentTab === 'reconciliation'
                ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            )}
          >
            Attendance Reconciliation
          </button>
          <button
            onClick={() => handleTabChange('muster')}
            className={cn(
              "px-3.5 py-2 text-xs font-bold rounded-lg transition-all",
              currentTab === 'muster'
                ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            )}
          >
            Monthly Muster
          </button>
          <button
            onClick={() => handleTabChange('calendar')}
            className={cn(
              "px-3.5 py-2 text-xs font-bold rounded-lg transition-all",
              currentTab === 'calendar'
                ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            )}
          >
            Attendance Calendar
          </button>
          <button
            onClick={() => handleTabChange('audit')}
            className={cn(
              "px-3.5 py-2 text-xs font-bold rounded-lg transition-all",
              currentTab === 'audit'
                ? "bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm"
                : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
            )}
          >
            Fresh Attendance Audit
          </button>
        </div>
      </div>

      {currentTab === 'reconciliation' && <AttendanceReconciliation />}
      {currentTab === 'muster' && <MonthlyMuster />}
      {currentTab === 'calendar' && <AttendanceCalendar />}
      {currentTab === 'audit' && <FreshAttendanceAudit />}
    </div>
  );
}
