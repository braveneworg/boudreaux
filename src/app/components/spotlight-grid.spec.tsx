/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import {
  SPOTLIGHT_GRID_CLASS,
  type SpotlightCard as SpotlightCardData,
} from '@/utils/spotlight-card';

import { SpotlightGrid } from './spotlight-grid';

vi.mock('./spotlight-card', () => ({
  SpotlightCard: ({
    card,
    accent,
    linkedHeading,
  }: {
    card: SpotlightCardData;
    accent?: string;
    linkedHeading?: boolean;
  }) => (
    <div
      data-testid="spotlight-card"
      data-accent={accent ?? ''}
      data-linked-heading={String(Boolean(linkedHeading))}
    >
      {card.title}
    </div>
  ),
}));

const makeCards = (count: number): SpotlightCardData[] =>
  Array.from({ length: count }, (_, index) => ({
    releaseId: `rel-${index}`,
    title: `Album ${index}`,
    year: 2024,
    artistName: `Artist ${index}`,
    artistSlug: `artist-${index}`,
    coverArt: null,
    playSrc: null,
    initialTrackNumber: null,
  }));

describe('SpotlightGrid', () => {
  it('lists one card per item, in order', () => {
    render(<SpotlightGrid cards={makeCards(3)} />);

    const items = screen.getAllByRole('listitem');
    expect(items.map((item) => item.textContent)).toEqual(['Album 0', 'Album 1', 'Album 2']);
  });

  it('lays the cards out one, two, then three to a row', () => {
    render(<SpotlightGrid cards={makeCards(1)} />);

    expect(screen.getByRole('list')).toHaveClass(
      'grid',
      'grid-cols-1',
      'sm:grid-cols-2',
      'lg:grid-cols-3'
    );
  });

  it('uses the grid class it shares with the /releases grid', () => {
    render(<SpotlightGrid cards={makeCards(1)} />);

    expect(screen.getByRole('list')).toHaveAttribute('class', SPOTLIGHT_GRID_CLASS);
  });

  it('shows at most twelve cards', () => {
    render(<SpotlightGrid cards={makeCards(14)} />);

    expect(screen.getAllByTestId('spotlight-card')).toHaveLength(12);
  });

  it('renders nothing without cards', () => {
    const { container } = render(<SpotlightGrid cards={[]} />);

    expect(container).toBeEmptyDOMElement();
  });

  // The home modal: a new loud accent on each open, the artist linked, the
  // year and a "View all releases" footer. `/releases` renders its own cards.
  it('opens each card in a random accent with the linked heading', () => {
    render(<SpotlightGrid cards={makeCards(2)} />);

    const cards = screen.getAllByTestId('spotlight-card');
    expect(cards.map(({ dataset }) => [dataset.accent, dataset.linkedHeading])).toEqual([
      ['random', 'true'],
      ['random', 'true'],
    ]);
  });
});
