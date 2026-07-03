/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export default function ReleasesLoading() {
  return (
    <div className="mx-auto w-full max-w-480 px-4 py-8 md:px-8">
      {/* Heading skeleton */}
      <div className="bg-muted mb-6 h-10 w-36 animate-pulse" />
      {/* Search skeleton */}
      <div className="bg-muted mb-8 h-10 w-full animate-pulse" />
      {/* Grid skeleton */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
        {Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="space-y-2">
            <div className="bg-muted aspect-square w-full animate-pulse" />
            <div className="bg-muted h-4 w-3/4 animate-pulse" />
            <div className="bg-muted h-3 w-1/2 animate-pulse" />
          </div>
        ))}
      </div>
    </div>
  );
}
