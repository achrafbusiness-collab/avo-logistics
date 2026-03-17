
import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { appClient } from '@/api/appClient';
import {
  LayoutDashboard,
  BarChart3,
  Truck,
  Users,
  Menu,
  X,
  LogOut,
  User,
  ChevronDown,
  LifeBuoy,
  Settings,
  ShieldCheck,
  Search,
  Moon,
  Sun,
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { hasPageAccess } from "@/lib/accessControl";
import { useI18n } from "@/i18n";
import CommandPalette from "@/components/system/CommandPalette";
import NotificationBell from "@/components/system/NotificationBell";
import OnboardingTour from "@/components/system/OnboardingTour";
import TrialBanner from "@/components/system/TrialBanner";

// Admin pages (full sidebar)
const adminPages = [
  { name: 'Dashboard', icon: LayoutDashboard, page: 'Dashboard' },
  { name: 'Statistik', icon: BarChart3, page: 'Statistics' },
  { name: 'Aufträge', icon: Truck, page: 'Orders' },
  { name: 'Fahrer', icon: Users, page: 'Drivers' },
  { name: 'Fahrer-Slots', icon: Users, page: 'DriverSlots' },
  { name: 'Kunden & Finanzen', icon: User, page: 'Customers' },
  { name: 'Einstellungen', icon: Settings, page: 'Settings' },
  { name: 'Team', icon: Users, page: 'TeamTransferFleet' },
  { name: 'Admin Controlling', icon: ShieldCheck, page: 'AdminControlling' },
];

export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarHover, setSidebarHover] = useState(false);
  const [user, setUser] = useState(null);
  const [isDriver, setIsDriver] = useState(false);
  const location = useLocation();
  const mainRef = useRef(null);
  const { t, dir } = useI18n();
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('tf-dark-mode');
    if (saved !== null) return JSON.parse(saved);
    return true;
  });

  useEffect(() => {
    localStorage.setItem('tf-dark-mode', JSON.stringify(darkMode));
  }, [darkMode]);

  useEffect(() => {
    loadUser();
  }, []);


  useEffect(() => {
    if (isDriver) return;
    const node = mainRef.current;
    if (!node) return;
    const key = `scroll:admin:${location.pathname}${location.search}`;
    const handleScroll = () => {
      sessionStorage.setItem(key, String(node.scrollTop));
    };
    node.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      node.removeEventListener('scroll', handleScroll);
    };
  }, [isDriver, location.pathname, location.search]);

  useEffect(() => {
    if (isDriver) return;
    const node = mainRef.current;
    if (!node) return;
    const key = `scroll:admin:${location.pathname}${location.search}`;
    const saved = sessionStorage.getItem(key);
    const nextTop = saved ? Number(saved) : 0;
    requestAnimationFrame(() => {
      node.scrollTop = Number.isFinite(nextTop) ? nextTop : 0;
    });
  }, [isDriver, location.pathname, location.search]);

  const loadUser = async () => {
    try {
      const currentUser = await appClient.auth.me();
      if (!currentUser) {
        setUser(null);
        setIsDriver(false);
        return;
      }
      setUser(currentUser);
      // Driver role uses the minimal layout.
      setIsDriver(currentUser.role === 'driver');
    } catch {
      // Not logged in – user stays on login page
    }
  };

  const handleLogout = async () => {
    try {
      await appClient.auth.logout();
    } finally {
      setUser(null);
      setIsDriver(false);
      window.location.href = createPageUrl('Login');
    }
  };

  // Drivers always stay inside the driver portal layout.
  if (isDriver) {
    const driverPages = [
      { name: t('nav.orders'), icon: Truck, page: 'DriverOrders' },
      { name: t('nav.profile'), icon: User, page: 'DriverProfile' },
      { name: t('nav.support'), icon: LifeBuoy, page: 'DriverSupport' },
    ];
    return (
      <div
        dir={dir}
        className={`min-h-screen driver-layout ${dir === 'rtl' ? 'rtl' : 'ltr'} bg-gradient-to-b from-slate-950 via-slate-900 to-blue-950 text-slate-100`}
      >
        <style>{`
          :root {
            --primary: #1e3a5f;
            --primary-light: #2d5a8a;
            --accent: #3b82f6;
          }
        `}</style>

        {/* Driver Header */}
        <header className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 backdrop-blur-xl text-white px-4 py-3 flex items-center justify-between sticky top-0 z-50 border-b border-white/10 shadow-lg shadow-black/20">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="TransferFleet" className="h-8 w-auto" />
          </div>

          <div className="flex items-center gap-2">
            {user && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-white text-sm transition-colors hover:bg-white/20" aria-label="Benutzerkonto">
                    <User className="w-4 h-4" />
                    <span className="truncate max-w-[120px]">{user.full_name || user.email}</span>
                    <ChevronDown className="w-3.5 h-3.5 opacity-70" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="w-4 h-4 mr-2" />
                    {t('nav.logout')}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </header>

        <main className="pb-28 tf-driver-dark">
          {children}
        </main>

        {/* Bottom Navigation for Driver */}
        {!['DriverProtocol', 'DriverChecklist'].includes(currentPageName) && (
          <div className="fixed bottom-0 left-0 right-0 p-3 z-50">
            <nav className="mx-auto max-w-md rounded-2xl backdrop-blur-xl shadow-2xl px-2 py-2 flex justify-between driver-bottom-nav bg-slate-800/95 border border-slate-700/50 shadow-black/30">
              {driverPages.map((item) => {
                const isActive = currentPageName === item.page;
                return (
                  <Link
                    key={item.page}
                    to={createPageUrl(item.page)}
                    className={`driver-nav-item flex flex-col items-center flex-1 rounded-xl px-4 py-2 transition-all ${
                      isActive
                        ? 'text-white bg-gradient-to-r from-cyan-500 to-blue-500 shadow-md shadow-cyan-500/25'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span className="text-[10px] font-medium mt-0.5">{item.name}</span>
                  </Link>
                );
              })}
            </nav>
          </div>
        )}
      </div>
    );
  }

  const visibleAdminPages = adminPages.filter((item) => hasPageAccess(user, item.page));
  const sidebarVisible = sidebarOpen || sidebarHover;

  // Admin Layout
  return (
    <div className="h-screen overflow-hidden flex bg-slate-950">
      <style>{`
        :root {
          --primary: #1e3a5f;
          --primary-light: #2d5a8a;
          --accent: #3b82f6;
        }
      `}</style>

      {/* Sidebar */}
      <aside
        onMouseEnter={() => setSidebarHover(true)}
        onMouseLeave={() => setSidebarHover(false)}
        className={`
        fixed inset-y-0 left-0 z-50
        w-[85vw] max-w-64 text-white
        transform transition-transform duration-300 ease-in-out
        ${sidebarVisible ? 'translate-x-0' : '-translate-x-full'}
        bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950
      `}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <div>
              <p className="text-lg font-semibold uppercase tracking-[0.18em] text-blue-200">TRANSFERFLEET</p>
              <p className="text-[11px] mt-1 text-white/70">
                Ihr KI-automatisiertes System für Fahrzeugüberführung
              </p>
            </div>
            <button 
              onClick={() => {
                setSidebarOpen(false);
                setSidebarHover(false);
              }}
              className="lg:hidden p-1 rounded hover:bg-white/10"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <nav className="flex-1 overflow-y-auto p-4 space-y-1">
            {visibleAdminPages.map((item) => {
              const isActive = currentPageName === item.page;
              return (
                <Link
                  key={item.page}
                  to={createPageUrl(item.page)}
                  onClick={() => {
                    setSidebarOpen(false);
                    setSidebarHover(false);
                  }}
                  className={`
                    flex items-center gap-3 px-4 py-3 rounded-lg transition-all
                    ${isActive
                      ? 'bg-white/20 text-white'
                      : 'text-white/70 hover:bg-white/10 hover:text-white'}
                  `}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium">{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {user && (
            <div className="p-4 border-t border-white/10">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all hover:bg-white/10">
                    <div className="w-8 h-8 rounded-full flex items-center justify-center bg-white/20">
                      <User className="w-4 h-4" />
                    </div>
                    <div className="flex-1 text-left">
                      <p className="text-sm font-medium truncate" title={user.full_name || 'Admin'}>{user.full_name || 'Admin'}</p>
                      <p className="text-xs truncate text-white/60" title={user.email}>{user.email}</p>
                    </div>
                    <ChevronDown className="w-4 h-4 text-white/60" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={handleLogout}>
                    <LogOut className="w-4 h-4 mr-2" />
                    Abmelden
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          )}
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div
        className="hidden lg:block fixed inset-y-0 left-0 w-2 z-30"
        onMouseEnter={() => setSidebarHover(true)}
        onMouseLeave={() => setSidebarHover(false)}
      />

      {/* Main Content */}
      <div
        className={`flex-1 flex flex-col min-h-0 transition-[margin] duration-300 ${
          sidebarVisible ? 'lg:ml-64' : 'lg:ml-0'
        }`}
      >
        {/* Top Bar */}
        <header className={`border-b px-6 py-4 flex items-center justify-between lg:px-8 ${darkMode ? 'bg-[#0a1628] border-[#0a1628]' : 'bg-white border-slate-200'}`}>
          <button
            onClick={() => {
              setSidebarOpen((prev) => !prev);
              setSidebarHover(false);
            }}
            className={`p-2 rounded-lg ${darkMode ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
            aria-label="Navigation öffnen"
          >
            <Menu className={`w-5 h-5 ${darkMode ? 'text-white' : 'text-slate-700'}`} />
          </button>

          <div className="flex-1 lg:flex-none" />

          <div className="flex items-center gap-2">
            {/* Global search hint button */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const e = new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true });
                document.dispatchEvent(e);
              }}
              className={`hidden sm:flex items-center gap-2 text-xs border rounded-lg px-3 py-1.5 ${darkMode ? 'text-white/70 border-white/20 hover:bg-white/10' : 'text-slate-500 border-slate-200 hover:bg-gray-100'}`}
              aria-label="Globale Suche öffnen (Strg+K)"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Suchen…</span>
              <kbd className={`font-mono text-[10px] px-1 py-0.5 rounded ${darkMode ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-500'}`}>⌘K</kbd>
            </Button>

            <NotificationBell />

            <Button variant="ghost" size="sm" onClick={() => setDarkMode(!darkMode)}
              className={darkMode ? 'text-white/70 hover:bg-white/10 hover:text-white' : 'text-slate-500 hover:bg-gray-100'}>
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>

            <span className={`text-sm hidden lg:block ${darkMode ? 'text-white/60' : 'text-gray-500'}`}>
              {new Date().toLocaleDateString('de-DE', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })}
            </span>
          </div>
        </header>

        {/* Page Content */}
        <main
          ref={mainRef}
          className={`flex-1 p-4 lg:p-6 overflow-auto ${darkMode ? 'bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950' : 'bg-slate-100'}`}
        >
          <TrialBanner trialStatus={user?.trialStatus} />
          <div className={`tf-page-content min-h-full p-5 lg:p-8 ${darkMode ? 'tf-dark' : 'rounded-[28px] bg-white shadow-[0_30px_60px_-40px_rgba(15,23,42,0.15)]'}`}>
            {children}
          </div>
        </main>
      </div>

      {/* Global features */}
      <CommandPalette />
      <OnboardingTour />
    </div>
  );
}
