import { Badge } from './badge';

const outcomeConfig = {
  booked: { label: 'Booked', variant: 'success' as const },
  info_only: { label: 'Info Only', variant: 'secondary' as const },
  missed: { label: 'Missed', variant: 'destructive' as const },
  transferred: { label: 'Transferred', variant: 'info' as const },
  voicemail: { label: 'Voicemail', variant: 'warning' as const },
  error: { label: 'Error', variant: 'destructive' as const },
};

interface OutcomeBadgeProps {
  outcome: keyof typeof outcomeConfig;
}

export function OutcomeBadge({ outcome }: OutcomeBadgeProps) {
  const config = outcomeConfig[outcome] || outcomeConfig.error;
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
