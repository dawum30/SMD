import React, { useState } from 'react';
import {
  BarChart3,
  BookOpen,
  CalendarCheck,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Layers,
  LogOut,
  Menu,
  Settings,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { Avatar } from './ui/Avatar';

export type NavKey =
  | 'dashboard'
  | 'students'
  | 'teachers'
  | 'subjects'
  | 'classes'
  | 'results'
  | 'attendance'
  | 'reports'
  | 'settings';

interface LayoutProps {
  activeNav: NavKey;
  onSelectNav: (key: NavKey) => void;
  children: React.ReactNode;
}

const NAV_ITEMS: { key: NavKey; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'dashboard', label: 'Dashboard', icon: BarChart3 },
  { key: 'students', label: 'Students', icon: GraduationCap },
  { key: 'teachers', label: 'Teachers', icon: Users },
  { key: 'subjects', label: 'Subjects', icon: BookOpen },
  { key: 'classes', label: 'Classes', icon: Layers },
  { key: 'results', label: 'Results', icon: FileSpreadsheet },
  { key: 'attendance', label: 'Attendance', icon: CalendarCheck },
  { key: 'reports', label: 'Reports', icon: FileText },
  { key: 'settings', label: 'Settings', icon: Settings },
];

const ROLE_LABELS: Record<string, string> = {
  super_admin: 'Super Administrator',
  school_admin: 'School Administrator',
  teacher: 'Teacher',
};

export function Layout({ activeNav, onSelectNav, children }: LayoutProps) {
  const { session, activeSchool, role, isSuperAdmin, switchSchool, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  const activeLabel = NAV_ITEMS.find((i) => i.key === activeNav)?.label || 'Dashboard';

  const handleNavClick = (key: NavKey) => {
    onSelectNav(key);
    setMobileOpen(false);
  };

  const SidebarContent = (
    <div className="flex flex-col h-full bg-white border-r border-slate-200 w-[260px]">
      <div className="px-5 py-4 border-b border-slate-200 flex items-center gap-3">
        <img
          src={activeSchool?.logo_url || '/crest-default.jpg'}
          alt={activeSchool?.name || 'School Crest'}
          referrerPolicy="no-referrer"
          className="w-9 h-9 rounded-lg object-cover border border-slate-200 bg-white shrink-0"
        />
        <div className="min-w-0">
          <p className="text-sm font-bold text-slate-900 truncate font-display">
            {activeSchool?.name || 'Akwaaba SchoolSuite'}
          </p>
          <p className="text-xs text-slate-500 truncate">{activeSchool?.code || 'Basic 1–9 Portal'}</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Main Navigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = activeNav === item.key;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => handleNavClick(item.key)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                active
                  ? 'bg-emerald-950 text-white'
                  : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-emerald-200' : 'text-slate-500'}`} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>

      <div className="p-3 border-t border-slate-200">
        <button
          type="button"
          onClick={logout}
          className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-700 hover:bg-red-50 transition-colors whitespace-nowrap"
        >
          <LogOut className="w-4 h-4 shrink-0" />
          <span>Logout</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-50 text-slate-900">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block shrink-0 no-print">{SidebarContent}</aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div className="fixed inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} />
          <div className="relative z-10 flex h-full">
            {SidebarContent}
            <button
              type="button"
              onClick={() => setMobileOpen(false)}
              className="m-3 p-2 h-10 w-10 rounded-lg bg-white text-slate-700 shadow-md flex items-center justify-center"
              aria-label="Close navigation"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-4 shrink-0 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="text-slate-500 hidden sm:inline whitespace-nowrap">Akwaaba SchoolSuite</span>
              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
                /
              </span>
              <h1 className="font-semibold text-slate-900 truncate">{activeLabel}</h1>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            {isSuperAdmin && session && session.schools.length > 1 && (
              <select
                aria-label="Switch active school"
                value={session.activeSchoolId}
                onChange={(e) => switchSchool(e.target.value)}
                className="hidden sm:block text-xs font-medium bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-slate-800 max-w-[200px]"
              >
                {session.schools.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}

            <div className="flex items-center gap-3 min-w-0">
              <Avatar src={session?.user.avatar_url} name={session?.user.full_name || 'User'} size="sm" />
              <div className="hidden md:block text-right min-w-0">
                <p className="text-xs font-semibold text-slate-900 truncate max-w-[160px]">
                  {session?.user.full_name}
                </p>
                <p className="text-[11px] text-slate-500 whitespace-nowrap">{ROLE_LABELS[role] || role}</p>
              </div>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">{children}</main>
      </div>
    </div>
  );
}
