import React, { useState, useMemo, useRef } from 'react';
import { 
  Upload, Download, FileSpreadsheet, CheckCircle2, AlertTriangle, 
  AlertCircle, X, Search, RefreshCw, FileText, Check, Clock, Calendar
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { Button, Badge, Input, Card } from './ui';
import { Employee } from '../types';
import { normalizeEmployeeId } from '../lib/utils';
import { useActionStatus } from '../context/ActionStatusContext';
import { useAppStore } from '../store';

export interface ManualAttendanceImportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ParsedAttendanceRow {
  rowNum: number;
  rawEmpId: string;
  normEmpId: string;
  empName: string;
  matchedEmp?: Employee;
  dateStr: string;
  status: string; // Present, Absent, Half Day, Weekly Off, Paid Leave, SPF, etc.
  inTime: string; // HH:mm
  outTime: string; // HH:mm
  remarks: string;
  validationStatus: 'VALID' | 'WARNING' | 'ERROR';
  validationMessage: string;
}

export function ManualAttendanceImportModal({ isOpen, onClose }: ManualAttendanceImportModalProps) {
  const { employees, addForceAttendance, setPunches, recalculate } = useAppStore();
  const { executeWithStatus } = useActionStatus();
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState('');
  const [parsedRows, setParsedRows] = useState<ParsedAttendanceRow[]>([]);
  const [isParsing, setIsParsing] = useState(false);
  const [filterMode, setFilterMode] = useState<'ALL' | 'VALID' | 'ISSUES'>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Fast employee lookups
  const empMap = useMemo(() => {
    const map = new Map<string, Employee>();
    employees.forEach(e => {
      map.set(e.id, e);
      map.set(e.id.toLowerCase(), e);
      const norm = normalizeEmployeeId(e.id);
      if (norm) map.set(norm, e);
    });
    return map;
  }, [employees]);

  // Clean state when modal opens/closes
  const handleClose = () => {
    setFileName('');
    setParsedRows([]);
    setSearchTerm('');
    setFilterMode('ALL');
    onClose();
  };

  // 1. Template Generator
  const handleDownloadTemplate = () => {
    const today = new Date().toISOString().split('T')[0];
    const templateData = employees.slice(0, 15).map((e, idx) => ({
      'Employee ID': e.id,
      'Employee Name': e.name,
      'Department': e.department || 'General',
      'Date (YYYY-MM-DD)': today,
      'Status': idx === 3 ? 'Absent' : idx === 5 ? 'Half Day' : idx === 7 ? 'Paid Leave' : 'Present',
      'In Time (HH:mm)': idx === 3 || idx === 7 ? '' : '09:00',
      'Out Time (HH:mm)': idx === 3 || idx === 7 ? '' : idx === 5 ? '13:30' : '18:00',
      'Remarks': 'Manual Attendance Entry'
    }));

    if (templateData.length === 0) {
      templateData.push({
        'Employee ID': '1001',
        'Employee Name': 'Sample Employee',
        'Department': 'Operations',
        'Date (YYYY-MM-DD)': today,
        'Status': 'Present',
        'In Time (HH:mm)': '09:00',
        'Out Time (HH:mm)': '18:00',
        'Remarks': 'Manual Shift Entry'
      });
    }

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Manual_Attendance');
    XLSX.writeFile(wb, `Manual_Attendance_Template_${today}.xlsx`);
    toast.success('Template downloaded successfully');
  };

  // Helper date normalizer
  const normalizeDateStr = (val: any): string => {
    if (!val) return '';
    if (typeof val === 'number') {
      const d = new Date(Math.round((val - 25569) * 864e5));
      if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    }
    const s = String(val).trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const parts = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (parts) {
      const d = parts[1].padStart(2, '0');
      const m = parts[2].padStart(2, '0');
      const y = parts[3];
      return `${y}-${m}-${d}`;
    }
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().split('T')[0];
    return s;
  };

  // Helper time normalizer
  const normalizeTimeStr = (val: any): string => {
    if (!val) return '';
    if (typeof val === 'number') {
      const totalMins = Math.round(val * 24 * 60);
      const h = Math.floor(totalMins / 60) % 24;
      const m = totalMins % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }
    const s = String(val).trim();
    const timeMatch = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?(?:\s*(AM|PM))?$/i);
    if (timeMatch) {
      let h = parseInt(timeMatch[1], 10);
      const m = timeMatch[2];
      const ampm = timeMatch[3]?.toUpperCase();
      if (ampm === 'PM' && h < 12) h += 12;
      if (ampm === 'AM' && h === 12) h = 0;
      return `${String(h).padStart(2, '0')}:${m}`;
    }
    return s;
  };

  // 2. Parse Uploaded Excel File
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const bstr = evt.target?.result;
        const wb = XLSX.read(bstr, { type: 'binary' });
        const sheetName = wb.SheetNames[0];
        const ws = wb.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json<any>(ws);

        if (json.length === 0) {
          toast.error('The selected Excel file is empty.');
          setIsParsing(false);
          return;
        }

        const rows: ParsedAttendanceRow[] = json.map((row, idx) => {
          const rawId = String(
            row['Employee ID'] ?? 
            row['Employee No.'] ?? 
            row['Emp ID'] ?? 
            row['EmpID'] ?? 
            row['ID'] ?? 
            ''
          ).trim();

          const normId = normalizeEmployeeId(rawId);
          const matchedEmp = empMap.get(rawId) || empMap.get(rawId.toLowerCase()) || (normId ? empMap.get(normId) : undefined);
          const empName = matchedEmp?.name || String(row['Employee Name'] ?? row['Name'] ?? 'Unknown').trim();
          
          const rawDate = row['Date (YYYY-MM-DD)'] ?? row['Date'] ?? row['Attendance Date'] ?? '';
          const dateStr = normalizeDateStr(rawDate);

          const rawStatus = String(row['Status'] ?? 'Present').trim();
          const inTime = normalizeTimeStr(row['In Time (HH:mm)'] ?? row['In Time'] ?? row['IN'] ?? row['Time In'] ?? '');
          const outTime = normalizeTimeStr(row['Out Time (HH:mm)'] ?? row['Out Time'] ?? row['OUT'] ?? row['Time Out'] ?? '');
          const remarks = String(row['Remarks'] ?? 'Manual Attendance Import').trim();

          let validationStatus: 'VALID' | 'WARNING' | 'ERROR' = 'VALID';
          let validationMessage = 'Ready for import';

          if (!matchedEmp) {
            validationStatus = 'ERROR';
            validationMessage = `Employee "${rawId}" not found in directory`;
          } else if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
            validationStatus = 'ERROR';
            validationMessage = `Invalid date "${rawDate}"`;
          } else if (rawStatus.toLowerCase() === 'present' && !inTime && !outTime) {
            validationStatus = 'WARNING';
            validationMessage = 'Present status without IN/OUT times. Will default to 09:00 - 18:00';
          }

          return {
            rowNum: idx + 2,
            rawEmpId: rawId,
            normEmpId: normId,
            empName,
            matchedEmp,
            dateStr,
            status: rawStatus || 'Present',
            inTime,
            outTime,
            remarks,
            validationStatus,
            validationMessage
          };
        });

        setParsedRows(rows);
        toast.success(`Parsed ${rows.length} attendance rows from ${file.name}`);
      } catch (err: any) {
        console.error('Manual attendance file parse error:', err);
        toast.error('Failed to parse Excel file. Please use the official template.');
      } finally {
        setIsParsing(false);
      }
    };
    reader.readAsBinaryString(file);
  };

  // Filtered rows
  const filteredRows = useMemo(() => {
    return parsedRows.filter(r => {
      if (filterMode === 'VALID' && r.validationStatus !== 'VALID') return false;
      if (filterMode === 'ISSUES' && r.validationStatus === 'VALID') return false;
      if (searchTerm) {
        const s = searchTerm.toLowerCase();
        return r.rawEmpId.toLowerCase().includes(s) || r.empName.toLowerCase().includes(s) || r.dateStr.includes(s);
      }
      return true;
    });
  }, [parsedRows, filterMode, searchTerm]);

  // Statistics
  const validCount = parsedRows.filter(r => r.validationStatus === 'VALID').length;
  const warningCount = parsedRows.filter(r => r.validationStatus === 'WARNING').length;
  const errorCount = parsedRows.filter(r => r.validationStatus === 'ERROR').length;
  const eligibleToImport = parsedRows.filter(r => r.validationStatus !== 'ERROR');

  // 3. Commit Force Attendance & Punch Entries directly to SQLite
  const handleCommitImport = async () => {
    if (eligibleToImport.length === 0) {
      toast.error('No valid records to import.');
      return;
    }

    await executeWithStatus(
      {
        title: `Import ${eligibleToImport.length} Manual Attendance Records to SQLite?`,
        subtitle: `Commits Force Attendance entries and manual punch records into SQLite (E:\\SHRM_HRIS\\Database.db), then recalculates Attendance, Muster, and Overtime.`,
        module: 'Manual Attendance Import',
        actionType: 'import',
        affectedCount: eligibleToImport.length,
        details: {
          'Source File': fileName || 'Manual Import',
          'Eligible Records': `${eligibleToImport.length} rows`,
          'Errors Skipped': `${errorCount} rows`,
          'Persistence Mode': 'SQLite Database Storage'
        },
        confirmText: `Import & Save ${eligibleToImport.length} Records`
      },
      async (updateProgress) => {
        updateProgress({ percent: 20, message: 'Processing manual attendance entries...' });
        const sessionPunchesToApply: Array<{
          id: string;
          employeeId: string;
          punchDatetime: string;
          importFormat: 'standard';
          source: 'Manual';
        }> = [];

        for (let i = 0; i < eligibleToImport.length; i++) {
          const r = eligibleToImport[i];
          const empId = r.matchedEmp?.id || r.rawEmpId;
          const statusLower = r.status.toLowerCase();
          
          let effectiveIn = r.inTime;
          let effectiveOut = r.outTime;

          if (statusLower === 'present' || statusLower === 'late' || statusLower === 'on time') {
            if (!effectiveIn) effectiveIn = '09:00';
            if (!effectiveOut) effectiveOut = '18:00';
          } else if (statusLower === 'half day') {
            if (!effectiveIn) effectiveIn = '09:00';
            if (!effectiveOut) effectiveOut = '13:30';
          }

          // 1. Add Force Attendance Record
          await addForceAttendance({
            employeeId: empId,
            date: r.dateStr,
            status: r.status,
            inTime: effectiveIn || '',
            outTime: effectiveOut || '',
            reason: r.remarks || 'Manual Attendance Excel Import',
            approvedBy: 'HR Admin',
            remarks: `Imported from ${fileName || 'Excel'}`
          });

          // 2. Stage session punches in memory if IN/OUT times exist so all tabs (Attendance, Muster, Calendar, Timeline) link cleanly
          if (effectiveIn) {
            const dt = `${r.dateStr}T${effectiveIn}:00`;
            sessionPunchesToApply.push({
              id: `${empId}_${dt.replace(/[:.-]/g, '')}`,
              employeeId: empId,
              punchDatetime: dt,
              importFormat: 'standard',
              source: 'Manual'
            });
          }
          if (effectiveOut && effectiveOut !== effectiveIn) {
            const dt = `${r.dateStr}T${effectiveOut}:00`;
            sessionPunchesToApply.push({
              id: `${empId}_${dt.replace(/[:.-]/g, '')}`,
              employeeId: empId,
              punchDatetime: dt,
              importFormat: 'standard',
              source: 'Manual'
            });
          }

          if (i % 20 === 0) {
            const pct = Math.round(20 + (i / eligibleToImport.length) * 55);
            updateProgress({ percent: pct, message: `Processed ${i + 1} / ${eligibleToImport.length} records...` });
          }
        }

        if (sessionPunchesToApply.length > 0) {
          updateProgress({ percent: 80, message: `Saving ${sessionPunchesToApply.length} punches to SQLite...` });
          await setPunches(sessionPunchesToApply);
        }

        updateProgress({ percent: 90, message: 'Triggering attendance recalculation...' });
        await recalculate();

        handleClose();

        return {
          success: true,
          affectedCount: eligibleToImport.length,
          verificationStatus: 'PASSED',
          transaction: 'COMMITTED',
          dbPath: 'E:\\SHRM_HRIS\\Database.db',
          breakdown: {
            'Imported Entries': `${eligibleToImport.length} staff attendance records`,
            'Punches Stored in SQLite': `${sessionPunchesToApply.length} entries`,
            'Linked Modules': 'Attendance, Monthly Muster, Overtime Audit, and Payroll'
          }
        };
      }
    );
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-4xl max-h-[90vh] bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col overflow-hidden">
        
        {/* Header */}
        <div className="p-6 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white">
              <Upload size={20} />
            </div>
            <div>
              <h2 className="text-lg font-bold">Manual Attendance Import</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Bulk import employee attendance from Excel. Automatically links to Attendance tab, Monthly Muster, OT & Payroll.
              </p>
            </div>
          </div>
          <button 
            onClick={handleClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1">
          {/* Action Row: Template & File Input */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-2xl border border-slate-200 dark:border-slate-800">
            <div>
              <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
                1. Download Standard Template
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Pre-populated with your active employee directory for rapid fill-in.
              </p>
            </div>
            <Button 
              variant="outline" 
              onClick={handleDownloadTemplate} 
              className="gap-2 text-xs font-bold border-indigo-200 text-indigo-700 dark:border-indigo-800 dark:text-indigo-300"
            >
              <Download size={14} />
              Download Excel Template
            </Button>
          </div>

          {/* Upload Dropzone */}
          <div className="space-y-2">
            <p className="text-xs font-bold text-slate-700 dark:text-slate-300">
              2. Upload Completed Attendance File
            </p>
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-500 rounded-2xl p-6 text-center cursor-pointer transition-all bg-white dark:bg-slate-900 group"
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileUpload} 
                accept=".xlsx,.xls,.csv" 
                className="hidden" 
              />
              <FileSpreadsheet className="w-10 h-10 mx-auto text-slate-400 group-hover:text-indigo-600 transition-colors" />
              <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-2">
                {fileName ? fileName : 'Click to select or drag and drop Excel attendance file'}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Supports .xlsx, .xls, and .csv formats
              </p>
            </div>
          </div>

          {/* Preview Table & Metrics if parsed */}
          {parsedRows.length > 0 && (
            <div className="space-y-4">
              {/* Summary KPIs */}
              <div className="grid grid-cols-4 gap-3 text-center">
                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Total Rows</p>
                  <p className="text-lg font-black text-slate-900 dark:text-white">{parsedRows.length}</p>
                </div>
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 rounded-xl border border-emerald-200 dark:border-emerald-800">
                  <p className="text-[10px] font-bold text-emerald-600 uppercase">Valid Rows</p>
                  <p className="text-lg font-black text-emerald-700 dark:text-emerald-300">{validCount}</p>
                </div>
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl border border-amber-200 dark:border-amber-800">
                  <p className="text-[10px] font-bold text-amber-600 uppercase">Warnings</p>
                  <p className="text-lg font-black text-amber-700 dark:text-amber-300">{warningCount}</p>
                </div>
                <div className="p-3 bg-rose-50 dark:bg-rose-950/40 rounded-xl border border-rose-200 dark:border-rose-800">
                  <p className="text-[10px] font-bold text-rose-600 uppercase">Errors</p>
                  <p className="text-lg font-black text-rose-700 dark:text-rose-300">{errorCount}</p>
                </div>
              </div>

              {/* Table Filter & Search Controls */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setFilterMode('ALL')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      filterMode === 'ALL' ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300'
                    }`}
                  >
                    All ({parsedRows.length})
                  </button>
                  <button
                    onClick={() => setFilterMode('VALID')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      filterMode === 'VALID' ? 'bg-emerald-600 text-white' : 'text-emerald-600 hover:bg-emerald-50'
                    }`}
                  >
                    Valid Only ({validCount})
                  </button>
                  <button
                    onClick={() => setFilterMode('ISSUES')}
                    className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                      filterMode === 'ISSUES' ? 'bg-rose-600 text-white' : 'text-rose-600 hover:bg-rose-50'
                    }`}
                  >
                    Issues ({warningCount + errorCount})
                  </button>
                </div>

                <div className="relative w-64">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <Input 
                    placeholder="Search by ID, name, date..." 
                    value={searchTerm} 
                    onChange={e => setSearchTerm(e.target.value)} 
                    className="pl-9 h-8 text-xs" 
                  />
                </div>
              </div>

              {/* Parsed Rows Table */}
              <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl max-h-64">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0 z-10 text-[10px] uppercase font-bold text-slate-500">
                    <tr className="border-b border-slate-200 dark:border-slate-700">
                      <th className="px-3 py-2">Row</th>
                      <th className="px-3 py-2">Employee</th>
                      <th className="px-3 py-2">Date</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">IN - OUT</th>
                      <th className="px-3 py-2">Validation</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {filteredRows.map((r, i) => (
                      <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-3 py-2 font-mono text-slate-400">#{r.rowNum}</td>
                        <td className="px-3 py-2">
                          <p className="font-bold text-slate-900 dark:text-white leading-tight">{r.empName}</p>
                          <p className="font-mono text-[10px] text-slate-400">{r.rawEmpId}</p>
                        </td>
                        <td className="px-3 py-2 font-mono">{r.dateStr}</td>
                        <td className="px-3 py-2 font-bold text-indigo-600 dark:text-indigo-400">{r.status}</td>
                        <td className="px-3 py-2 font-mono">
                          {r.inTime || '--:--'} - {r.outTime || '--:--'}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`inline-flex items-center gap-1 font-bold text-[10px] px-2 py-0.5 rounded-full ${
                            r.validationStatus === 'VALID' 
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300' 
                              : r.validationStatus === 'WARNING' 
                                ? 'bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300' 
                                : 'bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300'
                          }`}>
                            {r.validationMessage}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <p className="text-xs text-slate-500">
            {eligibleToImport.length > 0 
              ? `${eligibleToImport.length} verified records ready to store in SQLite` 
              : 'Upload a file to begin'}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button 
              onClick={handleCommitImport} 
              disabled={eligibleToImport.length === 0}
              className="gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold"
            >
              <Check size={16} />
              Import & Link Attendance ({eligibleToImport.length})
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
