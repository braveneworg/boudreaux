/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';
import type { DragEvent, JSX, KeyboardEvent } from 'react';

import Image from 'next/image';

import { ChevronLeft, ChevronRight, ImagePlus, X } from 'lucide-react';

import { Badge } from '@/app/components/ui/badge';
import { cn } from '@/lib/utils';
import { DISPLAY_IMAGE_CAP } from '@/lib/utils/display-images';
import { BIO_IMAGE_DRAG_MIME, bioImageDragPayloadSchema } from '@/lib/validation/bio-dnd-schema';
import type { BioStatusImage } from '@/lib/validation/bio-generation-schema';

import { resolveImageLabels } from './bio-image-tile';

export interface DisplayImageStripProps {
  /** The chosen display images, in display order. */
  images: BioStatusImage[];
  /** Called with the full new ordered id list after a move. */
  onReorder: (imageIds: string[]) => void;
  /** Called with the id to drop from the set. */
  onRemove: (imageId: string) => void;
  /** A pool tile was dropped on the target: add that row to the set. */
  onDropPoolImage: (imageId: string) => void;
  /** An image file was dropped on the target: upload it, then add it (one per drop). */
  onDropFile: (file: File) => void;
  /** True while a dropped file is still uploading. */
  isUploading?: boolean;
  /** Why the last dropped file failed, phrased for the admin, or null. */
  uploadError?: string | null;
  disabled?: boolean;
}

/** The pool row id a drag carries, or null when the drag is not a pool tile (or predates ids). */
const readDroppedPoolImageId = (transfer: DataTransfer): string | null => {
  const raw = transfer.getData(BIO_IMAGE_DRAG_MIME);
  if (!raw) return null;
  try {
    const parsed = bioImageDragPayloadSchema.safeParse(JSON.parse(raw));
    return parsed.success ? (parsed.data.id ?? null) : null;
  } catch {
    return null;
  }
};

/** Move the item at `index` one step in `direction`, or return `null` at the edge. */
const moved = (ids: string[], index: number, direction: -1 | 1): string[] | null => {
  const target = index + direction;
  if (target < 0 || target >= ids.length) return null;
  const next = [...ids];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
};

interface DisplayImageDropTargetProps {
  atCap: boolean;
  canDrop: boolean;
  onDropPoolImage: (imageId: string) => void;
  onDropFile: (file: File) => void;
}

/**
 * The dashed target under the strip: a pool tile drops in by the id in its
 * drag payload, anything else with a file drops in as an upload. Explains the
 * cap instead of inviting a drop once the set is full.
 */
const DisplayImageDropTarget = ({
  atCap,
  canDrop,
  onDropPoolImage,
  onDropFile,
}: DisplayImageDropTargetProps): JSX.Element => {
  const [isDragOver, setIsDragOver] = useState(false);

  const handleDragOver = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    if (canDrop) setIsDragOver(true);
  };

  const handleDragLeave = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    setIsDragOver(false);
    if (!canDrop) return;
    const poolImageId = readDroppedPoolImageId(event.dataTransfer);
    if (poolImageId) {
      onDropPoolImage(poolImageId);
      return;
    }
    // Index access rather than `.item()` so a synthetic drop's plain array works too.
    const file = event.dataTransfer.files?.[0];
    if (file) onDropFile(file);
  };

  return (
    <div
      role="group"
      aria-label="Add a display image"
      data-drag-over={isDragOver}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      className={cn(
        'flex min-h-16 flex-col items-center justify-center border-2 border-dashed p-3 text-center transition-colors',
        isDragOver && 'border-primary bg-primary/5',
        !isDragOver && 'border-muted-foreground/25',
        !canDrop && 'opacity-50'
      )}
    >
      <ImagePlus className="mb-1 size-5 text-zinc-600" aria-hidden />
      <p className="text-xs text-zinc-950">
        {atCap
          ? `Remove a display image first (limit ${DISPLAY_IMAGE_CAP}).`
          : 'Drop a pool image or an image file here to add a display image.'}
      </p>
    </div>
  );
};

