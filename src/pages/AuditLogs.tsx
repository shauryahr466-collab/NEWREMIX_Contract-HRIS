import { useMemo, useState } from 'react';
import { useAppStore } from '../store';
import { format, parseISO } from 'date-fns';
import { 
  ShieldAlert, Search, Filter, Calendar, 
  ArrowRight, Clock, User, ClipboardList,
  FileText, Download
} from 'lucide-react';
import { cn } from '../lib/utils';
import * as XLSX from 'xlsx';
import { PageHeader, Card, Button, Input, Badge } from '../components/ui';

export default function AuditLogs() {
  const { auditLogs, employees, globalSearchTerm } = useAppStore();
  const [searchTerm, setSearchTerm] = useState('');
  const activeSearch = searchTerm || globalSearchTerm;
  const [filterField, setFilterField] = useState('All');

  const filteredLogs = useMemo(() => {
    return auditLogs.filter(log => {
      const matchesSearch = !activeSearch || 
        log.employeeName.toLowerCase().includes(activeSearch.toLowerCase()) || 
        log.employeeId.toLowerCase().includes(activeSearch.toLowerCase()) ||
        log.changedBy.toLowerCase().includes(activeSearch.toLowerCase()) ||
        log.field.toLowerCase().includes(activeSearch.toLowerCase());
      
      const matchesField = filterField === 'All' || log.field === filterField;
      
      return matchesSearch && matchesField;
    });
  }, [auditLogs, activeSearch, filterField]);

  const fields = useMemo(() => ['All', ...new Set(auditLogs.map(l => l.field))], [auditLogs]);

  const exportAuditLogs = () => {
    const data = filteredLogs.map(l => ({
      'Timestamp': format(parseISO(l.timestamp), 'yyyy-MM-dd HH:mm:ss'),
      'Employee ID': l.employeeId,
      'Employee Name': l.employeeName,
      'Modified Field': l.field,
      'Old Value': l.oldValue,
      'New Value': l.newValue,
      'Admin': l.changedBy,
      'Remarks': l.remarks
    }));

    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Audit Logs");
    XLSX.writeFile(wb, `Audit_Logs_${format(new Date(), 'yyyyMMdd_HHmm')}.xlsx`);
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="System Audit Log" 
        description="Tracking administrative overrides and sensitive modifications"
        actions={
          <Button onClick={exportAuditLogs} className="gap-2">
            <Download size={14} />
            Export Audit
          </Button>
        }
      />

      <Card className="p-0 overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-4">
           <div className="flex-1 min-w-[300px] relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <Input 
                placeholder="Search logs..." 
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="pl-9"
              />
           </div>

           <div className="flex items-center gap-3">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Filter:</span>
              <select 
                value={filterField}
                onChange={(e) => setFilterField(e.target.value)}
                className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg px-3 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20"
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
              <tr className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Timestamp</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Employee</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Action</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Changes</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Modified By</th>
                <th className="px-6 py-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Remarks</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredLogs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition-colors">
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">{format(parseISO(log.timestamp), 'dd MMM yyyy')}</span>
                      <span className="text-[10px] text-slate-500 font-medium">{format(parseISO(log.timestamp), 'HH:mm:ss')}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col">
                      <span className="text-xs font-bold text-slate-900 dark:text-white">{log.employeeName}</span>
                      <span className="text-[10px] text-primary font-bold uppercase tracking-widest">{log.employeeId}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <Badge variant="info" className="text-[9px] px-2 py-0.5 font-bold uppercase">
                      {log.field}
                    </Badge>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2 text-[11px]">
                      <span className="text-slate-400 line-through truncate max-w-[80px]">{log.oldValue || 'None'}</span>
                      <ArrowRight size={12} className="text-slate-300" />
                      <span className="text-success font-bold truncate max-w-[120px]">{log.newValue}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-2">
                       <div className="w-6 h-6 rounded bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-400">
                         <User size={12} />
                       </div>
                       <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 uppercase tracking-widest">{log.changedBy}</span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-[10px] text-slate-500 italic max-w-[200px] truncate" title={log.remarks}>{log.remarks}</p>
                  </td>
                </tr>
              ))}
              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-2 opacity-30">
                      <ClipboardList size={48} className="text-slate-400" />
                      <p className="text-sm font-bold uppercase tracking-widest text-slate-500">No activity logs found</p>
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
