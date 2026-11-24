import React, { useState, useEffect, useMemo } from 'react';
import { Laptop, Plus, CheckCircle2, Wrench, Trash2, UserCheck, RotateCcw, X } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useAppStore } from '../store';
import { fetchLocalTable, saveLocalTable, deleteLocalTableRecords } from '../lib/localClient';
import { emitInAppNotification } from '../lib/notifications';
import { generateId } from '../lib/utils';
import { getNepaliDate } from '../utils/dateHelper';
import { PageHeader, Card, Button, Input, Badge, KPICard } from '../components/ui';
import type { CompanyAsset } from '../types';

export default function Assets() {
  const { employees, settings } = useAppStore();
  const [assets, setAssets] = useState<CompanyAsset[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const [form, setForm] = useState({
    assetTag: '',
    name: '',
    category: 'Laptop' as CompanyAsset['category'],
    serialNumber: '',
    purchaseDate: format(new Date(), 'yyyy-MM-dd'),
    condition: 'New' as CompanyAsset['condition'],
    assignedEmployeeId: '',
    notes: '',
  });

  useEffect(() => {
    fetchLocalTable<CompanyAsset>('hr_assets').then((rows) => {
      setAssets(rows.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || '')));
    });
  }, []);

  const handleAddAsset = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.assetTag.trim() || !form.name.trim()) {
      toast.error('Asset tag and asset name are required.');
      return;
    }
    const assignee = employees.find((item) => item.id === form.assignedEmployeeId);
    const asset: CompanyAsset = {
      id: `ast_${generateId()}`,
      assetTag: form.assetTag.trim().toUpperCase(),
      name: form.name.trim(),
      category: form.category,
      serialNumber: form.serialNumber.trim() || '-',
      purchaseDate: form.purchaseDate,
      condition: form.condition,
      status: assignee ? 'Assigned' : 'Available',
      assignedEmployeeId: assignee?.id,
      assignedEmployeeName: assignee?.name,
      assignedDate: assignee ? format(new Date(), 'yyyy-MM-dd') : undefined,
      notes: form.notes.trim(),
      updatedAt: new Date().toISOString(),
    };
    if (await saveLocalTable('hr_assets', [asset])) {
      setAssets((prev) => [asset, ...prev]);
      setIsModalOpen(false);
      setForm({
        assetTag: '',
        name: '',
        category: 'Laptop',
        serialNumber: '',
        purchaseDate: format(new Date(), 'yyyy-MM-dd'),
        condition: 'New',
        assignedEmployeeId: '',
        notes: '',
      });
      if (assignee) {
        await emitInAppNotification(
          {
            title: 'Company Asset Assigned',
            message: `${asset.assetTag} (${asset.name}) issued to ${assignee.name}.`,
            category: 'Asset',
            severity: 'info',
            link: '/assets',
            eventKey: 'asset.assigned',
          },
          settings
        );
      }
      toast.success(`Asset ${asset.assetTag} saved to inventory.`);
    }
  };

  const handleAssignEmployee = async (asset: CompanyAsset, employeeId: string) => {
    const emp = employees.find((e) => e.id === employeeId);
    const updated: CompanyAsset = {
      ...asset,
      status: emp ? 'Assigned' : 'Available',
      assignedEmployeeId: emp?.id,
      assignedEmployeeName: emp?.name,
      assignedDate: emp ? format(new Date(), 'yyyy-MM-dd') : undefined,
      updatedAt: new Date().toISOString(),
    };
    if (await saveLocalTable('hr_assets', [updated])) {
      setAssets((prev) => prev.map((a) => (a.id === asset.id ? updated : a)));
      toast.success(emp ? `${asset.assetTag} assigned to ${emp.name}.` : `${asset.assetTag} returned to store.`);
    }
  };

  const handleDelete = async (id: string) => {
    if (await deleteLocalTableRecords('hr_assets', [id])) {
      setAssets((prev) => prev.filter((a) => a.id !== id));
      toast.success('Asset removed from register.');
    }
  };

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return assets.filter((a) => {
      const matchStatus = statusFilter === 'All' || a.status === statusFilter;
      const matchSearch =
        !q ||
        a.assetTag.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.serialNumber.toLowerCase().includes(q) ||
        (a.assignedEmployeeName || '').toLowerCase().includes(q);
      return matchStatus && matchSearch;
    });
  }, [assets, searchTerm, statusFilter]);

  const assignedCount = assets.filter((a) => a.status === 'Assigned').length;
  const availableCount = assets.filter((a) => a.status === 'Available').length;
  const repairCount = assets.filter((a) => a.status === 'Under Maintenance').length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Company Asset Management"
        description="Track company laptops, access badges, PPE kits, vehicles, serial numbers, and employee custody"
        icon={Laptop}
        actions={
          <Button onClick={() => setIsModalOpen(true)}>
            <Plus size={15} /> Register Asset
          </Button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KPICard label="Total Assets" value={assets.length} icon={Laptop} trendValue="Inventory Register" trend="neutral" />
        <KPICard label="Issued / Assigned" value={assignedCount} icon={UserCheck} trendValue="In Employee Custody" trend="up" />
        <KPICard label="Available in Store" value={availableCount} icon={CheckCircle2} trendValue="Ready for Issue" trend="up" color="success" />
        <KPICard label="Under Maintenance" value={repairCount} icon={Wrench} trendValue="Repair / Service" trend="down" color="warning" />
      </div>

      <Card
        title="Asset Register"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-9 px-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-semibold text-slate-700 dark:text-slate-200"
            >
              <option value="All">All Statuses</option>
              <option value="Available">Available</option>
              <option value="Assigned">Assigned</option>
              <option value="Under Maintenance">Under Maintenance</option>
              <option value="Retired">Retired</option>
            </select>
            <Input
              placeholder="Search tag, serial, holder..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-56"
            />
          </div>
        }
      >
        {filtered.length === 0 ? (
          <div className="py-12 text-center text-xs text-slate-500">
            No company assets found matching filters. Click &ldquo;Register Asset&rdquo; to add equipment or import via Master Data Import.
          </div>
        ) : (
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 border-y border-slate-200 dark:border-slate-800 text-[10px] uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-5 py-3">Asset Tag & Item</th>
                  <th className="px-4 py-3">Category / Serial</th>
                  <th className="px-4 py-3">Condition</th>
                  <th className="px-4 py-3">Custody / Assigned To</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.map((a) => (
                  <tr key={a.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                    <td className="px-5 py-3">
                      <p className="font-mono font-bold text-primary">{a.assetTag}</p>
                      <p className="font-semibold text-slate-900 dark:text-white">{a.name}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-700 dark:text-slate-300">{a.category}</p>
                      <p className="text-[11px] font-mono text-slate-400">SN: {a.serialNumber}</p>
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline">{a.condition}</Badge>
                    </td>
                    <td className="px-4 py-3">
                      <select
                        value={a.assignedEmployeeId || ''}
                        onChange={(e) => handleAssignEmployee(a, e.target.value)}
                        className="h-8 px-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200"
                      >
                        <option value="">— Unassigned (In Store) —</option>
                        {employees.map((emp) => (
                          <option key={emp.id} value={emp.id}>
                            {emp.name} ({emp.id})
                          </option>
                        ))}
                      </select>
                      {a.assignedDate && (
                        <p className="text-[10px] text-slate-400 mt-0.5 tabular-nums">
                          Issued: {a.assignedDate} · BS {getNepaliDate(a.assignedDate)}
                        </p>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          a.status === 'Available'
                            ? 'success'
                            : a.status === 'Assigned'
                              ? 'info'
                              : a.status === 'Under Maintenance'
                                ? 'warning'
                                : 'muted'
                        }
                      >
                        {a.status}
                      </Badge>
                    </td>
                    <td className="px-5 py-3 text-right space-x-1">
                      {a.assignedEmployeeId && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleAssignEmployee(a, '')}
                          title="Mark Returned"
                        >
                          <RotateCcw size={12} /> Return
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(a.id)} className="text-rose-600 px-2">
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
          <Card className="max-w-lg w-full">
            <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">Register Company Asset</h3>
              <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleAddAsset} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Asset Tag"
                  value={form.assetTag}
                  onChange={(e) => setForm({ ...form, assetTag: e.target.value })}
                  placeholder="AST-001"
                  required
                />
                <Input
                  label="Item Name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="ThinkPad L14 / RFID Badge"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[12px] font-semibold text-slate-700 dark:text-slate-300 block">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm({ ...form, category: e.target.value as any })}
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  >
                    {['Laptop', 'Desktop', 'Mobile', 'Access Card', 'Uniform & PPE', 'Vehicle', 'Tool / Equipment', 'Other'].map(
                      (c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      )
                    )}
                  </select>
                </div>
                <Input
                  label="Serial Number"
                  value={form.serialNumber}
                  onChange={(e) => setForm({ ...form, serialNumber: e.target.value })}
                  placeholder="SN-928374"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Input
                  label="Purchase Date"
                  type="date"
                  value={form.purchaseDate}
                  onChange={(e) => setForm({ ...form, purchaseDate: e.target.value })}
                />
                <div className="space-y-1.5">
                  <label className="text-[12px] font-semibold text-slate-700 dark:text-slate-300 block">Assign To</label>
                  <select
                    value={form.assignedEmployeeId}
                    onChange={(e) => setForm({ ...form, assignedEmployeeId: e.target.value })}
                    className="w-full h-9 px-2.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs"
                  >
                    <option value="">Store (Unassigned)</option>
                    {employees.map((emp) => (
                      <option key={emp.id} value={emp.id}>
                        {emp.name} ({emp.id})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit">Save Asset</Button>
              </div>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
}
