// @vitest-environment happy-dom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { act, renderHook } from '@testing-library/react';

import { useTrackNavigation } from './use-track-navigation';

const FILES = [{ id: 'f-1' }, { id: 'f-2' }, { id: 'f-3' }];

describe('useTrackNavigation', () => {
  it('starts on the first track by default', () => {
    const { result } = renderHook(() => useTrackNavigation(FILES, false));

    expect(result.current.currentIndex).toBe(0);
  });

  it('starts on the initial index when one is given', () => {
    const { result } = renderHook(() => useTrackNavigation(FILES, true, 2));

    expect(result.current.currentIndex).toBe(2);
  });

  it('advances from the initial index', () => {
    const { result } = renderHook(() => useTrackNavigation(FILES, true, 1));

    act(() => result.current.handleNextTrack(true));

    expect(result.current.currentIndex).toBe(2);
  });

  it('goes back from the initial index', () => {
    const { result } = renderHook(() => useTrackNavigation(FILES, true, 1));

    act(() => result.current.handlePreviousTrack(false));

    expect(result.current.currentIndex).toBe(0);
    expect(result.current.shouldAutoPlay).toBe(false);
  });

  it('selects a track by file id and plays it', () => {
    const { result } = renderHook(() => useTrackNavigation(FILES, false));

    act(() => result.current.handleFileSelect('f-3'));

    expect(result.current.currentIndex).toBe(2);
    expect(result.current.shouldAutoPlay).toBe(true);
  });

  it('ignores a file id that is not in the list', () => {
    const { result } = renderHook(() => useTrackNavigation(FILES, false, 1));

    act(() => result.current.handleFileSelect('missing'));

    expect(result.current.currentIndex).toBe(1);
  });

  it('advances when a track ends, and stops at the last', () => {
    const { result } = renderHook(() => useTrackNavigation(FILES, false, 1));

    act(() => result.current.handleTrackEnded());
    act(() => result.current.handleTrackEnded());

    expect(result.current.currentIndex).toBe(2);
  });

  it('goes no further than the first and the last track', () => {
    const first = renderHook(() => useTrackNavigation(FILES, false));
    act(() => first.result.current.handlePreviousTrack(true));

    const last = renderHook(() => useTrackNavigation(FILES, false, 2));
    act(() => last.result.current.handleNextTrack(true));

    expect([first.result.current.currentIndex, last.result.current.currentIndex]).toEqual([0, 2]);
  });
});
