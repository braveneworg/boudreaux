/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { act, render, screen } from '@testing-library/react';

import { TimeRemaining } from '@/app/components/time-remaining';

describe('TimeRemaining', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-08T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders an initial Hh Mm label for a target ≥ 1 hour away', () => {
    render(<TimeRemaining resetsAtIso="2026-05-09T11:14:00Z" />);
    expect(screen.getByTestId('time-remaining')).toHaveTextContent('23h 14m');
  });

  it('ticks every second and switches units at the 1-minute boundary', () => {
    render(<TimeRemaining resetsAtIso="2026-05-08T12:01:01Z" />);
    expect(screen.getByTestId('time-remaining')).toHaveTextContent('1m');

    act(() => {
      vi.advanceTimersByTime(2_000);
    });
    expect(screen.getByTestId('time-remaining')).toHaveTextContent('59s');
  });

  it('clears the interval on unmount', () => {
    const clearSpy = vi.spyOn(globalThis, 'clearInterval');
    const { unmount } = render(<TimeRemaining resetsAtIso="2026-05-08T13:00:00Z" />);
    unmount();
    expect(clearSpy).toHaveBeenCalled();
  });

  it('renders 0s when the target is in the past', () => {
    render(<TimeRemaining resetsAtIso="2026-05-08T11:00:00Z" />);
    expect(screen.getByTestId('time-remaining')).toHaveTextContent('0s');
  });

  it('exposes id for aria-describedby and the ISO datetime attribute', () => {
    render(<TimeRemaining resetsAtIso="2026-05-08T13:00:00Z" id="cap-countdown" />);
    const el = screen.getByTestId('time-remaining');
    expect(el).toHaveAttribute('id', 'cap-countdown');
    expect(el).toHaveAttribute('datetime', '2026-05-08T13:00:00Z');
    expect(el).toHaveAttribute('role', 'timer');
  });

  it('renders 0s when resetsAtIso is not a valid date string', () => {
    render(<TimeRemaining resetsAtIso="not-a-date" />);
    expect(screen.getByTestId('time-remaining')).toHaveTextContent('0s');
  });
});
