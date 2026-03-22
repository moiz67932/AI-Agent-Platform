import { useState } from 'react';
import { Phone, Plus, Loader2, MoreHorizontal, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { usePhoneNumbers, useProvisionNumber, useReleaseNumber } from '@/hooks/usePhoneNumbers';
import { useAgents } from '@/hooks/useAgents';
import { api } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

const STATUS_COLORS = {
  active: 'success',
  unassigned: 'secondary',
  suspended: 'destructive',
} as const;

function toE164(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

function AddNumberDialog({ onClose }: { onClose: () => void }) {
  const [number, setNumber] = useState('');
  const [label, setLabel] = useState('');
  const provisionNumber = useProvisionNumber();

  const provision = async () => {
    const cleaned = number.trim();
    if (!cleaned) {
      toast({ title: 'Enter a phone number', variant: 'destructive' });
      return;
    }
    const e164 = toE164(cleaned);
    await provisionNumber.mutateAsync({ phone_number: e164, label: label.trim() || undefined });
    onClose();
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Twilio Number</DialogTitle>
          <DialogDescription>
            Enter a phone number from your Twilio account. Numbers must already be purchased in Twilio and configured to point to your LiveKit SIP trunk.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Phone Number</Label>
            <Input
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              placeholder="+1 (212) 555-0100"
              onKeyDown={(e) => e.key === 'Enter' && provision()}
            />
            <p className="text-xs text-muted-foreground">
              Enter in any format — we'll convert to E.164 (+12125550100)
            </p>
          </div>
          <div className="space-y-1.5">
            <Label>Label <span className="text-muted-foreground">(optional)</span></Label>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Main Line, After Hours, etc."
            />
          </div>
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1">
            <p className="font-medium text-foreground">Setup checklist</p>
            <p>1. Buy a number in your <a href="https://console.twilio.com" target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">Twilio console <ExternalLink className="h-3 w-3" /></a></p>
            <p>2. Configure it to use your LiveKit SIP trunk as the SIP endpoint</p>
            <p>3. Enter the number here to track it in VoiceAI</p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={provision} disabled={provisionNumber.isPending}>
            {provisionNumber.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Add Number
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssignAgentDialog({ numberId, currentAgentId, onClose }: { numberId: string; currentAgentId?: string; onClose: () => void }) {
  const { data: agents } = useAgents();
  const [selectedAgent, setSelectedAgent] = useState(currentAgentId || '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/api/numbers/${numberId}`, { agent_id: selectedAgent || null });
      toast({ title: 'Agent assigned' });
      onClose();
    } catch {
      toast({ title: 'Failed to assign agent', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Assign Agent</DialogTitle>
        </DialogHeader>
        <div className="py-2 space-y-1.5">
          <Label>Agent</Label>
          <Select value={selectedAgent} onValueChange={setSelectedAgent}>
            <SelectTrigger><SelectValue placeholder="Select an agent" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">Unassigned</SelectItem>
              {agents?.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function PhoneNumbers() {
  const { data: numbers, isLoading } = usePhoneNumbers();
  const { data: agents } = useAgents();
  const releaseNumber = useReleaseNumber();
  const [showAdd, setShowAdd] = useState(false);
  const [assignTarget, setAssignTarget] = useState<{ id: string; agentId?: string } | null>(null);

  const release = async (id: string) => {
    if (!confirm('Remove this number from VoiceAI? It will not be deleted from Twilio.')) return;
    await releaseNumber.mutateAsync(id);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Phone Numbers</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Twilio numbers connected to your LiveKit SIP trunk</p>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-2" />Add Number
        </Button>
      </div>

      {/* Info banner */}
      <div className="rounded-lg border border-border bg-muted/30 px-4 py-3 text-sm text-muted-foreground flex items-start gap-3">
        <Phone className="h-4 w-4 mt-0.5 shrink-0 text-primary" />
        <span>
          Phone numbers are purchased and managed in your{' '}
          <a href="https://console.twilio.com" target="_blank" rel="noreferrer" className="text-primary hover:underline inline-flex items-center gap-0.5">
            Twilio console <ExternalLink className="h-3 w-3" />
          </a>
          . Add them here to assign them to agents and track call activity.
        </span>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Number', 'Label', 'Agent', 'Status', 'Actions'].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    <td colSpan={5} className="px-4 py-3"><Skeleton className="h-8 w-full" /></td>
                  </tr>
                ))
              ) : !numbers?.length ? (
                <tr>
                  <td colSpan={5}>
                    <EmptyState
                      icon={Phone}
                      title="No phone numbers"
                      description="Add a Twilio number to start receiving AI-powered calls"
                      actionLabel="Add Number"
                      onAction={() => setShowAdd(true)}
                    />
                  </td>
                </tr>
              ) : (
                numbers.map((num) => {
                  const agent = agents?.find((a) => a.id === num.agent_id);
                  return (
                    <tr key={num.id} className="border-b border-border hover:bg-accent/50 transition-colors">
                      <td className="px-4 py-3 font-mono font-medium">{num.phone_number}</td>
                      <td className="px-4 py-3 text-muted-foreground">{num.label || '—'}</td>
                      <td className="px-4 py-3">{agent?.name || <span className="text-muted-foreground">Unassigned</span>}</td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_COLORS[num.status as keyof typeof STATUS_COLORS] || 'secondary'}>
                          {num.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-7 w-7">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => setAssignTarget({ id: num.id, agentId: num.agent_id })}>
                              Assign Agent
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => release(num.id)}
                            >
                              Remove Number
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {showAdd && <AddNumberDialog onClose={() => setShowAdd(false)} />}
      {assignTarget && (
        <AssignAgentDialog
          numberId={assignTarget.id}
          currentAgentId={assignTarget.agentId}
          onClose={() => setAssignTarget(null)}
        />
      )}
    </div>
  );
}
