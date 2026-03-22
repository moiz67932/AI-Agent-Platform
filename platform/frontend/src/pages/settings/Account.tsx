import { useState } from 'react';
import { Link } from 'react-router-dom';
import { User, Lock, Bell, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { useAuthStore } from '@/stores/authStore';
import { auth } from '@/lib/supabase';
import { toast } from '@/hooks/use-toast';

function SettingsSidebar() {
  const links = [
    { to: '/settings', label: 'Account' },
    { to: '/settings/team', label: 'Team' },
    { to: '/settings/billing', label: 'Billing' },
    { to: '/settings/api', label: 'API Keys' },
  ];
  return (
    <nav className="w-44 shrink-0 space-y-1">
      {links.map((l) => (
        <Link
          key={l.to}
          to={l.to}
          className="block rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

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
    daily_summary: false,
    sms_alerts: false,
  });

  const saveProfile = async () => {
    setSaving(true);
    try {
      await auth.updateUser({ data: { full_name: name } });
      toast({ title: 'Profile updated' });
    } catch {
      toast({ title: 'Failed to update profile', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const changePassword = async () => {
    if (!newPw || newPw.length < 8) {
      toast({ title: 'Password must be at least 8 characters', variant: 'destructive' });
      return;
    }
    try {
      await auth.updateUser({ password: newPw });
      toast({ title: 'Password updated' });
      setCurrentPw(''); setNewPw('');
    } catch {
      toast({ title: 'Failed to update password', variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <div className="flex gap-8">
        <SettingsSidebar />
        <div className="flex-1 space-y-6 max-w-2xl">
          {/* Profile */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><User className="h-4 w-4" />Profile</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Full Name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input value={user?.email || ''} disabled />
              </div>
              <Button onClick={saveProfile} disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</Button>
            </CardContent>
          </Card>

          {/* Password */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Lock className="h-4 w-4" />Password</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label>Current Password</Label>
                <Input type="password" value={currentPw} onChange={(e) => setCurrentPw(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>New Password</Label>
                <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
              </div>
              <Button variant="outline" onClick={changePassword}>Change Password</Button>
            </CardContent>
          </Card>

          {/* Notifications */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Bell className="h-4 w-4" />Notifications</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {[
                { key: 'booking_email', label: 'Email on new booking', desc: 'Receive an email when a booking is created' },
                { key: 'missed_call_email', label: 'Email on missed call', desc: 'Receive an email for missed calls' },
                { key: 'daily_summary', label: 'Daily summary email', desc: 'A daily digest of your call activity' },
                { key: 'sms_alerts', label: 'SMS alerts', desc: 'Text notifications for urgent events' },
              ].map(({ key, label, desc }) => (
                <div key={key} className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium">{label}</div>
                    <div className="text-xs text-muted-foreground">{desc}</div>
                  </div>
                  <Switch
                    checked={notifications[key as keyof typeof notifications]}
                    onCheckedChange={(v) => setNotifications(n => ({ ...n, [key]: v }))}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Danger Zone */}
          <Card className="border-destructive/50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-destructive">
                <AlertTriangle className="h-4 w-4" />Danger Zone
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium">Delete Account</div>
                  <div className="text-xs text-muted-foreground">Permanently delete your account and all data</div>
                </div>
                <Button variant="destructive" size="sm" onClick={() => setShowDelete(true)}>Delete Account</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={showDelete} onOpenChange={setShowDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Account</DialogTitle>
            <DialogDescription>
              This will permanently delete your account, all agents, call history, and data. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDelete(false)}>Cancel</Button>
            <Button variant="destructive" onClick={signOut}>Delete Account</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
