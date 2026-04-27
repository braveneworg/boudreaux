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
        <div className="bg-muted h-10 w-48 animate-pulse rounded-lg" />
        <div className="bg-muted h-6 w-96 animate-pulse rounded-lg" />
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {skeletonCards.map((card) => (
          <div key={`tour-skeleton-${card}`} className="bg-card overflow-hidden rounded-lg border">
            {/* Image skeleton */}
            <div className="bg-muted aspect-video w-full animate-pulse" />

            {/* Content skeleton */}
            <div className="space-y-4 p-6">
              <div className="space-y-2">
                <div className="bg-muted h-6 w-3/4 animate-pulse rounded" />
                <div className="bg-muted h-4 w-1/2 animate-pulse rounded" />
              </div>

              <div className="space-y-2">
                <div className="bg-muted h-4 w-full animate-pulse rounded" />
                <div className="bg-muted h-4 w-5/6 animate-pulse rounded" />
                <div className="bg-muted h-4 w-4/6 animate-pulse rounded" />
              </div>

              <div className="flex gap-2 pt-2">
                <div className="bg-muted h-10 flex-1 animate-pulse rounded" />
                <div className="bg-muted h-10 flex-1 animate-pulse rounded" />
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
