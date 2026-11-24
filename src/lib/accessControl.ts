import type { ModuleKey, SystemRole, SystemUser, UserPermissions } from '../types';

export const SYSTEM_ROLES: SystemRole[] = [
  'Super Admin',
  'Department Head',
  'Supervisor',
  'Section Incharge',
  'Employee'
];

export const ALL_MODULE_DEFINITIONS: Array<{
  key: ModuleKey;
  label: string;
  path: string;
  category: 'Core' | 'Attendance & OT' | 'Operations & Talent' | 'Payroll & Analytics' | 'Administration';
}> = [
  { key: 'dashboard', label: 'Enterprise Dashboard', path: '/', category: 'Core' },
  { key: 'employees', label: 'Employee Directory', path: '/employees', category: 'Core' },
  { key: 'recruitment', label: 'Recruitment', path: '/recruitment', category: 'Operations & Talent' },
  { key: 'onboarding', label: 'Onboarding & Offboarding', path: '/onboarding', category: 'Operations & Talent' },
  { key: 'movementAttrition', label: 'Movement & Attrition', path: '/movement-attrition', category: 'Core' },
  { key: 'attendance', label: 'Attendance Logs', path: '/attendance', category: 'Attendance & OT' },
  { key: 'auditor', label: 'Attendance Auditor', path: '/auditor', category: 'Attendance & OT' },
  { key: 'overtime', label: 'OT Audit Log', path: '/overtime', category: 'Attendance & OT' },
  { key: 'sbl', label: 'SBL Management', path: '/sbl', category: 'Attendance & OT' },
  { key: 'forceAttendance', label: 'Manual Corrections', path: '/force-attendance', category: 'Attendance & OT' },
  { key: 'performance', label: 'Performance & Goals', path: '/performance', category: 'Operations & Talent' },
  { key: 'assets', label: 'Asset Management', path: '/assets', category: 'Operations & Talent' },
  { key: 'projects', label: 'Projects & Timesheets', path: '/projects', category: 'Operations & Talent' },
  { key: 'helpdesk', label: 'HR Helpdesk', path: '/helpdesk', category: 'Operations & Talent' },
  { key: 'documentRequests', label: 'Document Requests', path: '/document-requests', category: 'Operations & Talent' },
  { key: 'salaryAnalysis', label: 'Salary Analysis', path: '/salary-analysis', category: 'Payroll & Analytics' },
  { key: 'payroll', label: 'Payroll & Disburse', path: '/payroll', category: 'Payroll & Analytics' },
  { key: 'reports', label: 'Analytic Reports', path: '/reports', category: 'Payroll & Analytics' },
  { key: 'devices', label: 'Device Setup', path: '/devices', category: 'Administration' },
  { key: 'import', label: 'Master Data Import', path: '/import', category: 'Administration' },
  { key: 'automations', label: 'Automations & Alerts', path: '/automations', category: 'Administration' },
  { key: 'integrations', label: 'Integrations & API', path: '/integrations', category: 'Administration' },
  { key: 'auditLogs', label: 'System Audit Log', path: '/audit-logs', category: 'Administration' },
  { key: 'settings', label: 'Configuration', path: '/settings', category: 'Administration' },
  { key: 'userAccess', label: 'User & Role Config', path: '/user-access', category: 'Administration' }
];

export const PATH_TO_MODULE_KEY: Record<string, ModuleKey> = ALL_MODULE_DEFINITIONS.reduce((acc, m) => {
  acc[m.path] = m.key;
  return acc;
}, {} as Record<string, ModuleKey>);

function allModules(enabled: boolean): Record<ModuleKey, boolean> {
  return {
    dashboard: enabled,
    employees: enabled,
    recruitment: enabled,
    onboarding: enabled,
    movementAttrition: enabled,
    salaryAnalysis: enabled,
    devices: enabled,
    import: enabled,
    attendance: enabled,
    auditor: enabled,
    auditLogs: enabled,
    overtime: enabled,
    sbl: enabled,
    forceAttendance: enabled,
    performance: enabled,
    assets: enabled,
    helpdesk: enabled,
    projects: enabled,
    documentRequests: enabled,
    payroll: enabled,
    reports: enabled,
    automations: enabled,
    integrations: enabled,
    settings: enabled,
    userAccess: enabled,
    admin: enabled
  };
}

