import React, { useState, useEffect, useMemo } from 'react';
import { LifeBuoy, Plus, MessageSquare, CheckCircle2, Clock, AlertCircle, Send, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { useAppStore } from '../store';
import { fetchLocalTable, saveLocalTable, deleteLocalTableRecords } from '../lib/localClient';
import { emitInAppNotification } from '../lib/notifications';
import { generateId, cn } from '../lib/utils';
import { getNepaliDate } from '../utils/dateHelper';
import { PageHeader, Card, Button, Input, Badge, KPICard } from '../components/ui';
import type { HelpdeskTicket, TicketComment } from '../types';

export default function Helpdesk() {
  const { employees, effectiveUserProfile, settings } = useAppStore();
  const [tickets, setTickets] = useState<HelpdeskTicket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [commentText, setCommentText] = useState('');

  const [form, setForm] = useState({
    employeeId: effectiveUserProfile?.linkedEmployeeId || '',
    category: 'Payroll' as HelpdeskTicket['category'],
    priority: 'Medium' as HelpdeskTicket['priority'],
    subject: '',
    description: '',
    assignedTo: 'HR Support',
  });

  useEffect(() => {
    fetchLocalTable<HelpdeskTicket>('hr_tickets').then((rows) => {
      const sorted = rows.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
      setTickets(sorted);
      if (sorted.length > 0) setSelectedTicketId(sorted[0].id);
    });
  }, []);

  const handleCreateTicket = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.subject.trim()) {
      toast.error('Ticket subject is required.');
      return;
    }
    const emp = employees.find((item) => item.id === form.employeeId);
    const now = new Date().toISOString();
    const ticket: HelpdeskTicket = {
      id: `tkt_${generateId()}`,
      ticketNumber: `HD-${String(tickets.length + 101)}`,
      employeeId: emp?.id,
      requesterName: emp?.name || effectiveUserProfile?.username || 'Staff Member',
      department: emp?.department || 'General',
      category: form.category,
      priority: form.priority,
      status: 'Open',
      subject: form.subject.trim(),
      description: form.description.trim(),
      assignedTo: form.assignedTo.trim() || 'HR Support',
      comments: [],
      createdAt: now,
      updatedAt: now,
    };
    if (await saveLocalTable('hr_tickets', [ticket])) {
      setTickets((prev) => [ticket, ...prev]);
      setSelectedTicketId(ticket.id);
      setIsModalOpen(false);
      setForm((prev) => ({ ...prev, subject: '', description: '' }));
      await emitInAppNotification(
        {
          title: `New Helpdesk Ticket ${ticket.ticketNumber}`,
          message: `${ticket.requesterName}: ${ticket.subject} (${ticket.priority})`,
          category: 'Helpdesk',
          severity: ticket.priority === 'Urgent' ? 'warning' : 'info',
          link: '/helpdesk',
          eventKey: 'helpdesk.ticket',
        },
        settings
      );
      toast.success(`Ticket ${ticket.ticketNumber} created.`);
    }
  };

  const handleUpdateTicketStatus = async (ticket: HelpdeskTicket, status: HelpdeskTicket['status']) => {
    const updated: HelpdeskTicket = { ...ticket, status, updatedAt: new Date().toISOString() };
    if (await saveLocalTable('hr_tickets', [updated])) {
      setTickets((prev) => prev.map((t) => (t.id === ticket.id ? updated : t)));
      toast.success(`${ticket.ticketNumber} marked ${status}.`);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    const active = tickets.find((t) => t.id === selectedTicketId);
    if (!active || !commentText.trim()) return;
    const comment: TicketComment = {
      id: `cmt_${generateId()}`,
      author: effectiveUserProfile?.username || 'HR Admin',
      message: commentText.trim(),
      timestamp: new Date().toISOString(),
    };
    const updated: HelpdeskTicket = {
      ...active,
      comments: [...(active.comments || []), comment],
      status: active.status === 'Open' ? 'In Progress' : active.status,
      updatedAt: new Date().toISOString(),
    };
    if (await saveLocalTable('hr_tickets', [updated])) {
      setTickets((prev) => prev.map((t) => (t.id === active.id ? updated : t)));
      setCommentText('');
    }
  };

  const handleDelete = async (id: string) => {
    if (await deleteLocalTableRecords('hr_tickets', [id])) {
      setTickets((prev) => prev.filter((t) => t.id !== id));
      if (selectedTicketId === id) setSelectedTicketId(null);
      toast.success('Ticket removed.');
    }
  };

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return tickets.filter((t) => {
      const matchStatus = statusFilter === 'All' || t.status === statusFilter;
      const matchSearch =
        !q ||
        t.ticketNumber.toLowerCase().includes(q) ||
        t.subject.toLowerCase().includes(q) ||
        t.requesterName.toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [tickets, statusFilter, searchTerm]);

  const selectedTicket = tickets.find((t) => t.id === selectedTicketId) || null;
  const openCount = tickets.filter((t) => t.status === 'Open').length;
  const inProgressCount = tickets.filter((t) => t.status === 'In Progress').length;
  const resolvedCount = tickets.filter((t) => t.status === 'Resolved' || t.status === 'Closed').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="HR Helpdesk & Support Desk"
        description="Centralized ticketing workspace for payroll queries, biometric issues, leave requests, and IT help"
        icon={LifeBuoy}
        actions={
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus size={15} /> Raise Support Ticket
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KPICard label="Total Tickets" value={tickets.length} icon={LifeBuoy} trendValue="All Queues" trend="neutral" />
        <KPICard label="Open Queue" value={openCount} icon={AlertCircle} trendValue="Awaiting Triage" trend="down" color="danger" />
        <KPICard label="In Progress" value={inProgressCount} icon={Clock} trendValue="Active Handling" trend="neutral" color="warning" />
        <KPICard label="Resolved" value={resolvedCount} icon={CheckCircle2} trendValue="Closed Requests" trend="up" color="success" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Ticket List */}
        <Card
          className="lg:col-span-7"
          title="Ticket Queue"
          actions={
            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-8 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs"
              >
                <option value="All">All</option>
                <option value="Open">Open</option>
                <option value="In Progress">In Progress</option>
                <option value="Resolved">Resolved</option>
                <option value="Closed">Closed</option>
              </select>
              <Input
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-40 h-8 text-xs"
              />
            </div>
          }
        >
          {filtered.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              No helpdesk tickets found. Click &ldquo;Raise Support Ticket&rdquo; to submit a request.
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800 -mx-5 -mb-5">
              {filtered.map((t) => (
                <div
                  key={t.id}
                  onClick={() => setSelectedTicketId(t.id)}
                  className={cn(
                    'p-4 cursor-pointer transition-colors flex items-start justify-between gap-3',
                    selectedTicketId === t.id
                      ? 'bg-primary/5 dark:bg-primary/10'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  )}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[11px] font-bold text-primary">{t.ticketNumber}</span>
                      <Badge variant="outline">{t.category}</Badge>
                      <Badge
                        variant={
                          t.priority === 'Urgent' || t.priority === 'High' ? 'danger' : t.priority === 'Medium' ? 'warning' : 'muted'
                        }
                      >
                        {t.priority}
                      </Badge>
                    </div>
                    <p className="text-[13px] font-bold text-slate-900 dark:text-white mt-1 truncate">{t.subject}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      {t.requesterName} · BS {getNepaliDate(t.createdAt.slice(0, 10))}
                    </p>
                  </div>
                  <Badge
                    variant={
                      t.status === 'Resolved' || t.status === 'Closed'
                        ? 'success'
                        : t.status === 'In Progress'
                          ? 'warning'
                          : 'info'
                    }
                  >
                    {t.status}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Active Ticket Thread */}
        <Card className="lg:col-span-5" title={selectedTicket ? selectedTicket.ticketNumber : 'Ticket Detail'}>
          {selectedTicket ? (
            <div className="space-y-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h4 className="text-sm font-bold text-slate-900 dark:text-white">{selectedTicket.subject}</h4>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Raised by <span className="font-semibold">{selectedTicket.requesterName}</span> · Assigned:{' '}
                    {selectedTicket.assignedTo}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => handleDelete(selectedTicket.id)}
                  className="text-rose-600 px-2"
                >
                  <Trash2 size={13} />
                </Button>
              </div>

              <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
                {selectedTicket.description || 'No detailed description provided.'}
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold text-slate-500 uppercase">Status:</span>
                {(['Open', 'In Progress', 'Resolved', 'Closed'] as const).map((st) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => handleUpdateTicketStatus(selectedTicket, st)}
                    className={cn(
                      'px-2.5 py-1 rounded text-[11px] font-semibold border transition-colors',
                      selectedTicket.status === st
                        ? 'bg-primary text-white border-primary'
                        : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
                    )}
                  >
                    {st}
                  </button>
                ))}
              </div>

              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 space-y-3">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <MessageSquare size={12} /> Discussion Thread ({selectedTicket.comments?.length || 0})
                </p>
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {(selectedTicket.comments || []).map((c) => (
                    <div
                      key={c.id}
                      className="p-2.5 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-xs"
                    >
                      <div className="flex justify-between text-[10px] text-slate-400 mb-1">
                        <span className="font-bold text-slate-700 dark:text-slate-300">{c.author}</span>
                        <span>{new Date(c.timestamp).toLocaleString()}</span>
                      </div>
                      <p className="text-slate-700 dark:text-slate-200">{c.message}</p>
                    </div>
                  ))}
                </div>

                <form onSubmit={handleAddComment} className="flex gap-2">
                  <Input
                    placeholder="Add reply or resolution note..."
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    className="text-xs"
                  />
                  <Button type="submit" size="sm">
                    <Send size={13} />
                  </Button>
                </form>
              </div>
            </div>
          ) : (
            <p className="py-12 text-center text-xs text-slate-400">
              Select a ticket from the queue to inspect details and post replies.
            </p>
          )}
        </Card>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="max-w-lg w-full">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Raise HR Support Ticket</h3>
              <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleCreateTicket} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-slate-700 dark:text-slate-300 block">Requester Employee</label>
                <select
                  value={form.employeeId}
                  onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                >
                  <option value="">Logged-In User ({effectiveUserProfile?.username || 'Staff'})</option>
                  {employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.id})
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[12px] font-semibold text-slate-700 dark:text-slate-300 block">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value as any })}
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  >
                    {['Payroll', 'Attendance', 'Leave', 'IT & Biometrics', 'Documents', 'Workplace'].map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-[12px] font-semibold text-slate-700 dark:text-slate-300 block">Priority</label>
                  <select
                    value={form.priority}
                    onChange={(e) => setForm({ ...form, priority: e.target.value as any })}
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  >
                    {['Low', 'Medium', 'High', 'Urgent'].map((p) => (
                      <option key={p} value={p}>
                        {p}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <Input
                label="Subject"
                value={form.subject}
                onChange={(e) => setForm({ ...form, subject: e.target.value })}
                placeholder="e.g., Missing biometric punch on Shrawan 14"
                required
              />
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-slate-700 dark:text-slate-300 block">Description</label>
                <textarea
                  rows={3}
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-2.5 text-xs"
                  placeholder="Provide details so HR/IT can resolve quickly..."
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Submit Ticket</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
