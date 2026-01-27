import { render, screen, fireEvent, within } from '@testing-library/react';

import type {
  FeaturedArtist,
  Release,
  ReleaseTrack,
  Track,
  Artist,
} from '@/lib/types/media-models';

import { MediaPlayer } from './media-player';

// Mock video.js - factory function must not use variables defined outside
vi.mock('video.js', () => {
  const mockPlayer = {
    addClass: vi.fn(),
    ready: vi.fn((callback: () => void) => callback()),
    on: vi.fn(),
    off: vi.fn(),
    currentTime: vi.fn().mockReturnValue(0),
    paused: vi.fn().mockReturnValue(true),
    play: vi.fn(),
    pause: vi.fn(),
    src: vi.fn(),
    load: vi.fn(),
    dispose: vi.fn(),
    userActive: vi.fn(),
  };

  const mockVideojs = Object.assign(
    vi.fn(() => mockPlayer),
    {
      registerComponent: vi.fn(),
      getComponent: vi.fn(),
    }
  );

  return { default: mockVideojs };
});

// Mock the audio controls
vi.mock('../audio-controls', () => ({
  AudioRewindButton: vi.fn(),
  AudioFastForwardButton: vi.fn(),
  SkipPreviousButton: vi.fn(),
  SkipNextButton: vi.fn(),
}));

// Mock Drawer components from shadcn/ui
vi.mock('@/components/ui/drawer', () => ({
  Drawer: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="drawer">{children}</div>
  ),
  DrawerTrigger: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) => (
    <div data-testid="drawer-trigger" data-as-child={asChild}>
      {children}
    </div>
  ),
  DrawerContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="drawer-content">{children}</div>
  ),
  DrawerHeader: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="drawer-header">{children}</div>
  ),
  DrawerTitle: ({ children }: { children: React.ReactNode }) => (
    <h2 data-testid="drawer-title">{children}</h2>
  ),
  DrawerDescription: ({ children }: { children: React.ReactNode }) => (
    <p data-testid="drawer-description">{children}</p>
  ),
  DrawerClose: ({ children, asChild }: { children: React.ReactNode; asChild?: boolean }) => (
    <div data-testid="drawer-close" data-as-child={asChild}>
      {children}
    </div>
  ),
}));

// Mock Carousel components
vi.mock('@/components/ui/carousel', () => ({
  Carousel: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="carousel">{children}</div>
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

// Mock next/image
vi.mock('next/image', () => ({
  default: ({ src, alt, className }: { src: string; alt: string; className?: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} className={className} data-testid="next-image" />
  ),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  ChevronDown: () => <span data-testid="chevron-down-icon" />,
  ChevronUp: () => <span data-testid="chevron-up-icon" />,
  EllipsisVertical: () => <span data-testid="ellipsis-vertical-icon" />,
  Search: () => <span data-testid="search-icon" />,
}));

// Mock Button from shadcn/ui
vi.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    variant,
    size,
    className,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    variant?: string;
    size?: string;
    className?: string;
  }) => (
    <button
      data-testid="button"
      data-variant={variant}
      data-size={size}
      className={className}
      onClick={onClick}
    >
      {children}
    </button>
  ),
}));

// Test data factory helpers using type assertions to unknown first
const createMockTrack = (
  overrides: Partial<{
    id: string;
    title: string;
    duration: number;
    position: number;
    audioUrl: string;
  }> = {}
): Track =>
  ({
    id: overrides.id ?? 'track-1',
    title: overrides.title ?? 'Test Track',
    duration: overrides.duration ?? 180,
    position: overrides.position ?? 1,
    audioUrl: overrides.audioUrl ?? 'https://example.com/audio.mp3',
    coverArt: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    images: [],
    releaseTracks: [],
  }) as unknown as Track;

const createMockReleaseTrack = (track: Track): ReleaseTrack =>
  ({
    id: `release-track-${track.id}`,
    releaseId: 'release-1',
    trackId: track.id,
    track,
    release: null,
  }) as unknown as ReleaseTrack;

const createMockRelease = (
  releaseTracks: ReleaseTrack[],
  overrides: Partial<{
    id: string;
    title: string;
    coverArt: string | null;
  }> = {}
): Release =>
  ({
    id: overrides.id ?? 'release-1',
    title: overrides.title ?? 'Test Album',
    coverArt: overrides.coverArt ?? 'https://example.com/cover.jpg',
    releaseTracks,
    images: [],
    artistReleases: [],
    releaseUrls: [],
  }) as unknown as Release;

