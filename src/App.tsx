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
import { AdminDashboard } from './pages/Admin';
import { Login } from './pages/Login';
import { SignUp } from './pages/SignUp';
import { StoreProvider, useAppStore } from './store';
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
  const { quotaExceeded, reportError, setUser, setIsAdmin, isOtpVerified } = useAppStore();
  const [user, setUserLocal] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setUserLocal(u);
      setUser(u);
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
            const { db } = await import('./lib/firebase');
            const { doc, setDoc, getDoc } = await import('firebase/firestore');
            const userDoc = await getDoc(doc(db, 'users', u.uid));
            
            if (!userDoc.exists() || (userDoc.data()?.role !== 'Admin' && userDoc.data()?.role !== 'Editor')) {
              await setDoc(doc(db, 'users', u.uid), {
                id: u.uid,
                username: u.displayName || u.email || 'Admin',
                role: isAdminUser ? 'Admin' : 'Editor'
              }, { merge: true });
              console.log("Verified and synced Editor permissions for owner.");
            }
          } catch (e: any) {
            console.warn("Minor: Admin role sync deferred (possibly quota):", e);
            if (e?.code === 'resource-exhausted' || String(e).toLowerCase().includes('quota')) {
              reportError(e);
            }
          } finally {
            sessionStorage.setItem(sessionKey, 'true');
          }
        }, 3000); // Wait longer to allow other data to load first
        return () => clearTimeout(timeout);
      }
    }
  });
}, [quotaExceeded, reportError]);

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
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="employees" element={<Employees />} />
          <Route path="devices" element={<DeviceSetup />} />
          <Route path="import" element={<Import />} />
          <Route path="attendance" element={<Attendance />} />
          <Route path="auditor" element={<AttendanceAuditor />} />
          <Route path="overtime" element={<Overtime />} />
          <Route path="audit-logs" element={<AuditLogs />} />
          <Route path="sbl" element={<SBL />} />
          <Route path="force-attendance" element={<ForceAttendance />} />
          <Route path="payroll" element={<Payroll />} />
          <Route path="reports" element={<Reports />} />
          <Route path="settings" element={<SettingsPage />} />
          {isAdmin && <Route path="admin" element={<AdminDashboard />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  return (
    <StoreProvider>
      <AppContent />
    </StoreProvider>
  );
}

