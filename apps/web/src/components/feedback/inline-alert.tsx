import { AlertCircle, AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';

import { cn } from '../../lib/cn';

type AlertVariant = 'info' | 'success' | 'warning' | 'error';

const iconByVariant = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  error: AlertCircle,
} as const;

const containerByVariant = {
  info: 'border-primary/25 bg-surface-info text-foreground [&_svg]:text-primary',
  success: 'border-success/25 bg-surface-success text-foreground [&_svg]:text-success',
  warning: 'border-warning/25 bg-surface-warning text-foreground [&_svg]:text-warning',
  error: 'border-destructive/25 bg-surface-error text-foreground [&_svg]:text-destructive',
} as const;

export interface InlineAlertProps extends HTMLAttributes<HTMLDivElement> {
  variant?: AlertVariant;
  title?: string;
  /** Defaults to `alert` for errors, `status` otherwise. */
  role?: 'alert' | 'status';
}

export const InlineAlert = forwardRef<HTMLDivElement, InlineAlertProps>(
  ({ variant = 'info', title, role, className, children, ...props }, ref) => {
    const Icon = iconByVariant[variant];
    return (
      <div
        ref={ref}
        role={role ?? (variant === 'error' ? 'alert' : 'status')}
        className={cn(
          'flex items-start gap-3 rounded-md border p-3 text-sm',
          containerByVariant[variant],
          className,
        )}
        {...props}
      >
        <Icon aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0">
          {title !== undefined && <p className="font-medium">{title}</p>}
          <div className={cn(title !== undefined && 'mt-1')}>{children}</div>
        </div>
      </div>
    );
  },
);
InlineAlert.displayName = 'InlineAlert';