const createMockArtist = (
  overrides: Partial<{
    firstName: string;
    surname: string;
    displayName: string | null;
  }> = {}
): Artist =>
  ({
    id: 'artist-1',
    firstName: overrides.firstName ?? 'Test',
    surname: overrides.surname ?? 'Artist',
    displayName: overrides.displayName ?? null,
    images: [],
    labels: [],
    groups: [],
    releases: [],
    urls: [],
  }) as unknown as Artist;

const createMockFeaturedArtist = (
  overrides: Partial<{
    id: string;
    displayName: string | null;
    position: number;
    coverArt: string | null;
    track: Track | null;
    release: Release | null;
    artists: Array<{
      id: string;
      firstName: string;
      surname: string;
      displayName: string | null;
    }>;
    group: { id: string; name: string } | null;
  }> = {}
): FeaturedArtist =>
  ({
    id: overrides.id ?? 'featured-1',
    displayName: 'displayName' in overrides ? overrides.displayName : 'Test Artist',
    featuredOn: new Date('2024-01-15'),
    position: overrides.position ?? 1,
    description: null,
    coverArt: overrides.coverArt ?? null,
    trackId: 'track-1',
    releaseId: 'release-1',
    groupId: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    artists:
      overrides.artists?.map((a) => ({
        ...a,
        images: [],
        labels: [],
        groups: [],
        releases: [],
        urls: [],
      })) ?? [],
    track: overrides.track ?? null,
    release: overrides.release ?? null,
    group: overrides.group ?? null,
  }) as unknown as FeaturedArtist;

