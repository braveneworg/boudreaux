/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';

import ArtistsIndexPage from './page';

vi.mock('server-only', () => ({}));

const mockListPublishedArtists = vi.fn().mockResolvedValue({ success: true, data: [] });
vi.mock('@/lib/services/artist-service', () => ({
  ArtistService: {
    listPublishedArtists: (...args: unknown[]) => mockListPublishedArtists(...args),
  },
}));

// Mock child components
vi.mock('@/app/components/ui/page-container', () => ({
  PageContainer: ({ children }: { children: React.ReactNode }) => (
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

vi.mock('@/app/components/artist-list-card', () => ({
  ArtistListCard: ({ artist }: { artist: { id: string; name: string } }) => (
    <div data-testid="artist-list-card">{artist.name}</div>
  ),
}));

describe('ArtistsIndexPage', () => {
  beforeEach(() => {
    mockListPublishedArtists.mockResolvedValue({ success: true, data: [] });
  });

  it('should render page structure with PageContainer and ContentContainer', async () => {
    const Page = await ArtistsIndexPage();
    render(Page);

    expect(screen.getByTestId('page-container')).toBeInTheDocument();
    expect(screen.getByTestId('content-container')).toBeInTheDocument();
  });

  it('should render BreadcrumbMenu with Home and Artists items', async () => {
    const Page = await ArtistsIndexPage();
    render(Page);

    const breadcrumbs = screen.getByTestId('breadcrumb-menu');
    const items = JSON.parse(breadcrumbs.getAttribute('data-items') || '[]');
    expect(items).toEqual([
      { anchorText: 'Home', url: '/', isActive: false },
      { anchorText: 'Artists', url: '/artists', isActive: true },
    ]);
  });

  it('should render the artists heading as an image', async () => {
    const Page = await ArtistsIndexPage();
    render(Page);

    const headingImage = screen.getByRole('img', { name: /artists/i });
    expect(headingImage).toHaveAttribute('alt', 'artists');
  });

  it('should render a link to the artist search page', async () => {
    const Page = await ArtistsIndexPage();
    render(Page);

    const searchLink = screen.getByRole('link', { name: /search artists/i });
    expect(searchLink).toHaveAttribute('href', '/artists/search');
  });

  it('should render an ArtistListCard for each published artist', async () => {
    mockListPublishedArtists.mockResolvedValue({
      success: true,
      data: [
        { id: 'artist-1', name: 'First Artist' },
        { id: 'artist-2', name: 'Second Artist' },
      ],
    });

    const Page = await ArtistsIndexPage();
    render(Page);

    expect(screen.getAllByTestId('artist-list-card')).toHaveLength(2);
  });

  it('should render an empty state when no artists are published', async () => {
    const Page = await ArtistsIndexPage();
    render(Page);

    expect(screen.getByText(/no artists have been published yet/i)).toBeInTheDocument();
  });

  it('should render an error state when the service call fails', async () => {
    mockListPublishedArtists.mockResolvedValue({ success: false, error: 'boom' });

    const Page = await ArtistsIndexPage();
    render(Page);

    expect(screen.getByText(/artists are unavailable right now/i)).toBeInTheDocument();
  });
});
