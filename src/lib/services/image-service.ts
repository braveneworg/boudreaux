/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { prisma } from '../prisma';

/** Input for registering an image whose binary already lives in S3. */
export interface RegisterImageInput {
  cdnUrl: string;
  caption?: string;
  altText?: string;
}

/** Persisted image record returned to callers. */
export interface RegisteredImage {
  id: string;
  src: string;
  caption?: string;
  altText?: string;
  sortOrder: number;
}

/**
 * Persistence for Image rows whose binary data was uploaded directly to S3
 * by the client. Encapsulates sort-order computation and the per-row create
 * loop so route handlers and Server Actions don't talk to Prisma directly.
 */
export const ImageService = {
  /**
   * Register pre-uploaded artist images. The caller is expected to have
   * already verified that the artist exists.
   */
  registerForArtist: async (
    artistId: string,
    images: RegisterImageInput[]
  ): Promise<RegisteredImage[]> =>
    registerImages({ ownerKey: 'artistId', ownerId: artistId, images }),

  /**
   * Register pre-uploaded release images. The caller is expected to have
   * already verified that the release exists.
   */
  registerForRelease: async (
    releaseId: string,
    images: RegisterImageInput[]
  ): Promise<RegisteredImage[]> =>
    registerImages({ ownerKey: 'releaseId', ownerId: releaseId, images }),
};

/**
 * Shared implementation for both artist and release image registration.
 * The sortOrder seed counts existing rows for the owner and increments per
 * insert; this matches the prior in-action behavior.
 */
async function registerImages({
  ownerKey,
  ownerId,
  images,
}: {
  ownerKey: 'artistId' | 'releaseId';
  ownerId: string;
  images: RegisterImageInput[];
}): Promise<RegisteredImage[]> {
  const existing = await prisma.image.findMany({
    where: { [ownerKey]: ownerId },
    select: { id: true },
  });
  let nextSortOrder = existing.length;

  const results: RegisteredImage[] = [];
  for (const image of images) {
    const dbImage = await prisma.image.create({
      data: {
        src: image.cdnUrl,
        caption: image.caption,
        altText: image.altText,
        [ownerKey]: ownerId,
        sortOrder: nextSortOrder,
      },
    });

    results.push({
      id: dbImage.id,
      src: dbImage.src ?? '',
      caption: dbImage.caption ?? undefined,
      altText: dbImage.altText ?? undefined,
      sortOrder: dbImage.sortOrder ?? nextSortOrder,
    });

    nextSortOrder++;
  }

  return results;
}
