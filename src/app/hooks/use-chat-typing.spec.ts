// @vitest-environment jsdom
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { act, renderHook } from '@testing-library/react';

import { useChatTyping } from './use-chat-typing';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('useChatTyping', () => {
  it('starts with no active typers', () => {
    const { result } = renderHook(() => useChatTyping('user-1'));
    expect(result.current.activeTypers).toEqual([]);
  });

  it('registers an active typer when noteTyping is called', () => {
    const { result } = renderHook(() => useChatTyping('user-1'));

    act(() => result.current.noteTyping({ userId: 'user-2', username: 'cat' }));

    expect(result.current.activeTypers).toEqual([{ userId: 'user-2', username: 'cat' }]);
  });

  it('ignores typing events from the current user', () => {
    const { result } = renderHook(() => useChatTyping('user-1'));

    act(() => result.current.noteTyping({ userId: 'user-1', username: 'me' }));

    expect(result.current.activeTypers).toEqual([]);
  });

  it('deduplicates repeat typing events from the same user (one entry, refreshed TTL)', () => {
    const { result } = renderHook(() => useChatTyping('user-1'));

    act(() => result.current.noteTyping({ userId: 'user-2', username: 'cat' }));
    act(() => result.current.noteTyping({ userId: 'user-2', username: 'cat' }));

    expect(result.current.activeTypers).toEqual([{ userId: 'user-2', username: 'cat' }]);
  });

  it('clears typers after the 3s TTL elapses', () => {
    const { result } = renderHook(() => useChatTyping('user-1'));

    act(() => result.current.noteTyping({ userId: 'user-2', username: 'cat' }));
    expect(result.current.activeTypers).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(3500);
    });

    expect(result.current.activeTypers).toEqual([]);
  });

  it('prunes only the expired typer and keeps the still-active one', () => {
    const { result } = renderHook(() => useChatTyping('me'));

    // First typer starts the clock.
    act(() => result.current.noteTyping({ userId: 'user-2', username: 'cat' }));
    // A second typer arrives 2s later, so its TTL outlives the first.
    act(() => vi.advanceTimersByTime(2000));
    act(() => result.current.noteTyping({ userId: 'user-3', username: 'dog' }));

    // At 3.5s total the first typer (TTL expired at 3s) is pruned, but the
    // second (TTL expires at ~5s) survives — exercising the recompute map.
    act(() => vi.advanceTimersByTime(1500));

    expect(result.current.activeTypers).toEqual([{ userId: 'user-3', username: 'dog' }]);
  });

  it('ignores typing events with an empty userId', () => {
    const { result } = renderHook(() => useChatTyping('user-1'));

    act(() => result.current.noteTyping({ userId: '', username: 'ghost' }));

    expect(result.current.activeTypers).toEqual([]);
  });

  it('keeps a typer alive while events keep arriving inside the TTL', () => {
    const { result } = renderHook(() => useChatTyping('user-1'));

    act(() => result.current.noteTyping({ userId: 'user-2', username: 'cat' }));

    act(() => vi.advanceTimersByTime(2000));
    act(() => result.current.noteTyping({ userId: 'user-2', username: 'cat' }));
    act(() => vi.advanceTimersByTime(2000));

    // 4s elapsed but a refresh happened at 2s, so the entry is still active.
    expect(result.current.activeTypers).toHaveLength(1);
  });
});
