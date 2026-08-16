import { forwardRef } from 'react';
import type { HTMLAttributes } from 'react';

import { cn } from '../../lib/cn';

/**
 * Decorative loading placeholder. `aria-hidden` so screen readers are never
 * told about fake content; the pulse animation is disabled under
 * `prefers-reduced-motion` in globals.css.
 */
export const Skeleton = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div
      ref={ref}
      aria-hidden="true"
      className={cn('animate-pulse rounded-md bg-surface-muted', className)}
      {...props}
    />
  ),
);
Skeleton.displayName = 'Skeleton';
