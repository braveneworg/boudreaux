/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import type { ArtistListWithBio } from '@/lib/types/media-models';

import { ArtistListCard } from './artist-list-card';

vi.mock('./expandable-thumbnail', () => ({
  ExpandableThumbnail: ({ alt }: { alt: string }) => <span data-testid="thumb" data-alt={alt} />,
}));

vi.mock('@/lib/utils/get-artist-display-name', () => ({
  getArtistDisplayName: (artist: { displayName?: string | null }) =>
    artist.displayName ?? 'Unknown',
}));

const baseArtist = {
  id: 'a1',
  displayName: 'Test Artist',
  slug: 'test-artist',
  shortBio: 'A short teaser bio.',
  genres: 'hip-hop, soul',
  bioImages: [],
} as unknown as ArtistListWithBio;

describe('ArtistListCard', () => {
  it('links the artist name and View more to the detail page', () => {
    render(<ArtistListCard artist={baseArtist} />);

    const links = screen.getAllByRole('link');
    const hrefs = links.map((link) => link.getAttribute('href'));
    expect(hrefs).toContain('/artists/test-artist');
    expect(screen.getByRole('link', { name: /view more/i })).toBeInTheDocument();
  });

  it('renders the short bio and genres', () => {
    render(<ArtistListCard artist={baseArtist} />);

    expect(screen.getByText('A short teaser bio.')).toBeInTheDocument();
    expect(screen.getByText('hip-hop')).toBeInTheDocument();
    expect(screen.getByText('soul')).toBeInTheDocument();
  });

  it('renders primary image thumbnails when present', () => {
    const withImages = {
      ...baseArtist,
      bioImages: [
        {
          id: 'bi1',
          artistId: 'a1',
          url: 'https://x/a.jpg',
          thumbnailUrl: null,
          title: 'Portrait',
          attribution: 'Commons',
          license: null,
          sourceUrl: null,
          width: null,
          height: null,
          isPrimary: true,
          sortOrder: 0,
          createdAt: new Date(),
        },
      ],
    } as unknown as ArtistListWithBio;

    render(<ArtistListCard artist={withImages} />);

    expect(screen.getByTestId('thumb')).toHaveAttribute('data-alt', 'Portrait');
  });

  it('shows a placeholder icon when there are no images', () => {
    render(<ArtistListCard artist={baseArtist} />);

    expect(screen.queryByTestId('thumb')).not.toBeInTheDocument();
  });
});
