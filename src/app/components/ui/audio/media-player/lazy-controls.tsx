/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import nextDynamic from 'next/dynamic';

/**
 * Lazily loaded audio Controls component.
 * Video.js (~283KB) is only fetched when this component mounts,
 * keeping it out of the initial page bundle.
 */
export const LazyControls = nextDynamic(
  () => import('./media-player-controls').then((mod) => ({ default: mod.Controls })),
  {
    ssr: false,
    loading: () => <div className="min-h-14 w-full animate-pulse rounded bg-muted" />,
  }
);
