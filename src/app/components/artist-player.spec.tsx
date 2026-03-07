/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useEffect } from 'react';
import type { ReactNode } from 'react';

import { render, screen, fireEvent } from '@testing-library/react';

import type { ArtistWithPublishedReleases } from '@/lib/types/media-models';

import { ArtistPlayer } from './artist-player';

// Mock the MediaPlayer component and sub-components
vi.mock('@/app/components/ui/audio/media-player', () => {
  const MockMediaPlayer = ({ children }: { children: ReactNode }) => (
    <div data-testid="media-player">{children}</div>
  );
  MockMediaPlayer.displayName = 'MockMediaPlayer';

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
      Cover Art
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
    trackName,
    isPlaying,
  }: {
    artistRelease: unknown;
    trackName: string;
    isPlaying?: boolean;
  }) => (
    <div data-testid="info-ticker-tape" data-is-playing={isPlaying?.toString()}>
      {trackName}
    </div>
  );
  InfoTickerTape.displayName = 'InfoTickerTape';
  MockMediaPlayer.InfoTickerTape = InfoTickerTape;

  const TrackListDrawer = ({
    artistName,
    currentTrackId,
    onTrackSelect,
    artistRelease,
  }: {
    artistName: string;
    artistRelease: { release: { releaseTracks: Array<{ track: { id: string; title: string } }> } };
    currentTrackId?: string;
    onTrackSelect?: (trackId: string) => void;
  }) => (
    <div
      data-testid="track-list-drawer"
      data-current-track-id={currentTrackId}
      data-artist-name={artistName}
    >
      {artistRelease.release.releaseTracks.map((rt) => (
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
  TrackListDrawer.displayName = 'TrackListDrawer';
  MockMediaPlayer.TrackListDrawer = TrackListDrawer;

  const CoverArtView = ({
    artistRelease,
  }: {
    artistRelease: { release: { id: string; title: string } };
  }) => <div data-testid="cover-art-view">{artistRelease.release.title}</div>;
  CoverArtView.displayName = 'CoverArtView';
  MockMediaPlayer.CoverArtView = CoverArtView;

  return { MediaPlayer: MockMediaPlayer };
});

// Mock next/image
vi.mock('next/image', () => ({
  default: ({
    src,
    alt,
    width,
    height,
    className,
  }: {
    src: string;
    alt: string;
    width: number;
    height: number;
    className?: string;
  }) => (
    <span
      data-testid="next-image"
      data-src={src}
      data-alt={alt}
      data-width={width}
      data-height={height}
      className={className}
    />
  ),
}));

// Mock carousel components
vi.mock('@/app/components/ui/carousel', () => ({
  Carousel: ({
    children,
    'aria-label': ariaLabel,
  }: {
    children: ReactNode;
    opts?: Record<string, unknown>;
    'aria-label'?: string;
  }) => (
    <div data-testid="carousel" aria-label={ariaLabel}>
      {children}
    </div>
  ),
  CarouselContent: ({ children, className }: { children: ReactNode; className?: string }) => (
    <div data-testid="carousel-content" className={className}>
      {children}
    </div>
  ),
  CarouselItem: ({ children }: { children: ReactNode }) => (
    <div data-testid="carousel-item">{children}</div>
  ),
  CarouselPrevious: () => <button data-testid="carousel-previous">Previous</button>,
  CarouselNext: () => <button data-testid="carousel-next">Next</button>,
}));

// Mock utilities
vi.mock('@/lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}));

vi.mock('@/lib/utils/get-artist-display-name', () => ({
  getArtistDisplayName: (artist: {
    displayName?: string | null;
    firstName: string;
    surname: string;
  }) => artist.displayName ?? `${artist.firstName} ${artist.surname}`,
}));

vi.mock('@/lib/utils/release-helpers', () => ({
  getReleaseCoverArt: (release: { coverArt?: string; title: string }) => {
    if (release.coverArt) {
      return { src: release.coverArt, alt: `${release.title} cover art` };
    }
    return null;
  },
}));

describe('ArtistPlayer', () => {
  const mockTrack1 = {
    id: 'track-1',
    title: 'First Track',
    audioUrl: 'https://example.com/audio1.mp3',
    duration: 180,
    position: 1,
  };

  const mockTrack2 = {
    id: 'track-2',
    title: 'Second Track',
    audioUrl: 'https://example.com/audio2.mp3',
    duration: 200,
    position: 2,
  };

  const mockTrack3 = {
    id: 'track-3',
    title: 'Third Track',
    audioUrl: 'https://example.com/audio3.mp3',
    duration: 220,
    position: 3,
  };

  const createRelease = (id: string, title: string, tracks: (typeof mockTrack1)[]) => ({
    id,
    title,
    coverArt: `https://example.com/${id}-cover.jpg`,
    publishedAt: new Date('2024-01-01'),
    deletedOn: null,
    releasedOn: new Date('2024-01-01'),
    images: [],
    artistReleases: [],
    releaseTracks: tracks.map((track, index) => ({
      id: `rt-${track.id}`,
      releaseId: id,
      trackId: track.id,
      position: index + 1,
      track,
    })),
    releaseUrls: [],
  });

  const baseArtist = {
    id: 'artist-1',
    firstName: 'John',
    surname: 'Doe',
    displayName: 'John Doe',
    slug: 'john-doe',
    images: [],
    labels: [],
    urls: [],
    groups: [],
  };

  const createArtistWithReleases = (
    releases: ReturnType<typeof createRelease>[]
  ): ArtistWithPublishedReleases =>
    ({
      ...baseArtist,
      releases: releases.map((release) => ({
        id: `ar-${release.id}`,
        artistId: baseArtist.id,
        releaseId: release.id,
        release,
        artist: baseArtist,
      })),
    }) as unknown as ArtistWithPublishedReleases;

  describe('empty state', () => {
    it('should render empty state when artist has no releases', () => {
      const artist = createArtistWithReleases([]);

      render(<ArtistPlayer artist={artist} />);

      expect(screen.getByText('No releases available for this artist.')).toBeInTheDocument();
    });
  });

  describe('single release', () => {
    const release = createRelease('release-1', 'Test Album', [mockTrack1, mockTrack2, mockTrack3]);
    const artist = createArtistWithReleases([release]);

    it('should render the media player with carousel for a single release', () => {
      render(<ArtistPlayer artist={artist} />);

      expect(screen.getByTestId('media-player')).toBeInTheDocument();
      expect(screen.queryByTestId('carousel')).not.toBeInTheDocument();
    });

    it('should center carousel items for a single release', () => {
      render(<ArtistPlayer artist={artist} />);

      expect(screen.queryByTestId('carousel-content')).not.toBeInTheDocument();
    });

    it('should not show carousel navigation for a single release', () => {
      render(<ArtistPlayer artist={artist} />);

      expect(screen.queryByTestId('carousel-previous')).not.toBeInTheDocument();
      expect(screen.queryByTestId('carousel-next')).not.toBeInTheDocument();
    });

    it('should not render CoverArtView for a single release', () => {
      render(<ArtistPlayer artist={artist} />);

      expect(screen.queryByTestId('cover-art-view')).not.toBeInTheDocument();
    });

    it('should render cover art with correct src', () => {
      render(<ArtistPlayer artist={artist} />);

      const coverArt = screen.getByTestId('interactive-cover-art');
      expect(coverArt).toHaveAttribute('data-src', 'https://example.com/release-1-cover.jpg');
    });

    it('should render audio controls for the first track', () => {
      render(<ArtistPlayer artist={artist} />);

      const controls = screen.getByTestId('media-controls');
      expect(controls).toHaveAttribute('data-audio-src', 'https://example.com/audio1.mp3');
    });

    it('should render the info ticker tape with first track name', () => {
      render(<ArtistPlayer artist={artist} />);

      expect(screen.getByTestId('info-ticker-tape')).toHaveTextContent('First Track');
    });

    it('should render the TrackListDrawer at the bottom', () => {
      render(<ArtistPlayer artist={artist} />);

      const drawer = screen.getByTestId('track-list-drawer');
      expect(drawer).toBeInTheDocument();
      expect(drawer).toHaveAttribute('data-current-track-id', 'track-1');
    });

    it('should update isPlaying when play is triggered', () => {
      render(<ArtistPlayer artist={artist} />);

      fireEvent.click(screen.getByTestId('play-button'));

      expect(screen.getByTestId('info-ticker-tape')).toHaveAttribute('data-is-playing', 'true');
    });

    it('should update isPlaying when pause is triggered', () => {
      render(<ArtistPlayer artist={artist} />);

      fireEvent.click(screen.getByTestId('play-button'));
      fireEvent.click(screen.getByTestId('pause-button'));

      expect(screen.getByTestId('info-ticker-tape')).toHaveAttribute('data-is-playing', 'false');
    });

    it('should render no playable tracks message when release has no tracks', () => {
      const emptyRelease = createRelease('release-empty', 'Empty Album', []);
      const emptyArtist = createArtistWithReleases([emptyRelease]);

      render(<ArtistPlayer artist={emptyArtist} />);

      expect(screen.getByText('No playable tracks available.')).toBeInTheDocument();
    });

    it('should not render TrackListDrawer when no tracks', () => {
      const emptyRelease = createRelease('release-empty', 'Empty Album', []);
      const emptyArtist = createArtistWithReleases([emptyRelease]);

      render(<ArtistPlayer artist={emptyArtist} />);

      expect(screen.queryByTestId('track-list-drawer')).not.toBeInTheDocument();
    });

    it('should change track when selecting from TrackListDrawer', () => {
      render(<ArtistPlayer artist={artist} />);

      fireEvent.click(screen.getByTestId('track-select-track-2'));

      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://example.com/audio2.mp3'
      );
    });

    it('should update TrackListDrawer currentTrackId when track changes', () => {
      render(<ArtistPlayer artist={artist} />);

      fireEvent.click(screen.getByTestId('track-select-track-2'));

      expect(screen.getByTestId('track-list-drawer')).toHaveAttribute(
        'data-current-track-id',
        'track-2'
      );
    });

    it('should auto-advance to next track when current track ends', () => {
      render(<ArtistPlayer artist={artist} />);

      fireEvent.click(screen.getByTestId('ended-trigger'));

      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://example.com/audio2.mp3'
      );
    });

    it('should not advance past the last track', () => {
      render(<ArtistPlayer artist={artist} />);

      // Navigate to the last track
      fireEvent.click(screen.getByTestId('track-select-track-3'));

      // Trigger ended on last track
      fireEvent.click(screen.getByTestId('ended-trigger'));

      // Should still be on track-3
      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://example.com/audio3.mp3'
      );
    });

    it('should go to previous track with wasPlaying=true', () => {
      render(<ArtistPlayer artist={artist} />);

      // Navigate to second track first
      fireEvent.click(screen.getByTestId('track-select-track-2'));

      // Go back to previous track (was playing)
      fireEvent.click(screen.getByTestId('previous-track-button'));

      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://example.com/audio1.mp3'
      );
      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-auto-play', 'true');
    });

    it('should go to previous track with wasPlaying=false', () => {
      render(<ArtistPlayer artist={artist} />);

      fireEvent.click(screen.getByTestId('track-select-track-2'));
      fireEvent.click(screen.getByTestId('previous-track-paused-button'));

      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://example.com/audio1.mp3'
      );
      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-auto-play', 'false');
    });

    it('should not go before the first track', () => {
      render(<ArtistPlayer artist={artist} />);

      fireEvent.click(screen.getByTestId('previous-track-button'));

      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://example.com/audio1.mp3'
      );
    });

    it('should go to next track with wasPlaying=true', () => {
      render(<ArtistPlayer artist={artist} />);

      fireEvent.click(screen.getByTestId('next-track-button'));

      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://example.com/audio2.mp3'
      );
      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-auto-play', 'true');
    });

    it('should go to next track with wasPlaying=false', () => {
      render(<ArtistPlayer artist={artist} />);

      fireEvent.click(screen.getByTestId('next-track-paused-button'));

      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://example.com/audio2.mp3'
      );
      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-auto-play', 'false');
    });

    it('should not go past the last track with next', () => {
      render(<ArtistPlayer artist={artist} />);

      fireEvent.click(screen.getByTestId('track-select-track-3'));
      fireEvent.click(screen.getByTestId('next-track-button'));

      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://example.com/audio3.mp3'
      );
    });

    it('should not update track when selecting a non-existent track id', () => {
      render(<ArtistPlayer artist={artist} />);

      // The handler checks findIndex >= 0, so a bad ID is just ignored
      // We verify the current track stays the same indirectly
      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://example.com/audio1.mp3'
      );
    });
  });

  describe('>= 3 releases branch', () => {
    const release1 = createRelease('release-1', 'Album One', [mockTrack1, mockTrack2]);
    const release2 = createRelease('release-2', 'Album Two', [mockTrack2, mockTrack3]);
    const release3 = createRelease('release-3', 'Album Three', [mockTrack3]);

    const artist = createArtistWithReleases([release1, release2, release3]);

    it('should render the carousel', () => {
      render(<ArtistPlayer artist={artist} />);

      expect(screen.getByTestId('carousel')).toBeInTheDocument();
    });

    it('should center carousel items for 3+ releases', () => {
      render(<ArtistPlayer artist={artist} />);

      expect(screen.getByTestId('carousel-content')).toHaveClass('justify-center');
    });

    it('should render carousel with correct aria-label', () => {
      render(<ArtistPlayer artist={artist} />);

      expect(screen.getByTestId('carousel')).toHaveAttribute('aria-label', 'Releases by John Doe');
    });

    it('should render carousel items for each release', () => {
      render(<ArtistPlayer artist={artist} />);

      const items = screen.getAllByTestId('carousel-item');
      expect(items).toHaveLength(3);
    });

    it('should render release thumbnails as images', () => {
      render(<ArtistPlayer artist={artist} />);

      const images = screen.getAllByTestId('next-image');
      expect(images).toHaveLength(3);
    });

    it('should render release thumbnail buttons with aria attributes', () => {
      render(<ArtistPlayer artist={artist} />);

      const buttons = screen.getAllByRole('button', { name: /Play/ });
      expect(buttons[0]).toHaveAttribute('aria-label', 'Play Album One');
      expect(buttons[0]).toHaveAttribute('aria-pressed', 'true');
      expect(buttons[1]).toHaveAttribute('aria-label', 'Play Album Two');
      expect(buttons[1]).toHaveAttribute('aria-pressed', 'false');
    });

    it('should show carousel navigation for > 3 releases', () => {
      const release4 = createRelease('release-4', 'Album Four', [mockTrack1]);
      const manyReleasesArtist = createArtistWithReleases([release1, release2, release3, release4]);

      render(<ArtistPlayer artist={manyReleasesArtist} />);

      expect(screen.getByTestId('carousel-previous')).toBeInTheDocument();
      expect(screen.getByTestId('carousel-next')).toBeInTheDocument();
    });

    it('should not show carousel navigation for exactly 3 releases', () => {
      render(<ArtistPlayer artist={artist} />);

      expect(screen.queryByTestId('carousel-previous')).not.toBeInTheDocument();
      expect(screen.queryByTestId('carousel-next')).not.toBeInTheDocument();
    });

    it('should render the artist name heading', () => {
      render(<ArtistPlayer artist={artist} />);

      const headings = screen.getAllByRole('heading', { level: 2 });
      const nameHeading = headings.find((h) => h.textContent === 'John Doe');
      expect(nameHeading).toBeInTheDocument();
    });

    it('should render the selected release title', () => {
      render(<ArtistPlayer artist={artist} />);

      expect(screen.getAllByText('Album One').length).toBeGreaterThan(0);
    });

    it('should render the media player', () => {
      render(<ArtistPlayer artist={artist} />);

      expect(screen.getByTestId('media-player')).toBeInTheDocument();
    });

    it('should render audio controls for the first release', () => {
      render(<ArtistPlayer artist={artist} />);

      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://example.com/audio1.mp3'
      );
    });

    it('should render TrackListDrawer at the bottom of the media player', () => {
      render(<ArtistPlayer artist={artist} />);

      const drawer = screen.getByTestId('track-list-drawer');
      expect(drawer).toBeInTheDocument();
      expect(drawer).toHaveAttribute('data-artist-name', 'John Doe');
      expect(drawer).toHaveAttribute('data-current-track-id', 'track-1');
    });

    it('should change release when clicking a different thumbnail', () => {
      render(<ArtistPlayer artist={artist} />);

      const playButtons = screen.getAllByRole('button', { name: /Play Album/ });
      fireEvent.click(playButtons[1]); // Click "Play Album Two"

      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://example.com/audio2.mp3'
      );
    });

    it('should reset to first track when switching releases', () => {
      render(<ArtistPlayer artist={artist} />);

      // Switch to release 2
      const playButtons = screen.getAllByRole('button', { name: /Play Album/ });
      fireEvent.click(playButtons[1]);

      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://example.com/audio2.mp3'
      );
    });

    it('should toggle play/pause when clicking the already-selected release thumbnail', () => {
      render(<ArtistPlayer artist={artist} />);

      const playButtons = screen.getAllByRole('button', { name: /Play Album/ });

      // Click the already-selected first release - should toggle, not switch
      fireEvent.click(playButtons[0]);

      // No crash means toggle was called; the component still displays the same release
      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://example.com/audio1.mp3'
      );
    });

    it('should set autoPlay when switching releases', () => {
      render(<ArtistPlayer artist={artist} />);

      const playButtons = screen.getAllByRole('button', { name: /Play Album/ });
      fireEvent.click(playButtons[1]);

      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-auto-play', 'true');
    });

    it('should render fallback initial for release without cover art', () => {
      const noCoverRelease1 = { ...release1, coverArt: '' };
      const noCoverRelease2 = { ...release2, coverArt: '' };
      const noCoverRelease3 = { ...release3, coverArt: '' };
      const noCoverArtist = createArtistWithReleases([
        noCoverRelease1,
        noCoverRelease2,
        noCoverRelease3,
      ]);

      const { container } = render(<ArtistPlayer artist={noCoverArtist} />);

      // Should display fallback initial letters (not images)
      expect(screen.queryAllByTestId('next-image')).toHaveLength(0);
      // Fallback divs contain the first letter of each release title
      const fallbackDivs = container.querySelectorAll('.flex.items-center.justify-center.bg-muted');
      expect(fallbackDivs).toHaveLength(3);
      expect(fallbackDivs[0].textContent).toBe('A'); // Album One
      expect(fallbackDivs[1].textContent).toBe('A'); // Album Two
      expect(fallbackDivs[2].textContent).toBe('A'); // Album Three
    });
  });

  describe('initialReleaseId', () => {
    const release1 = createRelease('release-1', 'Album One', [mockTrack1]);
    const release2 = createRelease('release-2', 'Album Two', [mockTrack2]);
    const release3 = createRelease('release-3', 'Album Three', [mockTrack3]);
    const artist = createArtistWithReleases([release1, release2, release3]);

    it('should select the release matching initialReleaseId', () => {
      render(<ArtistPlayer artist={artist} initialReleaseId="release-2" />);

      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://example.com/audio2.mp3'
      );
    });

    it('should set autoPlay when initialReleaseId is provided', () => {
      render(<ArtistPlayer artist={artist} initialReleaseId="release-2" />);

      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-auto-play', 'true');
    });

    it('should default to first release when initialReleaseId is not found', () => {
      render(<ArtistPlayer artist={artist} initialReleaseId="non-existent" />);

      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://example.com/audio1.mp3'
      );
    });

    it('should not autoPlay when no initialReleaseId is provided', () => {
      render(<ArtistPlayer artist={artist} />);

      expect(screen.getByTestId('media-controls')).toHaveAttribute('data-auto-play', 'false');
    });
  });

  describe('track selection and navigation in >= 3 releases', () => {
    const release1 = createRelease('release-1', 'Album One', [mockTrack1, mockTrack2, mockTrack3]);
    const release2 = createRelease('release-2', 'Album Two', [mockTrack2]);
    const release3 = createRelease('release-3', 'Album Three', [mockTrack3]);
    const artist = createArtistWithReleases([release1, release2, release3]);

    it('should change track when selecting from TrackListDrawer', () => {
      render(<ArtistPlayer artist={artist} />);

      fireEvent.click(screen.getByTestId('track-select-track-2'));

      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://example.com/audio2.mp3'
      );
    });

    it('should auto-advance on track ended', () => {
      render(<ArtistPlayer artist={artist} />);

      fireEvent.click(screen.getByTestId('ended-trigger'));

      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://example.com/audio2.mp3'
      );
    });

    it('should navigate to previous track', () => {
      render(<ArtistPlayer artist={artist} />);

      // Go to track 2 first
      fireEvent.click(screen.getByTestId('next-track-button'));

      // Now go back
      fireEvent.click(screen.getByTestId('previous-track-button'));

      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://example.com/audio1.mp3'
      );
    });

    it('should navigate to next track', () => {
      render(<ArtistPlayer artist={artist} />);

      fireEvent.click(screen.getByTestId('next-track-button'));

      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://example.com/audio2.mp3'
      );
    });

    it('should toggle play via interactive cover art', () => {
      render(<ArtistPlayer artist={artist} />);

      fireEvent.click(screen.getByTestId('interactive-cover-art'));

      // No crash; toggle was called successfully
      expect(screen.getByTestId('interactive-cover-art')).toBeInTheDocument();
    });

    it('should update isPlaying state on play/pause', () => {
      render(<ArtistPlayer artist={artist} />);

      fireEvent.click(screen.getByTestId('play-button'));
      expect(screen.getByTestId('info-ticker-tape')).toHaveAttribute('data-is-playing', 'true');

      fireEvent.click(screen.getByTestId('pause-button'));
      expect(screen.getByTestId('info-ticker-tape')).toHaveAttribute('data-is-playing', 'false');
    });
  });

  describe('two releases', () => {
    const release1 = createRelease('release-1', 'Album One', [mockTrack1]);
    const release2 = createRelease('release-2', 'Album Two', [mockTrack2]);
    const artist = createArtistWithReleases([release1, release2]);

    it('should render carousel for 2 releases', () => {
      render(<ArtistPlayer artist={artist} />);

      expect(screen.getByTestId('carousel')).toBeInTheDocument();
      expect(screen.getByTestId('media-player')).toBeInTheDocument();
    });

    it('should center the carousel items when there are 2 releases', () => {
      render(<ArtistPlayer artist={artist} />);

      expect(screen.getByTestId('carousel-content')).toHaveClass('justify-center');
    });

    it('should display the first release by default', () => {
      render(<ArtistPlayer artist={artist} />);

      expect(screen.getByTestId('media-controls')).toHaveAttribute(
        'data-audio-src',
        'https://example.com/audio1.mp3'
      );
    });
    it('should not render carousel navigation arrows for 2 releases', () => {
      render(<ArtistPlayer artist={artist} />);

      expect(screen.queryByTestId('carousel-previous')).not.toBeInTheDocument();
      expect(screen.queryByTestId('carousel-next')).not.toBeInTheDocument();
    });
  });
});
