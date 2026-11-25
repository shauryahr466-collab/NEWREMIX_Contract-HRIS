import React, { useState, useEffect } from 'react';
import { FileCheck2, Plus, CheckCircle2, XCircle, Printer, Trash2, X, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useAppStore } from '../store';
import { fetchLocalTable, saveLocalTable, deleteLocalTableRecords } from '../lib/localClient';
import { emitInAppNotification } from '../lib/notifications';
import { generateId } from '../lib/utils';
import { getNepaliDate } from '../utils/dateHelper';
import { PageHeader, Card, Button, Input, Badge, KPICard } from '../components/ui';
import type { DocumentRequestRecord } from '../types';

export default function DocumentRequests() {
  const { employees, settings, effectiveUserProfile, isSuperAdmin } = useAppStore();
  const [requests, setRequests] = useState<DocumentRequestRecord[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [previewReq, setPreviewReq] = useState<DocumentRequestRecord | null>(null);

  const [form, setForm] = useState({
    employeeId: effectiveUserProfile?.linkedEmployeeId || '',
    documentType: 'Experience Certificate' as DocumentRequestRecord['documentType'],
    purpose: '',
  });

  useEffect(() => {
    fetchLocalTable<DocumentRequestRecord>('hr_document_requests').then((rows) => {
      setRequests(rows.sort((a, b) => (b.requestedAt || '').localeCompare(a.requestedAt || '')));
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const emp = employees.find((item) => item.id === form.employeeId);
    if (!emp) {
      toast.error('Please select an employee.');
      return;
    }
    const now = new Date().toISOString();
    const rec: DocumentRequestRecord = {
      id: `docr_${generateId()}`,
      requestNumber: `DOC-${String(requests.length + 201)}`,
      employeeId: emp.id,
      employeeName: emp.name,
      department: emp.department || 'Operations',
      designation: emp.designation || 'Staff',
      documentType: form.documentType,
      purpose: form.purpose.trim() || 'Official Submission',
      status: 'Pending',
      requestedAt: now,
      updatedAt: now,
    };
    if (await saveLocalTable('hr_document_requests', [rec])) {
      setRequests((prev) => [rec, ...prev]);
      setIsModalOpen(false);
      setForm((prev) => ({ ...prev, purpose: '' }));
      await emitInAppNotification(
        {
          title: `Document Request ${rec.requestNumber}`,
          message: `${rec.employeeName} requested ${rec.documentType}.`,
          category: 'Document',
          severity: 'info',
          link: '/document-requests',
          eventKey: 'document.request',
        },
        settings
      );
      toast.success(`Document request ${rec.requestNumber} submitted.`);
    }
  };

  const handleReview = async (rec: DocumentRequestRecord, nextStatus: DocumentRequestRecord['status']) => {
    const actorName = effectiveUserProfile?.username || 'HR Admin';
    const actorRole = isSuperAdmin ? 'Super Admin' : effectiveUserProfile?.role || 'Department Head';
    const wasProcessed = rec.status !== 'Pending';
    const updated: DocumentRequestRecord & Record<string, any> = {
      ...rec,
      status: nextStatus,
      reviewedBy: actorName,
      reviewedByRole: actorRole,
      approvedBy: actorName,
      approvedByRole: actorRole,
      updatedAt: new Date().toISOString(),
    };
    if (await saveLocalTable('hr_document_requests', [updated])) {
      setRequests((prev) => prev.map((r) => (r.id === rec.id ? updated : r)));
      await emitInAppNotification(
        {
          title: `Document Request ${nextStatus}`,
          message: `${rec.requestNumber} (${rec.documentType}) for ${rec.employeeName} was ${nextStatus.toLowerCase()}.`,
          category: 'Document',
          severity: nextStatus === 'Approved' ? 'success' : 'warning',
          link: '/document-requests',
          eventKey: 'document.request',
        },
        settings
      );
      toast.success(`${wasProcessed && isSuperAdmin ? 'Super Admin Override → ' : ''}Request ${rec.requestNumber} marked ${nextStatus}.`);
    } else {
      toast.error('Unable to update document request (check permissions or Super Admin lock).');
    }
  };

  const handleDelete = async (id: string) => {
    if (await deleteLocalTableRecords('hr_document_requests', [id])) {
      setRequests((prev) => prev.filter((r) => r.id !== id));
      toast.success('Request deleted.');
    } else {
      toast.error('Unable to delete request (locked by Super Admin or insufficient permission).');
    }
  };

  const pendingCount = requests.filter((r) => r.status === 'Pending' || r.status === 'Processing').length;
  const approvedCount = requests.filter((r) => r.status === 'Approved').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Employee Document Requests"
        description="Request, review, approve, and print official HR letters and employment certificates"
        icon={FileCheck2}
        actions={
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus size={15} /> New Document Request
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard label="Total Requests" value={requests.length} icon={FileCheck2} trendValue="Document Queue" trend="neutral" />
        <KPICard label="Pending Review" value={pendingCount} icon={Clock} trendValue="Awaiting Approval" trend="down" color="warning" />
        <KPICard label="Approved Letters" value={approvedCount} icon={CheckCircle2} trendValue="Ready to Print" trend="up" color="success" />
      </div>

      <Card title="Document Requests & Approval Register">
        {requests.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500">
            No document requests logged yet. Click &ldquo;New Document Request&rdquo; to submit one.
          </div>
        ) : (
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-y border-slate-200 dark:border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3">Ref #</th>
                  <th className="px-4 py-3">Employee</th>
                  <th className="px-4 py-3">Document Type</th>
                  <th className="px-4 py-3">Requested (AD / BS)</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {requests.map((r: any) => {
                  const datePart = r.requestedAt.slice(0, 10);
                  const isLockedBySuperAdmin =
                    !isSuperAdmin &&
                    Boolean(
                      r.superAdminOverride ||
                        r.approvedByRole === 'Super Admin' ||
                        r.reviewedByRole === 'Super Admin'
                    );
                  const canReview =
                    isSuperAdmin ||
                    effectiveUserProfile?.role === 'Department Head' ||
                    effectiveUserProfile?.role === 'Supervisor' ||
                    effectiveUserProfile?.role === 'Section Incharge';
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                      <td className="px-5 py-3 font-mono font-bold text-primary">{r.requestNumber}</td>
                      <td className="px-4 py-3">
                        <p className="font-bold text-slate-900 dark:text-white">{r.employeeName}</p>
                        <p className="text-[11px] text-slate-500">{r.employeeId} · {r.department}</p>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-800 dark:text-slate-200">{r.documentType}</p>
                        <p className="text-[11px] text-slate-500">{r.purpose}</p>
                      </td>
                      <td className="px-4 py-3 tabular-nums">
                        <span className="font-semibold block text-slate-700 dark:text-slate-300">{datePart}</span>
                        <span className="text-[10px] text-primary">BS {getNepaliDate(datePart)}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-0.5 items-start">
                          <Badge
                            variant={
                              r.status === 'Approved'
                                ? 'success'
                                : r.status === 'Rejected'
                                  ? 'danger'
                                  : 'warning'
                            }
                          >
                            {r.status}
                          </Badge>
                          {r.reviewedBy && r.status !== 'Pending' && (
                            <span className="text-[10px] text-slate-500">
                              By {r.reviewedBy}{r.reviewedByRole ? ` (${r.reviewedByRole})` : ''}
                            </span>
                          )}
                          {r.superAdminOverride && (
                            <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 border border-indigo-200">
                              Super Admin Override
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          {isLockedBySuperAdmin ? (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              Locked by Super Admin
                            </span>
                          ) : (
                            <>
                              {canReview && r.status === 'Pending' && (
                                <>
                                  <Button size="sm" variant="success" onClick={() => handleReview(r, 'Approved')}>
                                    <CheckCircle2 size={12} /> Approve
                                  </Button>
                                  <Button size="sm" variant="danger" onClick={() => handleReview(r, 'Rejected')}>
                                    <XCircle size={12} /> Reject
                                  </Button>
                                </>
                              )}
                              {isSuperAdmin && r.status !== 'Pending' && (
                                <>
                                  {r.status !== 'Approved' && (
                                    <Button size="sm" variant="success" onClick={() => handleReview(r, 'Approved')}>
                                      Override Approve
                                    </Button>
                                  )}
                                  {r.status !== 'Rejected' && (
                                    <Button size="sm" variant="danger" onClick={() => handleReview(r, 'Rejected')}>
                                      Override Reject
                                    </Button>
                                  )}
                                </>
                              )}
                            </>
                          )}
                          {r.status === 'Approved' && (
                            <Button size="sm" variant="outline" onClick={() => setPreviewReq(r)}>
                              <Printer size={12} /> Letter
                            </Button>
                          )}
                          {!isLockedBySuperAdmin && (
                            <Button size="sm" variant="ghost" onClick={() => handleDelete(r.id)} className="text-rose-600 px-2">
                              <Trash2 size={13} />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* New Request Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Submit Document Request</h3>
              <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-slate-700 dark:text-slate-300 block">Employee</label>
                <select
                  value={form.employeeId}
                  onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
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
              <div className="space-y-1.5">
                <label className="text-[12px] font-semibold text-slate-700 dark:text-slate-300 block">Document Type</label>
                <select
                  value={form.documentType}
                  onChange={(e) => setForm({ ...form, documentType: e.target.value as any })}
                  className="w-full h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                >
                  {[
                    'Experience Certificate',
                    'Salary Certificate',
                    'Employment Verification / NOC',
                    'Tax Clearance Summary',
                    'ID Card Reissue',
                    'Bank / PAN Letter',
                  ].map((doc) => (
                    <option key={doc} value={doc}>
                      {doc}
                    </option>
                  ))}
                </select>
              </div>
              <Input
                label="Purpose / Addressed To"
                value={form.purpose}
                onChange={(e) => setForm({ ...form, purpose: e.target.value })}
                placeholder="e.g., Bank Loan / Embassy Visa / Personal Record"
              />
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Submit Request</Button>
              </div>
            </form>
          </Card>
        </div>
      )}

      {/* Official Letter Print Preview Modal */}
      {previewReq && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="max-w-2xl w-full bg-white text-slate-900 rounded-xl shadow-2xl p-8 space-y-6 border border-slate-200">
            <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
              <div>
                <h2 className="text-xl font-bold uppercase tracking-wide">{settings.companyName}</h2>
                {settings.companyAddress && <p className="text-xs text-slate-600">{settings.companyAddress}</p>}
                {settings.companyRegistrationNo && (
                  <p className="text-[11px] text-slate-500">Reg / PAN: {settings.companyRegistrationNo}</p>
                )}
              </div>
              <div className="text-right text-xs tabular-nums">
                <p className="font-bold">Ref: {previewReq.requestNumber}</p>
                <p>Date: {format(new Date(), 'yyyy-MM-dd')}</p>
                <p className="font-semibold text-primary">BS {getNepaliDate(new Date())}</p>
              </div>
            </div>

            <div className="py-4 space-y-4 text-sm leading-relaxed">
              <h3 className="text-center font-bold uppercase underline tracking-wider text-base">
                {previewReq.documentType}
              </h3>
              <p>To Whom It May Concern,</p>
              <p>
                This is to certify that <span className="font-bold">{previewReq.employeeName}</span> (Employee ID:{' '}
                <span className="font-mono font-bold">{previewReq.employeeId}</span>) is/was employed with{' '}
                <span className="font-bold">{settings.companyName}</span> in the{' '}
                <span className="font-bold">{previewReq.department}</span> department as{' '}
                <span className="font-bold">{previewReq.designation || 'Staff Member'}</span>.
              </p>
              <p>
                This certificate is issued upon the employee&apos;s verified request for the purpose of{' '}
                <span className="font-semibold">{previewReq.purpose}</span>.
              </p>
            </div>

            <div className="pt-8 flex items-end justify-between border-t border-slate-200 text-xs">
              <div>
                <p className="font-bold">Authorized Signatory</p>
                <p className="text-slate-500">{previewReq.reviewedBy || 'Human Resources Department'}</p>
              </div>
              <div className="flex gap-2 print:hidden">
                <Button variant="outline" onClick={() => setPreviewReq(null)}>
                  Close
                </Button>
                <Button onClick={() => window.print()}>
                  <Printer size={14} /> Print Letter
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
