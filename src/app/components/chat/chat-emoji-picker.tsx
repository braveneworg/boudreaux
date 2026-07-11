/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState, type ReactNode } from 'react';

import dynamic from 'next/dynamic';

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

// emoji-mart ships a ~200KB picker — lazy load so the chat bundle isn't
// inflated for users who never react. SSR is disabled because the picker
// is keyboard/touch-driven and has no useful server output.
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
    // modal: the content portals outside the (modal) chat drawer, whose
    // trapped FocusScope would otherwise yank focus out of the picker's
    // search input and cascade into dismissing the picker (mobile) or the
    // whole drawer (desktop). A modal popover pauses that scope while open.
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
