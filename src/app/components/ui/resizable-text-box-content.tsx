/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { cn } from '@/lib/utils';

/**
 * The animated "marching ants" selection border, shown only when the box is
 * selected.
 */
export const MarchingAntsBorder = (): React.JSX.Element => (
  <div
    className="pointer-events-none absolute inset-0"
    style={{
      border: '1px dashed transparent',
      backgroundImage:
        'linear-gradient(90deg, #fff 50%, #000 50%), linear-gradient(90deg, #fff 50%, #000 50%), linear-gradient(0deg, #fff 50%, #000 50%), linear-gradient(0deg, #fff 50%, #000 50%)',
      backgroundRepeat: 'repeat-x, repeat-x, repeat-y, repeat-y',
      backgroundSize: '8px 1px, 8px 1px, 1px 8px, 1px 8px',
      backgroundPosition: '0 0, 0 100%, 0 0, 100% 0',
      animation: 'marching-ants 0.5s linear infinite',
    }}
  />
);

interface ResizableTextBoxContentProps {
  children: React.ReactNode;
  isDragging: boolean;
  isSelected: boolean;
  className?: string;
  textStyle?: React.CSSProperties;
  title?: string;
  onDragStart?: (e: React.MouseEvent | React.TouchEvent) => void;
  onDoubleClick?: () => void;
}

/**
 * The draggable content area of a resizable text box, rendering the centered
 * text and forwarding drag/double-click interactions.
 */
export const ResizableTextBoxContent = ({
  children,
  isDragging,
  isSelected,
  className,
  textStyle,
  title,
  onDragStart,
  onDoubleClick,
}: ResizableTextBoxContentProps): React.JSX.Element => (
  <div
    role="button"
    tabIndex={-1}
    aria-label="Drag to move text box"
    className={cn(
      'flex h-full w-full items-center justify-center',
      'cursor-grab transition-shadow select-none',
      isDragging && 'cursor-grabbing',
      !isSelected &&
        'hover:ring-2 hover:ring-white/50 hover:ring-offset-2 hover:ring-offset-transparent',
      className
    )}
    style={textStyle}
    onMouseDown={onDragStart}
    onTouchStart={onDragStart}
    onDoubleClick={onDoubleClick}
    title={title}
  >
    <span className="px-2 text-center" style={{ maxWidth: '100%', wordWrap: 'break-word' }}>
      {children}
    </span>
  </div>
);
