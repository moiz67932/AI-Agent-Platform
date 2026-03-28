import { Outlet, Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, PhoneCall, Calendar, BarChart3, Settings,
} from 'lucide-react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { cn } from '@/lib/utils';

const mobileTabItems = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Home' },
  { path: '/agents', icon: Users, label: 'Agents' },
  { path: '/calls', icon: PhoneCall, label: 'Calls' },
  { path: '/calendar', icon: Calendar, label: 'Calendar' },
  { path: '/analytics', icon: BarChart3, label: 'Analytics' },
];

export function PageLayout() {
  const location = useLocation();
  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + '/');

  return (
    <div className="flex min-h-screen bg-dash-bg">
      {/* Desktop sidebar — 60px fixed */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      <div className="flex flex-1 flex-col lg:ml-[60px] pb-16 lg:pb-0">
        <Header />
        <main className="flex-1 p-4 lg:p-6">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <div className="fixed bottom-0 left-0 right-0 z-40 lg:hidden border-t border-dash-border bg-dash-surface/95 backdrop-blur-xl">
        <nav className="flex items-center justify-around px-2 py-1.5">
          {mobileTabItems.map((item) => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'flex flex-col items-center gap-0.5 px-2 py-1.5 rounded-lg transition-colors min-w-[44px]',
                  active ? 'text-dash-blue' : 'text-dash-t3'
                )}
              >
                <item.icon className="h-5 w-5" />
                <span className="text-[9px] font-medium">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
