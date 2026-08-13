import React, { useState } from 'react';
import { X, Search, Users, DollarSign, Download, Building2, Briefcase } from 'lucide-react';
import { DrillDownData } from '../../types/salaryAnalysis';
import * as XLSX from 'xlsx';

interface DrillDownModalProps {
  data: DrillDownData | null;
  onClose: () => void;
}

export function DrillDownModal({ data, onClose }: DrillDownModalProps) {
  const [searchTerm, setSearchTerm] = useState('');

  if (!data) return null;

  const filteredEmployees = data.employees.filter(emp => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      emp.id.toLowerCase().includes(term) ||
      emp.name.toLowerCase().includes(term) ||
      emp.designation?.toLowerCase().includes(term) ||
      emp.department?.toLowerCase().includes(term)
    );
  });

  const handleExport = () => {
    const exportRows = filteredEmployees.map(e => {
      const basic = Number(e.basicSalary || 0);
      const da = Number(e.dearnessAllowance || 0);
      const other = Number(e.otherAllowance || e.allowances || 0);
      const gross = Number(e.grossSalary || (basic + da + other));
      const emprSSF = Number(e.employerSSF || Math.round(basic * 0.20));
      const monthlyCTC = Number(e.monthlyCTC || (gross + emprSSF));

      return {
        'Employee ID': e.id,
        'Employee Name': e.name,
        'Department': e.department,
        'Designation': e.designation,
        'Grade': e.grade || 'N/A',
        'Basic Salary': basic,
        'Dearness Allowance': da,
        'Other Allowance': other,
        'Gross Salary': gross,
        'Employer SSF': emprSSF,
        'Monthly CTC': monthlyCTC,
        'Annual CTC': monthlyCTC * 12,
        'Status': e.status
      };
    });

    const ws = XLSX.utils.json_to_sheet(exportRows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Employees');
    XLSX.writeFile(wb, `${data.title.replace(/[^a-zA-Z0-0]/g, '_')}_DrillDown.xlsx`);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div onClick={onClose} className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />
      <div className="relative w-full max-w-4xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-100 dark:border-slate-800 overflow-hidden z-10 p-6 flex flex-col max-h-[85vh] space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-2xl">
              <Building2 size={22} />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white leading-tight">{data.title}</h3>
              <p className="text-xs text-slate-500">
                Drill-down breakdown for {data.employees.length} employee record(s) • Total Monthly CTC: Rs. {data.totalCTC.toLocaleString()}
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
              Export Excel
            </button>
            <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="relative shrink-0">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search employee in drill-down..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        {/* Employee Table */}
        <div className="flex-1 overflow-y-auto overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-xl">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-500 font-semibold sticky top-0 border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="p-3">Emp ID</th>
                <th className="p-3">Employee Name</th>
                <th className="p-3">Department</th>
                <th className="p-3">Designation</th>
                <th className="p-3 text-right">Basic Salary</th>
                <th className="p-3 text-right">Gross Salary</th>
                <th className="p-3 text-right">Employer SSF</th>
                <th className="p-3 text-right">Monthly CTC</th>
                <th className="p-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-medium">
              {filteredEmployees.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400">
                    No matching employees found in this drill-down selection.
                  </td>
                </tr>
              ) : (
                filteredEmployees.map(emp => {
                  const basic = Number(emp.basicSalary || 0);
                  const da = Number(emp.dearnessAllowance || 0);
                  const other = Number(emp.otherAllowance || emp.allowances || 0);
                  const gross = Number(emp.grossSalary || (basic + da + other));
                  const emprSSF = Number(emp.employerSSF || Math.round(basic * 0.20));
                  const monthlyCTC = Number(emp.monthlyCTC || (gross + emprSSF));

                  return (
                    <tr key={emp.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50">
                      <td className="p-3 font-mono font-bold text-slate-700 dark:text-slate-300">{emp.id}</td>
                      <td className="p-3 font-bold text-slate-900 dark:text-white">{emp.name}</td>
                      <td className="p-3">{emp.department || 'Unassigned'}</td>
                      <td className="p-3">{emp.designation || 'Staff'}</td>
                      <td className="p-3 text-right font-mono">Rs. {basic.toLocaleString()}</td>
                      <td className="p-3 text-right font-mono font-bold text-indigo-600 dark:text-indigo-400">Rs. {gross.toLocaleString()}</td>
                      <td className="p-3 text-right font-mono text-slate-500">Rs. {emprSSF.toLocaleString()}</td>
                      <td className="p-3 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">Rs. {monthlyCTC.toLocaleString()}</td>
                      <td className="p-3 text-center">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          emp.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-600'
                        }`}>
                          {emp.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer summary */}
        <div className="flex items-center justify-between pt-2 border-t border-slate-100 dark:border-slate-800 shrink-0 text-xs text-slate-500">
          <span>Showing {filteredEmployees.length} of {data.employees.length} Record(s)</span>
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
