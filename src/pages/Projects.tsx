import React, { useState, useEffect, useMemo } from 'react';
import { FolderKanban, Plus, Clock, CheckCircle2, Trash2, X } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useAppStore } from '../store';
import { fetchLocalTable, saveLocalTable, deleteLocalTableRecords } from '../lib/localClient';
import { generateId, cn } from '../lib/utils';
import { getNepaliDate } from '../utils/dateHelper';
import { PageHeader, Card, Button, Input, Badge, KPICard } from '../components/ui';
import type { ProjectRecord, ProjectTask, TimesheetEntry } from '../types';

export default function Projects() {
  const { employees } = useAppStore();
  const [activeTab, setActiveTab] = useState<'projects' | 'timesheets'>('projects');
  const [projects, setProjects] = useState<ProjectRecord[]>([]);
  const [timesheets, setTimesheets] = useState<TimesheetEntry[]>([]);
  const [isProjectModalOpen, setIsProjectModalOpen] = useState(false);
  const [isTimesheetModalOpen, setIsTimesheetModalOpen] = useState(false);
  const [taskInputs, setTaskInputs] = useState<Record<string, string>>({});

  const [projectForm, setProjectForm] = useState({
    code: '',
    name: '',
    department: '',
    managerName: '',
    startDate: format(new Date(), 'yyyy-MM-dd'),
    endDate: '',
  });

  const [tsForm, setTsForm] = useState({
    projectId: '',
    taskTitle: '',
    employeeId: '',
    date: format(new Date(), 'yyyy-MM-dd'),
    hours: 2,
    billable: true,
    notes: '',
  });

  useEffect(() => {
    Promise.all([
      fetchLocalTable<ProjectRecord>('hr_projects'),
      fetchLocalTable<TimesheetEntry>('hr_timesheets'),
    ]).then(([p, ts]) => {
      setProjects(p.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')));
      setTimesheets(ts.sort((a, b) => (b.date || '').localeCompare(a.date || '')));
    });
  }, []);

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectForm.name.trim()) {
      toast.error('Project name is required.');
      return;
    }
    const project: ProjectRecord = {
      id: `prj_${generateId()}`,
      code: projectForm.code.trim().toUpperCase() || `PRJ-${projects.length + 101}`,
      name: projectForm.name.trim(),
      department: projectForm.department.trim() || 'Operations',
      managerName: projectForm.managerName.trim() || 'Project Lead',
      startDate: projectForm.startDate,
      endDate: projectForm.endDate,
      status: 'Active',
      tasks: [],
      createdAt: new Date().toISOString(),
    };
    if (await saveLocalTable('hr_projects', [project])) {
      setProjects((prev) => [project, ...prev]);
      setIsProjectModalOpen(false);
      setProjectForm({
        code: '',
        name: '',
        department: '',
        managerName: '',
        startDate: format(new Date(), 'yyyy-MM-dd'),
        endDate: '',
      });
      toast.success(`Project "${project.name}" created.`);
    }
  };

  const handleAddTask = async (project: ProjectRecord) => {
    const title = (taskInputs[project.id] || '').trim();
    if (!title) return;
    const newTask: ProjectTask = {
      id: `tsk_${generateId()}`,
      title,
      priority: 'Medium',
      status: 'To Do',
    };
    const updated: ProjectRecord = { ...project, tasks: [...(project.tasks || []), newTask] };
    if (await saveLocalTable('hr_projects', [updated])) {
      setProjects((prev) => prev.map((p) => (p.id === project.id ? updated : p)));
      setTaskInputs((prev) => ({ ...prev, [project.id]: '' }));
    }
  };

  const handleToggleTask = async (project: ProjectRecord, taskId: string) => {
    const updated: ProjectRecord = {
      ...project,
      tasks: (project.tasks || []).map((t) =>
        t.id === taskId
          ? { ...t, status: t.status === 'To Do' ? 'In Progress' : t.status === 'In Progress' ? 'Done' : 'To Do' }
          : t
      ),
    };
    if (await saveLocalTable('hr_projects', [updated])) {
      setProjects((prev) => prev.map((p) => (p.id === project.id ? updated : p)));
    }
  };

  const handleLogTimesheet = async (e: React.FormEvent) => {
    e.preventDefault();
    const project = projects.find((p) => p.id === tsForm.projectId);
    const emp = employees.find((item) => item.id === tsForm.employeeId);
    if (!project || !emp || !tsForm.hours) {
      toast.error('Select a project, employee, and logged hours.');
      return;
    }
    const entry: TimesheetEntry = {
      id: `ts_${generateId()}`,
      projectId: project.id,
      projectName: project.name,
      taskTitle: tsForm.taskTitle.trim() || 'General Project Work',
      employeeId: emp.id,
      employeeName: emp.name,
      date: tsForm.date,
      hours: Number(tsForm.hours),
      billable: tsForm.billable,
      notes: tsForm.notes.trim(),
      status: 'Submitted',
      createdAt: new Date().toISOString(),
    };
    if (await saveLocalTable('hr_timesheets', [entry])) {
      setTimesheets((prev) => [entry, ...prev]);
      setIsTimesheetModalOpen(false);
      setTsForm((prev) => ({ ...prev, taskTitle: '', notes: '' }));
      toast.success(`Logged ${entry.hours}h timesheet entry.`);
    }
  };

  const handleApproveTimesheet = async (entry: TimesheetEntry) => {
    const updated: TimesheetEntry = { ...entry, status: 'Approved' };
    if (await saveLocalTable('hr_timesheets', [updated])) {
      setTimesheets((prev) => prev.map((t) => (t.id === entry.id ? updated : t)));
      toast.success('Timesheet approved.');
    }
  };

  const handleDeleteProject = async (id: string) => {
    if (await deleteLocalTableRecords('hr_projects', [id])) {
      setProjects((prev) => prev.filter((p) => p.id !== id));
      toast.success('Project removed.');
    }
  };

  const handleDeleteTimesheet = async (id: string) => {
    if (await deleteLocalTableRecords('hr_timesheets', [id])) {
      setTimesheets((prev) => prev.filter((t) => t.id !== id));
      toast.success('Timesheet entry deleted.');
    }
  };

  const totalHours = useMemo(() => timesheets.reduce((s, t) => s + (t.hours || 0), 0), [timesheets]);
  const totalTasks = useMemo(() => projects.reduce((s, p) => s + (p.tasks?.length || 0), 0), [projects]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects & Timesheets"
        description="Manage company projects, task milestones, and employee timesheet logging"
        icon={FolderKanban}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setIsTimesheetModalOpen(true)}>
              <Clock size={15} /> Log Timesheet
            </Button>
            <Button onClick={() => setIsProjectModalOpen(true)}>
              <Plus size={15} /> New Project
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KPICard label="Active Projects" value={projects.filter((p) => p.status === 'Active').length} icon={FolderKanban} trendValue={`${projects.length} Total`} trend="neutral" />
        <KPICard label="Tracked Tasks" value={totalTasks} icon={CheckCircle2} trendValue="Across Workstreams" trend="up" />
        <KPICard label="Logged Hours" value={`${totalHours}h`} icon={Clock} trendValue={`${timesheets.length} Entries`} trend="up" color="success" />
        <KPICard label="Pending Approvals" value={timesheets.filter((t) => t.status === 'Submitted').length} icon={Clock} trendValue="Timesheet Review" trend="neutral" color="warning" />
      </div>

      <div className="flex items-center gap-1 bg-slate-200/70 dark:bg-slate-800 p-1 rounded-lg w-fit border border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={() => setActiveTab('projects')}
          className={cn(
            'px-4 py-1.5 rounded-md text-[13px] font-semibold transition-all',
            activeTab === 'projects' ? 'bg-white dark:bg-slate-900 text-primary shadow-sm' : 'text-slate-600 dark:text-slate-400'
          )}
        >
          Projects & Tasks ({projects.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('timesheets')}
          className={cn(
            'px-4 py-1.5 rounded-md text-[13px] font-semibold transition-all',
            activeTab === 'timesheets' ? 'bg-white dark:bg-slate-900 text-primary shadow-sm' : 'text-slate-600 dark:text-slate-400'
          )}
        >
          Timesheets ({timesheets.length})
        </button>
      </div>

      {activeTab === 'projects' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {projects.length === 0 ? (
            <Card className="lg:col-span-2 text-center py-12">
              <p className="text-sm font-semibold text-slate-600 dark:text-slate-300 mb-3">No projects created yet</p>
              <Button onClick={() => setIsProjectModalOpen(true)}>
                <Plus size={14} /> Create First Project
              </Button>
            </Card>
          ) : (
            projects.map((p) => {
              const pHours = timesheets.filter((t) => t.projectId === p.id).reduce((s, t) => s + t.hours, 0);
              return (
                <Card
                  key={p.id}
                  title={`${p.code} · ${p.name}`}
                  subtitle={`${p.department} · Lead: ${p.managerName} · ${pHours}h logged`}
                  actions={
                    <div className="flex items-center gap-2">
                      <Badge variant={p.status === 'Active' ? 'success' : 'info'}>{p.status}</Badge>
                      <Button size="sm" variant="ghost" onClick={() => handleDeleteProject(p.id)} className="text-rose-600 px-1.5">
                        <Trash2 size={13} />
                      </Button>
                    </div>
                  }
                >
                  <div className="space-y-3">
                    <div className="flex gap-2">
                      <Input
                        placeholder="Add task milestone..."
                        value={taskInputs[p.id] || ''}
                        onChange={(e) => setTaskInputs((prev) => ({ ...prev, [p.id]: e.target.value }))}
                        className="h-8 text-xs"
                      />
                      <Button size="sm" variant="outline" onClick={() => handleAddTask(p)}>
                        <Plus size={13} /> Add
                      </Button>
                    </div>
                    <div className="space-y-1.5">
                      {(p.tasks || []).map((t) => (
                        <div
                          key={t.id}
                          onClick={() => handleToggleTask(p, t.id)}
                          className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 cursor-pointer hover:border-primary/30 text-xs"
                        >
                          <span className={t.status === 'Done' ? 'line-through text-slate-400' : 'font-medium text-slate-800 dark:text-slate-200'}>
                            {t.title}
                          </span>
                          <Badge variant={t.status === 'Done' ? 'success' : t.status === 'In Progress' ? 'warning' : 'muted'}>
                            {t.status}
                          </Badge>
                        </div>
                      ))}
                      {(!p.tasks || p.tasks.length === 0) && (
                        <p className="text-[11px] text-slate-400 italic">No tasks added yet.</p>
                      )}
                    </div>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      ) : (
        <Card title="Employee Timesheet Ledger">
          {timesheets.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              No timesheets logged yet. Click &ldquo;Log Timesheet&rdquo; above to record project hours.
            </div>
          ) : (
            <div className="overflow-x-auto -mx-5">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/60 border-y border-slate-200 dark:border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>
                    <th className="px-5 py-3">Date (AD / BS)</th>
                    <th className="px-4 py-3">Employee</th>
                    <th className="px-4 py-3">Project & Task</th>
                    <th className="px-4 py-3">Hours</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-5 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {timesheets.map((ts) => (
                    <tr key={ts.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="px-5 py-3 tabular-nums">
                        <span className="font-semibold text-slate-800 dark:text-slate-200 block">{ts.date}</span>
                        <span className="text-[10px] text-primary">BS {getNepaliDate(ts.date)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-bold text-slate-900 dark:text-white">{ts.employeeName}</span>
                        <span className="text-[11px] text-slate-400 block">{ts.employeeId}</span>
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-semibold text-slate-800 dark:text-slate-200 block">{ts.projectName}</span>
                        <span className="text-[11px] text-slate-500">{ts.taskTitle}</span>
                      </td>
                      <td className="px-4 py-3 font-bold tabular-nums text-slate-900 dark:text-white">
                        {ts.hours}h {ts.billable ? '· Billable' : ''}
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={ts.status === 'Approved' ? 'success' : 'warning'}>{ts.status}</Badge>
                      </td>
                      <td className="px-5 py-3 text-right space-x-1">
                        {ts.status !== 'Approved' && (
                          <Button size="sm" variant="outline" onClick={() => handleApproveTimesheet(ts)}>
                            Approve
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" onClick={() => handleDeleteTimesheet(ts.id)} className="text-rose-600 px-2">
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
      )}

      {isProjectModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Create New Project</h3>
              <button type="button" onClick={() => setIsProjectModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateProject} className="space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <Input
                  label="Code"
                  value={projectForm.code}
                  onChange={(e) => setProjectForm({ ...projectForm, code: e.target.value })}
                  placeholder="PRJ-101"
                />
                <div className="col-span-2">
                  <Input
                    label="Project Name"
                    value={projectForm.name}
                    onChange={(e) => setProjectForm({ ...projectForm, name: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Department"
                  value={projectForm.department}
                  onChange={(e) => setProjectForm({ ...projectForm, department: e.target.value })}
                  placeholder="Operations"
                />
                <Input
                  label="Project Lead"
                  value={projectForm.managerName}
                  onChange={(e) => setProjectForm({ ...projectForm, managerName: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Start Date"
                  type="date"
                  value={projectForm.startDate}
                  onChange={(e) => setProjectForm({ ...projectForm, startDate: e.target.value })}
                />
                <Input
                  label="Target End"
                  type="date"
                  value={projectForm.endDate}
                  onChange={(e) => setProjectForm({ ...projectForm, endDate: e.target.value })}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsProjectModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Create Project</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {isTimesheetModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Log Project Timesheet</h3>
              <button type="button" onClick={() => setIsTimesheetModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleLogTimesheet} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-slate-700 dark:text-slate-300 block">Project</label>
                <select
                  value={tsForm.projectId}
                  onChange={(e) => setTsForm({ ...tsForm, projectId: e.target.value })}
                  required
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                >
                  <option value="">Select Project...</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.code} — {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-slate-700 dark:text-slate-300 block">Employee</label>
                <select
                  value={tsForm.employeeId}
                  onChange={(e) => setTsForm({ ...tsForm, employeeId: e.target.value })}
                  required
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                >
                  <option value="">Select Employee...</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.id})
                    </option>
                  ))}
                </select>
              </div>
              <Input
                label="Task Performed"
                value={tsForm.taskTitle}
                onChange={(e) => setTsForm({ ...tsForm, taskTitle: e.target.value })}
                placeholder="Site commissioning / Audit review"
              />
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Date"
                  type="date"
                  value={tsForm.date}
                  onChange={(e) => setTsForm({ ...tsForm, date: e.target.value })}
                  required
                />
                <Input
                  label="Hours"
                  type="number"
                  step="0.5"
                  min={0.5}
                  value={tsForm.hours}
                  onChange={(e) => setTsForm({ ...tsForm, hours: Number(e.target.value) })}
                  required
                />
              </div>
              <label className="flex items-center gap-2 text-xs font-medium text-slate-700 dark:text-slate-300">
                <input
                  type="checkbox"
                  checked={tsForm.billable}
                  onChange={(e) => setTsForm({ ...tsForm, billable: e.target.checked })}
                  className="rounded accent-[#E54F38]"
                />
                Billable Project Hours
              </label>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsTimesheetModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Submit Timesheet</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
