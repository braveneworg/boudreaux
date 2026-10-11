/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import type { SpotlightCard as SpotlightCardData } from '@/utils/spotlight-card';

import { SpotlightGrid } from './spotlight-grid';

vi.mock('./spotlight-card', () => ({
  SpotlightCard: ({ card }: { card: SpotlightCardData }) => (
    <div data-testid="spotlight-card">{card.title}</div>
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

  it('lays the cards out one, two, then four to a row', () => {
    render(<SpotlightGrid cards={makeCards(1)} />);

    expect(screen.getByRole('list')).toHaveClass(
      'grid',
      'grid-cols-1',
      'sm:grid-cols-2',
      'lg:grid-cols-4'
    );
  });

  it('shows at most twelve cards', () => {
    render(<SpotlightGrid cards={makeCards(14)} />);

    expect(screen.getAllByTestId('spotlight-card')).toHaveLength(12);
  });

  it('renders nothing without cards', () => {
    const { container } = render(<SpotlightGrid cards={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});
