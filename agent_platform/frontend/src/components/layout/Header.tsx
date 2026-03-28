import { Link, useLocation } from 'react-router-dom';
import { Bell, Calendar, Plus, Search } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { getInitials } from '@/lib/utils';

const PAGE_TITLES: Record<string, string> = {
  '/dashboard': 'Overview',
  '/agents': 'Agents',
  '/calls': 'Calls',
  '/calendar': 'Appointments',
  '/analytics': 'Analytics',
  '/numbers': 'Numbers',
  '/settings': 'Settings',
  '/integrations': 'Integrations',
};

export function Header() {
  const { user } = useAuthStore();
  const location = useLocation();

  const title = Object.entries(PAGE_TITLES).find(
    ([path]) => location.pathname === path || location.pathname.startsWith(path + '/')
  )?.[1] || 'Overview';

  return (
    <header className="sticky top-0 z-30 flex h-[52px] items-center justify-between border-b border-dash-border bg-dash-surface px-5">
      {/* Left: title + search */}
      <div className="flex items-center gap-4">
        <h1 className="text-sm font-bold text-dash-t1">{title}</h1>
        <div className="hidden sm:flex items-center gap-2 bg-dash-bg rounded-lg px-3 py-1.5 w-[180px]">
          <Search className="h-3.5 w-3.5 text-dash-t3" />
          <span className="text-xs text-dash-t3">Search calls, agents...</span>
        </div>
      </div>

      {/* Right */}
      <div className="flex items-center gap-2">
        <button className="flex h-8 w-8 items-center justify-center rounded-lg text-dash-t3 hover:bg-dash-bg transition-colors" aria-label="Calendar">
          <Calendar className="h-4 w-4" />
        </button>
        <button className="relative flex h-8 w-8 items-center justify-center rounded-lg text-dash-t3 hover:bg-dash-bg transition-colors" aria-label="Notifications">
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-dash-pink" />
        </button>
        <div className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 text-[10px] font-bold text-white">
          {user ? getInitials(user.full_name) : 'U'}
        </div>
        <Link
          to="/onboarding"
          className="ml-1 inline-flex items-center gap-1.5 bg-dash-blue text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg hover:opacity-90 transition-opacity"
        >
          <Plus className="h-3.5 w-3.5" />
          New agent
        </Link>
      </div>
    </header>
  );
}
