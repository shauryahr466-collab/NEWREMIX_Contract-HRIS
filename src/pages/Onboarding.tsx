import React, { useState, useEffect, useMemo } from 'react';
import { ClipboardCheck, Plus, CheckCircle2, Clock, Trash2, Sparkles, X } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useAppStore } from '../store';
import { fetchLocalTable, saveLocalTable, deleteLocalTableRecords } from '../lib/localClient';
import { emitInAppNotification } from '../lib/notifications';
import { generateId, cn } from '../lib/utils';
import { getNepaliDate } from '../utils/dateHelper';
import { PageHeader, Card, Button, Input, Badge, KPICard } from '../components/ui';
import type { LifecycleChecklistItem } from '../types';

const STANDARD_TEMPLATES = {
  Onboarding: [
    { title: 'Verify citizenship / ID & signed contract', ownerRole: 'HR' as const },
    { title: 'Enroll ZKTeco biometric fingerprint / face ID', ownerRole: 'IT' as const },
    { title: 'Issue ID badge, uniform & workstation', ownerRole: 'Admin' as const },
    { title: 'Configure bank account & SSF/PAN payroll profile', ownerRole: 'Payroll' as const },
    { title: 'Department induction & shift schedule briefing', ownerRole: 'Manager' as const },
  ],
  Offboarding: [
    { title: 'Conduct exit interview & document handover', ownerRole: 'HR' as const },
    { title: 'Revoke ZKTeco biometric & system access tokens', ownerRole: 'IT' as const },
    { title: 'Collect returned company laptop, badge & PPE assets', ownerRole: 'Admin' as const },
    { title: 'Process final salary, leave encashment & tax clearance', ownerRole: 'Payroll' as const },
  ],
};

