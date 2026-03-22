import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, LineChart, Line,
} from 'recharts';
import {
  Phone, Calendar, TrendingUp, Clock, ArrowUpRight, ArrowDownRight,
  BookOpen, BarChart3, Users, Plus, Bot, ChevronRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { OutcomeBadge } from '@/components/ui/outcome-badge';
import { useAgents } from '@/hooks/useAgents';
import { useCalls } from '@/hooks/useCalls';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useAuthStore } from '@/stores/authStore';
import { formatDuration, maskPhone, relativeTime } from '@/lib/utils';

const container = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } };

// Mock data for charts when API returns empty
const mockChartData = Array.from({ length: 30 }, (_, i) => {
  const date = new Date();
  date.setDate(date.getDate() - (29 - i));
  return {
    date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    calls: Math.floor(Math.random() * 40) + 5,
    booked: Math.floor(Math.random() * 20) + 2,
  };
});

function KpiCard({
  title, value, sub, icon: Icon, trend, color = 'text-primary',
}: {
  title: string;
  value: string | number;
  sub: string;
  icon: typeof Phone;
  trend?: number;
  color?: string;
}) {
  return (
    <motion.div variants={item}>
      <Card>
        <CardContent className="p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-sm text-muted-foreground">{title}</p>
              <p className="mt-1 text-2xl font-bold font-mono">{value}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>
            </div>
            <div className={`rounded-lg bg-primary/10 p-2 ${color}`}>
              <Icon className="h-5 w-5" />
            </div>
          </div>
          {trend !== undefined && (
            <div className={`mt-3 flex items-center gap-1 text-xs ${trend >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
              {trend >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
              {Math.abs(trend)}% vs yesterday
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function Dashboard() {
  const { user } = useAuthStore();
  const { data: agents, isLoading: agentsLoading } = useAgents();
  const { data: calls, isLoading: callsLoading } = useCalls({ per_page: 5 });
  const { data: analytics, isLoading: analyticsLoading } = useAnalytics();

  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';

  const chartData = analytics?.calls_by_day?.length ? analytics.calls_by_day.map((d) => ({
    date: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    calls: d.calls,
    booked: d.booked,
  })) : mockChartData;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">{greeting}, {user?.full_name?.split(' ')[0] || 'there'}</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
          </p>
        </div>
        <Button asChild>
          <Link to="/onboarding"><Plus className="h-4 w-4 mr-2" />New Agent</Link>
        </Button>
      </div>

      {/* KPI Cards */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 gap-4 lg:grid-cols-4"
      >
        {analyticsLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Card key={i}><CardContent className="p-5"><Skeleton className="h-16 w-full" /></CardContent></Card>
          ))
        ) : (
          <>
            <KpiCard
              title="Calls Today"
              value={analytics?.total_calls ?? 0}
              sub={`${analytics?.calls_answered ?? 0} answered`}
              icon={Phone}
              trend={12}
            />
            <KpiCard
              title="Booked Today"
              value={analytics?.total_bookings ?? 0}
              sub="appointments confirmed"
              icon={Calendar}
              trend={8}
            />
            <KpiCard
              title="Booking Rate"
              value={`${analytics?.booking_rate?.toFixed(1) ?? 0}%`}
              sub="of all calls"
              icon={TrendingUp}
              trend={3}
            />
            <KpiCard
              title="Avg Duration"
              value={formatDuration(analytics?.avg_duration ?? 0)}
              sub="per call"
              icon={Clock}
              trend={-2}
            />
          </>
        )}
      </motion.div>

      {/* Charts row */}
      <div className="grid gap-4 lg:grid-cols-5">
        {/* Call Volume */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Call Volume — Last 30 Days</CardTitle>
          </CardHeader>
          <CardContent>
            {analyticsLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="calls" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0D9488" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#0D9488" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="booked" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} interval={4} />
                  <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={28} />
                  <Tooltip
                    contentStyle={{ background: '#111118', border: '1px solid #1E1E2E', borderRadius: 8, fontSize: 12 }}
                  />
                  <Area type="monotone" dataKey="calls" stroke="#0D9488" fill="url(#calls)" strokeWidth={2} name="Calls" />
                  <Area type="monotone" dataKey="booked" stroke="#3B82F6" fill="url(#booked)" strokeWidth={2} name="Booked" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Today's Bookings */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Today's Bookings</CardTitle>
            <Button variant="ghost" size="sm" asChild><Link to="/calendar">View all</Link></Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {callsLoading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
            ) : calls?.data?.length ? (
              calls.data.slice(0, 5).map((call) => (
                <div key={call.id} className="flex items-center justify-between text-sm">
                  <div>
                    <div className="font-medium">{call.caller_number ? maskPhone(call.caller_number) : 'Unknown'}</div>
                    <div className="text-xs text-muted-foreground">{relativeTime(call.started_at)}</div>
                  </div>
                  <OutcomeBadge outcome={call.outcome} />
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">No calls yet today</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Agent Performance + Recent Calls */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Agent Performance */}
        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Agent Performance</CardTitle>
            <Button variant="ghost" size="sm" asChild><Link to="/agents">View all</Link></Button>
          </CardHeader>
          <CardContent>
            {agentsLoading ? (
              Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-10 w-full mb-2" />)
            ) : agents?.length ? (
              <div className="space-y-3">
                <div className="grid grid-cols-4 text-xs text-muted-foreground pb-1 border-b border-border">
                  <span>Agent</span>
                  <span className="text-center">Calls</span>
                  <span className="text-center">Booking %</span>
                  <span className="text-right">Status</span>
                </div>
                {agents.map((agent) => (
                  <div key={agent.id} className="grid grid-cols-4 items-center text-sm">
                    <div className="flex items-center gap-2">
                      <div className="h-6 w-6 rounded-full bg-primary/20 flex items-center justify-center">
                        <Bot className="h-3 w-3 text-primary" />
                      </div>
                      <span className="truncate">{agent.name}</span>
                    </div>
                    <span className="text-center font-mono">—</span>
                    <span className="text-center font-mono">—</span>
                    <div className="flex justify-end">
                      <StatusBadge status={agent.status} />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-6 text-center">
                <p className="text-sm text-muted-foreground mb-3">No agents yet</p>
                <Button size="sm" asChild><Link to="/onboarding">Create Agent</Link></Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Calls */}
        <Card>
          <CardHeader className="pb-2 flex-row items-center justify-between">
            <CardTitle className="text-sm font-medium">Recent Calls</CardTitle>
            <Button variant="ghost" size="sm" asChild><Link to="/calls">View all</Link></Button>
          </CardHeader>
          <CardContent>
            {callsLoading ? (
              Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full mb-2" />)
            ) : calls?.data?.length ? (
              <div className="space-y-3">
                {calls.data.slice(0, 5).map((call) => (
                  <Link
                    key={call.id}
                    to={`/calls/${call.id}`}
                    className="flex items-center justify-between text-sm hover:bg-accent rounded-lg px-2 py-1.5 -mx-2 transition-colors"
                  >
                    <div>
                      <div className="font-mono text-xs">{call.caller_number ? maskPhone(call.caller_number) : 'Unknown'}</div>
                      <div className="text-xs text-muted-foreground">{formatDuration(call.duration_seconds)}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <OutcomeBadge outcome={call.outcome} />
                      <ChevronRight className="h-3 w-3 text-muted-foreground" />
                    </div>
                  </Link>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-6">No calls yet</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-3">Quick Actions</h3>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { icon: BookOpen, label: 'Add Knowledge', desc: 'Update your FAQ', to: '/agents' },
            { icon: BarChart3, label: 'View Analytics', desc: 'Detailed insights', to: '/analytics' },
            { icon: Users, label: 'Invite Team', desc: 'Add team members', to: '/settings/team' },
            { icon: Phone, label: 'Get Number', desc: 'Add a new line', to: '/numbers' },
          ].map(({ icon: Icon, label, desc, to }) => (
            <Link
              key={label}
              to={to}
              className="flex items-center gap-3 rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/50 hover:bg-accent"
            >
              <div className="rounded-lg bg-primary/10 p-2">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <div className="font-medium text-sm">{label}</div>
                <div className="text-xs text-muted-foreground">{desc}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
