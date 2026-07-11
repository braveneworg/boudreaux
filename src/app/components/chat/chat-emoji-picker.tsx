/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState, type ReactNode } from 'react';

import dynamic from 'next/dynamic';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// Lazy-load the frimousse picker so users who never react don't pay for
// it; the emoji dataset itself loads on demand from /api/emoji-data. SSR
// is disabled because the picker is keyboard/touch-driven and has no
// useful server output.
const EmojiPicker = dynamic(
  () => import('./chat-emoji-picker-inner').then((mod) => mod.ChatEmojiPickerInner),
  {
    ssr: false,
    loading: () => <div className="text-muted-foreground p-4 text-xs">Loading emoji…</div>,
  }
);

interface ChatEmojiPickerProps {
  trigger: ReactNode;
  onSelect: (emoji: string) => void;
}

export const ChatEmojiPicker = ({ trigger, onSelect }: ChatEmojiPickerProps) => {
  const [open, setOpen] = useState(false);

  return (
    // The content portals outside the (modal) chat drawer, whose trapped
    // FocusScope yanks focus out of the picker's search input unless the
    // popover's own scope pauses it — which requires vaul and the popover
    // to share ONE @radix-ui/react-focus-scope instance (kept deduped in
    // the lockfile; e2e chat-drawer.spec.ts guards this). `modal` adds
    // outside-pointer-event isolation so stray clicks can't hit the
    // drawer overlay behind the picker and dismiss the drawer.
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <EmojiPicker
          onSelect={(emoji) => {
            onSelect(emoji);
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
};
