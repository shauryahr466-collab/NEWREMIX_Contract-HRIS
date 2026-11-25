import React, { useMemo, useState } from 'react';
import { useAppStore } from '../store';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, 
  ResponsiveContainer, Cell, PieChart, Pie, Legend
} from 'recharts';
import { 
  Building2, Users, UserCheck, Clock, TrendingUp, 
  Filter, Calendar, ChevronRight, Search, Download,
  BarChart as BarChartIcon
} from 'lucide-react';
import { format, parseISO, isWithinInterval, startOfDay, endOfDay } from 'date-fns';
import { cn } from '../lib/utils';
import { useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { EmployeeListPopup } from './EmployeeListPopup';
import { Input } from './ui';
import { toast } from 'sonner';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import NepaliDate from 'nepali-date-converter';

export function DepartmentInsights() {
  const { employees, processedData, settings, shiftAssignments, openEmployeeProfile } = useAppStore();
  const navigate = useNavigate();

  const [dateRange, setDateRange] = useState({
    start: format(startOfDay(new Date()), 'yyyy-MM-dd'),
    end: format(endOfDay(new Date()), 'yyyy-MM-dd')
  });
  const [selectedDept, setSelectedDept] = useState('All');
  const [selectedContractor, setSelectedContractor] = useState('All');
  const [selectedShift, setSelectedShift] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');

  // Popup state
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const [popupTitle, setPopupTitle] = useState('');
  const [popupEmployees, setPopupEmployees] = useState<any[]>([]);
  const [popupStatus, setPopupStatus] = useState('');

  const departments = useMemo(() => ['All', ...new Set(employees.map(e => e.department).filter(Boolean))], [employees]);
  const contractors = useMemo(() => ['All', ...new Set(employees.map(e => e.contractorName).filter(Boolean))], [employees]);
  const shifts = useMemo(() => ['All', ...(settings.shifts?.map(s => s.name) || [])], [settings.shifts]);
  const statuses = ['All', 'Present', 'Absent', 'Late', 'PWO', 'PPH', 'Public Holiday', 'SPF', 'Early', 'On Time'];

  const getRecordShift = (d: any, emp: any) => {
    const assignment = shiftAssignments.find(a => a.employeeId === d.employeeId && a.date === d.date);
    const shiftId = assignment?.shiftId || d.shiftId || emp?.shiftId;
    const shiftObj = settings.shifts?.find(s => s.id === shiftId);
    return {
      id: shiftId,
      name: shiftObj?.name || 'Day Shift',
      shiftObj
    };
  };

  const filteredData = useMemo(() => {
    let data = processedData.filter(d => {
      const date = parseISO(d.date);
      const isDateInRange = isWithinInterval(date, {
        start: startOfDay(parseISO(dateRange.start)),
        end: endOfDay(parseISO(dateRange.end))
      });
      return isDateInRange;
    });

    return data.filter(d => {
      const emp = employees.find(e => e.id === d.employeeId);
      if (!emp) return false;

      const matchesDept = selectedDept === 'All' || emp.department === selectedDept;
      const matchesContractor = selectedContractor === 'All' || emp.contractorName === selectedContractor;
      const recordShift = getRecordShift(d, emp);
      const matchesShift = selectedShift === 'All' || recordShift.name === selectedShift;
      const matchesStatus = selectedStatus === 'All' || d.status === selectedStatus;

      return matchesDept && matchesContractor && matchesShift && matchesStatus;
    });
  }, [processedData, employees, dateRange, selectedDept, selectedContractor, selectedShift, selectedStatus, settings.shifts, shiftAssignments]);

  const distributionData = useMemo(() => {
    let data = processedData.filter(d => {
      const date = parseISO(d.date);
      const isDateInRange = isWithinInterval(date, {
        start: startOfDay(parseISO(dateRange.start)),
        end: endOfDay(parseISO(dateRange.end))
      });
      return isDateInRange;
    });

    return data.filter(d => {
      const emp = employees.find(e => e.id === d.employeeId);
      if (!emp) return false;

      const matchesDept = selectedDept === 'All' || emp.department === selectedDept;
      const matchesContractor = selectedContractor === 'All' || emp.contractorName === selectedContractor;
      const recordShift = getRecordShift(d, emp);
      const matchesShift = selectedShift === 'All' || recordShift.name === selectedShift;
      // Note: We ignore matchesStatus here for the distribution stats to keep them relative
      return matchesDept && matchesContractor && matchesShift;
    });
  }, [processedData, employees, dateRange, selectedDept, selectedContractor, selectedShift, settings.shifts, shiftAssignments]);

  const activeCounts = useMemo(() => {
    const counts = new Map();
    employees.forEach(e => {
      if (e.status !== 'Active') return;
      const d = e.department || 'Unknown';
      const s = settings.shifts?.find(sh => sh.id === e.shiftId)?.name || 'Day Shift';
      const k = `${d}|${s}`;
      counts.set(k, (counts.get(k) || 0) + 1);
    });
    return counts;
  }, [employees, settings.shifts]);

  const shiftColumns = useMemo(() => {
    if (settings.shifts && settings.shifts.length > 0) {
      return settings.shifts.map(s => s.name);
    }
    return ['Day Shift', 'Night Shift', 'General Shift', 'A Shift', 'B Shift', 'C Shift'];
  }, [settings.shifts]);

  const deptStats = useMemo(() => {
    const statsMap = new Map();
    
    const targetDepts = selectedDept === 'All' ? departments.filter(d => d !== 'All') : [selectedDept];

    targetDepts.forEach(dept => {
      const deptActiveEmployees = employees.filter(e => e.department === dept && e.status === 'Active');
      
      const shiftCounts: Record<string, number> = {};
      shiftColumns.forEach(s => shiftCounts[s] = 0);

      statsMap.set(dept, {
        name: dept,
        active: deptActiveEmployees.length,
        total: 0,
        present: 0,
        absent: 0,
        wo: 0,
        pwo: 0,
        late: 0,
        spf: 0,
        otHours: 0,
        totalManHours: 0,
        shiftCounts
      });
    });

    distributionData.forEach(d => {
      const emp = employees.find(e => e.id === d.employeeId);
      if (!emp) return;
      
      const deptName = emp.department || 'Unknown';
      if (!statsMap.has(deptName)) return;

      const stat = statsMap.get(deptName);
      
      const isPresent = ['Present', 'Late', 'SPF', 'On Time', 'Early', 'PWO', 'PPH'].includes(d.status);
      const isAbsent = d.status === 'Absent';
      const isWO = d.status === 'Weekly Off';
      const isPWO = d.status === 'PWO';

      const recordShift = getRecordShift(d, emp);
      const shiftName = recordShift.name;

      if (isPresent) {
        stat.present += 1;
        stat.total += 1;
        if (isPWO) stat.pwo += 1;
        
        // Count in shift columns interconnected with attendance log
        if (stat.shiftCounts[shiftName] !== undefined) {
          stat.shiftCounts[shiftName] += 1;
        } else {
          const matchedCol = shiftColumns.find(col => 
            shiftName.toLowerCase().includes(col.toLowerCase()) || 
            col.toLowerCase().includes(shiftName.toLowerCase())
          );
          if (matchedCol && stat.shiftCounts[matchedCol] !== undefined) {
            stat.shiftCounts[matchedCol] += 1;
          } else if (shiftColumns.length > 0 && stat.shiftCounts[shiftColumns[0]] !== undefined) {
            stat.shiftCounts[shiftColumns[0]] += 1;
          }
        }
      } else if (isAbsent) {
        stat.absent += 1;
        stat.total += 1;
      } else if (isWO) {
        stat.wo += 1;
        stat.total += 1;
      }
      
      if (d.lateMinutes > 0) stat.late += 1;
      if (d.status === 'SPF') stat.spf += 1;
      
      stat.otHours += d.overtime || 0;
      stat.totalManHours += d.workingHours || 0;
    });

    return Array.from(statsMap.values()).sort((a, b) => b.active - a.active);
  }, [distributionData, employees, departments, selectedDept, shiftColumns, settings.shifts, shiftAssignments]);

  const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

  const totalPresenceRate = useMemo(() => {
    const total = deptStats.reduce((acc, curr) => acc + curr.total, 0);
    const present = deptStats.reduce((acc, curr) => acc + curr.present, 0);
    return total > 0 ? ((present / total) * 100).toFixed(1) : 0;
  }, [deptStats]);

  const handleDrillDown = (dept?: string, status?: string) => {
    let url = '/attendance?';
    if (dept) url += `dept=${encodeURIComponent(dept)}&`;
    if (status) url += `status=${status}&`;
    if (dateRange.start) url += `startDate=${dateRange.start}&`;
    if (dateRange.end) url += `endDate=${dateRange.end}`;
    navigate(url);
  };

  const handleShowPopup = (deptName: string, status: 'Present' | 'Absent' | 'Total' | 'WO' | string) => {
    const isAllDepts = deptName === 'All';
    const isShift = shiftColumns.includes(status);

    const deptEmployees = employees.filter(
      (e) => e.status === 'Active' && (isAllDepts ? (selectedDept === 'All' || e.department === selectedDept) : e.department === deptName)
    );
    const deptPData = distributionData.filter((d) => {
      if (isAllDepts) return true;
      const emp = employees.find((e) => e.id === d.employeeId);
      return emp?.department === deptName;
    });

    let filtered: typeof employees = [];
    if (status === 'Total') {
      filtered = deptEmployees;
    } else if (isShift) {
      const presentIds = new Set<string>();
      deptPData.forEach((d) => {
        const isPresent = ['Present', 'Late', 'SPF', 'On Time', 'Early', 'PWO', 'PPH'].includes(d.status);
        if (!isPresent) return;

        const emp = employees.find((e) => e.id === d.employeeId);
        const recordShift = getRecordShift(d, emp);
        const sName = recordShift.name;

        const matchesExact = sName === status;
        const matchedCol = shiftColumns.find(
          (col) => sName.toLowerCase().includes(col.toLowerCase()) || col.toLowerCase().includes(sName.toLowerCase())
        );
        const fallbackCol = !matchedCol && shiftColumns.length > 0 ? shiftColumns[0] : undefined;

        if (matchesExact || matchedCol === status || fallbackCol === status) {
          presentIds.add(d.employeeId);
        }
      });

      filtered = deptEmployees.filter((e) => presentIds.has(e.id));

      if (!isAllDepts && filtered.length === 0) {
        filtered = deptEmployees.filter((e) => {
          const sObj = settings.shifts?.find((s) => s.id === e.shiftId);
          const sName = sObj?.name || 'Day Shift';
          return sName === status || sName.toLowerCase().includes(status.toLowerCase()) || status.toLowerCase().includes(sName.toLowerCase());
        });
      }
    } else {
      const statusLower = status.toLowerCase();
      if (statusLower === 'present') {
        const presentIds = new Set(
          deptPData
            .filter((d) => ['present', 'late', 'spf', 'on time', 'early', 'pwo', 'pph'].includes(d.status.toLowerCase()))
            .map((d) => d.employeeId)
        );
        filtered = deptEmployees.filter((e) => presentIds.has(e.id));
      } else if (statusLower === 'absent') {
        const absentIds = new Set(deptPData.filter((d) => d.status.toLowerCase() === 'absent').map((d) => d.employeeId));
        filtered = deptEmployees.filter((e) => absentIds.has(e.id));
      } else if (statusLower === 'wo') {
        const woIds = new Set(deptPData.filter((d) => d.status.toLowerCase() === 'weekly off').map((d) => d.employeeId));
        filtered = deptEmployees.filter((e) => woIds.has(e.id));
      } else if (statusLower === 'pwo') {
        const pwoIds = new Set(deptPData.filter((d) => d.status.toLowerCase() === 'pwo').map((d) => d.employeeId));
        filtered = deptEmployees.filter((e) => pwoIds.has(e.id));
      } else if (statusLower === 'late') {
        const lateIds = new Set(deptPData.filter((d) => d.lateMinutes > 0).map((d) => d.employeeId));
        filtered = deptEmployees.filter((e) => lateIds.has(e.id));
      }
    }

    const scopeLabel = isAllDepts ? (selectedDept === 'All' ? 'All Departments' : selectedDept) : deptName;
    const displayStatus = status === 'Total' ? 'Active' : status;
    setPopupTitle(`${displayStatus} Employees - ${scopeLabel}`);
    setPopupStatus(displayStatus);
    setPopupEmployees(filtered);
    setIsPopupOpen(true);
  };

  const handleExport = (type: 'pdf' | 'excel') => {
    const tId = toast.loading(`Generating ${type.toUpperCase()} report...`);
    try {
      if (type === 'excel') {
        const data = deptStats.map(d => ({
          'Department': d.name,
          'Active (Directory)': d.active,
          'Present': d.present,
          'Absent': d.absent,
          'Weekly Off (WO)': d.wo,
          'Present on WO (PWO)': d.pwo,
          ...d.shiftCounts,
          'Late': d.late,
          'SPF (Missing)': d.spf,
          'OT Hours': d.otHours.toFixed(1),
          'Man-Hours': d.totalManHours.toFixed(1),
          'Engagement %': `${Math.round((d.present / (d.total || 1)) * 100) || 0}%`
        }));

        const totals = {
          active: deptStats.reduce((acc, d) => acc + d.active, 0),
          present: deptStats.reduce((acc, d) => acc + d.present, 0),
          absent: deptStats.reduce((acc, d) => acc + d.absent, 0),
          wo: deptStats.reduce((acc, d) => acc + d.wo, 0),
          pwo: deptStats.reduce((acc, d) => acc + d.pwo, 0),
          late: deptStats.reduce((acc, d) => acc + d.late, 0),
          spf: deptStats.reduce((acc, d) => acc + d.spf, 0),
          otHours: deptStats.reduce((acc, d) => acc + d.otHours, 0),
          totalManHours: deptStats.reduce((acc, d) => acc + d.totalManHours, 0),
          total: deptStats.reduce((acc, d) => acc + d.total, 0),
          shiftCounts: shiftColumns.reduce((acc, s) => ({ ...acc, [s]: deptStats.reduce((a, d) => a + (d.shiftCounts[s] || 0), 0) }), {})
        };

        const totalEngagement = totals.total > 0 ? Math.round((totals.present / totals.total) * 100) : 0;

        const footer = {
          'Department': 'Subtotal',
          'Active (Directory)': totals.active,
          'Present': totals.present,
          'Absent': totals.absent,
          'Weekly Off (WO)': totals.wo,
          'Present on WO (PWO)': totals.pwo,
          ...totals.shiftCounts,
          'Late': totals.late,
          'SPF (Missing)': totals.spf,
          'OT Hours': totals.otHours.toFixed(1),
          'Man-Hours': totals.totalManHours.toFixed(1),
          'Engagement %': `${totalEngagement}%`
        };

        const ws = XLSX.utils.json_to_sheet([...data, footer]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Department Insights");
        XLSX.writeFile(wb, `Department_Insights_${dateRange.start}_to_${dateRange.end}.xlsx`);
      } else {
        const doc = new jsPDF('l', 'mm', 'a4');
        const titleDate = format(parseISO(dateRange.start), 'M/d/yyyy');
        const bsDate = new NepaliDate(parseISO(dateRange.start)).format('YYYY/MM/DD');
        
        doc.setFontSize(18);
        doc.setTextColor(0, 0, 0);
        doc.text(`Bio Report on the Date of ${titleDate} (${bsDate} BS)`, 148.5, 15, { align: 'center' });
        
        const tableData = deptStats.map(d => [
          d.name,
          d.active,
          d.present,
          d.absent,
          d.wo,
          d.pwo,
          ...shiftColumns.map(s => d.shiftCounts[s]),
          d.late,
          d.spf,
          d.otHours.toFixed(1),
          d.totalManHours.toFixed(1),
          `${Math.round((d.present / (d.total || 1)) * 100) || 0}%`
        ]);

        const totals = {
          active: deptStats.reduce((acc, d) => acc + d.active, 0),
          present: deptStats.reduce((acc, d) => acc + d.present, 0),
          absent: deptStats.reduce((acc, d) => acc + d.absent, 0),
          wo: deptStats.reduce((acc, d) => acc + d.wo, 0),
          pwo: deptStats.reduce((acc, d) => acc + d.pwo, 0),
          late: deptStats.reduce((acc, d) => acc + d.late, 0),
          spf: deptStats.reduce((acc, d) => acc + d.spf, 0),
          otHours: deptStats.reduce((acc, d) => acc + d.otHours, 0),
          totalManHours: deptStats.reduce((acc, d) => acc + d.totalManHours, 0),
          total: deptStats.reduce((acc, d) => acc + d.total, 0),
          shiftCounts: shiftColumns.map(s => deptStats.reduce((acc, d) => acc + (d.shiftCounts[s] || 0), 0))
        };

        const totalEngagement = totals.total > 0 ? Math.round((totals.present / totals.total) * 100) : 0;

        const footer = [
          'Subtotal',
          totals.active,
          totals.present,
          totals.absent,
          totals.wo,
          totals.pwo,
          ...totals.shiftCounts,
          totals.late,
          totals.spf,
          totals.otHours.toFixed(1),
          totals.totalManHours.toFixed(1),
          `${totalEngagement}%`
        ];

        autoTable(doc, {
          startY: 22,
          head: [['Department', 'Active', 'Present', 'Absent', 'WO', 'PWO', ...shiftColumns, 'Late', 'SPF', 'OT Hrs', 'Man-Hrs', 'Eng %']],
          body: tableData,
          foot: [footer],
          theme: 'grid',
          headStyles: { 
            fillColor: [51, 122, 183], 
            textColor: [255, 255, 255], 
            fontSize: 7,
            fontStyle: 'bold',
            halign: 'center'
          },
          footStyles: {
            fillColor: [51, 122, 183],
            textColor: [255, 255, 255],
            fontSize: 7,
            fontStyle: 'bold',
            halign: 'center'
          },
          columnStyles: {
            0: { fontStyle: 'bold', halign: 'left' }
          },
          styles: { fontSize: 6, cellPadding: 1, halign: 'center' }
        });

        doc.save(`Bio_Report_${dateRange.start}.pdf`);
      }
      toast.success(`${type.toUpperCase()} exported successfully`, { id: tId });
    } catch (error) {
      console.error(error);
      toast.error(`Failed to export ${type.toUpperCase()}`, { id: tId });
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Employee List Popup */}
      <EmployeeListPopup
        isOpen={isPopupOpen}
        onClose={() => setIsPopupOpen(false)}
        title={popupTitle}
        employees={popupEmployees}
        status={popupStatus}
        onEmployeeClick={(id) => {
          openEmployeeProfile(id);
          setIsPopupOpen(false);
        }}
      />
      {/* Filters Section */}
      <div className="bg-white rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/30 p-8">
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-50 rounded-2xl text-indigo-600">
              <Filter size={20} />
            </div>
            <div>
              <h3 className="text-xl font-black text-slate-900">Advanced Filters</h3>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Refine your manpower intelligence</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button 
              onClick={() => handleExport('excel')}
              className="px-6 py-3 bg-emerald-50 text-emerald-600 border border-emerald-100 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-all flex items-center gap-2"
            >
              <Download size={14} />
              Excel
            </button>
            <button 
              onClick={() => handleExport('pdf')}
              className="px-6 py-3 bg-indigo-50 text-indigo-600 border border-indigo-100 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-all flex items-center gap-2"
            >
              <Download size={14} />
              PDF
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-12 gap-6 relative z-30">
          <div className="xl:col-span-3">
            <FilterItem label="Date Range" icon={Calendar}>
               <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <Input 
                    type="date" 
                    value={dateRange.start}
                    onChange={(e) => setDateRange(prev => ({ ...prev, start: e.target.value }))}
                    className="h-10 text-[12px] pl-9 px-2 w-full"
                  />
                  <Input 
                    type="date" 
                    value={dateRange.end}
                    onChange={(e) => setDateRange(prev => ({ ...prev, end: e.target.value }))}
                    className="h-10 text-[12px] pl-9 px-2 w-full"
                  />
               </div>
            </FilterItem>
          </div>

          <div className="xl:col-span-2">
            <FilterItem label="Department" icon={Building2}>
              <select 
                value={selectedDept}
                onChange={(e) => setSelectedDept(e.target.value)}
                className="w-full h-10 px-3 bg-slate-50 border-none rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500/20 appearance-none cursor-pointer"
              >
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </FilterItem>
          </div>

          <div className="xl:col-span-2">
            <FilterItem label="Contractor" icon={Users}>
              <select 
                value={selectedContractor}
                onChange={(e) => setSelectedContractor(e.target.value)}
                className="w-full h-10 px-3 bg-slate-50 border-none rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500/20 appearance-none cursor-pointer"
              >
                {contractors.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </FilterItem>
          </div>

          <div className="xl:col-span-2">
            <FilterItem label="Shift" icon={Clock}>
              <select 
                value={selectedShift}
                onChange={(e) => setSelectedShift(e.target.value)}
                className="w-full h-10 px-3 bg-slate-50 border-none rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500/20 appearance-none cursor-pointer"
              >
                {shifts.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </FilterItem>
          </div>

          <div className="xl:col-span-3">
            <FilterItem label="Status" icon={UserCheck}>
              <select 
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="w-full h-10 px-3 bg-slate-50 border-none rounded-xl text-xs font-bold focus:ring-2 focus:ring-indigo-500/20 appearance-none cursor-pointer"
              >
                {statuses.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </FilterItem>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <InsightCard 
          title="Avg. Presence Rate" 
          value={`${totalPresenceRate}%`} 
          icon={TrendingUp} 
          color="emerald"
          onClick={() => handleDrillDown(selectedDept !== 'All' ? selectedDept : undefined, 'Present')}
        />
        <InsightCard 
          title="Total OT Hours" 
          value={deptStats.reduce((acc, curr) => acc + curr.otHours, 0).toFixed(1)} 
          icon={Clock} 
          color="indigo"
          onClick={() => navigate('/overtime')}
        />
        <InsightCard 
          title="Total Man-Hours" 
          value={Math.round(deptStats.reduce((acc, curr) => acc + curr.totalManHours, 0))} 
          icon={Users} 
          color="amber"
          onClick={() => navigate('/reports')}
        />
        <InsightCard 
          title="Departments Tracked" 
          value={deptStats.length} 
          icon={Building2} 
          color="slate"
        />
      </div>

      {/* Visual Analytics Grid */}
      <div className="space-y-8">
        {/* Department Presence Chart - Small Compact Layout */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/30 p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <BarChartIcon size={16} className="text-indigo-500" />
              Manpower per Department (Compact View)
            </h3>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {deptStats.length} Departments
            </span>
          </div>
          <div className="h-[180px] w-full">
             <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deptStats} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                   <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" />
                   <XAxis type="number" hide />
                   <YAxis 
                    dataKey="name" 
                    type="category" 
                    width={90} 
                    axisLine={false} 
                    tickLine={false} 
                    tick={{ fill: '#64748b', fontSize: 9, fontWeight: 'bold' }} 
                   />
                   <Tooltip 
                    cursor={{ fill: 'rgba(99, 102, 241, 0.05)' }}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', fontSize: '11px' }}
                   />
                   <Bar dataKey="total" radius={[0, 6, 6, 0]} barSize={12}>
                      {deptStats.map((entry, index) => (
                        <Cell 
                          key={`cell-${index}`} 
                          fill={COLORS[index % COLORS.length]} 
                          onClick={() => handleDrillDown(entry.name)}
                          style={{ cursor: 'pointer' }}
                        />
                      ))}
                   </Bar>
                </BarChart>
             </ResponsiveContainer>
          </div>
        </div>

        {/* Detailed Stats Table - Full Width Manpower Distribution Log Layout (Visible All) */}
        <div className="bg-white rounded-3xl border border-slate-100 shadow-xl shadow-slate-200/30 overflow-hidden flex flex-col w-full">
           <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div>
                <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <Users size={18} className="text-emerald-500" />
                  Manpower Distribution Log
                </h3>
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                  Complete breakdown across all active departments and shifts
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 bg-indigo-50 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 rounded-full text-xs font-black">
                  {deptStats.length} Depts Logged
                </span>
              </div>
           </div>
           
           {/* Table wrapper with overflow-x-auto for horizontal scroll if needed, but no height clipping so ALL rows are visible */}
           <div className="w-full overflow-x-auto custom-scrollbar">
               <table className="w-full text-left min-w-[900px]">
                  <thead className="bg-slate-100/70 border-b border-slate-200/60">
                    <tr>
                       <th className="px-4 py-3.5 text-[10px] font-black text-slate-600 uppercase tracking-widest">Department</th>
                       <th className="px-4 py-3.5 text-[10px] font-black text-slate-600 uppercase tracking-widest text-center">Active</th>
                       <th className="px-4 py-3.5 text-[10px] font-black text-emerald-600 uppercase tracking-widest text-center">Present</th>
                       <th className="px-4 py-3.5 text-[10px] font-black text-indigo-600 uppercase tracking-widest text-center">Late</th>
                       <th className="px-4 py-3.5 text-[10px] font-black text-rose-600 uppercase tracking-widest text-center">Absent</th>
                       <th className="px-4 py-3.5 text-[10px] font-black text-amber-600 uppercase tracking-widest text-center">WO</th>
                       <th className="px-4 py-3.5 text-[10px] font-black text-indigo-600 uppercase tracking-widest text-center">PWO</th>
                       {shiftColumns.map(s => (
                         <th key={s} className="px-4 py-3.5 text-[10px] font-black text-indigo-600 uppercase tracking-widest text-center">{s}</th>
                       ))}
                       <th className="px-4 py-3.5 text-right text-[10px] font-black text-slate-600 uppercase tracking-widest">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {deptStats.map(dept => (
                      <tr 
                        key={dept.name} 
                        onClick={() => handleDrillDown(dept.name)}
                        className="hover:bg-indigo-50/30 transition-colors group cursor-pointer"
                      >
                        <td className="px-4 py-4">
                          <p className="text-xs font-black text-slate-900 group-hover:text-indigo-600 transition-colors uppercase leading-tight">{dept.name}</p>
                          <p className="text-[10px] font-bold text-slate-400 mt-0.5 uppercase tracking-wider">{Math.round((dept.present / (dept.total || 1)) * 100) || 0}% Engagement</p>
                        </td>
                        <td 
                          className="px-4 py-4 text-center font-black text-slate-900 hover:text-indigo-600 transition-colors cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleShowPopup(dept.name, 'Total');
                          }}
                        >
                          {dept.active}
                        </td>
                        <td 
                          className="px-4 py-4 text-center cursor-pointer group"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleShowPopup(dept.name, 'Present');
                          }}
                        >
                          <span className="px-2.5 py-1 bg-emerald-50 text-emerald-600 rounded-full text-xs font-black group-hover:bg-emerald-100 transition-all">
                            {dept.present}
                          </span>
                        </td>
                        <td 
                          className="px-4 py-4 text-center cursor-pointer group"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleShowPopup(dept.name, 'Late');
                          }}
                        >
                          <span className="px-2.5 py-1 bg-indigo-50 text-indigo-600 rounded-full text-xs font-black group-hover:bg-indigo-100 transition-all">
                            {dept.late}
                          </span>
                        </td>
                        <td 
                          className="px-4 py-4 text-center cursor-pointer group"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleShowPopup(dept.name, 'Absent');
                          }}
                        >
                          <span className="px-2.5 py-1 bg-rose-50 text-rose-600 rounded-full text-xs font-black group-hover:bg-rose-100 transition-all">
                            {dept.absent}
                          </span>
                        </td>
                        <td 
                          className="px-4 py-4 text-center cursor-pointer group"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleShowPopup(dept.name, 'WO');
                          }}
                        >
                          <span className="px-2.5 py-1 bg-amber-50 text-amber-600 rounded-full text-xs font-black group-hover:bg-amber-100 transition-all">
                            {dept.wo}
                          </span>
                        </td>
                        <td 
                          className="px-4 py-4 text-center cursor-pointer group"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleShowPopup(dept.name, 'PWO');
                          }}
                        >
                          <span className="px-2.5 py-1 bg-indigo-600 text-white rounded-full text-xs font-black group-hover:bg-indigo-700 transition-all">
                            {dept.pwo}
                          </span>
                        </td>
                        {shiftColumns.map(s => (
                          <td 
                            key={s}
                            className="px-4 py-4 text-center font-bold text-slate-600 cursor-pointer hover:text-indigo-600 text-xs"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleShowPopup(dept.name, s);
                            }}
                          >
                            {dept.shiftCounts[s] || 0}
                          </td>
                        ))}
                        <td className="px-4 py-4 text-right">
                          <div
                            className="p-1.5 text-slate-400 group-hover:text-indigo-600 group-hover:bg-indigo-50 rounded-lg transition-all inline-block"
                          >
                             <ChevronRight size={16} strokeWidth={2.5} />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="bg-slate-100/80 font-bold border-t-2 border-slate-200">
                    <tr>
                      <td className="px-4 py-3.5 text-xs font-black text-slate-900 uppercase">Total Subtotal</td>
                      <td
                        onClick={() => handleShowPopup('All', 'Total')}
                        title="Click to view all active employees"
                        className="px-4 py-3.5 text-center font-black text-slate-900 text-xs cursor-pointer hover:bg-slate-200/70 transition-colors"
                      >
                        <span className="underline decoration-dotted underline-offset-4 hover:text-indigo-700">
                          {deptStats.reduce((acc, d) => acc + d.active, 0)}
                        </span>
                      </td>
                      <td
                        onClick={() => handleShowPopup('All', 'Present')}
                        title="Click to view present employees"
                        className="px-4 py-3.5 text-center font-black text-emerald-700 text-xs cursor-pointer hover:bg-emerald-50 transition-colors"
                      >
                        <span className="px-2.5 py-1 bg-emerald-100/80 hover:bg-emerald-200 rounded-full font-black underline decoration-dotted underline-offset-2">
                          {deptStats.reduce((acc, d) => acc + d.present, 0)}
                        </span>
                      </td>
                      <td
                        onClick={() => handleShowPopup('All', 'Late')}
                        title="Click to view late employees"
                        className="px-4 py-3.5 text-center font-black text-indigo-700 text-xs cursor-pointer hover:bg-indigo-50 transition-colors"
                      >
                        <span className="px-2.5 py-1 bg-indigo-100/80 hover:bg-indigo-200 rounded-full font-black underline decoration-dotted underline-offset-2">
                          {deptStats.reduce((acc, d) => acc + d.late, 0)}
                        </span>
                      </td>
                      <td
                        onClick={() => handleShowPopup('All', 'Absent')}
                        title="Click to view absent employees"
                        className="px-4 py-3.5 text-center font-black text-rose-700 text-xs cursor-pointer hover:bg-rose-50 transition-colors"
                      >
                        <span className="px-2.5 py-1 bg-rose-100/80 hover:bg-rose-200 rounded-full font-black underline decoration-dotted underline-offset-2">
                          {deptStats.reduce((acc, d) => acc + d.absent, 0)}
                        </span>
                      </td>
                      <td
                        onClick={() => handleShowPopup('All', 'WO')}
                        title="Click to view weekly off employees"
                        className="px-4 py-3.5 text-center font-black text-amber-700 text-xs cursor-pointer hover:bg-amber-50 transition-colors"
                      >
                        <span className="px-2.5 py-1 bg-amber-100/80 hover:bg-amber-200 rounded-full font-black underline decoration-dotted underline-offset-2">
                          {deptStats.reduce((acc, d) => acc + d.wo, 0)}
                        </span>
                      </td>
                      <td
                        onClick={() => handleShowPopup('All', 'PWO')}
                        title="Click to view PWO employees"
                        className="px-4 py-3.5 text-center font-black text-indigo-700 text-xs cursor-pointer hover:bg-indigo-50 transition-colors"
                      >
                        <span className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full font-black underline decoration-dotted underline-offset-2">
                          {deptStats.reduce((acc, d) => acc + d.pwo, 0)}
                        </span>
                      </td>
                      {shiftColumns.map(s => (
                        <td
                          key={s}
                          onClick={() => handleShowPopup('All', s)}
                          title={`Click to view ${s} employees`}
                          className="px-4 py-3.5 text-center font-black text-indigo-700 text-xs cursor-pointer hover:bg-indigo-50 transition-colors"
                        >
                          <span className="underline decoration-dotted underline-offset-4 hover:text-indigo-900">
                            {deptStats.reduce((acc, d) => acc + (d.shiftCounts[s] || 0), 0)}
                          </span>
                        </td>
                      ))}
                      <td></td>
                    </tr>
                  </tfoot>
              </table>
           </div>
        </div>
      </div>
    </div>
  );
}

function FilterItem({ label, icon: Icon, children }: any) {
  return (
    <div className="space-y-2">
      <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5 ml-1">
        <Icon size={12} />
        {label}
      </label>
      {children}
    </div>
  );
}

function InsightCard({ title, value, icon: Icon, color, onClick }: any) {
  return (
    <motion.div 
      whileHover={onClick ? { y: -5 } : {}}
      onClick={onClick}
      className={cn(
        "p-6 rounded-3xl bg-white border border-slate-100 shadow-xl shadow-slate-200/30 flex items-center gap-6 group relative overflow-hidden",
        onClick && "cursor-pointer"
      )}
    >
      <div className={cn(
        "w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 shadow-lg shadow-slate-100 group-hover:scale-110 transition-transform",
        `bg-${color}-50 text-${color}-600`
      )}>
        <Icon size={24} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest truncate">{title}</p>
        <p className="text-3xl font-black text-slate-900 mt-1 tracking-tighter">{value}</p>
      </div>
      {onClick && (
        <div className="absolute top-4 right-4 text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity">
           <ChevronRight size={16} strokeWidth={3} />
        </div>
      )}
    </motion.div>
  );
}
