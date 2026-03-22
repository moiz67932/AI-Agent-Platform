import { useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Bot, Phone, Settings, BookOpen, PhoneCall, Power, Pencil, ExternalLink } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { StatusBadge } from '@/components/ui/status-badge';
import { OutcomeBadge } from '@/components/ui/outcome-badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAgent, useUpdateAgent, useToggleAgentStatus } from '@/hooks/useAgents';
import { useCalls } from '@/hooks/useCalls';
import { formatDuration, maskPhone, relativeTime } from '@/lib/utils';
import { INDUSTRY_COLORS, INDUSTRY_LABELS } from '@/types';

const mockChartData = Array.from({ length: 7 }, (_, i) => {
  const date = new Date();
  date.setDate(date.getDate() - (6 - i));
  return {
    date: date.toLocaleDateString('en-US', { weekday: 'short' }),
    calls: Math.floor(Math.random() * 30) + 3,
  };
});

function OverviewTab({ agentId }: { agentId: string }) {
  const { data: calls, isLoading } = useCalls({ agent_id: agentId, per_page: 10 });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Calls Today', value: '—' },
          { label: 'This Week', value: '—' },
          { label: 'Booking Rate', value: '—%' },
          { label: 'Avg Duration', value: '—' },
        ].map((kpi) => (
          <Card key={kpi.label}>
            <CardContent className="p-4">
              <div className="text-2xl font-bold font-mono">{kpi.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{kpi.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Call Volume — Last 7 Days</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={160}>
            <AreaChart data={mockChartData}>
              <defs>
                <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0D9488" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#0D9488" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} width={24} />
              <Tooltip contentStyle={{ background: '#111118', border: '1px solid #1E1E2E', borderRadius: 8, fontSize: 12 }} />
              <Area type="monotone" dataKey="calls" stroke="#0D9488" fill="url(#areaGrad)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Recent Calls</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-full mb-2" />)
          ) : calls?.data?.length ? (
            <div className="space-y-2">
              {calls.data.map((call) => (
                <Link
                  key={call.id}
                  to={`/calls/${call.id}`}
                  className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-accent transition-colors"
                >
                  <div className="text-sm">
                    <span className="font-mono">{call.caller_number ? maskPhone(call.caller_number) : 'Unknown'}</span>
                    <span className="text-muted-foreground ml-2">{relativeTime(call.started_at)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{formatDuration(call.duration_seconds)}</span>
                    <OutcomeBadge outcome={call.outcome} />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No calls yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SettingsTab({ agent }: { agent: NonNullable<ReturnType<typeof useAgent>['data']> }) {
  const updateAgent = useUpdateAgent();
  const [greeting, setGreeting] = useState(agent.settings?.greeting_text || '');
  const [tone, setTone] = useState(agent.settings?.persona_tone || 'warm');
  const [notifEmail, setNotifEmail] = useState(agent.settings?.config_json?.notification_email || '');
  const [webhookUrl, setWebhookUrl] = useState(agent.settings?.config_json?.webhook_url || '');
  const [emergency, setEmergency] = useState(agent.settings?.config_json?.emergency_handling || false);

  const save = () => {
    updateAgent.mutate({
      id: agent.id,
      settings: {
        ...agent.settings,
        greeting_text: greeting,
        persona_tone: tone as 'professional' | 'warm' | 'enthusiastic' | 'formal',
        config_json: {
          ...agent.settings?.config_json,
          notification_email: notifEmail,
          webhook_url: webhookUrl,
          emergency_handling: emergency,
        },
      } as never,
    });
  };

  return (
    <div className="space-y-6 max-w-lg">
      <div className="space-y-1.5">
        <Label>Greeting Script</Label>
        <Textarea value={greeting} onChange={(e) => setGreeting(e.target.value)} rows={3} />
      </div>
      <div className="space-y-1.5">
        <Label>Persona Tone</Label>
        <Select value={tone} onValueChange={(v) => setTone(v as typeof tone)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="warm">Warm</SelectItem>
            <SelectItem value="professional">Professional</SelectItem>
            <SelectItem value="enthusiastic">Enthusiastic</SelectItem>
            <SelectItem value="formal">Formal</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center justify-between">
        <div>
          <div className="font-medium text-sm">Emergency Handling</div>
          <div className="text-xs text-muted-foreground">Route urgent calls immediately</div>
        </div>
        <Switch checked={emergency} onCheckedChange={setEmergency} />
      </div>
      <div className="space-y-1.5">
        <Label>Notification Email</Label>
        <Input
          type="email"
          value={notifEmail}
          onChange={(e) => setNotifEmail(e.target.value)}
          placeholder="bookings@yourclinic.com"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Webhook URL</Label>
        <Input
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          placeholder="https://your-server.com/webhook"
        />
      </div>
      <Button onClick={save} disabled={updateAgent.isPending}>
        {updateAgent.isPending ? 'Saving...' : 'Save Changes'}
      </Button>
    </div>
  );
}

export default function AgentOverview() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: agent, isLoading } = useAgent(id!);
  const toggleStatus = useToggleAgentStatus();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!agent) {
    return (
      <div className="flex flex-col items-center py-20">
        <p className="text-muted-foreground">Agent not found</p>
        <Button variant="ghost" className="mt-4" onClick={() => navigate('/agents')}>
          <ArrowLeft className="h-4 w-4 mr-2" />Back to Agents
        </Button>
      </div>
    );
  }

  const color = INDUSTRY_COLORS[agent.clinic?.industry || 'generic'];
  const industryLabel = INDUSTRY_LABELS[agent.clinic?.industry || 'generic'];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <Button variant="ghost" size="sm" className="mb-3 -ml-2" onClick={() => navigate('/agents')}>
          <ArrowLeft className="h-4 w-4 mr-1" />Agents
        </Button>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl"
              style={{ backgroundColor: `${color}20`, color }}
            >
              <Bot className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold">{agent.name}</h1>
                <Badge variant="outline" style={{ color, borderColor: `${color}40` }}>{industryLabel}</Badge>
              </div>
              <div className="flex items-center gap-3 mt-0.5">
                <StatusBadge status={agent.status} />
                {agent.phone_number && (
                  <span className="text-sm text-muted-foreground font-mono">
                    {agent.phone_number.phone_number}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">{agent.status === 'live' ? 'Live' : 'Paused'}</span>
              <Switch
                checked={agent.status === 'live'}
                onCheckedChange={() => toggleStatus.mutate({
                  id: agent.id,
                  status: agent.status === 'live' ? 'paused' : 'live',
                })}
              />
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link to={`/knowledge/${agent.clinic_id}`}>
                <BookOpen className="h-4 w-4 mr-2" />Knowledge
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link to={`/calls?agent=${agent.id}`}>
                <PhoneCall className="h-4 w-4 mr-2" />Calls
              </Link>
            </Button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="calls">Calls</TabsTrigger>
          <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab agentId={agent.id} />
        </TabsContent>

        <TabsContent value="calls" className="mt-4">
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground mb-4">All calls for {agent.name}</p>
              <Button asChild variant="outline">
                <Link to={`/calls?agent=${agent.id}`}>
                  <ExternalLink className="h-4 w-4 mr-2" />View Full Call Log
                </Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="knowledge" className="mt-4">
          <Card>
            <CardContent className="p-6">
              <p className="text-sm text-muted-foreground mb-4">Manage FAQ articles for {agent.name}</p>
              <Button asChild>
                <Link to={`/knowledge/${agent.clinic_id}`}>
                  <BookOpen className="h-4 w-4 mr-2" />Open Knowledge Base
                </Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <SettingsTab agent={agent} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
