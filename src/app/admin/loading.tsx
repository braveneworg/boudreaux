/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export default function AdminLoading() {
  return (
    <div className="mx-auto w-full max-w-480 px-4 py-8 md:px-8">
      {/* Heading skeleton */}
      <div className="bg-muted mb-6 h-10 w-48 animate-pulse rounded" />
      {/* Combobox selector skeleton */}
      <div className="bg-muted mb-8 h-10 w-64 animate-pulse rounded-md" />
      {/* Table skeleton */}
      <div className="space-y-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="bg-muted h-12 w-full animate-pulse rounded" />
        ))}
      </div>
    </div>
  );
}
