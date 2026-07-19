/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import {
  useCallback,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type SyntheticEvent,
} from 'react';

import { SendHorizontal } from 'lucide-react';
import { toast } from 'sonner';

import {
  sendChatMessageAction,
  type SendChatMessageActionResult,
} from '@/lib/actions/send-chat-message-action';
import type { ChatMessageDto } from '@/lib/services/chat-service';
import { cn } from '@/lib/utils';

import { ChatMentionAutocomplete } from './chat-mention-autocomplete';

import type { MentionMatch } from './_hooks/use-mention-search-query';
import type { OptimisticChatMessage } from './_hooks/use-optimistic-chat';

interface ChatInputProps {
  fingerprint: string | null;
  currentUser: { id: string; username: string | null; gravatarHash: string };
  onOptimisticAppend: (draft: OptimisticChatMessage) => void;
  onSendResolved: (tempId: string, server: ChatMessageDto) => void;
  onSendFailed: (tempId: string) => void;
  /** Optional typing-event broadcaster wired up in Phase 6. */
  onTyping?: () => void;
}

const MAX_BODY = 2000;
const MIN_ROWS = 1;
const MAX_ROWS = 3;
const LINE_HEIGHT_PX = 20; // matches text-sm leading
const VERTICAL_PADDING_PX = 16; // py-2 (8px top + 8px bottom)
// Safety net: if the server action never resolves (e.g. an upstream
// dependency is unreachable), surface the failure to the user instead
// of leaving the optimistic placeholder spinning forever.
const SEND_TIMEOUT_MS = 10_000;

