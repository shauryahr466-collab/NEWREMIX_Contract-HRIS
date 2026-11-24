import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Webhook, Cpu, KeyRound, Plus, Copy, Trash2, Save, Server, Mail,
  MessageSquare, Video, HardDrive, ArrowUpRight, CheckCircle2
} from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '../store';
import { generateId } from '../lib/utils';
import { PageHeader, Card, Button, Input, Badge } from '../components/ui';
import type { ApiTokenRecord, PlatformIntegrationsConfig } from '../types';

export default function Integrations() {
  const { settings, setSettings, zkDevices } = useAppStore();
  const [config, setConfig] = useState<PlatformIntegrationsConfig>(settings.platformConfig || {});
  const [newTokenName, setNewTokenName] = useState('');
  const [newTokenScope, setNewTokenScope] = useState<ApiTokenRecord['scope']>('Mobile Check-In');
  const [revealedToken, setRevealedToken] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setConfig(settings.platformConfig || {});
  }, [settings]);

  const tokens = config.apiTokens || [];

  const handleSaveConfig = async (nextConfig = config) => {
    setIsSaving(true);
    try {
      await setSettings({
        ...settings,
        platformConfig: nextConfig,
      });
      toast.success('Platform integration settings saved to SQLite.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTokenName.trim()) {
      toast.error('Provide a label for the API token.');
      return;
    }
    const rawSecret = `hris_live_${generateId()}${generateId()}`;
    const record: ApiTokenRecord = {
      id: `tok_${generateId()}`,
      name: newTokenName.trim(),
      prefix: `${rawSecret.slice(0, 14)}...`,
      scope: newTokenScope,
      createdAt: new Date().toISOString().slice(0, 10),
      active: true,
    };
    const nextConfig: PlatformIntegrationsConfig = {
      ...config,
      apiTokens: [record, ...tokens],
    };
    setConfig(nextConfig);
    setRevealedToken(rawSecret);
    setNewTokenName('');
    await handleSaveConfig(nextConfig);
  };

  const handleRevokeToken = async (id: string) => {
    const nextConfig: PlatformIntegrationsConfig = {
      ...config,
      apiTokens: tokens.filter((t) => t.id !== id),
    };
    setConfig(nextConfig);
    await handleSaveConfig(nextConfig);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform & Integrations Hub"
        description="LAN biometric devices, LDAP directory sync, REST API tokens for future mobile app, and communication channels"
        icon={Webhook}
        actions={
          <Button onClick={() => handleSaveConfig()} disabled={isSaving}>
            <Save size={15} /> {isSaving ? 'Saving...' : 'Save All Integrations'}
          </Button>
        }
      />

      {/* Live LAN ZKTeco Status Card */}
      <Card
        title="ZKTeco LAN Biometric Network"
        subtitle="Direct TCP/UDP & ADMS Push integration across company LAN"
        icon={Cpu}
        actions={
          <Link to="/devices">
            <Button variant="outline" size="sm">
              Manage Terminals <ArrowUpRight size={13} />
            </Button>
          </Link>
        }
      >
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
            <span className="text-[10px] font-bold uppercase text-slate-400 block">Registered Terminals</span>
            <span className="text-xl font-bold text-slate-900 dark:text-white tabular-nums mt-1 block">
              {zkDevices.length} Devices
            </span>
          </div>
          <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
            <span className="text-[10px] font-bold uppercase text-slate-400 block">ADMS Push Endpoint</span>
            <code className="text-[11px] font-mono font-bold text-primary mt-1.5 block">/iclock/cdata.aspx</code>
          </div>
          <div className="p-3.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40">
            <span className="text-[10px] font-bold uppercase text-slate-400 block">LAN Agent Bridge</span>
            <span className="inline-flex items-center gap-1.5 text-emerald-600 font-bold mt-1.5">
              <CheckCircle2 size={14} /> Active & Deduped in SQLite
            </span>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* REST API Token Registry (Mobile App Roadmap) */}
        <Card title="REST API & Mobile App Token Registry" icon={KeyRound}>
          <div className="space-y-4">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Generate scoped bearer tokens for future Android/iOS employee check-in apps or external ERP scripts calling <code className="font-mono text-primary">/api/local/*</code>.
            </p>

            <form onSubmit={handleCreateToken} className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
              <div className="sm:col-span-5">
                <Input
                  label="Client / App Name"
                  value={newTokenName}
                  onChange={(e) => setNewTokenName(e.target.value)}
                  placeholder="Mobile App v1"
                />
              </div>
              <div className="sm:col-span-4 space-y-1.5">
                <label className="text-[12px] font-semibold text-slate-700 dark:text-slate-300 block">Scope</label>
                <select
                  value={newTokenScope}
                  onChange={(e) => setNewTokenScope(e.target.value as any)}
                  className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                >
                  <option value="Mobile Check-In">Mobile Check-In</option>
                  <option value="Read-Only">Read-Only</option>
                  <option value="Full Admin">Full Admin</option>
                </select>
              </div>
              <div className="sm:col-span-3">
                <Button type="submit" className="w-full">
                  <Plus size={14} /> Issue
                </Button>
              </div>
            </form>

            {revealedToken && (
              <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 flex items-center justify-between gap-2 text-xs">
                <div className="min-w-0">
                  <p className="font-bold text-emerald-800 dark:text-emerald-300">Copy token now (shown once):</p>
                  <code className="font-mono text-[11px] break-all text-emerald-900 dark:text-emerald-200">
                    {revealedToken}
                  </code>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard?.writeText(revealedToken);
                    toast.success('Copied API token to clipboard.');
                  }}
                >
                  <Copy size={13} />
                </Button>
              </div>
            )}

            <div className="space-y-2">
              {tokens.map((t) => (
                <div
                  key={t.id}
                  className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs"
                >
                  <div>
                    <p className="font-bold text-slate-900 dark:text-white">{t.name}</p>
                    <p className="font-mono text-[11px] text-slate-500">
                      {t.prefix} · Created {t.createdAt}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="info">{t.scope}</Badge>
                    <Button size="sm" variant="ghost" onClick={() => handleRevokeToken(t.id)} className="text-rose-600 px-2">
                      <Trash2 size={13} />
                    </Button>
                  </div>
                </div>
              ))}
              {tokens.length === 0 && (
                <p className="text-xs text-slate-400 text-center py-4">No REST API tokens issued yet.</p>
              )}
            </div>
          </div>
        </Card>

        {/* LDAP / Active Directory Config */}
        <Card title="Employee Directory & LDAP Sync" icon={Server}>
          <div className="space-y-4">
            <label className="flex items-center justify-between p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 cursor-pointer text-xs">
              <div>
                <p className="font-bold text-slate-900 dark:text-white">Enable Company LDAP / AD Binding</p>
                <p className="text-[11px] text-slate-500">Sync organizational units and corporate logins on LAN</p>
              </div>
              <input
                type="checkbox"
                checked={Boolean(config.ldapEnabled)}
                onChange={(e) => setConfig({ ...config, ldapEnabled: e.target.checked })}
                className="h-4 w-4 accent-[#E54F38]"
              />
            </label>
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Input
                  label="LDAP Server Host"
                  value={config.ldapHost || ''}
                  onChange={(e) => setConfig({ ...config, ldapHost: e.target.value })}
                  placeholder="ldap://10.12.10.10"
                />
              </div>
              <Input
                label="Port"
                type="number"
                value={config.ldapPort || 389}
                onChange={(e) => setConfig({ ...config, ldapPort: Number(e.target.value) })}
              />
            </div>
            <Input
              label="Base DN"
              value={config.ldapBaseDn || ''}
              onChange={(e) => setConfig({ ...config, ldapBaseDn: e.target.value })}
              placeholder="dc=company,dc=local"
            />
            <Input
              label="Bind Service User"
              value={config.ldapBindUser || ''}
              onChange={(e) => setConfig({ ...config, ldapBindUser: e.target.value })}
              placeholder="cn=hris-sync,ou=services,dc=company,dc=local"
            />
          </div>
        </Card>

        {/* Email SMTP & Scheduled Reports */}
        <Card title="SMTP Email & Scheduled Report Dispatch" icon={Mail}>
          <div className="space-y-4">
            <div className="grid grid-cols-3 gap-3">
              <div className="col-span-2">
                <Input
                  label="SMTP Relay Host"
                  value={config.smtpHost || ''}
                  onChange={(e) => setConfig({ ...config, smtpHost: e.target.value })}
                  placeholder="smtp.company.com"
                />
              </div>
              <Input
                label="Port"
                type="number"
                value={config.smtpPort || 587}
                onChange={(e) => setConfig({ ...config, smtpPort: Number(e.target.value) })}
              />
            </div>
            <Input
              label="Sender From Address"
              value={config.smtpFromEmail || ''}
              onChange={(e) => setConfig({ ...config, smtpFromEmail: e.target.value })}
              placeholder="hris-noreply@company.com.np"
            />
            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-3">
              <label className="flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200 cursor-pointer">
                <span>Scheduled Attendance & Payroll Email Digest</span>
                <input
                  type="checkbox"
                  checked={Boolean(config.scheduledReportEnabled)}
                  onChange={(e) => setConfig({ ...config, scheduledReportEnabled: e.target.checked })}
                  className="h-4 w-4 accent-[#E54F38]"
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Recipient Email"
                  value={config.scheduledReportEmail || ''}
                  onChange={(e) => setConfig({ ...config, scheduledReportEmail: e.target.value })}
                  placeholder="director@company.com"
                />
                <div className="space-y-1.5">
                  <label className="text-[12px] font-semibold text-slate-700 dark:text-slate-300 block">Schedule</label>
                  <select
                    value={config.scheduledReportFrequency || 'Monthly'}
                    onChange={(e) => setConfig({ ...config, scheduledReportFrequency: e.target.value as any })}
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  >
                    <option value="Daily">Daily</option>
                    <option value="Weekly">Weekly</option>
                    <option value="Monthly">Monthly</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        </Card>

        {/* WhatsApp, Google Meet & External Backup Folder */}
        <Card title="WhatsApp, Google Meet & Offsite Archive" icon={MessageSquare}>
          <div className="space-y-4">
            <Input
              label="WhatsApp Business / HR Desk Number"
              value={config.whatsappBusinessNumber || ''}
              onChange={(e) => setConfig({ ...config, whatsappBusinessNumber: e.target.value })}
              placeholder="+97798XXXXXXXX"
              icon={<MessageSquare size={14} />}
            />
            <Input
              label="Default Google Meet Interview Room URL"
              value={config.googleMeetDefaultRoom || ''}
              onChange={(e) => setConfig({ ...config, googleMeetDefaultRoom: e.target.value })}
              placeholder="https://meet.google.com/hris-interviews"
              icon={<Video size={14} />}
            />
            <Input
              label="Shared Google Drive / NAS Archive Folder URL"
              value={config.googleDriveBackupFolderUrl || ''}
              onChange={(e) => setConfig({ ...config, googleDriveBackupFolderUrl: e.target.value })}
              placeholder="https://drive.google.com/drive/folders/..."
              icon={<HardDrive size={14} />}
            />
          </div>
        </Card>
      </div>
    </div>
  );
}
