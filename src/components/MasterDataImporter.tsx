import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import { UploadCloud, Download, CheckCircle2, FileSpreadsheet, Users, Wallet, CalendarRange, Laptop } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useAppStore } from '../store';
import { saveLocalTable } from '../lib/localClient';
import { generateId, cn } from '../lib/utils';
import { Button } from './ui';
import type { CompanyAsset, Employee } from '../types';

type EntityTarget = 'employees' | 'salary' | 'leave_balances' | 'assets';

const ENTITY_TABS: Array<{ key: EntityTarget; label: string; icon: any; hint: string }> = [
  { key: 'employees', label: 'Employees Master', icon: Users, hint: 'Columns: Employee ID, Name, Department, Designation, Joining Date, Email, Phone' },
  { key: 'salary', label: 'Salary Structures', icon: Wallet, hint: 'Columns: Employee ID, Basic Salary, Dearness Allowance, Other Allowance, SSF Eligible' },
  { key: 'leave_balances', label: 'Leave Balances', icon: CalendarRange, hint: 'Columns: Employee ID, Annual Quota, Sick Quota, Casual Quota' },
  { key: 'assets', label: 'Company Assets', icon: Laptop, hint: 'Columns: Asset Tag, Item Name, Category, Serial Number, Condition, Assigned Employee ID' },
];

