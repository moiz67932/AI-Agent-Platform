import { useMemo, useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Phone, Calendar, TrendingUp, Clock } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useAgents } from '@/hooks/useAgents';
import { formatDuration, cn } from '@/lib/utils';

const OUTCOME_COLORS: Record<string, string> = {
  booked: '#059669',
  info_only: '#4F46E5',
  missed: '#DB2777',
  transferred: '#D97706',
  voicemail: '#7C3AED',
  error: '#DC2626',
};

function getPeriodRange(period: string) {
  const end = new Date();
  const start = new Date(end);
  if (period === '7d') start.setDate(end.getDate() - 6);
  else if (period === '90d') start.setDate(end.getDate() - 89);
  else start.setDate(end.getDate() - 29);
  start.setHours(0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

const tooltipStyle = {
  background: '#FFFFFF',
  border: '1px solid #E0DEEF',
  borderRadius: 10,
  fontSize: 11,
  color: '#1E1B2E',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
};

function KpiCard({ label, value, trend, icon: Icon, color }: {
  label: string; value: string | number; trend?: string; icon: typeof Phone; color: string;
}) {
  return (
    <div className="rounded-xl border border-dash-border bg-dash-card p-5">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-dash-t2">{label}</span>
        <div className={cn('w-7 h-7 rounded-lg flex items-center justify-center', color)}>
          <Icon className="h-3.5 w-3.5" />
        </div>
      </div>
      <p className="text-metric font-extrabold text-dash-t1">{value}</p>
      {trend && <p className="text-[11px] text-dash-green font-medium mt-1">{trend}</p>}
    </div>
  );
}

export default function Analytics() {
  const [period, setPeriod] = useState('7d');
  const range = useMemo(() => getPeriodRange(period), [period]);
  const { data: agents } = useAgents();
  const { data: analytics, isLoading } = useAnalytics({ start_date: range.start, end_date: range.end });

  const chartData = analytics?.calls_by_day?.map(day => ({
    date: new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' }),
    fullDate: new Date(day.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    calls: day.calls,
    booked: day.booked,
  })) ?? [];

  const outcomeData = analytics?.outcomes
    ? Object.entries(analytics.outcomes).map(([key, val]) => ({
        name: key.replace('_', ' ').replace(/^\w/, c => c.toUpperCase()),
        value: val as number,
        color: OUTCOME_COLORS[key] || '#AAA8BE',
      }))
    : [];

  const totalOutcomes = outcomeData.reduce((s, d) => s + d.value, 0);

  const hourlyData = analytics?.calls_by_hour
    ? Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        label: i % 4 === 0 ? `${i === 0 ? '12' : i > 12 ? i - 12 : i}${i < 12 ? 'am' : 'pm'}` : '',
        calls: (analytics.calls_by_hour as Record<number, number>)[i] ?? 0,
      }))
    : Array.from({ length: 24 }, (_, i) => ({
        hour: i,
        label: i % 4 === 0 ? `${i === 0 ? '12' : i > 12 ? i - 12 : i}${i < 12 ? 'am' : 'pm'}` : '',
        calls: 0,
      }));

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-extrabold text-dash-t1">Analytics</h1>
          <p className="text-xs text-dash-t3 mt-0.5">Call performance and booking metrics</p>
        </div>
        <div className="flex rounded-lg border border-dash-border overflow-hidden">
          {['7d', '30d', '90d'].map(p => (
            <button key={p} onClick={() => setPeriod(p)} className={cn(
              'text-xs font-semibold px-3 py-1.5',
              period === p ? 'bg-dash-blue text-white' : 'bg-dash-card text-dash-t2 hover:text-dash-t1'
            )}>
              {p === '7d' ? 'This week' : p === '30d' ? 'This month' : 'Last 3 months'}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      {isLoading ? (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1,2,3,4].map(i => <Skeleton key={i} className="h-28 foyer-skeleton rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KpiCard label="Total calls" value={analytics?.total_calls ?? 0} icon={Phone} color="bg-dash-blue-bg text-dash-blue" />
          <KpiCard label="Appointments booked" value={analytics?.total_bookings ?? 0} icon={Calendar} color="bg-dash-green-bg text-dash-green" />
          <KpiCard label="Book rate" value={analytics?.total_calls ? `${Math.round(((analytics.total_bookings ?? 0) / analytics.total_calls) * 100)}%` : '—'} icon={TrendingUp} color="bg-dash-pink-bg text-dash-pink" />
          <KpiCard label="Avg duration" value={analytics?.avg_duration ? formatDuration(analytics.avg_duration) : '—'} icon={Clock} color="bg-dash-amber-bg text-dash-amber" />
        </div>
      )}

      {/* Main chart — calls over time */}
      <div className="rounded-xl border border-dash-border bg-dash-card p-5">
        <h3 className="text-sm font-bold text-dash-t1 mb-4">Calls over time</h3>
        {isLoading ? <Skeleton className="h-56 foyer-skeleton" /> : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="gradCalls" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#4F46E5" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gradBooked" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#059669" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#059669" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E0DEEF" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#AAA8BE' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#AAA8BE' }} tickLine={false} axisLine={false} width={28} />
              <Tooltip contentStyle={tooltipStyle} />
              <Area type="monotone" dataKey="calls" stroke="#4F46E5" fill="url(#gradCalls)" strokeWidth={2} name="Total calls" />
              <Area type="monotone" dataKey="booked" stroke="#059669" fill="url(#gradBooked)" strokeWidth={2} name="Booked" />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Two column */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Calls by hour */}
        <div className="rounded-xl border border-dash-border bg-dash-card p-5">
          <h3 className="text-sm font-bold text-dash-t1 mb-4">Calls by hour</h3>
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={hourlyData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E0DEEF" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#AAA8BE' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 9, fill: '#AAA8BE' }} tickLine={false} axisLine={false} width={24} />
              <Tooltip contentStyle={tooltipStyle} />
              <Bar dataKey="calls" fill="#4F46E5" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Outcome breakdown */}
        <div className="rounded-xl border border-dash-border bg-dash-card p-5">
          <h3 className="text-sm font-bold text-dash-t1 mb-4">Outcome breakdown</h3>
          {outcomeData.length > 0 ? (
            <div className="flex items-center gap-6">
              <div className="w-[160px] h-[160px] shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie data={outcomeData} dataKey="value" cx="50%" cy="50%" innerRadius={45} outerRadius={70} paddingAngle={2}>
                      {outcomeData.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <p className="text-center -mt-[95px] text-lg font-extrabold text-dash-t1">{totalOutcomes}</p>
                <p className="text-center text-[9px] text-dash-t3 mt-0.5">total calls</p>
              </div>
              <div className="flex-1 space-y-2">
                {outcomeData.map(d => (
                  <div key={d.name} className="flex items-center gap-2">
                    <span className="w-3 h-3 rounded-sm shrink-0" style={{ background: d.color }} />
                    <span className="text-xs text-dash-t2 flex-1">{d.name}</span>
                    <span className="text-xs font-bold text-dash-t1">{d.value}</span>
                    <span className="text-[10px] text-dash-t3">({totalOutcomes ? Math.round(d.value / totalOutcomes * 100) : 0}%)</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-40">
              <p className="text-sm text-dash-t3">No data available</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
