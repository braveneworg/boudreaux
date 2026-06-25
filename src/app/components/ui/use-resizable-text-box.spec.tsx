/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { fireEvent, render } from '@testing-library/react';

import { useResizableTextBox, type ResizeDirection } from './use-resizable-text-box';

interface HarnessProps {
  width?: number;
  height?: number;
  rotation?: number;
  minWidth?: number;
  maxWidth?: number;
  minHeight?: number;
  maxHeight?: number;
  direction: ResizeDirection;
  onWidthChange: (width: number) => void;
  onHeightChange: (height: number) => void;
  onSelect?: () => void;
}

/**
 * Minimal harness that mounts the hook with a real, sized parent element so the
 * resize geometry (which reads the parent's bounding rect) can be exercised.
 */
const Harness = ({
  width = 50,
  height = 50,
  rotation = 0,
  minWidth = 10,
  maxWidth = 100,
  minHeight = 5,
  maxHeight = 100,
  direction,
  onWidthChange,
  onHeightChange,
  onSelect,
}: HarnessProps): React.JSX.Element => {
  const { containerRef, handleResizeStart } = useResizableTextBox({
    width,
    height,
    rotation,
    onWidthChange,
    onHeightChange,
    onSelect,
    minWidth,
    maxWidth,
    minHeight,
    maxHeight,
  });

  return (
    <div data-testid="parent">
      <div ref={containerRef} data-testid="box">
        <button
          type="button"
          data-testid="handle"
          onMouseDown={(e) => handleResizeStart(e, direction)}
        >
          handle
        </button>
      </div>
    </div>
  );
};

// jsdom has no layout: stub the parent's bounding rect to a fixed 100×100 px box
// so percentage deltas are computable (1px == 1%).
const stubParentRect = (): void => {
  Object.defineProperty(HTMLElement.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      width: 100,
      height: 100,
      top: 0,
      left: 0,
      right: 100,
      bottom: 100,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }),
  });
};

describe('useResizableTextBox', () => {
  const onWidthChange = vi.fn();
  const onHeightChange = vi.fn();

  beforeEach(() => {
    stubParentRect();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('selects the box when a resize starts', () => {
    const onSelect = vi.fn();
    const { getByTestId } = render(
      <Harness
        direction="e"
        onWidthChange={onWidthChange}
        onHeightChange={onHeightChange}
        onSelect={onSelect}
      />
    );

    fireEvent.mouseDown(getByTestId('handle'), { clientX: 0, clientY: 0 });

    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('increases width when dragging the east handle to the right', () => {
    const { getByTestId } = render(
      <Harness direction="e" onWidthChange={onWidthChange} onHeightChange={onHeightChange} />
    );

    // Start at width 50, drag +10px right. delta = 10% of 100px, applied ×2 → +20.
    fireEvent.mouseDown(getByTestId('handle'), { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(document, { clientX: 10, clientY: 0 });

    expect(onWidthChange).toHaveBeenLastCalledWith(70);
  });

  it('increases height when dragging the south handle downward', () => {
    const { getByTestId } = render(
      <Harness direction="s" onWidthChange={onWidthChange} onHeightChange={onHeightChange} />
    );

    fireEvent.mouseDown(getByTestId('handle'), { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(document, { clientX: 0, clientY: 10 });

    expect(onHeightChange).toHaveBeenLastCalledWith(70);
  });

  it('clamps width to the maximum', () => {
    const { getByTestId } = render(
      <Harness
        direction="e"
        maxWidth={60}
        onWidthChange={onWidthChange}
        onHeightChange={onHeightChange}
      />
    );

    // +30px → +60 would be 110, clamped to maxWidth 60.
    fireEvent.mouseDown(getByTestId('handle'), { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(document, { clientX: 30, clientY: 0 });

    expect(onWidthChange).toHaveBeenLastCalledWith(60);
  });

  it('clamps width to the minimum when dragging the west handle inward', () => {
    const { getByTestId } = render(
      <Harness
        direction="w"
        minWidth={40}
        onWidthChange={onWidthChange}
        onHeightChange={onHeightChange}
      />
    );

    // West + drag right shrinks width; large delta clamps to minWidth 40.
    fireEvent.mouseDown(getByTestId('handle'), { clientX: 0, clientY: 0 });
    fireEvent.mouseMove(document, { clientX: 30, clientY: 0 });

    expect(onWidthChange).toHaveBeenLastCalledWith(40);
  });

  it('stops emitting changes after the resize ends', () => {
    const { getByTestId } = render(
      <Harness direction="e" onWidthChange={onWidthChange} onHeightChange={onHeightChange} />
    );

    fireEvent.mouseDown(getByTestId('handle'), { clientX: 0, clientY: 0 });
    fireEvent.mouseUp(document);
    onWidthChange.mockClear();

    fireEvent.mouseMove(document, { clientX: 50, clientY: 0 });

    expect(onWidthChange).not.toHaveBeenCalled();
  });
});
