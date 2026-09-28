/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { act, fireEvent, render, screen } from '@testing-library/react';

import { SCROLL_QUIET_MS, usePointerHover } from './use-pointer-hover';

const START = new Date('2026-09-26T12:00:00Z');

const Probe = () => {
  const { isHovered, hoverProps } = usePointerHover();
  return (
    <button type="button" data-hovered={isHovered ? '' : undefined} {...hoverProps}>
      probe
    </button>
  );
};

interface MoveInit {
  clientX: number;
  clientY: number;
  pointerType?: string;
}

/** A pointer move that bubbles to the window, the way a real one does. */
const move = (target: Element, { clientX, clientY, pointerType = 'mouse' }: MoveInit): void => {
  fireEvent.pointerMove(target, { clientX, clientY, pointerType, bubbles: true });
};

describe('usePointerHover', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts unhovered', () => {
    render(<Probe />);

    expect(screen.getByRole('button')).not.toHaveAttribute('data-hovered');
  });

  it('hovers when the mouse moves over the element', () => {
    render(<Probe />);

    move(screen.getByRole('button'), { clientX: 10, clientY: 10 });

    expect(screen.getByRole('button')).toHaveAttribute('data-hovered');
  });

  it('ignores a move that reports the position the pointer already had', () => {
    render(<Probe />);
    move(document.body, { clientX: 40, clientY: 40 });

    move(screen.getByRole('button'), { clientX: 40, clientY: 40 });

    expect(screen.getByRole('button')).not.toHaveAttribute('data-hovered');
  });

  it('ignores touch pointers', () => {
    render(<Probe />);

    move(screen.getByRole('button'), { clientX: 12, clientY: 12, pointerType: 'touch' });

    expect(screen.getByRole('button')).not.toHaveAttribute('data-hovered');
  });

  it('clears when the pointer leaves', () => {
    render(<Probe />);
    move(screen.getByRole('button'), { clientX: 14, clientY: 14 });

    fireEvent.pointerLeave(screen.getByRole('button'));

    expect(screen.getByRole('button')).not.toHaveAttribute('data-hovered');
  });

  it('clears when the page scrolls', () => {
    render(<Probe />);
    move(screen.getByRole('button'), { clientX: 16, clientY: 16 });

    fireEvent.scroll(document);

    expect(screen.getByRole('button')).not.toHaveAttribute('data-hovered');
  });

  it('ignores moves while the page is still scrolling', () => {
    render(<Probe />);
    fireEvent.scroll(document);

    act(() => {
      vi.advanceTimersByTime(SCROLL_QUIET_MS - 1);
    });
    move(screen.getByRole('button'), { clientX: 18, clientY: 18 });

    expect(screen.getByRole('button')).not.toHaveAttribute('data-hovered');
  });

  it('hovers again once scrolling has settled and the mouse moves', () => {
    render(<Probe />);
    fireEvent.scroll(document);

    act(() => {
      vi.advanceTimersByTime(SCROLL_QUIET_MS);
    });
    move(screen.getByRole('button'), { clientX: 20, clientY: 20 });

    expect(screen.getByRole('button')).toHaveAttribute('data-hovered');
  });
});
