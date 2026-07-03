/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { DragEvent, JSX } from 'react';

import Image from 'next/image';

import { Eye, X } from 'lucide-react';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/app/components/ui/dialog';
import { BIO_IMAGE_DRAG_MIME } from '@/lib/validation/bio-dnd-schema';
import type { BioStatusImage } from '@/lib/validation/bio-generation-schema';

interface BioImagePaletteProps {
  images: BioStatusImage[];
  onDelete: (imageId: string) => void;
  disabled?: boolean;
}

/** Curated, draggable grid of discovered images. Tiles drag into the bio
 *  editors as `application/x-bio-image` payloads; eye opens a full preview;
 *  X deletes the row. */
export const BioImagePalette = ({
  images,
  onDelete,
  disabled = false,
}: BioImagePaletteProps): JSX.Element => (
  <div role="group" aria-label="Discovered images" className="space-y-2">
    <h3 className="text-sm font-semibold">Discovered images</h3>
    <ul className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto pr-1">
      {images.map((image) => {
        const thumbSrc = image.thumbnailUrl ?? image.url;
        const title = image.title ?? null;
        const deleteLabel = title ?? image.url;
        const previewLabel = title ?? 'image';
        const alt = title ?? 'Artist photo';

        const onDragStart = (event: DragEvent<HTMLLIElement>): void => {
          event.dataTransfer.setData(
            BIO_IMAGE_DRAG_MIME,
            JSON.stringify({
              url: image.url,
              thumbnailUrl: image.thumbnailUrl ?? null,
              title,
              attribution: image.attribution ?? null,
              alt,
              width: image.width ?? null,
              height: image.height ?? null,
            })
          );
          event.dataTransfer.effectAllowed = 'copy';
        };

        return (
          <li
            key={image.id}
            draggable
            onDragStart={onDragStart}
            className="border-border bg-background relative flex cursor-grab flex-col gap-1 rounded-md border p-1 active:cursor-grabbing"
          >
            <Image
              src={thumbSrc}
              alt={alt}
              width={96}
              height={96}
              unoptimized
              className="h-24 w-full rounded-md object-cover"
            />
            {image.attribution && (
              <p className="text-muted-foreground line-clamp-2 text-[11px]">{image.attribution}</p>
            )}
            <div className="flex gap-1">
              <Dialog>
                <DialogTrigger asChild>
                  <button
                    type="button"
                    aria-label={`Preview ${previewLabel}`}
                    className="hover:text-primary rounded-full p-0.5"
                  >
                    <Eye className="size-3.5" aria-hidden />
                  </button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{title ?? 'Image preview'}</DialogTitle>
                  </DialogHeader>
                  <Image
                    src={image.url}
                    alt={alt}
                    width={800}
                    height={600}
                    unoptimized
                    className="h-auto w-full rounded-md"
                  />
                  {image.attribution && (
                    <p className="text-muted-foreground text-xs">{image.attribution}</p>
                  )}
                </DialogContent>
              </Dialog>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onDelete(image.id)}
                aria-label={`Delete image ${deleteLabel}`}
                className="hover:text-destructive ml-auto rounded-full p-0.5"
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  </div>
);
