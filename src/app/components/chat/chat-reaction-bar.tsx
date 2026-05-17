/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { cn } from '@/lib/utils';
import type { ChatReactions } from '@/lib/validation/chat-message-schema';

interface ChatReactionBarProps {
  reactions: ChatReactions;
  currentUserId: string;
  onToggle: (emoji: string) => void;
}

/**
 * Aggregated emoji reaction pills. Each pill shows the emoji and the
 * vote count; the current user's votes are highlighted so they know
 * which entries are theirs.
 */
export const ChatReactionBar = ({ reactions, currentUserId, onToggle }: ChatReactionBarProps) => {
  if (reactions.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-1" data-testid="chat-reaction-bar">
      {reactions.map((reaction) => {
        const mine = reaction.userIds.includes(currentUserId);
        return (
          <button
            key={reaction.emoji}
            type="button"
            onClick={() => onToggle(reaction.emoji)}
            aria-pressed={mine}
            aria-label={`React with ${reaction.emoji} (${reaction.userIds.length})`}
            className={cn(
              'inline-flex min-h-6 shrink-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs whitespace-nowrap',
              'transition-colors',
              mine
                ? 'border-primary/40 bg-primary/10 text-foreground'
                : 'border-border bg-muted hover:bg-muted/70 text-muted-foreground'
            )}
          >
            <span aria-hidden="true" className="inline-block shrink-0 leading-none">
              {reaction.emoji}
            </span>
            <span className="font-mono text-[10px] leading-none">{reaction.userIds.length}</span>
          </button>
        );
      })}
    </div>
  );
};
