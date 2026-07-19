/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { ActiveTyper } from './_hooks/use-chat-typing';

interface ChatTypingIndicatorProps {
  typers: ActiveTyper[];
}

const describeTypers = (typers: ActiveTyper[]): string => {
  if (typers.length === 0) return '';
  const names = typers.map((t) => t.username ?? 'someone');
  if (names.length === 1) return `${names[0]} is typing…`;
  if (names.length === 2) return `${names[0]} and ${names[1]} are typing…`;
  return `${names[0]} and ${names.length - 1} others are typing…`;
};

export const ChatTypingIndicator = ({ typers }: ChatTypingIndicatorProps) => {
  if (typers.length === 0) return null;

  return (
    <div
      data-testid="chat-typing-indicator"
      className="text-muted-foreground flex items-center gap-2 px-4 py-1 text-xs"
      aria-live="polite"
    >
      <span className="flex gap-0.5" aria-hidden="true">
        <span
          className="bg-muted-foreground/60 inline-block size-1.5 animate-bounce rounded-full"
          style={{ animationDelay: '0ms' }}
        />
        <span
          className="bg-muted-foreground/60 inline-block size-1.5 animate-bounce rounded-full"
          style={{ animationDelay: '150ms' }}
        />
        <span
          className="bg-muted-foreground/60 inline-block size-1.5 animate-bounce rounded-full"
          style={{ animationDelay: '300ms' }}
        />
      </span>
      <span className="text-gray-400">{describeTypers(typers)}</span>
    </div>
  );
};
