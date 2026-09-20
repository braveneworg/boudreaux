/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { render, screen } from '@testing-library/react';

import { ArtistDetailContent } from './artist-detail-content';

const useArtistBySlugQueryMock = vi.fn();
vi.mock('@/hooks/queries/use-artist-by-slug-query', () => ({
  useArtistBySlugQuery: (slug: string) => useArtistBySlugQueryMock(slug),
}));

vi.mock('./artist-player', () => ({
  ArtistPlayer: ({ artist }: { artist: { releases: Array<{ release: { id: string } }> } }) => (
    <div
      data-testid="artist-player"
      data-release-order={artist.releases.map(({ release }) => release.id).join(',')}
    />
  ),
}));

vi.mock('./expandable-thumbnail', () => ({
  ExpandableThumbnail: ({ alt }: { alt: string }) => <span data-testid="thumb" data-alt={alt} />,
}));

// The full biography is its own component with its own spec; stub it so the
// header's display thumbnails stay the only `thumb` nodes in this one.
vi.mock('./artist-full-bio', () => ({
  ArtistFullBio: ({ bio, bioImages }: { bio: string | null; bioImages: Array<{ id: string }> }) => (
    <div data-testid="artist-full-bio" data-bio={bio ?? ''} data-images={bioImages.length} />
  ),
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

  it('carries the full biography on the page instead of linking away to it', () => {
    useArtistBySlugQueryMock.mockReturnValue({ isPending: false, data: artist });

    render(<ArtistDetailContent slug="test-artist" />);

    expect(screen.getByTestId('artist-full-bio')).toHaveAttribute('data-bio', '<p>Long bio.</p>');
    expect(screen.queryByRole('link', { name: /read full bio/i })).not.toBeInTheDocument();
  });

  it('keeps the header’s display images out of the biography gallery', () => {
    useArtistBySlugQueryMock.mockReturnValue({ isPending: false, data: artist });

    render(<ArtistDetailContent slug="test-artist" />);

    // The header already shows the resolved display image; the gallery gets
    // only what is left, so no portrait renders twice on the page.
    const shownInHeader = screen.getAllByTestId('thumb').length;
    expect(screen.getByTestId('artist-full-bio')).toHaveAttribute(
      'data-images',
      String(artist.bioImages.length - shownInHeader)
    );
  });

  it('leaves the biography gallery empty when the header shows every image', () => {
    const [only] = artist.bioImages;
    useArtistBySlugQueryMock.mockReturnValue({
      isPending: false,
      data: { ...artist, bioImages: [only] },
    });

    render(<ArtistDetailContent slug="test-artist" />);

    expect(screen.getByTestId('artist-full-bio')).toHaveAttribute('data-images', '0');
  });

  it('still renders the biography section when the artist has no bio written', () => {
    useArtistBySlugQueryMock.mockReturnValue({
      isPending: false,
      data: { ...artist, bio: null, bioImages: [], bioLinks: [] },
    });

    render(<ArtistDetailContent slug="test-artist" />);

    expect(screen.getByTestId('artist-full-bio')).toHaveAttribute('data-bio', '');
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

  it('prefers the image alt text over its title', () => {
    useArtistBySlugQueryMock.mockReturnValue({
      isPending: false,
      data: {
        ...artist,
        bioImages: [{ ...artist.bioImages[0], alt: 'The artist mid-song' }],
      },
    });

    render(<ArtistDetailContent slug="test-artist" />);

    expect(screen.getByTestId('thumb')).toHaveAttribute('data-alt', 'The artist mid-song');
  });

  // Display images are chosen by humans; the job's isPrimary is only a
  // suggestion shown while nothing has been chosen (ADR-0008).
  it('shows the chosen display images in their order instead of the suggested ones', () => {
    useArtistBySlugQueryMock.mockReturnValue({
      isPending: false,
      data: {
        ...artist,
        bioImages: [
          { ...artist.bioImages[0], id: 's', title: 'Suggested', isPrimary: true },
          {
            ...artist.bioImages[0],
            id: 'c2',
            title: 'Chosen second',
            isPrimary: false,
            displayOrder: 1,
          },
          {
            ...artist.bioImages[0],
            id: 'c1',
            title: 'Chosen first',
            isPrimary: false,
            displayOrder: 0,
          },
        ],
      },
    });

    render(<ArtistDetailContent slug="test-artist" />);

    expect(screen.getAllByTestId('thumb').map((thumb) => thumb.getAttribute('data-alt'))).toEqual([
      'Chosen first',
      'Chosen second',
    ]);
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

  it('filters out releases without MP3_320KBPS files and orders playable ones newest first', () => {
    useArtistBySlugQueryMock.mockReturnValue({
      isPending: false,
      data: {
        ...artist,
        releases: [
          {
            credit: 'primary',
            release: {
              id: 'r-old',
              releasedOn: '2020-01-01',
              digitalFormats: [{ formatType: 'MP3_320KBPS', files: [{ id: 'f1' }] }],
            },
          },
          {
            credit: 'primary',
            release: {
              id: 'r-new',
              releasedOn: '2023-01-01',
              digitalFormats: [{ formatType: 'MP3_320KBPS', files: [{ id: 'f2' }] }],
            },
          },
          {
            credit: 'primary',
            release: {
              id: 'r-none',
              releasedOn: null,
              digitalFormats: [{ formatType: 'MP3_320KBPS', files: [] }],
            },
          },
          {
            credit: 'primary',
            release: {
              id: 'r-wrong',
              releasedOn: '2022-01-01',
              digitalFormats: [{ formatType: 'FLAC', files: [{ id: 'f3' }] }],
            },
          },
        ],
      },
    });

    render(<ArtistDetailContent slug="test-artist" />);

    expect(screen.getByTestId('artist-player')).toHaveAttribute(
      'data-release-order',
      'r-new,r-old'
    );
  });

  it('keeps the artist’s own releases ahead of newer featured and band appearances', () => {
    const playable = [{ formatType: 'MP3_320KBPS', files: [{ id: 'f' }] }];
    useArtistBySlugQueryMock.mockReturnValue({
      isPending: false,
      data: {
        ...artist,
        releases: [
          {
            credit: 'member',
            release: { id: 'band', releasedOn: '2025-01-01', digitalFormats: playable },
          },
          {
            credit: 'featured',
            release: { id: 'guest', releasedOn: '2024-01-01', digitalFormats: playable },
          },
          {
            credit: 'primary',
            release: { id: 'own', releasedOn: '2010-01-01', digitalFormats: playable },
          },
        ],
      },
    });

    render(<ArtistDetailContent slug="test-artist" />);

    expect(screen.getByTestId('artist-player')).toHaveAttribute(
      'data-release-order',
      'own,guest,band'
    );
  });
});
