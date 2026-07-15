/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { PlaylistItemPayload } from '@/lib/types/domain/playlist';

import { PlaylistPlayer } from './playlist-player';

const playMock = vi.hoisted(() => vi.fn());
const toggleMock = vi.hoisted(() => vi.fn());

interface ControlsStubProps {
  audioSrc: string;
  onPlay?: () => void;
  onPause?: () => void;
  onEnded?: () => void;
  controlsRef?: (
    controls: { play: () => void; pause: () => void; toggle: () => void } | null
  ) => void;
}

interface CoverArtStubProps {
  src: string;
  alt: string;
  isPlaying: boolean;
  onTogglePlay: () => void;
}

interface TickerStubProps {
  trackTitle: string;
  artistName?: string | null;
}

vi.mock('@/ui/audio/media-player', async () => {
  const { useEffect } = await import('react');

  const ControlsStub = ({ audioSrc, onPlay, onPause, onEnded, controlsRef }: ControlsStubProps) => {
    useEffect(() => {
      controlsRef?.({ play: playMock, pause: vi.fn(), toggle: toggleMock });
      return () => controlsRef?.(null);
    }, [controlsRef]);

    return (
      <div data-testid="audio-controls" data-audio-src={audioSrc}>
        <button type="button" onClick={onPlay}>
          stub-audio-play
        </button>
        <button type="button" onClick={onPause}>
          stub-audio-pause
        </button>
        <button type="button" onClick={onEnded}>
          stub-audio-ended
        </button>
      </div>
    );
  };

  const MediaPlayerStub = Object.assign(
    ({ children }: { children: React.ReactNode }) => (
      <div data-testid="media-player">{children}</div>
    ),
    {
      Controls: ControlsStub,
      InteractiveCoverArt: ({ src, isPlaying, onTogglePlay }: CoverArtStubProps) => (
        <button
          type="button"
          data-testid="cover-art"
          data-src={src}
          data-playing={String(isPlaying)}
          onClick={onTogglePlay}
        >
          stub-toggle-play
        </button>
      ),
      InfoTickerTape: ({ trackTitle, artistName }: TickerStubProps) => (
        <div data-testid="ticker">
          {trackTitle}
          {artistName ? ` • by ${artistName}` : ''}
        </div>
      ),
    }
  );

  return { MediaPlayer: MediaPlayerStub };
});

interface VideoSurfaceStubProps {
  title: string;
  src: string;
  posterUrl?: string | null;
  onEnded?: () => void;
}

vi.mock('@/ui/video/lazy-video-surface', () => ({
  LazyVideoSurface: ({ title, src, posterUrl, onEnded }: VideoSurfaceStubProps) => (
    <div
      data-testid="video-surface"
      data-src={src}
      data-poster={posterUrl ?? ''}
      aria-label={title}
    >
      <button type="button" onClick={onEnded}>
        stub-video-ended
      </button>
    </div>
  ),
}));

vi.mock('./playlist-cover-tiles', () => ({
  PlaylistCoverTiles: ({ images, alt }: { images: string[]; alt: string }) => (
    <div data-testid="cover-tiles" data-count={images.length}>
      {alt}
    </div>
  ),
}));

const makeItem = (overrides: Partial<PlaylistItemPayload>): PlaylistItemPayload => ({
  id: 'item-1',
  itemType: 'track',
  sortOrder: 0,
  title: 'Track One',
  artistName: 'Ceschi',
  duration: 200,
  available: true,
  trackFileId: 'tf-1',
  releaseId: 'rel-1',
  releaseTitle: 'Broken Bone Ballads',
  videoId: null,
  coverArt: 'https://cdn.example.com/cover-1.jpg',
  s3Key: 'releases/rel-1/digital-formats/MP3_320KBPS/a.mp3',
  streamUrl: 'https://cdn.example.com/a.mp3',
  posterUrl: null,
  ...overrides,
});

const trackOne = makeItem({});
const video = makeItem({
  id: 'item-2',
  itemType: 'video',
  sortOrder: 1,
  title: 'Video One',
  trackFileId: null,
  releaseId: null,
  releaseTitle: null,
  videoId: 'vid-1',
  coverArt: 'https://cdn.example.com/poster.jpg',
  s3Key: null,
  streamUrl: 'https://signed.example.com/v.mp4?sig=abc',
  posterUrl: 'https://cdn.example.com/poster.jpg',
});
const trackTwo = makeItem({
  id: 'item-3',
  sortOrder: 2,
  title: 'Track Two',
  trackFileId: 'tf-2',
  coverArt: null,
  s3Key: 'releases/rel-1/digital-formats/MP3_320KBPS/b.mp3',
  streamUrl: 'https://cdn.example.com/b.mp3',
});
const unavailable = makeItem({
  id: 'item-4',
  sortOrder: 3,
  title: 'Gone Song',
  available: false,
  trackFileId: null,
  releaseId: null,
  releaseTitle: null,
  s3Key: null,
  streamUrl: null,
});

