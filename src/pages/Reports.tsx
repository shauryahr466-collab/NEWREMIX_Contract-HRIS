import { useState, useMemo } from 'react';
import { useAppStore } from '../store';
import { format, parseISO, startOfMonth, subDays } from 'date-fns';
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Download, FileText, Calendar, Filter, Archive, FileSpreadsheet, Loader2, Info, LayoutDashboard, BarChart3, TrendingUp, Cpu, Sparkles } from 'lucide-react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar } from 'recharts';
import { googleSignIn, getAccessToken } from '../lib/firebase';
import { createSpreadsheet, appendDataToSheet, formatSpreadsheet } from '../lib/sheets';
import { MultiSelect } from '../components/MultiSelect';
import { PageHeader, Card, Button, Input, Badge } from '../components/ui';
import { cn } from '../lib/utils';
import { toast } from 'sonner';

import { formatAMPM, formatDuration, formatMinutes } from '../lib/utils';
import { processPunches } from '../lib/engine';
import { getNepaliDate } from '../utils/dateHelper';
import { 
  generateZkBioDataRows, 
  exportZkBioDataExcel, 
  exportZkBioDataCSV, 
  exportZkBioDataPDF 
} from '../lib/zktReportHelper';


function formatTimeFromHHMM(timeStr: string | undefined | null) {
  if (!timeStr) return '-';
  const parts = timeStr.split(':').map(Number);
  if (parts.length < 2 || isNaN(parts[0]) || isNaN(parts[1])) return timeStr;
  const h = parts[0];
  const m = parts[1];
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${m.toString().padStart(2, '0')} ${ampm}`;
}

export function Reports() {
  const { processedData, employees, settings, calculationSource, setCalculationSource, punches, shiftAssignments, setProcessedData, overtimeRecords, globalSearchTerm } = useAppStore();
  const [reportType, setReportType] = useState('daily');
  const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [deptFilter, setDeptFilter] = useState<string[]>(['All']);
  const [designationFilter, setDesignationFilter] = useState<string[]>(['All']);
  const [contractorFilter, setContractorFilter] = useState<string[]>(['All']);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<'id' | 'name'>('name');

  const activeSearch = searchTerm || globalSearchTerm;

  const reprocess = (source: 'all' | 'standard' | 'multi-time') => {
    setCalculationSource(source);
  };

  const departments = useMemo(() => {
    const depts = employees.map(e => e.department).filter(Boolean) as string[];
    return ['All', ...new Set(depts)];
  }, [employees]);

  const designations = useMemo(() => {
    const des = employees.map(e => e.designation).filter(Boolean) as string[];
    return ['All', ...new Set(des)];
  }, [employees]);

  const contractors = useMemo(() => {
    const cons = employees.map(e => e.contractorName).filter(Boolean) as string[];
    return ['All', ...new Set(cons)];
  }, [employees]);

  const zkBioRows = useMemo(() => {
    return generateZkBioDataRows(
      punches,
      employees,
      processedData,
      startDate,
      endDate,
      deptFilter,
      activeSearch
    );
  }, [punches, employees, processedData, startDate, endDate, deptFilter, activeSearch]);

  const [isSyncing, setIsSyncing] = useState(false);

  const handleSyncToSheets = async () => {
    if (reportType === 'zk_biodata') {
      if (zkBioRows.length === 0) {
        toast.error("No ZKT Bio Data available for the selected filters.");
        return;
      }
      setIsSyncing(true);
      try {
        let token = await getAccessToken();
        if (!token) {
          const result = await googleSignIn();
          if (!result) return;
          token = result.accessToken;
        }

        const title = `${settings.companyName} - ZKT Bio Data Punch Format (${startDate} to ${endDate})`;
        const ss = await createSpreadsheet(token, title);
        const spreadsheetId = ss.spreadsheetId;

        const headers = ['Employee No.', 'Name', 'Department', 'Date', 'Time'];
        const rows = zkBioRows.map(r => [
          r.employeeNo,
          r.name,
          r.department,
          r.formattedDate,
          r.timeString
        ]);

        await appendDataToSheet(token, spreadsheetId, 'Sheet1!A1', [headers, ...rows]);
        const sheetId = ss.sheets[0].properties.sheetId;
        await formatSpreadsheet(token, spreadsheetId, sheetId, rows.length + 1, headers.length);
        
        toast.success("ZKT Bio Data synced to Google Sheets successfully!", {
          action: {
            label: 'Open',
            onClick: () => window.open(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`, '_blank')
          }
        });
      } catch (error: any) {
        toast.error(`Sync failed: ${error.message}`);
      } finally {
        setIsSyncing(false);
      }
      return;
    }

    const filtered = getFilteredData();
    if (filtered.length === 0) {
      toast.error("No data available for the selected filters.");
      return;
    }

    setIsSyncing(true);
    try {
      let token = await getAccessToken();
      if (!token) {
        const result = await googleSignIn();
        if (!result) return;
        token = result.accessToken;
      }

      const title = `${settings.companyName} - ${reportType.charAt(0).toUpperCase() + reportType.slice(1)} Report (${startDate} to ${endDate})`;
      const ss = await createSpreadsheet(token, title);
      const spreadsheetId = ss.spreadsheetId;

      let headers: string[] = [];
      let rows: any[][] = [];

      if (reportType === 'daily') {
        headers = ['Date (A.D.)', 'Date (B.S.)', 'Day', 'Employee ID', 'Name', 'Department', 'Designation', 'Contractor', 'Weekly Off', 'Shift', 'Shift In Time', 'Shift Out Time', 'TWH', 'OT Eligible', 'In Time', 'Out Time', 'Punch Count', 'Late By', 'Early Out', 'Work Hours', 'Overtime', 'Status'];
        rows = filtered.map(d => {
          const emp = employees.find(e => e.id === d.employeeId);
          const assignment = shiftAssignments.find(a => a.employeeId === d.employeeId && a.date === d.date);
          const shift = settings.shifts?.find(s => s.id === (assignment?.shiftId || emp?.shiftId));
          return [
            d.date,
            getNepaliDate(d.date),
            format(parseISO(d.date), 'EEEE'),
            d.employeeId,
            emp?.name || '',
            emp?.department || '',
            emp?.designation || '',
            emp?.contractorName || '',
            emp?.weeklyOff || '',
            shift?.name || 'Default',
            formatTimeFromHHMM(shift?.startTime),
            formatTimeFromHHMM(shift?.endTime),
            emp?.targetWorkingHours ?? d.expectedHours ?? '-',
            emp?.otEligible !== false ? 'Yes' : 'No',
            formatAMPM(d.firstPunch),
            (d.lastPunch && d.lastPunch !== d.firstPunch) ? formatAMPM(d.lastPunch) : '',
            (d.rawLogs || d.logs).length,
            formatMinutes(d.lateMinutes),
            formatMinutes(d.earlyMinutes),
            formatDuration(d.workingHours),
            formatDuration(d.overtime),
            d.status
          ];
        });
      } else if (reportType === 'missing') {
        headers = ['Date (A.D.)', 'Date (B.S.)', 'Employee ID', 'Name', 'Department', 'Designation', 'Contractor', 'Punch Time', 'All Logs', 'Status'];
        rows = filtered.map(d => {
          const emp = employees.find(e => e.id === d.employeeId);
          return [
            d.date,
            getNepaliDate(d.date),
            d.employeeId,
            emp?.name || '',
            emp?.department || '',
            emp?.designation || '',
            emp?.contractorName || '',
            formatAMPM(d.firstPunch),
            (d.rawLogs || d.logs).map(l => formatAMPM(l)).join(', '),
            'Missing Out Punch'
          ];
        });
      } else if (reportType === 'overtime') {
        headers = ['Date (A.D.)', 'Date (B.S.)', 'Employee ID', 'Name', 'Department', 'Designation', 'Work Hours', 'Overtime (Hrs)', 'Logs'];
        rows = filtered.map(d => {
          const emp = employees.find(e => e.id === d.employeeId);
          return [
            d.date,
            getNepaliDate(d.date),
            d.employeeId,
            emp?.name || '',
            emp?.department || '',
            emp?.designation || '',
            formatDuration(d.workingHours),
            formatDuration(d.overtime),
            (d.rawLogs || d.logs).map(l => formatAMPM(l)).join(', ')
          ];
        });
      }

      await appendDataToSheet(token, spreadsheetId, 'Sheet1!A1', [headers, ...rows]);
      const sheetId = ss.sheets[0].properties.sheetId;
      await formatSpreadsheet(token, spreadsheetId, sheetId, rows.length + 1, headers.length);
      
      toast.success("Report synced to Google Sheets successfully!", {
        action: {
          label: 'Open',
          onClick: () => window.open(`https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`, '_blank')
        }
      });
    } catch (error: any) {
      toast.error(`Sync failed: ${error.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  const getFilteredData = () => {
    let filtered = processedData.filter(d => {
      const emp = employees.find(e => e.id === d.employeeId);
      
      const recordDate = d.date;
      const matchesDate = (!startDate || recordDate >= startDate) && (!endDate || recordDate <= endDate);
      const matchesDept = deptFilter.includes('All') || (emp?.department && deptFilter.includes(emp.department));
      const matchesDesignation = designationFilter.includes('All') || (emp?.designation && designationFilter.includes(emp.designation));
      const matchesContractor = contractorFilter.includes('All') || (emp?.contractorName && contractorFilter.includes(emp.contractorName));
      const matchesSearch = !activeSearch || 
        emp?.name.toLowerCase().includes(activeSearch.toLowerCase()) || 
        d.employeeId.toLowerCase().includes(activeSearch.toLowerCase()) ||
        emp?.designation?.toLowerCase().includes(activeSearch.toLowerCase());
      
      let matchesType = true;
      if (reportType === 'missing') matchesType = d.status === 'SPF';
      else if (reportType === 'overtime') matchesType = d.overtime > 0;
      
      return matchesDate && matchesDept && matchesType && matchesSearch && matchesDesignation && matchesContractor;
    });

    return filtered.sort((a, b) => {
      if (sortBy === 'name') {
        const empA = employees.find(e => e.id === a.employeeId)?.name || '';
        const empB = employees.find(e => e.id === b.employeeId)?.name || '';
        return empA.localeCompare(empB);
      }
      return a.employeeId.localeCompare(b.employeeId);
    });
  };

  const attendanceTrends = useMemo(() => {
    const last7Days = Array.from({ length: 7 }).map((_, i) => {
      const d = format(subDays(new Date(), i), 'yyyy-MM-dd');
      return d;
    }).reverse();

    return last7Days.map(date => ({
      date: format(parseISO(date), 'MMM dd'),
      present: processedData.filter(d => d.date === date && d.status === 'Present').length,
    }));
  }, [processedData]);

  const deptOTData = useMemo(() => {
    const depts = Array.from(new Set(employees.map(e => e.department)));
    return depts.map(dept => {
      const deptEmps = employees.filter(e => e.department === dept).map(e => e.id);
      const otHours = overtimeRecords
        ? overtimeRecords
            .filter(r => deptEmps.includes(r.employeeId) && r.status === 'Approved')
            .reduce((sum, r) => sum + r.hours, 0)
        : 0;
      
      return { name: dept, hours: Math.round((otHours as number) * 10) / 10 };
    }).sort((a, b) => (b.hours || 0) - (a.hours || 0));
  }, [employees, overtimeRecords]);

  const handleExport = () => {
    if (reportType === 'zk_biodata') {
      if (zkBioRows.length === 0) {
        toast.error("No ZKT Bio Data found for selected filters.");
        return;
      }
      exportZkBioDataExcel(zkBioRows, settings.companyName);
      toast.success(`Exported ${zkBioRows.length} ZKT Bio Data records to Excel!`);
      return;
    }

    const filtered = getFilteredData();
    let dataToExport: any[] = [];

    if (reportType === 'daily') {
      dataToExport = filtered.map(d => {
        const emp = employees.find(e => e.id === d.employeeId);
        const assignment = shiftAssignments.find(a => a.employeeId === d.employeeId && a.date === d.date);
        const shift = settings.shifts?.find(s => s.id === (assignment?.shiftId || emp?.shiftId));
        return {
          'Date (A.D.)': d.date,
          'Date (B.S.)': getNepaliDate(d.date),
          'Day': format(parseISO(d.date), 'EEEE'),
          'Employee ID': d.employeeId,
          'Name': emp?.name || '',
          'Department': emp?.department || '',
          'Designation': emp?.designation || '',
          'Contractor': emp?.contractorName || '',
          'Weekly Off': emp?.weeklyOff || '',
          'Shift': shift?.name || 'Default',
          'Shift In Time': formatTimeFromHHMM(shift?.startTime),
          'Shift Out Time': formatTimeFromHHMM(shift?.endTime),
          'TWH': emp?.targetWorkingHours ?? d.expectedHours ?? '-',
          'OT Eligible': emp?.otEligible !== false ? 'Yes' : 'No',
          'In Time': formatAMPM(d.firstPunch),
          'Out Time': (d.lastPunch && d.lastPunch !== d.firstPunch) ? formatAMPM(d.lastPunch) : '',
          'Punch Count': (d.rawLogs || d.logs).length,
          'Late By': formatMinutes(d.lateMinutes),
          'Early Out': formatMinutes(d.earlyMinutes),
          'Work Hours': formatDuration(d.workingHours),
          'Overtime': formatDuration(d.overtime),
          'Actual Logs': (d.rawLogs || d.logs).map(l => formatAMPM(l)).join(', '),
          'Status': d.status
        };
      });
    } else if (reportType === 'missing') {
      dataToExport = filtered.map(d => {
        const emp = employees.find(e => e.id === d.employeeId);
        return {
          'Date (A.D.)': d.date,
          'Date (B.S.)': getNepaliDate(d.date),
          'Employee ID': d.employeeId,
          'Name': emp?.name || '',
          'Department': emp?.department || '',
          'Designation': emp?.designation || '',
          'Punch Time': formatAMPM(d.firstPunch),
          'All Logs': d.logs.map(l => formatAMPM(l)).join(', '),
          'Status': 'Missing Out Punch'
        };
      });
    } else if (reportType === 'overtime') {
      dataToExport = filtered.map(d => {
        const emp = employees.find(e => e.id === d.employeeId);
        return {
          'Date (A.D.)': d.date,
          'Date (B.S.)': getNepaliDate(d.date),
          'Employee ID': d.employeeId,
          'Name': emp?.name || '',
          'Department': emp?.department || '',
          'Designation': emp?.designation || '',
          'Work Hours': formatDuration(d.workingHours),
          'Overtime (Hrs)': formatDuration(d.overtime),
          'Logs': d.logs.map(l => formatAMPM(l)).join(', ')
        };
      });
    }

    if (dataToExport.length === 0) {
      toast.error("No data available for the selected filters.");
      return;
    }

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Report");
    XLSX.writeFile(wb, `${settings.companyName}_${reportType}_report.xlsx`);
  };

  const handleExportCSV = () => {
    if (reportType === 'zk_biodata') {
      if (zkBioRows.length === 0) {
        toast.error("No ZKT Bio Data found for selected filters.");
        return;
      }
      exportZkBioDataCSV(zkBioRows, settings.companyName);
      toast.success(`Exported ${zkBioRows.length} ZKT Bio Data records to CSV!`);
      return;
    }

    const filtered = getFilteredData();
    let dataToExport: any[] = [];

    if (reportType === 'daily' || reportType === 'missing' || reportType === 'overtime') {
      dataToExport = filtered.map(d => {
        const emp = employees.find(e => e.id === d.employeeId);
        const assignment = shiftAssignments.find(a => a.employeeId === d.employeeId && a.date === d.date);
        const shift = settings.shifts?.find(s => s.id === (assignment?.shiftId || emp?.shiftId));
        
        return {
          'Date (A.D.)': d.date,
          'Date (B.S.)': getNepaliDate(d.date),
          'Employee ID': d.employeeId,
          'Legal Name': emp?.name || '',
          'Department ID': emp?.department || '',
          'Contractor Name': emp?.contractorName || '',
          'Designation': emp?.designation || '',
          'Shift Type': shift?.name || 'Day Shift',
          'Clock In': formatAMPM(d.firstPunch),
          'Clock Out': (d.lastPunch && d.lastPunch !== d.firstPunch) ? formatAMPM(d.lastPunch) : '',
          'Total Hours': d.workingHours.toFixed(2),
          'OT Hours': d.overtime.toFixed(2),
          'Late By': formatMinutes(d.lateMinutes),
          'Early Out': formatMinutes(d.earlyMinutes),
          'Punch Count': (d.rawLogs || d.logs).length,
          'Attendance Status': d.status
        };
      });
    }

    if (dataToExport.length === 0) {
      toast.error("No data found for the selected filters.");
      return;
    }

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const csvContent = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${settings.companyName}_${reportType}_Payroll_Report.csv`);
    link.click();
  };

  const handlePrintPDF = () => {
    if (reportType === 'zk_biodata') {
      if (zkBioRows.length === 0) {
        toast.error("No ZKT Bio Data found for selected filters.");
        return;
      }
      exportZkBioDataPDF(zkBioRows, settings.companyName);
      toast.success(`Exported ZKT Bio Data PDF!`);
      return;
    }
    const unfiltered = getFilteredData();
    if (unfiltered.length === 0) {
      toast.error("No data available for the selected filters.");
      return;
    }

    // Date Order: Ascending (Earliest Date First)
    const filtered = [...unfiltered].sort((a, b) => a.date.localeCompare(b.date));

    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4'
    });
    
    const pageWidth = doc.internal.pageSize.getWidth();
    
    // Requirement 4: Compact Header Design
    // Company Name: 14px Bold
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 41, 59); 
    doc.text(settings.companyName.toUpperCase(), pageWidth / 2, 10, { align: 'center' });
    
    // Report Title: 11px Bold
    doc.setFontSize(11);
    doc.text('Attendance Audit Report', pageWidth / 2, 16, { align: 'center' });
    doc.text('Employee Attendance Summary', pageWidth / 2, 21, { align: 'center' });

    // Date Range: 9px Regular
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text(`Period: ${startDate} to ${endDate}`, pageWidth / 2, 26, { align: 'center' });
    
    // Generation Date: 8px Gray
    doc.setFontSize(8);
    doc.setTextColor(120, 120, 120);
    doc.text(`Generated On: ${format(new Date(), 'dd/MM/yyyy HH:mm')}`, 8, 32);
    
    doc.setDrawColor(200, 200, 200);
    doc.line(8, 34, pageWidth - 8, 34);

    let head: string[][] = [];
    let body: string[][] = [];

    if (reportType === 'daily') {
      head = [['Day', 'Date (A.D.)', 'Date (B.S.)', 'Emp ID', 'Employee Name', 'WO', 'Shift', 'Shift In', 'Shift Out', 'TWH', 'OT Elig', 'Clock In', 'Clock Out', 'Late', 'Early', 'Work', 'OT', 'Status']];
      body = filtered.map(d => {
        const emp = employees.find(e => e.id === d.employeeId);
        const shiftAssigned = shiftAssignments.find(a => a.employeeId === d.employeeId && a.date === d.date);
        const shiftDetails = settings.shifts?.find(s => s.id === (shiftAssigned?.shiftId || emp?.shiftId));
        
        return [
          format(parseISO(d.date), 'EEE'),
          d.date,
          getNepaliDate(d.date),
          d.employeeId,
          emp?.name || '',
          emp?.weeklyOff?.substring(0, 3) || '-',
          shiftDetails?.name || 'Day Shift',
          formatTimeFromHHMM(shiftDetails?.startTime),
          formatTimeFromHHMM(shiftDetails?.endTime),
          String(emp?.targetWorkingHours ?? d.expectedHours ?? '-'),
          emp?.otEligible !== false ? 'Yes' : 'No',
          formatAMPM(d.firstPunch),
          (d.lastPunch && d.lastPunch !== d.firstPunch) ? formatAMPM(d.lastPunch) : '-',
          formatMinutes(d.lateMinutes),
          formatMinutes(d.earlyMinutes),
          formatDuration(d.workingHours),
          formatDuration(d.overtime),
          d.status
        ];
      });
    } else if (reportType === 'missing') {
      head = [['Date (A.D.)', 'Date (B.S.)', 'Emp ID', 'Employee Name', 'Department', 'Contractor', 'Raw Logs', 'Status']];
      body = filtered.map(d => {
        const emp = employees.find(e => e.id === d.employeeId);
        return [
          d.date,
          getNepaliDate(d.date),
          d.employeeId,
          emp?.name || '',
          emp?.department || '',
          emp?.contractorName || '-',
          (d.rawLogs || d.logs).map(l => formatAMPM(l)).join(', '),
          'Missing Out'
        ];
      });
    } else if (reportType === 'overtime') {
      head = [['Date (A.D.)', 'Date (B.S.)', 'Emp ID', 'Employee Name', 'Reg Hours', 'OT Hours', 'Status']];
      body = filtered.map(d => {
        const emp = employees.find(e => e.id === d.employeeId);
        return [
          d.date,
          getNepaliDate(d.date),
          d.employeeId,
          emp?.name || '',
          formatDuration(d.workingHours),
          formatDuration(d.overtime),
          d.status
        ];
      });
    }

    const getColumnStyles = (): any => {
      if (reportType === 'daily') {
        const styles: any = {
          0: { cellWidth: 10, halign: 'center' }, // Day
          1: { cellWidth: 18, halign: 'center' }, // Date
          2: { cellWidth: 18, halign: 'center' }, // Date BS
          3: { cellWidth: 15, halign: 'center' }, // ID
          4: { cellWidth: 'auto', minCellWidth: 30 }, // Name
          5: { cellWidth: 10, halign: 'center' }, // WO
          6: { cellWidth: 14, halign: 'center' }, // Shift
          7: { cellWidth: 14, halign: 'center' }, // Shift In
          8: { cellWidth: 14, halign: 'center' }, // Shift Out
          9: { cellWidth: 10, halign: 'center' }, // TWH
          10: { cellWidth: 10, halign: 'center' }, // OT Elig
          11: { cellWidth: 14, halign: 'center' }, // Clock In
          12: { cellWidth: 14, halign: 'center' }, // Clock Out
          13: { cellWidth: 10, halign: 'center' }, // Late
          14: { cellWidth: 10, halign: 'center' }, // Early
          15: { cellWidth: 11, halign: 'center' }, // Work
          16: { cellWidth: 11, halign: 'center' }, // OT
          17: { cellWidth: 16, halign: 'center', fontStyle: 'bold' } // Status
        };
        return styles;
      } else if (reportType === 'missing') {
        const styles: any = {
          0: { cellWidth: 22, halign: 'center' }, // Date
          1: { cellWidth: 22, halign: 'center' }, // Date BS
          2: { cellWidth: 18, halign: 'center' }, // ID
          3: { cellWidth: 'auto' }, // Name
          4: { cellWidth: 30 }, // Dept
          5: { cellWidth: 30 }, // Contractor
          6: { cellWidth: 40 }, // Logs
          7: { cellWidth: 22, halign: 'center', fontStyle: 'bold' } // Status
        };
        return styles;
      } else {
        const styles: any = {
          0: { cellWidth: 22, halign: 'center' }, // Date
          1: { cellWidth: 22, halign: 'center' }, // Date BS
          2: { cellWidth: 18, halign: 'center' }, // ID
          3: { cellWidth: 'auto', minCellWidth: 40 }, // Name
          4: { cellWidth: 25, halign: 'center' }, // Work
          5: { cellWidth: 25, halign: 'center' }, // OT
          6: { cellWidth: 25, halign: 'center', fontStyle: 'bold' } // Status
        };
        return styles;
      }
    };

    autoTable(doc, {
      startY: 38,
      head: head,
      body: body,
      theme: 'striped',
      headStyles: { 
        fillColor: [15, 23, 42], // Deep Navy
        textColor: [255, 255, 255],
        fontSize: 8, 
        fontStyle: 'bold',
        halign: 'center',
        valign: 'middle',
        cellPadding: 1,
        lineColor: [200, 200, 200],
        lineWidth: 0.1
      },
      bodyStyles: { 
        fontSize: 7, 
        textColor: [30, 41, 59],
        cellPadding: 0.8,
        valign: 'middle',
        lineColor: [220, 220, 220],
        lineWidth: 0.1
      },
      alternateRowStyles: {
        fillColor: [248, 250, 252]
      },
      columnStyles: getColumnStyles(),
      margin: { left: 8, right: 8, top: 10, bottom: 15 },
      styles: {
        font: 'helvetica',
        overflow: 'linebreak'
      },
      didParseCell: (data) => {
        if (data.section === 'body') {
          const lastIndex = head[0].length - 1;
          if (data.column.index === lastIndex) {
            const status = String(data.cell.raw).trim();
            data.cell.styles.fontStyle = 'bold';
            
            const presentStatuses = ['Present', 'PWO', 'Late', 'Early', 'On Time', 'Overtime'];
            if (presentStatuses.includes(status)) data.cell.styles.textColor = [0, 128, 0]; 
            else if (status === 'Absent') data.cell.styles.textColor = [220, 0, 0]; 
            else if (status === 'SPF' || status === 'Missing Out') data.cell.styles.textColor = [255, 140, 0]; 
            else if (status === 'Weekly Off' || status === 'Leave') data.cell.styles.textColor = [0, 0, 255]; 
            else if (status === 'Holiday') data.cell.styles.textColor = [128, 0, 128]; 
          }
        }
      },
      showHead: 'everyPage',
    });

    // Add footer with total page counts
    const pageCount = (doc as any).internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(100, 100, 100);
      const footerY = doc.internal.pageSize.getHeight() - 10;
      doc.text(`Generated By: Contractor HRIS`, 8, footerY);
      doc.text(`Page ${i} of ${pageCount}`, pageWidth - 8, footerY, { align: 'right' });
    }

    doc.save(`${settings.companyName}_Attendance_Audit_${format(new Date(), 'yyyyMMdd_HHmm')}.pdf`);
  };



  return (
    <div className="space-y-6">
      <PageHeader 
        title="Generate Reports" 
        description="Advanced Analytics & Export"
        icon={FileText}
      />
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <Card className="p-6 sticky top-24">
             <h3 className="text-[12px] font-semibold text-slate-900 dark:text-white mb-6 flex items-center gap-2">
               <Filter size={14} className="text-primary" />
               Report Filters
             </h3>

             <div className="space-y-6">
               <div className="space-y-2">
                  <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Calculation Method</label>
                  <div className="flex flex-wrap bg-slate-50 dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-800 gap-1">
                    <button 
                      onClick={() => reprocess('standard')}
                      className={cn(
                        "flex-1 min-w-[60px] px-2 py-1.5 rounded-md text-[10px] font-bold transition-all uppercase tracking-wider",
                        calculationSource === 'standard' ? "bg-white dark:bg-slate-800 text-primary shadow-sm" : "text-slate-400"
                      )}
                    >
                      Format A
                    </button>
                    <button 
                      onClick={() => reprocess('multi-time')}
                      className={cn(
                        "flex-1 min-w-[60px] px-2 py-1.5 rounded-md text-[10px] font-bold transition-all uppercase tracking-wider",
                        calculationSource === 'multi-time' ? "bg-white dark:bg-slate-800 text-primary shadow-sm" : "text-slate-400"
                      )}
                    >
                      Format B
                    </button>
                    <button 
                      onClick={() => reprocess('all')}
                      className={cn(
                        "flex-1 min-w-[60px] px-2 py-1.5 rounded-md text-[10px] font-bold transition-all uppercase tracking-wider",
                        calculationSource === 'all' ? "bg-white dark:bg-slate-800 text-primary shadow-sm" : "text-slate-400"
                      )}
                    >
                      Merge
                    </button>
                  </div>
               </div>
               
               <div className="space-y-4">
                 <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Report Module</label>
                    <select 
                      value={reportType} 
                      onChange={e => setReportType(e.target.value)}
                      className="w-full h-10 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="daily">Daily Attendance</option>
                      <option value="zk_biodata">ZKT Bio Data Punch Format (Automation)</option>
                      <option value="missing">Missing Punches (SPF)</option>
                      <option value="overtime">Overtime Report</option>
                    </select>
                 </div>

                 <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Employee Search</label>
                    <Input 
                      placeholder="Name or ID..." 
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="h-10"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Sort Preference</label>
                    <select 
                      value={sortBy} 
                      onChange={e => setSortBy(e.target.value as 'id' | 'name')}
                      className="w-full h-10 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg text-[13px] focus:outline-none focus:ring-2 focus:ring-primary/20"
                    >
                      <option value="name">Sort by Legal Name</option>
                      <option value="id">Sort by Employee ID</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Department</label>
                    <MultiSelect 
                      options={departments}
                      selected={deptFilter}
                      onChange={setDeptFilter}
                      placeholder="Select Departments"
                    />
                  </div>
                 
                 <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest ml-1">Date Range</label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 relative z-10">
                      <Input 
                        type="date" 
                        value={startDate}
                        onChange={(e) => setStartDate(e.target.value)}
                        className="h-10 text-[12px]"
                      />
                      <Input 
                        type="date" 
                        value={endDate}
                        onChange={(e) => setEndDate(e.target.value)}
                        className="h-10 text-[12px]"
                      />
                    </div>
                 </div>
               </div>

               <div className="pt-6 border-t border-slate-100 dark:border-slate-800 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <Button onClick={handleExport} className="gap-2 h-10 text-[12px]">
                      <Download size={14} /> Excel
                    </Button>
                    <Button variant="outline" onClick={handleExportCSV} className="gap-2 h-10 text-[12px]">
                      <FileSpreadsheet size={14} /> CSV
                    </Button>
                  </div>
                  <Button variant="outline" onClick={handlePrintPDF} className="w-full gap-2 h-10 text-[12px]">
                    <FileText size={14} /> Export Audit PDF
                  </Button>
                  <Button 
                    onClick={handleSyncToSheets}
                    disabled={isSyncing}
                    variant="success"
                    className="w-full gap-2 h-10 text-[12px]"
                  >
                    {isSyncing ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      <TrendingUp size={16} />
                    )}
                    Sync to Cloud Sheets
                  </Button>
                  
                  <button 
                    onClick={() => {
                      setStartDate('1970-01-01');
                      setEndDate('2099-12-31');
                    }}
                    className="w-full text-center text-[10px] font-bold text-slate-400 hover:text-primary uppercase tracking-widest transition-colors mt-2"
                  >
                    <Archive size={12} className="inline mr-1" /> All-Time Records
                  </button>
               </div>
             </div>
          </Card>
        </div>
        
        <div className="lg:col-span-2 space-y-6">
          {reportType === 'zk_biodata' ? (
            <Card className="p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100 dark:border-slate-800">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Cpu size={16} className="text-primary" />
                    ZKTeco Bio Data Punch Report (Automation Format)
                  </h3>
                  <p className="text-[12px] text-slate-500 mt-0.5">
                    Live mapped punches aggregated in standard ZKT format: Employee No. | Name | Department | Date | Time
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant="success" className="text-[10px] font-mono">
                    {zkBioRows.length} Total Logs
                  </Badge>
                </div>
              </div>

              {zkBioRows.length === 0 ? (
                <div className="py-12 text-center space-y-2">
                  <Info size={28} className="mx-auto text-slate-300" />
                  <p className="text-sm font-medium text-slate-500">No ZKT Biometric punch records found for selected period/department.</p>
                  <p className="text-xs text-slate-400">Import punches or select "All-Time Records" to view full biometric history.</p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                  <table className="w-full text-left border-collapse text-[12px]">
                    <thead>
                      <tr className="bg-slate-100 dark:bg-slate-800/80 text-slate-700 dark:text-slate-300 border-b border-slate-200 dark:border-slate-800 font-bold uppercase tracking-wider text-[11px]">
                        <th className="py-2.5 px-3 border-r border-slate-200 dark:border-slate-800 w-[120px]">Employee No.</th>
                        <th className="py-2.5 px-3 border-r border-slate-200 dark:border-slate-800 w-[180px]">Name</th>
                        <th className="py-2.5 px-3 border-r border-slate-200 dark:border-slate-800 w-[140px]">Department</th>
                        <th className="py-2.5 px-3 border-r border-slate-200 dark:border-slate-800 w-[100px]">Date</th>
                        <th className="py-2.5 px-3">Time</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800 bg-white dark:bg-slate-900">
                      {zkBioRows.slice(0, 150).map((row, idx) => (
                        <tr key={idx} className="hover:bg-blue-50/40 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="py-2 px-3 font-mono font-bold text-slate-900 dark:text-slate-100 border-r border-slate-100 dark:border-slate-800">
                            {row.employeeNo}
                          </td>
                          <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-200 border-r border-slate-100 dark:border-slate-800">
                            {row.name}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-100 dark:border-slate-800">
                            <span className="inline-block px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                              {row.department}
                            </span>
                          </td>
                          <td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-400 border-r border-slate-100 dark:border-slate-800">
                            {row.formattedDate}
                          </td>
                          <td className="py-2 px-3 font-mono text-[11px] text-blue-700 dark:text-blue-400 bg-blue-50/50 dark:bg-blue-950/20 font-medium">
                            {row.timeString}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {zkBioRows.length > 150 && (
                    <div className="p-2.5 text-center text-[11px] text-slate-400 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800">
                      Showing first 150 of {zkBioRows.length} biometric records. Export to Excel or CSV for full automation data.
                    </div>
                  )}
                </div>
              )}
            </Card>
          ) : (
            <>
              <Card className="p-6">
                <div className="flex items-center justify-between mb-6">
                   <h3 className="text-[11px] font-bold text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
                     <LayoutDashboard size={14} className="text-primary" />
                     Attendance Trend
                   </h3>
                   <Badge variant="info" className="text-[9px]">Last 7 Days</Badge>
                </div>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={attendanceTrends}>
                      <defs>
                        <linearGradient id="colorPresent" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#1d4ed8" stopOpacity={0.1}/>
                          <stop offset="95%" stopColor="#1d4ed8" stopOpacity={0}/>
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} />
                      <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                      />
                      <Area type="monotone" dataKey="present" stroke="#1d4ed8" fillOpacity={1} fill="url(#colorPresent)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </Card>

              <Card className="p-6">
                <div className="flex items-center justify-between mb-6">
                   <h3 className="text-[11px] font-bold text-slate-900 dark:text-white uppercase tracking-widest flex items-center gap-2">
                     <BarChart3 size={14} className="text-primary" />
                     OT Distribution by Dept
                   </h3>
                   <Badge variant="warning" className="text-[9px]">Approved Hours Only</Badge>
                </div>
                <div className="h-[300px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={deptOTData} layout="vertical" margin={{ left: 20 }}>
                      <CartesianGrid strokeDasharray="3 3" horizontal={true} vertical={false} stroke="#f1f5f9" />
                      <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} />
                      <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} width={80} tick={{ fontSize: 10, fill: '#94a3b8', fontWeight: 600 }} />
                      <Tooltip 
                        contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', fontSize: '12px' }}
                        cursor={{ fill: '#f8fafc' }}
                      />
                      <Bar dataKey="hours" fill="#1d4ed8" radius={[0, 4, 4, 0]} barSize={16} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </Card>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
