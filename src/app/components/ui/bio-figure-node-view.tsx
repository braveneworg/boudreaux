/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useRef, useState } from 'react';
import type { ChangeEvent, JSX, KeyboardEvent, PointerEvent } from 'react';

import { NodeViewWrapper } from '@tiptap/react';
import { AlignCenterVertical, AlignEndVertical, AlignStartVertical, Pencil, X } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Input } from '@/ui/input';

import {
  BIO_FIGURE_MAX_WIDTH,
  BIO_FIGURE_MIN_WIDTH,
  clampFigureWidth,
  classForFloat,
} from './bio-figure-extension';

import type { BioFigureAttributes, BioFigureFloat } from './bio-figure-extension';
import type { NodeViewProps } from '@tiptap/react';
import type { LucideIcon } from 'lucide-react';

const KEYBOARD_RESIZE_STEP = 5;

/** Editor-surface float preview — mirrors BioHtml's FIGURE_FLOAT_CLASSES so
 *  admins see the real wrap while editing. */
const FLOAT_PREVIEW_CLASSES: Record<BioFigureFloat, string> = {
  left: 'float-left [shape-outside:margin-box] mr-3 mb-2',
  right: 'float-right [shape-outside:margin-box] ml-3 mb-2',
  none: 'mx-auto mb-4',
};

const previewClassForFloat = (float: BioFigureFloat): string => {
  if (float === 'left') return FLOAT_PREVIEW_CLASSES.left;
  if (float === 'right') return FLOAT_PREVIEW_CLASSES.right;
  return FLOAT_PREVIEW_CLASSES.none;
};

interface FloatOption {
  value: BioFigureFloat;
  label: string;
  icon: LucideIcon;
}

const FLOAT_OPTIONS: FloatOption[] = [
  { value: 'left', label: 'Float left', icon: AlignStartVertical },
  { value: 'none', label: 'Center image', icon: AlignCenterVertical },
  { value: 'right', label: 'Float right', icon: AlignEndVertical },
];

interface DragState {
  startX: number;
  startWidth: number;
  parentWidth: number;
  /** +1 for right-edge corners (drag right widens), -1 for left-edge corners. */
  sign: number;
}

interface PointerPoint {
  x: number;
  y: number;
}

interface FigureResizeOptions {
  width: number;
  updateAttributes: NodeViewProps['updateAttributes'];
}

interface CornerPointerHandlers {
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerCancel: (event: PointerEvent<HTMLDivElement>) => void;
}

interface FigureResize {
  /** Pointer resize handlers for one corner; pass +1 for right-edge corners
   *  and -1 for left-edge corners so both widen when dragged outward. */
  cornerHandlers: (sign: number) => CornerPointerHandlers;
  /** Keyboard resize for the ARIA slider corner. */
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
  /** Two-finger pinch resize handlers for the image surface. */
  pinchHandlers: CornerPointerHandlers;
}

/** A non-keyboard corner: its width-delta sign and its placement classes. */
interface ResizeCorner {
  id: 'tl' | 'tr' | 'bl';
  sign: number;
  className: string;
}

/** The three pointer-only corners; the bottom-right corner is the ARIA slider,
 *  rendered separately so it stays the single keyboard-focusable handle. */
const SECONDARY_CORNERS: ResizeCorner[] = [
  { id: 'tl', sign: -1, className: '-top-1 -left-1 cursor-nwse-resize' },
  { id: 'tr', sign: 1, className: '-top-1 -right-1 cursor-nesw-resize' },
  { id: 'bl', sign: -1, className: '-bottom-1 -left-1 cursor-nesw-resize' },
];

/** Maps a slider key to the next width (ARIA slider pattern: arrows step by
 *  5, Home/End jump to the range bounds); `null` for unrelated keys. */
const nextWidthForKey = (key: string, width: number): number | null => {
  if (key === 'ArrowLeft') return clampFigureWidth(width - KEYBOARD_RESIZE_STEP);
  if (key === 'ArrowRight') return clampFigureWidth(width + KEYBOARD_RESIZE_STEP);
  if (key === 'Home') return BIO_FIGURE_MIN_WIDTH;
  if (key === 'End') return BIO_FIGURE_MAX_WIDTH;
  return null;
};

const distanceBetween = (a: PointerPoint, b: PointerPoint): number =>
  Math.hypot(a.x - b.x, a.y - b.y);

/** New figure width from a two-finger pinch: scale the width captured at pinch
 *  start by the ratio of the current finger distance to the starting distance,
 *  clamped to the 20–100% range. */
export const pinchWidth = (startWidth: number, startDistance: number, distance: number): number =>
  clampFigureWidth((startWidth * distance) / startDistance);

/**
 * Pointer, keyboard, and pinch resize logic for the figure. Corner pointer
 * drags are a clientX delta against the editor container's pixel width, signed
 * per corner so left corners widen when dragged outward; keyboard arrows step
 * by 5 with Home/End jumping to the bounds; a two-finger pinch on the image
 * scales width by the finger-distance ratio. Every path clamps to 20–100%.
 */
