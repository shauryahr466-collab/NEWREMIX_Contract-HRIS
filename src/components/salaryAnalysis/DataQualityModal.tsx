import React, { useState } from 'react';
import { X, ShieldAlert, AlertTriangle, CheckCircle2, Download, Search } from 'lucide-react';
import { DataQualityIssue } from '../../types/salaryAnalysis';
import * as XLSX from 'xlsx';

interface DataQualityModalProps {
  isOpen: boolean;
  onClose: () => void;
  issues: DataQualityIssue[];
}

export function DataQualityModal({ isOpen, onClose, issues }: DataQualityModalProps) {
  const [filterSeverity, setFilterSeverity] = useState<'All' | 'High' | 'Medium' | 'Low'>('All');
  const [searchTerm, setSearchTerm] = useState('');

  if (!isOpen) return null;

  const filteredIssues = issues.filter(issue => {
    if (filterSeverity !== 'All' && issue.severity !== filterSeverity) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      return (
        issue.employeeId.toLowerCase().includes(term) ||
        issue.employeeName.toLowerCase().includes(term) ||
        issue.issueType.toLowerCase().includes(term) ||
        issue.description.toLowerCase().includes(term)
      );
    }
    return true;
  });

  const handleExport = () => {
    const rows = filteredIssues.map(i => ({
      'Employee ID': i.employeeId,
      'Employee Name': i.employeeName,
      'Department': i.department,
      'Designation': i.designation,
      'Issue Category': i.issueType,
      'Severity': i.severity,
      'Audit Description': i.description
    }));

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Salary Audit');
    XLSX.writeFile(wb, `Salary_Data_Quality_Audit_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  const highCount = issues.filter(i => i.severity === 'High').length;
  const medCount = issues.filter(i => i.severity === 'Medium').length;
  const lowCount = issues.filter(i => i.severity === 'Low').length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div onClick={onClose} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-4xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden z-10 p-6 flex flex-col max-h-[85vh] space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-50 dark:bg-rose-950/60 text-rose-600 dark:text-rose-400 rounded-2xl">
              <ShieldAlert size={22} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white leading-tight">Salary Data Quality Audit</h3>
              <p className="text-xs text-slate-500">
                Found {issues.length} total data inconsistency issue(s) across master employee salary records
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExport}
              className="px-3 py-1.5 text-xs font-bold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-xl transition-all flex items-center gap-1.5"
            >
              <Download size={14} />
              Export Audit
            </button>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Severity Summary Cards */}
        <div className="grid grid-cols-3 gap-3 shrink-0">
          <button
            type="button"
            onClick={() => setFilterSeverity(filterSeverity === 'High' ? 'All' : 'High')}
            className={`p-3 rounded-xl border text-left transition-all ${
              filterSeverity === 'High' ? 'ring-2 ring-rose-500 border-rose-500' : 'border-slate-200 dark:border-slate-800'
            } bg-rose-50/50 dark:bg-rose-950/20`}
          >
            <p className="text-[11px] font-bold text-rose-600 dark:text-rose-400 uppercase">High Severity</p>
            <p className="text-xl font-black text-rose-700 dark:text-rose-300 mt-0.5">{highCount}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Missing basic/gross or calc mismatch</p>
          </button>

          <button
            type="button"
            onClick={() => setFilterSeverity(filterSeverity === 'Medium' ? 'All' : 'Medium')}
            className={`p-3 rounded-xl border text-left transition-all ${
              filterSeverity === 'Medium' ? 'ring-2 ring-amber-500 border-amber-500' : 'border-slate-200 dark:border-slate-800'
            } bg-amber-50/50 dark:bg-amber-950/20`}
          >
            <p className="text-[11px] font-bold text-amber-600 dark:text-amber-400 uppercase">Medium Severity</p>
            <p className="text-xl font-black text-amber-700 dark:text-amber-300 mt-0.5">{medCount}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Missing DOJ / tenure info</p>
          </button>

          <button
            type="button"
            onClick={() => setFilterSeverity(filterSeverity === 'Low' ? 'All' : 'Low')}
            className={`p-3 rounded-xl border text-left transition-all ${
              filterSeverity === 'Low' ? 'ring-2 ring-blue-500 border-blue-500' : 'border-slate-200 dark:border-slate-800'
            } bg-blue-50/50 dark:bg-blue-950/20`}
          >
            <p className="text-[11px] font-bold text-blue-600 dark:text-blue-400 uppercase">Low Severity</p>
            <p className="text-xl font-black text-blue-700 dark:text-blue-300 mt-0.5">{lowCount}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">Unassigned Dept / Designation / Grade</p>
          </button>
        </div>

        {/* Filter Input */}
        <div className="relative shrink-0">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search issue by employee name, ID, or description..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        {/* Audit Issues Table */}
        <div className="flex-1 overflow-y-auto overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-semibold sticky top-0 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="p-3">Severity</th>
                <th className="p-3">Issue Category</th>
                <th className="p-3">Emp ID</th>
                <th className="p-3">Employee Name</th>
                <th className="p-3">Department</th>
                <th className="p-3">Audit Details</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
              {filteredIssues.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-400">
                    <CheckCircle2 size={32} className="mx-auto mb-2 text-emerald-500" />
                    No salary data quality issues found in this filter selection.
                  </td>
                </tr>
              ) : (
                filteredIssues.map(issue => (
                  <tr key={issue.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        issue.severity === 'High' ? 'bg-rose-100 text-rose-700' :
                        issue.severity === 'Medium' ? 'bg-amber-100 text-amber-700' :
                        'bg-blue-100 text-blue-700'
                      }`}>
                        {issue.severity}
                      </span>
                    </td>
                    <td className="p-3 font-bold text-slate-900 dark:text-white">{issue.issueType}</td>
                    <td className="p-3 font-mono font-bold text-slate-600 dark:text-slate-400">{issue.employeeId}</td>
                    <td className="p-3 font-bold">{issue.employeeName}</td>
                    <td className="p-3 text-slate-500">{issue.department}</td>
                    <td className="p-3 text-slate-600 dark:text-slate-300 leading-relaxed">{issue.description}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 shrink-0 text-xs text-slate-500">
          <span>Showing {filteredIssues.length} of {issues.length} Quality Issue(s)</span>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 font-bold text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
