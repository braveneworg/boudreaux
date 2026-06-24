/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { cn } from '@/lib/utils';

import type { BannerSlotData } from './banner-carousel';

interface BannerCarouselDotsProps {
  banners: BannerSlotData[];
  currentIndex: number;
  /** Navigate to the dot's slide; animates if adjacent, jumps otherwise. */
  onSelect: (index: number) => void;
}

/**
 * Tablist of dot indicators below the carousel. Each dot is a 44×44 tap target
 * (the visible dot is a centered 10px circle) so it meets the mobile touch-size
 * minimum while staying visually small.
 */
export const BannerCarouselDots = ({
  banners,
  currentIndex,
  onSelect,
}: BannerCarouselDotsProps) => (
  <div className="flex justify-center gap-2 py-2" role="tablist" aria-label="Banner slides">
    {banners.map((banner, idx) => (
      <button
        key={banner.slotNumber}
        type="button"
        role="tab"
        aria-selected={idx === currentIndex}
        aria-label={`Go to banner ${idx + 1}`}
        className="flex h-11 w-11 items-center justify-center p-0"
        onClick={() => onSelect(idx)}
      >
        <span
          className={cn(
            'h-2.5 w-2.5 rounded-full transition-colors',
            idx === currentIndex ? 'bg-foreground' : 'bg-foreground/30'
          )}
        />
      </button>
    ))}
  </div>
);
