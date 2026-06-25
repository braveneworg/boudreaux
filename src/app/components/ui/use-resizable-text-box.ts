/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

interface StartDimensions {
  width: number;
  height: number;
  startX: number;
  startY: number;
}

interface ResizeBounds {
  minWidth: number;
  maxWidth: number;
  minHeight: number;
  maxHeight: number;
}

interface UseResizableTextBoxParams extends ResizeBounds {
  width: number;
  height: number;
  rotation: number;
  onWidthChange: (width: number) => void;
  onHeightChange: (height: number) => void;
  onSelect?: () => void;
}

interface UseResizableTextBox {
  containerRef: React.RefObject<HTMLDivElement | null>;
  handleResizeStart: (e: React.MouseEvent | React.TouchEvent, direction: ResizeDirection) => void;
}

const clientPoint = (e: MouseEvent | TouchEvent): { x: number; y: number } =>
  'touches' in e
    ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
    : { x: e.clientX, y: e.clientY };

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

interface ResizeComputation {
  direction: ResizeDirection;
  start: StartDimensions;
  client: { x: number; y: number };
  container: HTMLElement;
  rotation: number;
  bounds: ResizeBounds;
}

/**
 * Computes the new (clamped) width/height percentages for a resize gesture,
 * transforming the pointer delta into the box's local (rotated) coordinate
 * space before applying it along the active resize direction.
 */
const computeResizedDimensions = ({
  direction,
  start,
  client,
  container,
  rotation,
  bounds,
}: ResizeComputation): { width: number; height: number } => {
  const containerRect = container.getBoundingClientRect();
  const deltaX = ((client.x - start.startX) / containerRect.width) * 100;
  const deltaY = ((client.y - start.startY) / containerRect.height) * 100;

  const rotationRad = (rotation * Math.PI) / 180;
  const cosR = Math.cos(rotationRad);
  const sinR = Math.sin(rotationRad);
  const localDeltaX = deltaX * cosR + deltaY * sinR;
  const localDeltaY = -deltaX * sinR + deltaY * cosR;

  let newWidth = start.width;
  let newHeight = start.height;
  if (direction.includes('e')) newWidth = start.width + localDeltaX * 2;
  if (direction.includes('w')) newWidth = start.width - localDeltaX * 2;
  if (direction.includes('s')) newHeight = start.height + localDeltaY * 2;
  if (direction.includes('n')) newHeight = start.height - localDeltaY * 2;

  return {
    width: Math.round(clamp(newWidth, bounds.minWidth, bounds.maxWidth)),
    height: Math.round(clamp(newHeight, bounds.minHeight, bounds.maxHeight)),
  };
};

/**
 * Subscribes the given resize move/end handlers to document mouse and touch
 * events, returning the matching cleanup function.
 */
const subscribeResizeListeners = (
  onMove: (e: MouseEvent | TouchEvent) => void,
  onEnd: () => void
): (() => void) => {
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onEnd);
  document.addEventListener('touchmove', onMove, { passive: false });
  document.addEventListener('touchend', onEnd);
  return () => {
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onEnd);
    document.removeEventListener('touchmove', onMove);
    document.removeEventListener('touchend', onEnd);
  };
};

/**
 * Encapsulates the resizable text box's resize gesture: tracking the active
 * direction and start dimensions, applying document-level move/end listeners,
 * and emitting clamped width/height changes.
 *
 * @returns the container ref to attach to the box and the `handleResizeStart`
 * handler to wire onto each resize handle.
 */
export const useResizableTextBox = ({
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
}: UseResizableTextBoxParams): UseResizableTextBox => {
  const [isResizing, setIsResizing] = useState(false);
  const [resizeDirection, setResizeDirection] = useState<ResizeDirection | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const startDimensionsRef = useRef<StartDimensions>({ width: 0, height: 0, startX: 0, startY: 0 });

  const handleResizeStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent, direction: ResizeDirection) => {
      e.preventDefault();
      e.stopPropagation();
      setIsResizing(true);
      setResizeDirection(direction);

      const point = clientPoint(e.nativeEvent);
      startDimensionsRef.current = { width, height, startX: point.x, startY: point.y };

      onSelect?.();
    },
    [width, height, onSelect]
  );

  const handleResizeMove = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!isResizing || !resizeDirection) return;
      e.preventDefault();

      const container = containerRef.current?.parentElement;
      if (!container) return;

      const next = computeResizedDimensions({
        direction: resizeDirection,
        start: startDimensionsRef.current,
        client: clientPoint(e),
        container,
        rotation,
        bounds: { minWidth, maxWidth, minHeight, maxHeight },
      });

      onWidthChange(next.width);
      onHeightChange(next.height);
    },
    [
      isResizing,
      resizeDirection,
      rotation,
      minWidth,
      maxWidth,
      minHeight,
      maxHeight,
      onWidthChange,
      onHeightChange,
    ]
  );

  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
    setResizeDirection(null);
  }, []);

  useEffect(() => {
    if (!isResizing) return;
    return subscribeResizeListeners(handleResizeMove, handleResizeEnd);
  }, [isResizing, handleResizeMove, handleResizeEnd]);

  return { containerRef, handleResizeStart };
};
