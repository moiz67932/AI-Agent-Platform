import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Phone, Filter, Download, ChevronRight, Search } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useCalls } from '@/hooks/useCalls';
import { useAgents } from '@/hooks/useAgents';
import { formatDuration, maskPhone, cn } from '@/lib/utils';

function OutcomeDot({ outcome }: { outcome: string }) {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    booked: { bg: 'bg-dash-green-bg border-dash-green-b', text: 'text-dash-green', label: 'Booked' },
    info_only: { bg: 'bg-dash-blue-bg border-dash-blue-b', text: 'text-dash-blue', label: 'Info' },
    missed: { bg: 'bg-dash-pink-bg border-dash-pink-b', text: 'text-dash-pink', label: 'Missed' },
    transferred: { bg: 'bg-dash-amber-bg border-dash-amber-b', text: 'text-dash-amber', label: 'Transferred' },
    voicemail: { bg: 'bg-dash-purple-bg border-dash-purple-b', text: 'text-dash-purple', label: 'Voicemail' },
  };
  const m = map[outcome] || map.info_only;
  return (
    <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border', m.bg, m.text)}>
      <span className={cn('w-1.5 h-1.5 rounded-full', outcome === 'booked' ? 'bg-dash-green' : outcome === 'missed' ? 'bg-dash-pink' : 'bg-dash-blue')} />
      {m.label}
    </span>
  );
}

export default function CallLog() {
  const [searchParams] = useSearchParams();
  const [outcome, setOutcome] = useState('all');
  const [agentId, setAgentId] = useState(searchParams.get('agent') || '');
  const [dateRange, setDateRange] = useState('today');
  const [page, setPage] = useState(1);

  const { data: agents } = useAgents();
  const { data: calls, isLoading } = useCalls({
    outcome: outcome === 'all' ? undefined : outcome,
    agent_id: agentId || undefined,
    page,
    per_page: 20,
  });

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-dash-t1">Call log</h1>
          <p className="text-xs text-dash-t3 mt-0.5">View and filter all incoming calls</p>
        </div>
        <button className="inline-flex items-center gap-1.5 text-xs font-semibold text-dash-t2 border border-dash-border bg-dash-card px-3 py-1.5 rounded-lg hover:border-dash-blue transition-colors">
          <Download className="h-3.5 w-3.5" /> Export CSV
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="flex items-center gap-2 bg-dash-card border border-dash-border rounded-lg px-3 py-1.5 w-[240px]">
          <Search className="h-3.5 w-3.5 text-dash-t3" />
          <input type="text" placeholder="Search callers..." className="bg-transparent text-xs text-dash-t1 placeholder:text-dash-t3 outline-none flex-1" />
        </div>

        <select
          value={outcome}
          onChange={e => { setOutcome(e.target.value); setPage(1); }}
          className="text-xs font-medium text-dash-t2 bg-dash-card border border-dash-border rounded-lg px-3 py-2 outline-none"
        >
          <option value="all">All outcomes</option>
          <option value="booked">Booked</option>
          <option value="info_only">Info</option>
          <option value="missed">Missed</option>
          <option value="transferred">Transferred</option>
        </select>

        <select
          value={agentId || 'all'}
          onChange={e => { setAgentId(e.target.value === 'all' ? '' : e.target.value); setPage(1); }}
          className="text-xs font-medium text-dash-t2 bg-dash-card border border-dash-border rounded-lg px-3 py-2 outline-none"
        >
          <option value="all">All agents</option>
          {agents?.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>

        <select
          value={dateRange}
          onChange={e => setDateRange(e.target.value)}
          className="text-xs font-medium text-dash-t2 bg-dash-card border border-dash-border rounded-lg px-3 py-2 outline-none"
        >
          <option value="today">Today</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
        </select>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-dash-border bg-dash-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-dash-border bg-dash-surface">
                <th className="text-label uppercase text-dash-t3 tracking-widest px-5 py-2.5 text-left font-semibold">Caller</th>
                <th className="text-label uppercase text-dash-t3 tracking-widest px-4 py-2.5 text-left font-semibold">Agent</th>
                <th className="text-label uppercase text-dash-t3 tracking-widest px-4 py-2.5 text-left font-semibold">Outcome</th>
                <th className="text-label uppercase text-dash-t3 tracking-widest px-4 py-2.5 text-left font-semibold">Duration</th>
                <th className="text-label uppercase text-dash-t3 tracking-widest px-4 py-2.5 text-left font-semibold hidden md:table-cell">Response</th>
                <th className="text-label uppercase text-dash-t3 tracking-widest px-4 py-2.5 text-left font-semibold">Date/time</th>
                <th className="text-label uppercase text-dash-t3 tracking-widest px-4 py-2.5 text-right font-semibold w-10"></th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b border-dash-border">
                    <td colSpan={7} className="px-5 py-3"><Skeleton className="h-8 foyer-skeleton" /></td>
                  </tr>
                ))
              ) : !calls?.data?.length ? (
                <tr>
                  <td colSpan={7}>
                    <div className="flex flex-col items-center justify-center py-16">
                      <Phone className="h-10 w-10 text-dash-t3 mb-3" />
                      <p className="text-sm font-semibold text-dash-t1">No calls yet</p>
                      <p className="text-xs text-dash-t2 mt-1">Calls will appear here once your agents start receiving them</p>
                    </div>
                  </td>
                </tr>
              ) : (
                calls.data.map((call, i) => (
                  <tr key={call.id} className="border-b border-dash-border last:border-0 hover:bg-dash-surface transition-colors">
                    <td className="px-5 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className={cn(
                          'w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0',
                          ['bg-purple-500','bg-blue-500','bg-emerald-500','bg-amber-500','bg-pink-500'][i % 5]
                        )}>
                          {(call.caller_number || '??').slice(-2)}
                        </div>
                        <span className="text-sm font-mono text-dash-t1">{call.caller_number ? maskPhone(call.caller_number) : '\u2014'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs font-medium text-dash-t2">{call.agent?.name || '\u2014'}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <OutcomeDot outcome={call.outcome} />
                    </td>
                    <td className="px-4 py-2.5 text-xs font-mono text-dash-t2">{formatDuration(call.duration_seconds)}</td>
                    <td className="px-4 py-2.5 text-xs font-mono text-dash-t3 hidden md:table-cell">
                      {call.response_time_ms ? `${call.response_time_ms}ms` : '\u2014'}
                    </td>
                    <td className="px-4 py-2.5 text-xs text-dash-t3">
                      {new Date(call.started_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <Link to={`/calls/${call.id}`} className="p-1 rounded text-dash-t3 hover:text-dash-blue transition-colors inline-block">
                        <ChevronRight className="h-4 w-4" />
                      </Link>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {calls && calls.total > 20 && (
          <div className="flex items-center justify-between px-5 py-3 border-t border-dash-border">
            <p className="text-xs text-dash-t3">
              Showing {((page - 1) * 20) + 1}\u2013{Math.min(page * 20, calls.total)} of {calls.total}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border border-dash-border text-dash-t2 hover:text-dash-t1 disabled:opacity-40 transition-colors"
              >Previous</button>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page * 20 >= calls.total}
                className="text-xs font-medium px-3 py-1.5 rounded-lg border border-dash-border text-dash-t2 hover:text-dash-t1 disabled:opacity-40 transition-colors"
              >Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
