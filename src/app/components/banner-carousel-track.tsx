/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { type CSSProperties, type PointerEvent, type RefObject } from 'react';

import Image from 'next/image';

import { BANNER_ASPECT_PADDING } from '@/lib/constants/banner-slots';

import { buildBannerSrc, type BannerSlotData } from './banner-carousel';

interface SlideRingContext {
  idx: number;
  currentIndex: number;
  prevIndex: number;
  nextIndex: number;
  incomingIndex: number | null;
  totalSlides: number;
}

interface SlideLayout {
  isCurrent: boolean;
  shouldRenderImage: boolean;
  style: Pick<CSSProperties, 'transform' | 'visibility'>;
}

/** Resolve which of the ring positions `idx` occupies relative to the current slide. */
const resolveSlideTransform = (
  position: Pick<SlideRingContext, 'idx' | 'currentIndex' | 'prevIndex' | 'nextIndex'>
): CSSProperties['transform'] => {
  if (position.idx === position.prevIndex) return 'translateX(-100%)';
  if (position.idx === position.nextIndex) return 'translateX(100%)';
  if (position.idx === position.currentIndex) return 'translateX(0)';
  return 'translateX(-200%)';
};

/**
 * Compute per-slide layout: position transform, visibility, and whether to mount
 * the image. The current slide and any adjacent (or incoming) slide render
 * eagerly so a swipe reveals a ready neighbor; all others stay parked offscreen.
 */
const computeSlideLayout = (ctx: SlideRingContext): SlideLayout => {
  const isCurrent = ctx.idx === ctx.currentIndex;
  const isPrev = ctx.idx === ctx.prevIndex;
  const isNext = ctx.idx === ctx.nextIndex;
  const isVisible = isCurrent || (ctx.totalSlides > 1 && (isPrev || isNext));
  const shouldRenderImage = isVisible || ctx.idx === ctx.incomingIndex;

  return {
    isCurrent,
    shouldRenderImage,
    style: {
      transform: resolveSlideTransform(ctx),
      visibility: isVisible ? 'visible' : 'hidden',
    },
  };
};

interface BannerCarouselTrackProps {
  banners: BannerSlotData[];
  currentIndex: number;
  prevIndex: number;
  nextIndex: number;
  incomingIndex: number | null;
  totalSlides: number;
  /** Outer aspect-ratio box — its `offsetWidth` drives swipe distance math. */
  containerRef: RefObject<HTMLDivElement | null>;
  /** Inner sliding element that the carousel translates during transitions. */
  trackRef: RefObject<HTMLDivElement | null>;
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
}

/**
 * The swipeable image track. Holds every banner absolutely stacked; the active
 * slide sits at `translateX(0)` with its neighbors parked one viewport to each
 * side, so a drag/animation slides the whole track horizontally. Pointer
 * handlers come from {@link useBannerCarouselDrag}.
 */
export const BannerCarouselTrack = ({
  banners,
  currentIndex,
  prevIndex,
  nextIndex,
  incomingIndex,
  totalSlides,
  containerRef,
  trackRef,
  onPointerDown,
  onPointerMove,
  onPointerUp,
}: BannerCarouselTrackProps) => (
  <div
    ref={containerRef}
    className="relative w-full overflow-hidden"
    style={{ paddingBottom: BANNER_ASPECT_PADDING }}
  >
    <div
      ref={trackRef}
      className="absolute inset-0 touch-pan-y"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      role="group"
      aria-roledescription="slide"
      aria-label={`Banner ${currentIndex + 1} of ${totalSlides}`}
    >
      {banners.map((banner, idx) => {
        const layout = computeSlideLayout({
          idx,
          currentIndex,
          prevIndex,
          nextIndex,
          incomingIndex,
          totalSlides,
        });

        return (
          <div
            key={banner.slotNumber}
            className="pointer-events-none absolute inset-0 select-none"
            style={layout.style}
          >
            {layout.shouldRenderImage && (
              // No `priority` here: it emits an unconditional <link rel=preload>
              // the browser also honors on desktop, where this carousel is
              // `md:hidden` — producing Chrome's "preloaded but not used" warning.
              // The mobile LCP preload is instead a media-scoped link in
              // app/page.tsx. `loading="eager"` + high `fetchPriority` on the
              // current slide keep it first in the request queue once it renders.
              <Image
                src={buildBannerSrc(banner.imageFilename)}
                alt={`Banner ${banner.slotNumber}`}
                fill
                // Full-bleed below `xl`, but the `<main>` ancestor caps width at
                // `max-w-7xl` (1280px) from `xl` up, so above 1280px the banner
                // never fills the viewport — match `sizes` so the browser picks
                // the 1280px variant instead of a larger full-viewport one.
                sizes="(min-width: 1280px) 1280px, 100vw"
                fetchPriority={layout.isCurrent ? 'high' : 'low'}
                loading={layout.isCurrent ? 'eager' : 'lazy'}
                className="object-cover"
              />
            )}
          </div>
        );
      })}
    </div>
  </div>
);