describe('MediaPlayer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('MediaPlayer container', () => {
    it('should render children', () => {
      render(
        <MediaPlayer>
          <div data-testid="child">Child content</div>
        </MediaPlayer>
      );

      expect(screen.getByTestId('child')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(
        <MediaPlayer className="custom-class">
          <div>Child</div>
        </MediaPlayer>
      );

      expect(container.firstChild).toHaveClass('custom-class');
    });
  });

  describe('Controls component', () => {
    it('should render the container div', () => {
      const { container } = render(
        <MediaPlayer>
          <MediaPlayer.Controls audioSrc="https://example.com/audio.mp3" />
        </MediaPlayer>
      );

      const controlsWrapper = container.querySelector('.audio-player-wrapper');
      expect(controlsWrapper).toBeInTheDocument();
      expect(controlsWrapper).toHaveAttribute('data-vjs-player');
    });
  });

  describe('InfoTickerTape component', () => {
    it('should render track title and display name with featuredArtist', () => {
      const mockTrack = createMockTrack({ title: 'My Song' });
      const mockReleaseTracks = [createMockReleaseTrack(mockTrack)];
      const mockRelease = createMockRelease(mockReleaseTracks, { title: 'My Album' });

      const featuredArtist = createMockFeaturedArtist({
        displayName: 'Test Artist',
        track: mockTrack,
        release: mockRelease,
      });

      render(
        <MediaPlayer>
          <MediaPlayer.InfoTickerTape featuredArtist={featuredArtist} />
        </MediaPlayer>
      );

      expect(screen.getByText(/My Song/)).toBeInTheDocument();
      expect(screen.getByText(/Test Artist/)).toBeInTheDocument();
      expect(screen.getByText(/My Album/)).toBeInTheDocument();
    });

    it('should use text-xs font class for ticker text', () => {
      const mockTrack = createMockTrack();
      const mockReleaseTracks = [createMockReleaseTrack(mockTrack)];
      const mockRelease = createMockRelease(mockReleaseTracks);

      const featuredArtist = createMockFeaturedArtist({
        track: mockTrack,
        release: mockRelease,
      });

      const { container } = render(
        <MediaPlayer>
          <MediaPlayer.InfoTickerTape featuredArtist={featuredArtist} />
        </MediaPlayer>
      );

      const tickerText = container.querySelector('.text-xs');
      expect(tickerText).toBeInTheDocument();
    });

    it('should apply marquee animation when isPlaying is true', () => {
      const mockTrack = createMockTrack();
      const mockReleaseTracks = [createMockReleaseTrack(mockTrack)];
      const mockRelease = createMockRelease(mockReleaseTracks);

      const featuredArtist = createMockFeaturedArtist({
        track: mockTrack,
        release: mockRelease,
      });

      const { container } = render(
        <MediaPlayer>
          <MediaPlayer.InfoTickerTape featuredArtist={featuredArtist} isPlaying />
        </MediaPlayer>
      );

      const animatedElement = container.querySelector('.animate-marquee');
      expect(animatedElement).toBeInTheDocument();
    });

    it('should center text when isPlaying is false', () => {
      const mockTrack = createMockTrack();
      const mockReleaseTracks = [createMockReleaseTrack(mockTrack)];
      const mockRelease = createMockRelease(mockReleaseTracks);

      const featuredArtist = createMockFeaturedArtist({
        track: mockTrack,
        release: mockRelease,
      });

      const { container } = render(
        <MediaPlayer>
          <MediaPlayer.InfoTickerTape featuredArtist={featuredArtist} isPlaying={false} />
        </MediaPlayer>
      );

      const centeredContainer = container.querySelector('.text-center');
      expect(centeredContainer).toBeInTheDocument();
    });

    it('should fall back to artist firstName surname when no displayName on featuredArtist', () => {
      const mockTrack = createMockTrack();
      const mockReleaseTracks = [createMockReleaseTrack(mockTrack)];
      const mockRelease = createMockRelease(mockReleaseTracks);

      const featuredArtist = createMockFeaturedArtist({
        displayName: null,
        track: mockTrack,
        release: mockRelease,
        artists: [{ id: 'artist-1', firstName: 'Jane', surname: 'Smith', displayName: null }],
      });

      render(
        <MediaPlayer>
          <MediaPlayer.InfoTickerTape featuredArtist={featuredArtist} />
        </MediaPlayer>
      );

      expect(screen.getByText(/Jane Smith/)).toBeInTheDocument();
    });

    it('should use artist displayName when available', () => {
      const mockTrack = createMockTrack();
      const mockReleaseTracks = [createMockReleaseTrack(mockTrack)];
      const mockRelease = createMockRelease(mockReleaseTracks);

      const featuredArtist = createMockFeaturedArtist({
        displayName: null,
        track: mockTrack,
        release: mockRelease,
        artists: [{ id: 'artist-1', firstName: 'Jane', surname: 'Smith', displayName: 'DJ Jane' }],
      });

      render(
        <MediaPlayer>
          <MediaPlayer.InfoTickerTape featuredArtist={featuredArtist} />
        </MediaPlayer>
      );

      expect(screen.getByText(/DJ Jane/)).toBeInTheDocument();
    });

    it('should fall back to group name when no displayName and no artists', () => {
      const mockTrack = createMockTrack();
      const mockReleaseTracks = [createMockReleaseTrack(mockTrack)];
      const mockRelease = createMockRelease(mockReleaseTracks);

      const featuredArtist = createMockFeaturedArtist({
        displayName: null,
        track: mockTrack,
        release: mockRelease,
        artists: [],
        group: { id: 'group-1', name: 'The Test Band' },
      });

      render(
        <MediaPlayer>
          <MediaPlayer.InfoTickerTape featuredArtist={featuredArtist} />
        </MediaPlayer>
      );

      expect(screen.getByText(/The Test Band/)).toBeInTheDocument();
    });

    it('should display Unknown Artist when no displayName, artists, or group', () => {
      const mockTrack = createMockTrack();
      const mockReleaseTracks = [createMockReleaseTrack(mockTrack)];
      const mockRelease = createMockRelease(mockReleaseTracks);

      const featuredArtist = createMockFeaturedArtist({
        displayName: null,
        track: mockTrack,
        release: mockRelease,
        artists: [],
        group: null,
      });

      render(
        <MediaPlayer>
          <MediaPlayer.InfoTickerTape featuredArtist={featuredArtist} />
        </MediaPlayer>
      );

      expect(screen.getByText(/Unknown Artist/)).toBeInTheDocument();
    });

    it('should show TrackListDrawer when release has more than 1 track', () => {
      const track1 = createMockTrack({ id: 'track-1', title: 'Track 1', position: 1 });
      const track2 = createMockTrack({ id: 'track-2', title: 'Track 2', position: 2 });
      const releaseTracks = [createMockReleaseTrack(track1), createMockReleaseTrack(track2)];
      const mockRelease = createMockRelease(releaseTracks);

      const featuredArtist = createMockFeaturedArtist({
        track: track1,
        release: mockRelease,
        // Include an artist so TrackListDrawer is shown (requires primaryArtist)
        artists: [{ id: 'artist-1', firstName: 'Test', surname: 'Artist', displayName: null }],
      });

      render(
        <MediaPlayer>
          <MediaPlayer.InfoTickerTape featuredArtist={featuredArtist} />
        </MediaPlayer>
      );

      expect(screen.getByTestId('drawer')).toBeInTheDocument();
    });

    it('should not show TrackListDrawer when release has only 1 track', () => {
      const mockTrack = createMockTrack();
      const releaseTracks = [createMockReleaseTrack(mockTrack)];
      const mockRelease = createMockRelease(releaseTracks);

      const featuredArtist = createMockFeaturedArtist({
        track: mockTrack,
        release: mockRelease,
      });

      render(
        <MediaPlayer>
          <MediaPlayer.InfoTickerTape featuredArtist={featuredArtist} />
        </MediaPlayer>
      );

      expect(screen.queryByTestId('drawer')).not.toBeInTheDocument();
    });
  });

  describe('TrackListDrawer component', () => {
    const track1 = createMockTrack({
      id: 'track-1',
      title: 'First Song',
      position: 1,
      duration: 180,
    });
    const track2 = createMockTrack({
      id: 'track-2',
      title: 'Second Song',
      position: 2,
      duration: 200,
    });
    const track3 = createMockTrack({
      id: 'track-3',
      title: 'Third Song',
      position: 3,
      duration: 220,
    });
    const releaseTracks = [
      createMockReleaseTrack(track1),
      createMockReleaseTrack(track2),
      createMockReleaseTrack(track3),
    ];
    const mockRelease = createMockRelease(releaseTracks, { title: 'Test Album' });
    const mockArtist = createMockArtist({ displayName: 'Test Artist' });

    it('should render track count in trigger button', () => {
      render(
        <MediaPlayer>
          <MediaPlayer.TrackListDrawer
            artistRelease={{ release: mockRelease, artist: mockArtist }}
          />
        </MediaPlayer>
      );

      expect(screen.getByText('View all 3 tracks')).toBeInTheDocument();
    });

    it('should render all tracks sorted by position', () => {
      render(
        <MediaPlayer>
          <MediaPlayer.TrackListDrawer
            artistRelease={{ release: mockRelease, artist: mockArtist }}
          />
        </MediaPlayer>
      );

      expect(screen.getByText('First Song')).toBeInTheDocument();
      expect(screen.getByText('Second Song')).toBeInTheDocument();
      expect(screen.getByText('Third Song')).toBeInTheDocument();
    });

    it('should display track numbers correctly', () => {
      render(
        <MediaPlayer>
          <MediaPlayer.TrackListDrawer
            artistRelease={{ release: mockRelease, artist: mockArtist }}
          />
        </MediaPlayer>
      );

      expect(screen.getByText('1.')).toBeInTheDocument();
      expect(screen.getByText('2.')).toBeInTheDocument();
      expect(screen.getByText('3.')).toBeInTheDocument();
    });

    it('should format track duration correctly', () => {
      render(
        <MediaPlayer>
          <MediaPlayer.TrackListDrawer
            artistRelease={{ release: mockRelease, artist: mockArtist }}
          />
        </MediaPlayer>
      );

      // 180 seconds = 3:00, 200 seconds = 3:20, 220 seconds = 3:40
      expect(screen.getByText('3:00')).toBeInTheDocument();
      expect(screen.getByText('3:20')).toBeInTheDocument();
      expect(screen.getByText('3:40')).toBeInTheDocument();
    });

    it('should calculate and display total time', () => {
      render(
        <MediaPlayer>
          <MediaPlayer.TrackListDrawer
            artistRelease={{ release: mockRelease, artist: mockArtist }}
          />
        </MediaPlayer>
      );

      // Total: 180 + 200 + 220 = 600 seconds = 10:00
      expect(screen.getByText('10:00')).toBeInTheDocument();
      expect(screen.getByText('Total time')).toBeInTheDocument();
    });

    it('should call onTrackSelect when a track is clicked', () => {
      const onTrackSelect = vi.fn();

      render(
        <MediaPlayer>
          <MediaPlayer.TrackListDrawer
            artistRelease={{ release: mockRelease, artist: mockArtist }}
            onTrackSelect={onTrackSelect}
          />
        </MediaPlayer>
      );

      fireEvent.click(screen.getByText('Second Song'));

      expect(onTrackSelect).toHaveBeenCalledWith('track-2');
    });

    it('should wrap track items in DrawerClose when onTrackSelect is provided', () => {
      const onTrackSelect = vi.fn();

      render(
        <MediaPlayer>
          <MediaPlayer.TrackListDrawer
            artistRelease={{ release: mockRelease, artist: mockArtist }}
            onTrackSelect={onTrackSelect}
          />
        </MediaPlayer>
      );

      // Should have DrawerClose elements wrapping each track
      const drawerCloseElements = screen.getAllByTestId('drawer-close');
      // 3 tracks + 1 close button = 4 DrawerClose elements
      expect(drawerCloseElements.length).toBeGreaterThanOrEqual(3);
    });

    it('should display album title in drawer description', () => {
      render(
        <MediaPlayer>
          <MediaPlayer.TrackListDrawer
            artistRelease={{ release: mockRelease, artist: mockArtist }}
          />
        </MediaPlayer>
      );

      expect(screen.getByTestId('drawer-description')).toHaveTextContent('Test Album');
    });

    it('should highlight current track', () => {
      const { container } = render(
        <MediaPlayer>
          <MediaPlayer.TrackListDrawer
            artistRelease={{ release: mockRelease, artist: mockArtist }}
            currentTrackId="track-2"
          />
        </MediaPlayer>
      );

      // The current track should have the highlight class
      const highlightedItem = container.querySelector('.bg-zinc-800');
      expect(highlightedItem).toBeInTheDocument();
    });
  });

  describe('Description component', () => {
    it('should render description text', () => {
      render(
        <MediaPlayer>
          <MediaPlayer.Description description="This is a test description" />
        </MediaPlayer>
      );

      expect(screen.getByText('This is a test description')).toBeInTheDocument();
    });
  });

  describe('FeaturedArtistCarousel component', () => {
    const mockFeaturedArtists: FeaturedArtist[] = [
      createMockFeaturedArtist({
        id: 'featured-1',
        displayName: 'Artist One',
        position: 1,
        coverArt: 'https://example.com/cover1.jpg',
      }),
      createMockFeaturedArtist({
        id: 'featured-2',
        displayName: 'Artist Two',
        position: 2,
        coverArt: 'https://example.com/cover2.jpg',
      }),
    ];

    it('should render carousel with featured artists', () => {
      render(
        <MediaPlayer>
          <MediaPlayer.FeaturedArtistCarousel featuredArtists={mockFeaturedArtists} />
        </MediaPlayer>
      );

      expect(screen.getByTestId('carousel')).toBeInTheDocument();
    });

    it('should render navigation buttons', () => {
      render(
        <MediaPlayer>
          <MediaPlayer.FeaturedArtistCarousel featuredArtists={mockFeaturedArtists} />
        </MediaPlayer>
      );

      expect(screen.getByTestId('carousel-previous')).toBeInTheDocument();
      expect(screen.getByTestId('carousel-next')).toBeInTheDocument();
    });

    it('should call onSelect when a featured artist is clicked', () => {
      const onSelect = vi.fn();

      render(
        <MediaPlayer>
          <MediaPlayer.FeaturedArtistCarousel
            featuredArtists={mockFeaturedArtists}
            onSelect={onSelect}
          />
        </MediaPlayer>
      );

      // Click on the first carousel item button
      const carouselItems = screen.getAllByTestId('carousel-item');
      const firstItemButton = within(carouselItems[0]).getByRole('button');
      fireEvent.click(firstItemButton);

      expect(onSelect).toHaveBeenCalledWith(mockFeaturedArtists[0]);
    });

    it('should sort artists by position', () => {
      const unsortedArtists: FeaturedArtist[] = [
        createMockFeaturedArtist({
          id: 'featured-2',
          displayName: 'Artist Two',
          position: 2,
        }),
        createMockFeaturedArtist({
          id: 'featured-1',
          displayName: 'Artist One',
          position: 1,
        }),
      ];

      const onSelect = vi.fn();

      render(
        <MediaPlayer>
          <MediaPlayer.FeaturedArtistCarousel
            featuredArtists={unsortedArtists}
            onSelect={onSelect}
          />
        </MediaPlayer>
      );

      // Click first item - should be position 1 (Artist One) after sorting
      const carouselItems = screen.getAllByTestId('carousel-item');
      const firstItemButton = within(carouselItems[0]).getByRole('button');
      fireEvent.click(firstItemButton);

      // The artist with position 1 should be first
      expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ position: 1 }));
    });
  });
});
