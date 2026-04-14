/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

export default function HomeLoading() {
  return (
    <div className="w-full">
      {/* Notification strip skeleton — always reserves 2.5rem to match banner-carousel */}
      <div className="w-full bg-muted animate-pulse" style={{ minHeight: '2.5rem' }} />
      {/* Banner skeleton — matches 61.8% golden ratio padding */}
      <div className="relative w-full animate-pulse bg-muted" style={{ paddingBottom: '61.8%' }} />
      {/* Dot indicators skeleton — matches h-11 w-11 button wrappers */}
      <div className="flex justify-center gap-2 py-2">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex items-center justify-center h-11 w-11">
            <div className="h-2.5 w-2.5 rounded-full bg-muted animate-pulse" />
          </div>
        ))}
      </div>
      {/* Content area skeleton — matches ContentContainer: bg-zinc-100, border-t, px-2 */}
      <div className="flex-1 font-sans bg-zinc-100 border-t border-t-zinc-300 min-h-full flex flex-col w-full pt-2 px-2">
        {/* Search input skeleton */}
        <div className="h-9 w-full rounded-md bg-muted animate-pulse mb-0" />
        {/* Featured artists heading skeleton — matches Heading level={1}: h-[52px] */}
        <div className="h-[52px] w-48 bg-muted animate-pulse rounded mb-0" />
        {/* Featured artists carousel skeleton — matches min-h-[76px] wrapper */}
        <div className="min-h-[76px] w-full bg-muted animate-pulse rounded mb-2" />
        {/* FormatFileListDrawer + Download button skeleton */}
        <div className="flex flex-col items-center min-h-10 mb-2">
          <div className="h-10 w-48 bg-muted animate-pulse rounded" />
        </div>
        {/* Cover art skeleton — aspect-square with bg-muted, rounded-t */}
        <div className="aspect-square w-full max-w-xl mx-auto bg-muted animate-pulse rounded-t-lg" />
        {/* Audio controls skeleton — matches bg-zinc-900 min-h-14 */}
        <div className="min-h-14 w-full max-w-xl mx-auto bg-zinc-900/20 animate-pulse" />
        {/* InfoTickerTape skeleton — matches bg-zinc-800 rounded-b-lg min-h-[40px] */}
        <div className="min-h-[40px] w-full max-w-xl mx-auto bg-zinc-800/20 animate-pulse rounded-b-lg mb-2" />
        {/* Share widget skeleton */}
        <div className="flex justify-center gap-1 mb-2">
          <div className="h-8 w-48 bg-muted animate-pulse rounded" />
        </div>
        <div className="h-px max-w-[calc(100%-2rem)] mx-auto bg-muted" />
      </div>
    </div>
  );
}
