
import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { appClient } from '@/api/appClient';
import { 
  LayoutDashboard, 
  Truck, 
  Users, 
  ClipboardList,
  FileText,
  Search,
  Menu,
  X,
  LogOut,
  User,
  ChevronDown,
  Sparkles,
  Moon,
  Sun,
  Terminal,
  Building2,
  History
} from 'lucide-react';
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { hasPageAccess } from "@/lib/accessControl";

// Admin pages (full sidebar)
const adminPages = [
  { name: 'Dashboard', icon: LayoutDashboard, page: 'Dashboard' },
  { name: 'AVO AI', icon: Sparkles, page: 'AVOAI' },
  { name: 'Aufträge', icon: Truck, page: 'Orders' },
  { name: 'Kunden', icon: User, page: 'Customers' },
  { name: 'Fahrer', icon: Users, page: 'Drivers' },
  { name: 'Protokolle', icon: ClipboardList, page: 'Checklists' },
  { name: 'App-Verbindung', icon: User, page: 'AppConnection' },
  { name: 'Suche', icon: Search, page: 'Search' },
  { name: 'Team', icon: Users, page: 'TeamAVO' },
  { name: 'Verlauf', icon: History, page: 'Verlauf' },
  { name: 'Terminal', icon: Terminal, page: 'Terminal' },
  { name: 'System-Vermietung', icon: Building2, page: 'SystemVermietung' },
];

// Driver pages (minimal navigation)
const driverPages = [
  { name: 'Meine Aufträge', icon: Truck, page: 'DriverOrders' },
];

export default function Layout({ children, currentPageName }) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [user, setUser] = useState(null);
  const [isDriver, setIsDriver] = useState(false);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('avo-dark-mode');
    return saved ? JSON.parse(saved) : true;
  });

  useEffect(() => {
    loadUser();
  }, []);

  useEffect(() => {
    localStorage.setItem('avo-dark-mode', JSON.stringify(darkMode));
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [darkMode]);

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
    } catch (e) {
      console.log('Not logged in');
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
    return (
      <div className={`min-h-screen ${darkMode ? 'bg-gray-950' : 'bg-gray-50'}`}>
        <style>{`
          :root {
            --primary: #1e3a5f;
            --primary-light: #2d5a8a;
            --accent: #3b82f6;
          }
        `}</style>
        
        {/* Driver Header */}
        <header className={`${darkMode ? 'bg-gray-900' : 'bg-[#1e3a5f]'} text-white px-4 py-3 flex items-center justify-between sticky top-0 z-50`}>
          <div className="flex items-center gap-3">
            <Truck className="w-6 h-6" />
            <span className="font-semibold text-lg">Fahrer-Portal</span>
          </div>
          
          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="text-white hover:bg-white/10">
                  <User className="w-5 h-5 mr-2" />
                  {user.full_name || user.email}
                  <ChevronDown className="w-4 h-4 ml-2" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleLogout}>
                  <LogOut className="w-4 h-4 mr-2" />
                  Abmelden
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </header>

        <main className="pb-20">
          {children}
        </main>

        {/* Bottom Navigation for Driver */}
        <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 px-4 py-2 flex justify-around z-50">
          <Link 
            to={createPageUrl('DriverOrders')}
            className={`flex flex-col items-center py-2 px-4 rounded-lg ${currentPageName === 'DriverOrders' ? 'text-[#1e3a5f] bg-blue-50' : 'text-gray-500'}`}
          >
            <Truck className="w-6 h-6" />
            <span className="text-xs mt-1">Aufträge</span>
          </Link>
        </nav>
      </div>
    );
  }

  const visibleAdminPages = adminPages.filter((item) => hasPageAccess(user, item.page));

  // Admin Layout
  return (
    <div className="min-h-screen flex bg-slate-950">
      <style>{`
        :root {
          --primary: #1e3a5f;
          --primary-light: #2d5a8a;
          --accent: #3b82f6;
        }
      `}</style>

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50
        w-64 text-white
        transform transition-transform duration-300 ease-in-out
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
        bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950
      `}>
        <div className={`flex items-center justify-between p-4 border-b ${darkMode ? 'border-slate-800' : 'border-white/10'}`}>
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-blue-200">AVO SYSTEM</p>
            <h1 className="font-semibold text-lg mt-1">Logistics Control</h1>
            <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-white/60'}`}>Achraf Bolakhrif</p>
          </div>
          <button 
            onClick={() => setSidebarOpen(false)}
            className={`lg:hidden p-1 rounded ${darkMode ? 'hover:bg-slate-800' : 'hover:bg-white/10'}`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="p-4 space-y-1">
          {visibleAdminPages.map((item) => {
            const isActive = currentPageName === item.page;
            return (
              <Link
                key={item.page}
                to={createPageUrl(item.page)}
                onClick={() => setSidebarOpen(false)}
                className={`
                  flex items-center gap-3 px-4 py-3 rounded-lg transition-all
                  ${isActive 
                    ? darkMode ? 'bg-slate-800 text-white' : 'bg-white/20 text-white'
                    : darkMode ? 'text-slate-300 hover:bg-slate-800 hover:text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'}
                `}
              >
                <item.icon className="w-5 h-5" />
                <span className="font-medium">{item.name}</span>
              </Link>
            );
          })}
        </nav>

        {user && (
          <div className={`absolute bottom-0 left-0 right-0 p-4 border-t ${darkMode ? 'border-slate-800' : 'border-white/10'}`}>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${darkMode ? 'hover:bg-slate-800' : 'hover:bg-white/10'}`}>
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${darkMode ? 'bg-slate-800' : 'bg-white/20'}`}>
                    <User className="w-4 h-4" />
                  </div>
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium truncate">{user.full_name || 'Admin'}</p>
                    <p className={`text-xs truncate ${darkMode ? 'text-slate-400' : 'text-white/60'}`}>{user.email}</p>
                  </div>
                  <ChevronDown className={`w-4 h-4 ${darkMode ? 'text-slate-400' : 'text-white/60'}`} />
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
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Top Bar */}
        <header className={`border-b px-4 py-3 flex items-center justify-between lg:px-6 ${
          darkMode ? 'bg-slate-950/90 border-slate-800 backdrop-blur' : 'bg-white/90 border-slate-200 backdrop-blur'
        }`}>
          <button 
            onClick={() => setSidebarOpen(true)}
            className={`lg:hidden p-2 rounded-lg ${darkMode ? 'hover:bg-slate-800' : 'hover:bg-gray-100'}`}
          >
            <Menu className={`w-5 h-5 ${darkMode ? 'text-slate-200' : ''}`} />
          </button>
          
          <div className="flex-1 lg:flex-none" />
          
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setDarkMode(!darkMode)}
              className={darkMode ? 'text-slate-200 hover:bg-slate-800' : ''}
            >
              {darkMode ? (
                <>
                  <Sun className="w-4 h-4 mr-2" />
                  Hell
                </>
              ) : (
                <>
                  <Moon className="w-4 h-4 mr-2" />
                  Dunkel
                </>
              )}
            </Button>
            <span className={`text-sm hidden sm:block ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
              {new Date().toLocaleDateString('de-DE', { 
                weekday: 'long', 
                day: 'numeric', 
                month: 'long', 
                year: 'numeric' 
              })}
            </span>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950">
          <div className="min-h-full rounded-[28px] bg-gradient-to-br from-white via-slate-50 to-blue-50/70 p-5 lg:p-8 shadow-[0_30px_60px_-40px_rgba(15,23,42,0.8)]">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
