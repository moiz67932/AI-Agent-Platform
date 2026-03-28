import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-dash-blue focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-dash-blue-b bg-dash-blue-bg text-dash-blue',
        secondary: 'border-dash-border bg-dash-surface text-dash-t3',
        destructive: 'border-red-200 bg-red-50 text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400',
        outline: 'text-dash-t1 border-dash-border',
        success: 'border-dash-green-b bg-dash-green-bg text-dash-green',
        warning: 'border-dash-amber-b bg-dash-amber-bg text-dash-amber',
        info: 'border-dash-blue-b bg-dash-blue-bg text-dash-blue',
      },
    },
    defaultVariants: { variant: 'default' },
  }
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
