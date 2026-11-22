/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
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
import { UserAccess } from './pages/UserAccess';
import { Login } from './pages/Login';
import { StoreProvider, useAppStore } from './store';
import { ActionStatusProvider } from './context/ActionStatusContext';
import { GlobalActionModal } from './components/GlobalActionModal';
import { ErrorBoundary } from './components/ErrorBoundary';
import { getInMemorySessionToken } from './lib/authSession';
import { Toaster } from 'sonner';

function AppContent() {
  const { user, isSuperAdmin, canAccessModule } = useAppStore();

  const isAuthenticated = Boolean(user && getInMemorySessionToken());
  const guard = (moduleKey: Parameters<typeof canAccessModule>[0], element: React.ReactElement) =>
    canAccessModule(moduleKey) ? element : <Navigate to="/" replace />;

  return (
    <BrowserRouter>
      <Toaster position="top-right" richColors />
      {isAuthenticated && <GlobalActionModal />}
      <Routes>
        <Route path="/login" element={isAuthenticated ? <Navigate to="/" replace /> : <Login />} />
        <Route path="/signup" element={<Navigate to="/login" replace />} />
        {!isAuthenticated ? (
          <Route path="*" element={<Navigate to="/login" replace />} />
        ) : (
          <Route path="/" element={<Layout />}>
            <Route index element={canAccessModule('dashboard') ? <ErrorBoundary moduleName="Dashboard"><Dashboard /></ErrorBoundary> : <Navigate to="/attendance" replace />} />
            <Route path="employees" element={guard('employees', <ErrorBoundary moduleName="Employee Directory"><Employees /></ErrorBoundary>)} />
            <Route path="salary-analysis" element={guard('salaryAnalysis', <ErrorBoundary moduleName="Salary Analysis"><SalaryAnalysisPage /></ErrorBoundary>)} />
            <Route path="movement-attrition" element={guard('movementAttrition', <ErrorBoundary moduleName="Movement & Attrition"><MovementAttritionPage /></ErrorBoundary>)} />
            <Route path="devices" element={guard('devices', <ErrorBoundary moduleName="Device Setup"><DeviceSetup /></ErrorBoundary>)} />
            <Route path="import" element={guard('import', <ErrorBoundary moduleName="Punch Import"><Import /></ErrorBoundary>)} />
            <Route path="attendance" element={guard('attendance', <ErrorBoundary moduleName="Attendance Logs"><Attendance /></ErrorBoundary>)} />
            <Route path="auditor" element={guard('auditor', <ErrorBoundary moduleName="Attendance Auditor"><AttendanceAuditor /></ErrorBoundary>)} />
            <Route path="overtime" element={guard('overtime', <ErrorBoundary moduleName="Overtime"><Overtime /></ErrorBoundary>)} />
            <Route path="audit-logs" element={guard('auditLogs', <ErrorBoundary moduleName="Audit Logs"><AuditLogs /></ErrorBoundary>)} />
            <Route path="sbl" element={guard('sbl', <ErrorBoundary moduleName="SBL Management"><SBL /></ErrorBoundary>)} />
            <Route path="force-attendance" element={guard('forceAttendance', <ErrorBoundary moduleName="Manual Corrections"><ForceAttendance /></ErrorBoundary>)} />
            <Route path="payroll" element={guard('payroll', <ErrorBoundary moduleName="Payroll & Disburse"><Payroll /></ErrorBoundary>)} />
            <Route path="reports" element={guard('reports', <ErrorBoundary moduleName="Analytic Reports"><Reports /></ErrorBoundary>)} />
            <Route path="settings" element={guard('settings', <ErrorBoundary moduleName="Configuration"><SettingsPage /></ErrorBoundary>)} />
            {isSuperAdmin && <Route path="user-access" element={<ErrorBoundary moduleName="User & Role Config"><UserAccess /></ErrorBoundary>} />}
            {isSuperAdmin && <Route path="admin" element={<Navigate to="/user-access" replace />} />}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
        )}
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


