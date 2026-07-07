/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type * as React from 'react';

/**
 * Skeleton mirroring FeaturedArtistsPlayer's stacked internals (carousel row,
 * link row, square cover art, controls, ticker, share row). Shared by the
 * home route's Suspense fallback (`(home)/loading.tsx`) and the player's
 * dynamic-import `loading` fallback (`home-content.tsx`) so route-fallback →
 * chunk-fallback → hydrated player swaps in place at every breakpoint.
 * Directive-free on purpose: server-rendered in the route fallback,
 * client-rendered in the dynamic fallback.
 */
export const FeaturedArtistsPlayerSkeleton = (): React.ReactElement => (
  <div aria-hidden="true" data-testid="featured-artists-player-skeleton">
    {/* Featured artists carousel skeleton — matches the min-h-[76px] wrapper. */}
    <div className="bg-muted mb-1 min-h-19 w-full animate-pulse" />
    {/* View / Download link-row + NowPlayingHeading skeleton.
        min-h-10 holds the row stable across loading → hydrated states. */}
    <div className="mb-2 flex min-h-10 flex-col items-center">
      <div className="bg-muted h-6 w-72 animate-pulse" />
    </div>
    {/* Cover art skeleton — aspect-square with bg-muted */}
    <div className="bg-muted mx-auto aspect-square w-full max-w-xl animate-pulse" />
    {/* Audio controls skeleton — matches bg-zinc-900 min-h-16 */}
    <div className="mx-auto min-h-16 w-full max-w-xl animate-pulse bg-zinc-900/20" />
    {/* InfoTickerTape skeleton — matches bg-zinc-800 min-h-[40px] */}
    <div className="mx-auto mb-2 min-h-10 w-full max-w-xl animate-pulse bg-zinc-800/20" />
    {/* Share widget skeleton */}
    <div className="mb-2 flex justify-center gap-1">
      <div className="bg-muted h-8 w-48 animate-pulse" />
    </div>
  </div>
);