/**
 * The artist's chosen display images: an ordered strip of up to
 * {@link DISPLAY_IMAGE_CAP} thumbnails with move-earlier / move-later /
 * remove controls (the arrow keys also move the image while either move
 * button has focus), a polite live region announcing the new position, and
 * a drop target that takes a pool tile (by the id in its drag payload) or an
 * image file from the desktop (uploaded, then added) while there is room.
 * Thumbnails stay `unoptimized` because a fresh upload's srcset variants are
 * generated asynchronously.
 */
export const DisplayImageStrip = ({
  images,
  onReorder,
  onRemove,
  onDropPoolImage,
  onDropFile,
  isUploading = false,
  uploadError = null,
  disabled = false,
}: DisplayImageStripProps): JSX.Element => {
  const [announcement, setAnnouncement] = useState('');
  const ids = images.map(({ id }) => id);
  const atCap = images.length >= DISPLAY_IMAGE_CAP;

  const move = (index: number, direction: -1 | 1): void => {
    const next = moved(ids, index, direction);
    const image = images.at(index);
    if (!next || !image) return;
    const { previewLabel } = resolveImageLabels(image);
    setAnnouncement(
      `${previewLabel} is now display image ${index + direction + 1} of ${images.length}`
    );
    onReorder(next);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number): void => {
    if (disabled) return;
    if (event.key === 'ArrowLeft') {
      event.preventDefault();
      move(index, -1);
    }
    if (event.key === 'ArrowRight') {
      event.preventDefault();
      move(index, 1);
    }
  };

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">
        Display images ({images.length}/{DISPLAY_IMAGE_CAP})
      </h3>
      <p className="text-muted-foreground text-xs">
        Shown beside the short bio on the artist page and the artists index.
      </p>
      {images.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          No display images chosen — the artist page shows the suggested images that have alt text,
          or else the first pool images that have alt text. They are marked Shown in the pool below.
        </p>
      ) : (
        <ol aria-label="Display images" className="flex flex-wrap gap-2">
          {images.map((image, index) => {
            const { thumbSrc, previewLabel, alt } = resolveImageLabels(image);
            return (
              <li
                key={image.id}
                aria-label={`${previewLabel}, display image ${index + 1} of ${images.length}`}
                className="border-border bg-background relative flex w-28 flex-col gap-1 border p-1"
              >
                <Badge
                  variant="outline"
                  className="bg-background/80 absolute top-1 left-1 text-[10px]"
                  aria-hidden
                >
                  {index + 1}
                </Badge>
                <Image
                  src={thumbSrc}
                  alt={alt}
                  width={112}
                  height={112}
                  unoptimized
                  className="h-24 w-full object-cover"
                />
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={disabled || index === 0}
                    onClick={() => move(index, -1)}
                    onKeyDown={(event) => handleKeyDown(event, index)}
                    aria-label={`Move ${previewLabel} earlier`}
                    className="hover:text-primary p-0.5 disabled:opacity-40"
                  >
                    <ChevronLeft className="size-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    disabled={disabled || index === images.length - 1}
                    onClick={() => move(index, 1)}
                    onKeyDown={(event) => handleKeyDown(event, index)}
                    aria-label={`Move ${previewLabel} later`}
                    className="hover:text-primary p-0.5 disabled:opacity-40"
                  >
                    <ChevronRight className="size-3.5" aria-hidden />
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => onRemove(image.id)}
                    aria-label={`Remove ${previewLabel} from display images`}
                    className="hover:text-destructive ml-auto p-0.5"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      )}
      <DisplayImageDropTarget
        atCap={atCap}
        canDrop={!disabled && !atCap && !isUploading}
        onDropPoolImage={onDropPoolImage}
        onDropFile={onDropFile}
      />
      {isUploading && (
        <p role="status" className="text-xs text-zinc-950">
          Uploading…
        </p>
      )}
      {uploadError && (
        <p role="alert" className="text-destructive text-xs">
          {uploadError}
        </p>
      )}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
};
