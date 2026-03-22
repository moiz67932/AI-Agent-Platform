import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Phone, Filter, Download, ChevronRight, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { OutcomeBadge } from '@/components/ui/outcome-badge';
import { useCalls } from '@/hooks/useCalls';
import { useAgents } from '@/hooks/useAgents';
import { formatDuration, maskPhone, relativeTime } from '@/lib/utils';

export default function CallLog() {
  const [searchParams] = useSearchParams();
  const [outcome, setOutcome] = useState('all');
  const [agentId, setAgentId] = useState(searchParams.get('agent') || '');
  const [duration, setDuration] = useState('any');
  const [page, setPage] = useState(1);

  const { data: agents } = useAgents();
  const { data: calls, isLoading } = useCalls({
    outcome: outcome === 'all' ? undefined : outcome,
    agent_id: agentId || undefined,
    page,
    per_page: 25,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Call Log</h1>
        <Button variant="outline" size="sm">
          <Download className="h-4 w-4 mr-2" />Export CSV
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-3 items-center">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <Select value={agentId || 'all'} onValueChange={(v) => setAgentId(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="All Agents" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Agents</SelectItem>
                {agents?.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={outcome} onValueChange={setOutcome}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="All Outcomes" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Outcomes</SelectItem>
                <SelectItem value="booked">Booked</SelectItem>
                <SelectItem value="info_only">Info Only</SelectItem>
                <SelectItem value="missed">Missed</SelectItem>
                <SelectItem value="transferred">Transferred</SelectItem>
                <SelectItem value="voicemail">Voicemail</SelectItem>
              </SelectContent>
            </Select>
            <Select value={duration} onValueChange={setDuration}>
              <SelectTrigger className="w-36">
                <SelectValue placeholder="Any Duration" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">Any Duration</SelectItem>
                <SelectItem value="short">Under 1 min</SelectItem>
                <SelectItem value="medium">1–3 min</SelectItem>
                <SelectItem value="long">Over 3 min</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Calls Table */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Time</th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Caller</th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Agent</th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Duration</th>
                <th className="text-left px-4 py-3 text-xs text-muted-foreground font-medium">Outcome</th>
                <th className="text-right px-4 py-3 text-xs text-muted-foreground font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i} className="border-b border-border">
                    <td colSpan={6} className="px-4 py-3">
                      <Skeleton className="h-8 w-full" />
                    </td>
                  </tr>
                ))
              ) : !calls?.data?.length ? (
                <tr>
                  <td colSpan={6}>
                    <div className="py-16">
                      <EmptyState
                        icon={Phone}
                        title="No calls yet"
                        description="Calls will appear here once your agent starts receiving them"
                      />
                    </div>
                  </td>
                </tr>
              ) : (
                calls.data.map((call) => (
                  <tr
                    key={call.id}
                    className="border-b border-border hover:bg-accent/50 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {new Date(call.started_at).toLocaleString('en-US', {
                        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                      })}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">
                      {call.caller_number ? maskPhone(call.caller_number) : '—'}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {call.agent?.name || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs font-mono">
                      {formatDuration(call.duration_seconds)}
                    </td>
                    <td className="px-4 py-3">
                      <OutcomeBadge outcome={call.outcome} />
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex justify-end gap-1">
                        <Link to={`/calls/${call.id}`}>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {calls && calls.total > 25 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-border">
            <p className="text-xs text-muted-foreground">
              Showing {((page - 1) * 25) + 1}–{Math.min(page * 25, calls.total)} of {calls.total}
            </p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
                Previous
              </Button>
              <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page * 25 >= calls.total}>
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
