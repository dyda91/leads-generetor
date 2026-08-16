import { AlertOctagon } from 'lucide-react';
import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';

import { Button } from '../ui/button';
import { cn } from '../../lib/cn';

export interface ErrorStateProps extends HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  onRetry?: () => void;
  retryLabel?: string;
}

export const ErrorState = forwardRef<HTMLDivElement, ErrorStateProps>(
  ({ title, description, onRetry, retryLabel = 'Tentar novamente', className, ...props }, ref) => (
    <div
      ref={ref}
      role="alert"
      className={cn('flex flex-col items-center gap-2 p-8 text-center', className)}
      {...props}
    >
      <AlertOctagon aria-hidden="true" className="size-8 text-destructive" />
      <p className="font-semibold">{title}</p>
      {description !== undefined && (
        <p className="max-w-md text-sm text-muted-foreground">{description}</p>
      )}
      {onRetry !== undefined && (
        <Button type="button" onClick={onRetry} className="mt-2">
          {retryLabel}
        </Button>
      )}
    </div>
  ),
);
ErrorState.displayName = 'ErrorState';
