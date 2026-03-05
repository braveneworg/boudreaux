/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';

import ArtistDetailPage, { generateMetadata } from './page';

// Mock server-only
vi.mock('server-only', () => ({}));

// Mock notFound
const mockNotFound = vi.fn();
vi.mock('next/navigation', () => ({
  notFound: () => mockNotFound(),
}));

// Mock ArtistService
const mockGetArtistBySlugWithReleases = vi.fn();
vi.mock('@/lib/services/artist-service', () => ({
  ArtistService: {
    getArtistBySlugWithReleases: (...args: unknown[]) => mockGetArtistBySlugWithReleases(...args),
  },
}));

vi.mock('@/lib/utils/get-artist-display-name', () => ({
  getArtistDisplayName: (artist: {
    displayName?: string | null;
    firstName: string;
    surname: string;
  }) => artist.displayName ?? `${artist.firstName} ${artist.surname}`,
}));

// Mock child components
vi.mock('@/app/components/ui/page-container', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="page-container">{children}</div>
  ),
}));

vi.mock('@/app/components/ui/content-container', () => ({
  ContentContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="content-container">{children}</div>
  ),
}));

vi.mock('@/app/components/ui/breadcrumb-menu', () => ({
  BreadcrumbMenu: ({
    items,
  }: {
    items: Array<{ anchorText: string; url: string; isActive: boolean; className?: string }>;
  }) => (
    <nav data-testid="breadcrumb-menu" data-items={JSON.stringify(items)}>
      Breadcrumbs
    </nav>
  ),
}));

vi.mock('@/app/components/artist-player', () => ({
  ArtistPlayer: ({
    artist,
    initialReleaseId,
  }: {
    artist: { releases: Array<{ release: { id: string } }> };
    initialReleaseId?: string;
  }) => (
    <div
      data-testid="artist-player"
      data-release-count={artist.releases.length}
      data-initial-release-id={initialReleaseId ?? ''}
    >
      Player
    </div>
  ),
}));