const useFigureResize = ({ width, updateAttributes }: FigureResizeOptions): FigureResize => {
  const dragRef = useRef<DragState | null>(null);
  const pointersRef = useRef<Map<number, PointerPoint>>(new Map());
  const pinchStartRef = useRef<{ startDistance: number; startWidth: number } | null>(null);

  const cornerHandlers = (sign: number): CornerPointerHandlers => ({
    onPointerDown: (event: PointerEvent<HTMLDivElement>): void => {
      const parent = event.currentTarget.closest('figure')?.parentElement;
      const parentWidth = parent?.getBoundingClientRect().width ?? 0;
      if (parentWidth <= 0) return;
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = { startX: event.clientX, startWidth: width, parentWidth, sign };
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>): void => {
      const drag = dragRef.current;
      if (!drag) return;
      const deltaPercent = ((event.clientX - drag.startX) / drag.parentWidth) * 100 * drag.sign;
      updateAttributes({ width: clampFigureWidth(drag.startWidth + deltaPercent) });
    },
    onPointerUp: (event: PointerEvent<HTMLDivElement>): void => {
      if (!dragRef.current) return;
      dragRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    },
    // A cancelled drag must clear dragRef too, or a later hover/touch would
    // commit a stale resize — teardown mirrors pointer-up.
    onPointerCancel: (event: PointerEvent<HTMLDivElement>): void => {
      if (!dragRef.current) return;
      dragRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
    },
  });

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const nextWidth = nextWidthForKey(event.key, width);
    if (nextWidth === null) return;
    event.preventDefault();
    updateAttributes({ width: nextWidth });
  };

  const pinchHandlers: CornerPointerHandlers = {
    onPointerDown: (event: PointerEvent<HTMLDivElement>): void => {
      // A corner drag owns the gesture — don't track it as a pinch finger too.
      if (dragRef.current) return;
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const [first, second] = [...pointersRef.current.values()];
      if (!first || !second) return;
      pinchStartRef.current = { startDistance: distanceBetween(first, second), startWidth: width };
      event.preventDefault();
    },
    onPointerMove: (event: PointerEvent<HTMLDivElement>): void => {
      if (!pointersRef.current.has(event.pointerId)) return;
      pointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
      const pinch = pinchStartRef.current;
      if (!pinch || pinch.startDistance <= 0) return;
      const [first, second] = [...pointersRef.current.values()];
      if (!first || !second) return;
      event.preventDefault();
      updateAttributes({
        width: pinchWidth(pinch.startWidth, pinch.startDistance, distanceBetween(first, second)),
      });
    },
    onPointerUp: (event: PointerEvent<HTMLDivElement>): void => {
      pointersRef.current.delete(event.pointerId);
      if (pointersRef.current.size < 2) pinchStartRef.current = null;
    },
    onPointerCancel: (event: PointerEvent<HTMLDivElement>): void => {
      pointersRef.current.delete(event.pointerId);
      if (pointersRef.current.size < 2) pinchStartRef.current = null;
    },
  };

  return { cornerHandlers, onKeyDown, pinchHandlers };
};

interface FigureCaptionProps {
  title: string | null;
  subtitle: string | null;
}

/** Caption lines below the image — fixed at 11px, never scaling with width. */
const FigureCaption = ({ title, subtitle }: FigureCaptionProps): JSX.Element | null => {
  if (!title && !subtitle) return null;
  return (
    <figcaption className="bio-figure-caption mt-1 space-y-0.5 text-[11px] leading-snug">
      {title ? <span className="bio-figure-title block font-medium">{title}</span> : null}
      {subtitle ? <span className="bio-figure-subtitle block">{subtitle}</span> : null}
    </figcaption>
  );
};

interface AttributionFieldProps {
  attribution: string | null;
  isEditable: boolean;
  updateAttributes: NodeViewProps['updateAttributes'];
}

/**
 * Displays the attribution line with an inline edit affordance when the editor
 * is editable. Pencil triggers a text input; Enter/blur commits (empty → null);
 * Escape cancels. Read-only when `isEditable` is false.
 */
const AttributionField = ({
  attribution,
  isEditable,
  updateAttributes,
}: AttributionFieldProps): JSX.Element | null => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  if (!isEditable && !attribution) return null;

  const handleEditStart = (): void => {
    setDraft(attribution ?? '');
    setEditing(true);
  };

  const handleCommit = (): void => {
    if (!editing) return;
    updateAttributes({ attribution: draft.trim() || null });
    setEditing(false);
  };

  const handleCancel = (): void => {
    setEditing(false);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCommit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCancel();
    }
  };

  if (editing) {
    return (
      <div className="mt-0.5">
        <Input
          ref={inputRef}
          aria-label="Attribution"
          maxLength={500}
          value={draft}
          onChange={(e: ChangeEvent<HTMLInputElement>) => setDraft(e.target.value)}
          onBlur={handleCommit}
          onKeyDown={handleKeyDown}
          className="h-6 text-[11px] leading-snug"
        />
      </div>
    );
  }

  return (
    <div className="mt-0.5 flex items-center gap-1 text-[11px] leading-snug">
      {attribution && (
        <span className="bio-figure-attribution text-muted-foreground">{attribution}</span>
      )}
      {isEditable && (
        <button
          type="button"
          aria-label="Edit attribution"
          onClick={handleEditStart}
          className={cn(
            'bg-background/80 text-foreground p-0.5 shadow-sm backdrop-blur-sm',
            'hover:bg-accent hover:text-accent-foreground',
            'opacity-0 transition-opacity',
            'group-hover:opacity-100 group-data-selected:opacity-100'
          )}
        >
          <Pencil className="size-3" aria-hidden="true" />
        </button>
      )}
    </div>
  );
};

