import { Check } from 'lucide-react';
import { SettingsSidebar } from './Account';
import { cn } from '@/lib/utils';

const INVOICES = [
  { month: 'March 2026', amount: '$79.00', status: 'Paid' },
  { month: 'February 2026', amount: '$79.00', status: 'Paid' },
  { month: 'January 2026', amount: '$79.00', status: 'Paid' },
];

export default function BillingSettings() {
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-extrabold text-dash-t1">Settings</h1>
      <div className="flex gap-6">
        <SettingsSidebar />
        <div className="flex-1 space-y-5 max-w-2xl">
          {/* Current plan */}
          <div className="rounded-xl border border-dash-border bg-dash-card p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-sm font-bold text-dash-t1">Current plan</h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-2xl font-extrabold text-dash-t1">Pro</span>
                  <span className="text-sm text-dash-t2">$79/month</span>
                </div>
              </div>
              <span className="text-[10px] font-semibold text-dash-blue bg-dash-blue-bg border border-dash-blue-b px-2 py-0.5 rounded-full">Active</span>
            </div>
            <div className="space-y-2 text-sm text-dash-t2">
              <p>5 agents included (3 active)</p>
              <p>Renews: May 1, 2026</p>
            </div>
            <div className="flex gap-2 mt-4">
              <button className="text-xs font-semibold px-4 py-2 rounded-lg bg-dash-blue text-white hover:opacity-90 transition-opacity">Upgrade to Scale</button>
              <button className="text-xs font-semibold px-4 py-2 rounded-lg border border-dash-border text-dash-t2 hover:text-dash-t1 transition-colors">Cancel plan</button>
            </div>
          </div>

          {/* Usage */}
          <div className="rounded-xl border border-dash-border bg-dash-card p-6">
            <h3 className="text-sm font-bold text-dash-t1 mb-4">Usage this month</h3>
            <div className="space-y-4">
              {[
                { label: 'Calls', value: '1,247', max: 'unlimited', pct: 45 },
                { label: 'Agents', value: '3', max: '5', pct: 60 },
                { label: 'API calls', value: '8,432', max: 'unlimited', pct: 30 },
              ].map(u => (
                <div key={u.label}>
                  <div className="flex justify-between mb-1">
                    <span className="text-xs font-medium text-dash-t1">{u.label}</span>
                    <span className="text-xs text-dash-t3">{u.value} / {u.max}</span>
                  </div>
                  <div className="w-full h-1.5 bg-dash-border rounded-full overflow-hidden">
                    <div className="h-full bg-dash-blue rounded-full" style={{ width: `${u.pct}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Invoice history */}
          <div className="rounded-xl border border-dash-border bg-dash-card overflow-hidden">
            <div className="px-6 py-4 border-b border-dash-border">
              <h3 className="text-sm font-bold text-dash-t1">Invoice history</h3>
            </div>
            <div>
              {INVOICES.map(inv => (
                <div key={inv.month} className="flex items-center justify-between px-6 py-3 border-b border-dash-border last:border-0">
                  <span className="text-sm text-dash-t1">{inv.month}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-mono font-bold text-dash-t1">{inv.amount}</span>
                    <span className="text-[10px] font-semibold text-dash-green bg-dash-green-bg border border-dash-green-b px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Check className="h-3 w-3" /> {inv.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
