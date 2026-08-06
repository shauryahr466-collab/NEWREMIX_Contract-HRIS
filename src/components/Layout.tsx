import React, { useState } from 'react';
import { Outlet, NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Users, FileUp, Fingerprint, FileText, Settings, LogOut, Shield, ShieldAlert, Clock, CalendarRange, UserCheck, ChevronLeft, ChevronRight, Search, Bell, User as UserIcon, Menu, Moon, Sun, RefreshCw, DollarSign, Cpu } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAppStore } from '../store';
import { useZkSync } from '../hooks/useZkSync';
import { auth } from '../lib/firebase';
import { signOut } from 'firebase/auth';
import { motion, AnimatePresence } from 'motion/react';
import { EmployeeDrawer } from './EmployeeDrawer';

const ADMIN_EMAILS = ['hr.sandiprajak466@gmail.com', 'shauryahr466@gmail.com'];

function HeaderButton({ children, onClick, title, disabled, className }: { children: React.ReactNode, onClick?: () => void, title?: string, disabled?: boolean, className?: string }) {
  return (
    <button 
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={cn(
        "p-2 text-slate-500 dark:text-slate-400 hover:text-primary dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 rounded transition-all flex items-center justify-center relative",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      {children}
    </button>
  );
}

export function Layout() {
  useZkSync();
  const { 
    settings, selectedEmployeeId, employees, 
    openEmployeeProfile, closeEmployeeProfile, 
    theme, setTheme, globalSearchTerm, setGlobalSearchTerm, 
    recalculate, isInitializing, quotaExceeded, resetError,
    setIsOtpVerified
  } = useAppStore();
  const location = useLocation();
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobileOpen, setIsMobileOpen] = useState(false);
  
  const isAdmin = ADMIN_EMAILS.some(email => auth.currentUser?.email?.toLowerCase() === email.toLowerCase());

  const handleSignOut = () => {
    setIsOtpVerified(false);
    signOut(auth);
  };

  const selectedEmployee = employees.find(e => e.id === selectedEmployeeId) || null;

  const navItems = [
    { to: '/', icon: LayoutDashboard, label: 'Enterprise Dashboard' },
    { to: '/employees', icon: Users, label: 'Employee Directory' },
    { to: '/devices', icon: Cpu, label: 'Device Setup' },
    { to: '/import', icon: FileUp, label: 'Punch Import' },
    { to: '/attendance', icon: Fingerprint, label: 'Attendance logs' },
    { to: '/auditor', icon: ShieldAlert, label: 'Attendance Auditor' },
    { to: '/audit-logs', icon: Shield, label: 'System Audit Log' },
    { to: '/overtime', icon: Clock, label: 'OT Audit Log' },
    { to: '/sbl', icon: CalendarRange, label: 'SBL Management' },
    { to: '/force-attendance', icon: UserCheck, label: 'Manual Corrections' },
    { to: '/payroll', icon: DollarSign, label: 'Payroll & Disburse' },
    { to: '/reports', icon: FileText, label: 'Analytic Reports' },
    { to: '/settings', icon: Settings, label: 'Configuration' },
  ];

  if (isAdmin) {
    navItems.push({ to: '/admin', icon: Shield, label: 'System Admin' });
  }

  const currentNavItem = navItems.find(item => item.to === location.pathname);

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 text-slate-800 dark:text-slate-100 font-sans overflow-hidden transition-colors duration-300">
      <AnimatePresence>
        {quotaExceeded && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="fixed top-0 left-0 right-0 z-[100] bg-rose-600 text-white py-2 px-4 flex items-center justify-center gap-3 shadow-lg"
          >
            <ShieldAlert size={16} className="shrink-0" />
            <p className="text-[10px] font-black uppercase tracking-widest text-center">
              Write Quota Exceeded - System in Read-Only Mode. Please wait for daily reset.
            </p>
            <button 
              onClick={resetError}
              className="ml-4 p-1 hover:bg-white/10 rounded transition-colors"
            >
              <Search size={12} className="rotate-45" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
      {/* Desktop Sidebar */}
      <aside 
        className={cn(
          "flex flex-col hidden md:flex transition-all duration-300 ease-in-out relative z-50",
          theme === 'dark' ? "bg-slate-900 border-r border-slate-800" : "bg-slate-900 border-r border-slate-800",
          isCollapsed ? "w-20" : "w-60"
        )}
      >
        <div className="p-4 h-16 flex items-center justify-between border-b border-slate-800">
          <AnimatePresence mode="wait">
            {!isCollapsed && (
              <motion.div 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="flex items-center gap-2"
              >
                <div className="w-8 h-8 bg-primary rounded flex items-center justify-center font-bold text-white shadow-sm">
                  {settings.companyName.charAt(0).toUpperCase()}
                </div>
                <h1 className="text-sm font-semibold text-white tracking-tight truncate w-32">{settings.companyName}</h1>
              </motion.div>
            )}
          </AnimatePresence>
          <button 
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-400 transition-colors"
          >
            {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
        </div>
        
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto custom-scrollbar">
          <ul className="space-y-0.5">
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  title={isCollapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 px-3 py-2 rounded text-[13px] font-medium transition-all duration-200 group',
                      isActive 
                        ? 'bg-primary text-white' 
                        : 'text-slate-400 hover:bg-slate-800 hover:text-white'
                    )
                  }
                >
                  <item.icon className={cn("w-[18px] h-[18px] shrink-0", isCollapsed ? "mx-auto" : "")} />
                  {!isCollapsed && <span className="truncate">{item.label}</span>}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="p-4 border-t border-slate-800">
          <div className={cn(
            "p-2 rounded transition-all duration-300",
            isCollapsed ? "bg-transparent" : "bg-slate-800/50"
          )}>
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 shrink-0 rounded bg-slate-700 flex items-center justify-center font-semibold text-slate-300 text-xs">
                {auth.currentUser?.displayName?.charAt(0) || auth.currentUser?.email?.charAt(0) || 'U'}
              </div>
              {!isCollapsed && (
                <div className="flex-1 min-w-0">
                  <p className="text-[12px] font-semibold text-white truncate">
                    {auth.currentUser?.displayName || auth.currentUser?.email?.split('@')[0]}
                  </p>
                  <p className="text-[10px] text-slate-500 truncate mt-0.5">
                    {isAdmin ? 'Administrator' : 'Staff Member'}
                  </p>
                </div>
              )}
            </div>
            {!isCollapsed && (
              <button 
                onClick={handleSignOut}
                className="mt-3 flex items-center gap-2 px-2 py-1.5 w-full text-[11px] font-medium text-slate-400 hover:text-white hover:bg-slate-700 rounded transition-all"
              >
                <LogOut size={14} />
                Sign Out
              </button>
            )}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        {/* Top Header */}
        <header className="min-h-16 h-auto py-2 glass-header flex items-center justify-between px-6 shrink-0 gap-4 flex-wrap">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsMobileOpen(true)}
              className="md:hidden p-2 hover:bg-slate-100 rounded"
            >
              <Menu size={20} />
            </button>
            
            <div className="hidden sm:flex items-center gap-2 text-[12px] text-slate-500">
              <NavLink to="/" className="hover:text-primary transition-colors">Home</NavLink>
              <ChevronRight size={12} className="text-slate-300" />
              <span className="font-medium text-slate-900 dark:text-white">{currentNavItem?.label || 'App'}</span>
            </div>
          </div>

          <div className="flex items-center gap-4 flex-wrap justify-end">
            <div className="relative hidden md:block">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input 
                type="text" 
                placeholder="Quick Search..."
                value={globalSearchTerm}
                onChange={(e) => {
                  const val = e.target.value;
                  setGlobalSearchTerm(val);
                  if (val.length >= 2) {
                    const searchNorm = val.trim().toLowerCase();
                    const found = employees.find(emp => {
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
                className="w-56 pl-9 pr-4 py-1.5 bg-slate-50 dark:bg-slate-800 dark:text-white border border-slate-200 dark:border-slate-700 rounded text-[13px] focus:ring-2 focus:ring-primary/20 transition-all outline-none"
              />
            </div>
            
            <div className="flex items-center gap-1.5">
              <HeaderButton 
                onClick={() => recalculate()}
                disabled={isInitializing}
                title="Sync Data"
              >
                <RefreshCw size={16} className={isInitializing ? "animate-spin" : ""} />
              </HeaderButton>
              <HeaderButton 
                onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
                title="Toggle Theme"
              >
                {theme === 'light' ? <Moon size={16} /> : <Sun size={16} />}
              </HeaderButton>
              <HeaderButton title="Notifications">
                <Bell size={16} />
                <span className="absolute top-2 right-2 w-1.5 h-1.5 bg-danger rounded-full"></span>
              </HeaderButton>
              
              <div className="h-6 w-[1px] bg-slate-200 dark:bg-slate-700 mx-2"></div>
              
              <div className="flex items-center gap-3 pl-1">
                <div className="text-right hidden sm:block">
                  <p className="text-[12px] font-semibold text-slate-900 dark:text-white leading-none">System Active</p>
                  <p className="text-[10px] text-slate-500 mt-1">HRIS v2.4</p>
                </div>
                <div className="w-8 h-8 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center border border-slate-200 dark:border-slate-700">
                  <UserIcon size={16} />
                </div>
              </div>
            </div>
          </div>
        </header>
        
        {/* Page Content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar-light p-5 md:p-6">
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

      {/* Mobile Sidebar Overlay */}
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
              className="absolute top-0 left-0 bottom-0 w-72 bg-slate-900 shadow-2xl p-6 overflow-y-auto"
            >
              <div className="flex items-center justify-between mb-10">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 bg-indigo-500 rounded-lg flex items-center justify-center font-bold text-white uppercase">
                    {settings.companyName.charAt(0)}
                  </div>
                  <h1 className="text-white font-black">{settings.companyName}</h1>
                </div>
                <button onClick={() => setIsMobileOpen(false)} className="text-white/60">
                   <ChevronLeft size={24} />
                </button>
              </div>
              
              <nav className="space-y-2">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setIsMobileOpen(false)}
                    className={({ isActive }) =>
                      cn(
                        'flex items-center gap-4 p-4 rounded-2xl text-sm font-bold transition-all',
                        isActive ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-900/20' : 'text-white/40 hover:bg-white/5'
                      )
                    }
                  >
                    <item.icon size={20} />
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <EmployeeDrawer 
        employee={selectedEmployee}
        isOpen={!!selectedEmployeeId}
        onClose={closeEmployeeProfile}
      />
    </div>
  );
}
