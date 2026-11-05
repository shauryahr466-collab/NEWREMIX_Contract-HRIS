/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged, User } from 'firebase/auth';
import { auth } from './lib/firebase';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { Employees } from './pages/Employees';
import { Import } from './pages/Import';
import { Attendance } from './pages/Attendance';
import AttendanceAuditor from './pages/AttendanceAuditor';
import Overtime from './pages/Overtime';
import SBL from './pages/SBL';
import AuditLogs from './pages/AuditLogs';
import ForceAttendance from './pages/ForceAttendance';
import { Reports } from './pages/Reports';
import { Payroll } from './pages/Payroll';
import { DeviceSetup } from './pages/DeviceSetup';
import { SettingsPage } from './pages/Settings';
import { SalaryAnalysisPage } from './pages/SalaryAnalysisPage';
import { MovementAttritionPage } from './pages/MovementAttritionPage';
import { AdminDashboard } from './pages/Admin';
import { Login } from './pages/Login';
import { SignUp } from './pages/SignUp';
import { StoreProvider, useAppStore } from './store';
import { ActionStatusProvider } from './context/ActionStatusContext';
import { GlobalActionModal } from './components/GlobalActionModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AlertCircle, X } from 'lucide-react';
import { Toaster } from 'sonner';

const ADMIN_EMAILS = ['hr.sandiprajak466@gmail.com', 'shauryahr466@gmail.com'];

function QuotaBanner() {
  const { quotaExceeded, lastError, resetError } = useAppStore();
  
  if (!quotaExceeded) return null;
  
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[100] max-w-lg w-full px-4 animate-in slide-in-from-bottom-4">
      <div className="bg-white p-5 rounded-2xl shadow-2xl flex gap-4 items-start border-2 border-red-100 ring-4 ring-red-50">
        <div className="p-3 bg-red-50 rounded-xl">
          <AlertCircle className="w-6 h-6 text-red-600" />
        </div>
        <div className="flex-1">
          <p className="text-base font-bold text-slate-900 leading-none">Database Quota Exceeded</p>
          <p className="text-xs text-slate-500 mt-2 leading-relaxed">
            The system has reached the daily limit for free database writes. Import, deletion, and settings updates are paused until reset (approx. midnight). 
            <br/><span className="text-red-600 font-semibold mt-1 inline-block">App will remain in read-only mode.</span>
          </p>
        </div>
        <button onClick={resetError} className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400">
          <X className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}

function AppContent() {
  const { quotaExceeded, reportError, setUser, setIsAdmin, isOtpVerified, user: storeUser } = useAppStore();
  const [user, setUserLocal] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 1. Initial local session user restoration
    const savedLocalUser = sessionStorage.getItem('local_session_user');
    if (savedLocalUser) {
      try {
        const parsed = JSON.parse(savedLocalUser);
        setUserLocal(parsed);
        setUser(parsed);
        setIsAdmin(ADMIN_EMAILS.some(email => parsed.email?.toLowerCase() === email.toLowerCase()));
        setLoading(false);
      } catch (e) {
        // ignore
      }
    }

    return onAuthStateChanged(auth, async (u) => {
      if (u) {
        setUserLocal(u);
        setUser(u);
        sessionStorage.removeItem('local_session_user');
      } else {
        const currentSaved = sessionStorage.getItem('local_session_user');
        if (currentSaved) {
          try {
            const parsed = JSON.parse(currentSaved);
            setUserLocal(parsed);
            setUser(parsed);
          } catch (e) {
            setUserLocal(null);
            setUser(null);
          }
        } else {
          setUserLocal(null);
          setUser(null);
        }
      }
      setLoading(false);

      if (u) {
        const isAdminUser = ADMIN_EMAILS.some(email => u.email?.toLowerCase() === email.toLowerCase());
        setIsAdmin(isAdminUser);

        // Only attempt to sync role if not already synced this session
        const sessionKey = `admin_synced_${u.uid}`;
        const alreadySynced = sessionStorage.getItem(sessionKey);

        if (!quotaExceeded && isAdminUser && !alreadySynced) {
          const timeout = setTimeout(async () => {
            try {
              await fetch('/api/admin/create-user', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  uid: u.uid,
                  email: u.email || 'admin@local',
                  name: u.displayName || u.email || 'Admin',
                  role: isAdminUser ? 'Admin' : 'Editor'
                })
              });
            } catch (e: any) {
              console.warn("Admin role SQLite sync note:", e);
            } finally {
              sessionStorage.setItem(sessionKey, 'true');
            }
          }, 1000);
          return () => clearTimeout(timeout);
        }
      }
    });
  }, [quotaExceeded, reportError, setUser, setIsAdmin]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user || !isOtpVerified) {
    return (
      <BrowserRouter>
        <Toaster position="top-right" richColors />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<SignUp />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    );
  }

  const isAdmin = ADMIN_EMAILS.some(email => user.email?.toLowerCase() === email.toLowerCase());

  return (
    <BrowserRouter>
      <Toaster position="top-right" richColors />
      <QuotaBanner />
      <GlobalActionModal />
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<ErrorBoundary moduleName="Dashboard"><Dashboard /></ErrorBoundary>} />
          <Route path="employees" element={<ErrorBoundary moduleName="Employee Directory"><Employees /></ErrorBoundary>} />
          <Route path="salary-analysis" element={<ErrorBoundary moduleName="Salary Analysis"><SalaryAnalysisPage /></ErrorBoundary>} />
          <Route path="movement-attrition" element={<ErrorBoundary moduleName="Movement & Attrition"><MovementAttritionPage /></ErrorBoundary>} />
          <Route path="devices" element={<ErrorBoundary moduleName="Device Setup"><DeviceSetup /></ErrorBoundary>} />
          <Route path="import" element={<ErrorBoundary moduleName="Punch Import"><Import /></ErrorBoundary>} />
          <Route path="attendance" element={<ErrorBoundary moduleName="Attendance Logs"><Attendance /></ErrorBoundary>} />
          <Route path="auditor" element={<ErrorBoundary moduleName="Attendance Auditor"><AttendanceAuditor /></ErrorBoundary>} />
          <Route path="overtime" element={<ErrorBoundary moduleName="Overtime"><Overtime /></ErrorBoundary>} />
          <Route path="audit-logs" element={<ErrorBoundary moduleName="Audit Logs"><AuditLogs /></ErrorBoundary>} />
          <Route path="sbl" element={<ErrorBoundary moduleName="SBL Management"><SBL /></ErrorBoundary>} />
          <Route path="force-attendance" element={<ErrorBoundary moduleName="Manual Corrections"><ForceAttendance /></ErrorBoundary>} />
          <Route path="payroll" element={<ErrorBoundary moduleName="Payroll & Disburse"><Payroll /></ErrorBoundary>} />
          <Route path="reports" element={<ErrorBoundary moduleName="Analytic Reports"><Reports /></ErrorBoundary>} />
          <Route path="settings" element={<ErrorBoundary moduleName="Configuration"><SettingsPage /></ErrorBoundary>} />
          {isAdmin && <Route path="admin" element={<ErrorBoundary moduleName="System Admin"><AdminDashboard /></ErrorBoundary>} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <ActionStatusProvider>
        <AppContent />
      </ActionStatusProvider>
    </StoreProvider>
  );
}

