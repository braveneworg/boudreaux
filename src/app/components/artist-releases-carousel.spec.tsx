/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';

import type { ReleaseCarouselItem } from '@/lib/types/media-models';

import { ArtistReleasesCarousel } from './artist-releases-carousel';

// Mock next/image
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span data-testid="carousel-image" data-src={src} data-alt={alt} />
  ),
}));

// Mock next/link
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href} data-testid="carousel-link">
      {children}
    </a>
  ),
}));

// Mock the Carousel components
vi.mock('@/app/components/ui/carousel', () => ({
  Carousel: ({ children, ...props }: { children: React.ReactNode }) => (
    <div data-testid="carousel" {...props}>
      {children}
    </div>
  ),
  CarouselContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="carousel-content">{children}</div>
  ),
  CarouselItem: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="carousel-item">{children}</div>
  ),
  CarouselPrevious: () => <button data-testid="carousel-previous">Previous</button>,
  CarouselNext: () => <button data-testid="carousel-next">Next</button>,
}));

describe('ArtistReleasesCarousel', () => {
  const mockReleases = [
    {
      id: 'release-2',
      title: 'Other Album',
      coverArt: 'https://cdn.example.com/cover2.jpg',
      description: null,
      publishedAt: new Date(),
      releasedOn: new Date(),
      deletedOn: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      images: [],
    },
    {
      id: 'release-3',
      title: 'Third Album',
      coverArt: '',
      description: null,
      publishedAt: new Date(),
      releasedOn: new Date(),
      deletedOn: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      images: [
        {
          id: 'img-1',
          src: 'https://cdn.example.com/img1.jpg',
          altText: 'Third Album image',
          sortOrder: 0,
          releaseId: 'release-3',
          trackId: null,
          artistId: null,
          groupId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    },
  ] as unknown as ReleaseCarouselItem[];

  it('should render carousel with release items', () => {
    render(<ArtistReleasesCarousel releases={mockReleases} artistName="John Doe" />);

    expect(screen.getByTestId('carousel')).toBeInTheDocument();
    const items = screen.getAllByTestId('carousel-item');
    expect(items).toHaveLength(2);
  });

  it('should link each item to /releases/{releaseId}', () => {
    render(<ArtistReleasesCarousel releases={mockReleases} artistName="John Doe" />);

    const links = screen.getAllByTestId('carousel-link');
    expect(links[0]).toHaveAttribute('href', '/releases/release-2');
    expect(links[1]).toHaveAttribute('href', '/releases/release-3');
  });

  it('should not render when releases array is empty', () => {
    const { container } = render(<ArtistReleasesCarousel releases={[]} artistName="John Doe" />);

    expect(container.innerHTML).toBe('');
  });

  it('should handle cover art fallback to images', () => {
    render(<ArtistReleasesCarousel releases={mockReleases} artistName="John Doe" />);

    const images = screen.getAllByTestId('carousel-image');
    // First release uses coverArt directly
    expect(images[0]).toHaveAttribute('data-src', 'https://cdn.example.com/cover2.jpg');
    // Second release falls back to images[0].src
    expect(images[1]).toHaveAttribute('data-src', 'https://cdn.example.com/img1.jpg');
  });

  it('should have aria-label with artist name', () => {
    render(<ArtistReleasesCarousel releases={mockReleases} artistName="John Doe" />);

    const carousel = screen.getByTestId('carousel');
    expect(carousel).toHaveAttribute('aria-label', 'Other releases by John Doe');
  });
});
