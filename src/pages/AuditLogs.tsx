import { useMemo, useState } from 'react';
import { useAppStore } from '../store';
import { format } from 'date-fns';
import {
  Search,
  ArrowRight,
  User,
  ClipboardList,
  Download,
  RefreshCw,
  ShieldCheck
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { PageHeader, Card, Button, Input } from '../components/ui';
import { normalizeAuditLog, safeParseAuditDate } from '../lib/audit';
import { isEmployeeInUserScope } from '../lib/accessControl';
import { fetchLocalTable } from '../lib/localClient';
import type { AuditLog } from '../types';
import { toast } from 'sonner';

export default function AuditLogs() {
  const { auditLogs, employees, globalSearchTerm, effectiveUserProfile, isSuperAdmin } = useAppStore();
  const [searchTerm, setSearchTerm] = useState('');
  const activeSearch = searchTerm || globalSearchTerm;
  const [filterField, setFilterField] = useState('All');
  const [liveRows, setLiveRows] = useState<AuditLog[] | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const empMap = useMemo(() => {
    const m = new Map<string, (typeof employees)[number]>();
    for (const e of employees) {
      if (e?.id) m.set(String(e.id).trim(), e);
    }
    return m;
  }, [employees]);

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
      new Set(normalizedLogs.map(l => String(l.field || 'System Event').trim()).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));
    return ['All', ...uniqueFields];
  }, [normalizedLogs]);

  const filteredLogs = useMemo(() => {
    const q = String(activeSearch || '').trim().toLowerCase();
    return normalizedLogs.filter(log => {
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
      const fresh = await fetchLocalTable<AuditLog>('audit_logs');
      setLiveRows(Array.isArray(fresh) ? fresh : []);
      toast.success(`Loaded ${Array.isArray(fresh) ? fresh.length : 0} audit entries from SQLite`);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to refresh audit logs');
    } finally {
      setIsRefreshing(false);
    }
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

  const exportAuditLogs = () => {
    if (filteredLogs.length === 0) {
      toast.info('No audit entries available to export.');
      return;
    }
    const data = filteredLogs.map(l => {
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
        'Remarks': l.remarks || l.reason || '-'
      };
    });

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'System Audit Log');
    XLSX.writeFile(wb, `System_Audit_Logs_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
    toast.success(`Exported ${data.length} audit log records.`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="System Audit Log"
        description="Tracking administrative overrides, attendance reconciliation, and sensitive modifications"
        icon={ShieldCheck}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing} className="gap-2">
              <RefreshCw size={14} className={isRefreshing ? 'animate-spin' : ''} />
              Refresh
            </Button>
            <Button onClick={exportAuditLogs} className="gap-2">
              <Download size={14} />
              Export Audit
            </Button>
          </div>
        }
      />

      <Card className="p-0 overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
          <div className="flex-1 min-w-[260px] relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
            <Input
              placeholder="Search employee, ID, field, actor, or remarks..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
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
              {fields.filter(f => f !== 'All').map(f => (
                <option key={f} value={f}>{f}</option>
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
                      <div className="text-[11px] text-slate-500 font-mono">
                        {log.employeeId || 'SYSTEM'}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                        {log.field || 'System Event'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-400 line-through truncate max-w-[130px]" title={log.oldValue || 'None'}>
                          {log.oldValue || 'None'}
                        </span>
                        <ArrowRight size={12} className="text-slate-300 shrink-0" />
                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold truncate max-w-[160px]" title={log.newValue || '-'}>
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
                      <p className="text-xs text-slate-500 dark:text-slate-400 max-w-[260px] truncate" title={log.remarks || log.reason || ''}>
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
                      <p className="text-xs text-slate-400">Administrative overrides and attendance changes will appear here automatically.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
