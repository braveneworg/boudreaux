/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { ReactElement } from 'react';

import Image from 'next/image';

import { Eye } from 'lucide-react';

import type { AdminEntity } from '@/app/admin/types';

import { cleanImageUrl, readField } from '../data-view-utils';
import { useImagePreview } from '../image-preview-context';

interface EntityThumbnailsProps<T extends Record<string, unknown>> {
  item: T;
  entity: AdminEntity;
  /** Field name containing an array of images with a `src` property. */
  imageField?: string;
  /** Field name containing a direct cover art URL string. */
  coverArtField?: string;
}

/** A single clickable thumbnail that opens the shared image-preview dialog. */
const PreviewThumbnail = ({ src, altText }: { src: string; altText: string }): ReactElement => {
  const { openPreview } = useImagePreview();
  const isBase64 = src.startsWith('data:');

  return (
    <button
      type="button"
      onClick={() => openPreview({ src, altText })}
      className="group bg-muted focus:ring-primary relative h-16 w-16 overflow-hidden border transition-opacity hover:opacity-80 focus:ring-2 focus:ring-offset-2 focus:outline-none"
    >
      <Image
        // Base64 data URLs are passed through unoptimized
        src={isBase64 ? src : cleanImageUrl(src)}
        alt={altText}
        fill
        unoptimized={isBase64}
        className="object-cover"
        sizes="64px"
      />
      <span className="absolute top-0.5 right-0.5 flex h-5 w-5 items-center justify-center bg-black/60 text-white opacity-70 transition-opacity group-hover:opacity-100">
        <Eye className="h-3 w-3" />
      </span>
    </button>
  );
};

/**
 * Renders an entity's thumbnails: a direct cover-art URL when present, otherwise the
 * first few images from its image array. Falls back to release-track cover art for
 * tracks. Renders nothing when no imagery is available.
 */
export const EntityThumbnails = <T extends Record<string, unknown>>({
  item,
  entity,
  imageField,
  coverArtField,
}: EntityThumbnailsProps<T>): ReactElement | null => {
  // First check for a direct coverArt URL field.
  let coverArtUrl = coverArtField
    ? (readField(item, coverArtField) as string | undefined)
    : undefined;

  // Fallback: check releaseTracks for coverArt (for tracks).
  if (!coverArtUrl && item.releaseTracks) {
    const releaseTracks = item.releaseTracks as Array<{ coverArt?: string }>;
    coverArtUrl = releaseTracks[0]?.coverArt;
  }

  if (coverArtUrl) {
    return (
      <div className="mb-3 flex justify-center gap-2">
        <PreviewThumbnail src={coverArtUrl} altText="Cover art" />
      </div>
    );
  }

  // Otherwise fall back to the images array.
  const images = imageField
    ? (readField(item, imageField) as Array<{ src?: string; altText?: string }> | undefined)
    : undefined;

  if (images && images.length > 0) {
    return (
      <div className="mb-3 flex justify-center gap-2">
        {images
          .slice(0, 3)
          .map((image) =>
            image.src ? (
              <PreviewThumbnail
                key={image.src}
                src={image.src}
                altText={image.altText || `${entity} image`}
              />
            ) : null
          )}
      </div>
    );
  }

  return null;
};
