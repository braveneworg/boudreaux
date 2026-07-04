/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Neutral root Suspense fallback for routes without their own `loading.tsx`.
 * Deliberately renders no images and nothing page-specific — the home banner
 * fallback lives in `(home)/loading.tsx` so it only shows for `/`.
 */
export default function RootLoading() {
  return (
    <div className="mx-auto w-full max-w-480 px-4 py-8 md:px-8">
      {/* Breadcrumb skeleton */}
      <div className="bg-muted mb-6 h-5 w-40 animate-pulse" />
      {/* Heading skeleton */}
      <div className="bg-muted mb-8 h-10 w-56 animate-pulse" />
      {/* Content skeletons */}
      <div className="space-y-4">
        <div className="bg-muted h-4 w-full animate-pulse" />
        <div className="bg-muted h-4 w-5/6 animate-pulse" />
        <div className="bg-muted h-4 w-2/3 animate-pulse" />
        <div className="bg-muted mt-8 h-60 w-full animate-pulse" />
      </div>
    </div>
  );
}