interface FigureControlsProps {
  float: BioFigureFloat;
  updateAttributes: NodeViewProps['updateAttributes'];
  deleteNode: NodeViewProps['deleteNode'];
}

/** Hover/selection overlay: delete X (top-right) + float radio-group buttons. */
const FigureControls = ({
  float,
  updateAttributes,
  deleteNode,
}: FigureControlsProps): JSX.Element => (
  <div
    className={cn(
      'absolute inset-x-1 top-1 flex items-start justify-between gap-1',
      'opacity-0 transition-opacity focus-within:opacity-100',
      'group-hover:opacity-100 group-data-selected:opacity-100'
    )}
  >
    <div role="group" aria-label="Image alignment" className="flex gap-0.5">
      {FLOAT_OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-label={label}
          aria-pressed={float === value}
          onClick={() => updateAttributes({ float: value })}
          className={cn(
            'bg-background/80 text-foreground p-1 shadow-sm backdrop-blur-sm',
            'hover:bg-accent hover:text-accent-foreground',
            float === value && 'bg-primary text-primary-foreground hover:bg-primary'
          )}
        >
          <Icon className="size-3.5" aria-hidden="true" />
        </button>
      ))}
    </div>
    <button
      type="button"
      aria-label="Remove image"
      onClick={() => deleteNode()}
      className={cn(
        'bg-background/80 text-foreground p-1 shadow-sm backdrop-blur-sm',
        'hover:bg-destructive hover:text-white'
      )}
    >
      <X className="size-3.5" aria-hidden="true" />
    </button>
  </div>
);

/**
 * React NodeView for the `bioFigure` node: renders the figure in the editor
 * with hover/selection controls for float and delete, resize handles at all
 * four corners (pointer drag, plus ArrowLeft/ArrowRight/Home/End on the
 * bottom-right ARIA slider), and two-finger pinch resize on the image. The
 * image container carries `data-drag-handle` so ProseMirror-native drag
 * repositions the whole node.
 */
export const BioFigureNodeView = ({
  node,
  updateAttributes,
  deleteNode,
  selected,
  editor,
}: NodeViewProps): JSX.Element => {
  const { src, alt, width, float, title, subtitle, attribution } =
    node.attrs as BioFigureAttributes;
  const { cornerHandlers, onKeyDown, pinchHandlers } = useFigureResize({ width, updateAttributes });

  return (
    <NodeViewWrapper
      as="figure"
      data-selected={selected ? true : undefined}
      className={cn(
        'bio-figure group relative my-2',
        classForFloat(float),
        previewClassForFloat(float),
        selected && 'ring-ring ring-2 ring-offset-2'
      )}
      style={{ width: `${width}%` }}
    >
      <div data-drag-handle className="relative cursor-grab" {...pinchHandlers}>
        {/* Plain img on purpose: editor-only context with arbitrary remote hosts. */}
        <img
          src={src}
          alt={alt}
          className="shadow-zine-ink block h-auto w-full border-2 border-black"
          draggable={false}
        />
        <FigureControls float={float} updateAttributes={updateAttributes} deleteNode={deleteNode} />
        {SECONDARY_CORNERS.map((corner) => (
          <div
            key={corner.id}
            data-resize-corner={corner.id}
            aria-hidden
            {...cornerHandlers(corner.sign)}
            className={cn(
              'absolute size-3',
              corner.className,
              'border-background bg-primary border opacity-0 transition-opacity',
              'group-hover:opacity-100 group-data-selected:opacity-100'
            )}
          />
        ))}
        <div
          role="slider"
          tabIndex={0}
          data-resize-corner="br"
          aria-label="Resize image"
          aria-valuenow={width}
          aria-valuemin={BIO_FIGURE_MIN_WIDTH}
          aria-valuemax={BIO_FIGURE_MAX_WIDTH}
          aria-orientation="horizontal"
          onKeyDown={onKeyDown}
          {...cornerHandlers(1)}
          className={cn(
            'absolute -right-1 -bottom-1 size-3 cursor-nwse-resize',
            'border-background bg-primary border opacity-0 transition-opacity',
            'focus-visible:ring-ring focus-visible:opacity-100 focus-visible:ring-2',
            'group-hover:opacity-100 group-data-selected:opacity-100'
          )}
        />
      </div>
      <FigureCaption title={title} subtitle={subtitle} />
      <AttributionField
        attribution={attribution}
        isEditable={editor.isEditable}
        updateAttributes={updateAttributes}
      />
    </NodeViewWrapper>
  );
};
