import React from 'react';
import { Filter, RotateCcw, RefreshCw, SlidersHorizontal } from 'lucide-react';
import { SalaryFilterState } from '../../types/salaryAnalysis';
import { Employee } from '../../types';

interface GlobalFilterBarProps {
  filters: SalaryFilterState;
  onChange: (newFilters: SalaryFilterState) => void;
  onReset: () => void;
  onRefresh: () => void;
  employees: Employee[];
}

export function GlobalFilterBar({
  filters,
  onChange,
  onReset,
  onRefresh,
  employees
}: GlobalFilterBarProps) {
  // Extract unique options from actual employee data
  const departments = ['All', ...Array.from(new Set(employees.map(e => e.department).filter(Boolean)))];
  const sections = ['All', ...Array.from(new Set(employees.map(e => e.section).filter(Boolean)))];
  const designations = ['All', ...Array.from(new Set(employees.map(e => e.designation).filter(Boolean)))];
  const grades = ['All', ...Array.from(new Set(employees.map(e => e.grade).filter(Boolean)))];
  const locations = ['All', ...Array.from(new Set(employees.map(e => e.location).filter(Boolean)))];

  const handleChange = (key: keyof SalaryFilterState, value: any) => {
    onChange({ ...filters, [key]: value });
  };

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm space-y-4">
      {/* Top Bar Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
        <div className="flex items-center gap-2">
          <div className="p-2 bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 rounded-xl">
            <SlidersHorizontal size={18} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white leading-none">Global Analytics Filters</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">Filter workforce cost and compensation metrics dynamically</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onReset}
            className="px-3 py-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-all flex items-center gap-1.5"
          >
            <RotateCcw size={14} />
            Reset
          </button>
          <button
            type="button"
            onClick={onRefresh}
            className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-sm flex items-center gap-1.5"
          >
            <RefreshCw size={14} />
            Refresh
          </button>
        </div>
      </div>

      {/* Filter Selectors Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 text-xs">
        {/* Effective Date */}
        <div>
          <label className="font-semibold text-slate-600 dark:text-slate-400 mb-1 block">As Of Date</label>
          <input
            type="date"
            value={filters.effectiveDate}
            onChange={e => handleChange('effectiveDate', e.target.value)}
            className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>

        {/* Fiscal Year */}
        <div>
          <label className="font-semibold text-slate-600 dark:text-slate-400 mb-1 block">Fiscal Year</label>
          <select
            value={filters.fiscalYear}
            onChange={e => handleChange('fiscalYear', e.target.value)}
            className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="All">All Fiscal Years</option>
            <option value="FY 2083/84">FY 2083/84 (2026-27)</option>
            <option value="FY 2082/83">FY 2082/83 (2025-26)</option>
            <option value="FY 2081/82">FY 2081/82 (2024-25)</option>
          </select>
        </div>

        {/* Department */}
        <div>
          <label className="font-semibold text-slate-600 dark:text-slate-400 mb-1 block">Department</label>
          <select
            value={filters.department}
            onChange={e => handleChange('department', e.target.value)}
            className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            {departments.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        {/* Section */}
        <div>
          <label className="font-semibold text-slate-600 dark:text-slate-400 mb-1 block">Section</label>
          <select
            value={filters.section}
            onChange={e => handleChange('section', e.target.value)}
            className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            {sections.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Designation */}
        <div>
          <label className="font-semibold text-slate-600 dark:text-slate-400 mb-1 block">Designation</label>
          <select
            value={filters.designation}
            onChange={e => handleChange('designation', e.target.value)}
            className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            {designations.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>

        {/* Grade */}
        <div>
          <label className="font-semibold text-slate-600 dark:text-slate-400 mb-1 block">Grade</label>
          <select
            value={filters.grade}
            onChange={e => handleChange('grade', e.target.value)}
            className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            {grades.map(g => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>

        {/* Employment Type */}
        <div>
          <label className="font-semibold text-slate-600 dark:text-slate-400 mb-1 block">Employment Type</label>
          <select
            value={filters.employmentType}
            onChange={e => handleChange('employmentType', e.target.value)}
            className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="All">All Types</option>
            <option value="Permanent">Permanent</option>
            <option value="Contract">Contract</option>
            <option value="Probation">Probation</option>
            <option value="Temporary">Temporary</option>
          </select>
        </div>

        {/* Employee Status (Default: Active) */}
        <div>
          <label className="font-semibold text-slate-600 dark:text-slate-400 mb-1 block">Employee Status</label>
          <select
            value={filters.status}
            onChange={e => handleChange('status', e.target.value)}
            className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="Active">Active Only</option>
            <option value="Inactive">Inactive Only</option>
            <option value="All">All Statuses</option>
          </select>
        </div>

        {/* Location / Plant */}
        <div>
          <label className="font-semibold text-slate-600 dark:text-slate-400 mb-1 block">Location / Plant</label>
          <select
            value={filters.location}
            onChange={e => handleChange('location', e.target.value)}
            className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            {locations.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>

        {/* Gender */}
        <div>
          <label className="font-semibold text-slate-600 dark:text-slate-400 mb-1 block">Gender</label>
          <select
            value={filters.gender}
            onChange={e => handleChange('gender', e.target.value)}
            className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="All">All Genders</option>
            <option value="Male">Male</option>
            <option value="Female">Female</option>
            <option value="Other">Other</option>
          </select>
        </div>

        {/* Experience Band */}
        <div>
          <label className="font-semibold text-slate-600 dark:text-slate-400 mb-1 block">Experience Band</label>
          <select
            value={filters.experienceBand}
            onChange={e => handleChange('experienceBand', e.target.value)}
            className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium outline-none focus:ring-2 focus:ring-indigo-500/20"
          >
            <option value="All">All Experience</option>
            <option value="0–1 Year">0–1 Year</option>
            <option value="1–3 Years">1–3 Years</option>
            <option value="3–5 Years">3–5 Years</option>
            <option value="5–10 Years">5–10 Years</option>
            <option value="10+ Years">10+ Years</option>
          </select>
        </div>

        {/* Search Input */}
        <div>
          <label className="font-semibold text-slate-600 dark:text-slate-400 mb-1 block">Search Employee</label>
          <input
            type="text"
            placeholder="Search Name or ID..."
            value={filters.searchTerm}
            onChange={e => handleChange('searchTerm', e.target.value)}
            className="w-full px-2.5 py-1.5 bg-slate-50 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-medium outline-none focus:ring-2 focus:ring-indigo-500/20"
          />
        </div>
      </div>
    </div>
  );
}
