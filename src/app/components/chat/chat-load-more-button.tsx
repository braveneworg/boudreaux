/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { ChevronUp, Loader2 } from 'lucide-react';

interface ChatLoadMoreButtonProps {
  onLoadMore: () => void;
  isLoading: boolean;
}

/**
 * Explicit "Load more" caret rendered at the top of the message list.
 * Per spec, no IntersectionObserver auto-load — taps only.
 */
export const ChatLoadMoreButton = ({ onLoadMore, isLoading }: ChatLoadMoreButtonProps) => {
  return (
    <div className="flex w-full items-center justify-center py-2">
      <button
        type="button"
        onClick={onLoadMore}
        disabled={isLoading}
        aria-label="Load older messages"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 rounded-md px-3 py-1 text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isLoading ? (
          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
        ) : (
          <ChevronUp aria-hidden="true" className="size-4" />
        )}
        <span>{isLoading ? 'Loading…' : 'Load more'}</span>
      </button>
    </div>
  );
};
