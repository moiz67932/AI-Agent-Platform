import { useState, useEffect, useRef } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bot, Phone, BookOpen, PhoneCall, ExternalLink, Loader2, Trash2 } from 'lucide-react';
import { TestCallModal } from '@/components/TestCallModal';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { OutcomeBadge } from '@/components/ui/outcome-badge';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAgent, useUpdateAgent, useToggleAgentStatus, usePublishAgent, useDeleteAgent } from '@/hooks/useAgents';
import { useCalls } from '@/hooks/useCalls';
import { useAnalytics } from '@/hooks/useAnalytics';
import { useAppointments } from '@/hooks/useAppointments';
import { formatDuration, maskPhone, relativeTime, cn } from '@/lib/utils';
import { INDUSTRY_COLORS, INDUSTRY_LABELS } from '@/types';
import type { ServiceItem, WorkingHours } from '@/types';
import { Progress } from '@/components/ui/progress';
import { toast } from '@/hooks/use-toast';

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] as const;
const DAY_LABELS: Record<(typeof DAYS)[number], string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

function defaultWorkingHours(): WorkingHours {
  return {
    monday: { open: true, start: '09:00', end: '17:00' },
    tuesday: { open: true, start: '09:00', end: '17:00' },
    wednesday: { open: true, start: '09:00', end: '17:00' },
    thursday: { open: true, start: '09:00', end: '17:00' },
    friday: { open: true, start: '09:00', end: '17:00' },
    saturday: { open: false, start: '09:00', end: '13:00' },
    sunday: { open: false, start: '09:00', end: '13:00' },
  };
}

function getRange(daysBack: number) {
  const end = new Date();
  const start = new Date(end);
  start.setDate(end.getDate() - daysBack);
  start.setHours(0, 0, 0, 0);
  return { start: start.toISOString(), end: end.toISOString() };
}

function getPhoneDisplay(phoneNumber: unknown) {
  if (!phoneNumber) return 'Unassigned';
  if (typeof phoneNumber === 'string') return phoneNumber;
  if (typeof phoneNumber === 'object' && phoneNumber !== null) {
    const record = phoneNumber as { phone_number?: string | null; phone_e164?: string | null };
    return record.phone_number || record.phone_e164 || 'Unassigned';
  }
  return 'Unassigned';
}

