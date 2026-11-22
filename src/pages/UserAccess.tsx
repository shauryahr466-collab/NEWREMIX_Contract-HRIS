import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield,
  UserPlus,
  Users,
  Search,
  Edit3,
  Trash2,
  Eye,
  Check,
  X,
  RefreshCw,
  Lock,
  Building2,
  Layers,
  UserCheck,
  RotateCcw,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '../store';
import type { ModuleKey, SystemRole, SystemUser, UserPermissions } from '../types';
import {
  ALL_MODULE_DEFINITIONS,
  SYSTEM_ROLES,
  formatUserScopeSummary,
  getDefaultPermissionsForRole,
  isEmployeeInUserScope
} from '../lib/accessControl';
import { PageHeader, Button, Input } from '../components/ui';
import { cn } from '../lib/utils';

interface ScopeOptionsResponse {
  departments: Array<{ name: string; totalCount: number; activeCount: number }>;
  sections: Array<{ name: string; departments: string[]; totalCount: number; activeCount: number }>;
  employees: Array<{
    id: string;
    name: string;
    department: string;
    section: string;
    designation: string;
    email: string;
    status: string;
  }>;
}

const ACTION_PERMISSION_LABELS: Array<{ key: keyof Omit<UserPermissions, 'modules'>; label: string; hint: string }> = [
  { key: 'canViewSalary', label: 'View Salary & CTC', hint: 'Access pay breakdown and payslips within scope' },
  { key: 'canEditAttendance', label: 'Edit / Regularize Attendance', hint: 'Modify punches or submit manual corrections' },
  { key: 'canSubmitSupervisorOt', label: 'Submit Supervisor OT', hint: 'Log daily overtime claims for scoped team' },
  { key: 'canApproveOt', label: 'Approve Overtime Claims', hint: 'Final OT verification and approval for payroll' },
  { key: 'canApprovePayroll', label: 'Approve Payroll Runs', hint: 'Authorize payroll disbursement within scope' },
  { key: 'canExportReports', label: 'Export Excel / PDF Reports', hint: 'Download attendance and muster sheets' },
  { key: 'canManageShifts', label: 'Assign Shifts & Roster', hint: 'Update daily shift schedules for concern staff' }
];

