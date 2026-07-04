/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import Image from 'next/image';

import { buildBannerSrc, type BannerSlotData } from './banner-carousel';
import { BannerNotificationTicker } from './banner-notification-ticker';

/**
 * Native aspect ratio of every banner source asset (1920×1097). Applied to
 * each cell so the browser reserves the correct height from its width before
 * the image loads — this is what keeps the stitched strip free of cumulative
 * layout shift. Matches `BANNER_ASPECT_PADDING` (1097 / 1920 ≈ 57.14%).
 */
const BANNER_CELL_ASPECT = 'aspect-[1920/1097]';

interface BannerStripProps {
  banners: BannerSlotData[];
  /** Seconds each desktop notification shows before rotating. Threaded to the ticker. */
  rotationInterval?: number;
}

/**
 * Desktop banner treatment: instead of the mobile carousel, the active
 * banners are stitched edge-to-edge into a single horizontal strip, centered
 * and capped at 1280px wide. Each cell is an equal-width flex child carrying
 * the banner's native aspect ratio, so the row forms one continuous,
 * uncropped image band with no layout shift as the images stream in.
 *
 * Renders nothing when there are no banners (the homepage data is hydrated
 * from an SSR prefetch, so an empty strip is the no-banners case rather than a
 * transient loading state).
 */
export const BannerStrip = ({ banners, rotationInterval }: BannerStripProps) => {
  if (banners.length === 0) return null;

  // Each cell occupies an equal 1/N slice of the strip. The strip is capped at
  // 1280px, so above that width a cell is a fixed 1280/N px; below it the cells
  // share the viewport evenly. Feeding both to `sizes` lets next/image pick the
  // right variant instead of over-fetching a full-width asset per cell.
  const cellCount = banners.length;
  const cellPx = Math.round(1280 / cellCount);
  const cellVw = Math.round(100 / cellCount);
  const sizes = `(min-width: 1280px) ${cellPx}px, ${cellVw}vw`;

  return (
    <section
      aria-label="Banners"
      data-testid="banner-strip"
      className="zine-accent-yellow shadow-zine-sm mx-auto hidden w-full max-w-7xl border-2 border-black md:block xl:border-t-0"
    >
      {/* Desktop notifications sit above the stitched image band, rotating on
          their own timer since the desktop banners don't slide. */}
      <BannerNotificationTicker banners={banners} rotationInterval={rotationInterval} />
      <div className="flex w-full">
        {banners.map((banner, index) => (
          <div key={banner.slotNumber} className={`relative flex-1 ${BANNER_CELL_ASPECT}`}>
            <Image
              src={buildBannerSrc(banner.imageFilename)}
              alt={`Banner ${banner.slotNumber}`}
              fill
              sizes={sizes}
              // The strip sits above the fold on desktop, but the carousel
              // renders the same banners at smaller breakpoints. We avoid
              // `priority` (a <link rel=preload>) here because it would be
              // "preloaded but not used" on viewports showing the carousel
              // instead. Eager loading + a high fetch priority on the first
              // cell still gets the desktop LCP image promptly, no preload.
              loading="eager"
              fetchPriority={index === 0 ? 'high' : 'low'}
              className="object-cover"
            />
          </div>
        ))}
      </div>
    </section>
  );
};
