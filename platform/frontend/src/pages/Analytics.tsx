import { useState } from 'react';
import {
  AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { Download, TrendingUp, Phone, Calendar, Clock, BookOpen, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useAgents } from '@/hooks/useAgents';
import { formatDuration } from '@/lib/utils';

const OUTCOME_COLORS: Record<string, string> = {
  booked: '#0D9488',
  info_only: '#6B7280',
  transferred: '#3B82F6',
  voicemail: '#F59E0B',
  missed: '#EF4444',
  error: '#DC2626',
};

// Mock data for when API isn't ready
const mockByDay = Array.from({ length: 30 }, (_, i) => {
  const d = new Date(); d.setDate(d.getDate() - (29 - i));
  return {
    date: d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    calls: Math.floor(Math.random() * 45) + 5,
    booked: Math.floor(Math.random() * 20) + 2,
  };
});

const mockByHour = Array.from({ length: 16 }, (_, i) => ({
  hour: `${i + 7}:00`,
  count: Math.floor(Math.random() * 30) + (i > 2 && i < 10 ? 15 : 3),
}));

const mockByWeekday = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => ({
  day,
  count: Math.floor(Math.random() * 50) + (day === 'Mon' || day === 'Tue' ? 25 : 5),
}));

const mockOutcomes = [
  { outcome: 'booked', count: 142 },
  { outcome: 'info_only', count: 89 },
  { outcome: 'transferred', count: 23 },
  { outcome: 'voicemail', count: 31 },
  { outcome: 'missed', count: 18 },
];

const mockServices = [
  { service: 'Cleaning', requested: 87, booked: 71, avg_duration: 1840 },
  { service: 'Consultation', requested: 54, booked: 49, avg_duration: 1240 },
  { service: 'Filling', requested: 43, booked: 38, avg_duration: 2100 },
  { service: 'Crown', requested: 31, booked: 27, avg_duration: 2890 },
  { service: 'Whitening', requested: 28, booked: 19, avg_duration: 1680 },
];

