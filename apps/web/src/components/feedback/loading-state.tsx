import { LoaderCircle } from 'lucide-react';
import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';

import { Skeleton } from '../ui/skeleton';
import { cn } from '../../lib/cn';

export interface LoadingStateProps extends HTMLAttributes<HTMLDivElement> {
  label?: string;
}

export const LoadingState = forwardRef<HTMLDivElement, LoadingStateProps>(
  ({ label = 'Carregando…', className, ...props }, ref) => (
    <div ref={ref} role="status" className={cn('flex flex-col gap-3 p-6', className)} {...props}>
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />
        <span>{label}</span>
      </div>
      <div className="grid gap-3" aria-hidden="true">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  ),
);
LoadingState.displayName = 'LoadingState';
