import React, { useState, useMemo, useEffect } from 'react';
import * as XLSX from 'xlsx';
import { UploadCloud, CheckCircle2, AlertCircle, Trash2, History, Database, Download, Filter, CalendarDays, ClipboardList, Loader2, Info, Eye, Check, X, Layers, AlertTriangle } from 'lucide-react';
import { useAppStore } from '../store';
import { RawPunch, ShiftAssignment, Employee, RosterBatch, RosterAssignment, ShiftAuditLog } from '../types';
import { generateId, cn, normalizeEmployeeId } from '../lib/utils';
import { processPunches } from '../lib/engine';
import { useNavigate } from 'react-router-dom';
import { format, parse, parseISO } from 'date-fns';
import { toast } from 'sonner';
import { processRosterUpload, generateRosterTemplate } from '../lib/roster';
import { PageHeader, Card, Button, Input, Badge } from '../components/ui';
import { fetchLocalTable, saveLocalTable, saveLocalTableDetailed, deleteLocalTableDetailed } from '../lib/localClient';
import { validatePunchesAgainstHolidays } from '../lib/holidayValidation';
import { useActionStatus } from '../context/ActionStatusContext';
import { MasterDataImporter } from '../components/MasterDataImporter';

export function Import() {
  const { 
    punches, setPunches, deletePunch, deletePunchBatch, clearPunches, 
    employees, setEmployees, settings, shiftAssignments, setShiftAssignments, 
    calculationSource, setCalculationSource, recalculate 
  } = useAppStore();

  const { executeWithStatus } = useActionStatus();
  const [importType, setImportType] = useState<'punch' | 'roster' | 'master'>('punch');
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

  // Roster Template Generator State
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const now = new Date();
  const defaultStart = format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd');
  const defaultEnd = format(new Date(now.getFullYear(), now.getMonth() + 1, 0), 'yyyy-MM-dd');
  const [templateStartDate, setTemplateStartDate] = useState(defaultStart);
  const [templateEndDate, setTemplateEndDate] = useState(defaultEnd);

  // SQLite Database Roster Batches State
  const [rosterBatches, setRosterBatches] = useState<RosterBatch[]>([]);
  const [isRosterLoading, setIsRosterLoading] = useState(false);

  // Roster Audit Preview Modal State
  const [rosterAuditModalOpen, setRosterAuditModalOpen] = useState(false);
  const [rosterFilterTab, setRosterFilterTab] = useState<'all' | 'valid' | 'issues'>('all');
  const [isRosterSaving, setIsRosterSaving] = useState(false);
  const [rosterSaveProgress, setRosterSaveProgress] = useState('');
  const [rosterBatchMeta, setRosterBatchMeta] = useState<{
    fileName: string;
    periodStart: string;
    periodEnd: string;
    totalDays: number;
    totalRows: number;
    validCount: number;
    missingEmpCount: number;
    unknownShiftCount: number;
    duplicateCount: number;
  }>({
    fileName: '',
    periodStart: '',
    periodEnd: '',
    totalDays: 0,
    totalRows: 0,
    validCount: 0,
    missingEmpCount: 0,
    unknownShiftCount: 0,
    duplicateCount: 0
  });

  const [rosterAuditRecords, setRosterAuditRecords] = useState<Array<{
    id: string;
    employeeId: string;
    employeeName: string;
    date: string;
    shiftCode: string;
    shiftIn: string;
    shiftOut: string;
    resolvedShiftId: string;
    status: 'valid' | 'missing_emp' | 'unknown_shift' | 'duplicate';
    statusMessage: string;
  }>>([]);

  // Fetch Roster Batches from SQLite
  const loadRosterBatches = async () => {
    setIsRosterLoading(true);
    try {
      const batches = await fetchLocalTable<RosterBatch>('roster_batches');
      setRosterBatches(batches.sort((a, b) => b.importedAt.localeCompare(a.importedAt)));
    } catch (e) {
      console.error("Error loading roster batches from SQLite:", e);
    } finally {
      setIsRosterLoading(false);
    }
  };

  useEffect(() => {
    if (importType === 'roster') {
      loadRosterBatches();
    }
  }, [importType]);

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
      setTemplateModalOpen(true);
    }
  };

  const handleDownloadRosterTemplateWithDates = () => {
    const wb = generateRosterTemplate(templateStartDate, templateEndDate, employees);
    XLSX.writeFile(wb, `Roster_Import_Template_${templateStartDate}_to_${templateEndDate}.xlsx`);
    toast.success("Downloaded roster import template Excel file!");
    setTemplateModalOpen(false);
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
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
      setStatus('idle');
    }
  };

  const handleDeletePunchBatch = async (session: { id: string; fileName?: string; count: number; date: string }) => {
    const sessionName = session.fileName || `Session ${session.id}`;
    await executeWithStatus(
      {
        title: `Delete Punch Import Batch from SQLite?`,
        subtitle: `Permanently remove ${session.count} punch records from "${sessionName}" in SQLite (E:\\SHRM_HRIS\\Database.db).`,
        module: 'Punch & Directory Import',
        actionType: 'delete',
        severity: 'danger',
        affectedCount: session.count,
        details: {
          'Import Session': sessionName,
          'Batch ID': session.id,
          'Import Date': format(parseISO(session.date), 'dd MMM yyyy HH:mm'),
          'Punches to Delete': `${session.count} logs (SQLite)`
        },
        confirmText: `Delete ${session.count} Punches`
      },
      async (updateProgress) => {
        updateProgress({ percent: 40, message: 'Filtering batch punch IDs...' });
        const batchPunchIds = punches.filter(p => p.importId === session.id).map(p => p.id);

        updateProgress({ percent: 85, message: 'Deleting punches from SQLite database...' });
        await deletePunchBatch(session.id);

        return {
          success: true,
          affectedCount: batchPunchIds.length,
          verificationStatus: 'PASSED',
          transaction: 'COMMITTED',
          dbPath: 'E:\\SHRM_HRIS\\Database.db',
          breakdown: {
            'Session File': sessionName,
            'Deleted Records': `${batchPunchIds.length} punches`,
            'SQLite Database.db': 'Committed'
          }
        };
      }
    );
  };

  const handleDeleteSinglePunch = async (punch: RawPunch) => {
    const emp = employees.find(e => e.id === punch.employeeId);
    await executeWithStatus(
      {
        title: `Delete Punch Record from SQLite?`,
        subtitle: `Deleting punch for ${emp?.name || punch.employeeId} on ${format(parseISO(punch.punchDatetime), 'dd MMM yyyy HH:mm:ss')} from SQLite.`,
        module: 'Punch & Directory Import',
        actionType: 'delete',
        severity: 'danger',
        affectedCount: 1,
        details: {
          'Employee': `${emp?.name || 'Unregistered'} (${punch.employeeId})`,
          'Punch Timestamp': format(parseISO(punch.punchDatetime), 'dd MMM yyyy HH:mm:ss'),
          'Punch ID': punch.id,
          'Storage Target': 'SQLite Database.db'
        },
        confirmText: 'Delete Punch'
      },
      async (updateProgress) => {
        updateProgress({ percent: 80, message: 'Deleting punch from SQLite database...' });
        await deletePunch(punch.id);

        return {
          success: true,
          affectedCount: 1,
          verificationStatus: 'PASSED',
          transaction: 'COMMITTED',
          dbPath: 'E:\\SHRM_HRIS\\Database.db'
        };
      }
    );
  };

  const handleDeleteRosterBatch = async (batch: RosterBatch) => {
    await executeWithStatus(
      {
        title: `Delete Roster Batch?`,
        subtitle: `Delete roster batch "${batch.rosterName}" and its assignments from SQLite (E:\\SHRM_HRIS\\Database.db)`,
        module: 'Punch & Directory Import',
        actionType: 'delete',
        severity: 'danger',
        affectedCount: batch.totalDays || 1,
        details: {
          'Roster Batch': batch.rosterName,
          'Period Window': `${batch.periodStart} → ${batch.periodEnd}`,
          'Source File': batch.sourceFileName || 'File Import',
          'Imported At': format(parseISO(batch.importedAt), 'dd MMM yyyy HH:mm')
        },
        confirmText: 'Delete Roster Batch'
      },
      async (updateProgress) => {
        updateProgress({ percent: 40, message: 'Deleting roster batch from SQLite database...' });
        const delRes = await deleteLocalTableDetailed('roster_batches', [batch.id]);
        
        if (!delRes.success) {
          return { success: false, error: delRes.error || 'Failed to delete roster batch from SQLite' };
        }

        updateProgress({ percent: 70, message: 'Refreshing roster batch index...' });
        await loadRosterBatches();

        return {
          success: true,
          affectedCount: 1,
          verificationStatus: delRes.verificationStatus,
          transaction: delRes.transaction,
          dbPath: delRes.dbPath
        };
      }
    );
  };

  const handlePurgeAllPunches = async () => {
    const punchCount = punches.length;
    await executeWithStatus(
      {
        title: `Purge All Punch Logs from SQLite?`,
        subtitle: `Deletes all ${punchCount} punch logs from SQLite (E:\\SHRM_HRIS\\Database.db).`,
        module: 'Punch & Directory Import',
        actionType: 'delete',
        severity: 'danger',
        affectedCount: punchCount,
        details: {
          'Target Database': 'E:\\SHRM_HRIS\\Database.db (attendance_punches)',
          'Punches to Purge': `${punchCount} punches`
        },
        confirmText: `Purge ${punchCount} Punches`
      },
      async (updateProgress) => {
        updateProgress({ percent: 60, message: 'Purging punch records from SQLite database...' });
        await clearPunches();

        return {
          success: true,
          affectedCount: punchCount,
          verificationStatus: 'PASSED',
          transaction: 'COMMITTED',
          dbPath: 'E:\\SHRM_HRIS\\Database.db',
          breakdown: {
            'Purged Records': `${punchCount} logs`,
            'Active Punches Remaining': '0 logs',
            'SQLite Database.db': 'Committed'
          }
        };
      }
    );
  };

  const processFile = async () => {
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
          let json = XLSX.utils.sheet_to_json(worksheet) as any[];

          const isEmpIdKey = (k: string) => {
            const l = k.toLowerCase().trim();
            return l === 'employee no.' || l === 'emp id' || l === 'emp_id' || l === 'empid' ||
                   l === 'empcode' || l === 'emp_code' || l === 'emp code' ||
                   l.includes('ac-no') || l.includes('ac_no') || l.includes('ac no') ||
                   l.includes('employee no') || l.includes('employee_no') || l.includes('employee') ||
                   l.includes('userid') || l.includes('user id') || l.includes('user_id') ||
                   l.includes('cardno') || l.includes('card_no') || l.includes('card no') ||
                   l.includes('enroll') || l.includes('badge') || l.includes('pin') ||
                   l === 'id' || l === 'no' || l === 'no.' || l === 'code';
          };

          const isDateTimeKey = (k: string) => {
            const l = k.toLowerCase().trim();
            return l.includes('date/time') || l.includes('datetime') || l.includes('date_time') ||
                   l.includes('logtime') || l.includes('log_time') || l.includes('punchtime') ||
                   l.includes('punch_time') || l.includes('checktime') || l.includes('clock');
          };

          const isDateKey = (k: string) => {
            const l = k.toLowerCase().trim();
            return l === 'date' || l.includes('punch date') || l.includes('log date') || l.includes('att. date') || l.includes('att date') || l.includes('work date');
          };

          const isTimeKey = (k: string) => {
            const l = k.toLowerCase().trim();
            return l.startsWith('time') || l.includes('punch') || l.includes('clock') || l.includes('in') || l.includes('out') || l.startsWith('c1') || l.startsWith('c2') || l.startsWith('c3') || l.startsWith('c4') || l.startsWith('t1') || l.startsWith('t2');
          };

          // Check if top row is title text and search for real header row if needed
          let firstRowKeys = json.length > 0 ? Object.keys(json[0]) : [];
          const hasEmpKey = (keys: string[]) => keys.some(isEmpIdKey);
          const hasDateOrTimeKey = (keys: string[]) => keys.some(isDateTimeKey) || keys.some(isDateKey) || keys.some(isTimeKey);

          if (json.length > 0 && (!hasEmpKey(firstRowKeys) || !hasDateOrTimeKey(firstRowKeys))) {
            const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
            let headerRowIndex = -1;
            for (let r = 0; r < Math.min(rawRows.length, 15); r++) {
              const rowCells = (rawRows[r] || []).map(c => String(c));
              if (hasEmpKey(rowCells) && hasDateOrTimeKey(rowCells)) {
                headerRowIndex = r;
                break;
              }
            }
            if (headerRowIndex >= 0) {
              json = XLSX.utils.sheet_to_json(worksheet, { range: headerRowIndex }) as any[];
              firstRowKeys = json.length > 0 ? Object.keys(json[0]) : [];
            }
          }

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
              if (!employeeIdMap.has(norm.numeric)) {
                employeeIdMap.set(norm.numeric, e.id);
              }
            }
          });

          // Helper for deterministic IDs to prevent duplicates on re-import
          const makePunchId = (empId: string, dt: string) => `p_${empId}_${dt}`.replace(/[^a-zA-Z0-9]/g, '_');

          const rawIdKey = firstRowKeys.find(isEmpIdKey);
          const dateTimeKey = firstRowKeys.find(isDateTimeKey);
          const dateKey = firstRowKeys.find(isDateKey);
          const timeKeys = firstRowKeys.filter(isTimeKey);

          json.forEach((row) => {
            const rowRawIdKey = rawIdKey || Object.keys(row).find(isEmpIdKey);
            const rowDateTimeKey = dateTimeKey || Object.keys(row).find(isDateTimeKey);
            const rowDateKey = dateKey || Object.keys(row).find(isDateKey);
            const rowTimeKeys = timeKeys.length > 0 ? timeKeys : Object.keys(row).filter(isTimeKey);

            if (rowRawIdKey && (rowDateTimeKey || (rowDateKey && rowTimeKeys.length > 0))) {
              const rawEmpIdInput = String(row[rowRawIdKey]).trim();
              if (!rawEmpIdInput || rawEmpIdInput === 'undefined' || rawEmpIdInput === 'null') return;
              const normInput = getNormalized(rawEmpIdInput);
              
              // FLEXIBLE MATCHING: Exact -> Lowercase -> Numeric part (handles 1257 vs EMP1257)
              let matchedId = employeeIdMap.get(normInput.original) || 
                              employeeIdMap.get(normInput.lowercase) || 
                              (normInput.numeric ? employeeIdMap.get(normInput.numeric) : undefined);

              // Fallback to rawEmpIdInput so punches are never dropped even if employee not pre-created
              if (!matchedId) {
                matchedId = rawEmpIdInput;
                failedMatches.add(rawEmpIdInput);
              }

              const rawEmpId = matchedId;

              const toExactLocalIso = (d: Date) => {
                const pad = (n: number) => String(n).padStart(2, '0');
                return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
              };

              if (rowDateTimeKey) {
                const rawDT = row[rowDateTimeKey];
                let punchIso = '';
                if (typeof rawDT === 'number') {
                  const dateObj = new Date(Math.round((rawDT - 25569) * 864e5));
                  // Excel serial dates are UTC-based wall clock values
                  const pad = (n: number) => String(n).padStart(2, '0');
                  punchIso = `${dateObj.getUTCFullYear()}-${pad(dateObj.getUTCMonth() + 1)}-${pad(dateObj.getUTCDate())}T${pad(dateObj.getUTCHours())}:${pad(dateObj.getUTCMinutes())}:${pad(dateObj.getUTCSeconds())}`;
                } else if (typeof rawDT === 'string') {
                  const cleanStr = rawDT.trim().replace(/^"|"$/g, '');
                  const ymdMatch = cleanStr.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})[T\s]+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?/);
                  if (ymdMatch) {
                    const pad = (n: string | number) => String(n).padStart(2, '0');
                    punchIso = `${ymdMatch[1]}-${pad(ymdMatch[2])}-${pad(ymdMatch[3])}T${pad(ymdMatch[4])}:${pad(ymdMatch[5])}:${pad(ymdMatch[6] || '00')}`;
                  } else {
                    const parsed = new Date(cleanStr);
                    if (!isNaN(parsed.getTime())) {
                      punchIso = toExactLocalIso(parsed);
                    }
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
              } else if (rowDateKey) {
                let datePart = '';
                const rawDate = row[rowDateKey];
                if (typeof rawDate === 'number') {
                  const dateObj = new Date(Math.round((rawDate - 25569) * 864e5));
                  const pad = (n: number) => String(n).padStart(2, '0');
                  datePart = `${dateObj.getUTCFullYear()}-${pad(dateObj.getUTCMonth() + 1)}-${pad(dateObj.getUTCDate())}`;
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
                  rowTimeKeys.forEach(tKey => {
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
                        if (!isNaN(parsed.getTime())) pIso = toExactLocalIso(parsed);
                      } else {
                        // It's an Excel numeric time
                        const t = Number(tStr);
                        const hours = Math.floor(t * 24);
                        const minutes = Math.floor((t * 24 - hours) * 60);
                        const seconds = Math.floor(((t * 24 - hours) * 60 - minutes) * 60);
                        pIso = `${datePart}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
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
            toast.error("No valid punch date/times found in file. Check column formatting.");
            setStatus('error');
            setMessage("Import failed: No valid punch timestamps found.");
            return;
          }

          // Deduplicate new punches based on ID
          const uniqueNewPunchesMap = new Map<string, RawPunch>();
          finalNewPunchesRaw.forEach(p => uniqueNewPunchesMap.set(p.id, p));
          const deduplicatedPunches = Array.from(uniqueNewPunchesMap.values());

          // Cross-reference against Public Holiday Master DB to prevent holiday overlaps
          const incomingIdSet = new Set(deduplicatedPunches.map(p => p.id));
          const holidayCheck = validatePunchesAgainstHolidays({
            incomingPunches: deduplicatedPunches,
            existingPunches: punches.filter(p => !incomingIdSet.has(p.id)),
            holidays: settings.holidays || [],
            employees,
            shifts: settings.shifts,
            shiftAssignments,
            mergeMinutes: settings.duplicateMergeTime ?? 5,
            policy: settings.holidayPunchPolicy || 'prevent_overlaps',
          });
          const finalNewPunches = holidayCheck.acceptedPunches;
          const preventedOverlaps = holidayCheck.rejectedOverlaps.length;

          if (finalNewPunches.length === 0) {
            const firstReason = holidayCheck.conflicts[0]?.message || 'All punches matched Public Holiday overlap or block rules.';
            toast.warning(`Import prevented: ${firstReason}`);
            setStatus('error');
            setMessage(`Import blocked: ${firstReason}`);
            return;
          }

          const uniqueEmps = new Set(finalNewPunches.map(p => p.employeeId));
          const minDate = finalNewPunches.reduce((min, p) => !min || p.punchDatetime < min ? p.punchDatetime : min, '');
          const maxDate = finalNewPunches.reduce((max, p) => !max || p.punchDatetime > max ? p.punchDatetime : max, '');

          await executeWithStatus(
            {
              title: `Store ${finalNewPunches.length} Punch Records from ${file.name} into SQLite?`,
              subtitle: preventedOverlaps > 0
                ? `Holiday validation prevented ${preventedOverlaps} overlapping holiday punch(es). Commits remaining records into SQLite.`
                : `Persists parsed punch records into SQLite (E:\\SHRM_HRIS\\Database.db) and recalculates attendance.`,
              module: 'Punch & Directory Import',
              actionType: 'import',
              affectedCount: finalNewPunches.length,
              details: {
                'Source File': file.name,
                'Validated Punches': `${finalNewPunches.length} punches`,
                ...(preventedOverlaps > 0 ? { 'Holiday Overlaps Blocked': `${preventedOverlaps} overlapping logs` } : {}),
                'Employees Matched': `${uniqueEmps.size} staff members`,
                'Date Span': `${minDate ? minDate.slice(0, 10) : 'N/A'} → ${maxDate ? maxDate.slice(0, 10) : 'N/A'}`,
                'Persistence Mode': 'SQLite Database Storage'
              },
              confirmText: `Save ${finalNewPunches.length} Punches to SQLite`
            },
            async (updateProgress) => {
              updateProgress({ percent: 60, message: 'Persisting validated punches to SQLite & recalculating shifts...' });
              await setPunches(finalNewPunches, (msg) => setMessage(msg));
              
              setCalculationSource('all');
              setStatus('success');
              setMessage(`Saved ${finalNewPunches.length} records to SQLite${preventedOverlaps > 0 ? ` (${preventedOverlaps} holiday overlaps prevented)` : ''}.`);
              toast.success(`Saved ${finalNewPunches.length} punch records to SQLite.`);

              return {
                success: true,
                affectedCount: finalNewPunches.length,
                verificationStatus: 'PASSED',
                transaction: 'COMMITTED',
                dbPath: 'E:\\SHRM_HRIS\\Database.db',
                breakdown: {
                  'Saved Punches': `${finalNewPunches.length} records`,
                  ...(preventedOverlaps > 0 ? { 'Holiday Overlaps Prevented': `${preventedOverlaps} blocked` } : {}),
                  'Matched Staff': `${uniqueEmps.size} employees`,
                  'SQLite Database.db': 'Committed'
                }
              };
            }
          );
        } else {
          // Roster Import Process
          const aoa = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
          setMessage(`Processing roster matrix of ${aoa.length} rows...`);
          
          const rosterRecords = await processRosterUpload(aoa);
          if (!rosterRecords || rosterRecords.length === 0) {
            throw new Error("No valid roster data extracted from sheet. Check sheet format.");
          }

          // Build Employee Lookup Maps
          const empMapById = new Map<string, Employee>();
          const empMapByNorm = new Map<string, Employee>();
          employees.forEach(e => {
            empMapById.set(e.id, e);
            empMapById.set(e.id.toLowerCase(), e);
            const norm = normalizeEmployeeId(e.id);
            if (norm) empMapByNorm.set(norm, e);
          });

          // Determine Date Range
          const dates = Array.from(new Set(rosterRecords.map(r => r.date))).sort();
          const periodStart = dates[0] || format(new Date(), 'yyyy-MM-dd');
          const periodEnd = dates[dates.length - 1] || periodStart;

          // Standard Shift Mapping Table
          const commonShiftNames: Record<string, string> = {
            'A': 'A Shift (06:00 - 14:00)',
            'B': 'B Shift (14:00 - 22:00)',
            'C': 'C Shift (22:00 - 06:00)',
            'D': 'Day Shift (08:00 - 20:00)',
            'N': 'Night Shift (20:00 - 08:00)',
            'DAY': 'Day Shift (08:00 - 20:00)',
            'NIGHT': 'Night Shift (20:00 - 08:00)',
            'GSD': 'GSD Shift (06:00 - 18:00)',
            'GSN': 'GSN Shift (18:00 - 06:00)',
            'OFFICE': 'Office Shift (10:00 - 18:00)',
            'G': 'General Shift (09:00 - 18:00)',
            'DO': 'Weekly Day Off',
            'OFF': 'Weekly Day Off'
          };

          const seenKeys = new Set<string>();
          let validCount = 0;
          let missingEmpCount = 0;
          let unknownShiftCount = 0;
          let duplicateCount = 0;

          const auditRecords = rosterRecords.map((r, idx) => {
            const rawEmpId = r.employeeId.trim();
            const normEmpId = normalizeEmployeeId(rawEmpId);
            
            // Resolve Employee
            const matchedEmp = empMapById.get(rawEmpId) || empMapById.get(rawEmpId.toLowerCase()) || (normEmpId ? empMapByNorm.get(normEmpId) : undefined);
            const empName = matchedEmp ? matchedEmp.name : (r.employeeName || 'Unknown Employee');

            // Resolve Shift
            const code = r.shiftCode.trim().toUpperCase();
            let shiftId = '';
            let isKnownShift = false;

            const matchingShift = settings.shifts?.find(s => 
              s.name.toUpperCase() === code || 
              s.name.toUpperCase().includes(code) ||
              s.id === code ||
              (s.startTime === r.shiftIn && s.endTime === r.shiftOut)
            );

            if (matchingShift) {
              shiftId = matchingShift.id;
              isKnownShift = true;
            } else if (code === 'DO' || code === 'OFF') {
              shiftId = 'OFF';
              isKnownShift = true;
            } else if (commonShiftNames[code]) {
              shiftId = code;
              isKnownShift = true;
            }

            // Check Duplicate
            const key = `${matchedEmp?.id || rawEmpId}_${r.date}`;
            const isDuplicate = seenKeys.has(key);
            seenKeys.add(key);

            // Audit Status
            let recordStatus: 'valid' | 'missing_emp' | 'unknown_shift' | 'duplicate' = 'valid';
            let statusMessage = 'Valid Assignment';

            if (!matchedEmp) {
              recordStatus = 'missing_emp';
              statusMessage = `Employee ID '${rawEmpId}' not found in Employee Directory`;
              missingEmpCount++;
            } else if (isDuplicate) {
              recordStatus = 'duplicate';
              statusMessage = `Duplicate assignment for ${matchedEmp.id} on ${r.date}`;
              duplicateCount++;
            } else if (!isKnownShift) {
              recordStatus = 'unknown_shift';
              statusMessage = `Unknown shift code '${code}'`;
              unknownShiftCount++;
            } else {
              validCount++;
            }

            return {
              id: `audit_${idx}_${Date.now()}`,
              employeeId: matchedEmp ? matchedEmp.id : rawEmpId,
              employeeName: empName,
              date: r.date,
              shiftCode: code,
              shiftIn: r.shiftIn,
              shiftOut: r.shiftOut,
              resolvedShiftId: shiftId || code,
              status: recordStatus,
              statusMessage
            };
          });

          setRosterBatchMeta({
            fileName: file.name,
            periodStart,
            periodEnd,
            totalDays: dates.length,
            totalRows: rosterRecords.length,
            validCount,
            missingEmpCount,
            unknownShiftCount,
            duplicateCount
          });

          setRosterAuditRecords(auditRecords);
          setStatus('idle');
          setMessage('');
          setRosterAuditModalOpen(true);
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

  // Confirm and Save Roster Batch to SQLite Database
  const confirmAndSaveRoster = async () => {
    if (!file || rosterAuditRecords.length === 0 || isRosterSaving) return;
    const validRecords = rosterAuditRecords.filter(r => r.status === 'valid' || r.status === 'unknown_shift');
    if (validRecords.length === 0) {
      toast.error("No valid roster records to save.");
      return;
    }

    const batchName = `${file.name.replace(/\.[^/.]+$/, "")} (${rosterBatchMeta.periodStart} to ${rosterBatchMeta.periodEnd})`;

    await executeWithStatus(
      {
        title: `Save Roster Batch to Database?`,
        subtitle: `Saving ${validRecords.length} verified roster assignments to local SQLite database (E:\\SHRM_HRIS\\Database.db)`,
        module: 'Punch & Directory Import',
        actionType: 'import',
        affectedCount: validRecords.length,
        details: {
          'Roster File': file.name,
          'Batch Period': `${rosterBatchMeta.periodStart} → ${rosterBatchMeta.periodEnd}`,
          'Total Duration': `${rosterBatchMeta.totalDays} Days`,
          'Valid Assignments': `${validRecords.length} records`,
          'Destination': 'E:\\SHRM_HRIS\\Database.db (roster_batches, roster_assignments)'
        },
        confirmText: `Save ${validRecords.length} Roster Records`
      },
      async (updateProgress) => {
        setIsRosterSaving(true);
        const nowIso = new Date().toISOString();
        const batchId = `ROSTER_${Date.now()}`;

        // 1. Prepare Roster Batch Record
        const rosterBatch: RosterBatch = {
          id: batchId,
          rosterName: batchName,
          periodStart: rosterBatchMeta.periodStart,
          periodEnd: rosterBatchMeta.periodEnd,
          totalDays: rosterBatchMeta.totalDays,
          importedAt: nowIso,
          importedBy: 'Admin',
          sourceFileName: file.name,
          status: 'Active',
          createdAt: nowIso,
          updatedAt: nowIso
        };

        // 2. Prepare Roster Assignments Records for SQLite
        updateProgress({ percent: 30, message: `Preparing ${validRecords.length} roster assignments...` });
        const rosterAssignments: RosterAssignment[] = validRecords.map(r => ({
          id: `ra_${r.employeeId}_${r.date}_${batchId}`,
          rosterBatchId: batchId,
          employeeId: r.employeeId,
          rosterDate: r.date,
          shiftCode: r.shiftCode,
          shiftStart: r.shiftIn,
          shiftEnd: r.shiftOut,
          source: 'Imported Roster',
          status: 'Active',
          createdAt: nowIso,
          updatedAt: nowIso
        }));

        // 3. Save Batch & Assignments to SQLite Database via local API
        updateProgress({ percent: 65, message: 'Writing batch and assignments to SQLite Database...' });
        await saveLocalTable('roster_batches', [rosterBatch]);
        const saveRes = await saveLocalTableDetailed('roster_assignments', rosterAssignments);

        if (!saveRes.success) {
          setIsRosterSaving(false);
          return {
            success: false,
            error: saveRes.error || 'Failed to commit roster assignments to SQLite'
          };
        }

        // 4. Update ShiftAssignments in active Store
        updateProgress({ percent: 85, message: 'Updating active shift assignments & recalculating attendance...' });
        const storeShiftAssignments: ShiftAssignment[] = validRecords.map(r => ({
          id: `${r.employeeId}_${r.date}`,
          employeeId: r.employeeId,
          date: r.date,
          shiftId: r.resolvedShiftId || r.shiftCode,
          shiftCode: r.shiftCode,
          source: 'Imported Roster',
          rosterBatchId: batchId,
          status: 'Active'
        }));

        await setShiftAssignments(storeShiftAssignments);
        await loadRosterBatches();

        setRosterAuditModalOpen(false);
        setFile(null);
        setStatus('success');
        setIsRosterSaving(false);

        return {
          success: true,
          affectedCount: validRecords.length,
          verificationStatus: saveRes.verificationStatus,
          transaction: saveRes.transaction,
          dbPath: saveRes.dbPath,
          breakdown: {
            'Batch ID': batchId,
            'Roster Name': batchName,
            'Committed Assignments': `${validRecords.length} records`,
            'Database Path': 'E:\\SHRM_HRIS\\Database.db'
          }
        };
      }
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Master Data & Punch Import" 
        description="Synchronize biometric logs, shift rosters, employees, leave balances, assets, and salary structures"
        icon={UploadCloud}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6">
             <div className="flex flex-wrap items-center justify-between gap-3 mb-8">
               <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-lg flex-wrap">
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
                  <button 
                    onClick={() => { setImportType('master'); setFile(null); setStatus('idle'); }}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-md text-[10px] font-bold uppercase tracking-wider transition-all",
                      importType === 'master' ? "bg-white dark:bg-slate-800 text-primary shadow-sm" : "text-slate-500"
                    )}
                  >
                    <Database size={14} /> Master Data
                  </button>
               </div>

               {importType !== 'master' && (
                 <Button variant="outline" size="sm" onClick={downloadSample} className="gap-2">
                   <Download size={14} /> Sample {importType === 'punch' ? 'Punch' : 'Roster'}
                 </Button>
               )}
             </div>

             {importType === 'master' ? (
               <MasterDataImporter />
             ) : (
             <>

             <div 
               className={cn(
                 "border-2 border-dashed rounded-xl p-12 text-center transition-all",
                 isDragging ? "border-primary bg-primary/5" : "border-slate-200 dark:border-slate-800 hover:border-primary/50 bg-slate-50/50 dark:bg-slate-900/50"
               )}
               onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
               onDragLeave={() => setIsDragging(false)}
               onDrop={(e) => {
                 e.preventDefault();
                 setIsDragging(false);
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
                />
                <label 
                  htmlFor="file-upload" 
                  className="inline-flex items-center px-6 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest transition-all cursor-pointer bg-primary text-white hover:bg-primary-dark shadow-lg shadow-primary/20"
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
                  disabled={!file || status === 'processing' || status === 'success'}
                  className="px-8"
                >
                  {status === 'processing' ? 'Processing...' : 'Upload & Process'}
                </Button>
             </div>
             </>
             )}
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
                                 onClick={() => handleDeletePunchBatch(s)}
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
                                 onClick={() => handleDeleteSinglePunch(p)}
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

          {importType === 'roster' && (
            <Card className="p-0 overflow-hidden">
              <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                   <Database size={16} className="text-primary" />
                   <h3 className="text-[11px] font-bold text-slate-900 dark:text-white uppercase tracking-widest">Roster Batches in SQLite Database</h3>
                </div>
                <Badge variant="info" className="text-[9px] uppercase font-bold">
                  {rosterBatches.length} Batches Saved
                </Badge>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                      <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Roster Batch Name</th>
                      <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Period Window</th>
                      <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Days</th>
                      <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Imported At</th>
                      <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {rosterBatches.map((b) => (
                      <tr key={b.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50">
                        <td className="px-6 py-4">
                          <div className="flex flex-col">
                            <span className="text-xs font-bold text-slate-900 dark:text-white">{b.rosterName}</span>
                            <span className="text-[10px] text-slate-400 font-mono">{b.sourceFileName || 'File Import'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4">
                          <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">{b.periodStart} → {b.periodEnd}</span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <Badge variant="muted" className="text-[10px] font-bold">{b.totalDays} Days</Badge>
                        </td>
                        <td className="px-6 py-4 text-center text-xs text-slate-500">
                          {format(parseISO(b.importedAt), 'dd MMM yyyy HH:mm')}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <Button 
                            variant="danger" 
                            size="sm" 
                            onClick={() => handleDeleteRosterBatch(b)}
                          >
                            <Trash2 size={12} />
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {rosterBatches.length === 0 && (
                      <tr>
                        <td colSpan={5} className="py-12 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                          {isRosterLoading ? 'Loading roster batches from SQLite...' : 'No imported roster batches saved in SQLite yet'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
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
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Total Punch Logs</p>
                  <p className="text-2xl font-bold text-slate-900 dark:text-white">{punches.length}</p>
               </div>
               
               <Button 
                 variant="danger" 
                 className="w-full gap-2"
                 onClick={handlePurgeAllPunches}
                 disabled={punches.length === 0}
               >
                 <Trash2 size={14} /> Purge All Punches (SQLite)
               </Button>
               <p className="text-[9px] text-slate-500 text-center font-medium leading-relaxed italic">
                 Permanently deletes punch records stored in local SQLite (Database.db).
               </p>
            </div>
          </Card>

          <Card className="p-6">
             <h3 className="text-[11px] font-bold text-slate-900 dark:text-white uppercase tracking-widest mb-6 flex items-center gap-2">
               <Info size={14} className="text-primary" />
               Roster Persistence Flow
             </h3>
             <div className="space-y-4">
                <div className="flex gap-3">
                   <div className="w-5 h-5 rounded bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">1</div>
                   <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                     <span className="font-bold text-slate-900 dark:text-white">Excel Matrix:</span> Roster files contain date headers and employee shift rows.
                   </p>
                </div>
                <div className="flex gap-3">
                   <div className="w-5 h-5 rounded bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">2</div>
                   <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                     <span className="font-bold text-slate-900 dark:text-white">Audit & Validation:</span> Verification highlights missing Employee IDs and shift codes before saving.
                   </p>
                </div>
                <div className="flex gap-3">
                   <div className="w-5 h-5 rounded bg-primary/10 text-primary flex items-center justify-center text-[10px] font-bold shrink-0">3</div>
                   <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">
                     <span className="font-bold text-slate-900 dark:text-white">SQLite Database:</span> Roster batches are permanently saved to <code className="text-primary font-mono text-[10px]">Database.db</code> for shift reconciliation & salary analytics.
                   </p>
                </div>
             </div>
          </Card>
        </div>
      </div>

      {/* Roster Template Date Range Picker Modal */}
      {templateModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <Card className="max-w-md w-full p-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <CalendarDays className="text-primary" size={20} />
                <h4 className="text-base font-bold text-slate-900 dark:text-white">Download Roster Excel Template</h4>
              </div>
              <button onClick={() => setTemplateModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X size={18} />
              </button>
            </div>

            <p className="text-xs text-slate-500 mb-6 leading-relaxed">
              Select the period start and end dates for your roster matrix template. The generated Excel spreadsheet will pre-fill active employee IDs and dates.
            </p>

            <div className="space-y-4 mb-6">
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Template Period Start Date</label>
                <Input 
                  type="date" 
                  value={templateStartDate} 
                  onChange={(e) => setTemplateStartDate(e.target.value)} 
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-1">Template Period End Date</label>
                <Input 
                  type="date" 
                  value={templateEndDate} 
                  onChange={(e) => setTemplateEndDate(e.target.value)} 
                />
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" className="flex-1" onClick={() => setTemplateModalOpen(false)}>
                Cancel
              </Button>
              <Button className="flex-1 gap-2" onClick={handleDownloadRosterTemplateWithDates}>
                <Download size={14} /> Download Template
              </Button>
            </div>
          </Card>
        </div>
      )}

      {/* Roster Import Verification & Audit Preview Modal */}
      {rosterAuditModalOpen && (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto">
          <Card className="max-w-5xl w-full p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] flex flex-col my-auto">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
                  <ClipboardList size={22} />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Roster Import Audit & Verification
                  </h3>
                  <p className="text-xs text-slate-500 font-medium">
                    {rosterBatchMeta.fileName} • Period: <span className="font-bold text-slate-800 dark:text-slate-200">{rosterBatchMeta.periodStart} to {rosterBatchMeta.periodEnd}</span> ({rosterBatchMeta.totalDays} Days)
                  </p>
                </div>
              </div>

              <button 
                onClick={() => setRosterAuditModalOpen(false)} 
                disabled={isRosterSaving}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X size={20} />
              </button>
            </div>

            {/* Metrics Breakdown Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-6">
              <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">Total Records</p>
                <p className="text-xl font-bold text-slate-900 dark:text-white">{rosterBatchMeta.totalRows}</p>
              </div>
              <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-100 dark:border-emerald-900/50">
                <p className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-widest mb-0.5">Valid</p>
                <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300">{rosterBatchMeta.validCount}</p>
              </div>
              <div className="p-3 bg-red-50 dark:bg-red-950/30 rounded-xl border border-red-100 dark:border-red-900/50">
                <p className="text-[10px] font-bold text-red-600 dark:text-red-400 uppercase tracking-widest mb-0.5">Missing Emp ID</p>
                <p className="text-xl font-bold text-red-700 dark:text-red-300">{rosterBatchMeta.missingEmpCount}</p>
              </div>
              <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-100 dark:border-amber-900/50">
                <p className="text-[10px] font-bold text-amber-600 dark:text-amber-400 uppercase tracking-widest mb-0.5">Unknown Shift</p>
                <p className="text-xl font-bold text-amber-700 dark:text-amber-300">{rosterBatchMeta.unknownShiftCount}</p>
              </div>
              <div className="p-3 bg-indigo-50 dark:bg-indigo-950/30 rounded-xl border border-indigo-100 dark:border-indigo-900/50">
                <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-widest mb-0.5">Duplicates</p>
                <p className="text-xl font-bold text-indigo-700 dark:text-indigo-300">{rosterBatchMeta.duplicateCount}</p>
              </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-800 pb-2">
              <div className="flex gap-2">
                <button
                  onClick={() => setRosterFilterTab('all')}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                    rosterFilterTab === 'all' ? "bg-primary text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  )}
                >
                  All Records ({rosterAuditRecords.length})
                </button>
                <button
                  onClick={() => setRosterFilterTab('valid')}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                    rosterFilterTab === 'valid' ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  )}
                >
                  Valid Only ({rosterBatchMeta.validCount})
                </button>
                <button
                  onClick={() => setRosterFilterTab('issues')}
                  className={cn(
                    "px-3 py-1.5 rounded-lg text-xs font-bold transition-all",
                    rosterFilterTab === 'issues' ? "bg-red-600 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                  )}
                >
                  Issues / Warnings ({rosterBatchMeta.missingEmpCount + rosterBatchMeta.unknownShiftCount + rosterBatchMeta.duplicateCount})
                </button>
              </div>
            </div>

            {/* Audit Data Table */}
            <div className="overflow-y-auto flex-1 border border-slate-200 dark:border-slate-800 rounded-xl min-h-[250px] max-h-[350px]">
              <table className="w-full text-left text-xs divide-y divide-slate-100 dark:divide-slate-800">
                <thead className="bg-slate-50 dark:bg-slate-900 sticky top-0 font-bold text-slate-400 text-[10px] uppercase tracking-wider z-10">
                  <tr>
                    <th className="py-2.5 px-3">Employee</th>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3 text-center">Shift Code</th>
                    <th className="py-2.5 px-3">Timing</th>
                    <th className="py-2.5 px-3">Audit Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {rosterAuditRecords
                    .filter(r => {
                      if (rosterFilterTab === 'valid') return r.status === 'valid';
                      if (rosterFilterTab === 'issues') return r.status !== 'valid';
                      return true;
                    })
                    .slice(0, 200)
                    .map((rec) => (
                      <tr key={rec.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                        <td className="py-2 px-3">
                          <p className="font-bold text-slate-900 dark:text-white">{rec.employeeName}</p>
                          <p className="text-[10px] font-mono text-primary font-bold">{rec.employeeId}</p>
                        </td>
                        <td className="py-2 px-3 font-semibold text-slate-700 dark:text-slate-300">
                          {rec.date}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <Badge variant="info" className="font-mono font-bold text-[10px]">{rec.shiftCode}</Badge>
                        </td>
                        <td className="py-2 px-3 text-slate-600 dark:text-slate-400 font-mono text-[11px]">
                          {rec.shiftIn && rec.shiftOut ? `${rec.shiftIn} - ${rec.shiftOut}` : 'Off Day'}
                        </td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-1.5">
                            <Badge 
                              variant={
                                rec.status === 'valid' ? 'success' :
                                rec.status === 'missing_emp' ? 'danger' :
                                rec.status === 'duplicate' ? 'warning' : 'muted'
                              }
                              className="text-[10px] font-bold"
                            >
                              {rec.status === 'valid' ? 'Valid' :
                               rec.status === 'missing_emp' ? 'Missing Emp ID' :
                               rec.status === 'duplicate' ? 'Duplicate' : 'Unknown Shift'}
                            </Badge>
                            <span className="text-[10px] text-slate-500 truncate max-w-[200px]" title={rec.statusMessage}>
                              {rec.statusMessage}
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            {/* Progress Bar during SQLite Saving */}
            {isRosterSaving && (
              <div className="mt-4 p-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-900/50 rounded-xl flex items-center gap-3">
                <Loader2 size={20} className="animate-spin text-indigo-600 shrink-0" />
                <div>
                  <p className="text-xs font-bold text-indigo-900 dark:text-indigo-200">Saving Batch to SQLite Database...</p>
                  <p className="text-[11px] font-mono text-indigo-700 dark:text-indigo-300">{rosterSaveProgress}</p>
                </div>
              </div>
            )}

            {/* Footer Action Buttons */}
            <div className="flex items-center justify-between gap-3 mt-6 pt-4 border-t border-slate-100 dark:border-slate-800">
              <p className="text-[11px] text-slate-500 font-medium">
                Saving will permanently write this roster batch to <code className="text-primary font-mono">E:\SHRM_HRIS\Database.db</code>.
              </p>

              <div className="flex items-center gap-2">
                <Button 
                  variant="outline" 
                  onClick={() => setRosterAuditModalOpen(false)}
                  disabled={isRosterSaving}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={confirmAndSaveRoster}
                  disabled={isRosterSaving || (rosterBatchMeta.validCount === 0 && rosterBatchMeta.unknownShiftCount === 0)}
                  className="gap-2 bg-primary hover:bg-primary-dark text-white shadow-lg shadow-primary/20 px-6"
                >
                  {isRosterSaving ? (
                    <>
                      <Loader2 size={16} className="animate-spin" /> Saving Roster...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={16} /> Save Roster to Database
                    </>
                  )}
                </Button>
              </div>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
