/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useRef } from 'react';
import type { JSX, KeyboardEvent, PointerEvent } from 'react';

import { NodeViewWrapper } from '@tiptap/react';
import { AlignCenterVertical, AlignEndVertical, AlignStartVertical, X } from 'lucide-react';

import { cn } from '@/lib/utils';

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
}

interface FigureResizeOptions {
  width: number;
  updateAttributes: NodeViewProps['updateAttributes'];
}

interface FigureResizeHandlers {
  onPointerDown: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerMove: (event: PointerEvent<HTMLDivElement>) => void;
  onPointerUp: (event: PointerEvent<HTMLDivElement>) => void;
  onKeyDown: (event: KeyboardEvent<HTMLDivElement>) => void;
}

/**
 * Pointer + keyboard resize logic for the figure's corner handle. Pointer
 * drags are measured as a clientX delta against the editor container's pixel
 * width (the element the percentage width is relative to); keyboard arrows
 * step by 5. Both paths clamp into the 20–100% range before committing.
 */
const useFigureResize = ({
  width,
  updateAttributes,
}: FigureResizeOptions): FigureResizeHandlers => {
  const dragRef = useRef<DragState | null>(null);

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    const parent = event.currentTarget.closest('figure')?.parentElement;
    const parentWidth = parent?.getBoundingClientRect().width ?? 0;
    if (parentWidth <= 0) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { startX: event.clientX, startWidth: width, parentWidth };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    const drag = dragRef.current;
    if (!drag) return;
    const deltaPercent = ((event.clientX - drag.startX) / drag.parentWidth) * 100;
    updateAttributes({ width: clampFigureWidth(drag.startWidth + deltaPercent) });
  };

  const onPointerUp = (event: PointerEvent<HTMLDivElement>): void => {
    if (!dragRef.current) return;
    dragRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const step = event.key === 'ArrowRight' ? KEYBOARD_RESIZE_STEP : -KEYBOARD_RESIZE_STEP;
    updateAttributes({ width: clampFigureWidth(width + step) });
  };

  return { onPointerDown, onPointerMove, onPointerUp, onKeyDown };
};

interface FigureCaptionProps {
  title: string | null;
  subtitle: string | null;
  attribution: string | null;
}

/** Caption lines below the image — fixed at 11px, never scaling with width. */
const FigureCaption = ({
  title,
  subtitle,
  attribution,
}: FigureCaptionProps): JSX.Element | null => {
  if (!title && !subtitle && !attribution) return null;
  return (
    <figcaption className="bio-figure-caption mt-1 space-y-0.5 text-[11px] leading-snug">
      {title ? <span className="bio-figure-title block font-medium">{title}</span> : null}
      {subtitle ? <span className="bio-figure-subtitle block">{subtitle}</span> : null}
      {attribution ? (
        <span className="bio-figure-attribution text-muted-foreground block">{attribution}</span>
      ) : null}
    </figcaption>
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
            'bg-background/80 text-foreground rounded-sm p-1 shadow-sm backdrop-blur-sm',
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
        'bg-background/80 text-foreground rounded-sm p-1 shadow-sm backdrop-blur-sm',
        'hover:bg-destructive hover:text-white'
      )}
    >
      <X className="size-3.5" aria-hidden="true" />
    </button>
  </div>
);

/**
 * React NodeView for the `bioFigure` node: renders the figure in the editor
 * with hover/selection controls for float, delete, and a corner resize handle
 * (pointer drag + ArrowLeft/ArrowRight). The image container carries
 * `data-drag-handle` so ProseMirror-native drag repositions the whole node.
 */
export const BioFigureNodeView = ({
  node,
  updateAttributes,
  deleteNode,
  selected,
}: NodeViewProps): JSX.Element => {
  const { src, alt, width, float, title, subtitle, attribution } =
    node.attrs as BioFigureAttributes;
  const resizeHandlers = useFigureResize({ width, updateAttributes });

  return (
    <NodeViewWrapper
      as="figure"
      data-selected={selected ? true : undefined}
      className={cn(
        'bio-figure group relative my-2',
        classForFloat(float),
        selected && 'ring-ring ring-2 ring-offset-2'
      )}
      style={{ width: `${width}%` }}
    >
      <div data-drag-handle className="relative cursor-grab">
        {/* Plain img on purpose: editor-only context with arbitrary remote hosts. */}
        <img src={src} alt={alt} className="block h-auto w-full rounded-sm" draggable={false} />
        <FigureControls float={float} updateAttributes={updateAttributes} deleteNode={deleteNode} />
        <div
          role="slider"
          tabIndex={0}
          aria-label="Resize image"
          aria-valuenow={width}
          aria-valuemin={BIO_FIGURE_MIN_WIDTH}
          aria-valuemax={BIO_FIGURE_MAX_WIDTH}
          aria-orientation="horizontal"
          {...resizeHandlers}
          className={cn(
            'absolute -right-1 -bottom-1 size-3 cursor-nwse-resize rounded-full',
            'border-background bg-primary border opacity-0 transition-opacity',
            'focus-visible:ring-ring focus-visible:opacity-100 focus-visible:ring-2',
            'group-hover:opacity-100 group-data-selected:opacity-100'
          )}
        />
      </div>
      <FigureCaption title={title} subtitle={subtitle} attribution={attribution} />
    </NodeViewWrapper>
  );
};
