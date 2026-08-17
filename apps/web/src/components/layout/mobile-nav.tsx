import * as Dialog from '@radix-ui/react-dialog';
import { Menu, X } from 'lucide-react';
import { useState } from 'react';

import { Button } from '../ui/button';
import { Brand } from './Brand';
import { LogoutButton } from './logout-button';
import { NavList } from './navigation';

/**
 * Mobile navigation: a compact header trigger opens a left drawer. Radix Dialog
 * provides the focus trap, Escape-to-close, scroll lock, background
 * non-interactivity and focus-return-to-trigger behavior. Selecting a nav item
 * closes the drawer and navigates via React Router (NavLink). The drawer stays
 * open while a logout is pending or failed so the controlled error remains
 * accessible; a successful logout redirects and unmounts the whole shell.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <Button variant="ghost" size="icon" aria-label="Abrir menu de navegação">
          <Menu aria-hidden="true" className="size-5" />
        </Button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-40 bg-black/40" />
        <Dialog.Content
          aria-label="Menu de navegação"
          className="fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col gap-6 bg-surface p-4 shadow-lg focus:outline-none"
        >
          <div className="flex items-center justify-between gap-4">
            <Brand />
            <Dialog.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Fechar menu de navegação">
                <X aria-hidden="true" className="size-5" />
              </Button>
            </Dialog.Close>
          </div>
          <nav aria-label="Menu de navegação">
            <NavList onNavigate={() => setOpen(false)} />
          </nav>
          <div className="mt-auto border-t border-border pt-4">
            <LogoutButton />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