export function getDefaultPermissionsForRole(role: SystemRole): UserPermissions {
  if (role === 'Super Admin') {
    return {
      modules: allModules(true),
      canViewSalary: true,
      canEditAttendance: true,
      canSubmitSupervisorOt: true,
      canApproveOt: true,
      canApprovePayroll: true,
      canExportReports: true,
      canManageShifts: true
    };
  }

  if (role === 'Department Head') {
    return {
      modules: {
        ...allModules(false),
        dashboard: true,
        employees: true,
        recruitment: true,
        onboarding: true,
        movementAttrition: true,
        attendance: true,
        auditor: true,
        overtime: true,
        sbl: true,
        forceAttendance: true,
        performance: true,
        assets: true,
        projects: true,
        helpdesk: true,
        documentRequests: true,
        salaryAnalysis: true,
        payroll: true,
        reports: true
      },
      canViewSalary: true,
      canEditAttendance: true,
      canSubmitSupervisorOt: true,
      canApproveOt: true,
      canApprovePayroll: false,
      canExportReports: true,
      canManageShifts: true
    };
  }

  if (role === 'Supervisor') {
    return {
      modules: {
        ...allModules(false),
        dashboard: true,
        employees: true,
        onboarding: true,
        attendance: true,
        auditor: true,
        overtime: true,
        sbl: true,
        forceAttendance: true,
        performance: true,
        assets: true,
        projects: true,
        helpdesk: true,
        documentRequests: true,
        reports: true
      },
      canViewSalary: false,
      canEditAttendance: true,
      canSubmitSupervisorOt: true,
      canApproveOt: false,
      canApprovePayroll: false,
      canExportReports: true,
      canManageShifts: true
    };
  }

  if (role === 'Section Incharge') {
    return {
      modules: {
        ...allModules(false),
        dashboard: true,
        employees: true,
        attendance: true,
        auditor: true,
        overtime: true,
        sbl: true,
        performance: true,
        projects: true,
        helpdesk: true,
        documentRequests: true,
        reports: true
      },
      canViewSalary: false,
      canEditAttendance: false,
      canSubmitSupervisorOt: true,
      canApproveOt: false,
      canApprovePayroll: false,
      canExportReports: true,
      canManageShifts: true
    };
  }

  // Employee self-service role (strictly own data only)
  return {
    modules: {
      ...allModules(false),
      dashboard: true,
      attendance: true,
      overtime: true,
      sbl: true,
      performance: true,
      projects: true,
      helpdesk: true,
      documentRequests: true,
      payroll: true
    },
    canViewSalary: true,
    canEditAttendance: false,
    canSubmitSupervisorOt: false,
    canApproveOt: false,
    canApprovePayroll: false,
    canExportReports: false,
    canManageShifts: false
  };
}

export function normalizeRoleName(rawRole: unknown): SystemRole {
  const s = String(rawRole || '').trim().toLowerCase();
  if (s === 'super admin' || s === 'super_admin' || s === 'admin' || s === 'owner') return 'Super Admin';
  if (s === 'department head' || s === 'dept head' || s === 'department_head' || s === 'hod' || s === 'hr') return 'Department Head';
  if (s === 'supervisor' || s === 'editor') return 'Supervisor';
  if (s === 'section incharge' || s === 'section_incharge' || s === 'incharge') return 'Section Incharge';
  if (s === 'employee' || s === 'staff') return 'Employee';
  return 'Supervisor';
}

