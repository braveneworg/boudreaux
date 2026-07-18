/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { act, render, screen } from '@testing-library/react';
import videojs from 'video.js';

import { usePlayerPrefs } from '@/hooks/use-player-prefs';

import { claimPlayback } from './video-playback-coordinator';
import { VideoPlayerSurface } from './video-player-surface';

interface FakePlayer {
  ready: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  volume: (value?: number) => number | undefined;
  muted: (value?: boolean) => boolean | undefined;
  /** Test-only helper to fire a registered video.js event handler. */
  trigger: (event: string) => void;
}

// A fresh fake player per videojs() call so multi-instance coordinator tests get
// distinct pause spies. play() rejects to exercise the autoplay-swallow path on
// every mount; a missing .catch would surface as an unhandled rejection.
vi.mock('video.js', () => {
  const makePlayer = (): FakePlayer => {
    const handlers = new Map<string, Array<() => void>>();
    let currentVolume = 1;
    let currentMuted = false;
    return {
      ready: vi.fn((callback: () => void) => callback()),
      on: vi.fn((event: string, callback: () => void) => {
        const existing = handlers.get(event) ?? [];
        existing.push(callback);
        handlers.set(event, existing);
      }),
      play: vi.fn(() => Promise.reject(new Error('autoplay-blocked'))),
      pause: vi.fn(),
      dispose: vi.fn(),
      volume: vi.fn((value?: number) => {
        if (value !== undefined) {
          currentVolume = value;
          return undefined;
        }
        return currentVolume;
      }),
      muted: vi.fn((value?: boolean) => {
        if (value !== undefined) {
          currentMuted = value;
          return undefined;
        }
        return currentMuted;
      }),
      trigger: (event: string) => handlers.get(event)?.forEach((callback) => callback()),
    };
  };
  return { default: vi.fn(() => makePlayer()) };
});

const getPlayers = (): FakePlayer[] =>
  vi.mocked(videojs).mock.results.map((result) => result.value as unknown as FakePlayer);

describe('VideoPlayerSurface', () => {
  it('initializes video.js once with the resolved source options', () => {
    render(
      <VideoPlayerSurface
        title="Live"
        src="https://cdn.example.com/clip.mp4?sig=abc"
        posterUrl="https://cdn.example.com/poster.jpg"
      />
    );

    expect(vi.mocked(videojs)).toHaveBeenCalledWith(expect.anything(), {
      controls: true,
      fluid: true,
      playsinline: true,
      preload: 'auto',
      poster: 'https://cdn.example.com/poster.jpg',
      sources: [{ src: 'https://cdn.example.com/clip.mp4?sig=abc', type: 'video/mp4' }],
    });
  });

  it('plays on ready and swallows a rejected play() promise', () => {
    render(<VideoPlayerSurface title="Live" src="https://cdn.example.com/clip.mp4" />);

    const [player] = getPlayers();
    expect(player.play).toHaveBeenCalledTimes(1);
  });

  it('pauses the first surface when a second surface starts playing', () => {
    render(
      <>
        <VideoPlayerSurface title="First" src="https://cdn.example.com/a.mp4" />
        <VideoPlayerSurface title="Second" src="https://cdn.example.com/b.mp4" />
      </>
    );

    const [first, second] = getPlayers();
    act(() => first.trigger('play'));
    act(() => second.trigger('play'));

    expect(first.pause).toHaveBeenCalledTimes(1);
  });

  it('disposes the player on unmount', () => {
    const { unmount } = render(
      <VideoPlayerSurface title="Live" src="https://cdn.example.com/clip.mp4" />
    );
    const [player] = getPlayers();

    unmount();

    expect(player.dispose).toHaveBeenCalledTimes(1);
  });

  it('releases playback on unmount so later claims no longer pause it', () => {
    const { unmount } = render(
      <VideoPlayerSurface title="Live" src="https://cdn.example.com/clip.mp4" />
    );
    const [player] = getPlayers();
    act(() => player.trigger('play'));

    unmount();
    claimPlayback('someone-else', vi.fn());

    expect(player.pause).not.toHaveBeenCalled();
  });

  it('renders a friendly fallback when the player emits an error', () => {
    render(<VideoPlayerSurface title="Live" src="https://cdn.example.com/clip.mp4" />);
    const [player] = getPlayers();

    act(() => player.trigger('error'));

    expect(screen.getByText(/can.?t be played right now/i)).toBeInTheDocument();
  });

  it('still disposes safely on unmount after an error', () => {
    const { unmount } = render(
      <VideoPlayerSurface title="Live" src="https://cdn.example.com/clip.mp4" />
    );
    const [player] = getPlayers();
    act(() => player.trigger('error'));

    unmount();

    expect(player.dispose).toHaveBeenCalledTimes(1);
  });

  it('fires onEnded when the player emits ended', () => {
    const onEnded = vi.fn();
    render(
      <VideoPlayerSurface title="Live" src="https://cdn.example.com/clip.mp4" onEnded={onEnded} />
    );
    const [player] = getPlayers();

    act(() => player.trigger('ended'));

    expect(onEnded).toHaveBeenCalledTimes(1);
  });

  it('ignores ended when no onEnded callback is provided', () => {
    render(<VideoPlayerSurface title="Live" src="https://cdn.example.com/clip.mp4" />);
    const [player] = getPlayers();

    expect(() => act(() => player.trigger('ended'))).not.toThrow();
  });

  it('uses the latest onEnded without re-initializing the player', () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(
      <VideoPlayerSurface title="Live" src="https://cdn.example.com/clip.mp4" onEnded={first} />
    );

    rerender(
      <VideoPlayerSurface title="Live" src="https://cdn.example.com/clip.mp4" onEnded={second} />
    );
    const players = getPlayers();
    act(() => players[0].trigger('ended'));

    expect(players).toHaveLength(1);
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it('applies stored volume prefs when the player mounts', () => {
    usePlayerPrefs.getState().setVolume(0.35);
    usePlayerPrefs.getState().setMuted(true);

    render(<VideoPlayerSurface title="Live" src="https://cdn.example.com/clip.mp4" />);

    const [player] = getPlayers();
    expect(player.volume()).toBe(0.35);
    expect(player.muted()).toBe(true);
  });

  it('records user volume changes into the prefs store', () => {
    render(<VideoPlayerSurface title="Live" src="https://cdn.example.com/clip.mp4" />);
    const [player] = getPlayers();

    player.volume(0.6);
    player.muted(true);
    act(() => player.trigger('volumechange'));

    expect(usePlayerPrefs.getState().volume).toBe(0.6);
    expect(usePlayerPrefs.getState().muted).toBe(true);
  });
});
