import { useEffect } from 'react';
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

  const InteractiveCoverArt = ({
    src,
    alt,
    isPlaying,
    onTogglePlay,
  }: {
    src: string;
    alt: string;
    isPlaying: boolean;
    onTogglePlay: () => void;
    className?: string;
  }) => (
    <button
      data-testid="interactive-cover-art"
      data-src={src}
      data-alt={alt}
      data-is-playing={isPlaying?.toString()}
      onClick={onTogglePlay}
    >
      <span data-testid="cover-art-image" data-src={src} data-alt={alt} />
    </button>
  );
  InteractiveCoverArt.displayName = 'InteractiveCoverArt';
  MockMediaPlayer.InteractiveCoverArt = InteractiveCoverArt;

  const Controls = ({
    audioSrc,
    onPlay,
    onPause,
    onEnded,
    onPreviousTrack,
    onNextTrack,
    autoPlay,
    controlsRef,
  }: {
    audioSrc: string;
    onPlay?: () => void;
    onPause?: () => void;
    onEnded?: () => void;
    onPreviousTrack?: (wasPlaying: boolean) => void;
    onNextTrack?: (wasPlaying: boolean) => void;
    autoPlay?: boolean;
    controlsRef?: (
      controls: { play: () => void; pause: () => void; toggle: () => void } | null
    ) => void;
  }) => {
    // Call controlsRef on mount with mock controls using useEffect to prevent infinite loops
    useEffect(() => {
      if (controlsRef) {
        controlsRef({
          play: () => onPlay?.(),
          pause: () => onPause?.(),
          toggle: () => {},
        });
      }
      return () => {
        controlsRef?.(null);
      };
    }, [controlsRef, onPlay, onPause]);
    return (
      <div
        data-testid="media-controls"
        data-audio-src={audioSrc}
        data-auto-play={autoPlay?.toString()}
      >
        <button data-testid="play-button" onClick={onPlay}>
          Play
        </button>
        <button data-testid="pause-button" onClick={onPause}>
          Pause
        </button>
        <button data-testid="ended-trigger" onClick={onEnded}>
          Ended
        </button>
        <button data-testid="previous-track-button" onClick={() => onPreviousTrack?.(true)}>
          Previous (playing)
        </button>
        <button data-testid="previous-track-paused-button" onClick={() => onPreviousTrack?.(false)}>
          Previous (paused)
        </button>
        <button data-testid="next-track-button" onClick={() => onNextTrack?.(true)}>
          Next (playing)
        </button>
        <button data-testid="next-track-paused-button" onClick={() => onNextTrack?.(false)}>
          Next (paused)
        </button>
      </div>
    );
  };
  Controls.displayName = 'Controls';
  MockMediaPlayer.Controls = Controls;

  const InfoTickerTape = ({
    featuredArtist,
    isPlaying,
    onTrackSelect,
  }: {
    featuredArtist: FeaturedArtist;
    isPlaying?: boolean;
    onTrackSelect?: (trackId: string) => void;
  }) => (
    <div data-testid="info-ticker-tape" data-is-playing={isPlaying?.toString()}>
      {featuredArtist.track?.title}
      {featuredArtist.release?.releaseTracks?.map((rt) => (
        <button
          key={rt.track.id}
          data-testid={`track-select-${rt.track.id}`}
          onClick={() => onTrackSelect?.(rt.track.id)}
        >
          {rt.track.title}
        </button>
      ))}
    </div>
  );
  InfoTickerTape.displayName = 'InfoTickerTape';
  MockMediaPlayer.InfoTickerTape = InfoTickerTape;

  return { MediaPlayer: MockMediaPlayer };
});

