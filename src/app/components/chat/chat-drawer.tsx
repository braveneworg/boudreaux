/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { ReactNode } from 'react';

import { Hand, X } from 'lucide-react';

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from '@/components/ui/drawer';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

interface ChatDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

/**
 * Live-chat drawer shell. On mobile it slides up from the bottom and
 * occupies 85dvh; on desktop (≥ 768px) it slides in from the right at a
 * fixed 400px width. The body slot is scrollable; the header is fixed.
 */
export const ChatDrawer = ({ open, onOpenChange, children }: ChatDrawerProps) => {
  const isMobile = useIsMobile();

  return (
    <Drawer direction={isMobile ? 'bottom' : 'right'} open={open} onOpenChange={onOpenChange}>
      <DrawerContent
        className={cn(
          'data-[vaul-drawer-direction=bottom]:!max-h-[85dvh]',
          'data-[vaul-drawer-direction=bottom]:!h-[85dvh]',
          'data-[vaul-drawer-direction=right]:!w-[400px]',
          'data-[vaul-drawer-direction=right]:!max-w-[400px]'
        )}
      >
        <header className="bg-background sticky top-0 z-10 grid grid-cols-[auto_1fr_auto] items-center gap-3 border-b px-4 py-3">
          <div className="flex size-8 items-center justify-center rounded-full bg-black">
            <Hand aria-hidden="true" className="size-4 text-white" />
          </div>
          <DrawerTitle className="text-center text-base">Fake Four Inc. Chat</DrawerTitle>
          <DrawerClose
            aria-label="Close chat"
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <X aria-hidden="true" className="size-5" />
          </DrawerClose>
          <DrawerDescription className="sr-only">
            Real-time chat with other Fake Four Inc. listeners and the label team.
          </DrawerDescription>
        </header>
        <div className="flex flex-1 flex-col overflow-y-auto" style={{ touchAction: 'pan-y' }}>
          {children}
        </div>
      </DrawerContent>
    </Drawer>
  );
};
