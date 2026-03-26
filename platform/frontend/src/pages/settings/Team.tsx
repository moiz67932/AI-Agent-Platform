import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Users, Plus, MoreHorizontal, Mail, RefreshCw, Loader2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { getInitials } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';

const API = import.meta.env.VITE_API_URL || '';

async function apiFetch(path: string, init?: RequestInit) {
  const { data: { session } } = await import('@/lib/supabase').then(m => m.supabase.auth.getSession());
  const token = (session as { access_token?: string } | null)?.access_token;
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

interface TeamMember {
  id: string;
  email: string;
  role: string;
  joined_at: string | null;
  created_at: string;
}

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
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isOwner = user?.role === 'owner';

  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');

  // Role change state
  const [changingRole, setChangingRole] = useState<{ id: string; role: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['team'],
    queryFn: () => apiFetch('/api/team').then(r => r.data as TeamMember[]),
  });

  const members = (data || []).filter(m => m.joined_at !== null);
  const pending = (data || []).filter(m => m.joined_at === null);

  const inviteMutation = useMutation({
    mutationFn: ({ email, role }: { email: string; role: string }) =>
      apiFetch('/api/team/invite', { method: 'POST', body: JSON.stringify({ email, role }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team'] });
      setShowInvite(false);
      setInviteEmail('');
      setInviteRole('member');
      toast({ title: 'Invite sent', description: `An invitation has been sent to ${inviteEmail}.` });
    },
    onError: (err: Error) => toast({ title: 'Invite failed', description: err.message, variant: 'destructive' }),
  });

  const resendMutation = useMutation({
    mutationFn: (memberId: string) =>
      apiFetch(`/api/team/resend-invite/${memberId}`, { method: 'POST' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team'] });
      toast({ title: 'Invite resent' });
    },
    onError: (err: Error) => toast({ title: 'Resend failed', description: err.message, variant: 'destructive' }),
  });

  const removeMutation = useMutation({
    mutationFn: (memberId: string) =>
      apiFetch(`/api/team/${memberId}`, { method: 'DELETE' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team'] });
      toast({ title: 'Member removed' });
    },
    onError: (err: Error) => toast({ title: 'Remove failed', description: err.message, variant: 'destructive' }),
  });

  const changeRoleMutation = useMutation({
    mutationFn: ({ id, role }: { id: string; role: string }) =>
      apiFetch(`/api/team/${id}/role`, { method: 'PATCH', body: JSON.stringify({ role }) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['team'] });
      setChangingRole(null);
      toast({ title: 'Role updated' });
    },
    onError: (err: Error) => toast({ title: 'Role change failed', description: err.message, variant: 'destructive' }),
  });

  const handleRemove = (member: TeamMember) => {
    if (!window.confirm(`Remove ${member.email} from the team?`)) return;
    removeMutation.mutate(member.id);
  };

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
              {isOwner && (
                <Button size="sm" onClick={() => setShowInvite(true)}>
                  <Plus className="h-4 w-4 mr-2" />Invite Member
                </Button>
              )}
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                  <Loader2 className="h-4 w-4 animate-spin" />Loading team...
                </div>
              ) : (
                <div className="space-y-3">
                  {members.map((member) => (
                    <div key={member.id} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className="text-xs">{getInitials(member.email)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="text-sm font-medium">{member.email}</div>
                          {member.joined_at && (
                            <div className="text-xs text-muted-foreground">
                              Joined {new Date(member.joined_at).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={ROLE_COLORS[member.role] || 'outline'} className="capitalize">{member.role}</Badge>
                        {isOwner && member.role !== 'owner' && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-7 w-7">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setChangingRole({ id: member.id, role: member.role })}>
                                Change Role
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                className="text-destructive"
                                onClick={() => handleRemove(member)}
                              >
                                Remove
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                    </div>
                  ))}
                  {members.length === 0 && !isLoading && (
                    <p className="text-sm text-muted-foreground py-2">No team members yet.</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Pending Invites */}
          {pending.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Mail className="h-4 w-4" />Pending Invites</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {pending.map((invite) => (
                  <div key={invite.id} className="flex items-center justify-between">
                    <div>
                      <div className="text-sm">{invite.email}</div>
                      <div className="text-xs text-muted-foreground capitalize">
                        {invite.role} • Invited {new Date(invite.created_at).toLocaleDateString()}
                      </div>
                    </div>
                    {isOwner && (
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => resendMutation.mutate(invite.id)}
                          disabled={resendMutation.isPending}
                        >
                          <RefreshCw className="h-3 w-3 mr-1" />Resend
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-destructive"
                          onClick={() => handleRemove(invite)}
                        >
                          Cancel
                        </Button>
                      </div>
                    )}
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

      {/* Invite Dialog */}
      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent>
          <DialogHeader><DialogTitle>Invite Team Member</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Email Address</Label>
              <Input
                type="email"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
                placeholder="colleague@company.com"
              />
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
            <Button
              onClick={() => inviteMutation.mutate({ email: inviteEmail, role: inviteRole })}
              disabled={!inviteEmail || inviteMutation.isPending}
            >
              {inviteMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Send Invite
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Change Role Dialog */}
      <Dialog open={!!changingRole} onOpenChange={() => setChangingRole(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Change Role</DialogTitle></DialogHeader>
          {changingRole && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>New Role</Label>
                <Select
                  value={changingRole.role}
                  onValueChange={(r) => setChangingRole({ ...changingRole, role: r })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="member">Member</SelectItem>
                    <SelectItem value="viewer">Viewer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setChangingRole(null)}>Cancel</Button>
            <Button
              onClick={() => changingRole && changeRoleMutation.mutate(changingRole)}
              disabled={changeRoleMutation.isPending}
            >
              {changeRoleMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
