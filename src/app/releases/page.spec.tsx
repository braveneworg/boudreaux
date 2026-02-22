/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';

import ReleasesPage from './page';

// Mock server-only
vi.mock('server-only', () => ({}));

// Mock the ReleaseService
const mockGetPublishedReleases = vi.fn();
vi.mock('@/lib/services/release-service', () => ({
  ReleaseService: {
    getPublishedReleases: (...args: unknown[]) => mockGetPublishedReleases(...args),
  },
}));

// Mock child components to isolate page-level logic
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
    items: Array<{ anchorText: string; url: string; isActive: boolean }>;
  }) => (
    <nav data-testid="breadcrumb-menu" data-items={JSON.stringify(items)}>
      Breadcrumbs
    </nav>
  ),
}));

vi.mock('@/app/components/ui/heading', () => ({
  Heading: ({ children, level }: { children: React.ReactNode; level?: number }) => (
    <div data-testid="heading" data-level={level}>
      {children}
    </div>
  ),
}));

vi.mock('@/app/components/release-search-combobox', () => ({
  ReleaseSearchCombobox: ({ releases }: { releases: unknown[] }) => (
    <div data-testid="release-search-combobox" data-count={releases.length}>
      Search Combobox
    </div>
  ),
}));

vi.mock('@/app/components/release-card-grid', () => ({
  ReleaseCardGrid: ({ releases }: { releases: unknown[] }) => (
    <div data-testid="release-card-grid" data-count={releases.length}>
      Card Grid
    </div>
  ),
}));

describe('ReleasesPage', () => {
  const mockReleasesData = [
    {
      id: 'release-1',
      title: 'Test Album',
      coverArt: 'https://example.com/cover.jpg',
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
            groups: [],
          },
        },
      ],
      releaseUrls: [],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetPublishedReleases.mockResolvedValue({
      success: true,
      data: mockReleasesData,
    });
  });

  it('should render page structure with PageContainer and ContentContainer', async () => {
    const Page = await ReleasesPage();
    render(Page);

    expect(screen.getByTestId('page-container')).toBeInTheDocument();
    expect(screen.getByTestId('content-container')).toBeInTheDocument();
  });

  it('should render BreadcrumbMenu with Home > Releases', async () => {
    const Page = await ReleasesPage();
    render(Page);

    const breadcrumbs = screen.getByTestId('breadcrumb-menu');
    expect(breadcrumbs).toBeInTheDocument();
    const items = JSON.parse(breadcrumbs.getAttribute('data-items') || '[]');
    expect(items).toEqual([{ anchorText: 'Releases', url: '/releases', isActive: true }]);
  });

  it('should render Heading', async () => {
    const Page = await ReleasesPage();
    render(Page);

    expect(screen.getByTestId('heading')).toBeInTheDocument();
  });

  it('should render ReleaseSearchCombobox with releases data', async () => {
    const Page = await ReleasesPage();
    render(Page);

    const combobox = screen.getByTestId('release-search-combobox');
    expect(combobox).toBeInTheDocument();
    expect(combobox).toHaveAttribute('data-count', '1');
  });

  it('should render ReleaseCardGrid with releases data', async () => {
    const Page = await ReleasesPage();
    render(Page);

    const grid = screen.getByTestId('release-card-grid');
    expect(grid).toBeInTheDocument();
    expect(grid).toHaveAttribute('data-count', '1');
  });

  it('should call getPublishedReleases on render', async () => {
    const Page = await ReleasesPage();
    render(Page);

    expect(mockGetPublishedReleases).toHaveBeenCalledOnce();
  });

  it('should render error message with Try again link when service fails', async () => {
    mockGetPublishedReleases.mockResolvedValue({
      success: false,
      error: 'Failed to fetch',
    });

    const Page = await ReleasesPage();
    render(Page);

    expect(screen.getByTestId('page-container')).toBeInTheDocument();
    expect(
      screen.getByText('Unable to load releases. Please try again later.')
    ).toBeInTheDocument();
    const tryAgainLink = screen.getByRole('link', { name: 'Try again' });
    expect(tryAgainLink).toHaveAttribute('href', '/releases');
    // Should NOT render the grid when in error state
    expect(screen.queryByTestId('release-card-grid')).not.toBeInTheDocument();
  });

  it('should render empty grid when no releases exist', async () => {
    mockGetPublishedReleases.mockResolvedValue({
      success: true,
      data: [],
    });

    const Page = await ReleasesPage();
    render(Page);

    const grid = screen.getByTestId('release-card-grid');
    expect(grid).toHaveAttribute('data-count', '0');
  });
});
