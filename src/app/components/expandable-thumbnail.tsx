/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { ReactElement } from 'react';

import Image from 'next/image';

import { cn } from '@/lib/utils';

import {
  LIGHTBOX_ZOOM_CLASS,
  LightboxImage,
  LightboxTrigger,
  ResponsiveLightbox,
} from './responsive-lightbox';
import { ThumbnailCaption } from './thumbnail-caption';

/** Intrinsic size requested for the collapsed thumbnail. */
const THUMBNAIL_SOURCE_PX = 240;

interface ExpandableThumbnailProps {
  src: string;
  thumbnailSrc?: string | null;
  alt: string;
  caption?: string | null;
  attribution?: string | null;
  license?: string | null;
  sourceUrl?: string | null;
  className?: string;
}

/**
 * A bio image thumbnail that expands to a full-size view. The thumbnail zooms
 * when a mouse moves onto it or the keyboard focuses it — never from CSS
 * hover, which fires as the page scrolls past a resting cursor. Tapping or
 * clicking opens the full image with its credit: a dialog on wide viewports,
 * a drawer from the bottom on narrow ones. Mobile-first.
 *
 * Bio images are re-hosted on our CDN with `_w{width}` variants, so they render
 * through the custom next/image loader (no `unoptimized`).
 */
export const ExpandableThumbnail = ({
  src,
  thumbnailSrc,
  alt,
  caption,
  attribution,
  license,
  sourceUrl,
  className,
}: ExpandableThumbnailProps): ReactElement => (
  <ResponsiveLightbox
    trigger={
      <LightboxTrigger label={`Expand image: ${alt}`} className={className}>
        <Image
          src={thumbnailSrc ?? src}
          alt={alt}
          width={THUMBNAIL_SOURCE_PX}
          height={THUMBNAIL_SOURCE_PX}
          className={cn('size-full object-cover', LIGHTBOX_ZOOM_CLASS)}
        />
      </LightboxTrigger>
    }
    title={alt}
    titleClassName="sr-only"
    description={caption ?? alt}
    descriptionClassName="sr-only"
  >
    <figure className="flex flex-col gap-3">
      <LightboxImage src={src} alt={alt} />
      <ThumbnailCaption
        caption={caption}
        attribution={attribution}
        license={license}
        sourceUrl={sourceUrl}
      />
    </figure>
  </ResponsiveLightbox>
);
