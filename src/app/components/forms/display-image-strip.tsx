/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useId, useState } from 'react';
import type { DragEvent, JSX, KeyboardEvent } from 'react';

import Image from 'next/image';

import { ChevronLeft, ChevronRight, ImagePlus, X } from 'lucide-react';

import { Badge } from '@/app/components/ui/badge';
import { cn } from '@/lib/utils';
import { moveByOne } from '@/lib/utils/move-by-one';
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
  /** A published artist keeps at least one display image (ADR-0019): its last one cannot be removed. */
  isPublished: boolean;
}

/** Why a published artist's last display image cannot be removed. */
export const LAST_IMAGE_REASON =
  'A published artist keeps at least one display image. Add another before removing this one.';

/** The id of the remove-refusal notice when `count` is a published artist's last image, else null. */
const removeReasonIdFor = (isPublished: boolean, count: number, id: string): string | null =>
  isPublished && count === 1 ? id : null;

/** The notice a disabled remove button points at; nothing when removal is allowed. */
const LastImageNotice = ({ id }: { id: string | null }): JSX.Element | null =>
  id ? (
    <p id={id} className="text-muted-foreground text-xs">
      {LAST_IMAGE_REASON}
    </p>
  ) : null;

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

interface DisplayImageDropTargetProps {
  canDrop: boolean;
  onDropPoolImage: (imageId: string) => void;
  onDropFile: (file: File) => void;
}

/**
 * The dashed target under the strip: a pool tile drops in by the id in its
 * drag payload, anything else with a file drops in as an upload. The set has
 * no cap, so it always invites a drop while the strip is enabled.
 */
const DisplayImageDropTarget = ({
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
        Drop a pool image or an image file here to add a display image.
      </p>
    </div>
  );
};

interface DisplayImageItemProps {
  image: BioStatusImage;
  index: number;
  count: number;
  disabled: boolean;
  /** The id of the reason this image cannot be removed, or null when it can. */
  removeReasonId: string | null;
  onMove: (index: number, direction: -1 | 1) => void;
  onKeyDown: (event: KeyboardEvent<HTMLButtonElement>, index: number) => void;
  onRemove: (imageId: string) => void;
}

/** One chosen image in the strip: its position, thumbnail, and move/remove controls. */
const DisplayImageItem = ({
  image,
  index,
  count,
  disabled,
  removeReasonId,
  onMove,
  onKeyDown,
  onRemove,
}: DisplayImageItemProps): JSX.Element => {
  const { thumbSrc, previewLabel, alt } = resolveImageLabels(image);
  return (
    <li
      aria-label={`${previewLabel}, display image ${index + 1} of ${count}`}
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
          onClick={() => onMove(index, -1)}
          onKeyDown={(event) => onKeyDown(event, index)}
          aria-label={`Move ${previewLabel} earlier`}
          className="hover:text-primary p-0.5 disabled:opacity-40"
        >
          <ChevronLeft className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          disabled={disabled || index === count - 1}
          onClick={() => onMove(index, 1)}
          onKeyDown={(event) => onKeyDown(event, index)}
          aria-label={`Move ${previewLabel} later`}
          className="hover:text-primary p-0.5 disabled:opacity-40"
        >
          <ChevronRight className="size-3.5" aria-hidden />
        </button>
        <button
          type="button"
          disabled={disabled || removeReasonId !== null}
          onClick={() => onRemove(image.id)}
          aria-label={`Remove ${previewLabel} from display images`}
          aria-describedby={removeReasonId ?? undefined}
          title={removeReasonId ? LAST_IMAGE_REASON : undefined}
          className="hover:text-destructive ml-auto p-0.5 disabled:opacity-40"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      </div>
    </li>
  );
};

/**
 * The artist's chosen display images: an ordered strip of thumbnails (no
 * cap — ADR-0008, second addendum) with move-earlier / move-later / remove
 * controls (the arrow keys also move the image while either move button has
 * focus), a polite live region announcing the new position, and a drop
 * target that takes a pool tile (by the id in its drag payload) or an image
 * file from the desktop (uploaded, then added).
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
  isPublished,
}: DisplayImageStripProps): JSX.Element => {
  const [announcement, setAnnouncement] = useState('');
  const removeReasonId = removeReasonIdFor(isPublished, images.length, useId());
  const ids = images.map(({ id }) => id);

  const move = (index: number, direction: -1 | 1): void => {
    const next = moveByOne(ids, index, direction);
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
      <h3 className="text-sm font-semibold">Display images ({images.length})</h3>
      <p className="text-muted-foreground text-xs">
        All of them make the artist page’s collage, in this order; the first is the artists index
        photo.
      </p>
      {images.length === 0 ? (
        <p className="text-muted-foreground text-xs">
          No display images chosen — the artist page shows the suggested images that have alt text,
          or else the first pool images that have alt text. They are marked Shown in the pool below.
        </p>
      ) : (
        <ol aria-label="Display images" className="flex flex-wrap gap-2">
          {images.map((image, index) => (
            <DisplayImageItem
              key={image.id}
              image={image}
              index={index}
              count={images.length}
              disabled={disabled}
              removeReasonId={removeReasonId}
              onMove={move}
              onKeyDown={handleKeyDown}
              onRemove={onRemove}
            />
          ))}
        </ol>
      )}
      <LastImageNotice id={removeReasonId} />
      <DisplayImageDropTarget
        canDrop={!disabled && !isUploading}
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
