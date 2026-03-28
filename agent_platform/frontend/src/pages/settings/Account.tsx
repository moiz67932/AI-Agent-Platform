import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { User, Lock, Bell, AlertTriangle } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useAuthStore } from '@/stores/authStore';
import { auth } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

function SettingsSidebar() {
  const location = useLocation();
  const links = [
    { to: '/settings', label: 'Profile' },
    { to: '/settings/billing', label: 'Billing' },
    { to: '/settings/team', label: 'Team' },
    { to: '/settings/api', label: 'API Keys' },
  ];
  return (
    <nav className="w-[140px] shrink-0 space-y-0.5">
      {links.map(l => (
        <Link
          key={l.to}
          to={l.to}
          className={cn(
            'block rounded-lg px-3 py-2 text-sm font-medium transition-colors',
            location.pathname === l.to ? 'bg-dash-blue-bg text-dash-blue' : 'text-dash-t2 hover:bg-dash-surface hover:text-dash-t1'
          )}
        >{l.label}</Link>
      ))}
    </nav>
  );
}

export { SettingsSidebar };

export default function AccountSettings() {
  const { user, signOut } = useAuthStore();
  const [saving, setSaving] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [name, setName] = useState(user?.full_name || '');
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [notifications, setNotifications] = useState({
    booking_email: true,
    missed_call_email: true,
    agent_offline: true,
    weekly_summary: false,
    monthly_report: false,
  });

  const saveProfile = async () => {
    setSaving(true);
    try {
      await auth.updateUser({ data: { full_name: name } });
      toast({ title: 'Profile updated' });
    } catch {
      toast({ title: 'Failed to update profile', variant: 'destructive' });
    } finally { setSaving(false); }
  };

  const changePassword = async () => {
    if (!newPw || newPw.length < 8) { toast({ title: 'Password must be at least 8 characters', variant: 'destructive' }); return; }
    try {
      await auth.updateUser({ password: newPw });
      toast({ title: 'Password updated' });
      setCurrentPw(''); setNewPw('');
    } catch { toast({ title: 'Failed to update password', variant: 'destructive' }); }
  };

  const initials = user?.full_name ? user.full_name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2) : 'U';

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-extrabold text-dash-t1">Settings</h1>
      <div className="flex gap-6">
        <SettingsSidebar />
        <div className="flex-1 space-y-5 max-w-2xl">
          {/* Profile */}
          <div className="rounded-xl border border-dash-border bg-dash-card p-6">
            <div className="flex items-center gap-4 mb-5">
              <div className="w-[72px] h-[72px] rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-lg font-bold text-white">
                {initials}
              </div>
              <div>
                <h3 className="text-sm font-bold text-dash-t1">{user?.full_name || 'User'}</h3>
                <p className="text-xs text-dash-t2">{user?.email}</p>
                <span className="inline-flex items-center mt-1 text-[10px] font-semibold text-dash-blue bg-dash-blue-bg border border-dash-blue-b px-2 py-0.5 rounded-full">Pro</span>
              </div>
            </div>
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-dash-t2">Full Name</label>
                <input value={name} onChange={e => setName(e.target.value)} className="w-full text-sm text-dash-t1 bg-dash-bg border border-dash-border rounded-lg px-3 py-2 outline-none focus:border-dash-blue transition-colors" />
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-dash-t2">Email</label>
                <input value={user?.email || ''} disabled className="w-full text-sm text-dash-t3 bg-dash-surface border border-dash-border rounded-lg px-3 py-2" />
              </div>
              <button onClick={saveProfile} disabled={saving} className="text-xs font-semibold px-4 py-2 rounded-lg bg-dash-blue text-white hover:opacity-90 transition-opacity disabled:opacity-50">
                {saving ? 'Saving...' : 'Save changes'}
              </button>
            </div>
          </div>

          {/* Notifications */}
          <div className="rounded-xl border border-dash-border bg-dash-card p-6">
            <h3 className="text-sm font-bold text-dash-t1 flex items-center gap-2 mb-4"><Bell className="h-4 w-4" /> Notifications</h3>
            <div className="space-y-4">
              {[
                { key: 'booking_email', label: 'New appointment booked', desc: 'Email when a booking is created' },
                { key: 'missed_call_email', label: 'Missed call alert', desc: 'Email for missed calls' },
                { key: 'agent_offline', label: 'Agent goes offline', desc: 'Alert when an agent stops responding' },
                { key: 'weekly_summary', label: 'Weekly summary email', desc: 'Digest of call activity each week' },
                { key: 'monthly_report', label: 'Monthly report', desc: 'Detailed monthly performance report' },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-dash-t1">{label}</p>
                    <p className="text-xs text-dash-t3">{desc}</p>
                  </div>
                  <Switch
                    checked={notifications[key as keyof typeof notifications]}
                    onCheckedChange={v => setNotifications(n => ({ ...n, [key]: v }))}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Danger Zone */}
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:bg-red-950/20 dark:border-red-900/30">
            <h3 className="text-sm font-bold text-red-600 flex items-center gap-2 mb-2"><AlertTriangle className="h-4 w-4" /> Danger zone</h3>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-red-600 font-medium">Delete account</p>
                <p className="text-xs text-red-400">Permanently delete your account and all data</p>
              </div>
              <button onClick={() => setShowDelete(true)} className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-red-300 text-red-600 hover:bg-red-100 transition-colors">
                Delete account
              </button>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent className="bg-dash-card border-dash-border">
          <DialogHeader>
            <DialogTitle className="text-dash-t1">Delete Account</DialogTitle>
            <DialogDescription className="text-dash-t2">This will permanently delete your account, all agents, call history, and data. This action cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button onClick={() => setShowDelete(false)} className="text-xs font-semibold px-4 py-2 rounded-lg border border-dash-border text-dash-t2">Cancel</button>
            <button onClick={signOut} className="text-xs font-semibold px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors">Delete Account</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
