import * as React from 'react';
import { cn } from '@/lib/utils';

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => (
    <textarea
      className={cn(
        'flex min-h-[60px] w-full rounded-lg border border-dash-border bg-dash-bg px-3 py-2 text-sm text-dash-t1 shadow-sm placeholder:text-dash-t3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-dash-blue disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Textarea.displayName = 'Textarea';

export { Textarea };
