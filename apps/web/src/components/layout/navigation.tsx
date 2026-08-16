import { LayoutGrid, Shield } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { NavLink } from 'react-router';

import { cn } from '../../lib/cn';

/**
 * Navigation for the authenticated shell. Only routes that already exist are
 * listed — there are intentionally NO links to future, non-existent resources
 * (search, leads, lists, export). NavLink renders the internal SPA href and
 * sets `aria-current="page"` on the active item.
 */
export interface NavItem {
  label: string;
  to: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: readonly NavItem[] = [
  { label: 'Dashboard', to: '/', icon: LayoutGrid },
  { label: 'Segurança', to: '/settings/security', icon: Shield },
];

export interface NavListProps {
  /** Called right before a navigation happens (e.g. to close the mobile drawer). */
  onNavigate?: () => void;
}

const navLinkClassName = ({ isActive }: { isActive: boolean }): string =>
  cn(
    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    isActive ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-surface-muted',
  );

/** The list of navigation links, shared by the desktop sidebar and the mobile drawer. */
export function NavList({ onNavigate }: NavListProps) {
  return (
    <ul className="space-y-1">
      {NAV_ITEMS.map((item) => (
        <li key={item.to}>
          <NavLink
            to={item.to}
            end={item.to === '/'}
            onClick={onNavigate}
            className={navLinkClassName}
          >
            <item.icon aria-hidden="true" className="size-4 shrink-0" />
            <span>{item.label}</span>
          </NavLink>
        </li>
      ))}
    </ul>
  );
}
