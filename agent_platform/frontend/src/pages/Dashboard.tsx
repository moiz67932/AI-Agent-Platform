import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Phone, Calendar, TrendingUp, ChevronRight, BarChart3,
} from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useAgents } from '@/hooks/useAgents';
import { useCalls } from '@/hooks/useCalls';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useAppointments } from '@/hooks/useAppointments';
import { useRealtimeSync } from '@/hooks/useRealtimeSync';
import { useAuthStore } from '@/stores/authStore';
import { formatDuration, maskPhone, relativeTime, cn } from '@/lib/utils';

const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.16, 1, 0.3, 1] } } };

function getDateRange(daysBack: number) {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - daysBack);
  start.setHours(0, 0, 0, 0);
  return { start: start.toISOString(), end: now.toISOString() };
}

function getTodayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date();
  end.setHours(23, 59, 59, 999);
  return { start: start.toISOString(), end: end.toISOString() };
}

/* ── Badge ── */
function OutcomeDot({ outcome }: { outcome: string }) {
  const colors: Record<string, string> = {
    booked: 'bg-dash-green text-dash-green',
    info: 'bg-dash-blue text-dash-blue',
    missed: 'bg-dash-pink text-dash-pink',
  };
  const c = colors[outcome] || colors.info;
  const bg = outcome === 'booked' ? 'bg-dash-green-bg border-dash-green-b' :
             outcome === 'missed' ? 'bg-dash-pink-bg border-dash-pink-b' :
             'bg-dash-blue-bg border-dash-blue-b';
  return (
    <span className={cn('inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border', bg, c.split(' ')[1])}>
      <span className={cn('w-1.5 h-1.5 rounded-full', c.split(' ')[0])} />
      {outcome.charAt(0).toUpperCase() + outcome.slice(1)}
    </span>
  );
}

/* ── Mini bar chart ── */
function MiniBars({ data, color }: { data: number[]; color: string }) {
  return (
    <div className="flex items-end gap-[3px] h-10">
      {data.map((h, i) => (
        <div key={i} className={cn('flex-1 rounded-sm', color)} style={{ height: `${h}%`, opacity: i >= data.length - 2 ? 1 : 0.35 }} />
      ))}
    </div>
  );
}

/* ── Metric card ── */
function MetricCard({
  label, value, trend, barData, barColor, icon: Icon, iconBg,
}: {
  label: string; value: string | number; trend: string;
  barData: number[]; barColor: string;
  icon: typeof Phone; iconBg: string;
}) {
  return (
    <motion.div variants={item} className="rounded-xl border border-dash-border bg-dash-card p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-dash-t2">{label}</span>
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', iconBg)}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <p className={cn('text-metric font-extrabold', barColor)}>{value}</p>
      <p className="text-[11px] text-dash-green font-medium mt-1">{trend}</p>
      <div className="mt-3">
        <MiniBars data={barData} color={barColor} />
      </div>
    </motion.div>
  );
}

/* ── Agent chip ── */
function AgentChip({ name, live }: { name: string; live?: boolean }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-dash-t2">
      {live && (
        <span className="relative flex h-[6px] w-[6px]">
          <span className="absolute inline-flex h-full w-full rounded-full bg-dash-gdot opacity-50 animate-ping" />
          <span className="relative inline-flex h-[6px] w-[6px] rounded-full bg-dash-gdot" />
        </span>
      )}
      {name}
    </span>
  );
}

/* ── Service pipeline cell ── */
const PIPELINE_COLORS = [
  { bg: 'bg-dash-blue-bg', text: 'text-dash-blue' },
  { bg: 'bg-dash-pink-bg', text: 'text-dash-pink' },
  { bg: 'bg-dash-green-bg', text: 'text-dash-green' },
  { bg: 'bg-dash-amber-bg', text: 'text-dash-amber' },
];

