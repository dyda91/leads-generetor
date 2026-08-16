import { clsx } from 'clsx';
import type { ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merges conditional class names with Tailwind conflict resolution.
 * Pure string merging — no dynamic execution, no eval.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
