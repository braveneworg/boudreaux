/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ReactNode } from 'react';
import { useEffect } from 'react';

import { fireEvent, render, screen } from '@testing-library/react';

import type { PublishedReleaseDetail } from '@/lib/types/media-models';

import { ReleasePlayer } from './release-player';

// Mock the MediaPlayer compound component
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
      controls: {
        play: () => void;
        pause: () => void;
        toggle: () => void;
      } | null
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
          Previous
        </button>
        <button data-testid="next-track-button" onClick={() => onNextTrack?.(true)}>
          Next
        </button>
      </div>
    );
  };
  Controls.displayName = 'Controls';
  MockMediaPlayer.Controls = Controls;

  const InfoTickerTape = ({
    artistRelease: _artistRelease,
    trackName,
    isPlaying,
  }: {
    artistRelease?: unknown;
    trackName?: string;
    isPlaying?: boolean;
  }) => (
    <div
      data-testid="info-ticker-tape"
      data-is-playing={isPlaying?.toString()}
      data-track-name={trackName}
    >
      Ticker
    </div>
  );
  InfoTickerTape.displayName = 'InfoTickerTape';
  MockMediaPlayer.InfoTickerTape = InfoTickerTape;

  const TrackListDrawer = ({
    currentTrackId,
    onTrackSelect,
    artistRelease,
  }: {
    artistRelease: {
      release: {
        releaseTracks: Array<{ track: { id: string; title: string } }>;
      };
    };
    currentTrackId?: string;
    onTrackSelect?: (trackId: string) => void;
  }) => (
    <div data-testid="track-list-drawer" data-current-track-id={currentTrackId}>
      {artistRelease.release.releaseTracks.map((rt: { track: { id: string; title: string } }) => (
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

  return { MediaPlayer: MockMediaPlayer };
});

describe('ReleasePlayer', () => {
  const mockTrack1 = {
    id: 'track-1',
    title: 'Song One',
    audioUrl: 'https://cdn.example.com/track1.mp3',
    position: 1,
    duration: 180,
    lyrics: null,
    credits: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedOn: null,
    images: [],
    releaseTracks: [],
  };

  const mockTrack2 = {
    id: 'track-2',
    title: 'Song Two',
    audioUrl: 'https://cdn.example.com/track2.mp3',
    position: 2,
    duration: 240,
    lyrics: null,
    credits: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedOn: null,
    images: [],
    releaseTracks: [],
  };

  const mockRelease = {
    id: 'release-1',
    title: 'Test Album',
    coverArt: 'https://cdn.example.com/cover.jpg',
    description: 'A test album description',
    publishedAt: new Date(),
    releasedOn: new Date(),
    deletedOn: null,
    createdAt: new Date(),
    updatedAt: new Date(),
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
          title: null,
          suffix: null,
          middleName: null,
          bio: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          deletedOn: null,
        },
      },
    ],
    releaseTracks: [
      { id: 'rt-1', releaseId: 'release-1', trackId: 'track-1', position: 1, track: mockTrack1 },
      { id: 'rt-2', releaseId: 'release-1', trackId: 'track-2', position: 2, track: mockTrack2 },
    ],
    releaseUrls: [],
  } as unknown as PublishedReleaseDetail;

  const mockReleaseNoTracks = {
    ...mockRelease,
    releaseTracks: [],
  } as unknown as PublishedReleaseDetail;

  it('should render MediaPlayer with sub-components', () => {
    render(<ReleasePlayer release={mockRelease} />);

    expect(screen.getByTestId('media-player')).toBeInTheDocument();
    expect(screen.getByTestId('interactive-cover-art')).toBeInTheDocument();
    expect(screen.getByTestId('media-controls')).toBeInTheDocument();
    expect(screen.getByTestId('info-ticker-tape')).toBeInTheDocument();
    expect(screen.getByTestId('track-list-drawer')).toBeInTheDocument();
  });

  it('should handle play/pause state', () => {
    render(<ReleasePlayer release={mockRelease} />);

    const coverArt = screen.getByTestId('interactive-cover-art');
    expect(coverArt).toHaveAttribute('data-is-playing', 'false');

    fireEvent.click(screen.getByTestId('play-button'));
    expect(coverArt).toHaveAttribute('data-is-playing', 'true');

    fireEvent.click(screen.getByTestId('pause-button'));
    expect(coverArt).toHaveAttribute('data-is-playing', 'false');
  });

  it('should handle track selection', () => {
    render(<ReleasePlayer release={mockRelease} />);

    // Select second track
    fireEvent.click(screen.getByTestId('track-select-track-2'));

    const controls = screen.getByTestId('media-controls');
    expect(controls).toHaveAttribute('data-audio-src', mockTrack2.audioUrl);
  });

  it('should auto-advance to next track when current track ends', () => {
    render(<ReleasePlayer release={mockRelease} />);

    // Playing first track
    const controls = screen.getByTestId('media-controls');
    expect(controls).toHaveAttribute('data-audio-src', mockTrack1.audioUrl);

    // Track ends → should advance to track 2
    fireEvent.click(screen.getByTestId('ended-trigger'));
    expect(controls).toHaveAttribute('data-audio-src', mockTrack2.audioUrl);
  });

  it('should handle previous/next track navigation', () => {
    render(<ReleasePlayer release={mockRelease} />);

    const controls = screen.getByTestId('media-controls');
    expect(controls).toHaveAttribute('data-audio-src', mockTrack1.audioUrl);

    // Go to next track
    fireEvent.click(screen.getByTestId('next-track-button'));
    expect(controls).toHaveAttribute('data-audio-src', mockTrack2.audioUrl);

    // Go back to previous track
    fireEvent.click(screen.getByTestId('previous-track-button'));
    expect(controls).toHaveAttribute('data-audio-src', mockTrack1.audioUrl);
  });

  it('should show no-tracks message when release has no tracks', () => {
    render(<ReleasePlayer release={mockReleaseNoTracks} />);

    expect(screen.getByText(/no playable tracks available/i)).toBeInTheDocument();
    expect(screen.queryByTestId('media-controls')).not.toBeInTheDocument();
  });

  it('should render cover art even when no tracks available', () => {
    render(<ReleasePlayer release={mockReleaseNoTracks} />);

    expect(screen.getByTestId('interactive-cover-art')).toBeInTheDocument();
  });

  it('should set first track as current by default', () => {
    render(<ReleasePlayer release={mockRelease} />);

    const controls = screen.getByTestId('media-controls');
    expect(controls).toHaveAttribute('data-audio-src', mockTrack1.audioUrl);

    const drawer = screen.getByTestId('track-list-drawer');
    expect(drawer).toHaveAttribute('data-current-track-id', 'track-1');
  });

  it('should not advance past the last track', () => {
    render(<ReleasePlayer release={mockRelease} />);

    // Select last track
    fireEvent.click(screen.getByTestId('track-select-track-2'));

    const controls = screen.getByTestId('media-controls');
    expect(controls).toHaveAttribute('data-audio-src', mockTrack2.audioUrl);

    // Track ends → should stay on last track (no wrap)
    fireEvent.click(screen.getByTestId('ended-trigger'));
    expect(controls).toHaveAttribute('data-audio-src', mockTrack2.audioUrl);
  });

  it('should auto-play first track when autoPlay prop is true', () => {
    render(<ReleasePlayer release={mockRelease} autoPlay />);

    // autoPlay triggers playerControls.play() via effect, which calls onPlay,
    // setting isPlaying to true — verified via the cover art's data attribute
    const coverArt = screen.getByTestId('interactive-cover-art');
    expect(coverArt).toHaveAttribute('data-is-playing', 'true');
  });

  it('should not auto-play first track by default', () => {
    render(<ReleasePlayer release={mockRelease} />);

    const coverArt = screen.getByTestId('interactive-cover-art');
    expect(coverArt).toHaveAttribute('data-is-playing', 'false');
  });
});
