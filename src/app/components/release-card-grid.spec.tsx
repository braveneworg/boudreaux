/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';

import { ReleaseCardGrid } from './release-card-grid';

// Mock ReleaseCard to avoid testing its internals here
vi.mock('./release-card', () => ({
  ReleaseCard: ({ id, title, artistName }: { id: string; title: string; artistName: string }) => (
    <div data-testid={`release-card-${id}`} data-title={title} data-artist={artistName}>
      {title}
    </div>
  ),
}));

describe('ReleaseCardGrid', () => {
  const mockReleases = [
    {
      id: 'release-1',
      title: 'Album One',
      artistName: 'Artist A',
      coverArt: { src: 'https://example.com/1.jpg', alt: 'Album One cover art' },
      bandcampUrl: 'https://label.bandcamp.com/album/one',
    },
    {
      id: 'release-2',
      title: 'Album Two',
      artistName: 'Artist B',
      coverArt: { src: 'https://example.com/2.jpg', alt: 'Album Two cover art' },
      bandcampUrl: null,
    },
    {
      id: 'release-3',
      title: 'Album Three',
      artistName: 'Artist C',
      coverArt: null,
      bandcampUrl: 'https://label.bandcamp.com/album/three',
    },
  ];

  it('should render a grid of ReleaseCards', () => {
    render(<ReleaseCardGrid releases={mockReleases} />);

    expect(screen.getByTestId('release-card-release-1')).toBeInTheDocument();
    expect(screen.getByTestId('release-card-release-2')).toBeInTheDocument();
    expect(screen.getByTestId('release-card-release-3')).toBeInTheDocument();
  });

  it('should pass correct props to each ReleaseCard', () => {
    render(<ReleaseCardGrid releases={mockReleases} />);

    const card1 = screen.getByTestId('release-card-release-1');
    expect(card1).toHaveAttribute('data-title', 'Album One');
    expect(card1).toHaveAttribute('data-artist', 'Artist A');
  });

  it('should render empty state when no releases', () => {
    render(<ReleaseCardGrid releases={[]} />);

    expect(screen.getByText(/no releases/i)).toBeInTheDocument();
  });

  it('should have responsive grid classes', () => {
    const { container } = render(<ReleaseCardGrid releases={mockReleases} />);

    const grid = container.querySelector('[data-testid="release-card-grid"]');
    expect(grid).toBeInTheDocument();
    expect(grid?.className).toContain('grid');
  });
});
