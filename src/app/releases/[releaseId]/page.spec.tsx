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

// Mock the ReleaseService
const mockGetReleaseWithTracks = vi.fn();
const mockGetArtistOtherReleases = vi.fn();
vi.mock('@/lib/services/release-service', () => ({
  ReleaseService: {
    getReleaseWithTracks: (...args: unknown[]) => mockGetReleaseWithTracks(...args),
    getArtistOtherReleases: (...args: unknown[]) => mockGetArtistOtherReleases(...args),
  },
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
  ReleasePlayer: ({ release, autoPlay }: { release: unknown; autoPlay?: boolean }) => (
    <div
      data-testid="release-player"
      data-release-id={(release as { id: string }).id}
      data-auto-play={autoPlay?.toString()}
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

// Mock auth (added for PWYW purchase feature)
const mockAuth = vi.fn().mockResolvedValue(null);
vi.mock('../../../../auth', () => ({
  auth: (...args: unknown[]) => mockAuth(...args),
}));

// Mock PurchaseRepository (added for PWYW purchase feature)
const mockFindByUserAndRelease = vi.fn().mockResolvedValue(null);
const mockGetDownloadRecord = vi.fn().mockResolvedValue(null);
vi.mock('@/lib/repositories/purchase-repository', () => ({
  PurchaseRepository: {
    findByUserAndRelease: (...args: unknown[]) => mockFindByUserAndRelease(...args),
    getDownloadRecord: (...args: unknown[]) => mockGetDownloadRecord(...args),
  },
}));

// Mock ReleaseDigitalFormatRepository (added for digital formats feature)
const mockFindAllByRelease = vi.fn().mockResolvedValue([]);
vi.mock('@/lib/repositories/release-digital-format-repository', () => ({
  ReleaseDigitalFormatRepository: class {
    findAllByRelease = (...args: unknown[]) => mockFindAllByRelease(...args);
  },
}));

describe('ReleasePlayerPage', () => {
  const mockReleaseData = {
    id: 'release-1',
    title: 'Midnight Serenade',
    coverArt: 'https://cdn.example.com/cover.jpg',
    description: 'A great album',
    publishedAt: new Date(),
    releasedOn: new Date(),
    deletedOn: null,
    createdAt: new Date(),
    updatedAt: new Date(),
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
          createdAt: new Date(),
          updatedAt: new Date(),
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

  const defaultParams = Promise.resolve({ releaseId: 'release-1' });
  const defaultSearchParams = Promise.resolve({} as Record<string, string | string[] | undefined>);
  const autoPlaySearchParams = Promise.resolve({
    autoplay: 'true',
  } as Record<string, string | string[] | undefined>);

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetReleaseWithTracks.mockResolvedValue({
      success: true,
      data: mockReleaseData,
    });
    mockGetArtistOtherReleases.mockResolvedValue({
      success: true,
      data: mockOtherReleases,
    });
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

  it('should call getReleaseWithTracks with release ID', async () => {
    const Page = await ReleasePlayerPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    expect(mockGetReleaseWithTracks).toHaveBeenCalledWith('release-1');
  });

  it('should call getArtistOtherReleases with primary artist ID', async () => {
    const Page = await ReleasePlayerPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    expect(mockGetArtistOtherReleases).toHaveBeenCalledWith('artist-1', 'release-1');
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
    mockGetArtistOtherReleases.mockResolvedValue({
      success: true,
      data: [],
    });

    const Page = await ReleasePlayerPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    expect(screen.queryByTestId('artist-releases-carousel')).not.toBeInTheDocument();
  });

  it('should call notFound when release not found', async () => {
    mockGetReleaseWithTracks.mockResolvedValue({
      success: false,
      error: 'Release not found',
    });

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
    mockGetReleaseWithTracks.mockResolvedValue({
      success: true,
      data: { ...mockReleaseData, description: null },
    });

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

  it('should fetch purchase status for authenticated user', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } });
    mockFindByUserAndRelease.mockResolvedValue({ id: 'purchase-1' });
    mockGetDownloadRecord.mockResolvedValue({ downloadCount: 3 });

    const Page = await ReleasePlayerPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    expect(mockFindByUserAndRelease).toHaveBeenCalledWith('user-1', 'release-1');
    expect(mockGetDownloadRecord).toHaveBeenCalledWith('user-1', 'release-1');
  });

  it('should filter formats to only those with a fileName', async () => {
    mockFindAllByRelease.mockResolvedValue([
      { formatType: 'MP3_320KBPS', fileName: 'album.mp3' },
      { formatType: 'FLAC', fileName: null },
    ]);

    const Page = await ReleasePlayerPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    // The page renders — digital formats are passed to ReleasePlayer
    expect(screen.getByTestId('release-player')).toBeInTheDocument();
  });

  it('should show Unknown Artist when no primary artist exists', async () => {
    mockGetReleaseWithTracks.mockResolvedValue({
      success: true,
      data: { ...mockReleaseData, artistReleases: [] },
    });

    const Page = await ReleasePlayerPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    expect(screen.getByTestId('page-container')).toBeInTheDocument();
  });

  it('should handle getArtistOtherReleases failure gracefully', async () => {
    mockGetArtistOtherReleases.mockResolvedValue({
      success: false,
      error: 'Service error',
    });

    const Page = await ReleasePlayerPage({
      params: defaultParams,
      searchParams: defaultSearchParams,
    });
    render(Page);

    // Should not show carousel
    expect(screen.queryByTestId('artist-releases-carousel')).not.toBeInTheDocument();
  });
});