export default function Dashboard() {
  const { user } = useAuthStore();
  const todayRange = getTodayRange();
  const weekRange = getDateRange(6);

  useRealtimeSync(user?.organization_id ?? null);

  const { data: agents } = useAgents();
  const { data: recentCalls, isLoading: callsLoading } = useCalls({ per_page: 8 });
  const { data: todayAnalytics, isLoading: analyticsLoading } = useAnalytics({
    start_date: todayRange.start,
    end_date: todayRange.end,
  });
  const { data: weekAnalytics } = useAnalytics({
    start_date: weekRange.start,
    end_date: weekRange.end,
  });
  const { data: todayAppointments } = useAppointments({
    start_date: todayRange.start,
    end_date: todayRange.end,
  });

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const liveAgents = (agents || []).filter(a => a.status === 'live').length;

  const hasCalls = recentCalls?.data?.length;
  const weekTotalCalls = weekAnalytics?.total_calls ?? 0;
  const weekBooked = weekAnalytics?.total_bookings ?? 0;
  const weekRate = weekTotalCalls > 0 ? Math.round((weekBooked / weekTotalCalls) * 100) : 0;

  return (
    <div className="space-y-5">
      {/* Greeting */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-dash-t1">
            {greeting}, {user?.full_name?.split(' ')[0] || 'there'}
          </h1>
          <p className="text-xs text-dash-t3 mt-0.5">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
            {liveAgents > 0 && <> &middot; {liveAgents} agent{liveAgents !== 1 ? 's' : ''} live</>}
          </p>
        </div>
        <span className="text-xs text-dash-t2 border border-dash-border bg-dash-card rounded-lg px-3 py-1.5 font-medium">
          Last 24 hours
        </span>
      </div>

      {/* Big metric cards */}
      <motion.div variants={container} initial="hidden" animate="show" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Total calls today"
          value={todayAnalytics?.total_calls ?? 0}
          trend={todayAnalytics?.total_calls ? `${todayAnalytics.total_calls} call${todayAnalytics.total_calls !== 1 ? 's' : ''} today` : 'No calls yet today'}
          barData={[30, 45, 55, 40, 60, 80, 95]}
          barColor="text-dash-blue"
          icon={Phone}
          iconBg="bg-dash-blue-bg text-dash-blue"
        />
        <MetricCard
          label="Appointments booked"
          value={todayAnalytics?.total_bookings ?? 0}
          trend={todayAnalytics?.total_bookings ? `${todayAnalytics.total_bookings} booked today` : 'No bookings yet today'}
          barData={[40, 55, 30, 70, 50, 80, 90]}
          barColor="text-dash-green"
          icon={Calendar}
          iconBg="bg-dash-green-bg text-dash-green"
        />
        <MetricCard
          label="Booking rate"
          value={todayAnalytics?.total_calls ? `${Math.round(((todayAnalytics.total_bookings ?? 0) / todayAnalytics.total_calls) * 100)}%` : '—'}
          trend={todayAnalytics?.total_calls ? 'Based on today\'s calls' : 'No calls yet today'}
          barData={[45, 50, 35, 65, 55, 75, 85]}
          barColor="text-dash-pink"
          icon={TrendingUp}
          iconBg="bg-dash-pink-bg text-dash-pink"
        />
        {/* Call sources */}
        <motion.div variants={item} className="rounded-xl border border-dash-border bg-dash-card p-5">
          <span className="text-xs font-medium text-dash-t2 mb-4 block">Call sources</span>
          <div className="space-y-2.5">
            {[
              { letter: 'G', label: 'Google', pct: 61, color: 'bg-dash-blue', textColor: 'text-dash-blue' },
              { letter: 'R', label: 'Referral', pct: 20, color: 'bg-dash-green', textColor: 'text-dash-green' },
              { letter: 'W', label: 'Walk-in', pct: 12, color: 'bg-dash-amber', textColor: 'text-dash-amber' },
              { letter: 'O', label: 'Other', pct: 7, color: 'bg-dash-purple', textColor: 'text-dash-purple' },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-2.5">
                <div className={cn('w-6 h-6 rounded-md flex items-center justify-center text-[9px] font-bold text-white', s.color)}>
                  {s.letter}
                </div>
                <span className="text-xs text-dash-t2 flex-1">{s.label}</span>
                <div className="w-20 h-1.5 bg-dash-border rounded-full overflow-hidden">
                  <div className={cn('h-full rounded-full', s.color)} style={{ width: `${s.pct}%` }} />
                </div>
                <span className="text-xs font-bold text-dash-t1 w-8 text-right">{s.pct}%</span>
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>

      {/* Two column: calls table + right panel */}
      <div className="grid gap-4 lg:grid-cols-[1fr_296px]">
        {/* Recent calls table */}
        <div className="rounded-xl border border-dash-border bg-dash-card overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3 border-b border-dash-border">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-dash-t1">Recent calls</h3>
              {hasCalls ? (
                <span className="text-[10px] font-semibold text-dash-blue bg-dash-blue-bg border border-dash-blue-b px-2 py-0.5 rounded-full">
                  {recentCalls.data.length} today
                </span>
              ) : null}
            </div>
            <Link to="/calls" className="text-xs text-dash-t3 hover:text-dash-blue transition-colors flex items-center gap-1 font-medium">
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {/* Table header */}
          <div className="grid grid-cols-[1fr_100px_80px_70px_60px] gap-2 px-5 py-2 border-b border-dash-border bg-dash-surface">
            {['Caller', 'Agent', 'Outcome', 'Duration', 'Time'].map(h => (
              <span key={h} className="text-label uppercase text-dash-t3 tracking-widest">{h}</span>
            ))}
          </div>
          {/* Rows */}
          {callsLoading ? (
            <div className="px-5 py-8 text-center text-sm text-dash-t3">Loading…</div>
          ) : !hasCalls ? (
            <div className="px-5 py-10 text-center">
              <p className="text-sm font-medium text-dash-t2">No calls yet</p>
              <p className="text-xs text-dash-t3 mt-1">Calls will appear here once your agents start receiving them</p>
            </div>
          ) : (
            recentCalls.data.slice(0, 4).map((call: any, i: number) => {
              const name = call.patient_name || (call.caller_number ? maskPhone(call.caller_number) : 'Unknown');
              const agentName = call.agent?.name || '';
              const outcome = call.outcome || 'info';
              const dur = call.duration_seconds ? formatDuration(call.duration_seconds) : '\u2014';
              const t = call.started_at ? relativeTime(call.started_at) : '';
              const init = name.split(' ').map((n: string) => n[0]).join('').toUpperCase().slice(0, 2);
              const clr = ['bg-purple-500','bg-blue-500','bg-emerald-500','bg-amber-500'][i % 4];

              return (
                <Link
                  key={i}
                  to={call.id ? `/calls/${call.id}` : '/calls'}
                  className="foyer-row-hover grid grid-cols-[1fr_100px_80px_70px_60px] gap-2 px-5 py-2.5 items-center border-b border-dash-border last:border-0 hover:bg-dash-surface transition-colors"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0', clr)}>
                      {init}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-dash-t1 truncate">{name}</p>
                    </div>
                  </div>
                  <AgentChip name={agentName} live />
                  <OutcomeDot outcome={outcome} />
                  <span className="text-xs font-mono text-dash-t2">{dur}</span>
                  <span className="text-[10px] text-dash-t3">{t}</span>
                </Link>
              );
            })
          )}
        </div>

        {/* Right panel */}
        <div className="space-y-4">
          {/* Active agents */}
          <div className="rounded-xl border border-dash-border bg-dash-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-dash-border">
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-dash-t1">Active agents</h3>
                {liveAgents > 0 && (
                  <span className="text-[10px] font-semibold text-dash-green bg-dash-green-bg border border-dash-green-b px-2 py-0.5 rounded-full">
                    {liveAgents} live
                  </span>
                )}
              </div>
              <Link to="/agents" className="text-[10px] text-dash-t3 hover:text-dash-blue transition-colors font-medium">Manage</Link>
            </div>
            <div className="px-4 py-3 space-y-3">
              {liveAgents === 0 ? (
                <p className="text-xs text-dash-t3 text-center py-2">No live agents yet</p>
              ) : (
                (agents || []).filter(a => a.status === 'live').map((a: any) => (
                  <div key={a.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="relative flex h-[6px] w-[6px]">
                        <span className="absolute inline-flex h-full w-full rounded-full bg-dash-gdot opacity-50 animate-ping" />
                        <span className="relative inline-flex h-[6px] w-[6px] rounded-full bg-dash-gdot" />
                      </span>
                      <div>
                        <p className="text-xs font-semibold text-dash-t1">{a.name}</p>
                        {a.phone_number && <p className="text-[10px] font-mono text-dash-t3">{a.phone_number}</p>}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            {/* Mini week chart */}
            <div className="px-4 py-3 border-t border-dash-border">
              <div className="flex items-center justify-between mb-2">
                <span className="text-label uppercase text-dash-t3 tracking-widest">Calls this week</span>
              </div>
              <div className="flex items-end gap-1 h-10">
                {[40, 55, 45, 60, 50, 70, 85].map((h, i) => (
                  <div key={i} className={cn('flex-1 rounded-sm', i === 6 ? 'bg-dash-blue' : 'bg-dash-blue/20')} style={{ height: `${h}%` }} />
                ))}
              </div>
              <div className="flex justify-between mt-1">
                {['S','M','T','W','T','F','S'].map((d, i) => (
                  <span key={i} className="text-[8px] text-dash-t3 flex-1 text-center">{d}</span>
                ))}
              </div>
              <div className="flex items-center justify-between mt-3 pt-2 border-t border-dash-border">
                <div>
                  <span className="text-lg font-extrabold text-dash-t1">{weekTotalCalls}</span>
                  <p className="text-[9px] text-dash-t3">Total calls</p>
                </div>
                <div>
                  <span className="text-lg font-extrabold text-dash-green">{weekBooked}</span>
                  <p className="text-[9px] text-dash-t3">Booked</p>
                </div>
                <div>
                  <span className="text-lg font-extrabold text-dash-t1">{weekTotalCalls > 0 ? `${weekRate}%` : '—'}</span>
                  <p className="text-[9px] text-dash-t3">Rate</p>
                </div>
              </div>
            </div>
          </div>

          {/* Upcoming today */}
          <div className="rounded-xl border border-dash-border bg-dash-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-dash-border">
              <h3 className="text-sm font-bold text-dash-t1">Upcoming today</h3>
              <Link to="/calendar" className="text-[10px] text-dash-t3 hover:text-dash-blue transition-colors font-medium">All &rarr;</Link>
            </div>
            <div className="px-4 py-3 space-y-3">
              {!todayAppointments?.length ? (
                <p className="text-xs text-dash-t3 text-center py-2">No appointments scheduled today</p>
              ) : (
                todayAppointments.slice(0, 3).map((u: any) => {
                  const apptDate = u.appointment_at ? new Date(u.appointment_at) : null;
                  const timeStr = apptDate ? apptDate.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: false }) : '';
                  const period = apptDate ? (apptDate.getHours() < 12 ? 'AM' : 'PM') : '';
                  return (
                    <div key={u.id} className="flex items-start gap-3">
                      <div className="text-right w-10 shrink-0">
                        <p className="text-sm font-extrabold text-dash-t1">{timeStr}</p>
                        <p className="text-[9px] text-dash-t3">{period}</p>
                      </div>
                      <div className="w-px bg-dash-border self-stretch" />
                      <div>
                        <p className="text-xs font-semibold text-dash-t1">{u.patient_name || u.caller_name || 'Unknown'}</p>
                        {u.service_requested && <p className="text-[10px] text-dash-t3">{u.service_requested}</p>}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Service pipeline */}
      <div className="rounded-xl border border-dash-border bg-dash-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-dash-border">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-dash-t1">Service pipeline</h3>
            <span className="text-[10px] font-medium text-dash-t2 bg-dash-surface border border-dash-border px-2 py-0.5 rounded-md">This week</span>
          </div>
          <Link to="/analytics" className="text-[10px] text-dash-t3 hover:text-dash-blue transition-colors font-medium">Analytics &rarr;</Link>
        </div>
        {weekAnalytics?.services_by_day && weekAnalytics.services_by_day.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-dash-surface border-b border-dash-border">
                  <th className="text-label uppercase text-dash-t3 tracking-widest px-5 py-2.5 font-semibold">Service</th>
                  {['Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
                    <th key={d} className="text-label uppercase text-dash-t3 tracking-widest px-4 py-2.5 font-semibold text-center">{d}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {weekAnalytics.services_by_day.map((row: any, idx: number) => {
                  const colors = PIPELINE_COLORS[idx % PIPELINE_COLORS.length];
                  return (
                    <tr key={row.service} className="border-b border-dash-border last:border-0">
                      <td className="px-5 py-2.5 text-sm font-medium text-dash-t1">{row.service}</td>
                      {row.data.map((val: number, i: number) => (
                        <td key={i} className="px-4 py-2.5 text-center">
                          <span className={cn('inline-block text-xs font-bold px-2.5 py-1 rounded-md', colors.bg, colors.text)}>
                            {val}
                          </span>
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-5 py-8 text-center">
            <p className="text-sm font-medium text-dash-t2">No service data yet</p>
            <p className="text-xs text-dash-t3 mt-1">Service bookings will appear here as your agents handle calls</p>
          </div>
        )}
      </div>
    </div>
  );
}

/* needed for Link alias in this file */
function ArrowRight({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m9 18 6-6-6-6"/>
    </svg>
  );
}
