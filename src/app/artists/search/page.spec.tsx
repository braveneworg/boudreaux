/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen } from '@testing-library/react';

import ArtistSearchPage from './page';

// Mock server-only
vi.mock('server-only', () => ({}));

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

// Mock next/image
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} data-testid="artist-image" />
  ),
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

// Mock UI components
vi.mock('@/app/components/artist-search-input', () => ({
  ArtistSearchInput: () => <div data-testid="artist-search-input">Search Input</div>,
}));

vi.mock('@/app/components/ui/breadcrumb-menu', () => ({
  BreadcrumbMenu: () => <nav data-testid="breadcrumb-menu">Breadcrumbs</nav>,
}));

vi.mock('@/app/components/ui/content-container', () => ({
  ContentContainer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="content-container">{children}</div>
  ),
}));

vi.mock('@/app/components/ui/heading', () => ({
  Heading: ({ children }: { children: React.ReactNode }) => <h1>{children}</h1>,
}));

vi.mock('@/app/components/ui/page-container', () => ({
  default: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="page-container">{children}</div>
  ),
}));

describe('ArtistSearchPage', () => {
  const mockArtists = [
    {
      id: 'artist-1',
      slug: 'john-doe',
      displayName: null,
      firstName: 'John',
      middleName: null,
      surname: 'Doe',
      title: null,
      suffix: null,
      images: [{ src: 'https://example.com/john.jpg', altText: 'John Doe' }],
    },
    {
      id: 'artist-2',
      slug: 'jane-smith',
      displayName: 'Jane Smith',
      firstName: 'Jane',
      middleName: null,
      surname: 'Smith',
      title: null,
      suffix: null,
      images: [],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ artists: mockArtists }),
    }) as unknown as typeof fetch;
  });

  it('should render page structure', async () => {
    const Page = await ArtistSearchPage({
      searchParams: Promise.resolve({ q: 'john' }),
    });
    render(Page);

    expect(screen.getByTestId('page-container')).toBeInTheDocument();
    expect(screen.getByTestId('content-container')).toBeInTheDocument();
    expect(screen.getByTestId('breadcrumb-menu')).toBeInTheDocument();
    expect(screen.getByTestId('artist-search-input')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Search Artists' })).toBeInTheDocument();
  });

  it('should fetch artists via internal API with query', async () => {
    const Page = await ArtistSearchPage({
      searchParams: Promise.resolve({ q: 'john' }),
    });
    render(Page);

    expect(global.fetch).toHaveBeenCalledWith(
      'http://test-host/api/artists/search?q=john&format=full',
      { cache: 'no-store' }
    );
  });

  it('should encode query parameter', async () => {
    const Page = await ArtistSearchPage({
      searchParams: Promise.resolve({ q: 'john & jane' }),
    });
    render(Page);

    expect(global.fetch).toHaveBeenCalledWith(
      'http://test-host/api/artists/search?q=john%20%26%20jane&format=full',
      { cache: 'no-store' }
    );
  });

  it('should render artist results with images', async () => {
    const Page = await ArtistSearchPage({
      searchParams: Promise.resolve({ q: 'john' }),
    });
    render(Page);

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('Jane Smith')).toBeInTheDocument();

    const images = screen.getAllByTestId('artist-image');
    expect(images).toHaveLength(1);
    expect(images[0]).toHaveAttribute('src', 'https://example.com/john.jpg');
  });

  it('should render artist links', async () => {
    const Page = await ArtistSearchPage({
      searchParams: Promise.resolve({ q: 'john' }),
    });
    render(Page);

    const links = screen.getAllByRole('link');
    expect(links[0]).toHaveAttribute('href', '/artists/john-doe');
    expect(links[1]).toHaveAttribute('href', '/artists/jane-smith');
  });

  it('should not fetch when query is empty', async () => {
    const Page = await ArtistSearchPage({
      searchParams: Promise.resolve({}),
    });
    render(Page);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByText('Enter at least 3 characters to search.')).toBeInTheDocument();
  });

  it('should show empty message when no results', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ artists: [] }),
    }) as unknown as typeof fetch;

    const Page = await ArtistSearchPage({
      searchParams: Promise.resolve({ q: 'nonexistent' }),
    });
    render(Page);

    expect(screen.getByText('No artists found for "nonexistent".')).toBeInTheDocument();
  });

  it('should show error state when fetch fails', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({}),
    }) as unknown as typeof fetch;

    const Page = await ArtistSearchPage({
      searchParams: Promise.resolve({ q: 'john' }),
    });
    render(Page);

    expect(
      screen.getByText('Unable to search artists. Please try again later.')
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Try again' })).toHaveAttribute(
      'href',
      '/artists/search'
    );
  });

  it('should handle non-string query param', async () => {
    const Page = await ArtistSearchPage({
      searchParams: Promise.resolve({ q: ['john', 'doe'] }),
    });
    render(Page);

    // Non-string q should be treated as empty
    expect(global.fetch).not.toHaveBeenCalled();
    expect(screen.getByText('Enter at least 3 characters to search.')).toBeInTheDocument();
  });

  it('should render initials fallback when artist has no images', async () => {
    const Page = await ArtistSearchPage({
      searchParams: Promise.resolve({ q: 'john' }),
    });
    render(Page);

    // Jane Smith has no images, should show initial 'J'
    expect(screen.getByText('J')).toBeInTheDocument();
  });
});
