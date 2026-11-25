import { useState } from 'react';
import { Layout, NavKey } from './components/Layout';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ToastProvider } from './context/ToastContext';
import { AttendancePage } from './pages/AttendancePage';
import { ClassesPage } from './pages/ClassesPage';
import { DashboardPage } from './pages/DashboardPage';
import { LoginPage } from './pages/LoginPage';
import { ReportsPage } from './pages/ReportsPage';
import { ResultsPage } from './pages/ResultsPage';
import { SettingsPage } from './pages/SettingsPage';
import { StudentsPage } from './pages/StudentsPage';
import { SubjectsPage } from './pages/SubjectsPage';
import { TeachersPage } from './pages/TeachersPage';

function AppShell() {
  const { session, loading } = useAuth();
  const [activeNav, setActiveNav] = useState<NavKey>('dashboard');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 text-slate-600 text-sm">
        Loading school portal...
      </div>
    );
  }

  if (!session) {
    return <LoginPage />;
  }

  return (
    <Layout activeNav={activeNav} onSelectNav={setActiveNav}>
      {activeNav === 'dashboard' && <DashboardPage />}
      {activeNav === 'students' && <StudentsPage />}
      {activeNav === 'teachers' && <TeachersPage />}
      {activeNav === 'subjects' && <SubjectsPage />}
      {activeNav === 'classes' && <ClassesPage />}
      {activeNav === 'results' && <ResultsPage />}
      {activeNav === 'attendance' && <AttendancePage />}
      {activeNav === 'reports' && <ReportsPage />}
      {activeNav === 'settings' && <SettingsPage />}
    </Layout>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ToastProvider>
  );
}
