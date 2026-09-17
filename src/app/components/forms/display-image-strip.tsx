/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useState } from 'react';
import type { JSX, KeyboardEvent } from 'react';

import Image from 'next/image';

import { ChevronLeft, ChevronRight, X } from 'lucide-react';

import { Badge } from '@/app/components/ui/badge';
import { DISPLAY_IMAGE_CAP } from '@/lib/utils/display-images';
import type { BioStatusImage } from '@/lib/validation/bio-generation-schema';

import { resolveImageLabels } from './bio-image-tile';

export interface DisplayImageStripProps {
  /** The chosen display images, in display order. */
  images: BioStatusImage[];
  /** Called with the full new ordered id list after a move. */
  onReorder: (imageIds: string[]) => void;
  /** Called with the id to drop from the set. */
  onRemove: (imageId: string) => void;
  disabled?: boolean;
}

/** Move the item at `index` one step in `direction`, or return `null` at the edge. */
const moved = (ids: string[], index: number, direction: -1 | 1): string[] | null => {
  const target = index + direction;
  if (target < 0 || target >= ids.length) return null;
  const next = [...ids];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
};

/**
 * The artist's chosen display images: an ordered strip of up to
 * {@link DISPLAY_IMAGE_CAP} thumbnails with move-earlier / move-later /
 * remove controls (the arrow keys also move the image while either move
 * button has focus) and a polite live region announcing the new position.
 * Thumbnails stay `unoptimized` because a fresh upload's srcset variants are
 * generated asynchronously.
 */
export const DisplayImageStrip = ({
  images,
  onReorder,
  onRemove,
  disabled = false,
}: DisplayImageStripProps): JSX.Element => {
  const [announcement, setAnnouncement] = useState('');
  const ids = images.map(({ id }) => id);

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
          No display images chosen — the artist page shows the suggested images.
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
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
};