const newTempId = (): string => `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

type SendFailure = Extract<SendChatMessageActionResult, { success: false }>;

interface MentionKeyHandlers {
  matches: MentionMatch[];
  activeIndex: number;
  onMove: (updater: (index: number) => number) => void;
  onChoose: (match: MentionMatch) => void;
  onClose: () => void;
}

/**
 * Handle keyboard navigation while the mention autocomplete is open. Returns
 * `true` when the key was consumed (caller should stop), `false` to let the
 * key fall through to the composer (e.g. Enter/Tab with no available choice).
 */
const handleMentionNavigation = (
  event: KeyboardEvent<HTMLTextAreaElement>,
  { matches, activeIndex, onMove, onChoose, onClose }: MentionKeyHandlers
): boolean => {
  const count = matches.length;
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    onMove((i) => (i + 1) % count);
    return true;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    onMove((i) => (i - 1 + count) % count);
    return true;
  }
  if (event.key === 'Enter' || event.key === 'Tab') {
    const choice = matches.at(activeIndex);
    if (choice) {
      event.preventDefault();
      onChoose(choice);
      return true;
    }
  }
  if (event.key === 'Escape') {
    event.preventDefault();
    onClose();
    return true;
  }
  return false;
};

/** Surface a user-facing toast for a failed send, keyed on the error code. */
const notifyChatSendFailure = (result: SendFailure): void => {
  if (result.error === 'rate_limited') {
    toast.error(`Slow down — try again in ${result.retryAfterSeconds ?? 'a few'} seconds.`);
  } else if (result.error === 'disabled') {
    toast.error('Chat access has been disabled for your account.');
  } else if (result.error === 'unauthorized') {
    toast.error('Please sign in to chat.');
  } else {
    toast.error('Message could not be sent.');
  }
};

/**
 * Locate the active `@username` token at the caret. Returns the token
 * span (without the leading `@`) plus the absolute offsets so the
 * caller can splice in a replacement. Returns null when the caret is
 * not currently inside a mention token — e.g. after a space, inside an
 * email address, or with no `@` to the left of the caret.
 */
const findActiveMentionToken = (
  value: string,
  caret: number
): {
  start: number;
  end: number;
  query: string;
} | null => {
  const before = value.slice(0, caret);
  const atIndex = before.lastIndexOf('@');
  if (atIndex === -1) return null;
  // The char before the '@' must be start-of-string or a non-word/non-hyphen
  // separator so we don't fire autocomplete inside email addresses.
  if (atIndex > 0) {
    const prev = value[atIndex - 1];
    if (prev !== undefined && /[\w-]/.test(prev)) return null;
  }
  const tokenPart = before.slice(atIndex + 1);
  // Whitespace closes the mention.
  if (/\s/.test(tokenPart)) return null;
  // Only the conservative username charset is allowed.
  if (tokenPart.length > 0 && !/^[A-Za-z0-9_.-]+$/.test(tokenPart)) return null;
  return { start: atIndex, end: caret, query: tokenPart };
};

/**
 * Auto-growing chat composer. Uses CSS `field-sizing: content` where
 * supported (Chrome 123+, Firefox 130+) and falls back to manually
 * setting `rows` based on measured `scrollHeight` for older browsers
 * (e.g., Safari before the field-sizing rollout).
 */
export const ChatInput = ({
  fingerprint,
  currentUser,
  onOptimisticAppend,
  onSendResolved,
  onSendFailed,
  onTyping,
}: ChatInputProps) => {
  const [value, setValue] = useState('');
  const [rows, setRows] = useState(MIN_ROWS);
  const [isSending, setIsSending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [mention, setMention] = useState<{ start: number; end: number; query: string } | null>(
    null
  );
  const [mentionActiveIndex, setMentionActiveIndex] = useState(0);
  const mentionMatchesRef = useRef<MentionMatch[]>([]);

  const refreshMention = useCallback((textarea: HTMLTextAreaElement) => {
    const next = findActiveMentionToken(textarea.value, textarea.selectionStart);
    setMention(next);
    setMentionActiveIndex(0);
  }, []);

  const insertMention = useCallback(
    (match: MentionMatch) => {
      const textarea = textareaRef.current;
      if (!textarea || !mention) return;
      const before = textarea.value.slice(0, mention.start);
      const after = textarea.value.slice(mention.end);
      const insertion = `@${match.username} `;
      const next = `${before}${insertion}${after}`.slice(0, MAX_BODY);
      setValue(next);
      setMention(null);
      // Restore focus + caret after React paints the new value.
      requestAnimationFrame(() => {
        const el = textareaRef.current;
        if (!el) return;
        const pos = before.length + insertion.length;
        el.focus();
        el.setSelectionRange(pos, pos);
      });
    },
    [mention]
  );

  const handleMentionMatches = useCallback((matches: MentionMatch[]) => {
    mentionMatchesRef.current = matches;
    setMentionActiveIndex((prev) => {
      if (matches.length === 0) return 0;
      return Math.min(prev, matches.length - 1);
    });
  }, []);

  const recomputeRows = useCallback((textarea: HTMLTextAreaElement) => {
    // JS fallback for browsers without field-sizing support (e.g., older Safari).
    textarea.rows = MIN_ROWS;
    const contentHeight = textarea.scrollHeight - VERTICAL_PADDING_PX;
    const lines = Math.max(MIN_ROWS, Math.ceil(contentHeight / LINE_HEIGHT_PX));
    const clamped = Math.min(lines, MAX_ROWS);
    setRows(clamped);
    textarea.rows = clamped;
  }, []);

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const next = event.target.value.slice(0, MAX_BODY);
    setValue(next);
    recomputeRows(event.target);
    refreshMention(event.target);
    if (next.trim().length > 0) onTyping?.();
  };

  const handleSend = useCallback(async () => {
    const trimmed = value.trim();
    if (!trimmed || isSending) return;
    if (!fingerprint) {
      toast.error('Still preparing chat — try again in a moment.');
      return;
    }

    const tempId = newTempId();
    const draft: OptimisticChatMessage = {
      id: tempId,
      tempId,
      body: trimmed,
      reactions: [],
      createdAt: new Date().toISOString(),
      user: currentUser,
    };

    onOptimisticAppend(draft);
    setValue('');
    setRows(MIN_ROWS);
    setIsSending(true);

    try {
      const result = await Promise.race([
        sendChatMessageAction({ body: trimmed, fingerprint, tempId }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(Error('send_timeout')), SEND_TIMEOUT_MS)
        ),
      ]);
      if (result.success) {
        onSendResolved(tempId, result.data);
        return;
      }
      onSendFailed(tempId);
      notifyChatSendFailure(result);
    } catch (error) {
      console.error('Chat send failed', error);
      onSendFailed(tempId);
      const timedOut = error instanceof Error && error.message === 'send_timeout';
      toast.error(
        timedOut
          ? "Chat is taking too long to respond. We couldn't send your message — please try again."
          : "We couldn't send your message. Please try again."
      );
    } finally {
      setIsSending(false);
    }
  }, [
    value,
    isSending,
    fingerprint,
    currentUser,
    onOptimisticAppend,
    onSendResolved,
    onSendFailed,
  ]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (mention && mentionMatchesRef.current.length > 0) {
      const handled = handleMentionNavigation(event, {
        matches: mentionMatchesRef.current,
        activeIndex: mentionActiveIndex,
        onMove: setMentionActiveIndex,
        onChoose: insertMention,
        onClose: () => setMention(null),
      });
      if (handled) return;
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  };

  const handleSelect = (event: SyntheticEvent<HTMLTextAreaElement>) => {
    refreshMention(event.currentTarget);
  };

  const hasContent = value.trim().length > 0;

  return (
    <div className="bg-background sticky bottom-0 border-t p-3">
      <div className="relative">
        {mention && (
          <ChatMentionAutocomplete
            query={mention.query}
            activeIndex={mentionActiveIndex}
            onActiveIndexChange={setMentionActiveIndex}
            onSelect={insertMention}
            onMatchesChange={handleMentionMatches}
          />
        )}
        <textarea
          ref={textareaRef}
          aria-label="Chat message"
          placeholder="Say something…"
          value={value}
          rows={rows}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onSelect={handleSelect}
          onBlur={() => setMention(null)}
          disabled={isSending}
          maxLength={MAX_BODY}
          style={{ fieldSizing: 'content' } as React.CSSProperties}
          className={cn(
            'border-input focus-visible:border-ring focus-visible:ring-ring/50',
            'block w-full resize-none border bg-transparent px-3 py-2 pr-12 text-base leading-5 md:text-sm',
            'transition-[color,box-shadow] outline-none focus-visible:ring-[3px]',
            'disabled:cursor-not-allowed disabled:opacity-60'
          )}
        />
        <button
          type="button"
          onClick={handleSend}
          disabled={!hasContent || isSending || !fingerprint}
          aria-label="Send message"
          className={cn(
            'absolute right-1 bottom-0.75 inline-flex size-8 items-center justify-center',
            'transition-colors',
            hasContent && !isSending
              ? 'border border-zinc-950 bg-linear-to-b from-zinc-950 to-zinc-500 text-white shadow-sm'
              : 'text-muted-foreground bg-transparent',
            'disabled:cursor-not-allowed disabled:opacity-50'
          )}
        >
          <SendHorizontal aria-hidden="true" className="size-4" />
        </button>
      </div>
    </div>
  );
};
