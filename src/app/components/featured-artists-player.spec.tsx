import type { ReactNode } from 'react';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, fireEvent } from '@testing-library/react';

import type { FeaturedArtist } from '@/lib/types/media-models';

import { FeaturedArtistsPlayer } from './featured-artists-player';

// Mock the MediaPlayer component
vi.mock('@/app/components/ui/audio/media-player', () => {
  const MockMediaPlayer = ({ children }: { children: ReactNode }) => (
    <div data-testid="media-player">{children}</div>
  );
  MockMediaPlayer.displayName = 'MockMediaPlayer';

  const FeaturedArtistCarousel = ({
    featuredArtists,
    onSelect,
  }: {
    featuredArtists: FeaturedArtist[];
    onSelect?: (artist: FeaturedArtist) => void;
  }) => (
    <div data-testid="featured-artist-carousel">
      {featuredArtists.map((artist) => (
        <button
          key={artist.id}
          data-testid={`artist-${artist.id}`}
          onClick={() => onSelect?.(artist)}
        >
          {artist.displayName || 'Unknown'}
        </button>
      ))}
    </div>
  );
  FeaturedArtistCarousel.displayName = 'FeaturedArtistCarousel';
  MockMediaPlayer.FeaturedArtistCarousel = FeaturedArtistCarousel;

  const Controls = ({ audioSrc }: { audioSrc: string }) => (
    <div data-testid="media-controls" data-audio-src={audioSrc}>
      Controls
    </div>
  );
  Controls.displayName = 'Controls';
  MockMediaPlayer.Controls = Controls;

  return { MediaPlayer: MockMediaPlayer };
});

// Mock next/image
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} data-testid="cover-art-image" />
  ),
}));

const createQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

const createWrapper = () => {
  const queryClient = createQueryClient();
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
  Wrapper.displayName = 'TestWrapper';
  return Wrapper;
};

describe('FeaturedArtistsPlayer', () => {
  const mockFeaturedArtists: FeaturedArtist[] = [
    {
      id: 'featured-1',
      displayName: 'Test Artist 1',
      featuredOn: new Date('2024-01-15'),
      position: 1,
      description: 'A test artist description',
      coverArt: 'https://example.com/cover1.jpg',
      trackId: null,
      releaseId: null,
      groupId: null,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      artists: [],
      track: null,
      release: null,
      group: null,
    },
    {
      id: 'featured-2',
      displayName: 'Test Artist 2',
      featuredOn: new Date('2024-01-14'),
      position: 2,
      description: null,
      coverArt: 'https://example.com/cover2.jpg',
      trackId: 'track-1',
      releaseId: null,
      groupId: null,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      artists: [],
      track: {
        id: 'track-1',
        title: 'Test Track',
        audioUrl: 'https://example.com/audio.mp3',
        duration: 180,
        position: 1,
        coverArt: null,
        createdAt: new Date('2024-01-01'),
        updatedAt: new Date('2024-01-01'),
      },
      release: null,
      group: null,
    },
  ] as unknown as FeaturedArtist[];

  it('should render empty state when no featured artists', () => {
    render(<FeaturedArtistsPlayer featuredArtists={[]} />, { wrapper: createWrapper() });

    expect(screen.getByText('No featured artists available at this time.')).toBeInTheDocument();
  });

  it('should render the media player with featured artists', () => {
    render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByTestId('media-player')).toBeInTheDocument();
    expect(screen.getByTestId('featured-artist-carousel')).toBeInTheDocument();
  });

  it('should display the first artist as selected by default', () => {
    render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
      wrapper: createWrapper(),
    });

    // Check the heading displays the first artist name
    expect(screen.getByRole('heading', { level: 2, name: 'Test Artist 1' })).toBeInTheDocument();
    expect(screen.getByText('A test artist description')).toBeInTheDocument();
  });

  it('should change selected artist when clicking on carousel item', () => {
    render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
      wrapper: createWrapper(),
    });

    // Click on second artist
    fireEvent.click(screen.getByTestId('artist-featured-2'));

    // Should now display second artist
    expect(screen.getByRole('heading', { level: 2 })).toHaveTextContent('Test Artist 2');
  });

  it('should render audio controls when track has audioUrl', () => {
    render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
      wrapper: createWrapper(),
    });

    // Click on second artist which has a track
    fireEvent.click(screen.getByTestId('artist-featured-2'));

    expect(screen.getByTestId('media-controls')).toBeInTheDocument();
    expect(screen.getByTestId('media-controls')).toHaveAttribute(
      'data-audio-src',
      'https://example.com/audio.mp3'
    );
  });

  it('should not render audio controls when no track', () => {
    render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
      wrapper: createWrapper(),
    });

    // First artist has no track
    expect(screen.queryByTestId('media-controls')).not.toBeInTheDocument();
  });

  it('should render cover art image', () => {
    render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByTestId('cover-art-image')).toBeInTheDocument();
    expect(screen.getByTestId('cover-art-image')).toHaveAttribute(
      'src',
      'https://example.com/cover1.jpg'
    );
  });
});
