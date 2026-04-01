import { Badge } from './badge';

const statusConfig = {
  live: { label: 'Live', variant: 'success' as const },
  paused: { label: 'Paused', variant: 'warning' as const },
  draft: { label: 'Draft', variant: 'secondary' as const },
  offline: { label: 'Offline', variant: 'secondary' as const },
  active: { label: 'Active', variant: 'success' as const },
  inactive: { label: 'Inactive', variant: 'secondary' as const },
  error: { label: 'Deploy Failed', variant: 'destructive' as const },
  deploying: { label: 'Deploying…', variant: 'warning' as const },
};

interface StatusBadgeProps {
  status: keyof typeof statusConfig;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const config = statusConfig[status] || statusConfig.draft;
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
