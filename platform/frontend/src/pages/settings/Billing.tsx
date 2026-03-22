import { Link } from 'react-router-dom';
import { CreditCard, TrendingUp, Download, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';

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

const plans = [
  {
    name: 'Starter',
    price: 299,
    calls: 500,
    agents: 1,
    features: ['1 agent', '500 calls/month', 'Basic analytics', 'Email support'],
  },
  {
    name: 'Growth',
    price: 599,
    calls: 2000,
    agents: 3,
    features: ['3 agents', '2,000 calls/month', 'Full analytics', 'API access', 'Priority support'],
  },
  {
    name: 'Enterprise',
    price: null,
    calls: null,
    agents: null,
    features: ['Unlimited agents', 'Unlimited calls', 'White-label', 'Dedicated support', 'SLA guarantee'],
  },
];

export default function BillingSettings() {
  const currentPlan = 'Growth';
  const callsUsed = 847;
  const callsLimit = 2000;
  const nextRenewal = new Date(Date.now() + 18 * 24 * 60 * 60000).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

  const invoices = [
    { id: 'inv_001', date: 'Dec 1, 2025', amount: '$599.00', status: 'Paid' },
    { id: 'inv_002', date: 'Nov 1, 2025', amount: '$599.00', status: 'Paid' },
    { id: 'inv_003', date: 'Oct 1, 2025', amount: '$299.00', status: 'Paid' },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <div className="flex gap-8">
        <SettingsSidebar />
        <div className="flex-1 space-y-6 max-w-2xl">
          {/* Current Plan */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">{currentPlan} Plan</CardTitle>
                  <CardDescription>$599/month · Renews {nextRenewal}</CardDescription>
                </div>
                <Badge>Current Plan</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Calls this month</span>
                  <span className="font-mono">{callsUsed} / {callsLimit}</span>
                </div>
                <Progress value={(callsUsed / callsLimit) * 100} />
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Agents</span>
                  <span className="font-mono">1 / 3</span>
                </div>
                <Progress value={33} />
              </div>
              <Button variant="outline">Upgrade Plan</Button>
            </CardContent>
          </Card>

          {/* Plan Comparison */}
          <div>
            <h3 className="font-semibold mb-3">Available Plans</h3>
            <div className="grid gap-3 sm:grid-cols-3">
              {plans.map((plan) => (
                <Card
                  key={plan.name}
                  className={plan.name === currentPlan ? 'border-primary/50' : ''}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold">{plan.name}</span>
                      {plan.name === currentPlan && <Badge>Current</Badge>}
                    </div>
                    <div className="text-2xl font-bold font-mono mb-3">
                      {plan.price ? `$${plan.price}` : 'Custom'}
                      {plan.price && <span className="text-sm font-normal text-muted-foreground">/mo</span>}
                    </div>
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-center gap-1.5">
                          <CheckCircle2 className="h-3 w-3 text-emerald-500" />{f}
                        </li>
                      ))}
                    </ul>
                    {plan.name !== currentPlan && (
                      <Button size="sm" className="w-full mt-3" variant={plan.name === 'Growth' ? 'default' : 'outline'}>
                        {plan.price ? 'Upgrade' : 'Contact Sales'}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>

          {/* Payment Method */}
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><CreditCard className="h-4 w-4" />Payment Method</CardTitle></CardHeader>
            <CardContent className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="rounded bg-muted px-2 py-1 text-xs font-mono font-bold">VISA</div>
                <span className="text-sm">•••• •••• •••• 4242</span>
                <span className="text-xs text-muted-foreground">Expires 12/26</span>
              </div>
              <Button variant="outline" size="sm">Update</Button>
            </CardContent>
          </Card>

          {/* Invoice History */}
          <Card>
            <CardHeader><CardTitle className="text-base">Invoice History</CardTitle></CardHeader>
            <CardContent>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-xs text-muted-foreground">
                    <th className="pb-2 text-left">Date</th>
                    <th className="pb-2 text-left">Amount</th>
                    <th className="pb-2 text-left">Status</th>
                    <th className="pb-2 text-right">Invoice</th>
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => (
                    <tr key={inv.id} className="border-b border-border">
                      <td className="py-2.5">{inv.date}</td>
                      <td className="py-2.5 font-mono">{inv.amount}</td>
                      <td className="py-2.5"><Badge variant="success">{inv.status}</Badge></td>
                      <td className="py-2.5 text-right">
                        <Button variant="ghost" size="icon" className="h-7 w-7">
                          <Download className="h-3 w-3" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
