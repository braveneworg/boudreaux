'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/utils';

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

type ResizeDirection = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';

/**
 * A resizable text box with marching ants border animation
 * Used in notification banner previews for positioning and sizing text overlays
 */
export function ResizableTextBox({
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
}: ResizableTextBoxProps) {
  const [isResizing, setIsResizing] = useState(false);
  const [resizeDirection, setResizeDirection] = useState<ResizeDirection | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const startDimensionsRef = useRef({ width: 0, height: 0, startX: 0, startY: 0 });

  /**
   * Handle resize start from a handle
   */
  const handleResizeStart = useCallback(
    (e: React.MouseEvent | React.TouchEvent, direction: ResizeDirection) => {
      e.preventDefault();
      e.stopPropagation();
      setIsResizing(true);
      setResizeDirection(direction);

      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      startDimensionsRef.current = {
        width,
        height,
        startX: clientX,
        startY: clientY,
      };

      onSelect?.();
    },
    [width, height, onSelect]
  );

  /**
   * Handle resize move
   */
  const handleResizeMove = useCallback(
    (e: MouseEvent | TouchEvent) => {
      if (!isResizing || !resizeDirection) return;

      e.preventDefault();

      const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
      const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

      const container = containerRef.current?.parentElement;
      if (!container) return;

      const containerRect = container.getBoundingClientRect();
      const containerWidth = containerRect.width;
      const containerHeight = containerRect.height;

      // Calculate the delta in percentage
      const deltaX = ((clientX - startDimensionsRef.current.startX) / containerWidth) * 100;
      const deltaY = ((clientY - startDimensionsRef.current.startY) / containerHeight) * 100;

      // Apply changes based on direction - accounting for rotation
      // For simplicity, we'll only resize without rotation adjustment for now
      const rotationRad = (rotation * Math.PI) / 180;
      const cosR = Math.cos(rotationRad);
      const sinR = Math.sin(rotationRad);

      // Transform delta to local coordinates
      const localDeltaX = deltaX * cosR + deltaY * sinR;
      const localDeltaY = -deltaX * sinR + deltaY * cosR;

      let newWidth = startDimensionsRef.current.width;
      let newHeight = startDimensionsRef.current.height;

      // Apply changes based on direction
      if (resizeDirection.includes('e')) {
        newWidth = startDimensionsRef.current.width + localDeltaX * 2;
      }
      if (resizeDirection.includes('w')) {
        newWidth = startDimensionsRef.current.width - localDeltaX * 2;
      }
      if (resizeDirection.includes('s')) {
        newHeight = startDimensionsRef.current.height + localDeltaY * 2;
      }
      if (resizeDirection.includes('n')) {
        newHeight = startDimensionsRef.current.height - localDeltaY * 2;
      }

      // Clamp values
      newWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      newHeight = Math.max(minHeight, Math.min(maxHeight, newHeight));

      onWidthChange(Math.round(newWidth));
      onHeightChange(Math.round(newHeight));
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

  /**
   * Handle resize end
   */
  const handleResizeEnd = useCallback(() => {
    setIsResizing(false);
    setResizeDirection(null);
  }, []);

  // Add document-level event listeners for resize
  useEffect(() => {
    if (isResizing) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
      document.addEventListener('touchmove', handleResizeMove, { passive: false });
      document.addEventListener('touchend', handleResizeEnd);
      return () => {
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
        document.removeEventListener('touchmove', handleResizeMove);
        document.removeEventListener('touchend', handleResizeEnd);
      };
    }
  }, [isResizing, handleResizeMove, handleResizeEnd]);

  /**
   * Handle click on box for selection
   */
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelect?.();
    },
    [onSelect]
  );

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

  return (
    <div
      ref={containerRef}
      className="absolute"
      style={{
        left: `${positionX}%`,
        top: `${positionY}%`,
        width: `${width}%`,
        height: `${height}%`,
        transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
      }}
      onClick={handleClick}
    >
      {/* Marching ants border - only shown when selected */}
      {isSelected && (
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
      )}

      {/* Content area */}
      <div
        className={cn(
          'flex h-full w-full items-center justify-center',
          'cursor-grab select-none transition-shadow',
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

      {/* Resize handles - only shown when selected */}
      {isSelected && (
        <>
          {/* Edge handles */}
          {/* North */}
          <div
            className="absolute -top-1 left-1/2 h-2 w-6 -translate-x-1/2 cursor-ns-resize rounded-sm bg-white/80 shadow-md hover:bg-white"
            onMouseDown={(e) => handleResizeStart(e, 'n')}
            onTouchStart={(e) => handleResizeStart(e, 'n')}
            style={{ cursor: cursorMap.n }}
          />
          {/* South */}
          <div
            className="absolute -bottom-1 left-1/2 h-2 w-6 -translate-x-1/2 cursor-ns-resize rounded-sm bg-white/80 shadow-md hover:bg-white"
            onMouseDown={(e) => handleResizeStart(e, 's')}
            onTouchStart={(e) => handleResizeStart(e, 's')}
            style={{ cursor: cursorMap.s }}
          />
          {/* East */}
          <div
            className="absolute -right-1 top-1/2 h-6 w-2 -translate-y-1/2 cursor-ew-resize rounded-sm bg-white/80 shadow-md hover:bg-white"
            onMouseDown={(e) => handleResizeStart(e, 'e')}
            onTouchStart={(e) => handleResizeStart(e, 'e')}
            style={{ cursor: cursorMap.e }}
          />
          {/* West */}
          <div
            className="absolute -left-1 top-1/2 h-6 w-2 -translate-y-1/2 cursor-ew-resize rounded-sm bg-white/80 shadow-md hover:bg-white"
            onMouseDown={(e) => handleResizeStart(e, 'w')}
            onTouchStart={(e) => handleResizeStart(e, 'w')}
            style={{ cursor: cursorMap.w }}
          />

          {/* Corner handles */}
          {/* Northeast */}
          <div
            className="absolute -right-1.5 -top-1.5 h-3 w-3 cursor-nesw-resize rounded-sm bg-white/80 shadow-md hover:bg-white"
            onMouseDown={(e) => handleResizeStart(e, 'ne')}
            onTouchStart={(e) => handleResizeStart(e, 'ne')}
            style={{ cursor: cursorMap.ne }}
          />
          {/* Northwest */}
          <div
            className="absolute -left-1.5 -top-1.5 h-3 w-3 cursor-nwse-resize rounded-sm bg-white/80 shadow-md hover:bg-white"
            onMouseDown={(e) => handleResizeStart(e, 'nw')}
            onTouchStart={(e) => handleResizeStart(e, 'nw')}
            style={{ cursor: cursorMap.nw }}
          />
          {/* Southeast */}
          <div
            className="absolute -bottom-1.5 -right-1.5 h-3 w-3 cursor-nwse-resize rounded-sm bg-white/80 shadow-md hover:bg-white"
            onMouseDown={(e) => handleResizeStart(e, 'se')}
            onTouchStart={(e) => handleResizeStart(e, 'se')}
            style={{ cursor: cursorMap.se }}
          />
          {/* Southwest */}
          <div
            className="absolute -bottom-1.5 -left-1.5 h-3 w-3 cursor-nesw-resize rounded-sm bg-white/80 shadow-md hover:bg-white"
            onMouseDown={(e) => handleResizeStart(e, 'sw')}
            onTouchStart={(e) => handleResizeStart(e, 'sw')}
            style={{ cursor: cursorMap.sw }}
          />

          {/* Rotation handle */}
          {onRotateStart && (
            <button
              type="button"
              className={cn(
                'absolute -right-6 top-1/2 flex h-5 w-5 -translate-y-1/2 cursor-grab items-center justify-center rounded-full bg-white/80 text-xs text-gray-700 shadow-md transition-colors hover:bg-white'
              )}
              onMouseDown={onRotateStart}
              onTouchStart={onRotateStart}
              title={`Rotate text (${rotation}°)`}
            >
              ↻
            </button>
          )}
        </>
      )}
    </div>
  );
}
