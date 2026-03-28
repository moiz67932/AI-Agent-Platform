import { useState } from 'react';
import { Key, Copy, RefreshCw, Check, AlertTriangle } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import { SettingsSidebar } from './Account';
import { cn } from '@/lib/utils';

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({ title: 'Copied to clipboard' });
  };
  return (
    <button onClick={copy} className="p-1.5 rounded-md text-dash-t3 hover:bg-dash-surface hover:text-dash-t1 transition-colors">
      {copied ? <Check className="h-3.5 w-3.5 text-dash-green" /> : <Copy className="h-3.5 w-3.5" />}
    </button>
  );
}

export default function ApiKeysSettings() {
  const [showKey, setShowKey] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);
  const apiKey = 'va_live_sk_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6';
  const maskedKey = 'va_live_sk_••••••••••••••••••••••••••••••';

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-extrabold text-dash-t1">Settings</h1>
      <div className="flex gap-6">
        <SettingsSidebar />
        <div className="flex-1 space-y-5 max-w-2xl">
          {/* API Key */}
          <div className="rounded-xl border border-dash-border bg-dash-card p-6">
            <h3 className="text-sm font-bold text-dash-t1 flex items-center gap-2 mb-4"><Key className="h-4 w-4" /> Platform API key</h3>
            <div className="flex items-center gap-2 bg-dash-bg border border-dash-border rounded-lg px-3 py-2.5">
              <code className="flex-1 text-xs font-mono text-dash-t2">{showKey ? apiKey : maskedKey}</code>
              <button
                onClick={() => setShowKey(!showKey)}
                className="text-[10px] font-semibold text-dash-blue hover:underline"
              >{showKey ? 'Hide' : 'Reveal'}</button>
              <CopyButton value={apiKey} />
            </div>
            <div className="flex items-center gap-3 mt-4">
              <button
                onClick={() => setConfirmRotate(true)}
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-dash-t2 border border-dash-border bg-dash-card px-3 py-1.5 rounded-lg hover:border-dash-blue transition-colors"
              >
                <RefreshCw className="h-3.5 w-3.5" /> Generate new key
              </button>
            </div>
            <div className="flex items-start gap-2 mt-3 p-3 bg-dash-amber-bg border border-dash-amber-b rounded-lg">
              <AlertTriangle className="h-4 w-4 text-dash-amber shrink-0 mt-0.5" />
              <p className="text-xs text-dash-amber">Rotating your key will break existing integrations. Make sure to update all API consumers.</p>
            </div>
          </div>

          {/* Usage examples */}
          <div className="rounded-xl border border-dash-border bg-dash-card p-6">
            <h3 className="text-sm font-bold text-dash-t1 mb-4">Quick start</h3>
            <div className="space-y-3">
              <div>
                <span className="text-label uppercase text-dash-t3 tracking-widest">cURL</span>
                <pre className="mt-1 bg-dash-t1 text-green-400 text-[11px] font-mono p-3 rounded-lg overflow-x-auto">
{`curl -X GET "https://api.foyer.app/v1/agents" \\
  -H "Authorization: Bearer ${maskedKey}" \\
  -H "Content-Type: application/json"`}
                </pre>
              </div>
              <div>
                <span className="text-label uppercase text-dash-t3 tracking-widest">Node.js</span>
                <pre className="mt-1 bg-dash-t1 text-green-400 text-[11px] font-mono p-3 rounded-lg overflow-x-auto">
{`import Foyer from '@foyer/sdk';

const foyer = new Foyer('${maskedKey}');
const agents = await foyer.agents.list();`}
                </pre>
              </div>
            </div>
          </div>
        </div>
      </div>

      <Dialog open={confirmRotate} onOpenChange={setConfirmRotate}>
        <DialogContent className="bg-dash-card border-dash-border">
          <DialogHeader>
            <DialogTitle className="text-dash-t1">Rotate API Key</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-dash-t2">This will invalidate your current key. All integrations using the old key will stop working immediately.</p>
          <DialogFooter>
            <button onClick={() => setConfirmRotate(false)} className="text-xs font-semibold px-4 py-2 rounded-lg border border-dash-border text-dash-t2">Cancel</button>
            <button onClick={() => { setConfirmRotate(false); toast({ title: 'New API key generated' }); }} className="text-xs font-semibold px-4 py-2 rounded-lg bg-dash-blue text-white hover:opacity-90 transition-opacity">Rotate Key</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
