/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import Image from 'next/image';

import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Eye, GripVertical, X } from 'lucide-react';

import { cn } from '@/lib/utils';

import { cleanImageUrl } from './image-uploader-utils';
import { Progress } from './progress';
import { SpinnerRingCircle } from './spinners/spinner-ring-circle';

import type { ImageItem } from './image-uploader-types';
import type { DraggableAttributes, DraggableSyntheticListeners } from '@dnd-kit/core';

interface SortableImageItemProps {
  item: ImageItem;
  onDeleteRequest: (item: ImageItem) => void;
  onPreview: (item: ImageItem) => void;
  disabled?: boolean;
}

/**
 * Returns the drag attributes/listeners only on desktop-width viewports, where
 * the grip handle (rather than the full-thumbnail overlay) initiates dragging.
 */
const desktopDragProps = (
  attributes: DraggableAttributes,
  listeners: DraggableSyntheticListeners
): Record<string, unknown> =>
  typeof globalThis.window !== 'undefined' && globalThis.window.innerWidth >= 640
    ? { ...attributes, ...listeners }
    : {};

const ImageUploadingOverlay = ({ progress }: { progress?: number }): React.JSX.Element => (
  <div className="bg-background/80 absolute inset-0 flex flex-col items-center justify-center gap-2 backdrop-blur-sm">
    <SpinnerRingCircle size="md" variant="primary" />
    {progress !== undefined && (
      <div className="w-3/4">
        <Progress value={progress} className="h-1.5" />
        <span className="mt-1 block text-center text-xs text-zinc-950">
          {Math.round(progress)}%
        </span>
      </div>
    )}
  </div>
);

/**
 * Container classes for a thumbnail, reflecting drag, error, and uploading state.
 */
const thumbnailContainerClass = (item: ImageItem, isDragging: boolean): string =>
  cn(
    'group bg-muted relative aspect-square overflow-hidden rounded-lg border',
    isDragging && 'z-50 opacity-80 shadow-lg',
    item.error && 'border-destructive',
    item.isUploading && 'pointer-events-none'
  );

const ImageThumbnail = ({ item }: { item: ImageItem }): React.JSX.Element => (
  // Image preview - using next/image for blob URLs requires unoptimized
  <Image
    src={cleanImageUrl(item.preview)}
    alt={item.altText || 'Uploaded image'}
    fill
    className="object-cover"
    unoptimized={item.preview.startsWith('blob:')}
  />
);

const ImageSuccessBadge = (): React.JSX.Element => (
  <div className="absolute bottom-1 left-1 rounded-full bg-green-500/90 p-1">
    <svg className="h-3 w-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
    </svg>
  </div>
);

interface ImageItemControlsProps {
  item: ImageItem;
  attributes: DraggableAttributes;
  listeners: DraggableSyntheticListeners;
  onDeleteRequest: (item: ImageItem) => void;
  onPreview: (item: ImageItem) => void;
}

/**
 * The interactive controls (grip handle, remove, preview) overlaid on a
 * thumbnail. Rendered only when the item is interactive.
 */
const ImageItemControls = ({
  item,
  attributes,
  listeners,
  onDeleteRequest,
  onPreview,
}: ImageItemControlsProps): React.JSX.Element => (
  <>
    <div
      className="bg-background/80 sm:hover:bg-background pointer-events-none absolute top-1 left-1 flex h-6 w-6 items-center justify-center rounded-full shadow-sm backdrop-blur-sm sm:pointer-events-auto sm:cursor-grab sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:active:cursor-grabbing"
      {...desktopDragProps(attributes, listeners)}
    >
      <GripVertical className="h-3.5 w-3.5 text-zinc-950" />
    </div>

    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onDeleteRequest(item);
      }}
      className="bg-destructive/90 hover:bg-destructive absolute top-1 right-1 z-20 flex h-6 w-6 items-center justify-center rounded-full text-white shadow-sm transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
      aria-label="Remove image"
    >
      <X className="h-3.5 w-3.5" />
    </button>

    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onPreview(item);
      }}
      className="bg-background/90 text-foreground hover:bg-background absolute right-1 bottom-1 z-20 flex h-6 w-6 items-center justify-center rounded-full shadow-sm transition-opacity sm:opacity-0 sm:group-hover:opacity-100"
      aria-label="Preview image"
    >
      <Eye className="h-3.5 w-3.5" />
    </button>
  </>
);

/**
 * A single draggable/sortable image thumbnail with uploading, error, success,
 * and interactive-control overlays.
 */
export const SortableImageItem = ({
  item,
  onDeleteRequest,
  onPreview,
  disabled,
}: SortableImageItemProps): React.JSX.Element => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: disabled || item.isUploading,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const isInteractive = !item.isUploading && !disabled;

  return (
    <div ref={setNodeRef} style={style} className={thumbnailContainerClass(item, isDragging)}>
      {/* Draggable overlay - covers entire thumbnail on mobile for easier dragging */}
      {isInteractive && (
        <div
          className="absolute inset-0 z-10 cursor-grab touch-none active:cursor-grabbing sm:pointer-events-none"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
        />
      )}

      <ImageThumbnail item={item} />

      {item.isUploading && <ImageUploadingOverlay progress={item.uploadProgress} />}

      {item.error && (
        <div className="bg-destructive/90 absolute inset-x-0 bottom-0 px-2 py-1 text-xs text-white">
          {item.error}
        </div>
      )}

      {isInteractive && (
        <ImageItemControls
          item={item}
          attributes={attributes}
          listeners={listeners}
          onDeleteRequest={onDeleteRequest}
          onPreview={onPreview}
        />
      )}

      {item.uploadedUrl && !item.isUploading && <ImageSuccessBadge />}
    </div>
  );
};
