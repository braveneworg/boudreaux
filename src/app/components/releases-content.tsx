/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useRef } from 'react';
import type { ReactElement } from 'react';

import Link from 'next/link';

import { Eye, Loader2 } from 'lucide-react';

import { Button } from '@/app/components/ui/button';
import { ImageHeading } from '@/app/components/ui/image-heading';
import { Skeleton } from '@/app/components/ui/skeleton';
import { useInfinitePublishedReleasesQuery } from '@/hooks/queries/use-infinite-published-releases-query';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import {
  publishedReleasesToSpotlightCards,
  SPOTLIGHT_COVER_SPAN_CLASS,
  SPOTLIGHT_GRID_CLASS,
} from '@/lib/utils/spotlight-card';

import { DeepLinkPlayDialog, type DeepLinkRelease } from './deep-link-play-dialog';
import { ReleaseSearchCombobox } from './release-search-combobox';
import { SpotlightCard } from './spotlight-card';

/** Cover skeletons in the loading grid: two rows of the four-up desktop grid. */
const SKELETON_CARD_COUNT = 8;

/**
 * Loading skeleton mirroring the real layout — the search bar and the
 * RELEASES wordmark in the cover-span column, then the 1/2/4-column grid of
 * square covers over a one-line caption — so nothing jumps when the first
 * page lands. Also the `/releases` route's `loading.tsx` fallback.
 */
export const ReleasesSkeleton = (): ReactElement => (
  <div aria-busy="true">
    <p role="status" className="sr-only">
      Loading releases…
    </p>
    <div className="mb-8">
      <div className={SPOTLIGHT_COVER_SPAN_CLASS}>
        <Skeleton data-testid="releases-search-skeleton" className="my-0 h-10 w-full" />
        {/* The wordmark's box: a full-width 4:1 image below `sm`, fixed
            h-14 (224px wide) from `sm` up. */}
        <Skeleton
          data-testid="releases-heading-skeleton"
          className="mt-7 mb-0 aspect-[4/1] w-full sm:aspect-auto sm:h-14 sm:w-56"
        />
      </div>
    </div>
    <div data-testid="releases-grid-skeleton" className={SPOTLIGHT_GRID_CLASS}>
      {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
        <div
          key={index}
          data-testid="releases-card-skeleton"
          className="mx-auto flex w-full flex-col gap-3 sm:max-w-52"
        >
          <Skeleton className="my-0 aspect-square w-full" />
          <Skeleton className="mx-auto my-0 h-4 w-3/5" />
        </div>
      ))}
    </div>
  </div>
);

/** Error state with a retry that refetches the listing in place. */
const ReleasesError = ({ onRetry }: { onRetry: () => void }): ReactElement => (
  <div className="flex flex-col items-center gap-4 py-12 text-center">
    <p className="text-zinc-950">Unable to load releases. Please try again later.</p>
    <Button variant="outline" onClick={onRetry}>
      Try again
    </Button>
  </div>
);

interface ReleasesHeaderProps {
  /** Show the touch-only tap hint: only when there are covers to tap. */
  showTapHint: boolean;
  /** Show the link back to every artist's releases: only when filtered by artist. */
  showAllArtistsLink: boolean;
  /** The filtered artist's display name, named under the wordmark; `''` when unfiltered. */
  artistName: string;
}

/**
 * The search, then the RELEASES wordmark, in one column as wide as the
 * covers' outer edges (as on the home page), with the filtered artist's name
 * and the "View releases by all artists" link under the wordmark when the
 * listing is filtered by artist, then the touch-only tap hint.
 */
const ReleasesHeader = ({
  showTapHint,
  showAllArtistsLink,
  artistName,
}: ReleasesHeaderProps): ReactElement => (
  <div className="mb-8">
    {/* The search and the wordmark share this column so the wordmark's left
        edge sits on the search box's left edge at every column count. */}
    <div className={SPOTLIGHT_COVER_SPAN_CLASS}>
      <ReleaseSearchCombobox />
      <ImageHeading
        src="/media/headings/RELEASES.webp"
        alt="releases"
        imageHeight={480}
        priority
        className="mt-7 mb-0 -ml-1.5 block text-left"
      />
      {artistName ? (
        <h2 className="mt-3 text-xl font-semibold text-zinc-950">Releases by {artistName}</h2>
      ) : null}
      {showAllArtistsLink ? (
        <p className="mt-3 text-sm">
          <Link
            href="/releases"
            className="inline-flex items-center gap-1.5 underline underline-offset-2 hover:no-underline"
          >
            <Eye className="size-4" aria-hidden="true" />
            <span>View releases by all artists</span>
          </Link>
        </p>
      ) : null}
    </div>
    {/* Touch screens get no hover stamp on the covers, so they get this line
        instead; `hover:none` is the same test that keeps the stamp to hover
        and keyboard focus. */}
    {showTapHint ? (
      <p className="mt-4 hidden text-center text-sm text-zinc-600 [@media(hover:none)]:block">
        <strong className="font-bold text-zinc-950">Tap</strong> any release art to play or download
        the music
      </p>
    ) : null}
  </div>
);

