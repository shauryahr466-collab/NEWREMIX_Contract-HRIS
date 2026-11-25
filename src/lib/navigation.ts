import {
  LayoutDashboard, Users, FileUp, Fingerprint, FileText, Settings,
  Shield, ShieldAlert, Clock, CalendarRange, UserCheck, Cpu,
  TrendingUp, UserCog, Briefcase, ClipboardCheck, Target, Laptop,
  FolderKanban, LifeBuoy, FileCheck2, BellRing, Webhook,
  ListChecks, TableProperties, CalendarDays
} from 'lucide-react';
import { NepaliRupeeIcon } from '../components/ui';
import type { ModuleKey } from '../types';

export interface NavSubItemConfig {
  to: string;
  tab: string;
  icon: any;
  label: string;
}

export interface NavItemConfig {
  to: string;
  icon: any;
  label: string;
  employeeLabel?: string;
  moduleKey: ModuleKey;
  children?: NavSubItemConfig[];
}

export interface NavGroupConfig {
  id: string;
  label: string;
  items: NavItemConfig[];
}

export const NAV_GROUPS: NavGroupConfig[] = [
  {
    id: 'overview',
    label: 'Overview',
    items: [
      { to: '/', icon: LayoutDashboard, label: 'Enterprise Dashboard', moduleKey: 'dashboard' },
    ],
  },
  {
    id: 'workforce',
    label: 'Workforce & Talent',
    items: [
      { to: '/employees', icon: Users, label: 'Employee Directory', moduleKey: 'employees' },
      { to: '/recruitment', icon: Briefcase, label: 'Recruitment', moduleKey: 'recruitment' },
      { to: '/onboarding', icon: ClipboardCheck, label: 'Onboarding & Offboarding', moduleKey: 'onboarding' },
      { to: '/movement-attrition', icon: UserCheck, label: 'Movement & Attrition', moduleKey: 'movementAttrition' },
    ],
  },
  {
    id: 'attendance',
    label: 'Time & Leave',
    items: [
      {
        to: '/attendance',
        icon: Fingerprint,
        label: 'Attendance Logs',
        employeeLabel: 'My Attendance',
        moduleKey: 'attendance',
        children: [
          { to: '/attendance?tab=reconciliation', tab: 'reconciliation', icon: ListChecks, label: 'Attendance Reconciliation' },
          { to: '/attendance?tab=muster', tab: 'muster', icon: TableProperties, label: 'Monthly Muster' },
          { to: '/attendance?tab=calendar', tab: 'calendar', icon: CalendarDays, label: 'Attendance Calendar' },
          { to: '/attendance?tab=audit', tab: 'audit', icon: ClipboardCheck, label: 'Fresh Attendance Audit' },
        ],
      },
      { to: '/devices', icon: Cpu, label: 'Device Setup', moduleKey: 'devices' },
      { to: '/import', icon: FileUp, label: 'Master Data Import', moduleKey: 'import' },
      { to: '/auditor', icon: ShieldAlert, label: 'Attendance Auditor', moduleKey: 'auditor' },
      { to: '/overtime', icon: Clock, label: 'OT Audit Log', employeeLabel: 'OT Request', moduleKey: 'overtime' },
      { to: '/sbl', icon: CalendarRange, label: 'Leave & SBL', employeeLabel: 'Leave & Substitute Leave', moduleKey: 'sbl' },
      { to: '/force-attendance', icon: UserCheck, label: 'Manual Corrections', employeeLabel: 'Attendance Request', moduleKey: 'forceAttendance' },
    ],
  },
  {
    id: 'operations',
    label: 'Performance & Operations',
    items: [
      { to: '/performance', icon: Target, label: 'Performance & Goals', moduleKey: 'performance' },
      { to: '/assets', icon: Laptop, label: 'Asset Management', moduleKey: 'assets' },
      { to: '/projects', icon: FolderKanban, label: 'Projects & Timesheets', moduleKey: 'projects' },
      { to: '/helpdesk', icon: LifeBuoy, label: 'HR Helpdesk', moduleKey: 'helpdesk' },
      { to: '/document-requests', icon: FileCheck2, label: 'Document Requests', moduleKey: 'documentRequests' },
    ],
  },
  {
    id: 'payroll',
    label: 'Payroll & Reports',
    items: [
      { to: '/payroll', icon: NepaliRupeeIcon, label: 'Payroll & Disburse', moduleKey: 'payroll' },
      { to: '/salary-analysis', icon: TrendingUp, label: 'Salary Analysis', moduleKey: 'salaryAnalysis' },
      { to: '/reports', icon: FileText, label: 'Analytic Reports', moduleKey: 'reports' },
    ],
  },
  {
    id: 'admin',
    label: 'Platform & Admin',
    items: [
      { to: '/automations', icon: BellRing, label: 'Automations & Alerts', moduleKey: 'automations' },
      { to: '/integrations', icon: Webhook, label: 'Integrations & API', moduleKey: 'integrations' },
      { to: '/settings', icon: Settings, label: 'Configuration', moduleKey: 'settings' },
      { to: '/user-access', icon: UserCog, label: 'User & Role Config', moduleKey: 'userAccess' },
      { to: '/audit-logs', icon: Shield, label: 'Approval & Audit Log', moduleKey: 'auditLogs' },
    ],
  },
];
