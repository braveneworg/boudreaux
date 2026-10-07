/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useEffect } from 'react';
import type { JSX } from 'react';

import { ChevronLeft, ChevronRight } from 'lucide-react';

import { LightboxImage } from './responsive-lightbox';
import { ThumbnailCaption } from './thumbnail-caption';

/** What a display image needs to be shown and credited. */
export interface GalleryImage {
  id: string;
  url: string;
  thumbnailUrl: string | null;
  alt: string | null;
  title: string | null;
  attribution: string | null;
  license: string | null;
  sourceUrl: string | null;
  width: number | null;
  height: number | null;
}

/** The alt text of a display image: its own, else its title, else the artist's name. */
export const galleryImageAlt = (image: GalleryImage, displayName: string): string =>
  image.alt ?? image.title ?? `${displayName} image`;

interface DisplayImageGalleryProps {
  images: GalleryImage[];
  /** The image shown, 0-based; the caller owns it so the collage can open at a tile. */
  index: number;
  onIndexChange: (index: number) => void;
  displayName: string;
}

/** Whether a key press belongs to something the reader is typing into. */
const isEditableTarget = (target: EventTarget | null): boolean =>
  target instanceof HTMLInputElement ||
  target instanceof HTMLTextAreaElement ||
  target instanceof HTMLSelectElement ||
  (target instanceof HTMLElement && target.isContentEditable);

const STEP_BUTTON_CLASS =
  'shadow-zine-ink inline-flex items-center gap-1 border-2 border-black bg-white px-2 py-1 text-sm hover:bg-zinc-950 hover:text-white';

/**
 * The lightbox body for an artist's display images: one image at a time,
 * stepped with Previous/Next or the arrow keys, wrapping at both ends, with
 * a polite "n of count" and the image's credit under it. Plain arrow keys
 * only — a modifier or an editable target leaves the key to the browser.
 */
export const DisplayImageGallery = ({
  images,
  index,
  onIndexChange,
  displayName,
}: DisplayImageGalleryProps): JSX.Element | null => {
  const count = images.length;
  const image = images.at(index);

  /** One step either way, wrapping at both ends; the buttons and the keys share it. */
  const step = useCallback(
    (delta: number): void => onIndexChange((index + delta + count) % count),
    [count, index, onIndexChange]
  );

  useEffect(() => {
    if (count < 2) return undefined;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isEditableTarget(event.target)) return;
      if (event.key === 'ArrowLeft') step(-1);
      if (event.key === 'ArrowRight') step(1);
    };
    globalThis.addEventListener('keydown', onKeyDown);
    return () => globalThis.removeEventListener('keydown', onKeyDown);
  }, [count, step]);

  if (!image) return null;

  return (
    <figure className="flex flex-col gap-3">
      <LightboxImage src={image.url} alt={galleryImageAlt(image, displayName)} />
      {count > 1 && (
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => step(-1)}
            aria-label="Previous image"
            className={STEP_BUTTON_CLASS}
          >
            <ChevronLeft className="size-4" aria-hidden /> Prev
          </button>
          <span aria-live="polite" className="text-sm text-zinc-700">
            {index + 1} of {count}
          </span>
          <button
            type="button"
            onClick={() => step(1)}
            aria-label="Next image"
            className={STEP_BUTTON_CLASS}
          >
            Next <ChevronRight className="size-4" aria-hidden />
          </button>
        </div>
      )}
      <ThumbnailCaption
        caption={image.title}
        attribution={image.attribution}
        license={image.license}
        sourceUrl={image.sourceUrl}
      />
    </figure>
  );
};
