/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useRef, useState } from 'react';
import type { JSX } from 'react';

import Image from 'next/image';

import { cn } from '@/lib/utils';
import { resolveCdnImageSource } from '@/lib/utils/build-cdn-image-variant-url';

import { DisplayImageGallery, galleryImageAlt, type GalleryImage } from './display-image-gallery';
import { LIGHTBOX_ZOOM_CLASS, LightboxTrigger, ResponsiveLightbox } from './responsive-lightbox';

/** How many tiles the collage shows; the last one carries "+N more" for the rest. */
export const TILE_CAP = 7;

export const visibleTileCount = (total: number): number => Math.min(total, TILE_CAP);

export const moreCount = (total: number): number => Math.max(0, total - TILE_CAP);

/** Literal class strings only: Tailwind must see every one of them. */
const LEAD_ITEM_CLASS =
  'relative shrink-0 snap-start w-[82%] lg:col-span-2 lg:row-span-2 lg:w-auto';
const ITEM_CLASS = 'relative shrink-0 snap-start w-[42%] lg:w-auto';
const LEAD_TILE_CLASS = 'size-full border-0 aspect-[4/5]';
const TILE_CLASS = 'size-full border-0 aspect-square';
const MORE_TILE_CLASS = '[&_img]:brightness-[0.35]';
const MORE_OVERLAY_CLASS =
  'font-fake-four-cutout absolute inset-0 flex items-center justify-center text-4xl text-white';

interface DisplayImageCollageProps {
  /** The chosen display images, in display order (uncapped). */
  images: GalleryImage[];
  displayName: string;
  className?: string;
}

/**
 * The artist page's proof sheet: up to seven tiles on black — the lead
 * frame at 4:5 across two columns, the rest square, and "+N more" over the
 * last when there are more. Every tile opens one gallery lightbox at that image, which then
 * steps through all of them; closing it returns focus to the tile that
 * opened it. Under lg the sheet is a horizontal snap filmstrip. With no
 * image there is an inert black frame where the sheet would be.
 */
export const DisplayImageCollage = ({
  images,
  displayName,
  className,
}: DisplayImageCollageProps): JSX.Element => {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const openedFromRef = useRef<number>(0);
  const tileRefs = useRef(new Map<number, HTMLButtonElement>());

  if (images.length === 0) {
    return (
      <div
        data-testid="display-image-placeholder"
        aria-hidden="true"
        className={cn('aspect-[4/5] w-full border-2 border-black bg-zinc-950', className)}
      />
    );
  }

  const shown = visibleTileCount(images.length);
  const more = moreCount(images.length);
  const current = images.at(index);

  const openAt = (tileIndex: number): void => {
    openedFromRef.current = tileIndex;
    setIndex(tileIndex);
    setOpen(true);
  };

  const returnFocusToTile = (event: Event): void => {
    event.preventDefault();
    tileRefs.current.get(openedFromRef.current)?.focus();
  };

  return (
    <>
      <ul
        data-slot="artist-display-images"
        aria-label={`${displayName} photos`}
        className={cn(
          'flex snap-x snap-mandatory gap-1 overflow-x-auto bg-zinc-950 p-2 lg:grid lg:grid-cols-3 lg:overflow-visible',
          className
        )}
      >
        {images.slice(0, shown).map((image, tileIndex) => {
          const isLead = tileIndex === 0;
          const isMore = more > 0 && tileIndex === shown - 1;
          const alt = galleryImageAlt(image, displayName);
          return (
            <li key={image.id} className={isLead ? LEAD_ITEM_CLASS : ITEM_CLASS}>
              <LightboxTrigger
                ref={(node) => {
                  if (node) tileRefs.current.set(tileIndex, node);
                  else tileRefs.current.delete(tileIndex);
                }}
                label={`Expand image: ${alt}`}
                onClick={() => openAt(tileIndex)}
                className={cn(isLead ? LEAD_TILE_CLASS : TILE_CLASS, isMore && MORE_TILE_CLASS)}
              >
                <Image
                  {...resolveCdnImageSource(image.thumbnailUrl ?? image.url)}
                  alt={alt}
                  width={image.width ?? 800}
                  height={image.height ?? 800}
                  sizes="(min-width: 1024px) 30vw, 100vw"
                  priority={isLead}
                  className={cn('size-full object-cover', LIGHTBOX_ZOOM_CLASS)}
                />
                {isMore && (
                  <span className={MORE_OVERLAY_CLASS}>
                    +{more}
                    <span className="sr-only"> more images</span>
                  </span>
                )}
              </LightboxTrigger>
            </li>
          );
        })}
      </ul>
      <ResponsiveLightbox
        open={open}
        onOpenChange={setOpen}
        onCloseAutoFocus={returnFocusToTile}
        title={displayName}
        titleClassName="font-fake-four-cutout pr-8 text-2xl font-normal text-black"
        description={current ? galleryImageAlt(current, displayName) : displayName}
        descriptionClassName="sr-only"
      >
        <DisplayImageGallery
          images={images}
          index={index}
          onIndexChange={setIndex}
          displayName={displayName}
        />
      </ResponsiveLightbox>
    </>
  );
};
