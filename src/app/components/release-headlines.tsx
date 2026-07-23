/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import * as React from 'react';

import Link from 'next/link';

import { ChevronDown } from 'lucide-react';

import { useInfinitePublishedReleasesQuery } from '@/hooks/queries/use-infinite-published-releases-query';
import { getArtistDisplayNameForRelease } from '@/lib/utils/release-helpers';

/** How close to the pane's bottom edge (px) before the next page loads. */
const NEAR_BOTTOM_THRESHOLD_PX = 64;

/** Placeholder copy until each release gets real descriptive text. */
const PLACEHOLDER_COPY =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Sed do eiusmod tempor incididunt ut labore et dolore magna aliqua, ut enim ad minim veniam quis nostrud.';

/**
 * Desktop-only column of release headlines for the landing page: an
 * infinitely-scrolling run of cutout release titles (linking to each
 * release's player page) over a subtle artist subtitle (linking to the
 * artist page) and placeholder copy. Borderless by design — the scroll
 * affordance is the fade into the panel paper at the pane's bottom edge
 * plus a bouncing chevron, not chrome around each entry.
 */
export const ReleaseHeadlines = (): React.ReactElement => {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInfinitePublishedReleasesQuery('');

  const releases = React.useMemo(() => (data?.pages ?? []).flatMap((page) => page.rows), [data]);

  /** Pull the next page as the pane nears its bottom edge. */
  const handleScroll = React.useCallback(
    (event: React.UIEvent<HTMLDivElement>) => {
      if (!hasNextPage || isFetchingNextPage) return;
      const { scrollTop, clientHeight, scrollHeight } = event.currentTarget;
      if (scrollTop + clientHeight >= scrollHeight - NEAR_BOTTOM_THRESHOLD_PX) {
        void fetchNextPage();
      }
    },
    [hasNextPage, isFetchingNextPage, fetchNextPage]
  );

  return (
    <aside
      data-slot="release-headlines"
      aria-label="Latest releases"
      className="relative hidden min-w-0 lg:block"
    >
      <div
        data-slot="release-headlines-pane"
        onScroll={handleScroll}
        className="max-h-[560px] overflow-y-auto pr-3 pb-14"
      >
        <ul className="space-y-7">
          {releases.map((release) => {
            const artist = release.artistReleases[0]?.artist;
            return (
              <li key={release.id}>
                <Link
                  href={`/releases/${release.id}`}
                  className="font-fake-four-cutout block text-2xl leading-tight tracking-wide text-black uppercase hover:underline"
                >
                  {release.title}
                </Link>
                {artist && (
                  <Link
                    href={`/artists/${artist.slug}`}
                    className="text-sm text-zinc-600 hover:text-zinc-950 hover:underline"
                  >
                    {getArtistDisplayNameForRelease(artist)}
                  </Link>
                )}
                <p className="mt-1 text-sm leading-relaxed text-zinc-700">{PLACEHOLDER_COPY}</p>
              </li>
            );
          })}
        </ul>
        {isFetchingNextPage && (
          <div className="py-3 text-center text-xs text-zinc-500">Loading more…</div>
        )}
      </div>
      {/* Scroll cue: the last entries dissolve into the panel paper and a
          chevron nudges downward. */}
      <div
        data-slot="release-headlines-fade"
        aria-hidden="true"
        className="from-menu-item-tan-100 pointer-events-none absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t to-transparent"
      />
      <ChevronDown
        aria-hidden="true"
        className="pointer-events-none absolute bottom-1 left-1/2 size-5 -translate-x-1/2 animate-bounce text-zinc-500"
      />
    </aside>
  );
};
