/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export default function HomeLoading() {
  return (
    <div className="w-full">
      {/* Banner skeleton */}
      <div className="relative w-full animate-pulse bg-muted" style={{ paddingBottom: '61.8%' }} />
      {/* Dot indicators skeleton */}
      <div className="flex justify-center gap-2 py-2">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="h-2.5 w-2.5 rounded-full bg-muted animate-pulse" />
        ))}
      </div>
      {/* Content area skeleton */}
      <div className="mx-auto w-full max-w-480 px-4 md:px-8 mt-4">
        {/* Search input skeleton */}
        <div className="h-10 w-full rounded-md bg-muted animate-pulse mb-8" />
        {/* Featured artists heading skeleton */}
        <div className="h-10 w-48 bg-muted animate-pulse rounded mb-6" />
        {/* Featured artists carousel skeleton */}
        <div className="h-20 w-full bg-muted animate-pulse rounded mb-4" />
        {/* Cover art skeleton (square aspect ratio) */}
        <div className="aspect-square w-full max-w-xl mx-auto bg-muted animate-pulse rounded mb-2" />
        {/* Audio controls skeleton */}
        <div className="h-14 w-full max-w-xl mx-auto bg-muted animate-pulse rounded" />
      </div>
    </div>
  );
}
