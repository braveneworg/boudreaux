/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import nextDynamic from 'next/dynamic';

/**
 * Lazily loaded video.js surface. video.js (~283KB) is only fetched when this
 * component mounts — i.e. after the user presses play on the poster facade —
 * keeping it out of every initial page bundle that renders a VideoPlayer.
 */
export const LazyVideoSurface = nextDynamic(
  () => import('./video-player-surface').then((mod) => ({ default: mod.VideoPlayerSurface })),
  {
    ssr: false,
    loading: () => <div className="bg-muted aspect-video w-full animate-pulse" />,
  }
);
