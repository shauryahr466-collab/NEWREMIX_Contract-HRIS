import { useEffect, useMemo, useState } from 'react';
import { useAppStore } from '../store';
import { format } from 'date-fns';
import {
  Search,
  ArrowRight,
  User,
  ClipboardList,
  Download,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  FileSpreadsheet,
  Printer,
  Filter
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { PageHeader, Card, Button, Input, Badge, KPICard } from '../components/ui';
import { normalizeAuditLog, safeParseAuditDate } from '../lib/audit';
import { isEmployeeInUserScope } from '../lib/accessControl';
import { fetchLocalTable } from '../lib/localClient';
import { exportToCSV } from '../lib/csvExport';
import { getNepaliDate } from '../utils/dateHelper';
import type { AuditLog, ApprovalAuditRecord } from '../types';
import { toast } from 'sonner';

export default function AuditLogs() {
  const {
    auditLogs,
    approvalAudits,
    refreshApprovalAudits,
    employees,
    globalSearchTerm,
    effectiveUserProfile,
    isSuperAdmin
  } = useAppStore();

  const [activeTab, setActiveTab] = useState<'approvals' | 'system'>(isSuperAdmin ? 'approvals' : 'system');
  const [searchTerm, setSearchTerm] = useState('');
  const activeSearch = searchTerm || globalSearchTerm;

  // Approval Audit filters (Super Admin tab)
  const [moduleFilter, setModuleFilter] = useState('All');
  const [roleFilter, setRoleFilter] = useState('All');
  const [decisionFilter, setDecisionFilter] = useState('All');
  const [overridesOnly, setOverridesOnly] = useState(false);

  // System Activity filters
  const [filterField, setFilterField] = useState('All');
  const [liveRows, setLiveRows] = useState<AuditLog[] | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    if (isSuperAdmin) {
      refreshApprovalAudits();
    }
  }, [isSuperAdmin, refreshApprovalAudits]);

  const empMap = useMemo(() => {
    const m = new Map<string, (typeof employees)[number]>();
    for (const e of employees) {
      if (e?.id) m.set(String(e.id).trim(), e);
    }
    return m;
  }, [employees]);

  // ==========================
  // 1. Approval Audit Tab Data
  // ==========================
  const sortedApprovalAudits = useMemo(() => {
    return [...(approvalAudits || [])].sort((a, b) =>
      String(b.timestamp || '').localeCompare(String(a.timestamp || ''))
    );
  }, [approvalAudits]);

  const approvalModules = useMemo(() => {
    const set = new Set(sortedApprovalAudits.map((a) => a.module).filter(Boolean));
    return ['All', ...Array.from(set).sort()];
  }, [sortedApprovalAudits]);

  const approvalRoles = useMemo(() => {
    const set = new Set(sortedApprovalAudits.map((a) => a.approvedByRole).filter(Boolean));
    return ['All', ...Array.from(set).sort()];
  }, [sortedApprovalAudits]);

  const approvalDecisions = useMemo(() => {
    const set = new Set(sortedApprovalAudits.map((a) => a.newStatus).filter(Boolean));
    return ['All', ...Array.from(set).sort()];
  }, [sortedApprovalAudits]);

  const filteredApprovalAudits = useMemo(() => {
    const q = String(activeSearch || '').trim().toLowerCase();
    return sortedApprovalAudits.filter((item) => {
      if (moduleFilter !== 'All' && item.module !== moduleFilter) return false;
      if (roleFilter !== 'All' && item.approvedByRole !== roleFilter) return false;
      if (decisionFilter !== 'All' && item.newStatus !== decisionFilter) return false;
      if (overridesOnly && !item.isOverride) return false;

      if (!q) return true;
      const hay = [
        item.employeeId,
        item.employeeName,
        item.department,
        item.module,
        item.approvedBy,
        item.approvedByName,
        item.approvedByRole,
        item.previousApprover,
        item.previousApproverRole,
        item.previousStatus,
        item.newStatus,
        item.actionSummary,
        item.remarks,
        item.targetDate,
        item.bsDate
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [sortedApprovalAudits, activeSearch, moduleFilter, roleFilter, decisionFilter, overridesOnly]);

  const approvalStats = useMemo(() => {
    let approved = 0;
    let rejected = 0;
    let overrides = 0;
    for (const item of sortedApprovalAudits) {
      if (item.isOverride) overrides++;
      if (item.newStatus === 'Rejected' || item.newStatus === 'Not Approved') rejected++;
      else approved++;
    }
    return {
      total: sortedApprovalAudits.length,
      approved,
      rejected,
      overrides
    };
  }, [sortedApprovalAudits]);

  // ==========================
  // 2. System Activity Data
  // ==========================
  const normalizedLogs = useMemo(() => {
    const source = liveRows !== null ? liveRows : auditLogs;
    const seen = new Set<string>();
    const list: AuditLog[] = [];

    for (const raw of source || []) {
      if (!raw) continue;
      const norm = normalizeAuditLog(raw);
      if (seen.has(norm.id)) continue;
      seen.add(norm.id);

      if (!isSuperAdmin && effectiveUserProfile) {
        const emp = empMap.get(norm.employeeId);
        if (emp && !isEmployeeInUserScope(emp, effectiveUserProfile)) continue;
        if (!emp && norm.employeeId !== 'SYSTEM' && norm.employeeId !== 'ALL') continue;
      }

      list.push(norm);
    }

    return list.sort((a, b) => {
      const ta = safeParseAuditDate(a.timestamp || a.changedAt || a.date)?.getTime() || 0;
      const tb = safeParseAuditDate(b.timestamp || b.changedAt || b.date)?.getTime() || 0;
      return tb - ta;
    });
  }, [liveRows, auditLogs, isSuperAdmin, effectiveUserProfile, empMap]);

  const fields = useMemo(() => {
    const uniqueFields = Array.from(
      new Set(normalizedLogs.map((l) => String(l.field || 'System Event').trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
    return ['All', ...uniqueFields];
  }, [normalizedLogs]);

  const filteredLogs = useMemo(() => {
    const q = String(activeSearch || '').trim().toLowerCase();
    return normalizedLogs.filter((log) => {
      const empName = String(log.employeeName || '').toLowerCase();
      const empId = String(log.employeeId || '').toLowerCase();
      const changedBy = String(log.changedBy || '').toLowerCase();
      const field = String(log.field || '').toLowerCase();
      const remarks = String(log.remarks || log.reason || '').toLowerCase();
      const oldVal = String(log.oldValue || '').toLowerCase();
      const newVal = String(log.newValue || '').toLowerCase();

      const matchesSearch =
        !q ||
        empName.includes(q) ||
        empId.includes(q) ||
        changedBy.includes(q) ||
        field.includes(q) ||
        remarks.includes(q) ||
        oldVal.includes(q) ||
        newVal.includes(q);

      const matchesField = filterField === 'All' || String(log.field || '') === filterField;
      return matchesSearch && matchesField;
    });
  }, [normalizedLogs, activeSearch, filterField]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      if (isSuperAdmin && activeTab === 'approvals') {
        const freshApprovals = await refreshApprovalAudits();
        toast.success(`Loaded ${freshApprovals.length} approval audit entries from SQLite`);
      } else {
        const fresh = await fetchLocalTable<AuditLog>('audit_logs');
        setLiveRows(Array.isArray(fresh) ? fresh : []);
        toast.success(`Loaded ${Array.isArray(fresh) ? fresh.length : 0} system audit entries from SQLite`);
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to refresh audit logs');
    } finally {
      setIsRefreshing(false);
    }
  };

  const formatTimestamp = (ts?: string) => {
    const parsed = safeParseAuditDate(ts);
    if (!parsed || parsed.getTime() === 0) {
      return { dateStr: ts?.slice(0, 10) || '-', timeStr: '--:--:--', bsStr: '-' };
    }
    const dateStr = format(parsed, 'yyyy-MM-dd');
    return {
      dateStr,
      timeStr: format(parsed, 'HH:mm:ss'),
      bsStr: getNepaliDate(dateStr)
    };
  };

  const formatLogDate = (log: AuditLog) => {
    const parsed = safeParseAuditDate(log.timestamp || log.changedAt || log.date);
    if (!parsed || parsed.getTime() === 0) {
      return {
        dateStr: log.date || '-',
        timeStr: '--:--:--'
      };
    }
    return {
      dateStr: format(parsed, 'yyyy-MM-dd'),
      timeStr: format(parsed, 'HH:mm:ss')
    };
  };

  const buildApprovalExportRows = (rows: ApprovalAuditRecord[]) =>
    rows.map((r) => {
      const { dateStr, timeStr, bsStr } = formatTimestamp(r.timestamp);
      const targetBs = r.bsDate || (r.targetDate && /^\d{4}-\d{2}-\d{2}/.test(r.targetDate) ? getNepaliDate(r.targetDate.slice(0, 10)) : '-');
      return {
        'Audit ID': r.id,
        'Timestamp (AD)': dateStr,
        'Time (24h)': timeStr,
        'Logged Date (BS)': bsStr,
        Module: r.module,
        'Record ID': r.recordId,
        'Employee ID': r.employeeId,
        'Employee Name': r.employeeName || '-',
        Department: r.department || '-',
        'Target Date (AD)': r.targetDate || '-',
        'Target Date (BS)': targetBs,
        'Previous Status': r.previousStatus,
        'New Decision': r.newStatus,
        'Prior Approver': r.previousApprover || '-',
        'Prior Approver Role': r.previousApproverRole || '-',
        'Approved / Decided By': r.approvedByName || r.approvedBy,
        'Approver Account': r.approvedBy,
        'Approver Role': r.approvedByRole,
        'Super Admin Override': r.isOverride ? 'Yes' : 'No',
        'Action Summary': r.actionSummary || '-',
        Remarks: r.remarks || '-'
      };
    });

  const handleExportApprovalCsv = () => {
    if (filteredApprovalAudits.length === 0) {
      toast.info('No approval audit records available to export.');
      return;
    }
    const rows = buildApprovalExportRows(filteredApprovalAudits);
    exportToCSV(rows, {
      filename: `Approval_Audit_Log_${format(new Date(), 'yyyyMMdd_HHmm')}.csv`
    });
    toast.success(`Exported ${rows.length} approval audit records to CSV.`);
  };

  const handleExportApprovalExcel = () => {
    if (filteredApprovalAudits.length === 0) {
      toast.info('No approval audit records available to export.');
      return;
    }
    const rows = buildApprovalExportRows(filteredApprovalAudits);
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Approval Audit Trail');
    XLSX.writeFile(wb, `Approval_Audit_Log_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
    toast.success(`Exported ${rows.length} approval audit records to Excel.`);
  };

  const exportSystemAuditLogs = () => {
    if (filteredLogs.length === 0) {
      toast.info('No audit entries available to export.');
      return;
    }
    const data = filteredLogs.map((l) => {
      const { dateStr, timeStr } = formatLogDate(l);
      return {
        'Date (ISO 8601)': dateStr,
        'Time (24h)': timeStr,
        'Employee ID': l.employeeId || '-',
        'Employee / Target': l.employeeName || '-',
        'Modified Field / Action': l.field || '-',
        'Old Value': l.oldValue || '-',
        'New Value': l.newValue || '-',
        'Modified By': l.changedBy || '-',
        Remarks: l.remarks || l.reason || '-'
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'System Audit Log');
    XLSX.writeFile(wb, `System_Audit_Logs_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
    toast.success(`Exported ${data.length} system audit records.`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={isSuperAdmin && activeTab === 'approvals' ? 'Super Admin Approval Audit' : 'System Audit Log'}
        description={
          isSuperAdmin && activeTab === 'approvals'
            ? 'Immutable ledger of every approval, rejection, and Super Admin override across Overtime, Leave/SBL, Attendance Requests, Payroll & Documents'
            : 'Tracking administrative overrides, attendance reconciliation, and sensitive modifications'
        }
        icon={ShieldCheck}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing} className="gap-2">
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
              Refresh
            </Button>
            {isSuperAdmin && activeTab === 'approvals' ? (
              <>
                <Button variant="outline" onClick={handleExportApprovalCsv} className="gap-2">
                  <Download size={14} />
                  Export CSV
                </Button>
                <Button onClick={handleExportApprovalExcel} className="gap-2">
                  <FileSpreadsheet size={14} />
                  Export Excel
                </Button>
              </>
            ) : (
              <Button onClick={exportSystemAuditLogs} className="gap-2">
                <Download size={14} />
                Export Audit
              </Button>
            )}
            <Button variant="outline" onClick={() => window.print()} className="gap-2 print:hidden">
              <Printer size={14} />
              Print
            </Button>
          </div>
        }
      />

      {/* Super Admin Tab Switcher */}
      {isSuperAdmin && (
        <div className="flex flex-wrap items-center gap-2 p-1.5 bg-slate-100 dark:bg-slate-800/70 rounded-xl w-fit border border-slate-200 dark:border-slate-800 print:hidden">
          <button
            type="button"
            onClick={() => setActiveTab('approvals')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'approvals'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs border border-slate-200 dark:border-slate-700'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ShieldCheck size={14} className="text-indigo-600" />
            Approval Audit ({approvalStats.total})
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('system')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer ${
              activeTab === 'system'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs border border-slate-200 dark:border-slate-700'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ClipboardList size={14} />
            System Activity Log ({normalizedLogs.length})
          </button>
        </div>
      )}

      {isSuperAdmin && activeTab === 'approvals' ? (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <KPICard
              label="Total Approvals Logged"
              value={approvalStats.total}
              icon={ShieldCheck}
              onClick={() => {
                setDecisionFilter('All');
                setOverridesOnly(false);
              }}
            />
            <KPICard
              label="Approved / Confirmed"
              value={approvalStats.approved}
              icon={CheckCircle2}
              trend="up"
              trendValue="Cleared Decisions"
              onClick={() => {
                setDecisionFilter('Approved');
                setOverridesOnly(false);
              }}
            />
            <KPICard
              label="Rejected Decisions"
              value={approvalStats.rejected}
              icon={XCircle}
              trend="down"
              trendValue="Declined Requests"
              onClick={() => {
                setDecisionFilter('Rejected');
                setOverridesOnly(false);
              }}
            />
            <KPICard
              label="Super Admin Overrides"
              value={approvalStats.overrides}
              icon={ShieldAlert}
              trend="neutral"
              trendValue="Overrode HOD / Supervisor"
              onClick={() => setOverridesOnly((v) => !v)}
            />
          </div>

          <Card className="p-0 overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
              <div className="flex-1 min-w-[240px] relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <Input
                  placeholder="Search employee, approver, role, module, or remarks..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={moduleFilter}
                  onChange={(e) => setModuleFilter(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200"
                >
                  {approvalModules.map((m) => (
                    <option key={m} value={m}>
                      {m === 'All' ? 'All Modules' : m}
                    </option>
                  ))}
                </select>

                <select
                  value={roleFilter}
                  onChange={(e) => setRoleFilter(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200"
                >
                  {approvalRoles.map((r) => (
                    <option key={r} value={r}>
                      {r === 'All' ? 'All Approver Roles' : r}
                    </option>
                  ))}
                </select>

                <select
                  value={decisionFilter}
                  onChange={(e) => setDecisionFilter(e.target.value)}
                  className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200"
                >
                  {approvalDecisions.map((d) => (
                    <option key={d} value={d}>
                      {d === 'All' ? 'All Decisions' : d}
                    </option>
                  ))}
                </select>

                <button
                  type="button"
                  onClick={() => setOverridesOnly((v) => !v)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center gap-1.5 cursor-pointer ${
                    overridesOnly
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-slate-50 dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                  }`}
                >
                  <Filter size={12} />
                  Overrides Only
                </button>

                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 tabular-nums pl-1">
                  {filteredApprovalAudits.length} {filteredApprovalAudits.length === 1 ? 'record' : 'records'}
                </span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50/70 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    <th className="px-4 py-3.5">Logged Timestamp (AD / BS)</th>
                    <th className="px-4 py-3.5">Module & Target Date</th>
                    <th className="px-4 py-3.5">Employee / Target</th>
                    <th className="px-4 py-3.5">Decision & Override Trail</th>
                    <th className="px-4 py-3.5">Approved By & Role</th>
                    <th className="px-4 py-3.5">Action Summary & Remarks</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                  {filteredApprovalAudits.map((row) => {
                    const { dateStr, timeStr, bsStr } = formatTimestamp(row.timestamp);
                    const targetBs =
                      row.bsDate ||
                      (row.targetDate && /^\d{4}-\d{2}-\d{2}/.test(row.targetDate)
                        ? getNepaliDate(row.targetDate.slice(0, 10))
                        : '');

                    return (
                      <tr
                        key={row.id}
                        className={`transition-colors ${
                          row.isOverride
                            ? 'bg-indigo-50/40 dark:bg-indigo-950/20 hover:bg-indigo-50/70 dark:hover:bg-indigo-950/35'
                            : 'hover:bg-slate-50/70 dark:hover:bg-slate-900/40'
                        }`}
                      >
                        <td className="px-4 py-3.5 whitespace-nowrap tabular-nums">
                          <div className="font-semibold text-slate-900 dark:text-white">{dateStr}</div>
                          <div className="text-[11px] font-mono text-slate-500">{timeStr}</div>
                          {bsStr !== '-' && <div className="text-[10px] font-semibold text-primary">BS {bsStr}</div>}
                        </td>
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <Badge variant="info" className="text-[10px] font-bold uppercase">
                            {row.module}
                          </Badge>
                          <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-1 tabular-nums">
                            {row.targetDate || '-'}
                            {targetBs ? <span className="text-[10px] text-primary ml-1.5">(BS {targetBs})</span> : null}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="font-bold text-slate-900 dark:text-white">
                            {row.employeeName || row.employeeId}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {row.employeeId}
                            {row.department ? ` · ${row.department}` : ''}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[11px] font-medium text-slate-400">{row.previousStatus}</span>
                            <ArrowRight size={12} className="text-slate-300 shrink-0" />
                            <Badge
                              variant={
                                row.newStatus === 'Rejected' || row.newStatus === 'Not Approved'
                                  ? 'danger'
                                  : 'success'
                              }
                              className="text-[10px] font-bold uppercase"
                            >
                              {row.newStatus}
                            </Badge>
                          </div>
                          {row.isOverride && (
                            <div className="mt-1 flex flex-col gap-0.5">
                              <span className="inline-flex w-fit items-center px-1.5 py-0.5 rounded text-[9px] font-bold bg-indigo-600 text-white">
                                SUPER ADMIN OVERRIDE
                              </span>
                              {row.previousApprover && (
                                <span className="text-[10px] text-indigo-700 dark:text-indigo-300">
                                  Overrode {row.previousApprover}
                                  {row.previousApproverRole ? ` (${row.previousApproverRole})` : ''}
                                </span>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="font-bold text-slate-900 dark:text-white">
                            {row.approvedByName || row.approvedBy}
                          </div>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                                row.approvedByRole === 'Super Admin'
                                  ? 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800'
                                  : 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
                              }`}
                            >
                              {row.approvedByRole}
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 max-w-xs">
                          {row.actionSummary && (
                            <p className="font-semibold text-slate-800 dark:text-slate-200 text-[11px]">
                              {row.actionSummary}
                            </p>
                          )}
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate" title={row.remarks || ''}>
                            {row.remarks || '-'}
                          </p>
                        </td>
                      </tr>
                    );
                  })}

                  {filteredApprovalAudits.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-20 text-center">
                        <div className="flex flex-col items-center gap-2 text-slate-400">
                          <ShieldCheck size={40} className="opacity-40" />
                          <p className="text-sm font-semibold text-slate-500">No approval decisions recorded yet</p>
                          <p className="text-xs text-slate-400">
                            Whenever any HOD, Supervisor, Section Incharge, or Super Admin approves, rejects, or overrides a request, the immutable audit record appears here.
                          </p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      ) : (
        <Card className="p-0 overflow-hidden">
          <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
            <div className="flex-1 min-w-[260px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <Input
                placeholder="Search employee, ID, field, actor, or remarks..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>

            <div className="flex items-center gap-3">
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 tabular-nums">
                {filteredLogs.length} {filteredLogs.length === 1 ? 'entry' : 'entries'}
              </span>
              <select
                value={filterField}
                onChange={(e) => setFilterField(e.target.value)}
                className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-primary/20"
              >
                <option value="All">All Event Types</option>
                {fields
                  .filter((f) => f !== 'All')
                  .map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-slate-50/70 dark:bg-slate-900/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                  <th className="px-5 py-3.5">Timestamp (ISO)</th>
                  <th className="px-5 py-3.5">Employee / Scope</th>
                  <th className="px-5 py-3.5">Action / Field</th>
                  <th className="px-5 py-3.5">Value Change</th>
                  <th className="px-5 py-3.5">Modified By</th>
                  <th className="px-5 py-3.5">Remarks</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredLogs.map((log) => {
                  const { dateStr, timeStr } = formatLogDate(log);
                  return (
                    <tr key={log.id} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/40 transition-colors">
                      <td className="px-5 py-3.5 whitespace-nowrap tabular-nums">
                        <div className="text-xs font-semibold text-slate-900 dark:text-white">{dateStr}</div>
                        <div className="text-[11px] text-slate-500 font-mono">{timeStr}</div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="text-xs font-semibold text-slate-900 dark:text-white">
                          {log.employeeName || log.employeeId || 'System'}
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono">{log.employeeId || 'SYSTEM'}</div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                          {log.field || 'System Event'}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2 text-xs">
                          <span
                            className="text-slate-400 line-through truncate max-w-[130px]"
                            title={log.oldValue || 'None'}
                          >
                            {log.oldValue || 'None'}
                          </span>
                          <ArrowRight size={12} className="text-slate-300 shrink-0" />
                          <span
                            className="text-emerald-600 dark:text-emerald-400 font-semibold truncate max-w-[160px]"
                            title={log.newValue || '-'}
                          >
                            {log.newValue || '-'}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <div className="w-6 h-6 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400 shrink-0">
                            <User size={12} />
                          </div>
                          <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                            {log.changedBy || 'System Admin'}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <p
                          className="text-xs text-slate-500 dark:text-slate-400 max-w-[260px] truncate"
                          title={log.remarks || log.reason || ''}
                        >
                          {log.remarks || log.reason || '-'}
                        </p>
                      </td>
                    </tr>
                  );
                })}
                {filteredLogs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-20 text-center">
                      <div className="flex flex-col items-center gap-2 text-slate-400">
                        <ClipboardList size={40} className="opacity-40" />
                        <p className="text-sm font-semibold text-slate-500">No audit activity logs found</p>
                        <p className="text-xs text-slate-400">
                          Administrative overrides and attendance changes will appear here automatically.
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
