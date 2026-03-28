import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, MoreHorizontal, Pause, Play, Trash2, Settings,
  PhoneCall, ChevronRight, ChevronDown,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
  DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { useAgents, useDeleteAgent, useToggleAgentStatus } from '@/hooks/useAgents';
import { relativeTime, cn } from '@/lib/utils';
import { INDUSTRY_LABELS } from '@/types';
import type { Agent } from '@/types';

const container = { hidden: {}, show: { transition: { staggerChildren: 0.04 } } };
const item = { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.25, ease: [0.16, 1, 0.3, 1] } } };

function AgentRow({ agent }: { agent: Agent }) {
  const navigate = useNavigate();
  const deleteAgent = useDeleteAgent();
  const toggleStatus = useToggleAgentStatus();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const isLive = agent.status === 'live';
  const industryLabel = INDUSTRY_LABELS[agent.clinic?.industry || 'generic'];

  const handleToggle = (e: React.MouseEvent) => {
    e.stopPropagation();
    toggleStatus.mutate({ id: agent.id, status: isLive ? 'paused' : 'live' });
  };

  return (
    <>
      <motion.div variants={item}>
        <div
          className="foyer-row-hover relative border-b border-dash-border hover:bg-dash-surface transition-colors cursor-pointer"
          onClick={() => setExpanded(!expanded)}
        >
          <div className="grid grid-cols-[1fr_80px_140px_80px_70px_60px] gap-2 items-center px-5 py-3">
            {/* Agent name */}
            <div className="flex items-center gap-3 min-w-0">
              <span className={cn(
                'relative flex h-2.5 w-2.5 rounded-full shrink-0',
                isLive ? 'bg-dash-gdot' : 'bg-dash-t3'
              )}>
                {isLive && <span className="absolute inline-flex h-full w-full rounded-full bg-dash-gdot opacity-50 animate-ping" />}
              </span>
              <div className="min-w-0">
                <span className="text-sm font-semibold text-dash-t1 truncate block">{agent.name}</span>
                <span className="text-[10px] text-dash-t3">{agent.clinic?.name || 'No clinic'}</span>
              </div>
            </div>

            {/* Status */}
            <span className={cn(
              'inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border w-fit',
              isLive ? 'bg-dash-green-bg border-dash-green-b text-dash-green' : 'bg-dash-surface border-dash-border text-dash-t3'
            )}>
              {isLive && <span className="w-1.5 h-1.5 rounded-full bg-dash-gdot" />}
              {isLive ? 'Live' : 'Inactive'}
            </span>

            {/* Phone */}
            <span className="text-xs font-mono text-dash-t2 hidden sm:block">
              {agent.phone_number?.phone_number || '\u2014'}
            </span>

            {/* Port */}
            <span className="text-xs font-mono text-dash-t3 hidden md:block">{'\u2014'}</span>

            {/* Calls */}
            <span className="text-sm font-bold text-dash-t1 text-right hidden md:block">{'\u2014'}</span>

            {/* Actions */}
            <div className="flex items-center gap-1 justify-end">
              <DropdownMenu>
                <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                  <button className="p-1.5 rounded-md text-dash-t3 hover:bg-dash-surface hover:text-dash-t2 transition-colors">
                    <MoreHorizontal className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="bg-dash-card border-dash-border text-dash-t1">
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/agents/${agent.id}`); }}>
                    <Settings className="h-4 w-4 mr-2" />Settings
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleToggle}>
                    {isLive ? <><Pause className="h-4 w-4 mr-2" />Pause</> : <><Play className="h-4 w-4 mr-2" />Activate</>}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={(e) => { e.stopPropagation(); navigate(`/calls?agent=${agent.id}`); }}>
                    <PhoneCall className="h-4 w-4 mr-2" />View Calls
                  </DropdownMenuItem>
                  <DropdownMenuSeparator className="bg-dash-border" />
                  <DropdownMenuItem className="text-red-500 focus:text-red-500" onClick={(e) => { e.stopPropagation(); setConfirmDelete(true); }}>
                    <Trash2 className="h-4 w-4 mr-2" />Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              {expanded ? <ChevronDown className="h-4 w-4 text-dash-t3" /> : <ChevronRight className="h-4 w-4 text-dash-t3" />}
            </div>
          </div>

          {/* Expanded panel */}
          <AnimatePresence>
            {expanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="border-t border-dash-border bg-dash-bg px-5 py-4 overflow-hidden"
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div>
                    <span className="text-label uppercase text-dash-t3 tracking-widest">Status</span>
                    <p className={cn('mt-1 text-xs font-semibold', isLive ? 'text-dash-green' : 'text-dash-t3')}>
                      {isLive ? 'Live & Active' : 'Paused'}
                    </p>
                  </div>
                  <div>
                    <span className="text-label uppercase text-dash-t3 tracking-widest">Last Active</span>
                    <p className="mt-1 text-xs text-dash-t2">{relativeTime(agent.updated_at)}</p>
                  </div>
                  <div>
                    <span className="text-label uppercase text-dash-t3 tracking-widest">Live Logs</span>
                    <div className="mt-1 rounded-lg bg-dash-t1 p-2 font-mono text-[10px] text-green-400 h-16 overflow-hidden">
                      <div>[{new Date().toLocaleTimeString()}] Agent ready</div>
                      <div className="text-green-400/60">[{new Date().toLocaleTimeString()}] Listening on port...</div>
                      <span className="foyer-terminal-cursor text-transparent">_</span>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={handleToggle} className={cn(
                    'text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors',
                    isLive ? 'bg-red-50 text-red-600 border-red-200 hover:bg-red-100' : 'bg-dash-green-bg text-dash-green border-dash-green-b hover:bg-dash-green-bg/80'
                  )}>
                    {isLive ? 'Pause Agent' : 'Activate Agent'}
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); navigate(`/agents/${agent.id}`); }}
                    className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-dash-card border border-dash-border text-dash-t2 hover:text-dash-t1 transition-colors"
                  >
                    Settings
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="bg-dash-card border-dash-border text-dash-t1">
          <DialogHeader>
            <DialogTitle>Delete Agent</DialogTitle>
            <DialogDescription className="text-dash-t2">
              Are you sure you want to delete "{agent.name}"? This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button onClick={() => setConfirmDelete(false)} className="text-sm px-4 py-2 rounded-lg border border-dash-border text-dash-t2 hover:text-dash-t1 transition-colors">Cancel</button>
            <button onClick={() => { deleteAgent.mutate(agent.id); setConfirmDelete(false); }} className="text-sm px-4 py-2 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors">Delete</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function AgentsList() {
  const { data: agents, isLoading } = useAgents();
  const liveCount = (agents || []).filter(a => a.status === 'live').length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-dash-t1">Your agents</h1>
          <p className="text-xs text-dash-t3 mt-0.5">{liveCount} of {(agents || []).length || 5} agents active on your Pro plan</p>
        </div>
        <Link
          to="/onboarding"
          className="inline-flex items-center gap-1.5 bg-dash-blue text-white text-xs font-semibold px-4 py-2 rounded-lg hover:opacity-90 transition-opacity"
        >
          <Plus className="h-3.5 w-3.5" /> New agent
        </Link>
      </div>

      {isLoading ? (
        <div className="rounded-xl border border-dash-border bg-dash-card overflow-hidden">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="px-5 py-4 border-b border-dash-border last:border-0">
              <Skeleton className="h-10 foyer-skeleton" />
            </div>
          ))}
        </div>
      ) : !agents?.length ? (
        <div className="rounded-xl border border-dash-border bg-dash-card flex flex-col items-center justify-center py-16">
          <PhoneCall className="h-10 w-10 text-dash-t3 mb-4" />
          <h3 className="text-sm font-semibold text-dash-t1 mb-1">No agents yet</h3>
          <p className="text-xs text-dash-t2 mb-4">Create your first AI receptionist to start taking calls</p>
          <Link to="/onboarding" className="inline-flex items-center gap-1.5 bg-dash-blue text-white text-xs font-semibold px-5 py-2.5 rounded-lg hover:opacity-90 transition-opacity">
            <Plus className="h-3.5 w-3.5" /> Create Agent
          </Link>
        </div>
      ) : (
        <div className="rounded-xl border border-dash-border bg-dash-card overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[1fr_80px_140px_80px_70px_60px] gap-2 items-center px-5 py-2.5 border-b border-dash-border bg-dash-surface">
            <span className="text-label uppercase text-dash-t3 tracking-widest">Agent</span>
            <span className="text-label uppercase text-dash-t3 tracking-widest">Status</span>
            <span className="text-label uppercase text-dash-t3 tracking-widest hidden sm:block">Phone</span>
            <span className="text-label uppercase text-dash-t3 tracking-widest hidden md:block">Port</span>
            <span className="text-label uppercase text-dash-t3 tracking-widest text-right hidden md:block">Calls</span>
            <span className="text-label uppercase text-dash-t3 tracking-widest text-right">Actions</span>
          </div>

          <motion.div variants={container} initial="hidden" animate="show">
            {agents.map((agent) => <AgentRow key={agent.id} agent={agent} />)}
          </motion.div>
        </div>
      )}
    </div>
  );
}
