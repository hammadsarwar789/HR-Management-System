import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { EmployeesPage } from './pages/EmployeesPage';
import { AttendancePage } from './pages/AttendancePage';
import { LeavePage } from './pages/LeavePage';
import { PayrollPage } from './pages/PayrollPage';
import { AssetsPage } from './pages/AssetsPage';
import { ExpensesPage } from './pages/ExpensesPage';
import { PerformancePage } from './pages/PerformancePage';
import { NoticesPage } from './pages/NoticesPage';
import { AuditPage } from './pages/AuditPage';
import { ProfilePage } from './pages/ProfilePage';
import { DocumentsPage } from './pages/DocumentsPage';
import { RevenuePage } from './pages/RevenuePage';
import { ChatPage } from './pages/ChatPage';
import { TasksManagementPage } from './pages/TasksManagementPage';
import { MyTasksPage } from './pages/MyTasksPage';
import { AgileWorkspacePage } from './pages/AgileWorkspacePage';
import { DashboardLayout } from './layouts/DashboardLayout';
import { useAuthStore } from './store/authStore';

const ProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const token = localStorage.getItem('access_token');
  if (!token) {
    return <Navigate to="/login" replace />;
  }
  return <DashboardLayout>{children}</DashboardLayout>;
};

const TasksRedirectHandler: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const isManager = user?.role === 'Super Admin' || user?.role === 'HR Manager' || user?.role === 'Department Manager';
  return <Navigate to={isManager ? '/tasks/manage' : '/tasks/my-tasks'} replace />;
};

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />

        <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
        <Route path="/documents" element={<ProtectedRoute><DocumentsPage /></ProtectedRoute>} />
        <Route path="/chat" element={<ProtectedRoute><ChatPage /></ProtectedRoute>} />
        <Route path="/tasks" element={<ProtectedRoute><TasksRedirectHandler /></ProtectedRoute>} />
        <Route path="/tasks/manage" element={<ProtectedRoute><TasksManagementPage /></ProtectedRoute>} />
        <Route path="/tasks/my-tasks" element={<ProtectedRoute><MyTasksPage /></ProtectedRoute>} />
        <Route path="/tasks/agile" element={<ProtectedRoute><AgileWorkspacePage /></ProtectedRoute>} />
        <Route path="/employees" element={<ProtectedRoute><EmployeesPage /></ProtectedRoute>} />
        <Route path="/attendance" element={<ProtectedRoute><AttendancePage /></ProtectedRoute>} />
        <Route path="/leave" element={<ProtectedRoute><LeavePage /></ProtectedRoute>} />
        <Route path="/payroll" element={<ProtectedRoute><PayrollPage /></ProtectedRoute>} />
        <Route path="/revenue" element={<ProtectedRoute><RevenuePage /></ProtectedRoute>} />
        <Route path="/assets" element={<ProtectedRoute><AssetsPage /></ProtectedRoute>} />
        <Route path="/expenses" element={<ProtectedRoute><ExpensesPage /></ProtectedRoute>} />
        <Route path="/performance" element={<ProtectedRoute><PerformancePage /></ProtectedRoute>} />
        <Route path="/notices" element={<ProtectedRoute><NoticesPage /></ProtectedRoute>} />
        <Route path="/audit" element={<ProtectedRoute><AuditPage /></ProtectedRoute>} />

        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
};

export default App;
