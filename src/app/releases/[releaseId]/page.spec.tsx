/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';

import ReleasePlayerPage from './page';

// Mock server-only
vi.mock('server-only', () => ({}));

// Mock notFound
const mockNotFound = vi.fn();
vi.mock('next/navigation', () => ({
  notFound: () => mockNotFound(),
}));

// Mock next/headers cookies
vi.mock('next/headers', () => ({
  cookies: vi.fn().mockResolvedValue({
    toString: () => 'session-token=abc123',
  }),
  headers: vi.fn().mockResolvedValue(
    new Map([
      ['host', 'test-host'],
      ['x-forwarded-proto', 'http'],
    ])
  ),
}));

// Mock getInternalApiUrl
vi.mock('@/lib/utils/get-internal-api-url', () => ({
  getInternalApiUrl: vi.fn((path: string) => `http://test-host${path}`),
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

vi.mock('@/app/components/release-player', () => ({
  ReleasePlayer: ({
    release,
    autoPlay,
    hasPurchase,
    downloadCount,
    availableFormats,
  }: {
    release: unknown;
    autoPlay?: boolean;
    hasPurchase?: boolean;
    downloadCount?: number;
    availableFormats?: Array<{ formatType: string; fileName: string }>;
  }) => (
    <div
      data-testid="release-player"
      data-release-id={(release as { id: string }).id}
      data-auto-play={autoPlay?.toString()}
      data-has-purchase={hasPurchase?.toString()}
      data-download-count={downloadCount?.toString()}
      data-available-formats={JSON.stringify(availableFormats)}
    >
      Player
    </div>
  ),
}));

vi.mock('@/app/components/artist-releases-carousel', () => ({
  ArtistReleasesCarousel: ({
    releases,
    artistName,
  }: {
    releases: unknown[];
    artistName: string;
  }) => (
    <div
      data-testid="artist-releases-carousel"
      data-count={releases.length}
      data-artist={artistName}
    >
      Carousel
    </div>
  ),
}));

vi.mock('@/app/components/release-description', () => ({
  ReleaseDescription: ({ description }: { description: string | null }) =>
    description ? <div data-testid="release-description">{description}</div> : null,
}));

describe('ReleasePlayerPage', () => {
  const mockReleaseData = {
    id: 'release-1',
    title: 'Midnight Serenade',
    coverArt: 'https://cdn.example.com/cover.jpg',
    description: 'A great album',
    publishedAt: new Date().toISOString(),
    releasedOn: new Date().toISOString(),
    deletedOn: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    images: [],
    artistReleases: [
      {
        id: 'ar-1',
        artistId: 'artist-1',
        releaseId: 'release-1',
        artist: {
          id: 'artist-1',
          firstName: 'John',
          surname: 'Doe',
          displayName: null,
          title: null,
          suffix: null,
          middleName: null,
          bio: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          deletedOn: null,
        },
      },
    ],
    releaseTracks: [
      {
        id: 'rt-1',
        releaseId: 'release-1',
        trackId: 'track-1',
        position: 1,
        track: {
          id: 'track-1',
          title: 'Song One',
          audioUrl: 'https://cdn.example.com/track1.mp3',
          position: 1,
          duration: 180,
        },
      },
    ],
    releaseUrls: [],
  };

  const mockOtherReleases = [
    {
      id: 'release-2',
      title: 'Other Album',
      coverArt: 'https://cdn.example.com/cover2.jpg',
      images: [],
    },
  ];

  const mockUserStatus = {
    hasPurchase: false,
    purchasedAt: null,
    downloadCount: 0,
    availableFormats: [],
  };

  const defaultParams = Promise.resolve({ releaseId: 'release-1' });
  const defaultSearchParams = Promise.resolve({} as Record<string, string | string[] | undefined>);
  const autoPlaySearchParams = Promise.resolve({
    autoplay: 'true',
  } as Record<string, string | string[] | undefined>);

  const createFetchMock = (overrides?: {
    releaseResponse?: { ok: boolean; json: () => Promise<unknown> };
    userStatusResponse?: { ok: boolean; json: () => Promise<unknown> };
    relatedResponse?: { ok: boolean; json: () => Promise<unknown> };
  }) =>
    vi.fn((url: string) => {
      if (typeof url === 'string' && url.includes('/user-status')) {
        return Promise.resolve(
          overrides?.userStatusResponse ?? {
            ok: true,
            json: () => Promise.resolve(mockUserStatus),
          }
        );
      }
      if (typeof url === 'string' && url.includes('/related')) {
        return Promise.resolve(
          overrides?.relatedResponse ?? {
            ok: true,
            json: () => Promise.resolve({ releases: mockOtherReleases }),
          }
        );
      }
      // Release with tracks (default)
      return Promise.resolve(
        overrides?.releaseResponse ?? {
          ok: true,
          json: () => Promise.resolve(mockReleaseData),
        }
      );
    });

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = createFetchMock() as unknown as typeof fetch;
  });

  it('should render page structure', async () => {
    const Page = await ReleasePlayerPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    expect(screen.getByTestId('page-container')).toBeInTheDocument();
    expect(screen.getByTestId('content-container')).toBeInTheDocument();
  });

  it('should fetch the release with tracks via internal API', async () => {
    const Page = await ReleasePlayerPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    expect(global.fetch).toHaveBeenCalledWith(
      'http://test-host/api/releases/release-1?withTracks=true',
      { cache: 'no-store' }
    );
  });

  it('should fetch related releases with artist ID', async () => {
    const Page = await ReleasePlayerPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    expect(global.fetch).toHaveBeenCalledWith(
      'http://test-host/api/releases/release-1/related?artistId=artist-1',
      { cache: 'no-store' }
    );
  });

  it('should render BreadcrumbMenu with Home > Releases > {title}', async () => {
    const Page = await ReleasePlayerPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    const breadcrumbs = screen.getByTestId('breadcrumb-menu');
    const items = JSON.parse(breadcrumbs.getAttribute('data-items') || '[]');
    expect(items).toEqual([
      { anchorText: 'Releases', url: '/releases', isActive: false },
      {
        anchorText: 'Midnight Serenade',
        url: '/releases/release-1',
        isActive: true,
        className: 'max-w-[200px] truncate sm:max-w-none sm:overflow-visible',
      },
    ]);
  });

  it('should apply truncation classes to the active breadcrumb for mobile', async () => {
    const Page = await ReleasePlayerPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    const breadcrumbs = screen.getByTestId('breadcrumb-menu');
    const items = JSON.parse(breadcrumbs.getAttribute('data-items') || '[]');
    const activeItem = items.find((item: { isActive: boolean }) => item.isActive);
    expect(activeItem.className).toContain('max-w-[200px]');
    expect(activeItem.className).toContain('truncate');
  });

  it('should render ReleasePlayer with release data', async () => {
    const Page = await ReleasePlayerPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    const player = screen.getByTestId('release-player');
    expect(player).toHaveAttribute('data-release-id', 'release-1');
  });

  it('should render ArtistReleasesCarousel when other releases exist', async () => {
    const Page = await ReleasePlayerPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    const carousel = screen.getByTestId('artist-releases-carousel');
    expect(carousel).toHaveAttribute('data-count', '1');
  });

  it('should not render ArtistReleasesCarousel when no other releases', async () => {
    global.fetch = createFetchMock({
      relatedResponse: {
        ok: true,
        json: () => Promise.resolve({ releases: [] }),
      },
    }) as unknown as typeof fetch;

    const Page = await ReleasePlayerPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    expect(screen.queryByTestId('artist-releases-carousel')).not.toBeInTheDocument();
  });

  it('should call notFound when release not found', async () => {
    global.fetch = createFetchMock({
      releaseResponse: {
        ok: false,
        json: () => Promise.resolve({}),
      },
    }) as unknown as typeof fetch;

    await ReleasePlayerPage({ params: defaultParams, searchParams: defaultSearchParams });

    expect(mockNotFound).toHaveBeenCalledOnce();
  });

  it('should render ReleaseDescription with description text', async () => {
    const Page = await ReleasePlayerPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    const description = screen.getByTestId('release-description');
    expect(description).toHaveTextContent('A great album');
  });

  it('should not render ReleaseDescription when description is null', async () => {
    global.fetch = createFetchMock({
      releaseResponse: {
        ok: true,
        json: () => Promise.resolve({ ...mockReleaseData, description: null }),
      },
    }) as unknown as typeof fetch;

    const Page = await ReleasePlayerPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    expect(screen.queryByTestId('release-description')).not.toBeInTheDocument();
  });

  it('should pass autoPlay=true to ReleasePlayer when ?autoplay=true', async () => {
    const Page = await ReleasePlayerPage({
      params: defaultParams,
      searchParams: autoPlaySearchParams,
    });
    render(Page);

    const player = screen.getByTestId('release-player');
    expect(player).toHaveAttribute('data-auto-play', 'true');
  });

  it('should pass autoPlay=false to ReleasePlayer by default', async () => {
    const Page = await ReleasePlayerPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    const player = screen.getByTestId('release-player');
    expect(player).toHaveAttribute('data-auto-play', 'false');
  });

  it('should handle missing artistReleases gracefully', async () => {
    global.fetch = createFetchMock({
      releaseResponse: {
        ok: true,
        json: () =>
          Promise.resolve({
            ...mockReleaseData,
            artistReleases: [],
          }),
      },
    }) as unknown as typeof fetch;

    const Page = await ReleasePlayerPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    // Should still render page structure
    expect(screen.getByTestId('page-container')).toBeInTheDocument();
  });

  it('should handle failed related releases gracefully', async () => {
    global.fetch = createFetchMock({
      relatedResponse: {
        ok: false,
        json: () => Promise.resolve({}),
      },
    }) as unknown as typeof fetch;

    const Page = await ReleasePlayerPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    // When relatedRes.ok is false, otherReleases should be []
    // So carousel should not render
    expect(screen.queryByTestId('artist-releases-carousel')).not.toBeInTheDocument();
    // Player should still render
    expect(screen.getByTestId('release-player')).toBeInTheDocument();
  });

  // ─── Authenticated user / purchase branch ──────────────────────────

  it('should show purchase status when user-status returns data', async () => {
    global.fetch = createFetchMock({
      userStatusResponse: {
        ok: true,
        json: () =>
          Promise.resolve({
            hasPurchase: true,
            purchasedAt: '2024-06-01T00:00:00.000Z',
            downloadCount: 3,
            availableFormats: [],
          }),
      },
    }) as unknown as typeof fetch;

    const Page = await ReleasePlayerPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    const player = screen.getByTestId('release-player');
    expect(player).toHaveAttribute('data-has-purchase', 'true');
    expect(player).toHaveAttribute('data-download-count', '3');
  });

  it('should pass hasPurchase=false when user is not authenticated', async () => {
    global.fetch = createFetchMock({
      userStatusResponse: {
        ok: false,
        json: () => Promise.resolve({ error: 'Unauthorized' }),
      },
    }) as unknown as typeof fetch;

    const Page = await ReleasePlayerPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    const player = screen.getByTestId('release-player');
    expect(player).toHaveAttribute('data-has-purchase', 'false');
    expect(player).toHaveAttribute('data-download-count', '0');
  });

  // ─── Digital format tests ───────────────────────────────────

  it('should pass available formats from user-status API', async () => {
    global.fetch = createFetchMock({
      userStatusResponse: {
        ok: true,
        json: () =>
          Promise.resolve({
            hasPurchase: false,
            purchasedAt: null,
            downloadCount: 0,
            availableFormats: [{ formatType: 'FLAC', fileName: 'album-flac.zip' }],
          }),
      },
    }) as unknown as typeof fetch;

    const Page = await ReleasePlayerPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    const player = screen.getByTestId('release-player');
    const formats = JSON.parse(player.getAttribute('data-available-formats') || '[]');
    expect(formats).toEqual([{ formatType: 'FLAC', fileName: 'album-flac.zip' }]);
  });
});
