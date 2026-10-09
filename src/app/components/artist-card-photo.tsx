/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { ReactElement } from 'react';

import Image from 'next/image';
import Link from 'next/link';

import type { ArtistListingRow } from '@/lib/types/domain/artist';
import { cn } from '@/lib/utils';
import { resolveCdnImageSource } from '@/lib/utils/build-cdn-image-variant-url';

import {
  LIGHTBOX_ZOOM_CLASS,
  LightboxImage,
  LightboxTrigger,
  ResponsiveLightbox,
} from './responsive-lightbox';
import { ThumbnailCaption } from './thumbnail-caption';

/** Intrinsic size requested from the CDN loader: 2× the widest 192px frame. */
const THUMBNAIL_SOURCE_PX = 384;

interface ArtistCardPhotoProps {
  slug: string;
  displayName: string;
  image: ArtistListingRow['bioImages'][number];
  /** Sizes the frame; the card owns it so photo, placeholder, and skeleton agree. */
  className?: string;
}

/**
 * The artists-index card's photo. It does not navigate: clicking enlarges the
 * photo in place — a dialog on wide viewports, a drawer from the bottom on
 * narrow ones — with the artist's name, the photo credit, and a link through
 * to the artist page. The thumbnail zooms when a mouse moves onto it or the
 * keyboard focuses it, never as the list scrolls past a resting cursor.
 */
export const ArtistCardPhoto = ({
  slug,
  displayName,
  image,
  className,
}: ArtistCardPhotoProps): ReactElement => {
  const alt = image.alt ?? image.title ?? `${displayName} image`;

  return (
    <ResponsiveLightbox
      trigger={
        <LightboxTrigger label={`Expand image: ${alt}`} className={className}>
          <Image
            {...resolveCdnImageSource(image.thumbnailUrl ?? image.url)}
            alt={alt}
            width={THUMBNAIL_SOURCE_PX}
            height={THUMBNAIL_SOURCE_PX}
            className={cn('size-full object-cover', LIGHTBOX_ZOOM_CLASS)}
          />
        </LightboxTrigger>
      }
      title={displayName}
      titleClassName="font-fake-four-cutout pr-8 text-2xl font-normal text-black"
      description={alt}
      descriptionClassName="sr-only"
    >
      <figure className="flex flex-col gap-3">
        <LightboxImage src={image.url} alt={alt} />
        <ThumbnailCaption
          caption={image.title}
          attribution={image.attribution}
          license={image.license}
          sourceUrl={image.sourceUrl}
        />
      </figure>
      <Link
        href={`/artists/${slug}`}
        className={cn(
          'shadow-zine-ink inline-flex items-center justify-center border-2 border-black px-4 py-2',
          'bg-zinc-900 text-sm font-medium text-white transition-colors hover:bg-zinc-700'
        )}
      >
        View artist
      </Link>
    </ResponsiveLightbox>
  );
};
