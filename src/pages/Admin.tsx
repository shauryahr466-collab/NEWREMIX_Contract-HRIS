import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { Shield, Users, Fingerprint, Clock, AlertCircle, Database, Server, UserPlus, Lock, Loader2, RefreshCw, Info, UserCog } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { auth } from '../lib/firebase';
import { PageHeader, Card, KPICard, Button, Input, Badge } from '../components/ui';
import { formatUserScopeSummary } from '../lib/accessControl';
import { cn } from '../lib/utils';

export function AdminDashboard() {
  const navigate = useNavigate();
  const { employees, punches, settings, shiftAssignments, assignmentLogs } = useAppStore();
  const [adminUsers, setAdminUsers] = useState<any[]>([]);
  const [isFetchingUsers, setIsFetchingUsers] = useState(false);
  const [isCreatingUser, setIsCreatingUser] = useState(false);
  const [newUser, setNewUser] = useState({ email: '', password: '', displayName: '', role: 'Department Head' });

  const fetchUsers = async () => {
    setIsFetchingUsers(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/admin/users', {
        headers: token ? { 'Authorization': `Bearer ${token}` } : {}
      });
      if (response.ok) {
        const data = await response.json();
        setAdminUsers(data);
      }
    } catch (error) {
      console.error('Failed to fetch users:', error);
    } finally {
      setIsFetchingUsers(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsCreatingUser(true);
    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch('/api/admin/create-user', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newUser),
      });
      if (response.ok) {
        toast.success('User created successfully');
        setNewUser({ email: '', password: '', displayName: '', role: 'Department Head' });
        fetchUsers();
      } else {
        const data = await response.json();
        throw new Error(data.error);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to create user');
    } finally {
      setIsCreatingUser(false);
    }
  };

  const stats = useMemo(() => {
    const totalPunches = punches.length;
    const totalEmployees = employees.length;
    const totalAssignments = shiftAssignments.length;
    const totalLogs = assignmentLogs.length;
    
    // Calculate storage usage estimate (rough)
    const rawDataSize = JSON.stringify({ employees, punches, settings, shiftAssignments, assignmentLogs }).length;
    const sizeKB = (rawDataSize / 1024).toFixed(2);
    
    return {
      totalPunches,
      totalEmployees,
      totalAssignments,
      totalLogs,
      sizeKB
    };
  }, [employees, punches, settings, shiftAssignments, assignmentLogs]);

  const recentAdminLogs = useMemo(() => {
    return [...assignmentLogs].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 10);
  }, [assignmentLogs]);

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Admin Control Panel" 
        description="System-wide monitoring and administrative tools"
        icon={Shield}
        actions={
          <Badge variant="info" className="gap-2 px-3 py-1.5">
            <Shield size={12} />
            Owner Mode
          </Badge>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <KPICard 
          label="Total Employees" 
          value={stats.totalEmployees} 
          icon={Users} 
          trend="up"
          trendValue="Registered"
        />
        <KPICard 
          label="Punch Records" 
          value={stats.totalPunches} 
          icon={Fingerprint} 
          trend="up"
          trendValue="Total Logs"
        />
        <KPICard 
          label="Shift Maps" 
          value={stats.totalAssignments} 
          icon={Clock} 
          trend="up"
          trendValue="Active"
        />
        <KPICard 
          label="Cache Size" 
          value={`${stats.sizeKB} KB`} 
          icon={Database} 
          trend="up"
          trendValue="JSON Est."
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-0 overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Users size={16} className="text-slate-400" />
                <h3 className="text-[11px] font-bold text-slate-900 dark:text-white uppercase tracking-widest">User & Role Directory</h3>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => navigate('/user-access')} className="text-xs">
                  <UserCog size={14} className="mr-1.5" />
                  Configure Role Scopes & Permissions
                </Button>
                <Button variant="ghost" size="sm" onClick={fetchUsers} disabled={isFetchingUsers}>
                  <RefreshCw size={14} className={isFetchingUsers ? "animate-spin" : ""} />
                </Button>
              </div>
            </div>

            <div className="p-6 bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Quick User Provision (Use User & Role Config for Department/Section Scope)</h4>
              </div>
              <form onSubmit={handleCreateUser} className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <Input 
                  value={newUser.displayName}
                  onChange={(e) => setNewUser({...newUser, displayName: e.target.value})}
                  placeholder="Full Name"
                  required
                />
                <Input 
                  type="email"
                  value={newUser.email}
                  onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                  placeholder="Email Address"
                  required
                />
                <Input 
                  type="password"
                  value={newUser.password}
                  onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                  placeholder="Password"
                  required
                />
                <div className="flex gap-2">
                  <select 
                    value={newUser.role}
                    onChange={(e) => setNewUser({...newUser, role: e.target.value})}
                    className="flex-1 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded-lg px-3 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
                  >
                    <option value="Department Head">Department Head</option>
                    <option value="Supervisor">Supervisor</option>
                    <option value="Section Incharge">Section Incharge</option>
                    <option value="Employee">Employee</option>
                    <option value="Super Admin">Super Admin</option>
                  </select>
                  <Button type="submit" disabled={isCreatingUser} className="shrink-0">
                    {isCreatingUser ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
                  </Button>
                </div>
              </form>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">User</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest">Concern Scope</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center">Role</th>
                    <th className="px-6 py-3 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-right">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {isFetchingUsers ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                        <Loader2 size={24} className="animate-spin mx-auto mb-2 opacity-20" />
                        <span className="text-[10px] font-bold uppercase tracking-widest">Fetching users...</span>
                      </td>
                    </tr>
                  ) : adminUsers.length > 0 ? (
                    adminUsers.map((user: any) => (
                      <tr key={user.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition-colors group">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 group-hover:bg-primary group-hover:text-white rounded-lg flex items-center justify-center font-bold text-[10px] transition-all">
                              {user.username?.[0] || 'U'}
                            </div>
                            <div>
                              <span className="text-xs font-bold text-slate-900 dark:text-white block">{user.username}</span>
                              <span className="text-[11px] text-slate-500">{user.email}</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-xs text-slate-500 max-w-xs truncate">{formatUserScopeSummary(user)}</td>
                        <td className="px-6 py-4 text-center">
                          <Badge variant={user.role === 'Super Admin' ? 'info' : 'success'} className="text-[9px] uppercase">
                            {user.role}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 text-right text-[10px] font-medium text-slate-400 tabular-nums">
                          {typeof user.createdAt === 'string'
                            ? format(new Date(user.createdAt), 'MMM dd, yyyy')
                            : user.createdAt?._seconds
                              ? format(new Date(user.createdAt._seconds * 1000), 'MMM dd, yyyy')
                              : 'N/A'}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-6 py-12 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">No users found</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="p-0 overflow-hidden">
            <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Server size={16} className="text-slate-400" />
                <h3 className="text-[11px] font-bold text-slate-900 dark:text-white uppercase tracking-widest">Recent System Activity</h3>
              </div>
              <Badge variant="outline" className="text-[9px]">Last 10 Logs</Badge>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {recentAdminLogs.length > 0 ? (
                recentAdminLogs.map((log) => (
                  <div key={log.id} className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-900/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={cn(
                        "p-2 rounded-lg shrink-0",
                        log.action === 'Assigned' ? "bg-primary/10 text-primary" : "bg-red-50 dark:bg-red-900/10 text-red-600"
                      )}>
                        <Clock size={16} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-900 dark:text-white">
                          {log.action === 'Assigned' ? 'Assigned' : log.action} {log.shiftName}
                        </p>
                        <p className="text-[10px] text-slate-500 font-medium">
                          Emp: {log.employeeId} • Date: {log.date}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-slate-900 dark:text-white">
                        {format(new Date(log.timestamp), 'HH:mm:ss')}
                      </p>
                      <p className="text-[10px] text-slate-400 font-medium">
                        {format(new Date(log.timestamp), 'MMM dd, yyyy')}
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-12 text-center text-[10px] font-bold text-slate-400 uppercase tracking-widest">No activity logs</div>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="p-6">
            <h3 className="text-[11px] font-bold text-slate-900 dark:text-white uppercase tracking-widest mb-6 flex items-center gap-2">
              <Shield size={14} className="text-primary" />
              Security Information
            </h3>
            <div className="space-y-4">
              <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Access Level</p>
                <p className="text-xs font-bold text-slate-900 dark:text-white">Owner & System Editor</p>
              </div>
              <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Environment</p>
                <p className="text-xs font-bold text-slate-900 dark:text-white">Production (Live)</p>
              </div>
              <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-100 dark:border-amber-900/20 rounded-xl">
                <div className="flex gap-3">
                  <AlertCircle size={18} className="text-amber-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-[11px] font-bold text-amber-900 dark:text-amber-400 uppercase tracking-widest">System Warning</p>
                    <p className="text-[10px] text-amber-700 dark:text-amber-500 mt-1 leading-relaxed font-medium">
                      Administrative actions are logged and permanent. Use caution when modifying user access or system settings.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-[11px] font-bold text-slate-900 dark:text-white uppercase tracking-widest mb-6 flex items-center gap-2">
              <Info size={14} className="text-primary" />
              Quick Actions
            </h3>
            <div className="space-y-3">
               <Button variant="outline" className="w-full justify-start gap-3" onClick={() => window.open('/firestore-export', '_blank')}>
                 <Database size={14} /> Export Firestore
               </Button>
               <Button variant="outline" className="w-full justify-start gap-3">
                 <Lock size={14} /> Audit Security Rules
               </Button>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
