/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import data from '@emoji-mart/data';
import Picker from '@emoji-mart/react';

interface EmojiMartSelection {
  native?: string;
  shortcodes?: string;
}

interface ChatEmojiPickerInnerProps {
  onSelect: (emoji: string) => void;
}

/**
 * Thin wrapper around the emoji-mart picker. Lives in its own module so
 * the parent `chat-emoji-picker.tsx` can lazy-load it with
 * `next/dynamic`, keeping the ~200KB dataset out of the initial chat bundle.
 */
const ChatEmojiPickerInner = ({ onSelect }: ChatEmojiPickerInnerProps) => {
  return (
    <Picker
      data={data}
      onEmojiSelect={(selection: EmojiMartSelection) => {
        const emoji = selection.native ?? selection.shortcodes;
        if (emoji) onSelect(emoji);
      }}
      previewPosition="none"
      skinTonePosition="none"
    />
  );
};

export default ChatEmojiPickerInner;
