import { render, screen } from '@testing-library/react';

import type { Artist } from '@/lib/types/media-models';

import { CarouselNumberUp } from './carousel-number-up';

// Mock next/image
vi.mock('next/image', () => ({
  default: function MockImage(props: { src: string; alt: string; width: number; height: number }) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={props.src} alt={props.alt} width={props.width} height={props.height} />;
  },
}));

// Mock carousel components
vi.mock('@/components/ui/carousel', () => ({
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
  CarouselNext: () => <button data-testid="carousel-next">Next</button>,
  CarouselPrevious: () => <button data-testid="carousel-previous">Previous</button>,
}));

const createMockArtist = (
  id: string,
  firstName: string,
  coverArt: string,
  releasedOn: Date
): Artist =>
  ({
    id,
    firstName,
    surname: 'Test',
    displayName: null,
    bio: null,
    slug: `artist-${id}`,
    createdAt: new Date(),
    updatedAt: new Date(),
    images: [],
    labels: [],
    urls: [],
    releases: [
      {
        id: `artist-release-${id}`,
        artistId: id,
        releaseId: 'release-1',
        release: {
          id: 'release-1',
          title: 'Test Release',
          description: null,
          labels: [],
          coverArt,
          releasedOn,
          catalogNumber: null,
          downloadUrls: [],
          formats: [],
          extendedData: [],
          notes: [],
          executiveProducedBy: [],
          coProducedBy: [],
          masteredBy: [],
          mixedBy: [],
          recordedBy: [],
          artBy: [],
          designBy: [],
          photographyBy: [],
          linerNotesBy: [],
          imageTypes: [],
          variants: [],
          publishedAt: null,
          featuredOn: null,
          featuredUntil: null,
          featuredDescription: null,
          tagId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      },
    ],
    groups: [],
  }) as unknown as Artist;

describe('CarouselNumberUp', () => {
  const mockArtists: Artist[] = [
    createMockArtist('1', 'Artist One', '/cover1.jpg', new Date('2024-01-01')),
    createMockArtist('2', 'Artist Two', '/cover2.jpg', new Date('2024-02-01')),
    createMockArtist('3', 'Artist Three', '/cover3.jpg', new Date('2024-03-01')),
    createMockArtist('4', 'Artist Four', '/cover4.jpg', new Date('2024-04-01')),
    createMockArtist('5', 'Artist Five', '/cover5.jpg', new Date('2024-05-01')),
  ];

  it('renders carousel with aria-label', () => {
    render(<CarouselNumberUp artists={mockArtists} numberUp={4} />);

    expect(screen.getByTestId('carousel')).toHaveAttribute('aria-label', 'Featured Artists');
  });

  it('renders carousel content', () => {
    render(<CarouselNumberUp artists={mockArtists} numberUp={4} />);

    expect(screen.getByTestId('carousel-content')).toBeInTheDocument();
  });

  it('renders navigation buttons', () => {
    render(<CarouselNumberUp artists={mockArtists} numberUp={4} />);

    expect(screen.getByTestId('carousel-previous')).toBeInTheDocument();
    expect(screen.getByTestId('carousel-next')).toBeInTheDocument();
  });

  it('limits displayed artists to numberUp value', () => {
    render(<CarouselNumberUp artists={mockArtists} numberUp={3} />);

    const items = screen.getAllByTestId('carousel-item');
    expect(items).toHaveLength(3);
  });

  it('renders all artists when numberUp is greater than array length', () => {
    render(<CarouselNumberUp artists={mockArtists} numberUp={10} />);

    const items = screen.getAllByTestId('carousel-item');
    expect(items).toHaveLength(5);
  });

  it('renders images with correct cover art', () => {
    render(<CarouselNumberUp artists={mockArtists} numberUp={2} />);

    const images = screen.getAllByRole('img');
    expect(images).toHaveLength(2);
  });

  it('uses displayName when available for alt text', () => {
    const artistsWithDisplayName: Artist[] = [
      {
        ...createMockArtist('1', 'First', '/cover1.jpg', new Date('2024-01-01')),
        displayName: 'DJ First',
      },
    ];

    render(<CarouselNumberUp artists={artistsWithDisplayName} numberUp={1} />);

    expect(screen.getByAltText('DJ First')).toBeInTheDocument();
  });

  it('uses firstName and surname when displayName is null', () => {
    render(<CarouselNumberUp artists={mockArtists} numberUp={1} />);

    expect(screen.getByAltText('Artist One Test')).toBeInTheDocument();
  });

  it('renders with default numberUp when not specified', () => {
    render(<CarouselNumberUp artists={mockArtists} numberUp={4} />);

    const items = screen.getAllByTestId('carousel-item');
    expect(items).toHaveLength(4);
  });

  it('renders with horizontal orientation', () => {
    render(<CarouselNumberUp artists={mockArtists} numberUp={4} />);

    expect(screen.getByTestId('carousel')).toHaveAttribute('orientation', 'horizontal');
  });

  it('handles empty artists array', () => {
    render(<CarouselNumberUp artists={[]} numberUp={4} />);

    const items = screen.queryAllByTestId('carousel-item');
    expect(items).toHaveLength(0);
  });

  it('sorts releases by date and uses most recent cover art', () => {
    const artistWithMultipleReleases: Artist = {
      ...createMockArtist('1', 'Multi', '/old-cover.jpg', new Date('2023-01-01')),
      releases: [
        {
          id: 'artist-release-old',
          artistId: '1',
          releaseId: 'old-release',
          release: {
            id: 'old-release',
            title: 'Old Release',
            description: null,
            labels: [],
            coverArt: '/old-cover.jpg',
            releasedOn: new Date('2023-01-01'),
            catalogNumber: null,
            downloadUrls: [],
            formats: [],
            extendedData: [],
            notes: [],
            executiveProducedBy: [],
            coProducedBy: [],
            masteredBy: [],
            mixedBy: [],
            recordedBy: [],
            artBy: [],
            designBy: [],
            photographyBy: [],
            linerNotesBy: [],
            imageTypes: [],
            variants: [],
            deletedOn: null,
            publishedAt: null,
            featuredOn: null,
            featuredUntil: null,
            featuredDescription: null,
            tagId: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
        {
          id: 'artist-release-new',
          artistId: '1',
          releaseId: 'new-release',
          release: {
            id: 'new-release',
            title: 'New Release',
            description: null,
            labels: [],
            coverArt: '/new-cover.jpg',
            releasedOn: new Date('2024-06-01'),
            catalogNumber: null,
            downloadUrls: [],
            formats: [],
            extendedData: [],
            notes: [],
            executiveProducedBy: [],
            coProducedBy: [],
            masteredBy: [],
            mixedBy: [],
            recordedBy: [],
            artBy: [],
            designBy: [],
            photographyBy: [],
            linerNotesBy: [],
            imageTypes: [],
            variants: [],
            deletedOn: null,
            publishedAt: null,
            featuredOn: null,
            featuredUntil: null,
            featuredDescription: null,
            tagId: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
        },
      ],
    };

    render(<CarouselNumberUp artists={[artistWithMultipleReleases]} numberUp={1} />);

    const image = screen.getByRole('img');
    expect(image).toHaveAttribute('src', '/new-cover.jpg');
  });

  it('uses displayName when available', () => {
    const artistWithDisplayName: Artist = {
      ...mockArtists[0],
      displayName: 'DJ Superstar',
    };

    render(<CarouselNumberUp artists={[artistWithDisplayName]} numberUp={1} />);

    const image = screen.getByRole('img');
    expect(image).toHaveAttribute('alt', 'DJ Superstar');
  });

  it('uses firstName and surname fallback when displayName is null', () => {
    const artistWithoutDisplayName: Artist = {
      ...mockArtists[0],
      displayName: null,
      firstName: 'John',
      surname: 'Doe',
    };

    render(<CarouselNumberUp artists={[artistWithoutDisplayName]} numberUp={1} />);

    const image = screen.getByRole('img');
    expect(image).toHaveAttribute('alt', 'John Doe');
  });
});
