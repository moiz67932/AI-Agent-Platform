import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Plus, MoreHorizontal, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getInitials } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';

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
        <Link key={l.to} to={l.to} className="block rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

const ROLE_COLORS: Record<string, 'default' | 'secondary' | 'outline'> = {
  owner: 'default',
  admin: 'secondary',
  member: 'outline',
  viewer: 'outline',
};

export default function TeamSettings() {
  const { user } = useAuthStore();
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');

  const mockMembers = [
    { id: '1', full_name: user?.full_name || 'You', email: user?.email || '', role: 'owner', joined_at: new Date().toISOString() },
  ];

  const pendingInvites = [
    { id: 'inv1', email: 'colleague@example.com', role: 'admin', sent_at: new Date(Date.now() - 86400000).toISOString() },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <div className="flex gap-8">
        <SettingsSidebar />
        <div className="flex-1 space-y-6 max-w-2xl">
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <div className="flex items-center gap-2">
                <Users className="h-4 w-4" />
                <CardTitle className="text-base">Team Members</CardTitle>
              </div>
              <Button size="sm" onClick={() => setShowInvite(true)}>
                <Plus className="h-4 w-4 mr-2" />Invite Member
              </Button>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {mockMembers.map((member) => (
                  <div key={member.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarFallback className="text-xs">{getInitials(member.full_name)}</AvatarFallback>
                      </Avatar>
                      <div>
                        <div className="text-sm font-medium">{member.full_name}</div>
                        <div className="text-xs text-muted-foreground">{member.email}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={ROLE_COLORS[member.role] || 'outline'} className="capitalize">{member.role}</Badge>
                      {member.role !== 'owner' && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem>Change Role</DropdownMenuItem>
                            <DropdownMenuItem className="text-destructive">Remove</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Pending Invites */}
          {pendingInvites.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Mail className="h-4 w-4" />Pending Invites</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {pendingInvites.map((invite) => (
                  <div key={invite.id} className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">{invite.email}</div>
                      <div className="text-xs text-muted-foreground capitalize">{invite.role} • Sent yesterday</div>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="ghost" size="sm">Resend</Button>
                      <Button variant="ghost" size="sm" className="text-destructive">Cancel</Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Role Descriptions */}
          <Card>
            <CardHeader><CardTitle className="text-base">Role Permissions</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              {[
                { role: 'Owner', desc: 'Full access — billing, settings, delete account' },
                { role: 'Admin', desc: 'Manage agents, calls, knowledge — no billing' },
                { role: 'Member', desc: 'View and edit agents, calls, calendar' },
                { role: 'Viewer', desc: 'View-only access to all data' },
              ].map(({ role, desc }) => (
                <div key={role} className="flex items-start gap-3">
                  <Badge variant="outline" className="shrink-0 w-14 justify-center capitalize">{role}</Badge>
                  <span className="text-muted-foreground">{desc}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent>
          <DialogHeader><DialogTitle>Invite Team Member</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Email Address</Label>
              <Input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="colleague@company.com" />
            </div>
            <div className="space-y-1.5">
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="member">Member</SelectItem>
                  <SelectItem value="viewer">Viewer</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowInvite(false)}>Cancel</Button>
            <Button onClick={() => { setShowInvite(false); setInviteEmail(''); }}>Send Invite</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
