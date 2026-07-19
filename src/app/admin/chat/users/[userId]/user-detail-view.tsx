/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
'use client';

import { useRef, useState, useTransition } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import { EyeOff, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { useInfiniteAdminUserMessagesQuery } from '@/app/admin/chat/_hooks/use-infinite-admin-user-messages-query';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import {
  disableChatUserAction,
  enableChatUserAction,
} from '@/lib/actions/disable-chat-user-action';
import { toggleMessageHiddenAction } from '@/lib/actions/toggle-message-hidden-action';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

interface UserDetailViewProps {
  userId: string;
  initialChatDisabled: boolean;
}

/**
 * Admin per-user detail. Renders an infinite-scrolling list of the
 * user's chat messages newest-first and exposes:
 *
 * - A top-level disable/enable toggle (audit-aware via {@link disableChatUserAction})
 * - A per-message hide toggle switch
 *
 * Hide controls call {@link toggleMessageHiddenAction} which records
 * `hiddenReason: "admin_flagged"` so the hide survives re-enabling the
 * author. The read-time filter in `ChatMessageRepository.findRecent`
 * removes both per-message and disable-author hides from public chat.
 */
export const UserDetailView = ({ userId, initialChatDisabled }: UserDetailViewProps) => {
  const queryClient = useQueryClient();
  const [chatDisabled, setChatDisabled] = useState(initialChatDisabled);
  const [isPending, startTransition] = useTransition();

  const {
    data,
    isPending: isLoading,
    isError,
    hasNextPage,
    isFetchingNextPage,
    fetchNextPage,
  } = useInfiniteAdminUserMessagesQuery(userId);

  const sentinelRef = useRef<HTMLDivElement>(null);

  useInfiniteScroll(sentinelRef, { hasNextPage, isFetchingNextPage, fetchNextPage });

  const invalidateMessages = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.chat.userMessages(userId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.chat.messages() });
  };

  const handleToggleDisabled = () => {
    const next = !chatDisabled;
    startTransition(async () => {
      const result = next
        ? await disableChatUserAction({ userId })
        : await enableChatUserAction({ userId });
      if (result.success) {
        setChatDisabled(next);
        toast.success(next ? 'Chat access disabled.' : 'Chat access restored.');
        queryClient.invalidateQueries({ queryKey: queryKeys.chat.all });
      } else {
        toast.error('Could not update chat user.');
      }
    });
  };

  const handleToggleMessageHidden = (messageId: string, hidden: boolean) => {
    startTransition(async () => {
      const result = await toggleMessageHiddenAction({ messageId, hidden });
      if (result.success) {
        toast.success(hidden ? 'Message hidden.' : 'Message restored.');
        invalidateMessages();
      } else {
        toast.error('Could not update message.');
      }
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2
          aria-label="Loading messages"
          className="text-muted-foreground size-6 animate-spin"
        />
      </div>
    );
  }
  if (isError || !data) {
    return <div className="text-destructive p-8 text-sm">Could not load messages.</div>;
  }

  const allMessages = data.pages.flatMap((page) => page.rows);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 border p-4">
        <div>
          <p className="font-medium">Chat access</p>
          <p className="text-muted-foreground text-xs">
            Disabling hides every message this user has sent until you re-enable them. Messages you
            hide individually stay hidden.
          </p>
        </div>
        <Switch
          aria-label={`${chatDisabled ? 'Enable' : 'Disable'} chat for this user`}
          checked={chatDisabled}
          disabled={isPending}
          onCheckedChange={handleToggleDisabled}
        />
      </div>

      {allMessages.length === 0 ? (
        <div className="text-muted-foreground py-8 text-center text-sm">No messages yet.</div>
      ) : (
        <ul className="space-y-2">
          {allMessages.map((message) => {
            const isHidden = message.hiddenAt !== null;
            const reasonLabel =
              message.hiddenReason === 'admin_flagged'
                ? 'Hidden by admin'
                : message.hiddenReason === 'user_disabled'
                  ? 'Hidden (author disabled)'
                  : null;
            const created = new Date(message.createdAt);
            const createdLabel = Number.isNaN(created.getTime())
              ? '—'
              : dateFormatter.format(created);

            return (
              <li
                key={message.id}
                className={cn(
                  'flex flex-col gap-2 border p-3 sm:flex-row sm:items-start sm:justify-between',
                  isHidden && 'bg-muted/40'
                )}
              >
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      'text-sm wrap-break-word whitespace-pre-wrap',
                      isHidden && 'text-muted-foreground line-through'
                    )}
                  >
                    {message.body}
                  </p>
                  <p className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
                    <span>{createdLabel}</span>
                    {reasonLabel && (
                      <span className="text-destructive inline-flex items-center gap-1">
                        <EyeOff aria-hidden="true" className="size-3" />
                        {reasonLabel}
                      </span>
                    )}
                  </p>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <span className="text-muted-foreground">Hide</span>
                  <Switch
                    aria-label={`${isHidden ? 'Unhide' : 'Hide'} message`}
                    checked={isHidden}
                    disabled={isPending}
                    onCheckedChange={(checked) => handleToggleMessageHidden(message.id, checked)}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div ref={sentinelRef} aria-hidden="true" />
      {isFetchingNextPage && (
        <div className="flex items-center justify-center p-4">
          <Loader2 className="text-muted-foreground size-5 animate-spin" />
        </div>
      )}
      {hasNextPage && !isFetchingNextPage && (
        <div className="flex justify-center pt-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void fetchNextPage()}>
            Load more
          </Button>
        </div>
      )}
    </div>
  );
};
