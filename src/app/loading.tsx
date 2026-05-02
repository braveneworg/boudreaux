/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BANNER_ASPECT_PADDING, BANNER_SLOTS } from '@/lib/constants/banner-slots';
import { buildBannerPreloadUrl } from '@/lib/utils/cloudfront-loader';

export default function HomeLoading() {
  return (
    <div className="w-full">
      {/* Notification strip skeleton — always reserves 2.5rem to match banner-carousel */}
      <div className="bg-muted w-full animate-pulse" style={{ minHeight: '2.5rem' }} />
      {/* Real first banner image — rendered in the Suspense fallback so it
          paints in the first HTML flush. The HTTP `Link` preload header
          configured in `next.config.ts` warms the browser cache for the same
          fixed-width URL. We intentionally use a single-width `src` (no
          `srcSet`/`sizes`) so this <img> deterministically matches the
          preloaded resource on every viewport — using a responsive srcset
          here would let Chrome's picker select a different variant and
          surface "preloaded but not used" warnings when this fallback is
          unmounted by BannerCarousel hydration. */}
      <div className="bg-muted relative w-full" style={{ paddingBottom: BANNER_ASPECT_PADDING }}>
        {/* eslint-disable-next-line @next/next/no-img-element -- Intentional: raw <img> in the Suspense fallback ensures the LCP image is in the first HTML flush without requiring client-side JS hydration. The image is pre-optimized WebP served from CloudFront. */}
        <img
          data-testid="lcp-banner-img"
          src={buildBannerPreloadUrl(BANNER_SLOTS[0].filename, 750)}
          alt=""
          fetchPriority="high"
          decoding="async"
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>
      {/* Dot indicators skeleton — matches h-11 w-11 button wrappers */}
      <div className="flex justify-center gap-2 py-2">
        {Array.from({ length: 3 }, (_, i) => (
          <div key={i} className="flex h-11 w-11 items-center justify-center">
            <div className="bg-muted h-2.5 w-2.5 animate-pulse rounded-full" />
          </div>
        ))}
      </div>
      {/* Content area skeleton — matches ContentContainer: bg-zinc-100, border-t, px-2 */}
      <div className="flex min-h-full w-full flex-1 flex-col border-t border-t-zinc-300 bg-zinc-100 px-2 pt-2 font-sans">
        {/* Search input skeleton */}
        <div className="bg-muted mb-0 h-9 w-full animate-pulse rounded-md" />
        {/* Featured artists heading skeleton — matches Heading level={1}: h-[52px] */}
        <div className="bg-muted mb-0 h-13 w-48 animate-pulse rounded" />
        {/* Featured artists carousel skeleton — matches min-h-[76px] wrapper.
            mb-1 mirrors the actual component, where the link-row uses -mt-1
            to sit closer to the carousel above. */}
        <div className="bg-muted mb-1 min-h-19 w-full animate-pulse rounded" />
        {/* View / Download link-row + NowPlayingHeading skeleton.
            min-h-10 holds the row stable across loading → hydrated states
            so there's no CLS once the link buttons render. */}
        <div className="mb-2 flex min-h-10 flex-col items-center">
          <div className="bg-muted h-6 w-72 animate-pulse rounded" />
        </div>
        {/* Cover art skeleton — aspect-square with bg-muted, rounded-t */}
        <div className="bg-muted mx-auto aspect-square w-full max-w-xl animate-pulse rounded-t-lg" />
        {/* Audio controls skeleton — matches bg-zinc-900 min-h-14 */}
        <div className="mx-auto min-h-14 w-full max-w-xl animate-pulse bg-zinc-900/20" />
        {/* InfoTickerTape skeleton — matches bg-zinc-800 rounded-b-lg min-h-[40px] */}
        <div className="mx-auto mb-2 min-h-10 w-full max-w-xl animate-pulse rounded-b-lg bg-zinc-800/20" />
        {/* Share widget skeleton */}
        <div className="mb-2 flex justify-center gap-1">
          <div className="bg-muted h-8 w-48 animate-pulse rounded" />
        </div>
        <div className="bg-muted mx-auto h-px max-w-[calc(100%-2rem)]" />
      </div>
    </div>
  );
}
