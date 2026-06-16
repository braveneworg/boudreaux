/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */
'use client';

import { useRef, useState, useTransition } from 'react';

import Link from 'next/link';

import { useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, ExternalLink, Loader2, Search } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useDebounce } from '@/hooks/use-debounce';
import { useInfiniteReportedUsersQuery } from '@/hooks/use-infinite-reported-users-query';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import {
  disableChatUserAction,
  enableChatUserAction,
} from '@/lib/actions/disable-chat-user-action';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

const formatTimestamp = (iso: string): string => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date);
};

/**
 * Reported-users table: the default landing for the abuse-reporting
 * moderation flow. Lists each reported user once with the report count
 * and most recent report timestamp; reporter identities are never
 * displayed (the underlying DTO does not include them).
 *
 * Includes a search box and a per-user toggle that calls the
 * audit-aware {@link disableChatUserAction} / {@link enableChatUserAction}.
 */
export const ReportedUsersTable = () => {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search);
  const queryClient = useQueryClient();
  const [isPending, startTransition] = useTransition();
  const sentinelRef = useRef<HTMLDivElement>(null);

  const {
    data,
    isPending: isLoading,
    isError,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useInfiniteReportedUsersQuery({
    windowDays: null,
    search: debouncedSearch,
  });

  useInfiniteScroll(sentinelRef, { hasNextPage, isFetchingNextPage, fetchNextPage });

  const rows = data?.pages.flatMap((page) => page.rows) ?? [];

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.chat.all });
  };

  const handleToggleDisabled = (userId: string, currentlyDisabled: boolean) => {
    startTransition(async () => {
      const result = currentlyDisabled
        ? await enableChatUserAction({ userId })
        : await disableChatUserAction({ userId });
      if (result.success) {
        toast.success(currentlyDisabled ? 'Chat access restored.' : 'Chat access disabled.');
        invalidate();
      } else {
        toast.error('Could not update chat user.');
      }
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2
          aria-label="Loading reported users"
          className="text-muted-foreground size-6 animate-spin"
        />
      </div>
    );
  }

  if (isError || !data) {
    return <div className="text-destructive p-8 text-sm">Could not load reported users.</div>;
  }

  return (
    <div className="space-y-4" data-testid="reported-users-table">
      <div className="relative max-w-md">
        <Search
          aria-hidden="true"
          className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2"
        />
        <Input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search by username or email"
          aria-label="Search reported users"
          className="pl-9"
        />
      </div>

      {rows.length === 0 ? (
        <div className="text-muted-foreground py-8 text-center text-sm">
          No reported users {search ? 'match your search' : 'yet'}.
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => {
            const displayName = row.username ?? '—';
            return (
              <Card key={row.userId} className="gap-3 py-4">
                <CardHeader className="px-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate font-medium">{displayName}</span>
                        <AlertTriangle
                          aria-label={`${row.reportCount} ${row.reportCount === 1 ? 'report' : 'reports'}`}
                          className="text-destructive size-4 shrink-0"
                        />
                      </div>
                      <p className="text-muted-foreground truncate text-xs">{row.email}</p>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="space-y-3 px-4">
                  <dl className="text-muted-foreground grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                    <dt>Reports</dt>
                    <dd className="text-foreground text-right font-mono">{row.reportCount}</dd>
                    <dt>Latest report</dt>
                    <dd className="text-foreground text-right">
                      {formatTimestamp(row.latestReportedAt)}
                    </dd>
                  </dl>

                  <div className="border-t pt-3">
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span>Disable chat</span>
                      <Switch
                        aria-label={`${row.chatDisabled ? 'Enable' : 'Disable'} chat for ${displayName}`}
                        checked={row.chatDisabled}
                        disabled={isPending}
                        onCheckedChange={() => handleToggleDisabled(row.userId, row.chatDisabled)}
                      />
                    </div>
                  </div>

                  <Link
                    href={`/admin/chat/users/${row.userId}`}
                    className={cn(
                      'inline-flex items-center gap-1 text-xs text-zinc-950 underline-offset-2 hover:underline'
                    )}
                  >
                    View messages
                    <ExternalLink aria-hidden="true" className="size-3" />
                  </Link>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <div
        ref={sentinelRef}
        className="flex min-h-8 items-center justify-center"
        aria-hidden={!hasNextPage}
      >
        {isFetchingNextPage ? (
          <Loader2 aria-label="Loading more reported users" className="size-5 animate-spin" />
        ) : null}
      </div>

      <div className="text-muted-foreground text-xs">
        <Button type="button" variant="outline" size="sm" onClick={invalidate} disabled={isPending}>
          Refresh
        </Button>
      </div>
    </div>
  );
};
