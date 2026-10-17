/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { ReactElement } from 'react';

import { SPOTLIGHT_LIMIT } from '@/hooks/queries/use-active-featured-artists-query';
import {
  SPOTLIGHT_GRID_CLASS,
  type SpotlightCard as SpotlightCardData,
} from '@/lib/utils/spotlight-card';

import { SpotlightCard } from './spotlight-card';

interface SpotlightGridProps {
  /** The spotlight cards, or the newest-releases fallback when there are none. */
  cards: SpotlightCardData[];
}

/**
 * The home page's grid of spotlight covers, laid out by
 * {@link SPOTLIGHT_GRID_CLASS} (the `/releases` grid uses it too), at most
 * {@link SPOTLIGHT_LIMIT} cards. Each cover opens the home page's play modal:
 * a new loud accent on each open, the artist linked to their page, the year,
 * and a "View all releases" link. Renders nothing without cards.
 */
export const SpotlightGrid = ({ cards }: SpotlightGridProps): ReactElement | null => {
  if (cards.length === 0) return null;

  return (
    <ul className={SPOTLIGHT_GRID_CLASS}>
      {cards.slice(0, SPOTLIGHT_LIMIT).map((card) => (
        <li key={card.releaseId}>
          <SpotlightCard card={card} accent="random" linkedHeading />
        </li>
      ))}
    </ul>
  );
};
