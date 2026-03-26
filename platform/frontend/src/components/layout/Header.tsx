import { Moon, Sun, Bell } from 'lucide-react';
import { useUIStore } from '@/stores/uiStore';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';

export function Header() {
  const { theme, setTheme } = useUIStore();
  const { user } = useAuthStore();
  const orgId = user?.organization_id ?? null;
  const { activeCalls, isConnected } = useRealtimeSync(orgId);

  return (
    <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/80 px-6 backdrop-blur-sm">
      <div />
      <div className="flex items-center gap-3">
        {/* Realtime status indicator */}
        {activeCalls > 0 ? (
          <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            <span className="text-xs font-medium text-emerald-500">
              {activeCalls} live call{activeCalls !== 1 ? 's' : ''}
            </span>
          </div>
        ) : isConnected ? (
          <span className="h-2 w-2 rounded-full bg-muted-foreground/40" title="Realtime connected" />
        ) : null}

        <Button variant="ghost" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
          {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-primary" />
        </Button>
        <Avatar className="h-8 w-8">
          <AvatarFallback className="text-xs bg-primary/20 text-primary">
            {user ? getInitials(user.full_name) : 'U'}
          </AvatarFallback>
        </Avatar>
      </div>
    </header>
  );
}
