/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useRef } from 'react';

import Link from 'next/link';

import { Loader2 } from 'lucide-react';

import { usePublishedReleasesQuery } from '@/app/hooks/use-infinite-published-releases-query';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import type { PublishedReleaseListing } from '@/lib/types/media-models';
import {
  getArtistDisplayNameForRelease,
  getBandcampUrl,
  getReleaseCoverArt,
} from '@/lib/utils/release-helpers';

import { ReleaseCardGrid } from './release-card-grid';
import { ReleaseSearchCombobox } from './release-search-combobox';

/**
 * Transform a release listing into the shape expected by ReleaseCardGrid.
 */
const toCardRelease = (release: PublishedReleaseListing) => {
  const artistName = release.artistReleases[0]
    ? getArtistDisplayNameForRelease(release.artistReleases[0].artist)
    : 'Unknown Artist';

  return {
    id: release.id,
    title: release.title,
    artistName: artistName ?? 'Unknown Artist',
    coverArt: getReleaseCoverArt(release),
    bandcampUrl: getBandcampUrl(release),
  };
};

/**
 * Client content wrapper for the releases listing page.
 *
 * Pages through published releases with infinite scroll (the first page is
 * hydrated from the SSR prefetch). The search combobox is self-contained and
 * queries the server directly, so it is not coupled to the loaded pages.
 */
export const ReleasesContent = () => {
  const { data, isPending, error, fetchNextPage, hasNextPage, isFetchingNextPage } =
    usePublishedReleasesQuery();

  const sentinelRef = useRef<HTMLDivElement>(null);
  useInfiniteScroll(sentinelRef, { hasNextPage, isFetchingNextPage, fetchNextPage });

  if (isPending) {
    return (
      <div className="flex min-h-100 items-center justify-center">
        <Loader2 className="text-zinc-950-foreground h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="flex flex-col items-center gap-4 px-4 py-12 text-center">
        <p className="text-zinc-950-foreground">Unable to load releases. Please try again later.</p>
        <Link
          href="/releases"
          className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-md px-4 py-2"
        >
          Try again
        </Link>
      </div>
    );
  }

  const releases = data?.pages.flatMap((page) => page.rows) ?? [];
  const cardReleases = releases.map(toCardRelease);

  return (
    <div className="flex flex-col gap-6 px-4 py-4">
      <ReleaseSearchCombobox />
      <ReleaseCardGrid releases={cardReleases} />
      <div
        ref={sentinelRef}
        className="flex min-h-12 items-center justify-center py-2"
        aria-hidden={!hasNextPage}
      >
        {isFetchingNextPage ? (
          <Loader2 className="text-zinc-950-foreground h-6 w-6 animate-spin" />
        ) : null}
      </div>
    </div>
  );
};