export function UserAccess() {
  const navigate = useNavigate();
  const {
    isSuperAdmin,
    currentUserProfile,
    setPreviewUserProfile,
    refreshCurrentUserProfile,
    user: authUser
  } = useAppStore();

  const [users, setUsers] = useState<SystemUser[]>([]);
  const [scopeOptions, setScopeOptions] = useState<ScopeOptionsResponse>({
    departments: [],
    sections: [],
    employees: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  // Filters
  const [roleFilter, setRoleFilter] = useState<'All' | SystemRole>('All');
  const [searchQuery, setSearchQuery] = useState('');

  // Form / Editor Modal state
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null);
  const [empPickerSearch, setEmpPickerSearch] = useState('');

  // Form fields
  const [formUsername, setFormUsername] = useState('');
  const [formEmail, setFormEmail] = useState('');
  const [formPassword, setFormPassword] = useState('');
  const [formRole, setFormRole] = useState<SystemRole>('Department Head');
  const [formStatus, setFormStatus] = useState<'Active' | 'Suspended'>('Active');
  const [formDepartments, setFormDepartments] = useState<string[]>([]);
  const [formSections, setFormSections] = useState<string[]>([]);
  const [formLinkedEmployeeId, setFormLinkedEmployeeId] = useState('');
  const [formPermissions, setFormPermissions] = useState<UserPermissions>(() =>
    getDefaultPermissionsForRole('Department Head')
  );
  const [formNotes, setFormNotes] = useState('');

  const callerEmail = currentUserProfile?.email || authUser?.email || '';

  const loadData = async () => {
    setIsLoading(true);
    try {
      const headers: Record<string, string> = {};
      if (callerEmail) headers['x-hris-user-email'] = callerEmail;

      const [usersRes, scopeRes] = await Promise.all([
        fetch('/api/admin/users', { headers }),
        fetch('/api/admin/scope-options', { headers })
      ]);

      if (usersRes.ok) {
        const list = await usersRes.json();
        setUsers(Array.isArray(list) ? list : []);
      }
      if (scopeRes.ok) {
        const opts = await scopeRes.json();
        setScopeOptions({
          departments: Array.isArray(opts?.departments) ? opts.departments : [],
          sections: Array.isArray(opts?.sections) ? opts.sections : [],
          employees: Array.isArray(opts?.employees) ? opts.employees : []
        });
      }
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load user access configuration');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [callerEmail]);

  const openCreateModal = (presetRole: SystemRole = 'Department Head') => {
    setEditingUser(null);
    setFormUsername('');
    setFormEmail('');
    setFormPassword('');
    setFormRole(presetRole);
    setFormStatus('Active');
    setFormDepartments([]);
    setFormSections([]);
    setFormLinkedEmployeeId('');
    setFormPermissions(getDefaultPermissionsForRole(presetRole));
    setFormNotes('');
    setEmpPickerSearch('');
    setIsEditorOpen(true);
  };

  const openEditModal = (u: SystemUser) => {
    setEditingUser(u);
    setFormUsername(u.username || '');
    setFormEmail(u.email || '');
    setFormPassword('');
    setFormRole(u.role);
    setFormStatus(u.status || 'Active');
    setFormDepartments(u.assignedDepartments || []);
    setFormSections(u.assignedSections || []);
    setFormLinkedEmployeeId(u.linkedEmployeeId || '');
    setFormPermissions(JSON.parse(JSON.stringify(u.permissions || getDefaultPermissionsForRole(u.role))));
    setFormNotes(u.notes || '');
    setEmpPickerSearch('');
    setIsEditorOpen(true);
  };

  const handleRoleChange = (nextRole: SystemRole) => {
    setFormRole(nextRole);
    if (!editingUser || editingUser.role !== nextRole) {
      setFormPermissions(getDefaultPermissionsForRole(nextRole));
    }
    if (nextRole === 'Super Admin') {
      setFormDepartments([]);
      setFormSections([]);
      setFormLinkedEmployeeId('');
    } else if (nextRole === 'Employee') {
      setFormDepartments([]);
      setFormSections([]);
    } else {
      setFormLinkedEmployeeId('');
    }
  };

  const toggleDepartment = (dept: string) => {
    setFormDepartments(prev => (prev.includes(dept) ? prev.filter(d => d !== dept) : [...prev, dept]));
  };

  const toggleSection = (sec: string) => {
    setFormSections(prev => (prev.includes(sec) ? prev.filter(s => s !== sec) : [...prev, sec]));
  };

  const toggleModulePermission = (key: ModuleKey) => {
    setFormPermissions(prev => ({
      ...prev,
      modules: {
        ...prev.modules,
        [key]: !prev.modules[key]
      }
    }));
  };

  const toggleActionPermission = (key: keyof Omit<UserPermissions, 'modules'>) => {
    setFormPermissions(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleLinkEmployee = (empId: string) => {
    setFormLinkedEmployeeId(empId);
    const emp = scopeOptions.employees.find(e => e.id === empId);
    if (emp) {
      if (!formUsername.trim()) setFormUsername(emp.name);
      if (!formEmail.trim()) {
        const autoEmail = emp.email || `${emp.name.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/^\.|\.$/g, '') || 'emp'}.${emp.id}@hris.local`;
        setFormEmail(autoEmail);
      }
    }
  };

  // Live preview of how many active employees match the form configuration
  const draftProfile: SystemUser = useMemo(
    () => ({
      id: editingUser?.id || 'draft',
      username: formUsername || 'Draft User',
      email: formEmail || 'draft@hris.local',
      role: formRole,
      status: formStatus,
      assignedDepartments: formDepartments,
      assignedSections: formSections,
      linkedEmployeeId: formLinkedEmployeeId || undefined,
      permissions: formPermissions
    }),
    [editingUser?.id, formUsername, formEmail, formRole, formStatus, formDepartments, formSections, formLinkedEmployeeId, formPermissions]
  );

  const activeSystemEmployees = useMemo(
    () => scopeOptions.employees.filter(e => e.status === 'Active'),
    [scopeOptions.employees]
  );

  const draftMatchedEmployees = useMemo(
    () => activeSystemEmployees.filter(e => isEmployeeInUserScope(e, draftProfile)),
    [activeSystemEmployees, draftProfile]
  );

  const filteredEmployeePicker = useMemo(() => {
    const q = empPickerSearch.trim().toLowerCase();
    const list = activeSystemEmployees;
    if (!q) return list.slice(0, 60);
    return list
      .filter(
        e =>
          e.id.toLowerCase().includes(q) ||
          e.name.toLowerCase().includes(q) ||
          e.department.toLowerCase().includes(q) ||
          e.section.toLowerCase().includes(q)
      )
      .slice(0, 60);
  }, [activeSystemEmployees, empPickerSearch]);

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formUsername.trim()) {
      toast.error('Full Name is required');
      return;
    }
    if (!formEmail.trim()) {
      toast.error('Email / Login ID is required');
      return;
    }
    if (!editingUser && formPassword.trim().length < 4) {
      toast.error('Please enter an initial password (minimum 4 characters)');
      return;
    }

    setIsSaving(true);
    try {
      const endpoint = editingUser ? `/api/admin/users/${encodeURIComponent(editingUser.id)}` : '/api/admin/create-user';
      const method = editingUser ? 'PUT' : 'POST';
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (callerEmail) headers['x-hris-user-email'] = callerEmail;

      const res = await fetch(endpoint, {
        method,
        headers,
        body: JSON.stringify({
          username: formUsername.trim(),
          email: formEmail.trim().toLowerCase(),
          ...(formPassword.trim() ? { password: formPassword.trim() } : {}),
          role: formRole,
          status: formStatus,
          assignedDepartments: formDepartments,
          assignedSections: formSections,
          linkedEmployeeId: formRole === 'Employee' ? formLinkedEmployeeId : undefined,
          permissions: formPermissions,
          notes: formNotes.trim(),
          createdBy: callerEmail || 'Super Admin'
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save user configuration');
      }

      toast.success(
        editingUser
          ? `Updated ${data.user.username} (${data.user.role})`
          : `Created ${data.user.role} account for ${data.user.username}`
      );
      setIsEditorOpen(false);
      await loadData();
      if (callerEmail && data.user.email.toLowerCase() === callerEmail.toLowerCase()) {
        await refreshCurrentUserProfile(callerEmail);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Save failed');
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleUserStatus = async (u: SystemUser) => {
    const nextStatus = u.status === 'Active' ? 'Suspended' : 'Active';
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (callerEmail) headers['x-hris-user-email'] = callerEmail;

      const res = await fetch(`/api/admin/users/${encodeURIComponent(u.id)}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ ...u, status: nextStatus })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update status');
      toast.success(`${u.username} is now ${nextStatus}`);
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Status update failed');
    }
  };

  const handleDeleteUser = async (u: SystemUser) => {
    if (!window.confirm(`Remove user "${u.username}" (${u.email})? They will no longer be able to log in.`)) return;
    try {
      const headers: Record<string, string> = {};
      if (callerEmail) headers['x-hris-user-email'] = callerEmail;

      const res = await fetch(`/api/admin/users/${encodeURIComponent(u.id)}`, {
        method: 'DELETE',
        headers
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to remove user');
      toast.success(`Removed user "${u.username}"`);
      await loadData();
    } catch (err: any) {
      toast.error(err?.message || 'Delete failed');
    }
  };

  const handlePreviewUser = (u: SystemUser) => {
    setPreviewUserProfile(u);
    toast.success(`Previewing portal as ${u.username} (${u.role})`);
    navigate('/');
  };

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = { All: users.length };
    for (const r of SYSTEM_ROLES) counts[r] = 0;
    for (const u of users) counts[u.role] = (counts[u.role] || 0) + 1;
    return counts;
  }, [users]);

  const visibleUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users.filter(u => {
      if (roleFilter !== 'All' && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        u.username.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.role.toLowerCase().includes(q) ||
        u.assignedDepartments.some(d => d.toLowerCase().includes(q)) ||
        u.assignedSections.some(s => s.toLowerCase().includes(q)) ||
        (u.linkedEmployeeId || '').toLowerCase().includes(q)
      );
    });
  }, [users, roleFilter, searchQuery]);

  if (!isSuperAdmin) {
    return (
      <div className="max-w-xl mx-auto mt-16 p-8 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-center space-y-4">
        <div className="w-12 h-12 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center mx-auto text-slate-600 dark:text-slate-300">
          <Lock size={22} />
        </div>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">Super Admin Authorization Required</h2>
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Only a Super Admin can create Department Heads, Supervisors, Section Incharges, and Employee portal accounts or modify concern data scopes.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="User & Role Data Scope Configuration"
        description="Create and manage Super Admin, Department Head, Supervisor, Section Incharge, and Employee accounts with strict concern-only data access."
        icon={Shield}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadData} disabled={isLoading}>
              <RefreshCw size={14} className={cn('mr-1.5', isLoading && 'animate-spin')} />
              Refresh
            </Button>
            <Button size="sm" onClick={() => openCreateModal('Department Head')}>
              <UserPlus size={14} className="mr-1.5" />
              Create User Account
            </Button>
          </div>
        }
      />

      {/* Quick Provision Strip + System Scope Telemetry */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Configured Users</p>
          <p className="text-2xl font-semibold text-slate-900 dark:text-white mt-1 tabular-nums">{users.length}</p>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            {users.filter(u => u.status === 'Active').length} Active · {users.filter(u => u.status === 'Suspended').length} Suspended
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Department Heads & Supervisors</p>
          <p className="text-2xl font-semibold text-slate-900 dark:text-white mt-1 tabular-nums">
            {(roleCounts['Department Head'] || 0) + (roleCounts['Supervisor'] || 0)}
          </p>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            {scopeOptions.departments.length} System Departments Available
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Section Incharges</p>
          <p className="text-2xl font-semibold text-slate-900 dark:text-white mt-1 tabular-nums">
            {roleCounts['Section Incharge'] || 0}
          </p>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            {scopeOptions.sections.length} Operational Sections Available
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4">
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Employee Self-Service Users</p>
          <p className="text-2xl font-semibold text-slate-900 dark:text-white mt-1 tabular-nums">
            {roleCounts['Employee'] || 0}
          </p>
          <p className="text-xs text-slate-500 mt-1 tabular-nums">
            {activeSystemEmployees.length} Active Staff Records
          </p>
        </div>
      </div>

      {/* Role Filter Segmented Bar + Search */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-x-auto">
            {(['All', ...SYSTEM_ROLES] as const).map(role => (
              <button
                key={role}
                type="button"
                onClick={() => setRoleFilter(role)}
                className={cn(
                  'px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 tabular-nums',
                  roleFilter === role
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                )}
              >
                {role} ({roleCounts[role] || 0})
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <div className="relative w-full lg:w-72">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search name, email, department, section..."
                className="pl-9 h-9 text-xs"
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => openCreateModal('Supervisor')} className="whitespace-nowrap shrink-0">
              + Supervisor
            </Button>
            <Button variant="outline" size="sm" onClick={() => openCreateModal('Section Incharge')} className="whitespace-nowrap shrink-0">
              + Section Incharge
            </Button>
            <Button variant="outline" size="sm" onClick={() => openCreateModal('Employee')} className="whitespace-nowrap shrink-0">
              + Employee
            </Button>
          </div>
        </div>

        {/* Users Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 text-xs font-medium text-slate-500 dark:text-slate-400">
                <th className="px-5 py-3">User Account</th>
                <th className="px-5 py-3">Role</th>
                <th className="px-5 py-3">Concern Data Scope</th>
                <th className="px-5 py-3 text-right">Visible Staff</th>
                <th className="px-5 py-3">Access Rights</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-sm">
              {isLoading ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center text-slate-500">
                    <Loader2 size={20} className="animate-spin mx-auto mb-2" />
                    Loading user access configuration...
                  </td>
                </tr>
              ) : visibleUsers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-12 text-center">
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300">No users match the selected filter</p>
                    <p className="text-xs text-slate-500 mt-1">
                      Create a Department Head, Supervisor, Section Incharge, or Employee login to restrict portal data by concern scope.
                    </p>
                    <Button size="sm" className="mt-4" onClick={() => openCreateModal('Department Head')}>
                      <UserPlus size={14} className="mr-1.5" />
                      Create First Department Head
                    </Button>
                  </td>
                </tr>
              ) : (
                visibleUsers.map(u => {
                  const matchedCount = activeSystemEmployees.filter(e => isEmployeeInUserScope(e, u)).length;
                  const enabledModulesCount = Object.values(u.permissions?.modules || {}).filter(Boolean).length;
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="font-medium text-slate-900 dark:text-white">{u.username}</div>
                        <div className="text-xs text-slate-500">{u.email}</div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={cn(
                            'text-xs font-semibold',
                            u.role === 'Super Admin' && 'text-indigo-600 dark:text-indigo-400',
                            u.role === 'Department Head' && 'text-blue-600 dark:text-blue-400',
                            u.role === 'Supervisor' && 'text-emerald-600 dark:text-emerald-400',
                            u.role === 'Section Incharge' && 'text-amber-600 dark:text-amber-400',
                            u.role === 'Employee' && 'text-slate-700 dark:text-slate-300'
                          )}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 max-w-xs">
                        <div className="text-xs text-slate-700 dark:text-slate-300 truncate" title={formatUserScopeSummary(u)}>
                          {formatUserScopeSummary(u)}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-right font-mono text-xs text-slate-700 dark:text-slate-300 tabular-nums">
                        {matchedCount} / {activeSystemEmployees.length}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                          {enabledModulesCount} modules
                          <span aria-hidden="true"> · </span>
                          {u.permissions?.canApproveOt ? 'OT Approve' : u.permissions?.canSubmitSupervisorOt ? 'OT Claim' : 'Read View'}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <span
                          className={cn(
                            'text-xs font-medium',
                            u.status === 'Active' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                          )}
                        >
                          {u.status}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="inline-flex items-center gap-1">
                          {u.role !== 'Super Admin' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handlePreviewUser(u)}
                              title="Preview app exactly as this user sees it"
                              className="h-8 px-2 text-xs"
                            >
                              <Eye size={13} className="mr-1" />
                              Preview
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditModal(u)}
                            title="Edit user role, scope & permissions"
                            className="h-8 px-2 text-xs"
                          >
                            <Edit3 size={13} />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleToggleUserStatus(u)}
                            title={u.status === 'Active' ? 'Suspend account' : 'Activate account'}
                            className="h-8 px-2 text-xs"
                          >
                            {u.status === 'Active' ? 'Suspend' : 'Activate'}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteUser(u)}
                            title="Delete user"
                            className="h-8 px-2 text-xs text-rose-600 hover:text-rose-700"
                          >
                            <Trash2 size={13} />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Create / Edit User Access Configuration Modal */}
      {isEditorOpen && (
        <div className="fixed inset-0 z-[120] bg-slate-950/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-base font-semibold text-slate-900 dark:text-white">
                  {editingUser ? `Edit User Configuration · ${editingUser.username}` : 'Create Role-Based User Account'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Configure login credentials, organizational role, concern scope, and module access permissions.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditorOpen(false)}
                className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Section 1: Identity & Role */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">Role Type</label>
                  <select
                    value={formRole}
                    onChange={e => handleRoleChange(e.target.value as SystemRole)}
                    className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                  >
                    {SYSTEM_ROLES.map(r => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">Full Name</label>
                  <Input
                    value={formUsername}
                    onChange={e => setFormUsername(e.target.value)}
                    placeholder="e.g. Rajesh Sharma"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">Login Email / User ID</label>
                  <Input
                    type="text"
                    value={formEmail}
                    onChange={e => setFormEmail(e.target.value)}
                    placeholder="e.g. mech.head@company.com"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                    {editingUser ? 'New Password (optional)' : 'Login Password'}
                  </label>
                  <Input
                    type="password"
                    value={formPassword}
                    onChange={e => setFormPassword(e.target.value)}
                    placeholder={editingUser ? 'Leave blank to keep existing' : 'Min 4 characters'}
                    required={!editingUser}
                  />
                </div>
              </div>

              {/* Section 2: Concern Data Scope Selector (Dynamic by Role) */}
              <div className="border-t border-slate-200 dark:border-slate-800 pt-5 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Concern Data Scope</h4>
                    <p className="text-xs text-slate-500">
                      {formRole === 'Super Admin' && 'Super Admin has full unrestricted visibility across every department, section, and employee.'}
                      {formRole === 'Department Head' && 'Assign one or more Departments. This Department Head will strictly access data for selected departments only.'}
                      {formRole === 'Supervisor' && 'Assign the Supervisor’s Department(s) and optionally narrow down to specific Section(s).'}
                      {formRole === 'Section Incharge' && 'Assign one or more operational Sections. This incharge will strictly access employees in those sections only.'}
                      {formRole === 'Employee' && 'Link this user account to a single Employee profile. They will only view their own punches, attendance, OT, and payslip.'}
                    </p>
                  </div>
                  <div className="text-xs font-medium text-slate-700 dark:text-slate-300 tabular-nums">
                    Matches <span className="font-semibold text-indigo-600 dark:text-indigo-400">{draftMatchedEmployees.length}</span> of {activeSystemEmployees.length} active employees
                  </div>
                </div>

                {(formRole === 'Department Head' || formRole === 'Supervisor' || formRole === 'Section Incharge') && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Department Selector */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                          <Building2 size={14} />
                          Departments {formRole === 'Section Incharge' ? '(Optional Filter)' : '(Required)'}
                        </span>
                        {formDepartments.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setFormDepartments([])}
                            className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white"
                          >
                            Clear ({formDepartments.length})
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 max-h-52 overflow-y-auto p-1">
                        {scopeOptions.departments.map(dept => {
                          const selected = formDepartments.includes(dept.name);
                          return (
                            <button
                              key={dept.name}
                              type="button"
                              onClick={() => toggleDepartment(dept.name)}
                              className={cn(
                                'flex items-center justify-between px-3 py-2 rounded-lg border text-left text-xs transition-colors',
                                selected
                                  ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 font-medium'
                                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                              )}
                            >
                              <span className="truncate pr-2">{dept.name}</span>
                              <span className="text-[11px] text-slate-500 tabular-nums shrink-0">{dept.activeCount}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Section Selector */}
                    <div>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                          <Layers size={14} />
                          Sections {formRole === 'Section Incharge' ? '(Required)' : '(Optional Narrowing)'}
                        </span>
                        {formSections.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setFormSections([])}
                            className="text-xs text-slate-500 hover:text-slate-900 dark:hover:text-white"
                          >
                            Clear ({formSections.length})
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-2 max-h-52 overflow-y-auto p-1">
                        {scopeOptions.sections.map(sec => {
                          const selected = formSections.includes(sec.name);
                          return (
                            <button
                              key={sec.name}
                              type="button"
                              onClick={() => toggleSection(sec.name)}
                              className={cn(
                                'flex items-center justify-between px-3 py-2 rounded-lg border text-left text-xs transition-colors',
                                selected
                                  ? 'border-amber-600 bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 font-medium'
                                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                              )}
                            >
                              <span className="truncate pr-2" title={`${sec.name} (${sec.departments.join(', ')})`}>
                                {sec.name}
                              </span>
                              <span className="text-[11px] text-slate-500 tabular-nums shrink-0">{sec.activeCount}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {formRole === 'Employee' && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <div className="relative flex-1">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <Input
                          value={empPickerSearch}
                          onChange={e => setEmpPickerSearch(e.target.value)}
                          placeholder="Search employee by Bio ID, Name, Department, or Section..."
                          className="pl-9 h-9 text-xs"
                        />
                      </div>
                      {formLinkedEmployeeId && (
                        <div className="text-xs font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                          <UserCheck size={14} />
                          Linked ID #{formLinkedEmployeeId}
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-52 overflow-y-auto p-1 border border-slate-200 dark:border-slate-800 rounded-lg">
                      {filteredEmployeePicker.map(emp => {
                        const isSelected = formLinkedEmployeeId === emp.id;
                        return (
                          <button
                            key={emp.id}
                            type="button"
                            onClick={() => handleLinkEmployee(emp.id)}
                            className={cn(
                              'flex items-center justify-between px-3 py-2 rounded-lg border text-left text-xs transition-colors',
                              isSelected
                                ? 'border-indigo-600 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-900 dark:text-indigo-200 font-medium'
                                : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                            )}
                          >
                            <div className="min-w-0 pr-2">
                              <div className="truncate font-medium">
                                #{emp.id} · {emp.name}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate">
                                {emp.department || 'General'}
                                {emp.section ? ` / ${emp.section}` : ''}
                              </div>
                            </div>
                            {isSelected && <Check size={14} className="text-indigo-600 shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {formRole !== 'Super Admin' && draftMatchedEmployees.length === 0 && (
                  <div className="flex items-center gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
                    <AlertCircle size={14} className="shrink-0" />
                    <span>No active employees currently match this concern scope. Select valid departments, sections, or employee ID before saving.</span>
                  </div>
                )}
              </div>

              {/* Section 3: Module & Action Permissions */}
              <div className="border-t border-slate-200 dark:border-slate-800 pt-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900 dark:text-white">Module & Action Permissions</h4>
                    <p className="text-xs text-slate-500">
                      Control which navigation tabs and actions this user can perform within their assigned concern scope.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setFormPermissions(getDefaultPermissionsForRole(formRole))}
                  >
                    <RotateCcw size={13} className="mr-1.5" />
                    Reset to {formRole} Defaults
                  </Button>
                </div>

                {/* Modules grid */}
                <div>
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">Visible Portal Modules</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
                    {ALL_MODULE_DEFINITIONS.filter(m => formRole === 'Super Admin' || (m.key !== 'userAccess' && m.key !== 'admin')).map(mod => {
                      const enabled = Boolean(formPermissions.modules[mod.key]);
                      return (
                        <label
                          key={mod.key}
                          className={cn(
                            'flex items-center gap-2 px-3 py-2 rounded-lg border text-xs cursor-pointer transition-colors select-none',
                            enabled
                              ? 'border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium'
                              : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={enabled}
                            disabled={formRole === 'Super Admin'}
                            onChange={() => toggleModulePermission(mod.key)}
                            className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <span className="truncate">{mod.label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Action capabilities */}
                <div>
                  <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">Workflow & Data Capabilities</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {ACTION_PERMISSION_LABELS.map(act => {
                      const checked = Boolean(formPermissions[act.key]);
                      return (
                        <label
                          key={act.key}
                          className={cn(
                            'flex items-start gap-2.5 px-3 py-2.5 rounded-lg border text-xs cursor-pointer transition-colors select-none',
                            checked
                              ? 'border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white'
                              : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400'
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            disabled={formRole === 'Super Admin'}
                            onChange={() => toggleActionPermission(act.key)}
                            className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                          />
                          <div>
                            <div className="font-medium">{act.label}</div>
                            <div className="text-[11px] text-slate-500">{act.hint}</div>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">Account Status</label>
                    <select
                      value={formStatus}
                      onChange={e => setFormStatus(e.target.value as 'Active' | 'Suspended')}
                      className="w-full h-10 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 text-sm text-slate-900 dark:text-white"
                    >
                      <option value="Active">Active (Can Sign In)</option>
                      <option value="Suspended">Suspended (Access Blocked)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">Admin Notes (Optional)</label>
                    <Input
                      value={formNotes}
                      onChange={e => setFormNotes(e.target.value)}
                      placeholder="e.g. Shift A Supervisor for Mechanical dept"
                    />
                  </div>
                </div>
              </div>

              <div className="border-t border-slate-200 dark:border-slate-800 pt-4 flex items-center justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => setIsEditorOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isSaving}>
                  {isSaving && <Loader2 size={14} className="mr-1.5 animate-spin" />}
                  {editingUser ? 'Save User Configuration' : `Create ${formRole}`}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
