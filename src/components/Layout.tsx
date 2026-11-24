import React, { useState, useEffect, useMemo } from 'react';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  LogOut, ChevronLeft, ChevronRight, ChevronDown, Search, User as UserIcon,
  Menu, Moon, Sun, RefreshCw, Eye, Calendar, Bell
} from 'lucide-react';
import { format } from 'date-fns';
import { cn } from '../lib/utils';
import { useAppStore } from '../store';
import { useZkSync } from '../hooks/useZkSync';
import { useRealtimeSync } from '../hooks/useRealtimeSync';
import { authFetch, clearInMemorySession } from '../lib/authSession';
import { motion, AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { EmployeeDrawer } from './EmployeeDrawer';
import { LocalModeIndicator } from './LocalModeIndicator';
import { ConflictModal } from './ConflictModal';
import { Breadcrumb } from './Breadcrumb';
import { QuickActionsMenu } from './QuickActionsMenu';
import { formatUserScopeSummary } from '../lib/accessControl';
import { getNepaliDate } from '../utils/dateHelper';
import { NAV_GROUPS } from '../lib/navigation';
import { fetchAllNotifications } from '../lib/notifications';

function HeaderButton({
  children,
  onClick,
  title,
  disabled,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        'h-9 w-9 text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg transition-colors flex items-center justify-center relative shrink-0',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      {children}
    </button>
  );
}

export function Layout() {
  useZkSync();
  const { connectionStatus, connectedUsersCount, reconcileFromServer } = useRealtimeSync();
  const {
    settings,
    selectedEmployeeId,
    employees,
    openEmployeeProfile,
    closeEmployeeProfile,
    theme,
    setTheme,
    globalSearchTerm,
    setGlobalSearchTerm,
    recalculate,
    refreshZkTablesFromSqlite,
    isInitializing,
    setIsOtpVerified,
    user,
    setUser,
    setIsAdmin,
    isSuperAdmin,
    effectiveUserProfile,
    previewUserProfile,
    setPreviewUserProfile,
    setCurrentUserProfile,
    canAccessModule,
  } = useAppStore();
  const location = useLocation();
  const navigate = useNavigate();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  const [isRefreshingAll, setIsRefreshingAll] = useState(false);
  const [conflictData, setConflictData] = useState<any>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({
    overview: true,
    workforce: true,
    attendance: true,
    operations: true,
    payroll: true,
    admin: true,
  });
  const [openSubMenus, setOpenSubMenus] = useState<Record<string, boolean>>({
    '/attendance': true,
  });

  const activeAttendanceTab = useMemo(() => {
    if (location.pathname !== '/attendance') return '';
    return new URLSearchParams(location.search).get('tab') || 'reconciliation';
  }, [location.pathname, location.search]);

  useEffect(() => {
    let active = true;
    fetchAllNotifications().then((rows) => {
      if (active) setUnreadNotifications(rows.filter((r) => !r.read).length);
    });
    return () => {
      active = false;
    };
  }, [location.pathname]);

  const isAdmin = isSuperAdmin;

  const handleSignOut = async () => {
    try {
      await authFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // ignore network error on logout
    }
    clearInMemorySession();
    setIsOtpVerified(false);
    setPreviewUserProfile(null);
    setCurrentUserProfile(null);
    setIsAdmin(false);
    setUser(null);
  };

  const selectedEmployee = employees.find((e) => e.id === selectedEmployeeId) || null;

  const visibleGroups = useMemo(() => {
    return NAV_GROUPS.map((group) => ({
      ...group,
      items: group.items.filter((item) => canAccessModule(item.moduleKey)),
    })).filter((group) => group.items.length > 0);
  }, [canAccessModule]);

  const activeGroup = useMemo(() => {
    return visibleGroups.find((g) => g.items.some((item) => item.to === location.pathname));
  }, [visibleGroups, location.pathname]);

  useEffect(() => {
    if (activeGroup) {
      setOpenGroups((prev) => (prev[activeGroup.id] ? prev : { ...prev, [activeGroup.id]: true }));
    }
  }, [activeGroup]);

  const toggleGroup = (groupId: string) => {
    setOpenGroups((prev) => ({ ...prev, [groupId]: !prev[groupId] }));
  };

  const todayDisplay = useMemo(() => {
    const now = new Date();
    const bs = getNepaliDate(now);
    const ad = format(now, 'dd MMM yyyy');
    return {
      bs: bs !== '0000-00-00' ? `BS ${bs}` : '',
      ad,
    };
  }, []);

  return (
    <div className="print-layout-root flex h-screen bg-[#F4F5F7] dark:bg-[#0B0E14] text-slate-800 dark:text-slate-100 font-sans overflow-hidden transition-colors duration-200">
      {/* Desktop Categorized Sidebar */}
      <aside
        className={cn(
          'hidden md:flex flex-col enterprise-sidebar transition-all duration-300 ease-in-out relative z-50 shrink-0 print:hidden',
          isCollapsed ? 'w-20' : 'w-64'
        )}
      >
        {/* Brand Header */}
        <div className="px-4 h-16 flex items-center justify-between border-b border-white/10 shrink-0">
          <AnimatePresence mode="wait">
            {!isCollapsed && (
              <motion.div
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                className="flex items-center gap-2.5 min-w-0"
              >
                <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center font-bold text-white text-sm shrink-0">
                  {(settings.companyName || 'H').charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h1 className="text-[13px] font-bold text-white tracking-tight truncate">
                    {settings.companyName || 'HRIS Portal'}
                  </h1>
                  <p className="text-[10px] text-slate-400 truncate leading-tight">
                    Workforce & Payroll
                  </p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <button
            type="button"
            onClick={() => setIsCollapsed(!isCollapsed)}
            title={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-slate-300 transition-colors shrink-0"
          >
            {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>

        {/* Navigation Groups */}
        <nav className="flex-1 p-3 space-y-3 overflow-y-auto custom-scrollbar">
          {visibleGroups.map((group) => {
            const isOpen = openGroups[group.id] ?? true;
            return (
              <div key={group.id} className="space-y-1">
                {!isCollapsed && group.items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.id)}
                    className="w-full flex items-center justify-between px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-200 transition-colors"
                  >
                    <span>{group.label}</span>
                    <ChevronDown
                      size={12}
                      className={cn(
                        'transition-transform duration-200',
                        !isOpen && '-rotate-90'
                      )}
                    />
                  </button>
                )}

                {(isCollapsed || isOpen || group.items.length === 1) && (
                  <ul className="space-y-1 relative">
                    {group.items.map((item) => {
                      const hasChildren = Boolean(item.children && item.children.length > 0);
                      const isParentRoute = location.pathname === item.to;
                      const isActive = hasChildren ? false : isParentRoute;
                      const isSubOpen = openSubMenus[item.to] ?? true;

                      return (
                        <li key={item.to} className="relative space-y-1">
                          <div
                            className={cn(
                              'relative flex items-center rounded-lg transition-colors duration-150',
                              !isActive && isParentRoute && 'bg-white/10'
                            )}
                          >
                            {isActive && (
                              <motion.div
                                layoutId="sidebarActiveIndicator"
                                className="absolute inset-0 bg-white rounded-lg shadow-sm z-0"
                                transition={{ type: 'spring', stiffness: 360, damping: 32 }}
                              />
                            )}
                            <NavLink
                              to={hasChildren ? item.children![0].to : item.to}
                              onClick={() => {
                                if (hasChildren) {
                                  setOpenSubMenus((prev) => ({ ...prev, [item.to]: true }));
                                }
                              }}
                              title={isCollapsed ? item.label : undefined}
                              className={() =>
                                cn(
                                  'flex-1 flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-colors duration-150 relative z-10 min-w-0',
                                  isActive
                                    ? 'text-slate-900 font-bold'
                                    : isParentRoute
                                      ? 'text-white font-semibold'
                                      : 'text-slate-300/85 font-medium hover:bg-white/5 hover:text-white'
                                )
                              }
                            >
                              <item.icon
                                className={cn(
                                  'w-[17px] h-[17px] shrink-0 transition-colors',
                                  isActive ? 'text-primary' : isParentRoute ? 'text-white' : 'text-slate-400',
                                  isCollapsed && 'mx-auto'
                                )}
                              />
                              {!isCollapsed && <span className="truncate">{item.label}</span>}
                            </NavLink>
                            {!isCollapsed && hasChildren && (
                              <button
                                type="button"
                                onClick={() =>
                                  setOpenSubMenus((prev) => ({ ...prev, [item.to]: !(prev[item.to] ?? true) }))
                                }
                                title={isSubOpen ? 'Collapse sub-modules' : 'Expand sub-modules'}
                                className="p-1.5 mr-1 text-slate-300 hover:text-white rounded-md hover:bg-white/10 transition-colors relative z-10 shrink-0"
                              >
                                <ChevronDown
                                  size={14}
                                  className={cn('transition-transform duration-200', !isSubOpen && '-rotate-90')}
                                />
                              </button>
                            )}
                          </div>

                          {!isCollapsed && hasChildren && isSubOpen && (
                            <ul className="ml-4 pl-2.5 border-l border-white/15 space-y-1">
                              {item.children!.map((sub) => {
                                const isSubActive =
                                  location.pathname === item.to && activeAttendanceTab === sub.tab;
                                return (
                                  <li key={sub.to} className="relative">
                                    {isSubActive && (
                                      <motion.div
                                        layoutId="sidebarActiveIndicator"
                                        className="absolute inset-0 bg-white rounded-lg shadow-sm z-0"
                                        transition={{ type: 'spring', stiffness: 360, damping: 32 }}
                                      />
                                    )}
                                    <NavLink
                                      to={sub.to}
                                      className={() =>
                                        cn(
                                          'flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-[12px] transition-colors duration-150 relative z-10',
                                          isSubActive
                                            ? 'text-slate-900 font-bold'
                                            : 'text-slate-300/80 font-medium hover:bg-white/5 hover:text-white'
                                        )
                                      }
                                    >
                                      <sub.icon
                                        className={cn(
                                          'w-[14px] h-[14px] shrink-0 transition-colors',
                                          isSubActive ? 'text-primary' : 'text-slate-400'
                                        )}
                                      />
                                      <span className="truncate">{sub.label}</span>
                                    </NavLink>
                                  </li>
                                );
                              })}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>

        {/* User Profile & Sign Out Footer */}
        <div className="p-3 border-t border-white/10 shrink-0">
          <div
            className={cn(
              'p-2.5 rounded-xl transition-colors',
              isCollapsed ? 'bg-transparent flex justify-center' : 'bg-white/5 border border-white/10'
            )}
          >
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 shrink-0 rounded-lg bg-primary/20 border border-primary/30 flex items-center justify-center font-bold text-white text-xs">
                {(effectiveUserProfile?.username || user?.displayName || user?.email || 'U')
                  .charAt(0)
                  .toUpperCase()}
              </div>
              {!isCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-bold text-white truncate">
                    {effectiveUserProfile?.username || user?.displayName || user?.email?.split('@')[0]}
                  </p>
                  <p
                    className="text-[10px] text-slate-400 truncate mt-0.5"
                    title={formatUserScopeSummary(effectiveUserProfile)}
                  >
                    {effectiveUserProfile?.role || (isAdmin ? 'Super Admin' : 'Staff Member')}
                  </p>
                </div>
              )}
            </div>
            {!isCollapsed && (
              <button
                type="button"
                onClick={handleSignOut}
                className="mt-2.5 flex items-center justify-center gap-2 px-2.5 py-1.5 w-full text-[11px] font-semibold text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors"
              >
                <LogOut size={13} />
                Sign Out
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="print-layout-main flex-1 flex flex-col h-full overflow-hidden relative">
        {previewUserProfile && (
          <div className="bg-amber-600 text-white px-6 py-2 flex items-center justify-between gap-4 text-xs shrink-0 print:hidden">
            <div className="flex items-center gap-2 min-w-0">
              <Eye size={14} className="shrink-0" />
              <span className="font-semibold truncate">
                Role Scope Preview: {previewUserProfile.username} · {previewUserProfile.role} ·{' '}
                {formatUserScopeSummary(previewUserProfile)}
              </span>
            </div>
            <button
              type="button"
              onClick={() => {
                setPreviewUserProfile(null);
                toast.success('Returned to Super Admin full access');
              }}
              className="px-3 py-1 rounded bg-white text-amber-900 font-semibold hover:bg-amber-50 transition-colors whitespace-nowrap shrink-0"
            >
              Exit Preview to Super Admin
            </button>
          </div>
        )}

        {/* Top Header */}
        <header className="min-h-16 h-auto py-2 glass-header flex items-center justify-between px-5 md:px-6 shrink-0 gap-4 flex-wrap print:hidden">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setIsMobileOpen(true)}
              className="md:hidden p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-600 dark:text-slate-300"
            >
              <Menu size={20} />
            </button>

            <Breadcrumb />
          </div>

          <div className="flex items-center gap-2.5 flex-wrap justify-end">
            {settings.showNepaliDateEverywhere !== false && todayDisplay.bs && (
              <div className="hidden xl:flex items-center gap-2 px-3 py-1.5 bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 rounded-lg text-[11px] font-semibold text-slate-700 dark:text-slate-200 tabular-nums">
                <Calendar size={13} className="text-primary shrink-0" />
                <span>{todayDisplay.bs}</span>
                <span className="text-slate-300 dark:text-slate-600">|</span>
                <span className="text-slate-500 dark:text-slate-400">{todayDisplay.ad}</span>
              </div>
            )}

            <div className="flex items-center gap-2 px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs font-medium text-slate-600 dark:text-slate-300">
              <span
                className={cn(
                  'w-2 h-2 rounded-full shrink-0',
                  connectionStatus === 'Connected'
                    ? 'bg-emerald-500'
                    : connectionStatus === 'Reconnecting'
                      ? 'bg-amber-500 animate-pulse'
                      : 'bg-red-500'
                )}
              />
              <span className="hidden sm:inline font-bold">{connectionStatus}</span>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span className="tabular-nums font-semibold">{connectedUsersCount} online</span>
            </div>

            {isAdmin && <LocalModeIndicator />}

            <div className="relative hidden md:block">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Find employee ID or name..."
                value={globalSearchTerm}
                onChange={(e) => {
                  const val = e.target.value;
                  setGlobalSearchTerm(val);
                  if (val.length >= 2) {
                    const searchNorm = val.trim().toLowerCase();
                    const found = employees.find((emp) => {
                      const empIdNorm = emp.id.trim().toLowerCase();
                      const nameNorm = emp.name.trim().toLowerCase();
                      return empIdNorm === searchNorm || nameNorm === searchNorm;
                    });
                    if (found) {
                      openEmployeeProfile(found.id);
                      setGlobalSearchTerm('');
                    }
                  }
                }}
                className="w-52 pl-9 pr-3 h-9 bg-slate-50 dark:bg-slate-800 dark:text-white border border-slate-200 dark:border-slate-700 rounded-lg text-[13px] focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none"
              />
            </div>

            <div className="flex items-center gap-1.5">
              <HeaderButton
                onClick={async () => {
                  if (isRefreshingAll) return;
                  setIsRefreshingAll(true);
                  try {
                    await Promise.all([recalculate(), refreshZkTablesFromSqlite()]);
                  } catch {
                    toast.error('Failed to refresh system data.');
                  } finally {
                    setIsRefreshingAll(false);
                  }
                }}
                disabled={isInitializing || isRefreshingAll}
                title="Refresh Data"
              >
                <RefreshCw size={15} className={isInitializing || isRefreshingAll ? 'animate-spin' : ''} />
              </HeaderButton>
              {canAccessModule('automations') && (
                <HeaderButton
                  onClick={() => navigate('/automations')}
                  title="Notifications & Automations"
                >
                  <Bell size={15} />
                  {unreadNotifications > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center tabular-nums">
                      {unreadNotifications > 9 ? '9+' : unreadNotifications}
                    </span>
                  )}
                </HeaderButton>
              )}
              <HeaderButton
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                title="Toggle Theme"
              >
                {theme === 'light' ? <Moon size={15} /> : <Sun size={15} />}
              </HeaderButton>

              <div className="h-6 w-[1px] bg-slate-200 dark:bg-slate-700 mx-1.5"></div>

              <div className="flex items-center gap-2.5 pl-1">
                <div className="text-right hidden sm:block">
                  <p className="text-[12px] font-bold text-slate-900 dark:text-white leading-none">
                    {effectiveUserProfile?.username || 'System Active'}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-1">
                    {effectiveUserProfile?.role || 'HRIS'}
                  </p>
                </div>
                <div className="w-9 h-9 rounded-lg bg-primary/10 text-primary dark:bg-primary/20 flex items-center justify-center border border-primary/20">
                  <UserIcon size={16} />
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="print-scroll-container flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar-light p-5 md:p-6 print:p-0">
          <div className="max-w-7xl mx-auto pb-8">
            <AnimatePresence mode="wait">
              <motion.div
                key={location.pathname}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
              >
                <Outlet />
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Mobile Categorized Sidebar Drawer */}
      <AnimatePresence>
        {isMobileOpen && (
          <div className="fixed inset-0 z-[100] md:hidden">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileOpen(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              className="absolute top-0 left-0 bottom-0 w-72 enterprise-sidebar shadow-2xl p-5 overflow-y-auto flex flex-col"
            >
              <div className="flex items-center justify-between mb-6 pb-4 border-b border-white/10">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center font-bold text-white uppercase">
                    {(settings.companyName || 'H').charAt(0)}
                  </div>
                  <h1 className="text-white font-bold truncate max-w-[160px]">{settings.companyName}</h1>
                </div>
                <button type="button" onClick={() => setIsMobileOpen(false)} className="text-white/70 hover:text-white">
                  <ChevronLeft size={22} />
                </button>
              </div>

              <nav className="space-y-4 flex-1">
                {visibleGroups.map((group) => (
                  <div key={group.id} className="space-y-1">
                    <p className="px-3 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {group.label}
                    </p>
                    {group.items.map((item) => (
                      <div key={item.to} className="space-y-1">
                        <NavLink
                          to={item.children ? item.children[0].to : item.to}
                          onClick={() => setIsMobileOpen(false)}
                          className={({ isActive }) =>
                            cn(
                              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-[13px] font-semibold transition-all',
                              isActive && !item.children
                                ? 'bg-white text-slate-900 font-bold shadow-sm'
                                : isActive && item.children
                                  ? 'bg-white/10 text-white font-bold'
                                  : 'text-slate-300 hover:bg-white/10 hover:text-white'
                            )
                          }
                        >
                          <item.icon size={18} />
                          {item.label}
                        </NavLink>
                        {item.children && (
                          <div className="ml-4 pl-2.5 border-l border-white/15 space-y-1">
                            {item.children.map((sub) => {
                              const isSubActive =
                                location.pathname === item.to && activeAttendanceTab === sub.tab;
                              return (
                                <NavLink
                                  key={sub.to}
                                  to={sub.to}
                                  onClick={() => setIsMobileOpen(false)}
                                  className={() =>
                                    cn(
                                      'flex items-center gap-2.5 px-3 py-2 rounded-lg text-[12px] font-semibold transition-all',
                                      isSubActive
                                        ? 'bg-white text-slate-900 font-bold shadow-sm'
                                        : 'text-slate-300/85 hover:bg-white/10 hover:text-white'
                                    )
                                  }
                                >
                                  <sub.icon size={15} />
                                  {sub.label}
                                </NavLink>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                ))}
              </nav>

              <button
                type="button"
                onClick={handleSignOut}
                className="mt-4 flex items-center justify-center gap-2 px-3 py-2.5 w-full text-xs font-semibold text-slate-300 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
              >
                <LogOut size={15} />
                Sign Out
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <EmployeeDrawer
        employee={selectedEmployee}
        isOpen={!!selectedEmployeeId}
        onClose={closeEmployeeProfile}
      />

      <ConflictModal
        isOpen={!!conflictData}
        conflictData={conflictData}
        onRefreshLatest={async () => {
          setConflictData(null);
          await reconcileFromServer();
          toast.success('Refreshed to latest server state.');
        }}
        onDismiss={() => setConflictData(null)}
      />

      <QuickActionsMenu />
    </div>
  );
}
