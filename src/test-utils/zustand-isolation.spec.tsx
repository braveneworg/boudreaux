/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { create } from 'zustand';

interface CounterState {
  count: number;
  increment: () => void;
}

// Module-level store — the exact shape production stores use. The
// __mocks__/zustand.ts auto-reset must restore it between tests; without
// that, whichever of the two store tests runs second fails.
const useCounter = create<CounterState>()((set) => ({
  count: 0,
  increment: () => set((state) => ({ count: state.count + 1 })),
}));

describe('zustand test isolation', () => {
  it('starts from initial state and mutates freely', () => {
    expect(useCounter.getState().count).toBe(0);
    useCounter.getState().increment();
    expect(useCounter.getState().count).toBe(1);
  });

  it('is reset to initial state between tests', () => {
    expect(useCounter.getState().count).toBe(0);
    useCounter.getState().increment();
    expect(useCounter.getState().count).toBe(1);
  });

  it('clears sessionStorage between tests (first probe)', () => {
    expect(sessionStorage.getItem('isolation-probe')).toBeNull();
    sessionStorage.setItem('isolation-probe', 'leak');
    expect(sessionStorage.getItem('isolation-probe')).toBe('leak');
  });

  it('clears sessionStorage between tests (second probe)', () => {
    expect(sessionStorage.getItem('isolation-probe')).toBeNull();
    sessionStorage.setItem('isolation-probe', 'leak');
    expect(sessionStorage.getItem('isolation-probe')).toBe('leak');
  });

  it('clears localStorage between tests (first probe)', () => {
    expect(localStorage.getItem('isolation-probe')).toBeNull();
    localStorage.setItem('isolation-probe', 'leak');
    expect(localStorage.getItem('isolation-probe')).toBe('leak');
  });

  it('clears localStorage between tests (second probe)', () => {
    expect(localStorage.getItem('isolation-probe')).toBeNull();
    localStorage.setItem('isolation-probe', 'leak');
    expect(localStorage.getItem('isolation-probe')).toBe('leak');
  });
});
