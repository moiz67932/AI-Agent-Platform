import { type LucideIcon } from 'lucide-react';
import { Button } from './button';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon: Icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="mb-4 rounded-full bg-dash-surface p-4">
        <Icon className="h-8 w-8 text-dash-t3" />
      </div>
      <h3 className="mb-1 text-lg font-semibold text-dash-t1">{title}</h3>
      <p className="mb-6 max-w-sm text-sm text-dash-t2">{description}</p>
      {actionLabel && onAction && (
        <Button onClick={onAction}>{actionLabel}</Button>
      )}
    </div>
  );
}
