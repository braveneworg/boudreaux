/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback } from 'react';

import { MarchingAntsBorder, ResizableTextBoxContent } from './resizable-text-box-content';
import { ResizableTextBoxHandles } from './resizable-text-box-handles';
import { useResizableTextBox } from './use-resizable-text-box';

export interface ResizableTextBoxProps {
  /** Content to render inside the box */
  children: React.ReactNode;
  /** Current width as percentage (0-100) */
  width: number;
  /** Current height as percentage (0-100) */
  height: number;
  /** Callback when width changes */
  onWidthChange: (width: number) => void;
  /** Callback when height changes */
  onHeightChange: (height: number) => void;
  /** Position X as percentage (0-100) */
  positionX: number;
  /** Position Y as percentage (0-100) */
  positionY: number;
  /** Rotation in degrees */
  rotation: number;
  /** Whether the box is currently being dragged */
  isDragging?: boolean;
  /** Handler for drag start */
  onDragStart?: (e: React.MouseEvent | React.TouchEvent) => void;
  /** Handler for rotation start */
  onRotateStart?: (e: React.MouseEvent | React.TouchEvent) => void;
  /** Additional class names */
  className?: string;
  /** Title/tooltip for the box */
  title?: string;
  /** Handler for double click */
  onDoubleClick?: () => void;
  /** Text styles to apply */
  textStyle?: React.CSSProperties;
  /** Whether the box is selected/focused */
  isSelected?: boolean;
  /** Callback when selection changes */
  onSelect?: () => void;
  /** Minimum width percentage */
  minWidth?: number;
  /** Maximum width percentage */
  maxWidth?: number;
  /** Minimum height percentage */
  minHeight?: number;
  /** Maximum height percentage */
  maxHeight?: number;
}

/**
 * A resizable text box with marching ants border animation
 * Used in notification banner previews for positioning and sizing text overlays
 */
export const ResizableTextBox = ({
  children,
  width,
  height,
  onWidthChange,
  onHeightChange,
  positionX,
  positionY,
  rotation,
  isDragging = false,
  onDragStart,
  onRotateStart,
  className,
  title,
  onDoubleClick,
  textStyle,
  isSelected = false,
  onSelect,
  minWidth = 10,
  maxWidth = 100,
  minHeight = 5,
  maxHeight = 100,
}: ResizableTextBoxProps): React.JSX.Element => {
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

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect?.();
    },
    [onSelect]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        event.stopPropagation();
        onSelect?.();
      }
    },
    [onSelect]
  );

  return (
    <div
      ref={containerRef}
      role="button"
      tabIndex={0}
      className="absolute"
      style={{
        left: `${positionX}%`,
        top: `${positionY}%`,
        width: `${width}%`,
        height: `${height}%`,
        transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
      }}
      onClick={handleClick}
      onKeyDown={handleKeyDown}
    >
      {isSelected && <MarchingAntsBorder />}

      <ResizableTextBoxContent
        isDragging={isDragging}
        isSelected={isSelected}
        className={className}
        textStyle={textStyle}
        title={title}
        onDragStart={onDragStart}
        onDoubleClick={onDoubleClick}
      >
        {children}
      </ResizableTextBoxContent>

      {isSelected && (
        <ResizableTextBoxHandles
          rotation={rotation}
          onResizeStart={handleResizeStart}
          onRotateStart={onRotateStart}
        />
      )}
    </div>
  );
};