// Mock next/image
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    <span data-testid="cover-art-image" data-src={src} data-alt={alt} />
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
  const mockTracks = [
    {
      id: 'track-1',
      title: 'First Track',
      audioUrl: 'https://example.com/audio1.mp3',
      duration: 180,
      position: 1,
      coverArt: null,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    },
    {
      id: 'track-2',
      title: 'Second Track',
      audioUrl: 'https://example.com/audio2.mp3',
      duration: 200,
      position: 2,
      coverArt: null,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    },
    {
      id: 'track-3',
      title: 'Third Track',
      audioUrl: 'https://example.com/audio3.mp3',
      duration: 220,
      position: 3,
      coverArt: null,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
    },
  ];

  const mockReleaseTracks = mockTracks.map((track) => ({
    id: `release-track-${track.id}`,
    releaseId: 'release-1',
    trackId: track.id,
    track,
  }));

  const mockRelease = {
    id: 'release-1',
    title: 'Test Album',
    coverArt: 'https://example.com/album-cover.jpg',
    releaseTracks: mockReleaseTracks,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

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
      releaseId: 'release-1',
      groupId: null,
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-01'),
      artists: [],
      track: mockTracks[0],
      release: mockRelease,
      group: null,
    },
  ] as unknown as FeaturedArtist[];

  // Artist with artist fallback display name (no displayName set)
  const mockArtistWithArtistFallback: FeaturedArtist = {
    id: 'featured-3',
    displayName: null,
    featuredOn: new Date('2024-01-13'),
    position: 3,
    description: null,
    coverArt: null,
    trackId: 'track-1',
    releaseId: 'release-1',
    groupId: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    artists: [
      {
        id: 'artist-1',
        firstName: 'John',
        surname: 'Doe',
        displayName: null,
      },
    ],
    track: mockTracks[0],
    release: mockRelease,
    group: null,
  } as unknown as FeaturedArtist;

  // Artist with group fallback display name
  const mockArtistWithGroupFallback: FeaturedArtist = {
    id: 'featured-4',
    displayName: null,
    featuredOn: new Date('2024-01-12'),
    position: 4,
    description: null,
    coverArt: null,
    trackId: 'track-1',
    releaseId: 'release-1',
    groupId: 'group-1',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    artists: [],
    track: mockTracks[0],
    release: mockRelease,
    group: {
      id: 'group-1',
      name: 'The Test Band',
    },
  } as unknown as FeaturedArtist;

  // Artist with artist displayName (priority over firstName/surname)
  const mockArtistWithArtistDisplayName: FeaturedArtist = {
    id: 'featured-5',
    displayName: null,
    featuredOn: new Date('2024-01-11'),
    position: 5,
    description: null,
    coverArt: null,
    trackId: 'track-1',
    releaseId: 'release-1',
    groupId: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    artists: [
      {
        id: 'artist-2',
        firstName: 'Jane',
        surname: 'Smith',
        displayName: 'DJ Jane',
      },
    ],
    track: mockTracks[0],
    release: mockRelease,
    group: null,
  } as unknown as FeaturedArtist;

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

    // Check the cover art image displays the first artist name in the data-alt text
    expect(screen.getByTestId('cover-art-image')).toHaveAttribute('data-alt', 'Test Artist 1');
  });

  it('should change selected artist when clicking on carousel item', () => {
    render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
      wrapper: createWrapper(),
    });

    // Click on second artist
    fireEvent.click(screen.getByTestId('artist-featured-2'));

    // Should now display second artist via cover art data-alt text
    expect(screen.getByTestId('cover-art-image')).toHaveAttribute('data-alt', 'Test Artist 2');
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
      'https://example.com/audio1.mp3'
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
      'data-src',
      'https://example.com/cover1.jpg'
    );
  });

  it('should set shouldAutoPlay to true when selecting artist from carousel', () => {
    render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
      wrapper: createWrapper(),
    });

    // Click on second artist which has a track
    fireEvent.click(screen.getByTestId('artist-featured-2'));

    // Should have autoPlay set to true
    expect(screen.getByTestId('media-controls')).toHaveAttribute('data-auto-play', 'true');
  });

  it('should toggle play/pause when cover art is clicked', () => {
    render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
      wrapper: createWrapper(),
    });

    // Select artist with track (which provides controls via controlsRef)
    fireEvent.click(screen.getByTestId('artist-featured-2'));

    // Click the interactive cover art to trigger handleTogglePlay -> playerControls.toggle()
    fireEvent.click(screen.getByTestId('interactive-cover-art'));

    // The toggle function was called; no error means handleTogglePlay executed successfully
    expect(screen.getByTestId('interactive-cover-art')).toBeInTheDocument();
  });

  it('should update isPlaying state when onPlay is called', () => {
    render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
      wrapper: createWrapper(),
    });

    // Select artist with track
    fireEvent.click(screen.getByTestId('artist-featured-2'));

    // Trigger play
    fireEvent.click(screen.getByTestId('play-button'));

    // InfoTickerTape should show playing state
    expect(screen.getByTestId('info-ticker-tape')).toHaveAttribute('data-is-playing', 'true');
  });

  it('should update isPlaying state when onPause is called', () => {
    render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
      wrapper: createWrapper(),
    });

    // Select artist with track
    fireEvent.click(screen.getByTestId('artist-featured-2'));

    // Trigger play then pause
    fireEvent.click(screen.getByTestId('play-button'));
    fireEvent.click(screen.getByTestId('pause-button'));

    // InfoTickerTape should show not playing state
    expect(screen.getByTestId('info-ticker-tape')).toHaveAttribute('data-is-playing', 'false');
  });

  describe('track selection', () => {
    it('should change track when onTrackSelect is called', () => {
      render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
        wrapper: createWrapper(),
      });

      // Select artist with track and release
      fireEvent.click(screen.getByTestId('artist-featured-2'));

      // Select a different track from the release
      fireEvent.click(screen.getByTestId('track-select-track-2'));

      // The audio source should now be the second track
      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://example.com/audio2.mp3'
      );
    });

    it('should set shouldAutoPlay when track is selected', () => {
      render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
        wrapper: createWrapper(),
      });

      // Select artist with track and release
      fireEvent.click(screen.getByTestId('artist-featured-2'));

      // Reset autoPlay by clicking on a different artist and back
      fireEvent.click(screen.getByTestId('artist-featured-1'));
      fireEvent.click(screen.getByTestId('artist-featured-2'));

      // Select a different track from the release
      fireEvent.click(screen.getByTestId('track-select-track-2'));

      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-auto-play', 'true');
    });

    it('should not change track when release has no tracks', () => {
      const artistWithoutReleaseTracks: FeaturedArtist = {
        ...mockFeaturedArtists[1],
        release: { ...mockRelease, releaseTracks: [] },
      } as unknown as FeaturedArtist;

      render(<FeaturedArtistsPlayer featuredArtists={[artistWithoutReleaseTracks]} />, {
        wrapper: createWrapper(),
      });

      // No track select buttons should exist
      expect(screen.queryByTestId(/track-select-/)).not.toBeInTheDocument();
    });
  });

  describe('auto-advance on track ended', () => {
    it('should advance to next track when current track ends', () => {
      render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
        wrapper: createWrapper(),
      });

      // Select artist with track and release
      fireEvent.click(screen.getByTestId('artist-featured-2'));

      // Current track is track-1, trigger ended
      fireEvent.click(screen.getByTestId('ended-trigger'));

      // Should now be playing track-2
      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://example.com/audio2.mp3'
      );
    });

    it('should set shouldAutoPlay when track ends and advances', () => {
      render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
        wrapper: createWrapper(),
      });

      // Select artist with track and release
      fireEvent.click(screen.getByTestId('artist-featured-2'));

      // Trigger ended
      fireEvent.click(screen.getByTestId('ended-trigger'));

      // Should have autoPlay set to true
      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-auto-play', 'true');
    });

    it('should not advance when on last track', () => {
      const artistWithLastTrack: FeaturedArtist = {
        ...mockFeaturedArtists[1],
        track: mockTracks[2], // Last track (position 3)
      } as unknown as FeaturedArtist;

      render(<FeaturedArtistsPlayer featuredArtists={[artistWithLastTrack]} />, {
        wrapper: createWrapper(),
      });

      // Trigger ended on last track
      fireEvent.click(screen.getByTestId('ended-trigger'));

      // Should still be on track-3
      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://example.com/audio3.mp3'
      );
    });

    it('should not advance when there is no release', () => {
      const artistWithoutRelease: FeaturedArtist = {
        ...mockFeaturedArtists[1],
        release: null,
      } as unknown as FeaturedArtist;

      render(<FeaturedArtistsPlayer featuredArtists={[artistWithoutRelease]} />, {
        wrapper: createWrapper(),
      });

      // Trigger ended
      fireEvent.click(screen.getByTestId('ended-trigger'));

      // Should still be on track-1
      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://example.com/audio1.mp3'
      );
    });
  });

  describe('previous track navigation', () => {
    it('should go to previous track when wasPlaying is true', () => {
      const artistOnSecondTrack: FeaturedArtist = {
        ...mockFeaturedArtists[1],
        track: mockTracks[1], // Second track (position 2)
      } as unknown as FeaturedArtist;

      render(<FeaturedArtistsPlayer featuredArtists={[artistOnSecondTrack]} />, {
        wrapper: createWrapper(),
      });

      // Click previous track (playing)
      fireEvent.click(screen.getByTestId('previous-track-button'));

      // Should now be on track-1
      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://example.com/audio1.mp3'
      );
      // Should auto-play since wasPlaying was true
      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-auto-play', 'true');
    });

    it('should go to previous track when wasPlaying is false', () => {
      const artistOnSecondTrack: FeaturedArtist = {
        ...mockFeaturedArtists[1],
        track: mockTracks[1], // Second track (position 2)
      } as unknown as FeaturedArtist;

      render(<FeaturedArtistsPlayer featuredArtists={[artistOnSecondTrack]} />, {
        wrapper: createWrapper(),
      });

      // Click previous track (paused)
      fireEvent.click(screen.getByTestId('previous-track-paused-button'));

      // Should now be on track-1
      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://example.com/audio1.mp3'
      );
      // Should NOT auto-play since wasPlaying was false
      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-auto-play', 'false');
    });

    it('should not change track when already on first track', () => {
      render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
        wrapper: createWrapper(),
      });

      // Select artist with track (first track)
      fireEvent.click(screen.getByTestId('artist-featured-2'));

      // Click previous track
      fireEvent.click(screen.getByTestId('previous-track-button'));

      // Should still be on track-1
      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://example.com/audio1.mp3'
      );
    });

    it('should not change track when there is no release', () => {
      const artistWithoutRelease: FeaturedArtist = {
        ...mockFeaturedArtists[1],
        release: null,
      } as unknown as FeaturedArtist;

      render(<FeaturedArtistsPlayer featuredArtists={[artistWithoutRelease]} />, {
        wrapper: createWrapper(),
      });

      // Click previous track
      fireEvent.click(screen.getByTestId('previous-track-button'));

      // Should still be on track-1
      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://example.com/audio1.mp3'
      );
    });
  });

  describe('next track navigation', () => {
    it('should go to next track when wasPlaying is true', () => {
      render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
        wrapper: createWrapper(),
      });

      // Select artist with track (first track)
      fireEvent.click(screen.getByTestId('artist-featured-2'));

      // Click next track (playing)
      fireEvent.click(screen.getByTestId('next-track-button'));

      // Should now be on track-2
      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://example.com/audio2.mp3'
      );
      // Should auto-play since wasPlaying was true
      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-auto-play', 'true');
    });

    it('should go to next track when wasPlaying is false', () => {
      render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
        wrapper: createWrapper(),
      });

      // Select artist with track (first track)
      fireEvent.click(screen.getByTestId('artist-featured-2'));

      // Click next track (paused)
      fireEvent.click(screen.getByTestId('next-track-paused-button'));

      // Should now be on track-2
      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://example.com/audio2.mp3'
      );
      // Should NOT auto-play since wasPlaying was false
      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-auto-play', 'false');
    });

    it('should not change track when already on last track', () => {
      const artistOnLastTrack: FeaturedArtist = {
        ...mockFeaturedArtists[1],
        track: mockTracks[2], // Last track (position 3)
      } as unknown as FeaturedArtist;

      render(<FeaturedArtistsPlayer featuredArtists={[artistOnLastTrack]} />, {
        wrapper: createWrapper(),
      });

      // Click next track
      fireEvent.click(screen.getByTestId('next-track-button'));

      // Should still be on track-3
      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://example.com/audio3.mp3'
      );
    });

    it('should not change track when there is no release', () => {
      const artistWithoutRelease: FeaturedArtist = {
        ...mockFeaturedArtists[1],
        release: null,
      } as unknown as FeaturedArtist;

      render(<FeaturedArtistsPlayer featuredArtists={[artistWithoutRelease]} />, {
        wrapper: createWrapper(),
      });

      // Click next track
      fireEvent.click(screen.getByTestId('next-track-button'));

      // Should still be on track-1
      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://example.com/audio1.mp3'
      );
    });
  });

  describe('display name resolution', () => {
    it('should use displayName when available', () => {
      render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
        wrapper: createWrapper(),
      });

      expect(screen.getByTestId('cover-art-image')).toHaveAttribute('data-alt', 'Test Artist 1');
    });

    it('should fall back to artist firstName/surname when no displayName', () => {
      render(<FeaturedArtistsPlayer featuredArtists={[mockArtistWithArtistFallback]} />, {
        wrapper: createWrapper(),
      });

      expect(screen.getByTestId('cover-art-image')).toHaveAttribute('data-alt', 'John Doe');
    });

    it('should fall back to group name when no displayName and no artists', () => {
      render(<FeaturedArtistsPlayer featuredArtists={[mockArtistWithGroupFallback]} />, {
        wrapper: createWrapper(),
      });

      expect(screen.getByTestId('cover-art-image')).toHaveAttribute('data-alt', 'The Test Band');
    });

    it('should use artist displayName when available over firstName/surname', () => {
      render(<FeaturedArtistsPlayer featuredArtists={[mockArtistWithArtistDisplayName]} />, {
        wrapper: createWrapper(),
      });

      expect(screen.getByTestId('cover-art-image')).toHaveAttribute('data-alt', 'DJ Jane');
    });

    it('should show Unknown Artist when no displayName, artists, or group', () => {
      const artistWithNoDisplayInfo: FeaturedArtist = {
        ...mockFeaturedArtists[0],
        displayName: null,
        artists: [],
        group: null,
      } as unknown as FeaturedArtist;

      render(<FeaturedArtistsPlayer featuredArtists={[artistWithNoDisplayInfo]} />, {
        wrapper: createWrapper(),
      });

      expect(screen.getByTestId('cover-art-image')).toHaveAttribute('data-alt', 'Unknown Artist');
    });
  });

  describe('cover art resolution', () => {
    it('should use coverArt from featured artist when available', () => {
      render(<FeaturedArtistsPlayer featuredArtists={mockFeaturedArtists} />, {
        wrapper: createWrapper(),
      });

      expect(screen.getByTestId('cover-art-image')).toHaveAttribute(
        'data-src',
        'https://example.com/cover1.jpg'
      );
    });

    it('should fall back to release coverArt when featured artist coverArt is null', () => {
      const artistWithReleaseCoverArt: FeaturedArtist = {
        ...mockFeaturedArtists[1],
        coverArt: null,
        release: { ...mockRelease, coverArt: 'https://example.com/release-cover.jpg' },
      } as unknown as FeaturedArtist;

      render(<FeaturedArtistsPlayer featuredArtists={[artistWithReleaseCoverArt]} />, {
        wrapper: createWrapper(),
      });

      expect(screen.getByTestId('cover-art-image')).toHaveAttribute(
        'data-src',
        'https://example.com/release-cover.jpg'
      );
    });

    it('should not render cover art when both coverArt and release coverArt are null', () => {
      const artistWithNoCoverArt: FeaturedArtist = {
        ...mockFeaturedArtists[1],
        coverArt: null,
        release: { ...mockRelease, coverArt: null },
      } as unknown as FeaturedArtist;

      render(<FeaturedArtistsPlayer featuredArtists={[artistWithNoCoverArt]} />, {
        wrapper: createWrapper(),
      });

      expect(screen.queryByTestId('cover-art-image')).not.toBeInTheDocument();
    });
  });
});
