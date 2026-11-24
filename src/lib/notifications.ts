import { saveLocalTable, fetchLocalTable } from './localClient';
import { generateId } from './utils';
import type { AppNotification, AutomationRule, Settings } from '../types';

export const DEFAULT_AUTOMATION_RULES: AutomationRule[] = [
  {
    id: 'rule_employee_lifecycle',
    eventKey: 'employee.lifecycle',
    label: 'Onboarding & Candidate Hire',
    description: 'Notify HR and IT when a candidate is hired or onboarding checklist is created',
    inAppEnabled: true,
    emailEnabled: true,
    whatsappEnabled: false,
    recipients: 'HR Team, IT Admin',
  },
  {
    id: 'rule_leave_request',
    eventKey: 'leave.submitted',
    label: 'Leave & SBL Workflow',
    description: 'Notify department heads and staff on leave submission or approval',
    inAppEnabled: true,
    emailEnabled: true,
    whatsappEnabled: true,
    recipients: 'Department Head, Employee',
  },
  {
    id: 'rule_asset_assign',
    eventKey: 'asset.assigned',
    label: 'Asset Issue & Return',
    description: 'Alert asset custody owner when company laptops, badges, or tools change hands',
    inAppEnabled: true,
    emailEnabled: false,
    whatsappEnabled: false,
    recipients: 'Admin, Employee',
  },
  {
    id: 'rule_helpdesk_ticket',
    eventKey: 'helpdesk.ticket',
    label: 'Helpdesk Ticket Activity',
    description: 'Notify assigned agent and requester when support tickets open or resolve',
    inAppEnabled: true,
    emailEnabled: true,
    whatsappEnabled: false,
    recipients: 'HR Helpdesk, Requester',
  },
  {
    id: 'rule_doc_request',
    eventKey: 'document.request',
    label: 'Document Request Approval',
    description: 'Notify employee and HR when certificates or NOC letters are requested or approved',
    inAppEnabled: true,
    emailEnabled: true,
    whatsappEnabled: false,
    recipients: 'HR Admin, Requester',
  },
  {
    id: 'rule_payroll_disburse',
    eventKey: 'payroll.disbursed',
    label: 'Monthly Payroll Dispatch',
    description: 'Alert finance & employees when monthly salary runs finalize',
    inAppEnabled: true,
    emailEnabled: true,
    whatsappEnabled: false,
    recipients: 'Payroll Team, Staff',
  },
];

export async function emitInAppNotification(
  params: {
    title: string;
    message: string;
    category: AppNotification['category'];
    severity?: AppNotification['severity'];
    link?: string;
    eventKey?: string;
  },
  settings?: Settings
) {
  try {
    const rules = settings?.platformConfig?.automationRules || DEFAULT_AUTOMATION_RULES;
    if (params.eventKey) {
      const matched = rules.find((r) => r.eventKey === params.eventKey);
      if (matched && !matched.inAppEnabled) return;
    }

    const record: AppNotification = {
      id: `notif_${generateId()}`,
      title: params.title,
      message: params.message,
      category: params.category,
      severity: params.severity || 'info',
      read: false,
      link: params.link,
      createdAt: new Date().toISOString(),
    };
    await saveLocalTable('hr_notifications', [record]);
  } catch {
    // Non-blocking notification helper
  }
}

export async function fetchAllNotifications(): Promise<AppNotification[]> {
  try {
    const rows = await fetchLocalTable<AppNotification>('hr_notifications');
    return rows.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  } catch {
    return [];
  }
}
