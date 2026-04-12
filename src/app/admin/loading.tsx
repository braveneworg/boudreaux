/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export default function AdminLoading() {
  return (
    <div className="mx-auto w-full max-w-480 px-4 md:px-8 py-8">
      {/* Heading skeleton */}
      <div className="h-10 w-48 bg-muted animate-pulse rounded mb-6" />
      {/* Combobox selector skeleton */}
      <div className="h-10 w-64 rounded-md bg-muted animate-pulse mb-8" />
      {/* Table skeleton */}
      <div className="space-y-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="h-12 w-full bg-muted animate-pulse rounded" />
        ))}
      </div>
    </div>
  );
}
