/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Loading skeleton for tours pages
 */
export default function ToursLoading() {
  const skeletonCards = ['one', 'two', 'three', 'four', 'five', 'six'];

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8 space-y-2">
        <div className="h-10 w-48 animate-pulse rounded-lg bg-muted" />
        <div className="h-6 w-96 animate-pulse rounded-lg bg-muted" />
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {skeletonCards.map((card) => (
          <div key={`tour-skeleton-${card}`} className="overflow-hidden rounded-lg border bg-card">
            {/* Image skeleton */}
            <div className="aspect-video w-full animate-pulse bg-muted" />

            {/* Content skeleton */}
            <div className="space-y-4 p-6">
              <div className="space-y-2">
                <div className="h-6 w-3/4 animate-pulse rounded bg-muted" />
                <div className="h-4 w-1/2 animate-pulse rounded bg-muted" />
              </div>

              <div className="space-y-2">
                <div className="h-4 w-full animate-pulse rounded bg-muted" />
                <div className="h-4 w-5/6 animate-pulse rounded bg-muted" />
                <div className="h-4 w-4/6 animate-pulse rounded bg-muted" />
              </div>

              <div className="flex gap-2 pt-2">
                <div className="h-10 flex-1 animate-pulse rounded bg-muted" />
                <div className="h-10 flex-1 animate-pulse rounded bg-muted" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
