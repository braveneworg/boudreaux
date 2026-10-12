/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { ReactElement } from 'react';

import { SPOTLIGHT_LIMIT } from '@/hooks/queries/use-active-featured-artists-query';
import type { SpotlightCard as SpotlightCardData } from '@/lib/utils/spotlight-card';

import { SpotlightCard } from './spotlight-card';

interface SpotlightGridProps {
  /** The spotlight cards, or the newest-releases fallback when there are none. */
  cards: SpotlightCardData[];
}

/**
 * The home page's grid of spotlight covers: one column on phones, two from
 * `sm`, four from `lg`, at most {@link SPOTLIGHT_LIMIT} cards. Renders nothing
 * without cards.
 */
export const SpotlightGrid = ({ cards }: SpotlightGridProps): ReactElement | null => {
  if (cards.length === 0) return null;

  return (
    <ul className="grid grid-cols-1 gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
      {cards.slice(0, SPOTLIGHT_LIMIT).map((card) => (
        <li key={card.releaseId}>
          <SpotlightCard card={card} />
        </li>
      ))}
    </ul>
  );
};
