/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { EmojiPicker } from 'frimousse';

import type {
  EmojiPickerListCategoryHeaderProps,
  EmojiPickerListEmojiProps,
  EmojiPickerListRowProps,
} from 'frimousse';

interface ChatEmojiPickerInnerProps {
  onSelect: (emoji: string) => void;
}

const CategoryHeader = ({ category, ...props }: EmojiPickerListCategoryHeaderProps) => (
  <div
    className="bg-popover text-muted-foreground px-3 pt-3 pb-1.5 text-xs font-bold tracking-wide uppercase"
    {...props}
  >
    {category.label}
  </div>
);

const Row = ({ children, ...props }: EmojiPickerListRowProps) => (
  <div className="scroll-my-1.5 px-1.5" {...props}>
    {children}
  </div>
);

const Emoji = ({ emoji, ...props }: EmojiPickerListEmojiProps) => (
  <button
    type="button"
    className="data-[active]:bg-accent flex size-8 items-center justify-center rounded-none text-lg"
    {...props}
  >
    {emoji.emoji}
  </button>
);

/**
 * frimousse-based emoji picker surface. Lives in its own module so the
 * parent `chat-emoji-picker.tsx` can lazy-load it with `next/dynamic`,
 * keeping the picker out of the initial chat bundle.
 *
 * Emoji data loads lazily from the same-origin `/api/emoji-data` route
 * (vendored emojibase files) because the site CSP's `connect-src` does
 * not allow frimousse's default jsdelivr source. The root height tracks
 * `--radix-popover-content-available-height` so the picker never
 * overflows the viewport inside the chat drawer (e.g. above the mobile
 * on-screen keyboard).
 */
export const ChatEmojiPickerInner = ({ onSelect }: ChatEmojiPickerInnerProps) => (
  <EmojiPicker.Root
    className="flex h-[min(24rem,var(--radix-popover-content-available-height))] w-72 flex-col"
    columns={8}
    emojibaseUrl="/api/emoji-data"
    locale="en"
    onEmojiSelect={({ emoji }) => onSelect(emoji)}
  >
    <EmojiPicker.Search className="focus-visible:border-ring focus-visible:ring-ring m-2 h-9 appearance-none rounded-none border-2 border-black bg-transparent px-3 py-1 text-base outline-none placeholder:text-zinc-800 focus-visible:ring-[3px] md:text-sm" />
    <EmojiPicker.Viewport className="relative flex-1 outline-hidden">
      <EmojiPicker.Loading className="text-muted-foreground absolute inset-0 flex items-center justify-center text-xs">
        Loading emoji…
      </EmojiPicker.Loading>
      <EmojiPicker.Empty className="text-muted-foreground absolute inset-0 flex items-center justify-center text-xs">
        No emoji found
      </EmojiPicker.Empty>
      <EmojiPicker.List
        className="pb-1.5 select-none"
        components={{ CategoryHeader, Row, Emoji }}
      />
    </EmojiPicker.Viewport>
  </EmojiPicker.Root>
);
