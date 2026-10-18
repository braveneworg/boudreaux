/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { renderHook } from '@testing-library/react';

import { claimPlayback, releasePlayback } from '@/app/components/ui/playback-session';

import { usePlayerPrefs } from './use-player-prefs';
import { usePrimedMediaHandoff } from './use-primed-media-handoff';

const TRACK_URL = 'https://cdn.example.com/releases/r1/tracks/01.mp3';
const CLIP_URL = 'https://cdn.example.com/clip.mp4?sig=abc';

/** Other players' claims on the app-wide playback session. */
const PREVIOUS_PLAYER = 'previous-player';
const ADOPTING_PLAYER = 'adopting-player';
const NEXT_PLAYER = 'next-player';

describe('usePrimedMediaHandoff', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    usePlayerPrefs.setState({ volume: 1, muted: false });
    [PREVIOUS_PLAYER, ADOPTING_PLAYER, NEXT_PLAYER].forEach(releasePlayback);
  });

  // A release's track primes an <audio>, a video an inline <video>; past the
  // element they are the same mechanism.
  describe.each([
    { kind: 'audio', src: TRACK_URL, element: HTMLAudioElement },
    { kind: 'video', src: CLIP_URL, element: HTMLVideoElement },
  ] as const)('priming $kind', ({ kind, src, element }) => {
    it('returns null before anything is primed', () => {
      const { result } = renderHook(() => usePrimedMediaHandoff(kind));

      expect(result.current.takeMediaEl()).toBeNull();
    });

    it('primes an element of its kind with the real source and leaves it playing', () => {
      const { result } = renderHook(() => usePrimedMediaHandoff(kind));

      result.current.primeMediaEl(src);
      const primed = result.current.takeMediaEl();

      // Playback must start INSIDE the gesture — a gestured play() with a real
      // source is allowed by every autoplay policy, unlike the player's
      // deferred play(), which strict profiles and extensions can suppress.
      expect(primed).toBeInstanceOf(element);
      expect(primed?.getAttribute('src')).toBe(src);
      expect(primed?.paused).toBe(false);
    });

    it('applies the saved volume prefs to a source-primed element', () => {
      usePlayerPrefs.setState({ volume: 0.4, muted: true });
      const { result } = renderHook(() => usePrimedMediaHandoff(kind));

      result.current.primeMediaEl(src);
      const primed = result.current.takeMediaEl();

      expect(primed?.volume).toBe(0.4);
      expect(primed?.muted).toBe(true);
    });

    it('stops a source-primed element when discarded before handoff', () => {
      const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause');
      const { result } = renderHook(() => usePrimedMediaHandoff(kind));

      result.current.primeMediaEl(src);
      result.current.discardMediaEl();

      expect(pauseSpy).toHaveBeenCalledTimes(1);
      expect(pauseSpy.mock.instances[0]).not.toHaveAttribute('src');
      expect(result.current.takeMediaEl()).toBeNull();
    });

    it('stops the previous untaken element when re-priming', () => {
      const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause');
      const { result } = renderHook(() => usePrimedMediaHandoff(kind));

      result.current.primeMediaEl(src);
      pauseSpy.mockClear();
      result.current.primeMediaEl(src);
      const second = result.current.takeMediaEl();

      // The pause must land on the REPLACED element (ghost-audio guard), not on
      // the fresh one — a source-primed element hands off playing.
      expect(pauseSpy).toHaveBeenCalledTimes(1);
      expect(pauseSpy.mock.instances[0]).not.toBe(second);
    });

    it('hands the primed element over only once', () => {
      const { result } = renderHook(() => usePrimedMediaHandoff(kind));

      result.current.primeMediaEl(src);
      result.current.takeMediaEl();

      expect(result.current.takeMediaEl()).toBeNull();
    });

    it('stops an untaken primed element when the owner unmounts', () => {
      const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause');
      const { result, unmount } = renderHook(() => usePrimedMediaHandoff(kind));

      result.current.primeMediaEl(src);
      unmount();

      // An owner that goes away before the player mounted (a navigation)
      // must not leave gesture-started playback going with no UI attached.
      expect(pauseSpy).toHaveBeenCalledTimes(1);
    });

    it('leaves a taken element playing when the owner unmounts', () => {
      const { result, unmount } = renderHook(() => usePrimedMediaHandoff(kind));

      result.current.primeMediaEl(src);
      const primed = result.current.takeMediaEl();
      const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause');
      unmount();

      expect(primed?.paused).toBe(false);
      expect(pauseSpy).not.toHaveBeenCalled();
    });

    it('swallows a rejected priming play() so the gesture never throws', () => {
      vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() =>
        Promise.reject(new Error('autoplay suppressed'))
      );
      const { result } = renderHook(() => usePrimedMediaHandoff(kind));

      expect(() => result.current.primeMediaEl(src)).not.toThrow();
    });

    // The playback session: at most one player is audible. A source prime is
    // audible from the click, so it claims the session then, not once the
    // player that adopts it is ready.
    describe('and the playback session', () => {
      it('pauses whoever held the session when priming with a source', () => {
        const pausePrevious = vi.fn();
        claimPlayback(PREVIOUS_PLAYER, pausePrevious);
        const { result } = renderHook(() => usePrimedMediaHandoff(kind));

        result.current.primeMediaEl(src);

        expect(pausePrevious).toHaveBeenCalledTimes(1);
      });

      it('is paused by a player that claims the session before the handoff', () => {
        const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause');
        const { result } = renderHook(() => usePrimedMediaHandoff(kind));

        result.current.primeMediaEl(src);
        claimPlayback(NEXT_PLAYER, vi.fn());

        expect(pauseSpy).toHaveBeenCalledTimes(1);
        expect(result.current.takeMediaEl()).toBe(pauseSpy.mock.instances[0]);
      });

      it('gives up its claim on the handoff, so the adopting player never pauses it', () => {
        const { result } = renderHook(() => usePrimedMediaHandoff(kind));

        result.current.primeMediaEl(src);
        const primed = result.current.takeMediaEl();
        const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause');
        claimPlayback(ADOPTING_PLAYER, () => primed?.pause());

        expect(pauseSpy).not.toHaveBeenCalled();
      });

      it('gives up its claim when discarded', () => {
        const { result } = renderHook(() => usePrimedMediaHandoff(kind));

        result.current.primeMediaEl(src);
        result.current.discardMediaEl();
        const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause');
        claimPlayback(NEXT_PLAYER, vi.fn());

        expect(pauseSpy).not.toHaveBeenCalled();
      });

      it('gives up its claim when the owner unmounts', () => {
        const { result, unmount } = renderHook(() => usePrimedMediaHandoff(kind));

        result.current.primeMediaEl(src);
        unmount();
        const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause');
        claimPlayback(NEXT_PLAYER, vi.fn());

        expect(pauseSpy).not.toHaveBeenCalled();
      });
    });
  });

  it('gives a source-primed video inline playback', () => {
    const { result } = renderHook(() => usePrimedMediaHandoff('video'));

    result.current.primeMediaEl(CLIP_URL);

    expect(result.current.takeMediaEl()?.getAttribute('playsinline')).toBe('');
  });

  describe('a sourceless video prime', () => {
    it('primes the element with load() and play()', () => {
      const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play');
      const loadSpy = vi.spyOn(HTMLMediaElement.prototype, 'load');
      const { result } = renderHook(() => usePrimedMediaHandoff('video'));

      result.current.primeMediaEl();

      expect(loadSpy).toHaveBeenCalledTimes(1);
      expect(playSpy).toHaveBeenCalledTimes(1);
    });

    it('hands the element off paused so the deferred play() fires a play event', () => {
      const { result } = renderHook(() => usePrimedMediaHandoff('video'));

      result.current.primeMediaEl();
      const primed = result.current.takeMediaEl();

      // A sourceless gestured play() flips paused to false and fires the
      // element's ONLY play event before video.js attaches — leaving it unpaused
      // strands the player UI on the poster while audio plays underneath.
      expect(primed?.paused).toBe(true);
    });

    it('hands off an inline-playback video element', () => {
      const { result } = renderHook(() => usePrimedMediaHandoff('video'));

      result.current.primeMediaEl();
      const primed = result.current.takeMediaEl();

      expect(primed).toBeInstanceOf(HTMLVideoElement);
      expect(primed?.getAttribute('playsinline')).toBe('');
    });

    it('claims nothing: a paused element is not audible', () => {
      const pausePrevious = vi.fn();
      claimPlayback(PREVIOUS_PLAYER, pausePrevious);
      const { result } = renderHook(() => usePrimedMediaHandoff('video'));

      result.current.primeMediaEl();

      expect(pausePrevious).not.toHaveBeenCalled();
    });

    it('replaces a previously primed element on a fresh prime', () => {
      const { result } = renderHook(() => usePrimedMediaHandoff('video'));

      result.current.primeMediaEl();
      const first = result.current.takeMediaEl();
      result.current.primeMediaEl();
      const second = result.current.takeMediaEl();

      expect(second).toBeInstanceOf(HTMLVideoElement);
      expect(second).not.toBe(first);
    });

    it('swallows a rejected priming play() so the gesture never throws', () => {
      vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() =>
        Promise.reject(new Error('no source'))
      );
      const { result } = renderHook(() => usePrimedMediaHandoff('video'));

      expect(() => result.current.primeMediaEl()).not.toThrow();
    });
  });
});