const allItems = [trackOne, video, trackTwo, unavailable];

const renderPlayer = (items: PlaylistItemPayload[] = allItems): void => {
  render(<PlaylistPlayer items={items} title="Road Mix" />);
};

describe('PlaylistPlayer', () => {
  it('renders the first playable track through the audio surface', () => {
    renderPlayer();

    expect(screen.getByTestId('audio-controls')).toHaveAttribute(
      'data-audio-src',
      'https://cdn.example.com/a.mp3'
    );
  });

  it('shows interactive cover art for a track with cover art', () => {
    renderPlayer();

    expect(screen.getByTestId('cover-art')).toHaveAttribute(
      'data-src',
      'https://cdn.example.com/cover-1.jpg'
    );
  });

  it('falls back to the playlist cover tiles when the track has no art', async () => {
    const user = userEvent.setup();
    renderPlayer();

    await user.click(screen.getByRole('button', { name: 'Play Track Two' }));

    expect(screen.queryByTestId('cover-art')).not.toBeInTheDocument();
    expect(screen.getByTestId('cover-tiles')).toHaveAttribute('data-count', '2');
  });

  it('lists every item in sortOrder in the queue', () => {
    renderPlayer([trackTwo, unavailable, trackOne, video]);

    const rows = screen.getAllByRole('button', { name: /^Play .+/ });
    expect(rows.map((row) => row.getAttribute('aria-label'))).toEqual([
      'Play Track One',
      'Play Video One',
      'Play Track Two',
      'Play Gone Song',
    ]);
  });

  it('disables the unavailable queue row', () => {
    renderPlayer();

    expect(screen.getByRole('button', { name: 'Play Gone Song' })).toBeDisabled();
  });

  it('switching to a video item unmounts the audio surface', async () => {
    const user = userEvent.setup();
    renderPlayer();

    await user.click(screen.getByRole('button', { name: 'Play Video One' }));

    expect(screen.getByTestId('video-surface')).toHaveAttribute(
      'data-src',
      'https://signed.example.com/v.mp4?sig=abc'
    );
    expect(screen.getByTestId('video-surface')).toHaveAttribute(
      'data-poster',
      'https://cdn.example.com/poster.jpg'
    );
    expect(screen.queryByTestId('audio-controls')).not.toBeInTheDocument();
  });

  it('advances past the video to the next track when it ends', async () => {
    const user = userEvent.setup();
    renderPlayer();

    await user.click(screen.getByRole('button', { name: 'Play Video One' }));
    await user.click(screen.getByRole('button', { name: 'stub-video-ended' }));

    expect(screen.queryByTestId('video-surface')).not.toBeInTheDocument();
    expect(screen.getByTestId('audio-controls')).toHaveAttribute(
      'data-audio-src',
      'https://cdn.example.com/b.mp3'
    );
  });

  it('auto-plays the freshly keyed track surface after advancing', async () => {
    const user = userEvent.setup();
    renderPlayer();

    await user.click(screen.getByRole('button', { name: 'Play Video One' }));
    await user.click(screen.getByRole('button', { name: 'stub-video-ended' }));

    expect(playMock).toHaveBeenCalled();
  });

  it('skips unavailable items when a track ends', async () => {
    const user = userEvent.setup();
    const unavailableMiddle = makeItem({
      ...unavailable,
      id: 'item-5',
      sortOrder: 1,
    });
    renderPlayer([trackOne, unavailableMiddle, makeItem({ ...trackTwo, sortOrder: 2 })]);

    await user.click(screen.getByRole('button', { name: 'stub-audio-ended' }));

    expect(screen.getByTestId('audio-controls')).toHaveAttribute(
      'data-audio-src',
      'https://cdn.example.com/b.mp3'
    );
  });

  it('shows the current title and artist in the ticker', () => {
    renderPlayer();

    expect(screen.getByTestId('ticker')).toHaveTextContent('Track One • by Ceschi');
  });

  it('toggles playback from the cover art', async () => {
    const user = userEvent.setup();
    renderPlayer();

    await user.click(screen.getByRole('button', { name: 'stub-toggle-play' }));

    expect(toggleMock).toHaveBeenCalledTimes(1);
  });

  it('reflects audio play state on the cover art', async () => {
    const user = userEvent.setup();
    renderPlayer();

    await user.click(screen.getByRole('button', { name: 'stub-audio-play' }));

    expect(screen.getByTestId('cover-art')).toHaveAttribute('data-playing', 'true');
  });

  it('renders the empty state when nothing is playable', () => {
    renderPlayer([unavailable]);

    expect(screen.getByText('No playable items in this playlist.')).toBeInTheDocument();
  });
});
