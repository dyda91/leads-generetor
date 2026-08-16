import * as LabelPrimitive from '@radix-ui/react-label';
import { forwardRef } from 'react';
import type { ComponentPropsWithoutRef, ElementRef } from 'react';

import { cn } from '../../lib/cn';

export interface LabelProps extends ComponentPropsWithoutRef<typeof LabelPrimitive.Root> {
  disabled?: boolean;
}

export const Label = forwardRef<ElementRef<typeof LabelPrimitive.Root>, LabelProps>(
  ({ className, disabled = false, ...props }, ref) => (
    <LabelPrimitive.Root
      ref={ref}
      className={cn('text-sm font-medium text-foreground', disabled && 'opacity-50', className)}
      {...(disabled ? { 'data-disabled': '' } : {})}
      {...props}
    />
  ),
);
Label.displayName = 'Label';
