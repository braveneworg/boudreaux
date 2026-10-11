/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { StrictMode } from 'react';

import { act, render, renderHook, screen } from '@testing-library/react';
import videojs from 'video.js';

import { usePlayerPrefs } from '@/hooks/use-player-prefs';
import { usePrimedMediaHandoff } from '@/hooks/use-primed-media-handoff';

import { claimPlayback } from '../playback-session';
import { VideoPlayerSurface } from './video-player-surface';

interface FakePlayer {
  ready: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  play: ReturnType<typeof vi.fn>;
  pause: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  hasStarted: ReturnType<typeof vi.fn>;
  addClass: ReturnType<typeof vi.fn>;
  removeClass: ReturnType<typeof vi.fn>;
  volume: (value?: number) => number | undefined;
  muted: (value?: boolean) => boolean | undefined;
  /** Test-only helper to fire a registered video.js event handler. */
  trigger: (event: string) => void;
}

// A fresh fake player per videojs() call so multi-instance coordinator tests get
// distinct pause spies. play() rejects to exercise the autoplay-swallow path on
// every mount; a missing .catch would surface as an unhandled rejection.
// dispose() is DOM-faithful: real video.js adopts the data-vjs-player parent as
// the player root (playerElIngest) and dispose() removes THAT parent from the
// DOM — the fake must too, or remount-after-dispose bugs stay invisible here.
// It also empties the media element, as Html5.disposeMediaElement does (it
// strips `src` and calls load()), so a disposed primed element shows as spent.
vi.mock('video.js', () => {
  const makePlayer = (el?: HTMLElement): FakePlayer => {
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
      dispose: vi.fn(() => {
        el?.parentElement?.remove();
        if (el instanceof HTMLMediaElement) {
          el.removeAttribute('src');
          el.load();
        }
      }),
      hasStarted: vi.fn(),
      addClass: vi.fn(),
      removeClass: vi.fn(),
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
  return { default: vi.fn((el: HTMLElement) => makePlayer(el)) };
});

const getPlayers = (): FakePlayer[] =>
  vi.mocked(videojs).mock.results.map((result) => result.value as unknown as FakePlayer);

/** Let the microtasks queued so far run. */
const flushMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
};

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

  // The facade primes a media element during the play click (autoplay blessing
  // is per element in Safari/iOS and Firefox), so the surface must hand that
  // exact element to video.js — a self-created replacement would be unprimed
  // and the deferred play() would be rejected again.
  describe('primed element handoff', () => {
    it('initializes video.js on the takeMediaEl-provided element', () => {
      const primed = document.createElement('video');

      render(
        <VideoPlayerSurface
          title="Live"
          src="https://cdn.example.com/clip.mp4"
          takeMediaEl={() => primed}
        />
      );

      expect(vi.mocked(videojs)).toHaveBeenCalledWith(primed, expect.anything());
    });

    it('mounts the primed element under a data-vjs-player parent', () => {
      // Without this attribute video.js clones (and thereby unprimes) the
      // element on iOS instead of ingesting it in place.
      const primed = document.createElement('video');

      render(
        <VideoPlayerSurface
          title="Live"
          src="https://cdn.example.com/clip.mp4"
          takeMediaEl={() => primed}
        />
      );

      expect(primed.parentElement?.hasAttribute('data-vjs-player')).toBe(true);
    });

    it('labels the primed element with the video title', () => {
      const primed = document.createElement('video');

      render(
        <VideoPlayerSurface
          title="Live"
          src="https://cdn.example.com/clip.mp4"
          takeMediaEl={() => primed}
        />
      );

      expect(primed.getAttribute('aria-label')).toBe('Live');
    });

    // A source-primed element (see usePrimedMediaHandoff) arrives ALREADY
    // PLAYING from the click gesture. Re-setting the same source would rerun
    // the media load algorithm and kill that playback, and video.js never saw
    // the element's play event, so the surface must sync the player state.
    describe('gesture-playing element adoption', () => {
      const SRC = 'https://cdn.example.com/clip.mp4?sig=abc';

      const makePlayingEl = (): HTMLVideoElement => {
        const primed = document.createElement('video');
        primed.src = SRC;
        Object.defineProperty(primed, 'paused', { value: false, configurable: true });
        return primed;
      };

      it('adopts the element without re-setting its source', () => {
        render(<VideoPlayerSurface title="Live" src={SRC} takeMediaEl={makePlayingEl} />);

        const options = vi.mocked(videojs).mock.calls[0]?.[1] as Record<string, unknown>;
        expect(options).not.toHaveProperty('sources');
      });

      it('does not call play() on an element already playing', () => {
        render(<VideoPlayerSurface title="Live" src={SRC} takeMediaEl={makePlayingEl} />);

        const [player] = getPlayers();
        expect(player.play).not.toHaveBeenCalled();
      });

      it('syncs the started/playing UI state video.js missed', () => {
        render(<VideoPlayerSurface title="Live" src={SRC} takeMediaEl={makePlayingEl} />);

        const [player] = getPlayers();
        expect(player.hasStarted).toHaveBeenCalledWith(true);
        expect(player.removeClass).toHaveBeenCalledWith('vjs-paused');
        expect(player.addClass).toHaveBeenCalledWith('vjs-playing');
      });

      it('claims the playback session immediately for a playing element', () => {
        render(
          <>
            <VideoPlayerSurface title="First" src={SRC} takeMediaEl={makePlayingEl} />
            <VideoPlayerSurface title="Second" src="https://cdn.example.com/b.mp4" />
          </>
        );

        const [first, second] = getPlayers();
        act(() => second.trigger('play'));

        expect(first.pause).toHaveBeenCalledTimes(1);
      });

      it('falls back to the deferred play() for a pre-sourced but paused element', () => {
        // The gestured play() was rejected (e.g. by an autoplay-blocking
        // extension) — the element hands off with its source but paused.
        const paused = document.createElement('video');
        paused.src = SRC;

        render(<VideoPlayerSurface title="Live" src={SRC} takeMediaEl={() => paused} />);

        const [player] = getPlayers();
        expect(player.play).toHaveBeenCalledTimes(1);
      });
    });

    // React StrictMode (the App Router default, active on the dev server)
    // replays a new component's effects: effect, cleanup, effect. The handoff
    // is one-shot, so the player that is live after the replay must still be
    // the one built on the primed element. A supplier that returns the element
    // on every call cannot show a lost handoff (#841), so these cases take it
    // through the real hook.
    describe('under the StrictMode effect replay', () => {
      const SRC = 'https://cdn.example.com/clip.mp4?sig=abc';

      const renderPrimedSurface = (): {
        primed: HTMLVideoElement | undefined;
        unmount: () => void;
      } => {
        const { result } = renderHook(() => usePrimedMediaHandoff());
        result.current.primeMediaEl(SRC);
        const taken: HTMLVideoElement[] = [];
        const takeMediaEl = (): HTMLVideoElement | null => {
          const el = result.current.takeMediaEl();
          if (el) taken.push(el);
          return el;
        };

        const { unmount } = render(
          <StrictMode>
            <VideoPlayerSurface title="Live" src={SRC} takeMediaEl={takeMediaEl} />
          </StrictMode>
        );

        return { primed: taken[0], unmount };
      };

      /** The players video.js built on `el`, in creation order. */
      const getPlayersHolding = (el: HTMLVideoElement | undefined): FakePlayer[] =>
        getPlayers().filter((_, index) => vi.mocked(videojs).mock.calls.at(index)?.[0] === el);

      it('builds the live player on the primed element', () => {
        const { primed } = renderPrimedSurface();

        expect(vi.mocked(videojs).mock.calls.at(-1)?.[0]).toBe(primed);
      });

      it('leaves the primed element its source', () => {
        const { primed } = renderPrimedSurface();

        expect(primed?.getAttribute('src')).toBe(SRC);
      });

      it('leaves the primed element connected to the document', () => {
        const { primed } = renderPrimedSurface();

        expect(primed?.isConnected).toBe(true);
      });

      it('never disposes a player holding the primed element', () => {
        const { primed } = renderPrimedSurface();

        const disposals = getPlayersHolding(primed).map(
          (player) => player.dispose.mock.calls.length
        );
        expect(disposals).toEqual([0]);
      });

      it('keeps the playback claim of the playing primed element', () => {
        const { primed } = renderPrimedSurface();
        render(<VideoPlayerSurface title="Second" src="https://cdn.example.com/b.mp4" />);

        const [holder] = getPlayersHolding(primed);
        const second = getPlayers().at(-1);
        act(() => second?.trigger('play'));

        expect(holder?.pause).toHaveBeenCalledTimes(1);
      });

      it('leaves no player undisposed once unmounted', async () => {
        const { unmount } = renderPrimedSurface();

        unmount();
        await flushMicrotasks();

        const undisposed = getPlayers().filter((player) => player.dispose.mock.calls.length === 0);
        expect(undisposed).toHaveLength(0);
      });
    });

    it('creates its own element when the primed one was already taken', () => {
      render(
        <VideoPlayerSurface
          title="Live"
          src="https://cdn.example.com/clip.mp4"
          takeMediaEl={() => null}
        />
      );

      expect(vi.mocked(videojs).mock.calls[0]?.[0]).toBeInstanceOf(HTMLVideoElement);
    });
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

  // Real video.js dispose() removes the data-vjs-player parent from the DOM,
  // so that parent must be created per player — if React rendered it, the run
  // after a dispose (a src change, e.g. a playlist advancing between videos)
  // would append into a detached node and the player would be invisible.
  it('mounts a live, document-attached player after a source change re-init', () => {
    const { rerender } = render(
      <VideoPlayerSurface title="Live" src="https://cdn.example.com/a.mp4" />
    );

    rerender(<VideoPlayerSurface title="Live" src="https://cdn.example.com/b.mp4" />);

    const el = vi.mocked(videojs).mock.calls[1]?.[0] as HTMLVideoElement;
    expect(el.isConnected).toBe(true);
  });

  it('disposes the previous player on a source change', () => {
    const { rerender } = render(
      <VideoPlayerSurface title="Live" src="https://cdn.example.com/a.mp4" />
    );
    const [previous] = getPlayers();

    rerender(<VideoPlayerSurface title="Live" src="https://cdn.example.com/b.mp4" />);

    expect(previous.dispose).toHaveBeenCalledTimes(1);
  });

  // The unmount cleanup hands the disposal to a microtask (so a StrictMode
  // effect replay can keep the player), hence the flush after each unmount.
  it('disposes the player on unmount', async () => {
    const { unmount } = render(
      <VideoPlayerSurface title="Live" src="https://cdn.example.com/clip.mp4" />
    );
    const [player] = getPlayers();

    unmount();
    await flushMicrotasks();

    expect(player.dispose).toHaveBeenCalledTimes(1);
  });

  it('releases playback on unmount so later claims no longer pause it', async () => {
    const { unmount } = render(
      <VideoPlayerSurface title="Live" src="https://cdn.example.com/clip.mp4" />
    );
    const [player] = getPlayers();
    act(() => player.trigger('play'));

    unmount();
    await flushMicrotasks();
    claimPlayback('someone-else', vi.fn());

    expect(player.pause).not.toHaveBeenCalled();
  });

  it('renders a friendly fallback when the player emits an error', () => {
    render(<VideoPlayerSurface title="Live" src="https://cdn.example.com/clip.mp4" />);
    const [player] = getPlayers();

    act(() => player.trigger('error'));

    expect(screen.getByText(/can.?t be played right now/i)).toBeInTheDocument();
  });

  it('still disposes safely on unmount after an error', async () => {
    const { unmount } = render(
      <VideoPlayerSurface title="Live" src="https://cdn.example.com/clip.mp4" />
    );
    const [player] = getPlayers();
    act(() => player.trigger('error'));

    unmount();
    await flushMicrotasks();

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
    usePlayerPrefs.getState().setPrefs({ volume: 0.35, muted: true });

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
