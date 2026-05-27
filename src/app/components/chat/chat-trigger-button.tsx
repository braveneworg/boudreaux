/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { MessageCircle } from 'lucide-react';

import { cn } from '@/lib/utils';

interface ChatTriggerButtonProps {
  onOpen: () => void;
  className?: string;
}

/**
 * Frosted-glass floating chat trigger. Rendered globally — unauthenticated
 * visitors see the same button and are met with the sign-in gate inside
 * the drawer.
 */
export const ChatTriggerButton = ({ onOpen, className }: ChatTriggerButtonProps) => {
  return (
    <button
      type="button"
      onClick={(event) => {
        // Blur before opening so focus does not stay on this button while
        // Vaul applies aria-hidden to elements outside the drawer (which
        // would trip the "aria-hidden on a focused element" a11y warning).
        event.currentTarget.blur();
        onOpen();
      }}
      aria-label="Open chat"
      className={cn(
        'fixed right-6 bottom-6 z-50 flex flex-col items-center gap-1',
        'rounded-2xl border border-white/40 bg-white/30 px-4 py-3',
        'shadow-lg backdrop-blur-md',
        'text-foreground transition-colors hover:bg-white/45',
        'focus-visible:ring-primary focus:outline-none focus-visible:ring-2',
        className
      )}
    >
      <MessageCircle aria-hidden="true" className="size-6" />
      <span className="text-[10px] tracking-[0.18em] uppercase">Chat</span>
    </button>
  );
};
