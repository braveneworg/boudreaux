/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import React from 'react';

import { render, screen, fireEvent, within } from '@testing-library/react';
import videojs from 'video.js';

import type { FeaturedArtist, Release, Artist } from '@/lib/types/media-models';

import { MediaPlayer } from './media-player';

// Mock video.js - factory function must not use variables defined outside
vi.mock('video.js', () => {
  const mockPlayer = {
    addClass: vi.fn(),
    removeClass: vi.fn(),
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
    error: vi.fn().mockReturnValue(null),
    el: vi.fn().mockReturnValue(document.createElement('div')),
  };

  const componentRegistry: Record<string, unknown> = {
    Button: function Button() {
      return null;
    },
  };

  const mockVideojs = Object.assign(
    vi.fn(() => mockPlayer),
    {
      registerComponent: vi.fn((name: string, component: unknown) => {
        componentRegistry[name] = component;
      }),
      getComponent: vi.fn((name: string) => componentRegistry[name] ?? null),
    }
  );

  return { default: mockVideojs };
});

// Mock LazyControls to avoid async/dynamic behavior in tests.
// Instead of loading the lazily wrapped controls module, this mock imports
// ./media-player-controls directly and returns the real Controls component
// so the test can render it synchronously with the mocked video.js instance.
vi.mock('./lazy-controls', async () => {
  const controls = await import('./media-player-controls');
  return { LazyControls: controls.Controls };
});

