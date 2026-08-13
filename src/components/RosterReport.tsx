import React, { useState, useMemo } from 'react';
import { useAppStore } from '../store';
import { Card, Button, Input, Badge } from './ui';
import { Employee } from '../types';
import { 
  Filter, Download, Printer, RefreshCw, Calendar, Search, 
  CheckCircle2, Clock, ShieldCheck, UserCheck, AlertCircle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { format, parseISO } from 'date-fns';

export function RosterReport() {
  const { processedData, employees, settings, shiftAssignments } = useAppStore();

  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const [startDate, setStartDate] = useState<string>(todayStr);
  const [endDate, setEndDate] = useState<string>(todayStr);
  const [selectedDept, setSelectedDept] = useState<string>('All');
  const [selectedSection, setSelectedSection] = useState<string>('All');
  const [selectedDesignation, setSelectedDesignation] = useState<string>('All');
  const [selectedShift, setSelectedShift] = useState<string>('All');
  const [selectedSource, setSelectedSource] = useState<string>('All');
  const [selectedStatus, setSelectedStatus] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const departments = useMemo(() => ['All', ...Array.from(new Set(employees.map(e => e.department).filter(Boolean)))], [employees]);
  const sections = useMemo(() => ['All', ...Array.from(new Set(employees.map(e => e.section).filter(Boolean)))], [employees]);
  const designations = useMemo(() => ['All', ...Array.from(new Set(employees.map(e => e.designation).filter(Boolean)))], [employees]);
  const shifts = useMemo(() => ['All', ...(settings.shifts?.map(s => s.name) || ['A Shift', 'B Shift', 'C Shift', 'Day Shift', 'Night Shift'])], [settings]);

  const reportRecords = useMemo(() => {
    const empMap = new Map<string, Employee>(employees.map(e => [e.id, e]));

    return processedData.filter(p => {
      if (startDate && p.date < startDate) return false;
      if (endDate && p.date > endDate) return false;

      const emp = empMap.get(p.employeeId);
      if (selectedDept !== 'All' && emp?.department !== selectedDept) return false;
      if (selectedSection !== 'All' && emp?.section !== selectedSection) return false;
      if (selectedDesignation !== 'All' && emp?.designation !== selectedDesignation) return false;

      if (selectedShift !== 'All' && p.shiftName !== selectedShift && p.shiftCode !== selectedShift) return false;
      if (selectedSource !== 'All' && p.shiftSource !== selectedSource) return false;
      if (selectedStatus !== 'All' && p.status !== selectedStatus) return false;

      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchName = emp?.name?.toLowerCase().includes(term);
        const matchId = p.employeeId?.toLowerCase().includes(term);
        if (!matchName && !matchId) return false;
      }

      return true;
    }).map(p => {
      const emp = empMap.get(p.employeeId);
      const assignment = shiftAssignments.find(a => a.employeeId === p.employeeId && a.date === p.date);
      
      return {
        id: p.id,
        employeeId: p.employeeId,
        employeeName: emp?.name || p.employeeId,
        department: emp?.department || 'N/A',
        section: emp?.section || 'N/A',
        date: p.date,
        rosterShift: assignment?.shiftCode || assignment?.shiftId || emp?.shiftId || 'Default',
        finalShift: p.shiftName || p.shiftCode || 'Day Shift',
        shiftSource: p.shiftSource || 'Employee Default',
        checkIn: p.firstPunch ? format(parseISO(p.firstPunch), 'HH:mm') : '-',
        checkOut: p.lastPunch ? format(parseISO(p.lastPunch), 'HH:mm') : '-',
        status: p.status,
        lateMinutes: p.lateMinutes || 0,
        earlyMinutes: p.earlyMinutes || 0,
        otHours: p.overtime || 0
      };
    });
  }, [processedData, employees, shiftAssignments, startDate, endDate, selectedDept, selectedSection, selectedDesignation, selectedShift, selectedSource, selectedStatus, searchTerm]);

  const handleExportExcel = () => {
    const ws = XLSX.utils.json_to_sheet(reportRecords);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Roster Report");
    XLSX.writeFile(wb, `Roster_Report_${startDate}_to_${endDate}.xlsx`);
  };

  const handleExportCSV = () => {
    const ws = XLSX.utils.json_to_sheet(reportRecords);
    const csv = XLSX.utils.sheet_to_csv(ws);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Roster_Report_${startDate}_to_${endDate}.csv`;
    a.click();
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      <Card className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 rounded-xl">
              <Filter className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Roster Report Filters</h3>
              <p className="text-xs text-slate-500">Filter shift resolution, source audit and attendance reconciliation</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={handleExportCSV}>CSV</Button>
            <Button size="sm" variant="outline" onClick={handleExportExcel}>Excel</Button>
            <Button size="sm" variant="primary" onClick={handlePrint}>Print</Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 mt-4">
          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">From Date</label>
            <input 
              type="date" 
              value={startDate} 
              onChange={e => setStartDate(e.target.value)}
              className="mt-1 w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5" 
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">To Date</label>
            <input 
              type="date" 
              value={endDate} 
              onChange={e => setEndDate(e.target.value)}
              className="mt-1 w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5" 
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Department</label>
            <select 
              value={selectedDept} 
              onChange={e => setSelectedDept(e.target.value)}
              className="mt-1 w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5"
            >
              {departments.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Shift Source</label>
            <select 
              value={selectedSource} 
              onChange={e => setSelectedSource(e.target.value)}
              className="mt-1 w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5"
            >
              <option value="All">All Sources</option>
              <option value="Manual Override">Manual Override</option>
              <option value="Approved Roster">Approved Roster</option>
              <option value="Imported Roster">Imported Roster</option>
              <option value="Employee Default">Employee Default</option>
              <option value="Auto Detected">Auto Detected</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Status</label>
            <select 
              value={selectedStatus} 
              onChange={e => setSelectedStatus(e.target.value)}
              className="mt-1 w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5"
            >
              <option value="All">All Statuses</option>
              <option value="Present">Present</option>
              <option value="Late">Late</option>
              <option value="Absent">Absent</option>
              <option value="Weekly Off">Weekly Off</option>
              <option value="SPF">SPF</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-600 dark:text-slate-400">Search</label>
            <input 
              type="text" 
              placeholder="Name / ID..." 
              value={searchTerm} 
              onChange={e => setSearchTerm(e.target.value)}
              className="mt-1 w-full text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5" 
            />
          </div>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center">
          <h4 className="text-sm font-bold text-slate-900 dark:text-white">Roster Reconciliation Records</h4>
          <span className="text-xs text-slate-500">{reportRecords.length} Records</span>
        </div>

        <div className="overflow-x-auto max-h-[600px]">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-semibold sticky top-0 border-b border-slate-100 dark:border-slate-800">
              <tr>
                <th className="p-3">Emp ID</th>
                <th className="p-3">Employee Name</th>
                <th className="p-3">Department</th>
                <th className="p-3">Date</th>
                <th className="p-3">Roster Shift</th>
                <th className="p-3">Final Shift</th>
                <th className="p-3">Shift Source</th>
                <th className="p-3 text-center">In / Out</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-right">Late</th>
                <th className="p-3 text-right">OT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
              {reportRecords.map((row, idx) => (
                <tr key={`${row.id}_${idx}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                  <td className="p-3 font-mono font-bold text-slate-700 dark:text-slate-300">{row.employeeId}</td>
                  <td className="p-3 font-bold text-slate-900 dark:text-white">{row.employeeName}</td>
                  <td className="p-3">{row.department}</td>
                  <td className="p-3 font-mono">{row.date}</td>
                  <td className="p-3 text-slate-500">{row.rosterShift}</td>
                  <td className="p-3 font-bold text-slate-900 dark:text-white">{row.finalShift}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${
                      row.shiftSource === 'Manual Override' ? 'bg-purple-100 text-purple-700' :
                      row.shiftSource === 'Approved Roster' ? 'bg-emerald-100 text-emerald-700' :
                      row.shiftSource === 'Imported Roster' ? 'bg-blue-100 text-blue-700' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {row.shiftSource}
                    </span>
                  </td>
                  <td className="p-3 text-center font-mono">{row.checkIn} - {row.checkOut}</td>
                  <td className="p-3 text-center">
                    <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                      row.status === 'Present' ? 'bg-emerald-50 text-emerald-700' :
                      row.status === 'Late' ? 'bg-amber-50 text-amber-700' :
                      row.status === 'Absent' ? 'bg-red-50 text-red-700' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {row.status}
                    </span>
                  </td>
                  <td className="p-3 text-right font-mono">{row.lateMinutes > 0 ? `${row.lateMinutes}m` : '-'}</td>
                  <td className="p-3 text-right font-mono font-bold text-indigo-600">{row.otHours > 0 ? `${row.otHours}h` : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
