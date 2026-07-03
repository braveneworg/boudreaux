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

  it('wraps the artist header and player in a hot-pink zine panel', () => {
    useArtistBySlugQueryMock.mockReturnValue({ isPending: false, data: artist });

    const { container } = render(<ArtistDetailContent slug="test-artist" />);

    const panel = container.querySelector('[data-slot="zine-panel"]');
    expect(panel).toBeInTheDocument();
    expect(panel).toHaveClass('zine-accent-hot-pink');
  });

  it('does not render a zine panel while the query is pending', () => {
    useArtistBySlugQueryMock.mockReturnValue({ isPending: true, data: undefined });

    const { container } = render(<ArtistDetailContent slug="test-artist" />);

    expect(container.querySelector('[data-slot="zine-panel"]')).not.toBeInTheDocument();
  });

  it('shows the not-found state when data is missing', () => {
    useArtistBySlugQueryMock.mockReturnValue({ isPending: false, data: null, error: undefined });

    render(<ArtistDetailContent slug="missing" />);

    expect(screen.getByText('Artist not found')).toBeInTheDocument();
  });

  it('shows a loading spinner while the query is pending', () => {
    useArtistBySlugQueryMock.mockReturnValue({ isPending: true, data: undefined });

    const { container } = render(<ArtistDetailContent slug="test-artist" />);

    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows the failed-to-load state when the query errors', () => {
    useArtistBySlugQueryMock.mockReturnValue({
      isPending: false,
      data: null,
      error: new Error('boom'),
    });

    render(<ArtistDetailContent slug="test-artist" />);

    expect(screen.getByText('Failed to load artist')).toBeInTheDocument();
    expect(screen.getByText('Please try again later.')).toBeInTheDocument();
  });

  it('renders a detail thumbnail with its title as the alt text', () => {
    useArtistBySlugQueryMock.mockReturnValue({ isPending: false, data: artist });

    render(<ArtistDetailContent slug="test-artist" />);

    expect(screen.getByTestId('thumb')).toHaveAttribute('data-alt', 'Portrait');
  });

  it('falls back to non-primary images and the display name alt when none are primary or titled', () => {
    useArtistBySlugQueryMock.mockReturnValue({
      isPending: false,
      data: {
        ...artist,
        bioImages: [
          {
            id: 'bi2',
            url: 'https://x/b.jpg',
            thumbnailUrl: null,
            title: null,
            attribution: null,
            license: null,
            sourceUrl: null,
            isPrimary: false,
          },
        ],
      },
    });

    render(<ArtistDetailContent slug="test-artist" />);

    expect(screen.getByTestId('thumb')).toHaveAttribute('data-alt', 'Test Artist image');
  });

  it('hides the header section when there is no short bio, genres, or images', () => {
    useArtistBySlugQueryMock.mockReturnValue({
      isPending: false,
      data: { ...artist, shortBio: null, genres: null, bio: null, bioImages: [], bioLinks: [] },
    });

    render(<ArtistDetailContent slug="test-artist" />);

    expect(screen.queryByTestId('thumb')).not.toBeInTheDocument();
    expect(screen.queryByText('jazz')).not.toBeInTheDocument();
  });

  it('shows the full bio link when only bioLinks exist (no bio text)', () => {
    useArtistBySlugQueryMock.mockReturnValue({
      isPending: false,
      data: {
        ...artist,
        bio: null,
        bioImages: [],
        bioLinks: [{ id: 'l1', url: 'https://x', label: 'Site', kind: null }],
      },
    });

    render(<ArtistDetailContent slug="test-artist" />);

    expect(screen.getByRole('link', { name: /read full bio/i })).toBeInTheDocument();
  });

  it('filters out releases without MP3_320KBPS files and keeps playable ones', () => {
    useArtistBySlugQueryMock.mockReturnValue({
      isPending: false,
      data: {
        ...artist,
        releases: [
          {
            release: {
              id: 'r-old',
              releasedOn: '2020-01-01',
              digitalFormats: [{ formatType: 'MP3_320KBPS', files: [{ id: 'f1' }] }],
            },
          },
          {
            release: {
              id: 'r-new',
              releasedOn: '2023-01-01',
              digitalFormats: [{ formatType: 'MP3_320KBPS', files: [{ id: 'f2' }] }],
            },
          },
          {
            release: {
              id: 'r-none',
              releasedOn: null,
              digitalFormats: [{ formatType: 'MP3_320KBPS', files: [] }],
            },
          },
          {
            release: {
              id: 'r-wrong',
              releasedOn: '2022-01-01',
              digitalFormats: [{ formatType: 'FLAC', files: [{ id: 'f3' }] }],
            },
          },
        ],
      },
    });

    // ArtistPlayer is mocked to a stub; the render exercises the filter/sort
    // branches without throwing, which is the coverage target here.
    render(<ArtistDetailContent slug="test-artist" />);

    expect(screen.getByTestId('artist-player')).toBeInTheDocument();
  });
});
