import React, { useState, useEffect } from 'react';
import { BellRing, CheckCheck, Trash2, Save, Mail, MessageSquare, Bell } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '../store';
import { fetchAllNotifications, DEFAULT_AUTOMATION_RULES, emitInAppNotification } from '../lib/notifications';
import { saveLocalTable, deleteLocalTableRecords } from '../lib/localClient';
import { getNepaliDate } from '../utils/dateHelper';
import { PageHeader, Card, Button, Badge } from '../components/ui';
import type { AppNotification, AutomationRule } from '../types';

export default function Automations() {
  const { settings, setSettings } = useAppStore();
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [rules, setRules] = useState<AutomationRule[]>(
    settings.platformConfig?.automationRules?.length
      ? settings.platformConfig.automationRules
      : DEFAULT_AUTOMATION_RULES
  );
  const [isSaving, setIsSaving] = useState(false);

  const loadNotifications = async () => {
    const rows = await fetchAllNotifications();
    setNotifications(rows);
  };

  useEffect(() => {
    loadNotifications();
  }, []);

  useEffect(() => {
    if (settings.platformConfig?.automationRules?.length) {
      setRules(settings.platformConfig.automationRules);
    }
  }, [settings]);

  const toggleRuleChannel = (id: string, channel: 'inAppEnabled' | 'emailEnabled' | 'whatsappEnabled') => {
    setRules((prev) => prev.map((r) => (r.id === id ? { ...r, [channel]: !r[channel] } : r)));
  };

  const handleSaveRules = async () => {
    setIsSaving(true);
    try {
      await setSettings({
        ...settings,
        platformConfig: {
          ...(settings.platformConfig || {}),
          automationRules: rules,
        },
      });
      toast.success('Automation triggers saved to SQLite.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleMarkAllRead = async () => {
    const unread = notifications.filter((n) => !n.read).map((n) => ({ ...n, read: true }));
    if (unread.length === 0) return;
    await saveLocalTable('hr_notifications', unread);
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    toast.success('All notifications marked read.');
  };

  const handleDeleteNotification = async (id: string) => {
    if (await deleteLocalTableRecords('hr_notifications', [id])) {
      setNotifications((prev) => prev.filter((n) => n.id !== id));
    }
  };

  const handleTriggerTestAlert = async () => {
    await emitInAppNotification(
      {
        title: 'Automation Pipeline Verified',
        message: 'Sample HR event dispatched cleanly to SQLite notification feed.',
        category: 'System',
        severity: 'success',
      },
      settings
    );
    await loadNotifications();
    toast.success('Test in-app notification dispatched.');
  };

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Automations & Notification Center"
        description="Configure event-driven in-app, email, and WhatsApp triggers when HR records change"
        icon={BellRing}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleTriggerTestAlert}>
              Send Test Alert
            </Button>
            <Button onClick={handleSaveRules} disabled={isSaving}>
              <Save size={15} /> {isSaving ? 'Saving...' : 'Save Rules'}
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <Card title="Event Automation Rules" className="lg:col-span-7">
          <div className="space-y-3">
            {rules.map((r) => (
              <div
                key={r.id}
                className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-bold text-slate-900 dark:text-white">{r.label}</h4>
                    <span className="text-[10px] font-mono text-slate-400">{r.eventKey}</span>
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{r.description}</p>
                  <p className="text-[10px] font-semibold text-primary mt-1">Recipients: {r.recipients}</p>
                </div>

                <div className="flex items-center gap-3 shrink-0 text-xs">
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={r.inAppEnabled}
                      onChange={() => toggleRuleChannel(r.id, 'inAppEnabled')}
                      className="rounded accent-[#E54F38]"
                    />
                    <Bell size={13} className="text-slate-500" />
                    <span>In-App</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={r.emailEnabled}
                      onChange={() => toggleRuleChannel(r.id, 'emailEnabled')}
                      className="rounded accent-[#E54F38]"
                    />
                    <Mail size={13} className="text-slate-500" />
                    <span>Email</span>
                  </label>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={r.whatsappEnabled}
                      onChange={() => toggleRuleChannel(r.id, 'whatsappEnabled')}
                      className="rounded accent-[#E54F38]"
                    />
                    <MessageSquare size={13} className="text-slate-500" />
                    <span>WhatsApp</span>
                  </label>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card
          className="lg:col-span-5"
          title={`In-App Notification Feed (${unreadCount} unread)`}
          actions={
            <Button size="sm" variant="ghost" onClick={handleMarkAllRead}>
              <CheckCheck size={14} /> Mark Read
            </Button>
          }
        >
          {notifications.length === 0 ? (
            <p className="py-10 text-center text-xs text-slate-400">
              No notifications recorded yet. Events from Recruitment, Helpdesk, Assets, and Document Requests appear here automatically.
            </p>
          ) : (
            <div className="space-y-2.5 max-h-[540px] overflow-y-auto pr-1">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-start justify-between gap-2"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant={n.severity === 'success' ? 'success' : n.severity === 'warning' ? 'warning' : 'info'}>
                        {n.category}
                      </Badge>
                      {!n.read && <span className="text-[10px] font-bold text-primary uppercase">New</span>}
                    </div>
                    <p className="text-xs font-bold text-slate-900 dark:text-white mt-1">{n.title}</p>
                    <p className="text-[11px] text-slate-600 dark:text-slate-400 mt-0.5">{n.message}</p>
                    <p className="text-[10px] text-slate-400 mt-1 tabular-nums">
                      BS {getNepaliDate(n.createdAt.slice(0, 10))} · {new Date(n.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => handleDeleteNotification(n.id)} className="text-slate-400 hover:text-rose-600 px-1.5">
                    <Trash2 size={12} />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