export function MasterDataImporter() {
  const { employees, setEmployees } = useAppStore();
  const [entity, setEntity] = useState<EntityTarget>('employees');
  const [parsedRows, setParsedRows] = useState<Record<string, any>[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [isImporting, setIsImporting] = useState(false);

  const handleDownloadTemplate = () => {
    const sampleData: Record<EntityTarget, any[]> = {
      employees: [
        { 'Employee ID': '1001', Name: 'Sita Sharma', Department: 'Operations', Designation: 'Analyst', 'Joining Date': '2026-01-15', 'Weekly Off': 'Saturday', Email: 'sita@company.com', Phone: '9800000001' },
      ],
      salary: [
        { 'Employee ID': '1001', 'Basic Salary': 35000, 'Dearness Allowance': 5000, 'Other Allowance': 5000, 'SSF Eligible': 'Yes' },
      ],
      leave_balances: [
        { 'Employee ID': '1001', 'Annual Quota': 18, 'Sick Quota': 12, 'Casual Quota': 6 },
      ],
      assets: [
        { 'Asset Tag': 'AST-101', 'Item Name': 'Dell Latitude 5440', Category: 'Laptop', 'Serial Number': 'DL-99881', Condition: 'New', 'Assigned Employee ID': '1001' },
      ],
    };

    const ws = XLSX.utils.json_to_sheet(sampleData[entity]);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, entity.toUpperCase());
    XLSX.writeFile(wb, `Master_Template_${entity}_${format(new Date(), 'yyyyMMdd')}.xlsx`);
    toast.success(`Downloaded sample template for ${entity}.`);
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const wb = XLSX.read(data, { type: 'array' });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
        setParsedRows(rows);
        toast.success(`Parsed ${rows.length} rows from ${file.name}. Review and commit below.`);
      } catch {
        toast.error('Unable to parse spreadsheet. Ensure valid .xlsx or .csv format.');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const getField = (row: Record<string, any>, ...keys: string[]): string => {
    for (const k of Object.keys(row)) {
      const norm = k.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
      for (const candidate of keys) {
        if (norm === candidate.toLowerCase().replace(/[^a-z0-9]/g, '')) {
          return String(row[k] ?? '').trim();
        }
      }
    }
    return '';
  };

  const handleCommit = async () => {
    if (parsedRows.length === 0) return;
    setIsImporting(true);
    try {
      if (entity === 'employees') {
        const map = new Map<string, Employee>(employees.map((e) => [e.id, e]));
        let count = 0;
        for (const r of parsedRows) {
          const id = getField(r, 'employeeid', 'empid', 'id', 'bioid');
          const name = getField(r, 'name', 'fullname', 'employeename');
          if (!id || !name) continue;
          const prev = map.get(id);
          map.set(id, {
            ...(prev || {}),
            id,
            bioId: id,
            name,
            department: getField(r, 'department', 'dept') || prev?.department || 'Operations',
            designation: getField(r, 'designation', 'role', 'title') || prev?.designation || 'Staff',
            joiningDate: getField(r, 'joiningdate', 'doj') || prev?.joiningDate || format(new Date(), 'yyyy-MM-dd'),
            weeklyOff: getField(r, 'weeklyoff') || prev?.weeklyOff || 'Saturday',
            email: getField(r, 'email') || prev?.email,
            phone: getField(r, 'phone', 'mobile') || prev?.phone,
            status: 'Active',
            otEligible: prev?.otEligible ?? true,
            targetWorkingHours: prev?.targetWorkingHours ?? 8,
          });
          count++;
        }
        await setEmployees(Array.from(map.values()));
        toast.success(`Imported/updated ${count} employee records in SQLite.`);
      } else if (entity === 'salary') {
        const map = new Map<string, Employee>(employees.map((e) => [e.id, e]));
        let updatedCount = 0;
        for (const r of parsedRows) {
          const id = getField(r, 'employeeid', 'empid', 'id');
          const existing = map.get(id);
          if (!existing) continue;
          const basic = Number(getField(r, 'basicsalary', 'basic')) || 0;
          const dearness = Number(getField(r, 'dearnessallowance', 'hra', 'da')) || 0;
          const other =
            (Number(getField(r, 'otherallowance', 'specialallowance', 'allowance')) || 0) +
            (Number(getField(r, 'conveyance')) || 0);
          const totalAllowances = dearness + other;
          const gross = basic + totalAllowances;
          const ssfFlag = getField(r, 'ssfeligible', 'ssf').toLowerCase();
          const ssfEnrolled = ssfFlag === 'yes' || ssfFlag === 'true' ? true : existing.ssfEnrolled;
          const empSsf = ssfEnrolled ? Math.round(basic * 0.11) : existing.employeeSSF;
          const emplyrSsf = ssfEnrolled ? Math.round(basic * 0.2) : existing.employerSSF;
          const effectiveGross = gross > 0 ? gross : existing.grossSalary || 0;
          const monthlyCtc = effectiveGross + (emplyrSsf || 0);
          map.set(id, {
            ...existing,
            basicSalary: basic || existing.basicSalary,
            dearnessAllowance: dearness || existing.dearnessAllowance,
            otherAllowance: other || existing.otherAllowance,
            allowances: totalAllowances || existing.allowances,
            grossSalary: effectiveGross,
            employeeSSF: empSsf,
            employerSSF: emplyrSsf,
            monthlyCTC: monthlyCtc,
            annualCTC: monthlyCtc * 12,
            ssfEnrolled,
          });
          updatedCount++;
        }
        await setEmployees(Array.from(map.values()));
        toast.success(`Updated salary structures for ${updatedCount} employees.`);
      } else if (entity === 'leave_balances') {
        const records = parsedRows
          .map((r) => {
            const empId = getField(r, 'employeeid', 'empid', 'id');
            const emp = employees.find((e) => e.id === empId);
            if (!empId) return null;
            return {
              id: `bal_${empId}`,
              employeeId: empId,
              employeeName: emp?.name || empId,
              date: format(new Date(), 'yyyy-MM-dd'),
              status: 'Approved',
              annualQuota: Number(getField(r, 'annualquota', 'annual')) || 18,
              sickQuota: Number(getField(r, 'sickquota', 'sick')) || 12,
              casualQuota: Number(getField(r, 'casualquota', 'casual')) || 6,
            };
          })
          .filter(Boolean);
        if (records.length > 0) {
          await saveLocalTable('leave_records', records);
          toast.success(`Saved leave balance quotas for ${records.length} employees.`);
        }
      } else if (entity === 'assets') {
        const assetRecords: CompanyAsset[] = parsedRows
          .map((r) => {
            const tag = getField(r, 'assettag', 'tag');
            const itemName = getField(r, 'itemname', 'name', 'assetname');
            if (!tag || !itemName) return null;
            const empId = getField(r, 'assignedemployeeid', 'employeeid', 'empid');
            const emp = employees.find((e) => e.id === empId);
            return {
              id: `ast_${generateId()}`,
              assetTag: tag.toUpperCase(),
              name: itemName,
              category: (getField(r, 'category') as any) || 'Other',
              serialNumber: getField(r, 'serialnumber', 'serial') || '-',
              condition: (getField(r, 'condition') as any) || 'Good',
              status: emp ? 'Assigned' : 'Available',
              assignedEmployeeId: emp?.id,
              assignedEmployeeName: emp?.name,
              assignedDate: emp ? format(new Date(), 'yyyy-MM-dd') : undefined,
              updatedAt: new Date().toISOString(),
            } as CompanyAsset;
          })
          .filter(Boolean) as CompanyAsset[];
        if (assetRecords.length > 0) {
          await saveLocalTable('hr_assets', assetRecords);
          toast.success(`Imported ${assetRecords.length} company assets to inventory.`);
        }
      }
      setParsedRows([]);
      setFileName('');
    } finally {
      setIsImporting(false);
    }
  };

  const activeMeta = ENTITY_TABS.find((t) => t.key === entity)!;
  const previewHeaders = parsedRows.length > 0 ? Object.keys(parsedRows[0]).slice(0, 6) : [];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5">
        {ENTITY_TABS.map((t) => {
          const Icon = t.icon;
          const active = entity === t.key;
          return (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                setEntity(t.key);
                setParsedRows([]);
                setFileName('');
              }}
              className={cn(
                'p-3 rounded-xl border text-left transition-all flex items-center gap-2.5',
                active
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-primary/40'
              )}
            >
              <Icon size={16} className="shrink-0" />
              <span className="text-xs font-bold truncate">{t.label}</span>
            </button>
          );
        })}
      </div>

      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs">
          <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
            <FileSpreadsheet size={14} className="text-primary" /> {activeMeta.label} Spreadsheet Schema
          </p>
          <p className="text-slate-500 dark:text-slate-400 mt-0.5">{activeMeta.hint}</p>
        </div>
        <Button size="sm" variant="outline" onClick={handleDownloadTemplate}>
          <Download size={13} /> Download Sample XLSX
        </Button>
      </div>

      <div className="border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl p-8 text-center bg-slate-50/50 dark:bg-slate-900/40">
        <UploadCloud size={28} className="mx-auto text-slate-400 mb-3" />
        <p className="text-sm font-bold text-slate-900 dark:text-white mb-1">
          {fileName ? `${fileName} (${parsedRows.length} rows ready)` : `Upload ${activeMeta.label} Spreadsheet`}
        </p>
        <p className="text-xs text-slate-500 mb-4">Supports .xlsx, .xls, and .csv workbooks</p>
        <input
          id="master-data-upload"
          type="file"
          accept=".xlsx,.xls,.csv"
          onChange={handleFilePick}
          className="hidden"
        />
        <label
          htmlFor="master-data-upload"
          className="inline-flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-bold bg-primary hover:bg-primary-dark text-white cursor-pointer transition-colors"
        >
          {fileName ? 'Choose Another File' : 'Select Spreadsheet'}
        </label>
      </div>

      {parsedRows.length > 0 && (
        <div className="space-y-3">
          <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-[10px] uppercase text-slate-500">
                <tr>
                  {previewHeaders.map((h) => (
                    <th key={h} className="px-3 py-2">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {parsedRows.slice(0, 6).map((row, idx) => (
                  <tr key={idx}>
                    {previewHeaders.map((h) => (
                      <td key={h} className="px-3 py-2 text-slate-700 dark:text-slate-300">
                        {String(row[h] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500 tabular-nums">
              Showing first {Math.min(6, parsedRows.length)} of {parsedRows.length} rows
            </p>
            <Button onClick={handleCommit} disabled={isImporting}>
              <CheckCircle2 size={14} /> {isImporting ? 'Importing...' : `Commit ${parsedRows.length} Records to SQLite`}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
