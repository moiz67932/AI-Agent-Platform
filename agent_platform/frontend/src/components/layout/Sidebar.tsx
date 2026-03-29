import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Users, PhoneCall, Calendar,
  BarChart3, Globe, Settings, Sun, Moon, LogOut,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const navItems = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Overview' },
  { path: '/agents', icon: Users, label: 'Agents' },
  { path: '/calls', icon: PhoneCall, label: 'Calls' },
  { path: '/calendar', icon: Calendar, label: 'Appointments' },
  { path: '/analytics', icon: BarChart3, label: 'Analytics' },
  { path: '/numbers', icon: Globe, label: 'Numbers' },
  { path: '/settings', icon: Settings, label: 'Settings' },
];

export function Sidebar() {
  const location = useLocation();
  const { theme, toggleTheme } = useUIStore();
  const { signOut, user } = useAuthStore();

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + '/');

  const initials = user?.full_name
    ? user.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2)
    : 'U';

  return (
    <TooltipProvider delayDuration={0}>
      <aside className="fixed left-0 top-0 z-40 flex h-screen w-[60px] flex-col border-r border-dash-border bg-dash-surface">
        {/* Logo */}
        <div className="flex h-14 items-center justify-center">
          <div className="flex h-[38px] w-[38px] items-center justify-center rounded-[11px] bg-dash-blue">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"/>
              <polyline points="12 6 12 12 16 14"/>
            </svg>
          </div>
        </div>

        {/* Nav items */}
        <nav className="flex-1 flex flex-col items-center gap-1 px-2 py-3">
          {navItems.map((item) => {
            const active = isActive(item.path);
            return (
              <Tooltip key={item.path}>
                <TooltipTrigger asChild>
                  <Link
                    to={item.path}
                    className={cn(
                      'flex h-[38px] w-[38px] items-center justify-center rounded-[10px] transition-all duration-150',
                      active
                        ? 'bg-dash-blue-bg text-dash-blue'
                        : 'text-dash-t3 hover:bg-dash-blue-bg hover:text-dash-blue'
                    )}
                  >
                    <item.icon className="h-[18px] w-[18px]" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8} className="bg-dash-card border-dash-border text-dash-t1 text-xs font-medium">
                  {item.label}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        {/* Bottom */}
        <div className="flex flex-col items-center gap-2 px-2 py-3 border-t border-dash-border">
          {/* Theme toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={toggleTheme}
                className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px] text-dash-t3 hover:bg-dash-blue-bg hover:text-dash-blue transition-all duration-150"
                aria-label="Toggle theme"
              >
                {theme === 'light' ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8} className="bg-dash-card border-dash-border text-dash-t1 text-xs font-medium">
              {theme === 'light' ? 'Dark mode' : 'Light mode'}
            </TooltipContent>
          </Tooltip>

          {/* Sign out */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={signOut}
                className="flex h-[38px] w-[38px] items-center justify-center rounded-[10px] text-dash-t3 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-950 transition-all duration-150"
                aria-label="Sign out"
              >
                <LogOut className="h-[18px] w-[18px]" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8} className="bg-dash-card border-dash-border text-dash-t1 text-xs font-medium">
              Sign out
            </TooltipContent>
          </Tooltip>

          {/* User avatar */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex h-[38px] w-[38px] items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 text-[11px] font-bold text-white cursor-default">
                {initials}
              </div>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8} className="bg-dash-card border-dash-border text-dash-t1 text-xs font-medium">
              {user?.full_name || 'User'}
            </TooltipContent>
          </Tooltip>
        </div>
      </aside>
    </TooltipProvider>
  );
}
