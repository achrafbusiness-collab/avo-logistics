
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

// Admin pages (full sidebar)
const adminPages = [
  { name: 'Dashboard', icon: LayoutDashboard, page: 'Dashboard' },
  { name: 'Statistik', icon: BarChart3, page: 'Statistics' },
  { name: 'Aufträge', icon: Truck, page: 'Orders' },
  { name: 'Fahrer', icon: Users, page: 'Drivers' },
  { name: 'Kunden & Finanzen', icon: User, page: 'Customers' },
  { name: 'App & Einstellungen', icon: Settings, page: 'AppConnection' },
  { name: 'Team', icon: Users, page: 'TeamAVO' },
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
  useEffect(() => {
    loadUser();
    // Ensure dark mode is fully removed
    document.documentElement.classList.remove('dark');
    localStorage.removeItem('avo-dark-mode');
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
        className={`min-h-screen driver-layout bg-gray-50 ${dir === 'rtl' ? 'rtl' : 'ltr'}`}
      >
        <style>{`
          :root {
            --primary: #1e3a5f;
            --primary-light: #2d5a8a;
            --accent: #3b82f6;
          }
        `}</style>
        
        {/* Driver Header */}
        <header className="bg-[#1e3a5f] text-white px-4 py-3 flex items-center justify-between sticky top-0 z-50">
          <div className="flex items-center gap-3">
            <Truck className="w-6 h-6" />
            <span className="font-semibold text-lg">{t('nav.driverPortal')}</span>
          </div>
          
          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="text-white hover:bg-white/10" aria-label="Benutzerkonto">
                  <User className="w-5 h-5 mr-2" />
                  {user.full_name || user.email}
                  <ChevronDown className="w-4 h-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="w-4 h-4 mr-2" />
                  {t('nav.logout')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </header>

        <main className="pb-20">
          {children}
        </main>

        {/* Bottom Navigation for Driver */}
        {!['DriverProtocol', 'DriverChecklist'].includes(currentPageName) && (
          <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-3 py-2 flex justify-between z-50 driver-bottom-nav">
            {driverPages.map((item) => {
              const isActive = currentPageName === item.page;
              return (
                <Link
                  key={item.page}
                  to={createPageUrl(item.page)}
                  className={`driver-nav-item flex flex-col items-center flex-1 py-2 px-2 rounded-xl ${
                    isActive ? 'text-[#1e3a5f] bg-blue-50' : 'text-gray-500'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="text-[11px] mt-1">{item.name}</span>
                </Link>
              );
            })}
          </nav>
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
        w-64 text-white
        transform transition-transform duration-300 ease-in-out
        ${sidebarVisible ? 'translate-x-0' : '-translate-x-full'}
        bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950
      `}
      >
        <div className="flex h-full flex-col">
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <div>
              <p className="text-lg font-semibold uppercase tracking-[0.18em] text-blue-200">AVO SYSTEMS</p>
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
        <header className="border-b px-6 py-4 flex items-center justify-between lg:px-8 bg-[#0a1628] border-[#0a1628]">
          <button
            onClick={() => {
              setSidebarOpen((prev) => !prev);
              setSidebarHover(false);
            }}
            className="p-2 rounded-lg hover:bg-white/10"
            aria-label="Navigation öffnen"
          >
            <Menu className="w-5 h-5 text-white" />
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
              className="hidden sm:flex items-center gap-2 text-xs text-white/70 border border-white/20 rounded-lg px-3 py-1.5 hover:bg-white/10"
              aria-label="Globale Suche öffnen (Strg+K)"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Suchen…</span>
              <kbd className="font-mono text-[10px] px-1 py-0.5 rounded bg-white/15 text-white">⌘K</kbd>
            </Button>

            <NotificationBell />

            <span className="text-sm hidden lg:block text-white/60">
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
          className="flex-1 p-4 lg:p-6 overflow-auto bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950"
        >
          <div className="avo-page-content min-h-full p-5 lg:p-8">
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