export default function Onboarding() {
  const { employees, settings } = useAppStore();
  const [tasks, setTasks] = useState<LifecycleChecklistItem[]>([]);
  const [workflowTab, setWorkflowTab] = useState<'Onboarding' | 'Offboarding'>('Onboarding');
  const [selectedEmpId, setSelectedEmpId] = useState<string>('All');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [taskForm, setTaskForm] = useState({
    employeeId: '',
    workflowType: 'Onboarding' as 'Onboarding' | 'Offboarding',
    title: '',
    ownerRole: 'HR' as LifecycleChecklistItem['ownerRole'],
    dueDate: format(new Date(), 'yyyy-MM-dd'),
  });

  useEffect(() => {
    fetchLocalTable<LifecycleChecklistItem>('hr_onboarding_tasks').then((rows) => {
      setTasks(rows.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
    });
  }, []);

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const matchTab = t.workflowType === workflowTab;
      const matchEmp = selectedEmpId === 'All' || t.employeeId === selectedEmpId;
      return matchTab && matchEmp;
    });
  }, [tasks, workflowTab, selectedEmpId]);

  const handleApplyTemplate = async () => {
    if (selectedEmpId === 'All') {
      toast.error('Select an employee from the dropdown first to apply a checklist template.');
      return;
    }
    const emp = employees.find((e) => e.id === selectedEmpId);
    if (!emp) return;

    const templateItems = STANDARD_TEMPLATES[workflowTab];
    const todayStr = format(new Date(), 'yyyy-MM-dd');
    const created: LifecycleChecklistItem[] = templateItems.map((tpl) => ({
      id: `lfc_${generateId()}`,
      employeeId: emp.id,
      employeeName: emp.name,
      department: emp.department || 'Operations',
      workflowType: workflowTab,
      title: tpl.title,
      ownerRole: tpl.ownerRole,
      dueDate: todayStr,
      status: 'Pending' as const,
      createdAt: new Date().toISOString(),
    }));

    const ok = await saveLocalTable('hr_onboarding_tasks', created);
    if (ok) {
      setTasks((prev) => [...created, ...prev]);
      await emitInAppNotification(
        {
          title: `${workflowTab} Checklist Initiated`,
          message: `Created ${created.length} ${workflowTab.toLowerCase()} tasks for ${emp.name}.`,
          category: 'System',
          severity: 'info',
          link: '/onboarding',
          eventKey: 'employee.lifecycle',
        },
        settings
      );
      toast.success(`Applied ${workflowTab} checklist for ${emp.name}.`);
    }
  };

  const handleAddTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const emp = employees.find((item) => item.id === taskForm.employeeId);
    if (!emp || !taskForm.title.trim()) {
      toast.error('Employee and task title are required.');
      return;
    }
    const item: LifecycleChecklistItem = {
      id: `lfc_${generateId()}`,
      employeeId: emp.id,
      employeeName: emp.name,
      department: emp.department || 'Operations',
      workflowType: taskForm.workflowType,
      title: taskForm.title.trim(),
      ownerRole: taskForm.ownerRole,
      dueDate: taskForm.dueDate,
      status: 'Pending',
      createdAt: new Date().toISOString(),
    };
    if (await saveLocalTable('hr_onboarding_tasks', [item])) {
      setTasks((prev) => [item, ...prev]);
      setIsModalOpen(false);
      setTaskForm((prev) => ({ ...prev, title: '' }));
      toast.success('Lifecycle task added.');
    }
  };

  const handleToggleStatus = async (item: LifecycleChecklistItem) => {
    const nextStatus: LifecycleChecklistItem['status'] =
      item.status === 'Pending' ? 'In Progress' : item.status === 'In Progress' ? 'Completed' : 'Pending';
    const updated: LifecycleChecklistItem = {
      ...item,
      status: nextStatus,
      completedAt: nextStatus === 'Completed' ? new Date().toISOString() : undefined,
    };
    if (await saveLocalTable('hr_onboarding_tasks', [updated])) {
      setTasks((prev) => prev.map((t) => (t.id === item.id ? updated : t)));
    }
  };

  const handleDelete = async (id: string) => {
    if (await deleteLocalTableRecords('hr_onboarding_tasks', [id])) {
      setTasks((prev) => prev.filter((t) => t.id !== id));
      toast.success('Task deleted.');
    }
  };

  const totalCount = filteredTasks.length;
  const completedCount = filteredTasks.filter((t) => t.status === 'Completed').length;
  const pendingCount = filteredTasks.filter((t) => t.status !== 'Completed').length;
  const completionPct = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Onboarding & Offboarding"
        description="Structured employee lifecycle checklists across HR, IT biometrics, Assets, and Payroll clearances"
        icon={ClipboardCheck}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Button variant="outline" onClick={handleApplyTemplate}>
              <Sparkles size={14} /> Apply Standard {workflowTab} Template
            </Button>
            <Button onClick={() => setIsModalOpen(true)}>
              <Plus size={14} /> Add Task
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard label={`${workflowTab} Tasks`} value={totalCount} icon={ClipboardCheck} trendValue="Total Items" trend="neutral" />
        <KPICard label="Completed Clearances" value={completedCount} icon={CheckCircle2} trendValue={`${completionPct}% Done`} trend="up" color="success" />
        <KPICard label="Pending Actions" value={pendingCount} icon={Clock} trendValue="Requires Follow-up" trend="down" color="warning" />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-1 bg-slate-200/70 dark:bg-slate-800 p-1 rounded-lg border border-slate-200 dark:border-slate-800">
          {(['Onboarding', 'Offboarding'] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setWorkflowTab(tab)}
              className={cn(
                'px-4 py-1.5 rounded-md text-[13px] font-semibold transition-all',
                workflowTab === tab
                  ? 'bg-white dark:bg-slate-900 text-primary shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              )}
            >
              {tab} Workflow
            </button>
          ))}
        </div>

        <select
          value={selectedEmpId}
          onChange={(e) => setSelectedEmpId(e.target.value)}
          className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-800 dark:text-slate-200 min-w-[230px]"
        >
          <option value="All">All Employees</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name} ({e.id})
            </option>
          ))}
        </select>
      </div>

      <Card>
        {totalCount > 0 && (
          <div className="mb-5 p-3.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800">
            <div className="flex items-center justify-between text-xs font-bold mb-1.5">
              <span className="text-slate-700 dark:text-slate-200">{workflowTab} Completion Progress</span>
              <span className="text-primary tabular-nums">{completionPct}%</span>
            </div>
            <div className="h-2 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-primary transition-all duration-300" style={{ width: `${completionPct}%` }} />
            </div>
          </div>
        )}

        {filteredTasks.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500">
            No {workflowTab.toLowerCase()} tasks found. Select an employee above and click &ldquo;Apply Standard {workflowTab} Template&rdquo; or add a custom task.
          </div>
        ) : (
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-y border-slate-200 dark:border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3">Employee</th>
                  <th className="px-4 py-3">Task Description</th>
                  <th className="px-4 py-3">Owner</th>
                  <th className="px-4 py-3">Due Date (AD / BS)</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filteredTasks.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="px-5 py-3">
                      <p className="font-bold text-slate-900 dark:text-white">{t.employeeName}</p>
                      <p className="text-[11px] text-slate-500">{t.employeeId} · {t.department}</p>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{t.title}</td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{t.ownerRole}</Badge>
                    </td>
                    <td className="px-4 py-3 tabular-nums">
                      {t.dueDate ? (
                        <>
                          <span className="font-semibold text-slate-700 dark:text-slate-300 block">{t.dueDate}</span>
                          <span className="text-[10px] text-primary">BS {getNepaliDate(t.dueDate)}</span>
                        </>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button type="button" onClick={() => handleToggleStatus(t)} className="cursor-pointer">
                        <Badge
                          variant={
                            t.status === 'Completed' ? 'success' : t.status === 'In Progress' ? 'warning' : 'muted'
                          }
                        >
                          {t.status}
                        </Badge>
                      </button>
                    </td>
                    <td className="px-5 py-3 text-right space-x-1">
                      <Button size="sm" variant="outline" onClick={() => handleToggleStatus(t)}>
                        {t.status === 'Completed' ? 'Reopen' : 'Advance Status'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(t.id)} className="text-rose-600 px-2">
                        <Trash2 size={13} />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Add Lifecycle Task</h3>
              <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAddTask} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-slate-700 dark:text-slate-300 block">Employee</label>
                <select
                  value={taskForm.employeeId}
                  onChange={(e) => setTaskForm({ ...taskForm, employeeId: e.target.value })}
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
                label="Task Title"
                value={taskForm.title}
                onChange={(e) => setTaskForm({ ...taskForm, title: e.target.value })}
                placeholder="e.g., Issue biometric card & PPE boots"
                required
              />
              <div className="grid grid-cols-3 gap-2">
                <div className="space-y-1.5">
                  <label className="text-[12px] font-semibold text-slate-700 dark:text-slate-300 block">Workflow</label>
                  <select
                    value={taskForm.workflowType}
                    onChange={(e) => setTaskForm({ ...taskForm, workflowType: e.target.value as any })}
                    className="w-full h-9 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  >
                    <option value="Onboarding">Onboarding</option>
                    <option value="Offboarding">Offboarding</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[12px] font-semibold text-slate-700 dark:text-slate-300 block">Owner</label>
                  <select
                    value={taskForm.ownerRole}
                    onChange={(e) => setTaskForm({ ...taskForm, ownerRole: e.target.value as any })}
                    className="w-full h-9 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  >
                    {['HR', 'IT', 'Admin', 'Manager', 'Payroll'].map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <Input
                  label="Due Date"
                  type="date"
                  value={taskForm.dueDate}
                  onChange={(e) => setTaskForm({ ...taskForm, dueDate: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Save Task</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