describe('ArtistDetailPage', () => {
  const createMockArtistRelease = (
    id: string,
    title: string,
    trackCount: number,
    releasedOn: Date
  ) => ({
    id: `ar-${id}`,
    artistId: 'artist-1',
    releaseId: id,
    release: {
      id,
      title,
      coverArt: `https://example.com/${id}-cover.jpg`,
      publishedAt: new Date('2024-01-01'),
      deletedOn: null,
      releasedOn,
      images: [],
      artistReleases: [],
      releaseTracks: Array.from({ length: trackCount }, (_, i) => ({
        id: `rt-${id}-${i}`,
        releaseId: id,
        trackId: `track-${id}-${i}`,
        position: i + 1,
        track: {
          id: `track-${id}-${i}`,
          title: `Track ${i + 1}`,
          audioUrl: `https://example.com/audio-${id}-${i}.mp3`,
          duration: 180,
          position: i + 1,
        },
      })),
      releaseUrls: [],
    },
  });

  const mockArtist = {
    id: 'artist-1',
    firstName: 'John',
    surname: 'Doe',
    displayName: null,
    title: null,
    suffix: null,
    middleName: null,
    slug: 'john-doe',
    isActive: true,
    shortBio: 'A talented musician',
    bio: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedOn: null,
    images: [],
    labels: [],
    urls: [],
    groups: [],
    releases: [
      createMockArtistRelease('release-1', 'Newest Album', 3, new Date('2024-06-01')),
      createMockArtistRelease('release-2', 'Older Album', 2, new Date('2024-01-01')),
      createMockArtistRelease('release-3', 'No Tracks Album', 0, new Date('2024-03-01')),
    ],
  };

  const defaultParams = Promise.resolve({ slug: 'john-doe' });
  const defaultSearchParams = Promise.resolve({} as Record<string, string | string[] | undefined>);

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetArtistBySlugWithReleases.mockResolvedValue({
      success: true,
      data: mockArtist,
    });
  });

  it('should render page structure', async () => {
    const Page = await ArtistDetailPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    expect(screen.getByTestId('page-container')).toBeInTheDocument();
    expect(screen.getByTestId('content-container')).toBeInTheDocument();
  });

  it('should call getArtistBySlugWithReleases with the slug', async () => {
    const Page = await ArtistDetailPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    expect(mockGetArtistBySlugWithReleases).toHaveBeenCalledWith('john-doe');
  });

  it('should call notFound when service returns failure', async () => {
    mockGetArtistBySlugWithReleases.mockResolvedValue({
      success: false,
      error: 'Artist not found',
    });

    await ArtistDetailPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });

    expect(mockNotFound).toHaveBeenCalledOnce();
  });

  it('should filter out releases with zero releaseTracks', async () => {
    const Page = await ArtistDetailPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    const player = screen.getByTestId('artist-player');
    // mockArtist has 3 releases, but 'No Tracks Album' has 0 tracks
    expect(player).toHaveAttribute('data-release-count', '2');
  });

  it('should pass the correct count of playable releases to ArtistPlayer', async () => {
    const Page = await ArtistDetailPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    // Verify that only playable releases (with at least one track) are passed to ArtistPlayer
    expect(screen.getByTestId('artist-player')).toHaveAttribute('data-release-count', '2');
  });

  it('should pass initialReleaseId from search params', async () => {
    const releaseSearchParams = Promise.resolve({
      release: 'release-2',
    } as Record<string, string | string[] | undefined>);

    const Page = await ArtistDetailPage({
      params: defaultParams,
      searchParams: releaseSearchParams,
    });
    render(Page);

    expect(screen.getByTestId('artist-player')).toHaveAttribute(
      'data-initial-release-id',
      'release-2'
    );
  });

  it('should not pass initialReleaseId when release param is missing', async () => {
    const Page = await ArtistDetailPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    expect(screen.getByTestId('artist-player')).toHaveAttribute('data-initial-release-id', '');
  });

  it('should ignore non-string release search param', async () => {
    const arraySearchParams = Promise.resolve({
      release: ['release-1', 'release-2'],
    } as Record<string, string | string[] | undefined>);

    const Page = await ArtistDetailPage({
      params: defaultParams,
      searchParams: arraySearchParams,
    });
    render(Page);

    expect(screen.getByTestId('artist-player')).toHaveAttribute('data-initial-release-id', '');
  });

  it('should render breadcrumb with artist display name', async () => {
    const Page = await ArtistDetailPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    const breadcrumbs = screen.getByTestId('breadcrumb-menu');
    const items = JSON.parse(breadcrumbs.getAttribute('data-items') ?? '[]') as Array<{
      anchorText: string;
      url: string;
      isActive: boolean;
      className: string;
    }>;
    expect(items).toHaveLength(1);
    expect(items[0].anchorText).toBe('John Doe');
    expect(items[0].url).toBe('/artists/john-doe');
    expect(items[0].isActive).toBe(true);
  });

  it('should apply truncation classes to breadcrumb', async () => {
    const Page = await ArtistDetailPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    const breadcrumbs = screen.getByTestId('breadcrumb-menu');
    const items = JSON.parse(breadcrumbs.getAttribute('data-items') ?? '[]') as Array<{
      className: string;
    }>;
    expect(items[0].className).toContain('max-w-[200px]');
    expect(items[0].className).toContain('truncate');
  });

  it('should render artist with all releases having tracks', async () => {
    const allPlayableArtist = {
      ...mockArtist,
      releases: [
        createMockArtistRelease('release-1', 'Album A', 2, new Date('2024-01-01')),
        createMockArtistRelease('release-2', 'Album B', 1, new Date('2024-06-01')),
      ],
    };
    mockGetArtistBySlugWithReleases.mockResolvedValue({
      success: true,
      data: allPlayableArtist,
    });

    const Page = await ArtistDetailPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    expect(screen.getByTestId('artist-player')).toHaveAttribute('data-release-count', '2');
  });

  describe('generateMetadata', () => {
    it('should return artist name as title', async () => {
      const metadata = await generateMetadata({
        params: defaultParams,
        searchParams: defaultSearchParams,
      });

      expect(metadata.title).toBe('John Doe');
    });

    it('should return shortBio as description', async () => {
      const metadata = await generateMetadata({
        params: defaultParams,
        searchParams: defaultSearchParams,
      });

      expect(metadata.description).toBe('A talented musician');
    });

    it('should return fallback description when shortBio is missing', async () => {
      mockGetArtistBySlugWithReleases.mockResolvedValue({
        success: true,
        data: { ...mockArtist, shortBio: null },
      });

      const metadata = await generateMetadata({
        params: defaultParams,
        searchParams: defaultSearchParams,
      });

      expect(metadata.description).toBe('Listen to releases by John Doe.');
    });

    it('should return "Artist Not Found" when service fails', async () => {
      mockGetArtistBySlugWithReleases.mockResolvedValue({
        success: false,
        error: 'Artist not found',
      });

      const metadata = await generateMetadata({
        params: defaultParams,
        searchParams: defaultSearchParams,
      });

      expect(metadata.title).toBe('Artist Not Found');
    });
  });
});
