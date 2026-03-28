import { useState } from 'react';
import { Users, Plus, MoreHorizontal, Loader2 } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { getInitials, cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { SettingsSidebar } from './Account';

const API = import.meta.env.VITE_API_URL || '';

async function apiFetch(path: string, init?: RequestInit) {
  const { data: { session } } = await import('@/lib/supabase').then(m => m.supabase.auth.getSession());
  const token = (session as { access_token?: string } | null)?.access_token;
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...init?.headers },
  });
  if (!res.ok) { const body = await res.json().catch(() => ({})); throw new Error(body.error || `Request failed: ${res.status}`); }
  return res.json();
}

interface TeamMember { id: string; email: string; role: string; joined_at: string | null; created_at: string; }

const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-dash-purple-bg border-dash-purple-b text-dash-purple',
  admin: 'bg-dash-blue-bg border-dash-blue-b text-dash-blue',
  member: 'bg-dash-green-bg border-dash-green-b text-dash-green',
  viewer: 'bg-dash-surface border-dash-border text-dash-t3',
};

export default function TeamSettings() {
  const { user } = useAuthStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('member');

  const { data: members = [], isLoading } = useQuery<TeamMember[]>({
    queryKey: ['team-members'],
    queryFn: () => apiFetch('/api/team').then(r => r.members ?? []),
  });

  const invite = useMutation({
    mutationFn: () => apiFetch('/api/team/invite', { method: 'POST', body: JSON.stringify({ email: inviteEmail, role: inviteRole }) }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['team-members'] }); setShowInvite(false); setInviteEmail(''); toast({ title: 'Invitation sent' }); },
    onError: (e: Error) => toast({ title: e.message, variant: 'destructive' }),
  });

  const removeMember = useMutation({
    mutationFn: (id: string) => apiFetch(`/api/team/${id}`, { method: 'DELETE' }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['team-members'] }); toast({ title: 'Member removed' }); },
    onError: (e: Error) => toast({ title: e.message, variant: 'destructive' }),
  });

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-extrabold text-dash-t1">Settings</h1>
      <div className="flex gap-6">
        <SettingsSidebar />
        <div className="flex-1 space-y-5 max-w-2xl">
          <div className="rounded-xl border border-dash-border bg-dash-card overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-dash-border">
              <div>
                <h3 className="text-sm font-bold text-dash-t1 flex items-center gap-2"><Users className="h-4 w-4" /> Team members</h3>
                <p className="text-xs text-dash-t3 mt-0.5">{members.length} member{members.length !== 1 ? 's' : ''}</p>
              </div>
              <button onClick={() => setShowInvite(true)} className="inline-flex items-center gap-1.5 bg-dash-blue text-white text-xs font-semibold px-3.5 py-1.5 rounded-lg hover:opacity-90 transition-opacity">
                <Plus className="h-3.5 w-3.5" /> Invite
              </button>
            </div>

            {isLoading ? (
              <div className="p-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-dash-t3" /></div>
            ) : members.length === 0 ? (
              <div className="p-8 text-center">
                <Users className="h-8 w-8 text-dash-t3 mx-auto mb-2" />
                <p className="text-sm text-dash-t2">No team members yet</p>
                <p className="text-xs text-dash-t3 mt-1">Invite your team to collaborate</p>
              </div>
            ) : (
              <div>
                {members.map(m => (
                  <div key={m.id} className="flex items-center justify-between px-6 py-3 border-b border-dash-border last:border-0 hover:bg-dash-surface transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-[10px] font-bold text-white">
                        {getInitials(m.email.split('@')[0])}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-dash-t1">{m.email}</p>
                        <p className="text-[10px] text-dash-t3">{m.joined_at ? 'Joined' : 'Pending'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={cn('text-[10px] font-semibold px-2 py-0.5 rounded-full border capitalize', ROLE_COLORS[m.role] || ROLE_COLORS.member)}>
                        {m.role}
                      </span>
                      {m.email !== user?.email && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <button className="p-1 rounded-md text-dash-t3 hover:bg-dash-surface transition-colors"><MoreHorizontal className="h-4 w-4" /></button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="bg-dash-card border-dash-border text-dash-t1">
                            <DropdownMenuItem onClick={() => removeMember.mutate(m.id)} className="text-red-500 focus:text-red-500">Remove</DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={showInvite} onOpenChange={setShowInvite}>
        <DialogContent className="bg-dash-card border-dash-border">
          <DialogHeader><DialogTitle className="text-dash-t1">Invite team member</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-dash-t2">Email</label>
              <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="colleague@company.com" className="w-full text-sm text-dash-t1 bg-dash-bg border border-dash-border rounded-lg px-3 py-2 outline-none focus:border-dash-blue transition-colors" />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-dash-t2">Role</label>
              <select value={inviteRole} onChange={e => setInviteRole(e.target.value)} className="w-full text-sm text-dash-t1 bg-dash-bg border border-dash-border rounded-lg px-3 py-2 outline-none">
                <option value="admin">Admin</option>
                <option value="member">Member</option>
                <option value="viewer">Viewer</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <button onClick={() => setShowInvite(false)} className="text-xs font-semibold px-4 py-2 rounded-lg border border-dash-border text-dash-t2">Cancel</button>
            <button onClick={() => invite.mutate()} disabled={!inviteEmail || invite.isPending} className="text-xs font-semibold px-4 py-2 rounded-lg bg-dash-blue text-white hover:opacity-90 transition-opacity disabled:opacity-50">
              {invite.isPending ? 'Sending...' : 'Send invite'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
