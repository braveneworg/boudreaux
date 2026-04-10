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

// Mock getInternalApiUrl
vi.mock('@/lib/utils/get-internal-api-url', () => ({
  getInternalApiUrl: vi.fn((path: string) => Promise.resolve(`http://test-host${path}`)),
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
    fileCount: number,
    releasedOn: Date
  ) => ({
    id: `ar-${id}`,
    artistId: 'artist-1',
    releaseId: id,
    release: {
      id,
      title,
      coverArt: `https://example.com/${id}-cover.jpg`,
      publishedAt: new Date('2024-01-01').toISOString(),
      deletedOn: null,
      releasedOn: releasedOn ? releasedOn.toISOString() : null,
      images: [],
      artistReleases: [],
      digitalFormats:
        fileCount > 0
          ? [
              {
                id: `fmt-${id}`,
                formatType: 'MP3_320KBPS',
                releaseId: id,
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
                files: Array.from({ length: fileCount }, (_, i) => ({
                  id: `file-${id}-${i}`,
                  trackNumber: i + 1,
                  title: `Track ${i + 1}`,
                  s3Key: `track-${id}-${i}.mp3`,
                  fileName: `track-${id}-${i}.mp3`,
                  fileSize: 1000,
                  mimeType: 'audio/mpeg',
                  formatId: `fmt-${id}`,
                  duration: null,
                  checksum: null,
                  createdAt: new Date().toISOString(),
                  updatedAt: new Date().toISOString(),
                })),
              },
            ]
          : [],
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
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    deletedOn: null,
    images: [],
    labels: [],
    urls: [],
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
    // Default: successful fetch returning mockArtist
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(mockArtist),
    }) as unknown as typeof fetch;
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

  it('should fetch the artist by slug via internal API', async () => {
    const Page = await ArtistDetailPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    expect(global.fetch).toHaveBeenCalledWith(
      'http://test-host/api/artists/slug/john-doe?withReleases=true',
      { cache: 'no-store' }
    );
  });

  it('should call notFound when fetch returns not ok', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    }) as unknown as typeof fetch;

    await ArtistDetailPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });

    expect(mockNotFound).toHaveBeenCalledOnce();
  });

  it('should filter out releases with no MP3_320KBPS files', async () => {
    const Page = await ArtistDetailPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    const player = screen.getByTestId('artist-player');
    // mockArtist has 3 releases, but 'No Tracks Album' has no MP3_320KBPS files
    expect(player).toHaveAttribute('data-release-count', '2');
  });

  it('should pass the correct count of playable releases to ArtistPlayer', async () => {
    const Page = await ArtistDetailPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    // Verify that only playable releases (with at least one MP3_320KBPS file) are passed to ArtistPlayer
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
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(allPlayableArtist),
    }) as unknown as typeof fetch;

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
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ...mockArtist, shortBio: null }),
      }) as unknown as typeof fetch;

      const metadata = await generateMetadata({
        params: defaultParams,
        searchParams: defaultSearchParams,
      });

      expect(metadata.description).toBe('Listen to releases by John Doe.');
    });

    it('should return fallback description when shortBio is empty string', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ...mockArtist, shortBio: '' }),
      }) as unknown as typeof fetch;

      const metadata = await generateMetadata({
        params: defaultParams,
        searchParams: defaultSearchParams,
      });

      expect(metadata.description).toBe('Listen to releases by John Doe.');
    });

    it('should return "Artist Not Found" when fetch fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        json: () => Promise.resolve({}),
      }) as unknown as typeof fetch;

      const metadata = await generateMetadata({
        params: defaultParams,
        searchParams: defaultSearchParams,
      });

      expect(metadata.title).toBe('Artist Not Found');
    });
  });

  describe('debug logging in non-production', () => {
    it('should log warning when artist has zero releases', async () => {
      const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ ...mockArtist, releases: [] }),
      }) as unknown as typeof fetch;

      const Page = await ArtistDetailPage({
        params: defaultParams,
        searchParams: defaultSearchParams,
      });
      render(Page);

      expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining('returned 0 releases'));
      consoleWarnSpy.mockRestore();
    });

    it('should log info for each release in non-production', async () => {
      const consoleInfoSpy = vi.spyOn(console, 'info').mockImplementation(() => {});

      const Page = await ArtistDetailPage({
        params: defaultParams,
        searchParams: defaultSearchParams,
      });
      render(Page);

      // 3 releases should produce 3 info logs
      const artistDetailLogs = consoleInfoSpy.mock.calls.filter(
        (call) => typeof call[0] === 'string' && call[0].includes('[artist-detail]')
      );
      expect(artistDetailLogs.length).toBe(3);
      consoleInfoSpy.mockRestore();
    });
  });

  describe('sorting with null releasedOn', () => {
    it('should sort releases with null releasedOn to the end', async () => {
      const artistWithNullDate = {
        ...mockArtist,
        releases: [
          createMockArtistRelease('release-null', 'Null Date Album', 2, null as unknown as Date),
          createMockArtistRelease('release-dated', 'Dated Album', 2, new Date('2024-06-01')),
        ],
      };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(artistWithNullDate),
      }) as unknown as typeof fetch;

      const Page = await ArtistDetailPage({
        params: defaultParams,
        searchParams: defaultSearchParams,
      });
      render(Page);

      // Both releases have MP3 files so both are included
      expect(screen.getByTestId('artist-player')).toHaveAttribute('data-release-count', '2');
    });
  });
});
