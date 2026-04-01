import { useState } from 'react';
import { CheckCircle2, XCircle, ExternalLink, Settings, Webhook, Database, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { api } from '@/lib/api';

interface Integration {
  id: string;
  name: string;
  description: string;
  status: 'connected' | 'disconnected' | 'core';
  icon: React.ReactNode;
}

const INTEGRATIONS: Integration[] = [
  {
    id: 'twilio',
    name: 'Twilio',
    description: 'Phone number provisioning and SIP Trunk infrastructure',
    status: 'connected',
    icon: <Phone className="h-5 w-5" />,
  },
  {
    id: 'webhooks',
    name: 'Webhooks',
    description: 'POST to any URL on booking events',
    status: 'disconnected',
    icon: <Webhook className="h-5 w-5" />,
  },
  {
    id: 'supabase',
    name: 'Supabase',
    description: 'Core database — always connected',
    status: 'core',
    icon: <Database className="h-5 w-5" />,
  },
];

const COMING_SOON = [
  'Google Calendar', 'Calendly', 'Zapier', 'Slack', 'HubSpot CRM', 'Stripe', 'Outlook', 'Salesforce',
];

function TwilioConfig({ onClose }: { onClose: () => void }) {
  const [accountSid, setAccountSid] = useState('');
  const [authToken, setAuthToken] = useState('');
  const [testing, setTesting] = useState(false);

  const test = async () => {
    if (!accountSid || !authToken) return;
    setTesting(true);
    try {
      await api.post('/api/integrations/twilio/test', {
        account_sid: accountSid,
        auth_token: authToken,
      });
      toast({ title: 'Twilio connection successful' });
    } catch {
      toast({ title: 'Twilio connection failed', variant: 'destructive' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Configure Twilio</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Account SID</Label>
            <Input
              value={accountSid}
              onChange={(e) => setAccountSid(e.target.value)}
              placeholder="ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Auth Token</Label>
            <Input
              type="password"
              value={authToken}
              onChange={(e) => setAuthToken(e.target.value)}
              placeholder="your_auth_token"
            />
          </div>
          <div className="rounded-lg border border-dash-border bg-dash-surface p-3 text-xs text-dash-t3">
            Find your credentials in the{' '}
            <a
              href="https://console.twilio.com"
              target="_blank"
              rel="noreferrer"
              className="text-dash-blue hover:underline inline-flex items-center gap-0.5"
            >
              Twilio console <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={test} disabled={testing || !accountSid || !authToken}>
            {testing ? 'Testing...' : 'Test Connection'}
          </Button>
          <Button onClick={onClose}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function WebhookConfig({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState({
    'appointment.created': true,
    'call.completed': true,
    'appointment.cancelled': false,
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader><DialogTitle>Configure Webhooks</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Endpoint URL</Label>
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://your-server.com/webhook"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Secret Key</Label>
            <Input type="password" placeholder="whsec_..." />
          </div>
          <div>
            <Label className="mb-2 block">Events</Label>
            <div className="space-y-2">
              {Object.entries(events).map(([event, enabled]) => (
                <div key={event} className="flex items-center justify-between">
                  <span className="text-sm font-mono text-dash-t3">{event}</span>
                  <Switch
                    checked={enabled}
                    onCheckedChange={(v) => setEvents(ev => ({ ...ev, [event]: v }))}
                  />
                </div>
              ))}
            </div>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => toast({ title: 'Test payload sent' })}
            disabled={!url}
          >
            Test Webhook
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={onClose}>Save Webhook</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Integrations() {
  const [configuring, setConfiguring] = useState<string | null>(null);
  const webhookLogs: { id: string; event: string; url: string; status_code: number; response_time_ms: number; created_at: string }[] = [];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-extrabold text-dash-t1">Integrations</h1>

      {/* Active Integrations */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {INTEGRATIONS.map((integration) => (
          <Card key={integration.id}>
            <CardContent className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2">
                  <div className="rounded-lg bg-dash-blue-bg p-2 text-dash-blue">
                    {integration.icon}
                  </div>
                  <div>
                    <div className="font-semibold text-sm text-dash-t1">{integration.name}</div>
                  </div>
                </div>
                {integration.status === 'core' ? (
                  <Badge variant="secondary">Core</Badge>
                ) : integration.status === 'connected' ? (
                  <div className="flex items-center gap-1 text-emerald-500 text-xs">
                    <CheckCircle2 className="h-3 w-3" />Connected
                  </div>
                ) : (
                  <div className="flex items-center gap-1 text-dash-t3 text-xs">
                    <XCircle className="h-3 w-3" />Not connected
                  </div>
                )}
              </div>
              <p className="text-xs text-dash-t3 mb-3">{integration.description}</p>
              {integration.status !== 'core' && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setConfiguring(integration.id)}
                >
                  <Settings className="h-3 w-3 mr-2" />Configure
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Separator />

      {/* Coming Soon */}
      <div>
        <h2 className="text-sm font-bold text-dash-t1 mb-3">Coming Soon</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {COMING_SOON.map((name) => (
            <Card key={name} className="opacity-60">
              <CardContent className="p-4 flex items-center justify-between">
                <span className="text-sm font-medium text-dash-t1">{name}</span>
                <Button variant="ghost" size="sm" className="text-xs">Notify Me</Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <Separator />

      {/* Webhook Logs */}
      <div>
        <h2 className="text-sm font-bold text-dash-t1 mb-3">Recent Webhook Deliveries</h2>
        <Card>
          {webhookLogs.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <p className="text-sm font-medium text-dash-t2">No webhook deliveries yet</p>
              <p className="text-xs text-dash-t3 mt-1">Configure a webhook endpoint above to start receiving events</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-dash-border">
                    {['Time', 'Event', 'URL', 'Status', 'Response Time'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs text-dash-t3 font-medium">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {webhookLogs.map((log) => (
                    <tr key={log.id} className="border-b border-dash-border hover:bg-dash-surface">
                      <td className="px-4 py-3 text-xs text-dash-t3">
                        {new Date(log.created_at).toLocaleTimeString()}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{log.event}</td>
                      <td className="px-4 py-3 text-xs text-dash-t3 truncate max-w-48">{log.url}</td>
                      <td className="px-4 py-3">
                        <Badge variant={log.status_code === 200 ? 'success' : 'destructive'}>
                          {log.status_code}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs">{log.response_time_ms}ms</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {configuring === 'twilio' && <TwilioConfig onClose={() => setConfiguring(null)} />}
      {configuring === 'webhooks' && <WebhookConfig onClose={() => setConfiguring(null)} />}
    </div>
  );
}
