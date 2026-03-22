import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Key, Copy, RefreshCw, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';

function SettingsSidebar() {
  const links = [
    { to: '/settings', label: 'Account' },
    { to: '/settings/team', label: 'Team' },
    { to: '/settings/billing', label: 'Billing' },
    { to: '/settings/api', label: 'API Keys' },
  ];
  return (
    <nav className="w-44 shrink-0 space-y-1">
      {links.map((l) => (
        <Link key={l.to} to={l.to} className="block rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-accent hover:text-foreground transition-colors">
          {l.label}
        </Link>
      ))}
    </nav>
  );
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: 'Copied to clipboard' });
  };
  return (
    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={copy}>
      {copied ? <Check className="h-3 w-3 text-emerald-500" /> : <Copy className="h-3 w-3" />}
    </Button>
  );
}

const CODE_EXAMPLES = {
  curl: `curl -X GET "https://api.voiceai.com/v1/agents" \\
  -H "Authorization: Bearer va_live_••••••••••••••••" \\
  -H "Content-Type: application/json"`,
  node: `import VoiceAI from '@voiceai/sdk';

const client = new VoiceAI({
  apiKey: process.env.VOICEAI_API_KEY,
});

const agents = await client.agents.list();
console.log(agents);`,
  python: `import voiceai

client = voiceai.VoiceAI(
    api_key="va_live_••••••••••••••••",
)

agents = client.agents.list()
print(agents)`,
};

export default function ApiKeysSettings() {
  const [showRegenerate, setShowRegenerate] = useState(false);
  const [selectedLang, setSelectedLang] = useState<'curl' | 'node' | 'python'>('curl');
  const apiKey = 'va_live_' + 'x'.repeat(24);
  const webhookSecret = 'whsec_' + 'x'.repeat(32);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <div className="flex gap-8">
        <SettingsSidebar />
        <div className="flex-1 space-y-6 max-w-2xl">
          {/* API Key */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Key className="h-4 w-4" />API Key</CardTitle>
              <CardDescription>Use this key to authenticate API requests from your server</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center gap-2">
                <Input
                  value={apiKey}
                  readOnly
                  className="font-mono text-xs"
                  type="password"
                />
                <CopyButton value={apiKey} />
              </div>
              <div className="flex items-center justify-between text-sm">
                <div>
                  <span className="text-muted-foreground">Usage this month: </span>
                  <span className="font-mono">1,247 requests</span>
                </div>
                <Button variant="outline" size="sm" onClick={() => setShowRegenerate(true)}>
                  <RefreshCw className="h-3 w-3 mr-2" />Regenerate
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Webhook Secret */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Webhook Secret</CardTitle>
              <CardDescription>Used to verify webhook payloads from VoiceAI</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Input value={webhookSecret} readOnly className="font-mono text-xs" type="password" />
                <CopyButton value={webhookSecret} />
              </div>
            </CardContent>
          </Card>

          {/* Code Examples */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Code Examples</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                {(['curl', 'node', 'python'] as const).map((lang) => (
                  <Button
                    key={lang}
                    variant={selectedLang === lang ? 'secondary' : 'ghost'}
                    size="sm"
                    onClick={() => setSelectedLang(lang)}
                    className="capitalize"
                  >
                    {lang === 'node' ? 'Node.js' : lang}
                  </Button>
                ))}
              </div>
              <div className="relative">
                <pre className="rounded-lg bg-muted p-4 text-xs font-mono overflow-x-auto">
                  <code>{CODE_EXAMPLES[selectedLang]}</code>
                </pre>
                <CopyButton value={CODE_EXAMPLES[selectedLang]} />
              </div>
            </CardContent>
          </Card>

          {/* API Docs link */}
          <Card>
            <CardContent className="p-4 flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">API Documentation</div>
                <div className="text-xs text-muted-foreground">Full reference for all endpoints</div>
              </div>
              <Button variant="outline" size="sm">View Docs</Button>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={showRegenerate} onOpenChange={setShowRegenerate}>
        <DialogContent>
          <DialogHeader><DialogTitle>Regenerate API Key</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will invalidate your current API key immediately. All integrations using the old key will stop working.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRegenerate(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => {
              toast({ title: 'API key regenerated' });
              setShowRegenerate(false);
            }}>
              Regenerate Key
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
