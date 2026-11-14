/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useRef } from 'react';

import { Loader2 } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import { Skeleton } from '@/app/components/ui/skeleton';
import { useInfiniteListedSubmissionsQuery } from '@/hooks/queries/use-infinite-listed-submissions-query';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import type { SubmissionCard } from '@/lib/types/domain/submission';

import { CommunityCard } from './community-card';

/** Two cards across on a phone, three from `md`, four from `lg`: the row's widths. */
const GRID_CLASS = 'grid grid-cols-2 gap-x-4 gap-y-8 md:grid-cols-3 lg:grid-cols-4';

/** How many placeholder cards stand in for the first page. */
const SKELETON_CARDS = [0, 1, 2, 3];

/**
 * Every card of the loaded pages, in order, each id once. A submission
 * approved while a visitor scrolls shifts every later page by one, so a page
 * can repeat the last card of the one before it.
 */
const uniqueCards = (pages: Array<{ rows: SubmissionCard[] }>): SubmissionCard[] => {
  const seen = new Set<string>();

  return pages
    .flatMap(({ rows }) => rows)
    .filter(({ id }) => {
      const isNew = !seen.has(id);
      seen.add(id);
      return isNew;
    });
};

const ListSkeleton = () => (
  <div aria-busy="true">
    <p role="status" className="sr-only">
      Loading submissions…
    </p>
    <div className={GRID_CLASS}>
      {SKELETON_CARDS.map((key) => (
        <div key={key} className="flex flex-col gap-4">
          <Skeleton className="aspect-square w-full" />
          <Skeleton className="h-4 w-2/3" />
        </div>
      ))}
    </div>
  </div>
);

export interface CommunityListProps {
  /** A username from `/community?user=`: only that user's listed submissions. */
  user?: string;
  /** What to say when nothing is listed. */
  emptyMessage: string;
}

/**
 * The community page's full list: every listed submission, newest first, as
 * a grid of cards that loads the next page as the visitor nears its end. The
 * first page comes hydrated from the server's prefetch. With a `user` it
 * holds only that user's.
 *
 * A failed first read offers another try; a failed later page leaves the
 * cards already shown in place.
 */
export const CommunityList = ({ user = '', emptyMessage }: CommunityListProps) => {
  const { data, isPending, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfiniteListedSubmissionsQuery(user);

  const sentinelRef = useRef<HTMLDivElement>(null);
  useInfiniteScroll(sentinelRef, { hasNextPage, isFetchingNextPage, fetchNextPage });

  if (isPending) {
    return <ListSkeleton />;
  }

  if (error && !data) {
    return (
      <div role="alert" className="flex flex-col items-start gap-4 py-6">
        <p className="text-zinc-950">Unable to load submissions.</p>
        <Button variant="outline" onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const cards = uniqueCards(data?.pages ?? []);

  if (cards.length === 0) {
    return <p className="py-6 text-zinc-950">{emptyMessage}</p>;
  }

  return (
    <>
      <ul className={GRID_CLASS}>
        {cards.map((card) => (
          <li key={card.id} className="min-w-0">
            <CommunityCard card={card} />
          </li>
        ))}
      </ul>
      <div
        ref={sentinelRef}
        className="flex min-h-12 items-center justify-center py-2"
        aria-hidden={!hasNextPage}
      >
        {isFetchingNextPage ? (
          <>
            <Loader2 className="size-6 animate-spin text-zinc-950" aria-hidden="true" />
            <span role="status" className="sr-only">
              Loading more submissions…
            </span>
          </>
        ) : null}
      </div>
    </>
  );
};