// Mock the audio controls
vi.mock('../audio-controls', () => ({
  AudioRewindButton: vi.fn(),
  AudioFastForwardButton: vi.fn(),
  SkipPreviousButton: vi.fn(),
  SkipNextButton: vi.fn(),
  getAudioRewindButton: vi.fn(
    () =>
      function MockAudioRewindButton() {
        return null;
      }
  ),
  getAudioFastForwardButton: vi.fn(
    () =>
      function MockAudioFastForwardButton() {
        return null;
      }
  ),
  getSkipPreviousButton: vi.fn(
    () =>
      function MockSkipPreviousButton() {
        return null;
      }
  ),
  getSkipNextButton: vi.fn(
    () =>
      function MockSkipNextButton() {
        return null;
      }
  ),
  resetClasses: vi.fn(),
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
const mockScrollTo = vi.fn();
const mockCarouselApi = {
  scrollTo: mockScrollTo,
};

vi.mock('@/components/ui/carousel', () => ({
  Carousel: ({
    children,
    setApi,
    opts,
  }: {
    children: React.ReactNode;
    setApi?: (api: typeof mockCarouselApi) => void;
    opts?: { loop?: boolean; align?: string };
  }) => {
    // Use useEffect to avoid setState-during-render warning
    React.useEffect(() => {
      setApi?.(mockCarouselApi);
    }, [setApi]);
    return (
      <div data-testid="carousel" data-align={opts?.align} data-loop={opts?.loop?.toString()}>
        {children}
      </div>
    );
  },
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
  Pause: ({ className }: { className?: string }) => (
    <span data-testid="pause-icon" className={className} />
  ),
  Play: ({ className }: { className?: string }) => (
    <span data-testid="play-icon" className={className} />
  ),
  Search: () => <span data-testid="search-icon" />,
  Star: ({ className, 'aria-label': ariaLabel }: { className?: string; 'aria-label'?: string }) => (
    <span data-testid="star-icon" className={className} aria-label={ariaLabel} />
  ),
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

// Mock DownloadDialog is no longer needed - download dialog lives at consumer level

// Test data factory helpers using type assertions to unknown first
const createMockFormatFile = (
  overrides: Partial<{
    id: string;
    trackNumber: number;
    title: string | null;
    fileName: string;
    duration: number | null;
    s3Key: string;
  }> = {}
) => ({
  id: overrides.id ?? 'file-1',
  formatId: 'format-1',
  trackNumber: overrides.trackNumber ?? 1,
  title: overrides.title !== undefined ? overrides.title : 'Test Track',
  fileName: overrides.fileName ?? 'test-track.mp3',
  duration: overrides.duration !== undefined ? overrides.duration : 180,
  s3Key: overrides.s3Key ?? 'releases/test/test-track.mp3',
  fileSize: BigInt(1024),
  mimeType: 'audio/mpeg',
  checksum: null,
  uploadedAt: new Date('2024-01-01'),
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
});

const createMockRelease = (
  files: ReturnType<typeof createMockFormatFile>[],
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
    digitalFormats: [{ id: 'format-1', formatType: 'MP3_320KBPS', files }],
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
    releases: [],
    urls: [],
  }) as unknown as Artist;

const createMockFeaturedArtist = (
  overrides: Partial<{
    id: string;
    displayName: string | null;
    position: number;
    coverArt: string | null;
    digitalFormat: {
      id: string;
      files: Array<{
        id: string;
        trackNumber: number;
        title: string;
        fileName: string;
        s3Key: string;
      }>;
    } | null;
    release: Release | null;
    artists: Array<{
      id: string;
      firstName: string;
      surname: string;
      displayName: string | null;
    }>;
  }> = {}
): FeaturedArtist =>
  ({
    id: overrides.id ?? 'featured-1',
    displayName: 'displayName' in overrides ? overrides.displayName : 'Test Artist',
    featuredOn: new Date('2024-01-15'),
    position: overrides.position ?? 1,
    description: null,
    coverArt: overrides.coverArt ?? null,
    digitalFormatId: 'format-1',
    releaseId: 'release-1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    artists:
      overrides.artists?.map((a) => ({
        ...a,
        images: [],
        labels: [],
        releases: [],
        urls: [],
      })) ?? [],
    digitalFormat: overrides.digitalFormat ?? null,
    release: overrides.release ?? null,
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

    it('should suppress transient corruption/decode errors', () => {
      render(
        <MediaPlayer>
          <MediaPlayer.Controls audioSrc="https://example.com/audio.mp3" />
        </MediaPlayer>
      );

      const player = vi.mocked(videojs).mock.results.at(-1)?.value as {
        on: ReturnType<typeof vi.fn>;
        error: ReturnType<typeof vi.fn>;
        removeClass: ReturnType<typeof vi.fn>;
        el: ReturnType<typeof vi.fn>;
        load: ReturnType<typeof vi.fn>;
      };

      const playerEl = document.createElement('div');
      const errorDisplay = document.createElement('div');
      errorDisplay.className = 'vjs-error-display';
      playerEl.appendChild(errorDisplay);
      player.el.mockReturnValue(playerEl);
      player.error.mockReturnValue({
        code: 3,
        message:
          'The media playback was aborted due to a corruption problem or because the media used features your browser did not support.',
      });

      const errorHandler = player.on.mock.calls.find(
        ([eventName]) => eventName === 'error'
      )?.[1] as (() => void) | undefined;
      expect(errorHandler).toBeDefined();
      player.load.mockClear();

      errorHandler?.();

      expect(player.error).toHaveBeenCalledWith(null);
      expect(player.removeClass).toHaveBeenCalledWith('vjs-error');
      expect(errorDisplay).toHaveClass('vjs-hidden');
      expect(errorDisplay).toHaveAttribute('aria-hidden', 'true');
      expect(player.load).toHaveBeenCalled();
    });

    it('should not suppress non-transient media errors', () => {
      render(
        <MediaPlayer>
          <MediaPlayer.Controls audioSrc="https://example.com/audio.mp3" />
        </MediaPlayer>
      );

      const player = vi.mocked(videojs).mock.results.at(-1)?.value as {
        on: ReturnType<typeof vi.fn>;
        error: ReturnType<typeof vi.fn>;
        load: ReturnType<typeof vi.fn>;
      };

      player.error.mockReset();
      player.load.mockClear();
      player.error.mockReturnValue({
        code: 4,
        message: 'A fatal unsupported media type error occurred.',
      });

      const errorHandler = player.on.mock.calls.find(
        ([eventName]) => eventName === 'error'
      )?.[1] as (() => void) | undefined;
      expect(errorHandler).toBeDefined();

      errorHandler?.();

      expect(player.error).not.toHaveBeenCalledWith(null);
      expect(player.load).not.toHaveBeenCalled();
    });
  });

  describe('InfoTickerTape component', () => {
    it('should render track title and display name with featuredArtist', () => {
      const mockRelease = createMockRelease([], { title: 'My Album' });

      const featuredArtist = createMockFeaturedArtist({
        displayName: 'Test Artist',
        release: mockRelease,
      });

      render(
        <MediaPlayer>
          <MediaPlayer.InfoTickerTape featuredArtist={featuredArtist} trackTitle="My Song" />
        </MediaPlayer>
      );

      expect(screen.getByText(/My Song/)).toBeInTheDocument();
      expect(screen.getByText(/Test Artist/)).toBeInTheDocument();
      expect(screen.getByText(/My Album/)).toBeInTheDocument();
    });

    it('should use text-xs font class for ticker text', () => {
      const mockRelease = createMockRelease([createMockFormatFile()]);

      const featuredArtist = createMockFeaturedArtist({
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
      const mockRelease = createMockRelease([createMockFormatFile()]);

      const featuredArtist = createMockFeaturedArtist({
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
      const mockRelease = createMockRelease([createMockFormatFile()]);

      const featuredArtist = createMockFeaturedArtist({
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
      const mockRelease = createMockRelease([createMockFormatFile()]);

      const featuredArtist = createMockFeaturedArtist({
        displayName: null,
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
      const mockRelease = createMockRelease([createMockFormatFile()]);

      const featuredArtist = createMockFeaturedArtist({
        displayName: null,
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

    it('should not display artist name when no displayName and no artists', () => {
      const mockRelease = createMockRelease([createMockFormatFile()]);

      const featuredArtist = createMockFeaturedArtist({
        displayName: null,
        release: mockRelease,
        artists: [],
      });

      render(
        <MediaPlayer>
          <MediaPlayer.InfoTickerTape featuredArtist={featuredArtist} />
        </MediaPlayer>
      );

      expect(screen.queryByText(/Unknown Artist/)).not.toBeInTheDocument();
    });

    it('should render overflow wrapper with horizontal margin', () => {
      const release = createMockRelease([createMockFormatFile()]);

      const featuredArtist = createMockFeaturedArtist({
        release,
      });

      const { container } = render(
        <MediaPlayer>
          <MediaPlayer.InfoTickerTape featuredArtist={featuredArtist} />
        </MediaPlayer>
      );

      const overflowDiv = container.querySelector('.overflow-hidden.mx-3');
      expect(overflowDiv).toBeInTheDocument();
    });

    it('should not render TrackListDrawer inside InfoTickerTape', () => {
      const release = createMockRelease([
        createMockFormatFile({ id: 'file-1', trackNumber: 1, title: 'Track 1' }),
        createMockFormatFile({ id: 'file-2', trackNumber: 2, title: 'Track 2' }),
      ]);

      const featuredArtist = createMockFeaturedArtist({
        release,
        artists: [{ id: 'artist-1', firstName: 'Test', surname: 'Artist', displayName: null }],
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
    const file1 = createMockFormatFile({
      id: 'file-1',
      trackNumber: 1,
      title: 'First Song',
      duration: 180,
    });
    const file2 = createMockFormatFile({
      id: 'file-2',
      trackNumber: 2,
      title: 'Second Song',
      duration: 200,
    });
    const file3 = createMockFormatFile({
      id: 'file-3',
      trackNumber: 3,
      title: 'Third Song',
      duration: 220,
    });
    const mockRelease = createMockRelease([file1, file2, file3], { title: 'Test Album' });
    const mockArtist = createMockArtist({ displayName: 'Test Artist' });

    it('should render track count in trigger button', () => {
      render(
        <MediaPlayer>
          <MediaPlayer.TrackListDrawer
            artistName="Test Artist"
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
            artistName="Test Artist"
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
            artistName="Test Artist"
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
            artistName="Test Artist"
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
            artistName="Test Artist"
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
            artistName="Test Artist"
            artistRelease={{ release: mockRelease, artist: mockArtist }}
            onTrackSelect={onTrackSelect}
          />
        </MediaPlayer>
      );

      fireEvent.click(screen.getByText('Second Song'));

      expect(onTrackSelect).toHaveBeenCalledWith('file-2');
    });

    it('should wrap track items in DrawerClose when onTrackSelect is provided', () => {
      const onTrackSelect = vi.fn();

      render(
        <MediaPlayer>
          <MediaPlayer.TrackListDrawer
            artistName="Test Artist"
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
            artistName="Test Artist"
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
            artistName="Test Artist"
            artistRelease={{ release: mockRelease, artist: mockArtist }}
            currentTrackId="file-2"
          />
        </MediaPlayer>
      );

      // The current track should have the highlight class
      const highlightedItem = container.querySelector('.bg-zinc-800');
      expect(highlightedItem).toBeInTheDocument();
    });

    it('should display release cover art for each track', () => {
      const fileWithReleaseCoverArt = createMockFormatFile({
        id: 'file-cover',
        trackNumber: 1,
        title: 'Track With Cover',
        duration: 180,
      });
      const releaseWithCoverArt = createMockRelease([fileWithReleaseCoverArt], {
        title: 'Album With Covers',
        coverArt: 'https://example.com/album-cover.jpg',
      });

      render(
        <MediaPlayer>
          <MediaPlayer.TrackListDrawer
            artistName="Test Artist"
            artistRelease={{ release: releaseWithCoverArt, artist: mockArtist }}
          />
        </MediaPlayer>
      );

      // Should render the release's cover art image for the track
      const coverArtImages = screen.getAllByTestId('next-image');
      expect(coverArtImages.length).toBeGreaterThan(0);
      expect(coverArtImages[0]).toHaveAttribute('src', 'https://example.com/album-cover.jpg');
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

  describe('InteractiveCoverArt component', () => {
    const defaultProps = {
      src: 'https://example.com/cover.jpg',
      alt: 'Test Album cover art',
      isPlaying: false,
      onTogglePlay: vi.fn(),
    };

    beforeEach(() => {
      defaultProps.onTogglePlay = vi.fn();
    });

    it('should render the cover art image', () => {
      render(
        <MediaPlayer>
          <MediaPlayer.InteractiveCoverArt {...defaultProps} />
        </MediaPlayer>
      );

      const img = screen.getByTestId('next-image');
      expect(img).toHaveAttribute('src', 'https://example.com/cover.jpg');
      expect(img).toHaveAttribute('alt', 'Test Album cover art');
    });

    it('should call onTogglePlay when the cover art button is clicked', () => {
      render(
        <MediaPlayer>
          <MediaPlayer.InteractiveCoverArt {...defaultProps} />
        </MediaPlayer>
      );

      const playButton = screen.getByRole('button', { name: 'Play' });
      fireEvent.click(playButton);

      expect(defaultProps.onTogglePlay).toHaveBeenCalledTimes(1);
    });

    it('should show Play aria-label when not playing', () => {
      render(
        <MediaPlayer>
          <MediaPlayer.InteractiveCoverArt {...defaultProps} isPlaying={false} />
        </MediaPlayer>
      );

      expect(screen.getByRole('button', { name: 'Play' })).toBeInTheDocument();
    });

    it('should show Pause aria-label when playing', () => {
      render(
        <MediaPlayer>
          <MediaPlayer.InteractiveCoverArt {...defaultProps} isPlaying />
        </MediaPlayer>
      );

      expect(screen.getByRole('button', { name: 'Pause' })).toBeInTheDocument();
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

    it('should use center alignment for carousel', () => {
      render(
        <MediaPlayer>
          <MediaPlayer.FeaturedArtistCarousel featuredArtists={mockFeaturedArtists} />
        </MediaPlayer>
      );

      expect(screen.getByTestId('carousel')).toHaveAttribute('data-align', 'center');
    });

    it('should scroll to the selected artist index on click', () => {
      const onSelect = vi.fn();
      mockScrollTo.mockClear();

      render(
        <MediaPlayer>
          <MediaPlayer.FeaturedArtistCarousel
            featuredArtists={mockFeaturedArtists}
            onSelect={onSelect}
          />
        </MediaPlayer>
      );

      // Click on the second carousel item
      const carouselItems = screen.getAllByTestId('carousel-item');
      const secondItemButton = within(carouselItems[1]).getByRole('button');
      fireEvent.click(secondItemButton);

      expect(mockScrollTo).toHaveBeenCalledWith(1);
      expect(onSelect).toHaveBeenCalledWith(mockFeaturedArtists[1]);
    });

    it('should scroll to index 0 when first artist is clicked', () => {
      const onSelect = vi.fn();
      mockScrollTo.mockClear();

      render(
        <MediaPlayer>
          <MediaPlayer.FeaturedArtistCarousel
            featuredArtists={mockFeaturedArtists}
            onSelect={onSelect}
          />
        </MediaPlayer>
      );

      const carouselItems = screen.getAllByTestId('carousel-item');
      const firstItemButton = within(carouselItems[0]).getByRole('button');
      fireEvent.click(firstItemButton);

      expect(mockScrollTo).toHaveBeenCalledWith(0);
    });

    it('should work without onSelect callback', () => {
      mockScrollTo.mockClear();

      render(
        <MediaPlayer>
          <MediaPlayer.FeaturedArtistCarousel featuredArtists={mockFeaturedArtists} />
        </MediaPlayer>
      );

      const carouselItems = screen.getAllByTestId('carousel-item');
      const firstItemButton = within(carouselItems[0]).getByRole('button');
      fireEvent.click(firstItemButton);

      // Should still scroll even without onSelect
      expect(mockScrollTo).toHaveBeenCalledWith(0);
    });
  });

  describe('FormatFileListDrawer featured track indicator', () => {
    const trackFiles = [
      createMockFormatFile({ id: 'f-1', trackNumber: 1, title: 'Track One' }),
      createMockFormatFile({ id: 'f-2', trackNumber: 2, title: 'Track Two' }),
      createMockFormatFile({ id: 'f-3', trackNumber: 3, title: 'Track Three' }),
    ];

    it('should render a star icon for the featured track', () => {
      render(
        <MediaPlayer>
          <MediaPlayer.FormatFileListDrawer
            files={trackFiles}
            currentFileId={null}
            artistName="Test Artist"
            releaseTitle="Test Album"
            featuredTrackNumber={2}
          />
        </MediaPlayer>
      );

      const starIcons = screen.getAllByTestId('star-icon');
      expect(starIcons).toHaveLength(1);
      expect(starIcons[0]).toHaveAttribute('aria-label', 'Featured track');
    });

    it('should not render a star icon when no featured track is set', () => {
      render(
        <MediaPlayer>
          <MediaPlayer.FormatFileListDrawer
            files={trackFiles}
            currentFileId={null}
            artistName="Test Artist"
            releaseTitle="Test Album"
          />
        </MediaPlayer>
      );

      expect(screen.queryByTestId('star-icon')).not.toBeInTheDocument();
    });

    it('should not render a star icon when featuredTrackNumber does not match any file', () => {
      render(
        <MediaPlayer>
          <MediaPlayer.FormatFileListDrawer
            files={trackFiles}
            currentFileId={null}
            artistName="Test Artist"
            releaseTitle="Test Album"
            featuredTrackNumber={99}
          />
        </MediaPlayer>
      );

      expect(screen.queryByTestId('star-icon')).not.toBeInTheDocument();
    });
  });
});
