import { LayoutGrid } from 'lucide-react';

/**
 * Text logo of the application. Non-interactive; identity and role of the
 * current user are deliberately NOT rendered here.
 */
export function Brand() {
  return (
    <div className="flex items-center gap-2 text-primary">
      <LayoutGrid aria-hidden="true" className="size-6 shrink-0" />
      <span className="text-base font-semibold tracking-tight">Leads</span>
    </div>
  );
}
