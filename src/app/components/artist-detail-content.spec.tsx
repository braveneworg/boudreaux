/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { ArtistDetailContent } from './artist-detail-content';

const useArtistBySlugQueryMock = vi.fn();
vi.mock('@/app/hooks/use-artist-by-slug-query', () => ({
  useArtistBySlugQuery: (slug: string) => useArtistBySlugQueryMock(slug),
}));

vi.mock('./artist-player', () => ({
  ArtistPlayer: () => <div data-testid="artist-player" />,
}));

vi.mock('./expandable-thumbnail', () => ({
  ExpandableThumbnail: ({ alt }: { alt: string }) => <span data-testid="thumb" data-alt={alt} />,
}));

vi.mock('@/lib/utils/get-artist-display-name', () => ({
  getArtistDisplayName: (artist: { displayName?: string | null }) =>
    artist.displayName ?? 'Unknown',
}));

const artist = {
  displayName: 'Test Artist',
  slug: 'test-artist',
  shortBio: 'Short teaser.',
  bio: '<p>Long bio.</p>',
  genres: 'jazz',
  bioImages: [
    {
      id: 'bi1',
      url: 'https://x/a.jpg',
      thumbnailUrl: null,
      title: 'Portrait',
      attribution: 'Commons',
      license: null,
      sourceUrl: null,
      isPrimary: true,
    },
  ],
  bioLinks: [],
  releases: [],
};

describe('ArtistDetailContent', () => {
  it('renders the short bio, genre, and player', () => {
    useArtistBySlugQueryMock.mockReturnValue({ isPending: false, data: artist });

    render(<ArtistDetailContent slug="test-artist" />);

    expect(screen.getByText('Short teaser.')).toBeInTheDocument();
    expect(screen.getByText('jazz')).toBeInTheDocument();
    expect(screen.getByTestId('artist-player')).toBeInTheDocument();
  });

  it('links "Read full bio" to the bio page', () => {
    useArtistBySlugQueryMock.mockReturnValue({ isPending: false, data: artist });

    render(<ArtistDetailContent slug="test-artist" />);

    expect(screen.getByRole('link', { name: /read full bio/i })).toHaveAttribute(
      'href',
      '/artists/test-artist/bio'
    );
  });

  it('does not show the full bio area when no bio content exists', () => {
    useArtistBySlugQueryMock.mockReturnValue({
      isPending: false,
      data: { ...artist, bio: null, bioImages: [], bioLinks: [] },
    });

    render(<ArtistDetailContent slug="test-artist" />);

    expect(screen.queryByRole('link', { name: /read full bio/i })).not.toBeInTheDocument();
  });

  it('shows the not-found state when data is missing', () => {
    useArtistBySlugQueryMock.mockReturnValue({ isPending: false, data: null, error: undefined });

    render(<ArtistDetailContent slug="missing" />);

    expect(screen.getByText('Artist not found')).toBeInTheDocument();
  });
});
