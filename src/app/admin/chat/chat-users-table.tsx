/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState, useTransition } from 'react';

import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { updateChatUserAction } from '@/lib/actions/update-chat-user-action';
import { queryKeys } from '@/lib/query-keys';
import type { ChatUsersSortBy } from '@/lib/services/chat-admin-service';

import { useChatAdminUsersQuery } from './_hooks/use-chat-admin-users-query';

const DEFAULT_PER_PAGE = 50;

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const formatTimestamp = (iso: string): string => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '—' : dateFormatter.format(d);
};

export const ChatUsersTable = () => {
  const [page, setPage] = useState(1);
  const [sortBy] = useState<ChatUsersSortBy>('messageCount');
  const [sortDirection] = useState<'asc' | 'desc'>('desc');

  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();

  const {
    data,
    isPending: isLoading,
    isError,
  } = useChatAdminUsersQuery({
    page,
    perPage: DEFAULT_PER_PAGE,
    sortBy,
    sortDirection,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.chat.all });

  const handleToggleDisabled = (userId: string, disabled: boolean) => {
    startTransition(async () => {
      const result = await updateChatUserAction({ userId, disabled });
      if (result.success) {
        toast.success(disabled ? 'Chat access disabled.' : 'Chat access restored.');
        invalidate();
      } else {
        toast.error('Could not update chat user.');
      }
    });
  };

  const handleClearFlag = (userId: string) => {
    startTransition(async () => {
      const result = await updateChatUserAction({ userId, clearFlag: true });
      if (result.success) {
        toast.success('Flag cleared.');
        invalidate();
      } else {
        toast.error('Could not clear flag.');
      }
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2
          aria-label="Loading chat users"
          className="text-muted-foreground size-6 animate-spin"
        />
      </div>
    );
  }

  if (isError || !data) {
    return <div className="text-destructive p-8 text-sm">Could not load chat users.</div>;
  }

  const totalPages = Math.max(1, Math.ceil(data.total / DEFAULT_PER_PAGE));

  return (
    <div className="space-y-4" data-testid="chat-users-table">
      {data.rows.length === 0 ? (
        <div className="text-muted-foreground py-8 text-center text-sm">No chat users yet.</div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {data.rows.map((row) => {
            const displayName = row.username ?? '—';
            return (
              <Card key={row.id} className="gap-3 py-4">
                <CardHeader className="px-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{displayName}</span>
                        {row.flagged && (
                          <AlertTriangle
                            aria-label="Flagged for review"
                            className="text-destructive size-4 shrink-0"
                          />
                        )}
                      </div>
                      <p className="text-muted-foreground truncate text-xs">{row.email}</p>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 px-4">
                  <dl className="text-muted-foreground grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <dt>Messages</dt>
                    <dd className="text-foreground text-right font-mono">{row.messageCount}</dd>
                    <dt>Last seen</dt>
                    <dd className="text-foreground text-right">
                      {formatTimestamp(row.lastSeenAt)}
                    </dd>
                  </dl>

                  <div className="border-t pt-3">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span>Disable chat</span>
                      <Switch
                        aria-label={`${row.disabled ? 'Enable' : 'Disable'} chat for ${row.username ?? row.email}`}
                        checked={row.disabled}
                        disabled={isPending}
                        onCheckedChange={(checked) => handleToggleDisabled(row.userId, checked)}
                      />
                    </div>
                  </div>

                  {row.flagged && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="w-full"
                      disabled={isPending}
                      onClick={() => handleClearFlag(row.userId)}
                    >
                      Clear flag
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="text-muted-foreground flex items-center justify-between text-sm">
          <span>
            Page {data.page} of {totalPages} ({data.total} total)
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Previous
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
