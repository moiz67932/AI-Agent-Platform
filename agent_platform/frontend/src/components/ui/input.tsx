import * as React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      className={cn(
        'flex h-9 w-full rounded-lg border border-dash-border bg-dash-bg px-3 py-1 text-sm text-dash-t1 shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-dash-t1 placeholder:text-dash-t3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-dash-blue disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      ref={ref}
      {...props}
    />
  )
);
Input.displayName = 'Input';

export { Input };
