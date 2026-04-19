import React from 'react';
import { User } from '../types';
import { 
  LayoutDashboard, 
  Hospital as HospitalIcon, 
  Users, 
  ClipboardList,
  ClipboardCheck, 
  Settings,
  LogOut,
  Menu,
  X
} from 'lucide-react';
import { cn } from '../lib/utils';

interface LayoutProps {
  user: User;
  onLogout: () => void;
  activeTab: string;
  setActiveTab: (tab: any) => void;
  children: React.ReactNode;
}

export function Layout({ user, onLogout, activeTab, setActiveTab, children }: LayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = React.useState(false);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'hospitals', label: 'Hospitals', icon: HospitalIcon },
    { id: 'logs', label: 'Activity Logs', icon: ClipboardList },
    ...(user.role === 'admin' ? [
      { id: 'verification', label: 'Verification', icon: ClipboardCheck },
      { id: 'team', label: 'Team', icon: Users },
      { id: 'settings', label: 'Settings', icon: Settings }
    ] : []),
  ];

  return (
    <div className="min-h-screen bg-stone-50 flex">
      {/* Mobile Sidebar Toggle */}
      <button 
        className="lg:hidden fixed top-4 right-4 z-50 p-2 bg-white rounded-lg shadow-sm"
        onClick={() => setIsSidebarOpen(!isSidebarOpen)}
      >
        {isSidebarOpen ? <X /> : <Menu />}
      </button>

      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-40 w-64 bg-white border-r border-stone-200 transform transition-transform duration-200 ease-in-out lg:translate-x-0 lg:static lg:inset-0",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="h-full flex flex-col p-6">
          <div className="mb-10">
            <h1 className="text-xl font-serif font-bold text-stone-900 leading-tight">
              NABH Tracking
            </h1>
            <p className="text-xs text-stone-400 uppercase tracking-widest mt-1">
              Retention System
            </p>
          </div>

          <nav className="flex-1 space-y-1">
            {navItems.map((item) => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setIsSidebarOpen(false);
                }}
                className={cn(
                  "w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all",
                  activeTab === item.id 
                    ? "bg-stone-900 text-white shadow-lg shadow-stone-200" 
                    : "text-stone-500 hover:bg-stone-100 hover:text-stone-900"
                )}
              >
                <item.icon className="w-5 h-5" />
                {item.label}
              </button>
            ))}
          </nav>

          <div className="mt-auto pt-6 border-t border-stone-100">
            <div className="flex items-center gap-3 px-4 mb-6">
              <div className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center text-stone-600 font-bold">
                {user.name[0]}
              </div>
              <div className="overflow-hidden">
                <p className="text-sm font-semibold text-stone-900 truncate">{user.name}</p>
                <p className="text-xs text-stone-400 capitalize">{user.role}</p>
              </div>
            </div>
            <button
              onClick={onLogout}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-red-500 hover:bg-red-50 transition-colors"
            >
              <LogOut className="w-5 h-5" />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 lg:p-10 overflow-auto">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}