function OverviewTab({ agent }: { agent: NonNullable<ReturnType<typeof useAgent>['data']> }) {
  const agentId = agent.id;
  const todayRange = getRange(0);
  const weekRange = getRange(6);
  const upcomingRange = {
    start: new Date().toISOString(),
    end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };

  const { data: calls, isLoading: callsLoading } = useCalls({ agent_id: agentId, per_page: 10 });
  const { data: todayAnalytics, isLoading: todayLoading } = useAnalytics({
    agent_id: agentId,
    start_date: todayRange.start,
    end_date: todayRange.end,
  });
  const { data: weekAnalytics, isLoading: weekLoading } = useAnalytics({
    agent_id: agentId,
    start_date: weekRange.start,
    end_date: weekRange.end,
  });
  const { data: upcomingAppointments, isLoading: appointmentsLoading } = useAppointments({
    clinic_id: agent.clinic_id,
    start_date: upcomingRange.start,
    end_date: upcomingRange.end,
  });

  const chartData = weekAnalytics?.calls_by_day?.map((day) => ({
    date: new Date(day.date).toLocaleDateString('en-US', { weekday: 'short' }),
    calls: day.calls,
  })) ?? [];
  const services = agent.settings?.config_json?.services || [];
  const workingHours = agent.clinic?.working_hours || defaultWorkingHours();
  const futureAppointments = (upcomingAppointments || []).filter((appointment) => new Date(appointment.start_time).getTime() >= Date.now()).slice(0, 3);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {(todayLoading || weekLoading) ? (
          Array.from({ length: 4 }).map((_, index) => (
            <Card key={index}>
              <CardContent className="p-4">
                <Skeleton className="h-12 w-full" />
              </CardContent>
            </Card>
          ))
        ) : (
          [
            { label: 'Calls Today', value: String(todayAnalytics?.total_calls ?? 0) },
            { label: 'This Week', value: String(weekAnalytics?.total_calls ?? 0) },
            { label: 'Booking Rate', value: `${(weekAnalytics?.booking_rate ?? 0).toFixed(1)}%` },
            { label: 'Avg Duration', value: formatDuration(weekAnalytics?.avg_duration ?? 0) },
          ].map((kpi) => (
            <Card key={kpi.label}>
              <CardContent className="p-4">
                <div className="text-2xl font-bold font-mono text-dash-t1">{kpi.value}</div>
                <div className="mt-0.5 text-xs text-dash-t3">{kpi.label}</div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Call Volume - Last 7 Days</CardTitle>
        </CardHeader>
        <CardContent>
          {weekLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={chartData}>
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
          ) : (
            <EmptyState
              icon={PhoneCall}
              title="No call volume yet"
              description="This chart will populate once this agent has production call data."
            />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Agent Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-dash-t3">Clinic</span>
              <span className="text-right font-medium text-dash-t1">{agent.clinic?.name || 'Unassigned'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-dash-t3">Phone</span>
              <span className="font-mono text-right text-dash-t1">{getPhoneDisplay(agent.phone_number)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-dash-t3">Voice</span>
              <span className="text-right text-dash-t1">{agent.settings?.voice_id || 'Default'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-dash-t3">Tone</span>
              <span className="text-right text-dash-t1 capitalize">{agent.settings?.persona_tone || 'warm'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-dash-t3">Language</span>
              <span className="text-right text-dash-t1">{agent.default_language}</span>
            </div>
            <div className="rounded-lg border border-dash-border bg-dash-surface p-3">
              <p className="mb-1 text-xs font-semibold uppercase tracking-widest text-dash-t3">Greeting</p>
              <p className="text-sm text-dash-t1">{agent.settings?.greeting_text || 'No greeting configured.'}</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Deployment & Routing</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-dash-t3">Status</span>
              <StatusBadge status={agent.status} />
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-dash-t3">Subdomain</span>
              <span className="font-mono text-right text-dash-t1">{agent.subdomain || '—'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-dash-t3">Server IP</span>
              <span className="font-mono text-right text-dash-t1">{agent.hetzner_server_ip || '—'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-dash-t3">Port</span>
              <span className="font-mono text-right text-dash-t1">{agent.port ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-dash-t3">LiveKit agent</span>
              <span className="font-mono text-right text-dash-t1">{agent.livekit_agent_name || '—'}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-dash-t3">SIP trunk</span>
              <span className="font-mono text-right text-dash-t1">{agent.livekit_trunk_id || '—'}</span>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Services</CardTitle>
          </CardHeader>
          <CardContent>
            {!services.length ? (
              <p className="text-sm text-dash-t3">No services configured yet.</p>
            ) : (
              <div className="space-y-2">
                {services.map((service) => (
                  <div key={service.name} className="flex items-center justify-between rounded-lg border border-dash-border px-3 py-2 text-sm">
                    <div>
                      <p className="font-medium text-dash-t1">{service.name}</p>
                      <p className="text-xs text-dash-t3">{service.enabled ? 'Visible to callers' : 'Disabled'}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono text-dash-t1">{service.duration} min</p>
                      <p className="text-xs text-dash-t3">{service.price ? `$${service.price}` : 'Price on request'}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">Clinic Schedule</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {DAYS.map((day) => {
              const schedule = workingHours[day] || defaultWorkingHours()[day];
              return (
                <div key={day} className="flex items-center justify-between rounded-lg border border-dash-border px-3 py-2 text-sm">
                  <span className="font-medium text-dash-t1">{DAY_LABELS[day]}</span>
                  <span className="text-dash-t3">
                    {schedule.open ? `${schedule.start} - ${schedule.end}` : 'Closed'}
                  </span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Upcoming Appointments</CardTitle>
        </CardHeader>
        <CardContent>
          {appointmentsLoading ? (
            Array.from({ length: 3 }).map((_, index) => <Skeleton key={index} className="mb-2 h-10 w-full" />)
          ) : futureAppointments.length ? (
            <div className="space-y-2">
              {futureAppointments.map((appointment) => (
                <div key={appointment.id} className="flex items-center justify-between rounded-lg border border-dash-border px-3 py-2 text-sm">
                  <div>
                    <p className="font-medium text-dash-t1">{appointment.patient_name || 'Unknown caller'}</p>
                    <p className="text-xs text-dash-t3">{appointment.service_requested || appointment.reason || 'General inquiry'}</p>
                  </div>
                  <div className="text-right text-dash-t3">
                    <p>{new Date(appointment.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
                    <p>{new Date(appointment.start_time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-dash-t3">No upcoming appointments yet</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Recent Calls</CardTitle>
        </CardHeader>
        <CardContent>
          {callsLoading ? (
            Array.from({ length: 5 }).map((_, index) => <Skeleton key={index} className="mb-2 h-10 w-full" />)
          ) : calls?.data?.length ? (
            <div className="space-y-2">
              {calls.data.map((call) => (
                <Link
                  key={call.id}
                  to={`/calls/${call.id}`}
                  className="flex items-center justify-between rounded-lg px-3 py-2 transition-colors hover:bg-dash-surface"
                >
                  <div className="text-sm">
                    <span className="font-mono">{call.caller_number ? maskPhone(call.caller_number) : 'Unknown'}</span>
                    <span className="ml-2 text-dash-t3">{relativeTime(call.started_at)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-dash-t3">{formatDuration(call.duration_seconds)}</span>
                    <OutcomeBadge outcome={call.outcome} />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <p className="py-4 text-center text-sm text-dash-t3">No calls yet</p>
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
  const [hours, setHours] = useState<WorkingHours>(agent.clinic?.working_hours || defaultWorkingHours());
  const [services, setServices] = useState<ServiceItem[]>(agent.settings?.config_json?.services || []);

  useEffect(() => {
    setGreeting(agent.settings?.greeting_text || '');
    setTone(agent.settings?.persona_tone || 'warm');
    setNotifEmail(agent.settings?.config_json?.notification_email || '');
    setWebhookUrl(agent.settings?.config_json?.webhook_url || '');
    setEmergency(agent.settings?.config_json?.emergency_handling || false);
    setHours(agent.clinic?.working_hours || defaultWorkingHours());
    setServices(agent.settings?.config_json?.services || []);
  }, [agent]);

  const updateHour = (day: (typeof DAYS)[number], field: 'open' | 'start' | 'end', value: string | boolean) => {
    setHours((current) => ({
      ...current,
      [day]: { ...current[day], [field]: value },
    }));
  };

  const updateService = (index: number, field: keyof ServiceItem, value: string | number | boolean) => {
    setServices((current) => current.map((service, currentIndex) => (
      currentIndex === index ? { ...service, [field]: value } : service
    )));
  };

  const addService = () => {
    setServices((current) => [...current, { name: 'New Service', duration: 30, price: 0, enabled: true }]);
  };

  const removeService = (index: number) => {
    setServices((current) => current.filter((_, currentIndex) => currentIndex !== index));
  };

  const save = () => {
    const normalizedServices = services.filter((service) => service.name.trim());
    updateAgent.mutate({
      id: agent.id,
      clinic: {
        working_hours: hours,
      } as never,
      settings: {
        ...agent.settings,
        greeting_text: greeting,
        persona_tone: tone as 'professional' | 'warm' | 'enthusiastic' | 'formal',
        config_json: {
          ...agent.settings?.config_json,
          services: normalizedServices,
          treatment_durations: Object.fromEntries(
            normalizedServices.map((service) => [service.name, service.duration])
          ),
          notification_email: notifEmail,
          webhook_url: webhookUrl,
          emergency_handling: emergency,
        },
      } as never,
    });
  };

  return (
    <div className="max-w-lg space-y-6">
      <div className="space-y-1.5">
        <Label>Greeting Script</Label>
        <Textarea value={greeting} onChange={(event) => setGreeting(event.target.value)} rows={3} />
      </div>
      <div className="space-y-1.5">
        <Label>Persona Tone</Label>
        <Select value={tone} onValueChange={(value) => setTone(value as typeof tone)}>
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
          <div className="text-sm font-medium">Emergency Handling</div>
          <div className="text-xs text-dash-t3">Route urgent calls immediately</div>
        </div>
        <Switch checked={emergency} onCheckedChange={setEmergency} />
      </div>
      <div className="space-y-1.5">
        <Label>Notification Email</Label>
        <Input
          type="email"
          value={notifEmail}
          onChange={(event) => setNotifEmail(event.target.value)}
          placeholder="bookings@yourclinic.com"
        />
      </div>
      <div className="space-y-1.5">
        <Label>Webhook URL</Label>
        <Input
          value={webhookUrl}
          onChange={(event) => setWebhookUrl(event.target.value)}
          placeholder="https://your-server.com/webhook"
        />
      </div>
      <div className="space-y-3">
        <Label>Clinic Hours</Label>
        <div className="space-y-2 rounded-xl border border-dash-border p-3">
          {DAYS.map((day) => {
            const schedule = hours[day] || defaultWorkingHours()[day];
            return (
              <div key={day} className="flex items-center gap-3 rounded-lg border border-dash-border px-3 py-2">
                <Switch checked={schedule.open} onCheckedChange={(checked) => updateHour(day, 'open', checked)} />
                <span className="w-24 text-sm font-medium text-dash-t1">{DAY_LABELS[day]}</span>
                {schedule.open ? (
                  <div className="flex items-center gap-2">
                    <Input type="time" value={schedule.start} onChange={(event) => updateHour(day, 'start', event.target.value)} className="w-32" />
                    <span className="text-xs text-dash-t3">to</span>
                    <Input type="time" value={schedule.end} onChange={(event) => updateHour(day, 'end', event.target.value)} className="w-32" />
                  </div>
                ) : (
                  <span className="text-sm text-dash-t3">Closed</span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Services & Pricing</Label>
          <Button variant="outline" size="sm" onClick={addService}>Add Service</Button>
        </div>
        <div className="space-y-2">
          {services.map((service, index) => (
            <div key={`${service.name}-${index}`} className="grid gap-2 rounded-xl border border-dash-border p-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Switch checked={service.enabled} onCheckedChange={(checked) => updateService(index, 'enabled', checked)} />
                  <span className="text-sm font-medium text-dash-t1">Included In Knowledge Base</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => removeService(index)}>Remove</Button>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-[1fr_140px_120px]">
                <Input
                  value={service.name}
                  onChange={(event) => updateService(index, 'name', event.target.value)}
                  placeholder="Service name"
                />
                <Input
                  type="number"
                  value={service.duration}
                  onChange={(event) => updateService(index, 'duration', Number(event.target.value) || 30)}
                  placeholder="Duration"
                />
                <Input
                  type="number"
                  value={service.price ?? ''}
                  onChange={(event) => updateService(index, 'price', Number(event.target.value) || 0)}
                  placeholder="Price"
                />
              </div>
            </div>
          ))}
        </div>
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
  const publishAgent = usePublishAgent();
  const deleteAgent = useDeleteAgent();
  const [showTestCall, setShowTestCall] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteProgress, setDeleteProgress] = useState(0);
  const prevStatusRef = useRef<string | undefined>(undefined);

  // Fire a toast when the agent transitions from deploying → live
  useEffect(() => {
    const prev = prevStatusRef.current;
    const curr = agent?.status;
    if (prev === 'deploying' && curr === 'live') {
      toast({ title: `${agent?.name} is live!`, description: 'Your agent is ready to take calls.' });
    }
    if (prev === 'deploying' && curr === 'error') {
      toast({ title: 'Deploy failed', description: agent?.deploy_error ?? 'Unknown error', variant: 'destructive' });
    }
    prevStatusRef.current = curr;
  }, [agent?.status, agent?.name, agent?.deploy_error]);

  useEffect(() => {
    if (!deleteAgent.isPending) {
      setDeleteProgress(0);
      return undefined;
    }

    setDeleteProgress(12);
    const timer = window.setInterval(() => {
      setDeleteProgress((current) => {
        if (current >= 90) return current;
        return Math.min(90, current + (current < 40 ? 12 : 7));
      });
    }, 350);

    return () => window.clearInterval(timer);
  }, [deleteAgent.isPending]);

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
        <p className="text-dash-t3">Agent not found</p>
        <Button variant="ghost" className="mt-4" onClick={() => navigate('/agents')}>
          <ArrowLeft className="mr-2 h-4 w-4" />Back to Agents
        </Button>
      </div>
    );
  }

  const color = INDUSTRY_COLORS[agent.clinic?.industry || 'generic'];
  const industryLabel = INDUSTRY_LABELS[agent.clinic?.industry || 'generic'];
  const deleting = deleteAgent.isPending;

  const handleDelete = () => {
    setShowDeleteConfirm(false);
    setDeleteProgress(18);
    deleteAgent.mutate(agent.id, {
      onSuccess: async () => {
        setDeleteProgress(100);
        await new Promise((resolve) => window.setTimeout(resolve, 450));
        navigate('/agents');
      },
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <Button variant="ghost" size="sm" className="mb-3 -ml-2" onClick={() => navigate('/agents')}>
          <ArrowLeft className="mr-1 h-4 w-4" />Agents
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
                <h1 className="text-xl font-extrabold text-dash-t1">{agent.name}</h1>
                <Badge variant="outline" style={{ color, borderColor: `${color}40` }}>{industryLabel}</Badge>
              </div>
              <div className="mt-0.5 flex items-center gap-3">
                <StatusBadge status={agent.status} />
                {agent.phone_number && (
                  <span className="font-mono text-sm text-dash-t3">{agent.phone_number.phone_number}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {agent.status === 'deploying' ? (
              <div className="flex items-center gap-2 text-sm text-dash-t2">
                <Loader2 className="h-4 w-4 animate-spin text-dash-blue" />
                <span>Deploying…</span>
                {(agent.deploy_progress ?? 0) > 0 && (
                  <span className="text-xs text-dash-t3">{agent.deploy_progress}%</span>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-sm text-dash-t3">{agent.status === 'live' ? 'Live' : 'Paused'}</span>
                <Switch
                  checked={agent.status === 'live'}
                  onCheckedChange={() => toggleStatus.mutate({
                    id: agent.id,
                    status: agent.status === 'live' ? 'paused' : 'live',
                  })}
                  disabled={deleting || !['live', 'paused'].includes(agent.status)}
                />
              </div>
            )}
            {agent.status === 'live' && (
              <Button variant="outline" size="sm" onClick={() => setShowTestCall(true)} disabled={deleting}>
                <Phone className="mr-2 h-4 w-4" />Test Call
              </Button>
            )}
            {agent.status === 'error' && (
              <Button variant="outline" size="sm" onClick={() => publishAgent.mutate(agent.id)} disabled={deleting || publishAgent.isPending}>
                {publishAgent.isPending ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Retry Deploy
              </Button>
            )}
            <Button variant="outline" size="sm" asChild>
              <Link to={`/knowledge/${agent.clinic_id}`} onClick={(event) => deleting && event.preventDefault()}>
                <BookOpen className="mr-2 h-4 w-4" />Knowledge
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link to={`/calls?agent=${agent.id}`} onClick={(event) => deleting && event.preventDefault()}>
                <PhoneCall className="mr-2 h-4 w-4" />Calls
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={() => setShowDeleteConfirm(true)}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Delete
            </Button>
          </div>
        </div>
      </div>

      {/* Deploy progress banner */}
      {agent.status === 'deploying' && (
        <div className="rounded-xl border border-dash-blue-b bg-dash-blue-bg px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-dash-blue flex items-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" />
              Setting up your agent on the server…
            </span>
            <span className="text-xs text-dash-t3">{agent.deploy_progress ?? 0}%</span>
          </div>
          <Progress value={agent.deploy_progress ?? 5} className="h-1.5" />
          <p className="text-xs text-dash-t3 mt-2">
            This takes 2–3 minutes. You'll get a notification when it's live. Feel free to leave this page.
          </p>
        </div>
      )}

      {deleting && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm font-medium text-red-700">
              <Loader2 className="h-4 w-4 animate-spin" />
              Removing agent and releasing server resources...
            </span>
            <span className="text-xs text-red-500">{deleteProgress}%</span>
          </div>
          <Progress value={deleteProgress} className="h-1.5" />
          <p className="mt-2 text-xs text-red-600">
            This can take a little while if the server, phone number, or SIP resources still need cleanup.
          </p>
        </div>
      )}

      {/* Error banner */}
      {agent.status === 'error' && agent.deploy_error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3">
          <p className="text-sm font-medium text-red-700">Deploy failed</p>
          <p className="text-xs text-red-600 mt-1 font-mono">{agent.deploy_error}</p>
        </div>
      )}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="calls">Calls</TabsTrigger>
          <TabsTrigger value="knowledge">Knowledge</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <OverviewTab agent={agent} />
        </TabsContent>

        <TabsContent value="calls" className="mt-4">
          <Card>
            <CardContent className="p-6">
              <p className="mb-4 text-sm text-dash-t3">All calls for {agent.name}</p>
              <Button asChild variant="outline">
                <Link to={`/calls?agent=${agent.id}`}>
                  <ExternalLink className="mr-2 h-4 w-4" />View Full Call Log
                </Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="knowledge" className="mt-4">
          <Card>
            <CardContent className="p-6">
              <p className="mb-4 text-sm text-dash-t3">Manage FAQ articles for {agent.name}</p>
              <Button asChild>
                <Link to={`/knowledge/${agent.clinic_id}`}>
                  <BookOpen className="mr-2 h-4 w-4" />Open Knowledge Base
                </Link>
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="mt-4">
          <SettingsTab agent={agent} />
        </TabsContent>
      </Tabs>

      <TestCallModal
        agentId={agent.id}
        agentName={agent.name}
        isOpen={showTestCall}
        onClose={() => setShowTestCall(false)}
      />

      <Dialog open={showDeleteConfirm} onOpenChange={(open) => !deleting && setShowDeleteConfirm(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Agent</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-dash-t3">
            Delete <span className="font-medium text-dash-t1">{agent.name}</span>? This will also tear down its server and telephony resources.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)} disabled={deleting}>Cancel</Button>
            <Button className="bg-red-600 text-white hover:bg-red-700" onClick={handleDelete} disabled={deleting}>
              {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Delete Agent
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
