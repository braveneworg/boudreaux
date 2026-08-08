/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { renderHook } from '@testing-library/react';

import { usePlayerPrefs } from './use-player-prefs';
import { usePrimedAudioHandoff } from './use-primed-audio-handoff';

const TRACK_URL = 'https://cdn.example.com/releases/r1/tracks/01.mp3';

describe('usePrimedAudioHandoff', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    usePlayerPrefs.setState({ volume: 1, muted: false });
  });

  it('returns null before anything is primed', () => {
    const { result } = renderHook(() => usePrimedAudioHandoff());

    expect(result.current.takeMediaEl()).toBeNull();
  });

  it('primes an audio element with the real source and leaves it playing', () => {
    const { result } = renderHook(() => usePrimedAudioHandoff());

    result.current.primeMediaEl(TRACK_URL);
    const primed = result.current.takeMediaEl();

    // Playback must start INSIDE the gesture — a gestured play() with a real
    // source is allowed by every autoplay policy, unlike the player's
    // deferred play(), which strict profiles/extensions can suppress.
    expect(primed).toBeInstanceOf(HTMLAudioElement);
    expect(primed?.getAttribute('src')).toBe(TRACK_URL);
    expect(primed?.paused).toBe(false);
  });

  it('applies the saved volume prefs to the primed element', () => {
    usePlayerPrefs.setState({ volume: 0.4, muted: true });
    const { result } = renderHook(() => usePrimedAudioHandoff());

    result.current.primeMediaEl(TRACK_URL);
    const primed = result.current.takeMediaEl();

    expect(primed?.volume).toBe(0.4);
    expect(primed?.muted).toBe(true);
  });

  it('stops a primed element when discarded before handoff', () => {
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause');
    const { result } = renderHook(() => usePrimedAudioHandoff());

    result.current.primeMediaEl(TRACK_URL);
    result.current.discardMediaEl();

    expect(pauseSpy).toHaveBeenCalled();
    expect(result.current.takeMediaEl()).toBeNull();
  });

  it('stops the previous unclaimed element when re-priming', () => {
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause');
    const { result } = renderHook(() => usePrimedAudioHandoff());

    result.current.primeMediaEl(TRACK_URL);
    pauseSpy.mockClear();
    result.current.primeMediaEl(TRACK_URL);
    const second = result.current.takeMediaEl();

    // The pause must land on the REPLACED element (ghost-audio guard), not on
    // the fresh one — a source-primed element hands off playing.
    expect(pauseSpy).toHaveBeenCalledTimes(1);
    expect(pauseSpy.mock.instances[0]).not.toBe(second);
  });

  it('hands the primed element over only once', () => {
    const { result } = renderHook(() => usePrimedAudioHandoff());

    result.current.primeMediaEl(TRACK_URL);
    result.current.takeMediaEl();

    expect(result.current.takeMediaEl()).toBeNull();
  });

  it('swallows a rejected priming play() so the gesture never throws', () => {
    vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(() =>
      Promise.reject(new Error('autoplay suppressed'))
    );
    const { result } = renderHook(() => usePrimedAudioHandoff());

    expect(() => result.current.primeMediaEl(TRACK_URL)).not.toThrow();
  });
});
