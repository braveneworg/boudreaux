/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export default function ReleasesLoading() {
  return (
    <div className="mx-auto w-full max-w-480 px-4 md:px-8 py-8">
      {/* Heading skeleton */}
      <div className="h-10 w-36 bg-muted animate-pulse rounded mb-6" />
      {/* Search skeleton */}
      <div className="h-10 w-full rounded-md bg-muted animate-pulse mb-8" />
      {/* Grid skeleton */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="space-y-2">
            <div className="aspect-square w-full rounded bg-muted animate-pulse" />
            <div className="h-4 w-3/4 bg-muted animate-pulse rounded" />
            <div className="h-3 w-1/2 bg-muted animate-pulse rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}