function KpiCard({ label, value, icon: Icon, sub }: { label: string; value: string | number; icon: typeof Phone; sub?: string }) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-bold font-mono">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className="rounded-lg bg-primary/10 p-2 text-primary">
            <Icon className="h-4 w-4" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Analytics() {
  const [period, setPeriod] = useState('30d');
  const [agentFilter, setAgentFilter] = useState('all');

  const { data: agents } = useAgents();
  const { data: analytics, isLoading } = useAnalytics({
    agent_id: agentFilter === 'all' ? undefined : agentFilter,
  });

  const chartData = analytics?.calls_by_day?.length ? analytics.calls_by_day.map((d) => ({
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    calls: d.calls,
    booked: d.booked,
  })) : mockByDay;

  const hourData = analytics?.calls_by_hour?.length ? analytics.calls_by_hour.map((h) => ({
    hour: `${h.hour}:00`,
    count: h.count,
  })) : mockByHour;

  const weekdayData = analytics?.calls_by_weekday?.length ? analytics.calls_by_weekday : mockByWeekday;

  const outcomeData = analytics?.outcome_breakdown?.length ? analytics.outcome_breakdown : mockOutcomes;
  const serviceData = analytics?.service_breakdown?.length ? analytics.service_breakdown : mockServices;

  const tooltipStyle = { background: '#111118', border: '1px solid #1E1E2E', borderRadius: 8, fontSize: 12 };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <div className="flex items-center gap-2">
          <Select value={agentFilter} onValueChange={setAgentFilter}>
            <SelectTrigger className="w-40"><SelectValue placeholder="All Agents" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Agents</SelectItem>
              {agents?.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={period} onValueChange={setPeriod}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />Export
          </Button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        {isLoading ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5"><Skeleton className="h-14 w-full" /></CardContent></Card>
          ))
        ) : (
          <>
            <KpiCard label="Total Calls" value={analytics?.total_calls ?? 303} icon={Phone} />
            <KpiCard label="Total Bookings" value={analytics?.total_bookings ?? 204} icon={Calendar} />
            <KpiCard label="Booking Rate" value={`${(analytics?.booking_rate ?? 67.3).toFixed(1)}%`} icon={TrendingUp} />
            <KpiCard label="Avg Duration" value={formatDuration(analytics?.avg_duration ?? 142)} icon={Clock} />
            <KpiCard label="Answered" value={analytics?.calls_answered ?? 287} icon={Phone} />
            <KpiCard label="Missed" value={analytics?.missed_calls ?? 16} icon={Phone} sub="5.3% miss rate" />
          </>
        )}
      </div>

      {/* Charts Row 1 */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Call Volume Over Time</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="gradCalls" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#0D9488" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#0D9488" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="gradBooked" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval={4} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={24} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                <Area type="monotone" dataKey="calls" stroke="#0D9488" fill="url(#gradCalls)" strokeWidth={2} name="Total Calls" />
                <Area type="monotone" dataKey="booked" stroke="#3B82F6" fill="url(#gradBooked)" strokeWidth={2} name="Booked" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Outcome Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={outcomeData}
                  dataKey="count"
                  nameKey="outcome"
                  cx="50%"
                  cy="50%"
                  outerRadius={70}
                  innerRadius={40}
                >
                  {outcomeData.map((entry) => (
                    <Cell key={entry.outcome} fill={OUTCOME_COLORS[entry.outcome] || '#6B7280'} />
                  ))}
                </Pie>
                <Tooltip contentStyle={tooltipStyle} formatter={(val, name) => [val, String(name).replace('_', ' ')]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-2 gap-1 mt-2">
              {outcomeData.map((entry) => (
                <div key={entry.outcome} className="flex items-center gap-1.5 text-xs">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: OUTCOME_COLORS[entry.outcome] }} />
                  <span className="text-muted-foreground capitalize truncate">{entry.outcome.replace('_', ' ')}</span>
                  <span className="font-mono ml-auto">{entry.count}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Row 2 */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Calls by Hour of Day</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={hourData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="hour" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} interval={1} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={24} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="#0D9488" radius={[3, 3, 0, 0]} name="Calls" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Calls by Day of Week</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={weekdayData}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                <XAxis dataKey="day" tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} width={24} />
                <Tooltip contentStyle={tooltipStyle} />
                <Bar dataKey="count" fill="#3B82F6" radius={[3, 3, 0, 0]} name="Calls" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Service Breakdown Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Service Breakdown</CardTitle>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {['Service', 'Requested', 'Booked', 'Booking Rate', 'Avg Duration'].map((h) => (
                  <th key={h} className="text-left pb-2 text-xs text-muted-foreground font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {serviceData.map((row) => (
                <tr key={row.service} className="border-b border-border hover:bg-accent/50">
                  <td className="py-2.5 font-medium">{row.service}</td>
                  <td className="py-2.5 font-mono">{row.requested}</td>
                  <td className="py-2.5 font-mono">{row.booked}</td>
                  <td className="py-2.5 font-mono text-emerald-500">
                    {row.requested > 0 ? `${((row.booked / row.requested) * 100).toFixed(0)}%` : '—'}
                  </td>
                  <td className="py-2.5 font-mono">{formatDuration(row.avg_duration)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Top Questions */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Top Questions Asked</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[
              { q: 'What are your hours?', count: 47 },
              { q: 'Do you accept insurance?', count: 38 },
              { q: 'How much does a cleaning cost?', count: 29 },
              { q: 'Can I book an appointment for next week?', count: 24 },
              { q: 'Do you have evening appointments?', count: 19 },
            ].map((row) => (
              <div key={row.q} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-accent/50 transition-colors">
                <span className="text-sm">{row.q}</span>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono text-muted-foreground">{row.count}x</span>
                  <Button variant="ghost" size="sm" className="h-7 text-xs">
                    <BookOpen className="h-3 w-3 mr-1" />Add to KB
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
