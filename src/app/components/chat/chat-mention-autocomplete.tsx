/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect } from 'react';

import { Loader2 } from 'lucide-react';

import { useDebounce } from '@/hooks/use-debounce';
import { useMentionSearchQuery, type MentionMatch } from '@/hooks/use-mention-search-query';
import { cn } from '@/lib/utils';

interface ChatMentionAutocompleteProps {
  /** The username prefix being typed after the active `@`. */
  query: string;
  /** Index of the currently-highlighted option. */
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  onSelect: (match: MentionMatch) => void;
  /** Notifies the parent when the latest match list changes, so keyboard
   *  navigation can clamp the active index without re-querying. */
  onMatchesChange: (matches: MentionMatch[]) => void;
}

/**
 * Floating list of username suggestions for the chat composer. Anchored
 * above the textarea via absolute positioning on the parent. Keyboard
 * handling (up/down/enter/esc/tab) lives in ChatInput so the textarea
 * keeps focus while the user navigates suggestions.
 */
export const ChatMentionAutocomplete = ({
  query,
  activeIndex,
  onActiveIndexChange,
  onSelect,
  onMatchesChange,
}: ChatMentionAutocompleteProps) => {
  // Debounce the prefix so typing `@username` fires one request per pause,
  // not one per keystroke (matching the other search inputs in the app).
  const debouncedQuery = useDebounce(query, 200);
  const { data: matches, isFetching } = useMentionSearchQuery(debouncedQuery, true);

  useEffect(() => {
    onMatchesChange(matches ?? []);
  }, [matches, onMatchesChange]);

  if (!matches || matches.length === 0) {
    if (!isFetching) return null;
    return (
      <div
        role="listbox"
        aria-label="Mention suggestions"
        className="bg-popover text-popover-foreground absolute right-2 bottom-full left-2 mb-2 flex items-center gap-2 rounded-md border p-2 text-xs shadow-md"
      >
        <Loader2 aria-hidden="true" className="text-muted-foreground size-3 animate-spin" />
        <span className="text-muted-foreground">Searching…</span>
      </div>
    );
  }

  return (
    <ul
      role="listbox"
      aria-label="Mention suggestions"
      className="bg-popover text-popover-foreground absolute right-2 bottom-full left-2 mb-2 max-h-48 overflow-y-auto rounded-md border py-1 shadow-md"
    >
      {matches.map((match, index) => {
        const isActive = index === activeIndex;
        return (
          <li key={match.id}>
            <button
              type="button"
              role="option"
              aria-selected={isActive}
              onMouseDown={(event) => {
                // mousedown (not click) so the textarea doesn't lose focus
                // before we get to apply the selection on the parent.
                event.preventDefault();
                onSelect(match);
              }}
              onMouseEnter={() => onActiveIndexChange(index)}
              className={cn(
                'block w-full px-3 py-1.5 text-left text-sm',
                isActive ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/50'
              )}
            >
              <span className="font-medium">@{match.username}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
};
