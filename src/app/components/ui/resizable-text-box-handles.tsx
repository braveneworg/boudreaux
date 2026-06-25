/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { cn } from '@/lib/utils';

import type { ResizeDirection } from './use-resizable-text-box';

const cursorMap: Record<ResizeDirection, string> = {
  n: 'ns-resize',
  s: 'ns-resize',
  e: 'ew-resize',
  w: 'ew-resize',
  ne: 'nesw-resize',
  nw: 'nwse-resize',
  se: 'nwse-resize',
  sw: 'nesw-resize',
};

interface ResizeHandleProps {
  direction: ResizeDirection;
  cursor: string;
  className: string;
  label: string;
  onResizeStart: (e: React.MouseEvent | React.TouchEvent, direction: ResizeDirection) => void;
}

const ResizeHandle = ({
  direction,
  cursor,
  className,
  label,
  onResizeStart,
}: ResizeHandleProps): React.JSX.Element => (
  <div
    role="button"
    tabIndex={-1}
    aria-label={label}
    className={className}
    onMouseDown={(e) => onResizeStart(e, direction)}
    onTouchStart={(e) => onResizeStart(e, direction)}
    style={{ cursor }}
  />
);

interface ResizableTextBoxHandlesProps {
  rotation: number;
  onResizeStart: (e: React.MouseEvent | React.TouchEvent, direction: ResizeDirection) => void;
  onRotateStart?: (e: React.MouseEvent | React.TouchEvent) => void;
}

/**
 * The eight edge/corner resize handles plus the optional rotation handle shown
 * when a {@link ResizableTextBox} is selected.
 */
export const ResizableTextBoxHandles = ({
  rotation,
  onResizeStart,
  onRotateStart,
}: ResizableTextBoxHandlesProps): React.JSX.Element => (
  <>
    {/* Edge handles */}
    <ResizeHandle
      direction="n"
      cursor={cursorMap.n}
      label="Resize from top edge"
      className="absolute -top-1 left-1/2 h-2 w-6 -translate-x-1/2 cursor-ns-resize rounded-sm bg-white/80 shadow-md hover:bg-white"
      onResizeStart={onResizeStart}
    />
    <ResizeHandle
      direction="s"
      cursor={cursorMap.s}
      label="Resize from bottom edge"
      className="absolute -bottom-1 left-1/2 h-2 w-6 -translate-x-1/2 cursor-ns-resize rounded-sm bg-white/80 shadow-md hover:bg-white"
      onResizeStart={onResizeStart}
    />
    <ResizeHandle
      direction="e"
      cursor={cursorMap.e}
      label="Resize from right edge"
      className="absolute top-1/2 -right-1 h-6 w-2 -translate-y-1/2 cursor-ew-resize rounded-sm bg-white/80 shadow-md hover:bg-white"
      onResizeStart={onResizeStart}
    />
    <ResizeHandle
      direction="w"
      cursor={cursorMap.w}
      label="Resize from left edge"
      className="absolute top-1/2 -left-1 h-6 w-2 -translate-y-1/2 cursor-ew-resize rounded-sm bg-white/80 shadow-md hover:bg-white"
      onResizeStart={onResizeStart}
    />

    {/* Corner handles */}
    <ResizeHandle
      direction="ne"
      cursor={cursorMap.ne}
      label="Resize from top-right corner"
      className="absolute -top-1.5 -right-1.5 h-3 w-3 cursor-nesw-resize rounded-sm bg-white/80 shadow-md hover:bg-white"
      onResizeStart={onResizeStart}
    />
    <ResizeHandle
      direction="nw"
      cursor={cursorMap.nw}
      label="Resize from top-left corner"
      className="absolute -top-1.5 -left-1.5 h-3 w-3 cursor-nwse-resize rounded-sm bg-white/80 shadow-md hover:bg-white"
      onResizeStart={onResizeStart}
    />
    <ResizeHandle
      direction="se"
      cursor={cursorMap.se}
      label="Resize from bottom-right corner"
      className="absolute -right-1.5 -bottom-1.5 h-3 w-3 cursor-nwse-resize rounded-sm bg-white/80 shadow-md hover:bg-white"
      onResizeStart={onResizeStart}
    />
    <ResizeHandle
      direction="sw"
      cursor={cursorMap.sw}
      label="Resize from bottom-left corner"
      className="absolute -bottom-1.5 -left-1.5 h-3 w-3 cursor-nesw-resize rounded-sm bg-white/80 shadow-md hover:bg-white"
      onResizeStart={onResizeStart}
    />

    {/* Rotation handle */}
    {onRotateStart && (
      <button
        type="button"
        className={cn(
          'absolute top-1/2 -right-6 flex h-5 w-5 -translate-y-1/2 cursor-grab items-center justify-center rounded-full bg-white/80 text-xs text-gray-700 shadow-md transition-colors hover:bg-white'
        )}
        onMouseDown={onRotateStart}
        onTouchStart={onRotateStart}
        title={`Rotate text (${rotation}°)`}
      >
        ↻
      </button>
    )}
  </>
);
