/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { ReactNode } from 'react';

import Image from 'next/image';

import { X } from 'lucide-react';

import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerTitle,
} from '@/components/ui/drawer';
import { ZineSketchStrokes } from '@/components/ui/zine-sketch-strokes';
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
          'zine-accent-orchid',
          'border-2 border-black',
          'data-[vaul-drawer-direction=bottom]:max-h-[85dvh]!',
          'data-[vaul-drawer-direction=bottom]:h-[85dvh]!',
          'data-[vaul-drawer-direction=right]:w-100!',
          'data-[vaul-drawer-direction=right]:max-w-100!'
        )}
      >
        <header className="bg-background sticky top-0 z-10 flex items-center justify-center border-b">
          <DrawerTitle>
            {/* ImageHeading's zine treatment, inlined: DrawerTitle must be the
                heading element, so we can't nest ImageHeading's own <h*> inside. */}
            <span className="relative inline-block w-full sm:w-auto">
              <ZineSketchStrokes />
              <Image
                src="/media/headings/LIVE-CHAT.webp"
                alt="live chat"
                width={1920}
                height={480}
                sizes="(min-width: 640px) 224px, 100vw"
                priority
                className="h-auto w-full sm:h-14 sm:w-auto"
              />
            </span>
          </DrawerTitle>
          <DrawerClose
            aria-label="Close chat"
            className="text-muted-foreground hover:text-foreground absolute -top-2 right-4 transition-colors md:top-1/2 md:-translate-y-1/2"
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
