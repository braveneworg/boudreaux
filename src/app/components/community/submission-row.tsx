/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useId } from 'react';

import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from '@/app/components/ui/carousel';
import { ZineHeading } from '@/app/components/ui/zine-heading';
import type { SubmissionCard } from '@/lib/types/domain/submission';

import { CommunityCard } from './community-card';

/** How many cards fit across at the widest layout; more than this loops. */
const CARDS_ACROSS = 4;

/**
 * A move is a jump, not a slide, for a visitor who prefers reduced motion.
 * Embla reads the media query itself and treats a duration of zero as
 * instant.
 */
const REDUCED_MOTION = { '(prefers-reduced-motion: reduce)': { duration: 0 } };

/** The zine stamp both of the row's buttons wear, in place over the heading line. */
const STAMP_CLASS =
  'shadow-zine-ink static size-9 translate-y-0 border-2 border-black bg-white hover:bg-white active:translate-x-0.5 active:translate-y-0.5 active:shadow-none disabled:opacity-40';

export interface SubmissionRowProps {
  /** The row's name: "Most Recent", "Trending". */
  heading: string;
  /** Its cards, in order; a fixed set of at most twelve. */
  cards: SubmissionCard[];
}

/**
 * A submission row (CONTEXT.md): a named, fixed set of listed submissions
 * the community page leads with, four across from `lg`, three from `md` and
 * two below. It loops in both directions when it holds more cards than fit
 * across, and never fetches more. Its buttons and, with focus inside it, the
 * left and right arrow keys move it. A row with no cards renders nothing.
 */
export const SubmissionRow = ({ heading, cards }: SubmissionRowProps) => {
  const headingId = useId();

  if (cards.length === 0) {
    return null;
  }

  return (
    <Carousel
      aria-labelledby={headingId}
      opts={{ loop: cards.length > CARDS_ACROSS, align: 'start', breakpoints: REDUCED_MOTION }}
    >
      <div className="flex items-end justify-between gap-3">
        <ZineHeading level={2} id={headingId} className="mb-0">
          {heading}
        </ZineHeading>
        <div className="flex shrink-0 gap-2 pb-1">
          <CarouselPrevious
            variant="outline"
            className={STAMP_CLASS}
            aria-label={`Previous in ${heading}`}
          />
          <CarouselNext
            variant="outline"
            className={STAMP_CLASS}
            aria-label={`Next in ${heading}`}
          />
        </div>
      </div>
      {/* The padding keeps each card's offset shadow and avatar inside the
          clipped track. */}
      <CarouselContent className="-ml-4 pt-4 pb-5">
        {cards.map((card) => (
          <CarouselItem key={card.id} className="basis-1/2 pl-4 md:basis-1/3 lg:basis-1/4">
            <CommunityCard card={card} />
          </CarouselItem>
        ))}
      </CarouselContent>
    </Carousel>
  );
};
