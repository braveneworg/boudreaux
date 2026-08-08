/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { renderHook } from '@testing-library/react';

import { usePlayerPrefs } from './use-player-prefs';
import { usePrimedMediaHandoff } from './use-primed-media-handoff';

const CLIP_URL = 'https://cdn.example.com/clip.mp4?sig=abc';

describe('usePrimedMediaHandoff', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    usePlayerPrefs.setState({ volume: 1, muted: false });
  });

  it('returns null before anything is primed', () => {
    const { result } = renderHook(() => usePrimedMediaHandoff());

    expect(result.current.takeMediaEl()).toBeNull();
  });

  it('primes a media element with load() and play()', () => {
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, 'play');
    const loadSpy = vi.spyOn(HTMLMediaElement.prototype, 'load');
    const { result } = renderHook(() => usePrimedMediaHandoff());

    result.current.primeMediaEl();

    expect(loadSpy).toHaveBeenCalledTimes(1);
    expect(playSpy).toHaveBeenCalledTimes(1);
  });

  it('hands the element off paused so the deferred play() fires a play event', () => {
    const { result } = renderHook(() => usePrimedMediaHandoff());

    result.current.primeMediaEl();
    const primed = result.current.takeMediaEl();

    // A sourceless gestured play() flips paused to false and fires the
    // element's ONLY play event before video.js attaches — leaving it unpaused
    // strands the player UI on the poster while audio plays underneath.
    expect(primed?.paused).toBe(true);
  });

  it('primes with the real source and leaves it playing for the handoff', () => {
    const { result } = renderHook(() => usePrimedMediaHandoff());

    result.current.primeMediaEl(CLIP_URL);
    const primed = result.current.takeMediaEl();

    // Playback must start INSIDE the gesture — a gestured play() with a real
    // source is allowed by every autoplay policy, unlike the surface's
    // deferred play(), which profiles/extensions can (and did) suppress.
    expect(primed?.getAttribute('src')).toBe(CLIP_URL);
    expect(primed?.paused).toBe(false);
  });

  it('applies the saved volume prefs to a source-primed element', () => {
    usePlayerPrefs.setState({ volume: 0.4, muted: true });
    const { result } = renderHook(() => usePrimedMediaHandoff());

    result.current.primeMediaEl(CLIP_URL);
    const primed = result.current.takeMediaEl();

    expect(primed?.volume).toBe(0.4);
    expect(primed?.muted).toBe(true);
  });

  it('stops a source-primed element when discarded before handoff', () => {
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause');
    const { result } = renderHook(() => usePrimedMediaHandoff());

    result.current.primeMediaEl(CLIP_URL);
    result.current.discardMediaEl();

    expect(pauseSpy).toHaveBeenCalled();
    expect(result.current.takeMediaEl()).toBeNull();
  });

  it('stops the previous unclaimed element when re-priming', () => {
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause');
    const { result } = renderHook(() => usePrimedMediaHandoff());

    result.current.primeMediaEl(CLIP_URL);
    pauseSpy.mockClear();
    result.current.primeMediaEl(CLIP_URL);
    const second = result.current.takeMediaEl();

    // The pause must land on the REPLACED element (ghost-audio guard), not on
    // the fresh one — a source-primed element hands off playing.
    expect(pauseSpy).toHaveBeenCalledTimes(1);
    expect(pauseSpy.mock.instances[0]).not.toBe(second);
  });

  it('hands off a primed inline-playback video element', () => {
    const { result } = renderHook(() => usePrimedMediaHandoff());

    result.current.primeMediaEl();
    const primed = result.current.takeMediaEl();

    expect(primed).toBeInstanceOf(HTMLVideoElement);
    expect(primed?.getAttribute('playsinline')).toBe('');
  });

  it('hands the primed element over only once', () => {
    const { result } = renderHook(() => usePrimedMediaHandoff());

    result.current.primeMediaEl();
    result.current.takeMediaEl();

    expect(result.current.takeMediaEl()).toBeNull();
  });

  it('replaces a previously primed element on a fresh prime', () => {
    const { result } = renderHook(() => usePrimedMediaHandoff());

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
    const { result } = renderHook(() => usePrimedMediaHandoff());

    expect(() => result.current.primeMediaEl()).not.toThrow();
  });
});
