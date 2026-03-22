import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Plus, Bot, MoreHorizontal, Phone, Pause, Play, Trash2, Settings, PhoneCall } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { useAgents, useDeleteAgent, useToggleAgentStatus } from '@/hooks/useAgents';
import { relativeTime } from '@/lib/utils';
import { INDUSTRY_COLORS, INDUSTRY_LABELS } from '@/types';
import type { Agent } from '@/types';

const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.25 } } };

function AgentCard({ agent }: { agent: Agent }) {
  const navigate = useNavigate();
  const deleteAgent = useDeleteAgent();
  const toggleStatus = useToggleAgentStatus();
  const [confirmDelete, setConfirmDelete] = useState(false);

  const color = INDUSTRY_COLORS[agent.clinic?.industry || 'generic'];
  const industryLabel = INDUSTRY_LABELS[agent.clinic?.industry || 'generic'];

  const handleToggle = () => {
    toggleStatus.mutate({
      id: agent.id,
      status: agent.status === 'live' ? 'paused' : 'live',
    });
  };

  return (
    <>
      <motion.div variants={item}>
        <Card
          className="cursor-pointer transition-all duration-200 hover:shadow-md hover:border-primary/30"
          style={{ '--glow-color': `${color}14` } as React.CSSProperties}
          onClick={() => navigate(`/agents/${agent.id}`)}
        >
          <CardContent className="p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                  style={{ backgroundColor: `${color}20`, color }}
                >
                  <Bot className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-semibold">{agent.name}</div>
                  <div className="text-xs text-muted-foreground">{agent.clinic?.name || 'No clinic'}</div>
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <Button variant="ghost" size="icon" className="h-7 w-7">
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/agents/${agent.id}/edit`); }}>
                    <Settings className="h-4 w-4 mr-2" />Edit
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); handleToggle(); }}>
                    {agent.status === 'live'
                      ? <><Pause className="h-4 w-4 mr-2" />Pause</>
                      : <><Play className="h-4 w-4 mr-2" />Activate</>
                    }
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/calls?agent=${agent.id}`); }}>
                    <PhoneCall className="h-4 w-4 mr-2" />View Calls
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive"
                    onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}
                  >
                    <Trash2 className="h-4 w-4 mr-2" />Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            <div className="mt-4 flex items-center gap-2">
              <StatusBadge status={agent.status} />
              <Badge variant="outline" className="text-xs" style={{ color, borderColor: `${color}40` }}>
                {industryLabel}
              </Badge>
            </div>

            {agent.phone_number && (
              <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                <Phone className="h-3 w-3" />
                <span className="font-mono">{agent.phone_number.phone_number}</span>
              </div>
            )}

            <div className="mt-3 grid grid-cols-2 gap-2 border-t border-border pt-3">
              <div>
                <div className="text-lg font-bold font-mono">—</div>
                <div className="text-xs text-muted-foreground">calls today</div>
              </div>
              <div>
                <div className="text-lg font-bold font-mono">—</div>
                <div className="text-xs text-muted-foreground">booking rate</div>
              </div>
            </div>

            <div className="mt-2 text-xs text-muted-foreground">
              Last active: {relativeTime(agent.updated_at)}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Agent</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "{agent.name}"? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => { deleteAgent.mutate(agent.id); setConfirmDelete(false); }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function AgentsList() {
  const { data: agents, isLoading } = useAgents();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Your Agents</h1>
        <Button asChild><Link to="/onboarding"><Plus className="h-4 w-4 mr-2" />New Agent</Link></Button>
      </div>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5"><Skeleton className="h-40 w-full" /></CardContent></Card>
          ))}
        </div>
      ) : !agents?.length ? (
        <EmptyState
          icon={Bot}
          title="No agents yet"
          description="Create your first AI receptionist agent to start taking calls"
          actionLabel="Create Agent"
          onAction={() => window.location.href = '/onboarding'}
        />
      ) : (
        <motion.div
          variants={container}
          initial="hidden"
          animate="show"
          className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        >
          {agents.map((agent) => <AgentCard key={agent.id} agent={agent} />)}
        </motion.div>
      )}
    </div>
  );
}
