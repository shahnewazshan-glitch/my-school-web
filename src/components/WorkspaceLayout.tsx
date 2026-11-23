import React, { useState } from 'react';
import {
  BookOpenCheck,
  CalendarCheck2,
  ClipboardList,
  FileSpreadsheet,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  MessageSquareText,
  RefreshCw,
  ShieldCheck,
  Users,
  Wifi,
  WifiOff,
  X,
} from 'lucide-react';
import { useApp } from '../contexts/AppContext';
import { getClassLabel, t } from '../lib/i18n';
import { CLASS_LEVELS } from '../types/school';

export type NavTab =
  | 'dashboard'
  | 'students'
  | 'batch-marks'
  | 'attendance'
  | 'batch-fields'
  | 'marksheet'
  | 'comms'
  | 'admin';

interface WorkspaceLayoutProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  children: React.ReactNode;
}

export const WorkspaceLayout: React.FC<WorkspaceLayoutProps> = ({
  activeTab,
  onSelectTab,
  children,
}) => {
  const {
    lang,
    setLang,
    session,
    school,
    students,
    pendingChanges,
    selectedAcademicYear,
    setSelectedAcademicYear,
    selectedClass,
    setSelectedClass,
    isOnline,
    hasPendingSync,
    logout,
  } = useApp();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const pendingCount = pendingChanges.filter((c) => c.status === 'PENDING').length;

  const academicYears = React.useMemo(() => {
    const base = school?.defaultAcademicYear || new Date().getFullYear();
    const years = new Set<number>([base - 1, base, base + 1, selectedAcademicYear]);
    for (const s of students) {
      if (s.academicYear) years.add(Number(s.academicYear));
    }
    return Array.from(years).sort((a, b) => b - a);
  }, [school?.defaultAcademicYear, students, selectedAcademicYear]);

  const navItems: Array<{
    id: NavTab;
    label: string;
    icon: React.FC<{ className?: string }>;
    adminOnly?: boolean;
    badge?: number;
  }> = [
    { id: 'dashboard', label: t(lang, 'navDashboard'), icon: LayoutDashboard },
    { id: 'students', label: t(lang, 'navStudents'), icon: Users },
    { id: 'batch-marks', label: t(lang, 'navBatchMarks'), icon: ClipboardList },
    { id: 'attendance', label: t(lang, 'navAttendance'), icon: CalendarCheck2 },
    { id: 'batch-fields', label: t(lang, 'navBatchFields'), icon: BookOpenCheck },
    { id: 'marksheet', label: t(lang, 'navMarksheet'), icon: FileSpreadsheet },
    { id: 'comms', label: t(lang, 'navComms'), icon: MessageSquareText },
    {
      id: 'admin',
      label: t(lang, 'navAdmin'),
      icon: ShieldCheck,
      adminOnly: true,
      badge: pendingCount > 0 ? pendingCount : undefined,
    },
  ];

  const visibleNavItems = navItems.filter(
    (item) => !item.adminOnly || session?.role === 'ADMIN'
  );

  const activeNavTitle =
    visibleNavItems.find((i) => i.id === activeTab)?.label || t(lang, 'navDashboard');

  const handleNavClick = (id: NavTab) => {
    onSelectTab(id);
    setMobileMenuOpen(false);
  };

  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-white border-r border-stone-200">
      <div className="px-5 py-4 border-b border-stone-200 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-emerald-700 text-white flex items-center justify-center shrink-0">
            <GraduationCap className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-bold text-slate-900 truncate">
              {school?.schoolName || t(lang, 'appTitle')}
            </div>
            <div className="text-xs text-slate-500 font-mono truncate">
              {session?.schoolId}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 cursor-pointer"
          aria-label="Close navigation"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Global Academic Year & Class Selectors */}
      <div className="px-4 py-3.5 border-b border-stone-200 space-y-2.5 bg-stone-50/70">
        <div>
          <label
            htmlFor="global-year-select"
            className="block text-xs font-medium text-slate-500 mb-1"
          >
            {t(lang, 'academicYear')}
          </label>
          <select
            id="global-year-select"
            value={selectedAcademicYear}
            onChange={(e) => setSelectedAcademicYear(Number(e.target.value))}
            className="w-full px-2.5 py-1.5 text-sm bg-white border border-stone-300 rounded-lg text-slate-900 font-medium tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-600"
          >
            {academicYears.map((yr) => (
              <option key={yr} value={yr}>
                {yr}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label
            htmlFor="global-class-select"
            className="block text-xs font-medium text-slate-500 mb-1"
          >
            {t(lang, 'classSelector')}
          </label>
          <select
            id="global-class-select"
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="w-full px-2.5 py-1.5 text-sm bg-white border border-stone-300 rounded-lg text-slate-900 font-medium focus:outline-none focus:ring-2 focus:ring-emerald-600"
          >
            {CLASS_LEVELS.map((cls) => (
              <option key={cls} value={cls}>
                {getClassLabel(cls, lang)}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-3 space-y-1 overflow-y-auto">
        {visibleNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item.id)}
              className={`w-full flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'bg-emerald-50 text-emerald-900 border border-emerald-200/80'
                  : 'text-slate-600 hover:bg-stone-100 hover:text-slate-900 border border-transparent'
              }`}
            >
              <span className="flex items-center gap-2.5 min-w-0">
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    isActive ? 'text-emerald-700' : 'text-slate-400'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </span>
              {item.badge !== undefined && (
                <span className="text-xs font-semibold tabular-nums text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Signed-in Teacher Info */}
      <div className="p-4 border-t border-stone-200 bg-stone-50/50 space-y-3">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-slate-900 truncate">
            {session?.name}
          </div>
          <div className="text-xs text-slate-500 flex items-center gap-1.5 mt-0.5">
            <span>
              {session?.role === 'ADMIN' ? t(lang, 'roleAdmin') : t(lang, 'roleUser')}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums truncate">{session?.phoneNumber}</span>
          </div>
        </div>

        <button
          type="button"
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-stone-300 rounded-lg hover:bg-stone-100 transition-colors cursor-pointer whitespace-nowrap"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>{t(lang, 'logout')}</span>
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-stone-50 flex">
      {/* Desktop Fixed Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 sticky top-0 h-screen no-print">
        <SidebarContent />
      </aside>

      {/* Mobile Slide-Over Sidebar */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex no-print">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileMenuOpen(false)}
          />
          <div className="relative w-72 max-w-[85vw] h-full z-10">
            <SidebarContent />
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar Contract: Clean 3-zone header */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-xs border-b border-stone-200 px-4 sm:px-6 py-3 flex items-center justify-between gap-4 no-print">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-slate-900 rounded-lg hover:bg-stone-100 cursor-pointer"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="min-w-0">
              <h1 className="text-base sm:text-lg font-semibold text-slate-900 truncate">
                {activeNavTitle}
              </h1>
              <div className="text-xs text-slate-500 flex items-center gap-1.5 truncate">
                <span>{getClassLabel(selectedClass, lang)}</span>
                <span aria-hidden="true">/</span>
                <span className="tabular-nums">{selectedAcademicYear}</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            {/* Live Online / Offline & Pending Sync Indicator */}
            <div
              className="flex items-center gap-2 text-xs font-medium text-slate-700 px-2.5 py-1.5 rounded-lg border border-stone-200 bg-stone-50 whitespace-nowrap shrink-0"
              title={
                hasPendingSync
                  ? t(lang, 'pendingSync')
                  : isOnline
                  ? t(lang, 'online')
                  : t(lang, 'offline')
              }
            >
              {hasPendingSync ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 text-amber-600 animate-spin" />
                  <span className="text-amber-700">{t(lang, 'pendingSync')}</span>
                </>
              ) : isOnline ? (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-600" aria-hidden="true" />
                  <Wifi className="w-3.5 h-3.5 text-emerald-700 hidden sm:inline" />
                  <span className="text-emerald-800">{t(lang, 'online')}</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-amber-600" aria-hidden="true" />
                  <WifiOff className="w-3.5 h-3.5 text-amber-700 hidden sm:inline" />
                  <span className="text-amber-800">{t(lang, 'offline')}</span>
                </>
              )}
            </div>

            {/* Language Toggle */}
            <div className="flex items-center gap-0.5 p-0.5 bg-stone-100 border border-stone-200 rounded-lg shrink-0">
              <button
                type="button"
                onClick={() => setLang('en')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  lang === 'en'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLang('bn')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap ${
                  lang === 'bn'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                বাংলা
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
