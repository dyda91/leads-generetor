import type { LucideIcon } from 'lucide-react';
import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';

import { cn } from '../../lib/cn';

export interface EmptyStateProps extends HTMLAttributes<HTMLDivElement> {
  icon?: LucideIcon;
  title: string;
  description?: string;
}

export const EmptyState = forwardRef<HTMLDivElement, EmptyStateProps>(
  ({ icon: Icon, title, description, className, children, ...props }, ref) => (
    <div
      ref={ref}
      className={cn('flex flex-col items-center gap-2 p-8 text-center', className)}
      {...props}
    >
      {Icon !== undefined && (
        <div className="mb-1 flex size-12 items-center justify-center rounded-full bg-surface-muted">
          <Icon aria-hidden="true" className="size-6 text-muted-foreground" />
        </div>
      )}
      <p className="text-base font-semibold">{title}</p>
      {description !== undefined && (
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      )}
      {children !== undefined && <div className="mt-2">{children}</div>}
    </div>
  ),
);
EmptyState.displayName = 'EmptyState';
