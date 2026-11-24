import React, { useState, useEffect, useMemo } from 'react';
import { Target, Plus, Star, CheckCircle2, AlertTriangle, Trash2, X } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useAppStore } from '../store';
import { fetchLocalTable, saveLocalTable, deleteLocalTableRecords } from '../lib/localClient';
import { generateId } from '../lib/utils';
import { getNepaliDate } from '../utils/dateHelper';
import { PageHeader, Card, Button, Input, Badge, KPICard } from '../components/ui';
import type { PerformanceGoal } from '../types';

export default function Performance() {
  const { employees, settings } = useAppStore();
  const [goals, setGoals] = useState<PerformanceGoal[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [form, setForm] = useState({
    employeeId: '',
    title: '',
    metricTarget: '',
    cycle: settings.payrollConfig?.fiscalYear || 'FY 2083/84',
    dueDate: format(new Date(), 'yyyy-MM-dd'),
    feedback: '',
  });

  useEffect(() => {
    fetchLocalTable<PerformanceGoal>('hr_performance_goals').then((rows) => {
      setGoals(rows.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')));
    });
  }, []);

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    const emp = employees.find((item) => item.id === form.employeeId);
    if (!emp || !form.title.trim()) {
      toast.error('Employee and KPI/Goal title are required.');
      return;
    }
    const goal: PerformanceGoal = {
      id: `perf_${generateId()}`,
      employeeId: emp.id,
      employeeName: emp.name,
      department: emp.department || 'Operations',
      title: form.title.trim(),
      metricTarget: form.metricTarget.trim() || '100% completion',
      cycle: form.cycle.trim(),
      dueDate: form.dueDate,
      progressPct: 0,
      managerRating: 4,
      feedback: form.feedback.trim(),
      status: 'On Track',
      updatedAt: new Date().toISOString(),
    };
    if (await saveLocalTable('hr_performance_goals', [goal])) {
      setGoals((prev) => [goal, ...prev]);
      setIsModalOpen(false);
      setForm((prev) => ({ ...prev, title: '', metricTarget: '', feedback: '' }));
      toast.success(`Performance goal assigned to ${emp.name}.`);
    }
  };

  const handleUpdateGoal = async (goal: PerformanceGoal, patch: Partial<PerformanceGoal>) => {
    const progressPct = patch.progressPct ?? goal.progressPct;
    const status: PerformanceGoal['status'] =
      patch.status || (progressPct >= 100 ? 'Completed' : progressPct === 0 ? 'Not Started' : 'On Track');
    const updated: PerformanceGoal = {
      ...goal,
      ...patch,
      status,
      updatedAt: new Date().toISOString(),
    };
    if (await saveLocalTable('hr_performance_goals', [updated])) {
      setGoals((prev) => prev.map((g) => (g.id === goal.id ? updated : g)));
    }
  };

  const handleDelete = async (id: string) => {
    if (await deleteLocalTableRecords('hr_performance_goals', [id])) {
      setGoals((prev) => prev.filter((g) => g.id !== id));
      toast.success('Performance goal removed.');
    }
  };

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return goals.filter(
      (g) =>
        !q ||
        g.employeeName.toLowerCase().includes(q) ||
        g.title.toLowerCase().includes(q) ||
        g.department.toLowerCase().includes(q)
    );
  }, [goals, searchTerm]);

  const avgProgress =
    goals.length > 0 ? Math.round(goals.reduce((s, g) => s + (g.progressPct || 0), 0) / goals.length) : 0;
  const completedCount = goals.filter((g) => g.status === 'Completed').length;
  const atRiskCount = goals.filter((g) => g.status === 'At Risk').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Performance Management"
        description="OKR goal setting, appraisal scorecards, and continuous supervisor feedback"
        icon={Target}
        actions={
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus size={15} /> Assign Goal / KPI
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KPICard label="Active Goals" value={goals.length} icon={Target} trendValue="Tracked OKRs" trend="neutral" />
        <KPICard label="Avg Completion" value={`${avgProgress}%`} icon={Star} trendValue="Organization Score" trend="up" />
        <KPICard label="Completed KPIs" value={completedCount} icon={CheckCircle2} trendValue="Achieved Targets" trend="up" color="success" />
        <KPICard label="At Risk" value={atRiskCount} icon={AlertTriangle} trendValue="Needs Coaching" trend="down" color="danger" />
      </div>

      <Card
        title="Goals & Appraisal Tracker"
        actions={
          <Input
            placeholder="Filter by employee or goal..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-60"
          />
        }
      >
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500">
            No performance goals assigned yet. Click &ldquo;Assign Goal / KPI&rdquo; to launch an evaluation cycle.
          </div>
        ) : (
          <div className="space-y-4">
            {filtered.map((g) => (
              <div
                key={g.id}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white">{g.title}</h4>
                      <Badge
                        variant={
                          g.status === 'Completed'
                            ? 'success'
                            : g.status === 'At Risk'
                              ? 'danger'
                              : g.status === 'On Track'
                                ? 'info'
                                : 'muted'
                        }
                      >
                        {g.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      <span className="font-semibold text-slate-800 dark:text-slate-200">{g.employeeName}</span> ({g.employeeId} · {g.department}) · Target: {g.metricTarget}
                    </p>
                  </div>
                  <div className="text-right text-xs tabular-nums">
                    <p className="font-semibold text-slate-700 dark:text-slate-300">Due: {g.dueDate}</p>
                    <p className="text-[10px] text-primary">BS {getNepaliDate(g.dueDate)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-center">
                  <div className="md:col-span-6 space-y-1">
                    <div className="flex justify-between text-[11px] font-bold">
                      <span className="text-slate-500">Goal Progress</span>
                      <span className="text-primary tabular-nums">{g.progressPct}%</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      step={5}
                      value={g.progressPct}
                      onChange={(e) => handleUpdateGoal(g, { progressPct: Number(e.target.value) })}
                      className="w-full accent-[#E54F38] cursor-pointer"
                    />
                  </div>

                  <div className="md:col-span-4 flex items-center gap-2">
                    <span className="text-[11px] font-semibold text-slate-500">Manager Rating:</span>
                    {[1, 2, 3, 4, 5].map((score) => (
                      <button
                        key={score}
                        type="button"
                        onClick={() => handleUpdateGoal(g, { managerRating: score })}
                        className={`w-6 h-6 rounded text-xs font-bold tabular-nums transition-colors ${
                          (g.managerRating || 0) >= score
                            ? 'bg-primary text-white'
                            : 'bg-slate-200 dark:bg-slate-700 text-slate-500'
                        }`}
                      >
                        {score}
                      </button>
                    ))}
                  </div>

                  <div className="md:col-span-2 flex justify-end">
                    <Button size="sm" variant="ghost" onClick={() => handleDelete(g.id)} className="text-rose-600">
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Assign Performance Goal</h3>
              <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateGoal} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-slate-700 dark:text-slate-300 block">Employee</label>
                <select
                  value={form.employeeId}
                  onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                  required
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-white"
                >
                  <option value="">Select Employee...</option>
                  {employees.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.name} ({e.id})
                    </option>
                  ))}
                </select>
              </div>
              <Input
                label="Goal / KPI Title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g., Maintain 98% shift punctuality & zero safety incidents"
                required
              />
              <Input
                label="Measurable Target"
                value={form.metricTarget}
                onChange={(e) => setForm({ ...form, metricTarget: e.target.value })}
                placeholder="e.g., < 2 late days per month"
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Review Cycle"
                  value={form.cycle}
                  onChange={(e) => setForm({ ...form, cycle: e.target.value })}
                />
                <Input
                  label="Due Date"
                  type="date"
                  value={form.dueDate}
                  onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Save Goal</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
