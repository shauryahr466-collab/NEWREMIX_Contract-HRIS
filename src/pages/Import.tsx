import React, { useState, useMemo } from 'react';
import * as XLSX from 'xlsx';
import { UploadCloud, CheckCircle2, AlertCircle, Trash2, History, Database, Download, Filter, CalendarDays, ClipboardList, Loader2, Info } from 'lucide-react';
import { useAppStore } from '../store';
import { RawPunch, ShiftAssignment } from '../types';
import { generateId, cn, normalizeEmployeeId } from '../lib/utils';
import { processPunches } from '../lib/engine';
import { useNavigate } from 'react-router-dom';
import { format, parse, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { processRosterUpload, generateRosterTemplate } from '../lib/roster';
import { PageHeader, Card, Button, Input, Badge } from '../components/ui';

export function Import() {
  const { 
    punches, setPunches, deletePunch, deletePunchBatch, clearPunches, 
    employees, setEmployees, settings, shiftAssignments, setShiftAssignments, 
    calculationSource, setCalculationSource, quotaExceeded, recalculate 
  } = useAppStore();
  const [importType, setImportType] = useState<'punch' | 'roster'>('punch');
  const [isDragging, setIsDragging] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<'idle' | 'processing' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [viewMode, setViewMode] = useState<'sessions' | 'recent'>('sessions');
  const [sessionStartDate, setSessionStartDate] = useState('');
  const [sessionEndDate, setSessionEndDate] = useState('');
  const [isConfirmingPurge, setIsConfirmingPurge] = useState(false);
  const [purgeConfirmationInput, setPurgeConfirmationInput] = useState('');
  const [isPurging, setIsPurging] = useState(false);
  const [purgeProgressMessage, setPurgeProgressMessage] = useState('');
  const [showOnlyRegistered, setShowOnlyRegistered] = useState(true);
  const navigate = useNavigate();

  const handleConfirmPurge = async () => {
    if (purgeConfirmationInput.trim().toUpperCase() !== 'DELETE' || isPurging) return;
    setIsPurging(true);
    setPurgeProgressMessage('Preparing database purge...');
    try {
      await clearPunches((msg) => setPurgeProgressMessage(msg));
      toast.success("Database purged successfully");
      setIsConfirmingPurge(false);
      setPurgeConfirmationInput('');
    } catch (e: any) {
      toast.error(e.message || "Failed to purge database");
    } finally {
      setIsPurging(false);
      setPurgeProgressMessage('');
    }
  };

  const downloadSample = () => {
    if (importType === 'punch') {
      const sampleData = [
        {
          "Employee No.": "3058",
          "Name": "Mukesh Kumar",
          "Department": "RA Energy",
          "Date": "5/28/2026",
          "Time.1": "09:00 AM",
          "Time.2": "06:01 PM"
        },
        {
          "Employee No.": "1246",
          "Name": "Hemant Dahal",
          "Department": "HR/Admin",
          "Date": "5/30/2026",
          "Time.1": "10:00 PM",
          "Time.2": "06:00 AM",
          "Time.3": "06:15 AM"
        }
      ];

      const ws = XLSX.utils.json_to_sheet(sampleData);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Raw Punches");
      XLSX.writeFile(wb, "Raw_Punch_Template.xlsx");
    } else {
      const wb = generateRosterTemplate();
      XLSX.writeFile(wb, "Roster_Import_Template.xlsx");
    }
  };

  const sessions = useMemo(() => {
    const sessionsMap = new Map<string, { id: string; count: number; date: string; format: string; fileName?: string }>();
    punches.forEach(p => {
      if (p.importId) {
        const existing = sessionsMap.get(p.importId);
        if (existing) {
          existing.count++;
          if (p.fileName && !existing.fileName) existing.fileName = p.fileName;
        } else {
          sessionsMap.set(p.importId, {
            id: p.importId!,
            count: 1,
            date: p.importDate || p.punchDatetime, 
            format: p.importFormat || 'standard',
            fileName: p.fileName || 'Imported File'
          });
        }
      }
    });

    return Array.from(sessionsMap.values())
      .filter(s => {
        const dateStr = s.date.split('T')[0];
        if (sessionStartDate && dateStr < sessionStartDate) return false;
        if (sessionEndDate && dateStr > sessionEndDate) return false;
        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [punches, sessionStartDate, sessionEndDate]);

  const orphansCount = useMemo(() => {
    return punches.filter(p => !p.importId).length;
  }, [punches]);

  const sortedPunches = useMemo(() => {
    const existingEmpIds = new Set(employees.map(e => e.id));
    return [...punches]
      .filter(p => {
        const matchesSearch = !searchTerm || p.employeeId.toLowerCase().includes(searchTerm.toLowerCase());
        const isRegistered = existingEmpIds.has(p.employeeId);
        if (showOnlyRegistered && !isRegistered) return false;
        return matchesSearch;
      })
      .sort((a, b) => b.punchDatetime.localeCompare(a.punchDatetime))
      .slice(0, 100);
  }, [punches, searchTerm, showOnlyRegistered, employees]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (quotaExceeded) {
      setStatus('error');
      setMessage('Cannot upload: Database write quota reached.');
      return;
    }
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setStatus('idle');
    }
  };

  const processFile = async () => {
    if (quotaExceeded) return;
    if (!file) return;
    setStatus('processing');
    setMessage('Reading file...');

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        if (importType === 'punch') {
          const json = XLSX.utils.sheet_to_json(worksheet) as any[];

          setMessage(`Parsing ${json.length} records...`);

          // Yield to browser to update UI
          await new Promise(resolve => setTimeout(resolve, 10));

          const batchId = `BATCH_${Date.now()}`;
          const importDate = new Date().toISOString();
          const finalNewPunchesRaw: RawPunch[] = [];
          
          // Map for faster lookup with multiple normalization strategies
          const employeeIdMap = new Map<string, string>(); // Normalized -> Actual ID
          const failedMatches = new Set<string>();
          
          const getNormalized = (id: any) => {
            const str = String(id).trim();
            const numeric = normalizeEmployeeId(str);
            const lowercase = str.toLowerCase();
            return { original: str, numeric, lowercase };
          };
          
          employees.forEach(e => {
            const norm = getNormalized(e.id);
            employeeIdMap.set(norm.original, e.id);
            employeeIdMap.set(norm.lowercase, e.id);
            if (norm.numeric) {
              // Only map numeric if it's unique enough or we prioritize it
              if (!employeeIdMap.has(norm.numeric)) {
                employeeIdMap.set(norm.numeric, e.id);
              }
            }
          });

          // Helper for deterministic IDs to prevent duplicates on re-import
          const makePunchId = (empId: string, dt: string) => `p_${empId}_${dt}`.replace(/[^a-zA-Z0-9]/g, '_');

          json.forEach((row) => {
            const keys = Object.keys(row);
            
            const rawIdKey = keys.find(k => k === 'Employee No.' || k === 'Emp ID' || k === 'EMP ID' || k.toLowerCase().includes('ac-no') || k.toLowerCase().includes('employee no'));
            const dateTimeKey = keys.find(k => k === 'Date/Time' || k === 'DateTime' || k.toLowerCase().includes('date/time'));
            const dateKey = keys.find(k => k === 'Date');
            
            // Find all Time columns (Time.1, Time.2, etc. or just "Time")
            const timeKeys = keys.filter(k => k.toLowerCase().startsWith('time') || k.toLowerCase().includes('punch'));

            if (rawIdKey && (dateTimeKey || (dateKey && timeKeys.length > 0))) {
              const rawEmpIdInput = String(row[rawIdKey]).trim();
              const normInput = getNormalized(rawEmpIdInput);
              
              // FLEXIBLE MATCHING: Exact -> Lowercase -> Numeric part (handles 1257 vs EMP1257)
              let matchedId = employeeIdMap.get(normInput.original) || 
                              employeeIdMap.get(normInput.lowercase) || 
                              (normInput.numeric ? employeeIdMap.get(normInput.numeric) : undefined);

              // ONLY process if employee exists in directory
              if (!matchedId) {
                failedMatches.add(rawEmpIdInput);
                return;
              }

              const rawEmpId = matchedId;

              if (dateTimeKey) {
                const rawDT = row[dateTimeKey];
                let punchIso = '';
                if (typeof rawDT === 'number') {
                  const dateObj = new Date(Math.round((rawDT - 25569) * 864e5));
                  punchIso = dateObj.toISOString();
                } else if (typeof rawDT === 'string') {
                  const parsed = new Date(rawDT);
                  if (!isNaN(parsed.getTime())) {
                    punchIso = parsed.toISOString();
                  }
                }
                
                if (punchIso) {
                  finalNewPunchesRaw.push({
                    id: makePunchId(rawEmpId, punchIso),
                    employeeId: rawEmpId,
                    punchDatetime: punchIso,
                    importFormat: 'standard',
                    importId: batchId,
                    importDate: importDate,
                    fileName: file.name
                  });
                }
              } else if (dateKey) {
                let datePart = '';
                const rawDate = row[dateKey];
                if (typeof rawDate === 'number') {
                  const dateObj = new Date(Math.round((rawDate - 25569) * 864e5));
                  datePart = format(dateObj, 'yyyy-MM-dd');
                } else if (typeof rawDate === 'string') {
                  try {
                    const parsedDate = new Date(rawDate);
                    if (!isNaN(parsedDate.getTime())) {
                      datePart = format(parsedDate, 'yyyy-MM-dd');
                    }
                  } catch (e) {}
                }

                if (datePart) {
                  // Process all time columns for this row
                  timeKeys.forEach(tKey => {
                    const rawTime = row[tKey];
                    if (!rawTime) return;

                    let times: string[] = [];
                    if (typeof rawTime === 'string') {
                      // Split by comma or semicolon first to preserve AM/PM spaces
                      times = rawTime.split(/[,;]/).map(t => t.trim()).filter(Boolean);
                    } else if (typeof rawTime === 'number') {
                      times = [String(rawTime)];
                    }

                    times.forEach(tStr => {
                      let pIso = '';
                      if (isNaN(Number(tStr))) {
                        // It's a string time like "1:10 PM" or "13:10"
                        const parsed = new Date(`${datePart} ${tStr}`);
                        if (!isNaN(parsed.getTime())) pIso = parsed.toISOString();
                      } else {
                        // It's an Excel numeric time
                        const t = Number(tStr);
                        const hours = Math.floor(t * 24);
                        const minutes = Math.floor((t * 24 - hours) * 60);
                        const seconds = Math.floor(((t * 24 - hours) * 60 - minutes) * 60);
                        const parsed = new Date(`${datePart} ${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`);
                        if (!isNaN(parsed.getTime())) pIso = parsed.toISOString();
                      }
                      if (pIso) {
                        finalNewPunchesRaw.push({
                          id: makePunchId(rawEmpId, pIso),
                          employeeId: rawEmpId,
                          punchDatetime: pIso,
                          importFormat: 'multi-time',
                          importId: batchId,
                          importDate: importDate,
                          fileName: file.name
                        });
                      }
                    });
                  });
                }
              }
            }
          });

          if (finalNewPunchesRaw.length === 0) {
            toast.error("No punches found for existing employees in directory. Ensure Employee No. matches the Directory.");
            setStatus('error');
            setMessage("Import failed: No matching employees found.");
            return;
          }

          // Deduplicate new punches based on ID
          const uniqueNewPunchesMap = new Map();
          finalNewPunchesRaw.forEach(p => uniqueNewPunchesMap.set(p.id, p));
          const finalNewPunches = Array.from(uniqueNewPunchesMap.values());

          setMessage(`Saving ${finalNewPunches.length} punches to database...`);
          await setPunches(finalNewPunches, (msg) => setMessage(msg));
          
          setMessage('Finalizing import...');
          setCalculationSource('all');
          // Removed manual recalculate() as onSnapshot handles it more efficiently
          setStatus('success');
          setMessage(`Successfully imported ${finalNewPunches.length} records for matching employees.`);
          toast.success(`Successfully imported ${finalNewPunches.length} records.`);
        } else {
          // Roster Import
          const aoa = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
          setMessage(`Processing horizontal matrix of ${aoa.length} rows...`);
          
          const rosterRecords = await processRosterUpload(aoa);
          setMessage(`Generated ${rosterRecords.length} normalized assignments...`);

          // Map shift codes to shift IDs if possible, or use standard mapping
          const newAssignments: ShiftAssignment[] = rosterRecords.map(r => {
            // Find shift in master data if possible
            let shiftId = '';
            const matchingShift = settings.shifts?.find(s => 
              s.name.toUpperCase() === r.shiftCode || 
              s.name.toUpperCase().includes(r.shiftCode) ||
              s.id === r.shiftCode ||
              (s.startTime === r.shiftIn && s.endTime === r.shiftOut)
            );

            if (matchingShift) {
              shiftId = matchingShift.id;
            } else if (r.shiftCode === 'DO' || r.shiftCode === 'OFF') {
              shiftId = 'OFF';
            } else if (r.shiftCode === 'G') {
              // Try to find Day Shift shift
              const dayShift = settings.shifts?.find(s => s.name.toUpperCase().includes('DAY SHIFT'));
              shiftId = dayShift ? dayShift.id : r.shiftCode;
            } else {
              // Try finding by name if the code matches ShiftMaster names in screenshot
              const commonNames: Record<string, string> = {
                'A': 'A Shift',
                'B': 'B Shift',
                'C': 'C Shift',
                'N': 'Night Shift',
                'D': 'Day Shift',
                'NIGHT': 'Night Shift',
                'DAY': 'Day Shift',
                'GSD': 'GSD Shift',
                'GSN': 'GSN Shift',
                'OFFICE': 'Office Shift'
              };
              const mappedName = commonNames[r.shiftCode] || r.shiftCode;
              const byName = settings.shifts?.find(s => s.name.toUpperCase() === mappedName.toUpperCase());
              shiftId = byName ? byName.id : (matchingShift ? matchingShift.id : r.shiftCode);
            }

            return {
              employeeId: r.employeeId,
              date: r.date,
              shiftId: shiftId
            };
          });

          if (newAssignments.length === 0) {
            throw new Error("No valid roster data extracted from sheet.");
          }

          setMessage(`Syncing ${newAssignments.length} roster assignments with database...`);
          await setShiftAssignments(newAssignments);
          
          setStatus('success');
          setMessage(`Successfully imported roster for ${newAssignments.length} employee-days.`);
          toast.success(`Roster Import Complete: ${newAssignments.length} assignments updated.`);
        }
      } catch (err: any) {
        setStatus('error');
        setMessage(err.message || 'Error processing file.');
      }
    };
    reader.onerror = () => {
      setStatus('error');
      setMessage('Error reading file.');
    };
    reader.readAsArrayBuffer(file);
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="External Data Import" 
        description="Synchronize biometric logs or shift rosters"
        icon={UploadCloud}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6">
             <div className="flex items-center justify-between mb-8">
               <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-lg">
                  <button 
                    onClick={() => { setImportType('punch'); setFile(null); setStatus('idle'); }}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                      importType === 'punch' ? "bg-white dark:bg-slate-800 text-primary shadow-sm" : "text-slate-500"
                    )}
                  >
                    <CalendarDays size={14} /> Punch Logs
                  </button>
                  <button 
                    onClick={() => { setImportType('roster'); setFile(null); setStatus('idle'); }}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                      importType === 'roster' ? "bg-white dark:bg-slate-800 text-primary shadow-sm" : "text-slate-500"
                    )}
                  >
                    <ClipboardList size={14} /> Shift Roster
                  </button>
               </div>

               <Button variant="outline" size="sm" onClick={downloadSample} className="gap-2">
                 <Download size={14} /> Sample {importType === 'punch' ? 'Punch' : 'Roster'}
               </Button>
             </div>

             {quotaExceeded && (
               <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/10 border border-red-100 dark:border-red-900/20 rounded-xl flex gap-3 items-start">
                 <AlertCircle size={18} className="text-red-600 mt-0.5" />
                 <div>
                   <p className="text-xs font-bold text-red-900 dark:text-red-400">Database Write-Lock Active</p>
                   <p className="text-[10px] text-red-700 dark:text-red-500 mt-1">You have reached the daily write limit. Importing new records is disabled.</p>
                 </div>
               </div>
             )}

             <div 
               className={cn(
                 "border-2 border-dashed rounded-xl p-12 text-center transition-all",
                 isDragging ? "border-primary bg-primary/5" : "border-slate-200 dark:border-slate-800 hover:border-primary/50 bg-slate-50/50 dark:bg-slate-900/50",
                 quotaExceeded && "opacity-50 grayscale cursor-not-allowed"
               )}
               onDragOver={(e) => { e.preventDefault(); if (!quotaExceeded) setIsDragging(true); }}
               onDragLeave={() => setIsDragging(false)}
               onDrop={(e) => {
                 e.preventDefault();
                 setIsDragging(false);
                 if (quotaExceeded) return;
                 if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                   setFile(e.dataTransfer.files[0]);
                   setStatus('idle');
                 }
               }}
             >
                <div className="w-16 h-16 bg-white dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm border border-slate-100 dark:border-slate-800">
                  <UploadCloud size={24} className="text-slate-400" />
                </div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1">
                  {file ? file.name : `Drag & drop ${importType === 'punch' ? 'punch' : 'roster'} file`}
                </h3>
                <p className="text-[10px] text-slate-500 font-medium mb-6 uppercase tracking-widest">
                  {file ? `${(file.size / 1024).toFixed(1)} KB` : 'Excel (.xlsx, .xls) or CSV supported'}
                </p>

                <input 
                  type="file" 
                  id="file-upload" 
                  className="hidden" 
                  accept=".xlsx, .xls, .csv" 
                  onChange={handleFileChange}
                  disabled={quotaExceeded}
                />
                <label 
                  htmlFor="file-upload" 
                  className={cn(
                    "inline-flex items-center px-6 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all cursor-pointer",
                    quotaExceeded ? "bg-slate-100 text-slate-400" : "bg-primary text-white hover:bg-primary-dark shadow-lg shadow-primary/20"
                  )}
                >
                  {file ? 'Change File' : 'Select File'}
                </label>
             </div>

             {status !== 'idle' && (
               <div className={cn(
                 "mt-6 p-4 rounded-xl flex items-center gap-3 border",
                 status === 'processing' ? "bg-primary/5 border-primary/10 text-primary" :
                 status === 'success' ? "bg-success/5 border-success/10 text-success" :
                 "bg-red-50 dark:bg-red-900/10 border-red-100 dark:border-red-900/20 text-red-600"
               )}>
                 {status === 'processing' ? <Loader2 size={16} className="animate-spin" /> : 
                  status === 'success' ? <CheckCircle2 size={16} /> : <AlertCircle size={16} />}
                 <span className="text-[10px] font-bold uppercase tracking-widest">{message}</span>
               </div>
             )}

             <div className="flex items-center justify-end gap-3 mt-8 pt-6 border-t border-slate-100 dark:border-slate-800">
                <Button variant="outline" onClick={() => { setFile(null); setStatus('idle'); }} disabled={status === 'processing'}>
                  Clear
                </Button>
                <Button 
                  onClick={processFile} 
                  disabled={!file || status === 'processing' || status === 'success' || quotaExceeded}
                  className="px-8"
                >
                  {status === 'processing' ? 'Processing...' : 'Upload & Process'}
                </Button>
             </div>
          </Card>

          {importType === 'punch' && (
            <Card className="p-0 overflow-hidden">
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                   <History size={16} className="text-slate-400" />
                   <h3 className="text-[11px] font-bold text-slate-900 dark:text-white uppercase tracking-widest">Import History</h3>
                </div>
                <div className="flex bg-slate-100 dark:bg-slate-900 p-0.5 rounded-lg">
                  <button 
                    onClick={() => setViewMode('sessions')}
                    className={cn(
                      "px-3 py-1 rounded-md text-[9px] font-bold uppercase tracking-widest transition-all",
                      viewMode === 'sessions' ? "bg-white dark:bg-slate-800 text-primary shadow-sm" : "text-slate-500"
                    )}
                  >
                    Sessions
                  </button>
                  <button 
                    onClick={() => setViewMode('recent')}
                    className={cn(
                      "px-3 py-1 rounded-md text-[9px] font-bold uppercase tracking-widest transition-all",
                      viewMode === 'recent' ? "bg-white dark:bg-slate-800 text-primary shadow-sm" : "text-slate-500"
                    )}
                  >
                    Recent
                  </button>
                </div>
              </div>

              {viewMode === 'sessions' ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                        <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">File Info</th>
                        <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Format</th>
                        <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Records</th>
                        <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {sessions.map((s) => (
                        <tr key={s.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                          <td className="px-6 py-4">
                            <div className="flex flex-col">
                              <span className="text-xs font-bold text-slate-900 dark:text-white truncate max-w-[200px]" title={s.fileName}>{s.fileName}</span>
                              <span className="text-[10px] text-slate-500 font-medium">{format(parseISO(s.date), 'dd MMM yyyy HH:mm')}</span>
                            </div>
                          </td>
                          <td className="px-6 py-4">
                            <Badge variant="info" className="text-[9px] uppercase">{s.format}</Badge>
                          </td>
                          <td className="px-6 py-4 text-center">
                            <span className="text-xs font-bold text-slate-900 dark:text-white">{s.count}</span>
                          </td>
                          <td className="px-6 py-4 text-right">
                             <div className="flex items-center justify-end gap-1">
                               <Button 
                                 variant="outline" 
                                 size="sm" 
                                 onClick={() => {
                                   const batchPunches = punches.filter(p => p.importId === s.id);
                                   const ws = XLSX.utils.json_to_sheet(batchPunches);
                                   const wb = XLSX.utils.book_new();
                                   XLSX.utils.book_append_sheet(wb, ws, "Punches");
                                   XLSX.writeFile(wb, `Import_${s.id}.xlsx`);
                                 }}
                               >
                                 <Download size={12} />
                               </Button>
                               <Button 
                                 variant="danger" 
                                 size="sm" 
                                 onClick={async () => {
                                   if (window.confirm(`Delete batch with ${s.count} records?`)) {
                                     await deletePunchBatch(s.id);
                                     toast.success("Batch deleted");
                                   }
                                 }}
                               >
                                 <Trash2 size={12} />
                               </Button>
                             </div>
                          </td>
                        </tr>
                      ))}
                      {sessions.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-12 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">No sessions found</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                        <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Employee</th>
                        <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Punch Time</th>
                        <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {sortedPunches.map((p) => {
                        const emp = employees.find(e => e.id === p.employeeId);
                        return (
                          <tr key={p.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                            <td className="px-6 py-4">
                              <div className="flex flex-col">
                                <span className="text-xs font-bold text-slate-900 dark:text-white">{emp?.name || 'Unregistered'}</span>
                                <span className="text-[10px] text-primary font-bold">{p.employeeId}</span>
                              </div>
                            </td>
                            <td className="px-6 py-4">
                              <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{format(parseISO(p.punchDatetime), 'dd MMM yyyy HH:mm:ss')}</span>
                            </td>
                            <td className="px-6 py-4 text-right">
                               <Button 
                                 variant="danger" 
                                 size="sm" 
                                 onClick={async () => {
                                   if (window.confirm("Delete this individual record?")) {
                                     await deletePunch(p.id);
                                     toast.success("Record deleted");
                                   }
                                 }}
                               >
                                 <Trash2 size={12} />
                               </Button>
                            </td>
                          </tr>
                        );
                      })}
                      {sortedPunches.length === 0 && (
                        <tr>
                          <td colSpan={3} className="py-12 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">No recent records</td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </div>

        <div className="lg:col-span-1 space-y-6">
          <Card className="p-6">
            <h3 className="text-[11px] font-bold text-slate-900 dark:text-white uppercase tracking-widest mb-6 flex items-center gap-2">
               <Database size={14} className="text-primary" />
               Storage Management
            </h3>
            <div className="space-y-4">
               <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Logs</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{punches.length}</p>
               </div>
               
               <Button 
                 variant="danger" 
                 className="w-full gap-2"
                 onClick={() => setIsConfirmingPurge(true)}
                 disabled={quotaExceeded || punches.length === 0}
               >
                 <Trash2 size={14} /> Purge Database
               </Button>
               <p className="text-[9px] text-slate-500 text-center font-medium leading-relaxed italic">
                 This will permanently delete all biometric logs across all employees and import sessions.
               </p>
            </div>
          </Card>

          <Card className="p-6">
             <h3 className="text-[11px] font-bold text-slate-900 dark:text-white uppercase tracking-widest mb-6 flex items-center gap-2">
               <Info size={14} className="text-primary" />
               Import Logic
             </h3>
             <div className="space-y-4">
                <div className="flex gap-3">
                   <div className="w-5 h-5 rounded bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">1</div>
                   <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                     <span className="font-bold text-slate-900 dark:text-white">Validation:</span> The system strictly validates Employee ID against the master directory.
                   </p>
                </div>
                <div className="flex gap-3">
                   <div className="w-5 h-5 rounded bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">2</div>
                   <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                     <span className="font-bold text-slate-900 dark:text-white">Deduplication:</span> Repeated imports of the same punch for the same employee are automatically ignored.
                   </p>
                </div>
                <div className="flex gap-3">
                   <div className="w-5 h-5 rounded bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">3</div>
                   <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                     <span className="font-bold text-slate-900 dark:text-white">Timezones:</span> All logs are processed and stored in UTC but displayed in your local browser timezone.
                   </p>
                </div>
             </div>
          </Card>
        </div>
      </div>

      {isConfirmingPurge && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 mb-4 text-red-600">
              <AlertCircle size={24} />
              <h4 className="text-lg font-bold">Purge Database</h4>
            </div>
            <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed mb-4">
              You are about to wipe <span className="font-bold text-red-600 uppercase">all {punches.length} logs</span>. This action is final.
            </p>
            
            <form onSubmit={(e) => { e.preventDefault(); handleConfirmPurge(); }}>
              <div className="space-y-2 mb-6">
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1">
                  Type <span className="text-red-600 font-bold">DELETE</span> to confirm
                </label>
                <Input 
                  autoFocus
                  disabled={isPurging}
                  placeholder="Type DELETE"
                  value={purgeConfirmationInput}
                  onChange={(e) => setPurgeConfirmationInput(e.target.value)}
                  className="text-center font-bold tracking-widest uppercase"
                />
              </div>

              {isPurging && (
                <div className="mb-6 p-3 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 rounded-xl flex items-center gap-3">
                  <Loader2 className="animate-spin text-red-600 shrink-0" size={20} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold text-red-700 dark:text-red-300">
                      Purging Database...
                    </p>
                    <p className="text-[11px] font-mono text-red-600 dark:text-red-400 truncate">
                      {purgeProgressMessage || "Deleting logs in batches..."}
                    </p>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <Button 
                  type="button"
                  variant="outline" 
                  className="flex-1"
                  disabled={isPurging}
                  onClick={() => {
                    setIsConfirmingPurge(false);
                    setPurgeConfirmationInput('');
                  }}
                >
                  Cancel
                </Button>
                <Button 
                  type="submit"
                  variant="danger" 
                  className="flex-1 gap-2"
                  disabled={purgeConfirmationInput.trim().toUpperCase() !== 'DELETE' || isPurging}
                >
                  {isPurging ? (
                    <>
                      <Loader2 size={14} className="animate-spin" />
                      Purging...
                    </>
                  ) : (
                    'Confirm Purge'
                  )}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
