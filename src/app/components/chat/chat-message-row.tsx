/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useMemo, useState } from 'react';

import { AlertTriangle, Loader2 } from 'lucide-react';

import { GravatarAvatar } from '@/components/gravatar-avatar';
import type { OptimisticChatMessage } from '@/hooks/use-optimistic-chat';
import { cn } from '@/lib/utils';
import { tokenizeMentions } from '@/lib/utils/mention-parsing';

interface ChatMessageRowProps {
  message: OptimisticChatMessage;
  /**
   * Reactions area slot. Owns both the pills and the add-reaction trigger.
   * Phase 6's chat-body composes ChatReactionBar + ChatEmojiPicker here.
   */
  reactionBar?: React.ReactNode;
  /**
   * Optional badge rendered in the header (e.g., the red pin marker shown
   * on rows in the pinned strip). Caller controls the visual + click
   * behavior so this row stays presentational.
   */
  pinIndicator?: React.ReactNode;
}

/**
 * Format `iso` in the viewer's locale + time zone. Called inside a
 * mount-only effect so the visible string is always the *client's*
 * local time — formatting at module scope would otherwise pick up the
 * server's time zone during SSR and briefly display it before
 * hydration.
 */
const formatTimestamp = (iso: string): { short: string; long: string } => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return { short: '', long: '' };
  const short = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(date);
  const long = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'full',
    timeStyle: 'long',
  }).format(date);
  return { short, long };
};

export const ChatMessageRow = ({ message, reactionBar, pinIndicator }: ChatMessageRowProps) => {
  const [formatted, setFormatted] = useState<{ short: string; long: string }>({
    short: '',
    long: '',
  });
  useEffect(() => {
    setFormatted(formatTimestamp(message.createdAt));
  }, [message.createdAt]);
  const bodyTokens = useMemo(() => {
    const tokens = tokenizeMentions(message.body);
    let offset = 0;
    return tokens.map((token) => {
      const key = `${token.kind}-${offset}-${token.value}`;
      offset += token.value.length;
      return { token, key };
    });
  }, [message.body]);
  const isPending = Boolean(message.tempId) && !message.failed;
  const isFailed = Boolean(message.failed);

  return (
    <article
      data-testid="chat-message-row"
      data-pending={isPending ? 'true' : undefined}
      data-failed={isFailed ? 'true' : undefined}
      className={cn(
        'flex flex-col gap-1 px-4 py-3',
        isPending && 'opacity-60',
        isFailed && 'bg-destructive/5'
      )}
    >
      <header className="flex items-center gap-2 text-xs">
        <GravatarAvatar
          hash={message.user.gravatarHash}
          size={48}
          defaultStyle="identicon"
          className="size-6 border-0"
        />
        <span className="text-foreground font-medium">
          {message.user.username ?? 'unknown'}
          {message.user.role === 'admin' && (
            <span className="text-muted-foreground ml-1 font-normal">(moderator)</span>
          )}
        </span>
        {pinIndicator && <span className="ml-auto inline-flex items-center">{pinIndicator}</span>}
        <time
          dateTime={message.createdAt}
          title={formatted.long}
          suppressHydrationWarning
          className={cn('text-muted-foreground text-[10px]', !pinIndicator && 'ml-auto')}
        >
          {formatted.short}
        </time>
        {isPending && (
          <Loader2 aria-label="sending" className="text-muted-foreground size-3 animate-spin" />
        )}
        {isFailed && <AlertTriangle aria-label="send failed" className="text-destructive size-3" />}
      </header>

      <p
        className="text-foreground pl-8 text-sm wrap-break-word whitespace-pre-wrap"
        data-mention-targets={bodyTokens
          .map(({ token }) => (token.kind === 'mention' ? token.username.toLowerCase() : null))
          .filter((u): u is string => u !== null)
          .join(' ')}
      >
        {bodyTokens.map(({ token, key }) =>
          token.kind === 'mention' ? (
            <span
              key={key}
              data-mention-username={token.username.toLowerCase()}
              className="font-bold text-zinc-950"
            >
              {token.value}
            </span>
          ) : (
            <span key={key}>{token.value}</span>
          )
        )}
      </p>

      {reactionBar && <div className="flex items-center gap-2 pl-8">{reactionBar}</div>}
    </article>
  );
};
