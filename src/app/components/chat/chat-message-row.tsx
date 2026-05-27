/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useMemo, useState } from 'react';

import { AlertTriangle, ExternalLink, Loader2 } from 'lucide-react';

import { GravatarAvatar } from '@/components/gravatar-avatar';
import type { OptimisticChatMessage } from '@/hooks/use-optimistic-chat';
import { cn } from '@/lib/utils';
import { parseAdminMarkdown, type AdminMarkdownNode } from '@/lib/utils/admin-markdown';
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
  /**
   * Visual alignment of the row. `'left'` (default) keeps the legacy
   * layout: gravatar + username on the left, timestamp on the right.
   * `'right'` mirrors the header so the timestamp sits on the left while
   * the username and gravatar sit on the right (in that order), and the
   * body / reactions hang from the right edge. The list alternates this
   * between consecutive user groups for visual rhythm.
   */
  align?: 'left' | 'right';
}

/**
 * Hostname of this deployment, used to classify links in admin markdown
 * as internal vs. external. Read from `NEXT_PUBLIC_BASE_URL` so the
 * value is statically inlined at build time and stable between SSR and
 * client hydration. Unset → links are conservatively treated as
 * external.
 */
const SITE_HOST: string | undefined = (() => {
  const raw = process.env.NEXT_PUBLIC_BASE_URL;
  if (!raw) return undefined;
  try {
    return new URL(raw).host;
  } catch {
    return undefined;
  }
})();

const renderMentionTokens = (text: string, keyPrefix: string): React.ReactNode[] => {
  const tokens = tokenizeMentions(text);
  let offset = 0;
  return tokens.map((token) => {
    const key = `${keyPrefix}-${token.kind}-${offset}-${token.value}`;
    offset += token.value.length;
    if (token.kind === 'mention') {
      return (
        <span
          key={key}
          data-mention-username={token.username.toLowerCase()}
          className="font-bold text-zinc-950"
        >
          {token.value}
        </span>
      );
    }
    return <span key={key}>{token.value}</span>;
  });
};

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

export const ChatMessageRow = ({
  message,
  reactionBar,
  pinIndicator,
  align = 'left',
}: ChatMessageRowProps) => {
  const isRight = align === 'right';
  const [formatted, setFormatted] = useState<{ short: string; long: string }>({
    short: '',
    long: '',
  });
  useEffect(() => {
    setFormatted(formatTimestamp(message.createdAt));
  }, [message.createdAt]);
  const isAdminAuthor = message.user.role === 'admin';
  const adminNodes = useMemo<AdminMarkdownNode[] | null>(
    () => (isAdminAuthor ? parseAdminMarkdown(message.body, { siteHost: SITE_HOST }) : null),
    [isAdminAuthor, message.body]
  );
  const bodyTokens = useMemo(() => {
    const tokens = tokenizeMentions(message.body);
    let offset = 0;
    return tokens.map((token) => {
      const key = `${token.kind}-${offset}-${token.value}`;
      offset += token.value.length;
      return { token, key };
    });
  }, [message.body]);
  const mentionedUsernames = useMemo<string[]>(() => {
    const seen = new Set<string>();
    const collect = (text: string): void => {
      for (const token of tokenizeMentions(text)) {
        if (token.kind === 'mention') seen.add(token.username.toLowerCase());
      }
    };
    if (adminNodes) {
      for (const node of adminNodes) {
        if (node.kind === 'link') collect(node.text);
        else collect(node.value);
      }
    } else {
      for (const { token } of bodyTokens) {
        if (token.kind === 'mention') seen.add(token.username.toLowerCase());
      }
    }
    return [...seen];
  }, [adminNodes, bodyTokens]);
  const isPending = Boolean(message.tempId) && !message.failed;
  const isFailed = Boolean(message.failed);

  const avatar = (
    <GravatarAvatar
      hash={message.user.gravatarHash}
      size={48}
      defaultStyle="identicon"
      className="size-6 border-0"
    />
  );
  const username = (
    <span className="text-foreground font-medium">
      {message.user.username ?? 'unknown'}
      {message.user.role === 'admin' && (
        <span className="ml-1 font-normal text-zinc-700">(moderator)</span>
      )}
    </span>
  );
  const timestamp = (
    <time
      dateTime={message.createdAt}
      title={formatted.long}
      suppressHydrationWarning
      className="text-[10px] text-zinc-700"
    >
      {formatted.short}
    </time>
  );
  const statusIcons = (
    <>
      {isPending && (
        <Loader2 aria-label="sending" className="text-muted-foreground size-3 animate-spin" />
      )}
      {isFailed && <AlertTriangle aria-label="send failed" className="text-destructive size-3" />}
    </>
  );

  return (
    <article
      data-testid="chat-message-row"
      data-align={align}
      data-pending={isPending ? 'true' : undefined}
      data-failed={isFailed ? 'true' : undefined}
      className={cn(
        'flex flex-col gap-1 px-4 py-3',
        isPending && 'opacity-60',
        isFailed && 'bg-destructive/5'
      )}
    >
      <header className="flex items-center justify-between gap-2 text-xs">
        {isRight ? (
          <>
            <span className="inline-flex items-center gap-2">
              {timestamp}
              {statusIcons}
            </span>
            {pinIndicator && <span className="inline-flex items-center">{pinIndicator}</span>}
            <span className="inline-flex items-center gap-2">
              {username}
              {avatar}
            </span>
          </>
        ) : (
          <>
            <span className="inline-flex items-center gap-2">
              {avatar}
              {username}
            </span>
            {pinIndicator && <span className="inline-flex items-center">{pinIndicator}</span>}
            <span className="inline-flex items-center gap-2">
              {timestamp}
              {statusIcons}
            </span>
          </>
        )}
      </header>

      <p
        className={cn(
          'text-foreground text-sm wrap-break-word whitespace-pre-wrap',
          isRight ? 'pr-8' : 'pl-8'
        )}
        data-mention-targets={mentionedUsernames.join(' ')}
      >
        {adminNodes
          ? adminNodes.map((node, idx) => {
              const key = `md-${idx}`;
              if (node.kind === 'bold') {
                return <strong key={key}>{renderMentionTokens(node.value, key)}</strong>;
              }
              if (node.kind === 'em') {
                return <em key={key}>{renderMentionTokens(node.value, key)}</em>;
              }
              if (node.kind === 'link') {
                return (
                  <a
                    key={key}
                    href={node.href}
                    {...(node.external
                      ? { target: '_blank', rel: 'noopener noreferrer nofollow' }
                      : {})}
                    className="text-zinc-950 underline underline-offset-2"
                  >
                    {renderMentionTokens(node.text, key)}
                    {node.external && (
                      <ExternalLink
                        aria-label="opens in a new tab"
                        className="ml-0.5 inline size-3 align-[-1px]"
                      />
                    )}
                  </a>
                );
              }
              return <span key={key}>{renderMentionTokens(node.value, key)}</span>;
            })
          : bodyTokens.map(({ token, key }) =>
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

      {reactionBar && (
        <div className={cn('flex items-center gap-2', isRight ? 'pr-8' : 'pl-8')}>
          {reactionBar}
        </div>
      )}
    </article>
  );
};