export function normalizeSystemUser(raw: any): SystemUser {
  const role = normalizeRoleName(raw?.role);
  const defaults = getDefaultPermissionsForRole(role);
  const rawPerms = raw?.permissions || {};
  const rawMods = rawPerms?.modules || {};

  const mergedModules = { ...defaults.modules };
  for (const def of ALL_MODULE_DEFINITIONS) {
    if (typeof rawMods[def.key] === 'boolean') {
      mergedModules[def.key] = rawMods[def.key];
    }
  }
  if (role === 'Super Admin') {
    mergedModules.userAccess = true;
    mergedModules.admin = true;
  } else {
    // Non-Super Admins never hold Super Admin management routes unless explicitly super admin
    mergedModules.userAccess = false;
    mergedModules.admin = false;
  }

  const normalizeStrArray = (v: unknown): string[] => {
    if (!Array.isArray(v)) return [];
    return Array.from(new Set(v.map(x => String(x || '').trim()).filter(Boolean)));
  };

  return {
    id: String(raw?.id || `user_${Date.now()}`),
    username: String(raw?.username || raw?.displayName || String(raw?.email || 'User').split('@')[0]).trim(),
    email: String(raw?.email || '').trim().toLowerCase(),
    role,
    status: String(raw?.status || 'Active').toLowerCase() === 'suspended' ? 'Suspended' : 'Active',
    assignedDepartments: normalizeStrArray(raw?.assignedDepartments),
    assignedSections: normalizeStrArray(raw?.assignedSections),
    linkedEmployeeId: raw?.linkedEmployeeId ? String(raw.linkedEmployeeId).trim() : undefined,
    permissions: {
      modules: mergedModules,
      canViewSalary: typeof rawPerms.canViewSalary === 'boolean' ? rawPerms.canViewSalary : defaults.canViewSalary,
      canEditAttendance: typeof rawPerms.canEditAttendance === 'boolean' ? rawPerms.canEditAttendance : defaults.canEditAttendance,
      canSubmitSupervisorOt: typeof rawPerms.canSubmitSupervisorOt === 'boolean' ? rawPerms.canSubmitSupervisorOt : defaults.canSubmitSupervisorOt,
      canApproveOt: typeof rawPerms.canApproveOt === 'boolean' ? rawPerms.canApproveOt : defaults.canApproveOt,
      canApprovePayroll: typeof rawPerms.canApprovePayroll === 'boolean' ? rawPerms.canApprovePayroll : defaults.canApprovePayroll,
      canExportReports: typeof rawPerms.canExportReports === 'boolean' ? rawPerms.canExportReports : defaults.canExportReports,
      canManageShifts: typeof rawPerms.canManageShifts === 'boolean' ? rawPerms.canManageShifts : defaults.canManageShifts
    },
    notes: raw?.notes ? String(raw.notes) : '',
    createdBy: raw?.createdBy ? String(raw.createdBy) : undefined,
    createdAt: raw?.createdAt,
    updatedAt: raw?.updatedAt
  };
}

function normToken(v: unknown): string {
  return String(v || '').trim().toLowerCase();
}

function normEmpNum(v: unknown): string {
  const s = String(v || '').trim();
  const digits = s.replace(/[^0-9]/g, '').replace(/^0+/, '');
  return digits || s.toLowerCase();
}

export function isEmployeeInUserScope(
  emp: { id?: string; department?: string; section?: string },
  userProfile: SystemUser | null
): boolean {
  if (!userProfile) return true;
  if (userProfile.role === 'Super Admin') return true;
  if (userProfile.status === 'Suspended') return false;

  const empId = String(emp.id || '').trim();
  const empDept = normToken(emp.department);
  const empSection = normToken(emp.section);

  if (userProfile.role === 'Employee') {
    if (!userProfile.linkedEmployeeId || !empId) return false;
    const target = String(userProfile.linkedEmployeeId).trim();
    return empId === target || normEmpNum(empId) === normEmpNum(target);
  }

  const depts = new Set(userProfile.assignedDepartments.map(normToken).filter(Boolean));
  const secs = new Set(userProfile.assignedSections.map(normToken).filter(Boolean));

  if (userProfile.role === 'Department Head') {
    if (depts.size === 0) return false;
    if (!empDept || !depts.has(empDept)) return false;
    if (secs.size > 0 && (!empSection || !secs.has(empSection))) return false;
    return true;
  }

  if (userProfile.role === 'Supervisor') {
    if (depts.size === 0 && secs.size === 0) return false;
    if (depts.size > 0 && (!empDept || !depts.has(empDept))) return false;
    if (secs.size > 0 && (!empSection || !secs.has(empSection))) return false;
    return true;
  }

  if (userProfile.role === 'Section Incharge') {
    if (secs.size === 0) return false;
    if (!empSection || !secs.has(empSection)) return false;
    if (depts.size > 0 && (!empDept || !depts.has(empDept))) return false;
    return true;
  }

  return false;
}

export function formatUserScopeSummary(userProfile: SystemUser | null): string {
  if (!userProfile) return 'Full System Access';
  if (userProfile.role === 'Super Admin') return 'All Departments · All Sections (Full System)';
  if (userProfile.role === 'Employee') {
    return userProfile.linkedEmployeeId ? `Self Only (Emp #${userProfile.linkedEmployeeId})` : 'Unlinked Employee';
  }
  const parts: string[] = [];
  if (userProfile.assignedDepartments.length > 0) {
    parts.push(`Dept: ${userProfile.assignedDepartments.join(', ')}`);
  }
  if (userProfile.assignedSections.length > 0) {
    parts.push(`Section: ${userProfile.assignedSections.join(', ')}`);
  }
  return parts.length > 0 ? parts.join(' · ') : 'No Concern Scope Assigned';
}
