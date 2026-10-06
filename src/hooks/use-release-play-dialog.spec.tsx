/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { act, renderHook } from '@testing-library/react';

import { useReleasePlayDialog } from './use-release-play-dialog';

const TRACK_URL = 'https://cdn.example.com/releases/r1/tracks/01.mp3';

describe('useReleasePlayDialog', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('starts closed with nothing primed and no prefetch', () => {
    const { result } = renderHook(() => useReleasePlayDialog(TRACK_URL));

    expect(result.current.playerOpen).toBe(false);
    expect(result.current.prefetchPlayer).toBe(false);
    expect(result.current.takeMediaEl()).toBeNull();
  });

  it('primes the first track and opens the dialog inside the play gesture', () => {
    const { result } = renderHook(() => useReleasePlayDialog(TRACK_URL));

    act(() => result.current.openPlayer());

    expect(result.current.playerOpen).toBe(true);
    const primed = result.current.takeMediaEl();
    expect(primed?.getAttribute('src')).toBe(TRACK_URL);
    expect(primed?.paused).toBe(false);
  });

  it('does nothing when the release has no playable track', () => {
    const { result } = renderHook(() => useReleasePlayDialog(null));

    act(() => result.current.openPlayer());

    expect(result.current.playerOpen).toBe(false);
    expect(result.current.takeMediaEl()).toBeNull();
  });

  it('discards an unclaimed primed element when the dialog closes', () => {
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause');
    const { result } = renderHook(() => useReleasePlayDialog(TRACK_URL));

    act(() => result.current.openPlayer());
    act(() => result.current.handlePlayerOpenChange(false));

    expect(result.current.playerOpen).toBe(false);
    expect(pauseSpy).toHaveBeenCalled();
    expect(result.current.takeMediaEl()).toBeNull();
  });

  it('keeps a claimed element alone when the dialog closes', () => {
    const { result } = renderHook(() => useReleasePlayDialog(TRACK_URL));

    act(() => result.current.openPlayer());
    const primed = result.current.takeMediaEl();
    const pauseSpy = vi.spyOn(HTMLMediaElement.prototype, 'pause');
    act(() => result.current.handlePlayerOpenChange(false));

    expect(primed).not.toBeNull();
    expect(pauseSpy).not.toHaveBeenCalled();
  });

  it('warms the release-detail fetch on intent', () => {
    const { result } = renderHook(() => useReleasePlayDialog(TRACK_URL));

    act(() => result.current.warmPlayer());

    expect(result.current.prefetchPlayer).toBe(true);
  });
});