interface ReleasesListingProps {
  /** Artist slug from `/releases?artist=`: list only that artist's releases. */
  artist: string;
  /** The display name of the `artist` slug's artist, named under the wordmark. */
  artistName: string;
}

interface ReleasesContentProps extends Partial<ReleasesListingProps> {
  /**
   * The release a deep link (`&release=<id>`) names, resolved by the page:
   * its listening modal opens on arrival. `null` when there is none.
   */
  initialRelease?: DeepLinkRelease | null;
}

/**
 * Client content island for the public `/releases` listing, laid out like the
 * home page: the search and the RELEASES wordmark, then a grid of release
 * covers, each captioned with the artist (linked to `/releases?artist=<slug>`)
 * above the title. A cover opens the listening modal on the release's first
 * track, in the page's cyan accent.
 *
 * With an `artist` slug the grid lists only the releases that artist holds a
 * release credit on (their bands' included), and the artist's name and a
 * "View releases by all artists" link sit under the wordmark.
 *
 * Pages through published releases with infinite scroll (the first page is
 * hydrated from the SSR prefetch, so the covers are server-rendered), with no
 * cap on the card count. The search combobox is self-contained and queries
 * the server directly (across every artist), so it is not coupled to the
 * loaded pages.
 *
 * With an `initialRelease` (a release deep link) that release's listening
 * modal opens over the filtered grid on arrival.
 */
export const ReleasesContent = ({
  artist = '',
  artistName = '',
  initialRelease = null,
}: ReleasesContentProps): ReactElement => (
  <>
    <ReleasesListing artist={artist} artistName={artistName} />
    {initialRelease && artist ? (
      <DeepLinkPlayDialog release={initialRelease} artistSlug={artist} />
    ) : null}
  </>
);

/** The search, the wordmark and the paged cover grid, in their loading, error and empty states. */
const ReleasesListing = ({ artist, artistName }: ReleasesListingProps): ReactElement => {
  const { data, isPending, error, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfinitePublishedReleasesQuery('', artist);
  const showAllArtistsLink = artist !== '';

  const sentinelRef = useRef<HTMLDivElement>(null);
  useInfiniteScroll(sentinelRef, { hasNextPage, isFetchingNextPage, fetchNextPage });

  if (isPending) {
    return <ReleasesSkeleton />;
  }

  if (error && !data) {
    return (
      <>
        <ReleasesHeader
          showTapHint={false}
          showAllArtistsLink={showAllArtistsLink}
          artistName={artistName}
        />
        <ReleasesError onRetry={refetch} />
      </>
    );
  }

  const cards = publishedReleasesToSpotlightCards(data?.pages.flatMap((page) => page.rows) ?? []);

  return (
    <>
      <ReleasesHeader
        showTapHint={cards.length > 0}
        showAllArtistsLink={showAllArtistsLink}
        artistName={artistName}
      />

      {cards.length === 0 ? (
        <p className="py-12 text-center text-lg text-zinc-500">No releases available.</p>
      ) : (
        <ul className={SPOTLIGHT_GRID_CLASS}>
          {cards.map((card) => (
            <li key={card.releaseId}>
              <SpotlightCard card={card} caption="releases" accent="cyan" />
            </li>
          ))}
        </ul>
      )}

      <div
        ref={sentinelRef}
        className="flex min-h-12 items-center justify-center py-2"
        aria-hidden={!hasNextPage}
      >
        {isFetchingNextPage ? (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-zinc-950" aria-hidden="true" />
            <span role="status" className="sr-only">
              Loading more releases…
            </span>
          </>
        ) : null}
      </div>
    </>
  );
};
