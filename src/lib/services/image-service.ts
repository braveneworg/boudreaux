/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { ImageRepository } from '@/lib/repositories/image-repository';

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
const registerImages = async ({
  ownerKey,
  ownerId,
  images,
}: {
  ownerKey: 'artistId' | 'releaseId';
  ownerId: string;
  images: RegisterImageInput[];
}): Promise<RegisteredImage[]> => {
  const ownerData = ownerKey === 'artistId' ? { artistId: ownerId } : { releaseId: ownerId };
  const existing = await ImageRepository.findManyByOwner(ownerData, { id: true });
  const baseSortOrder = existing.length;

  // Inserts are independent — sortOrder is derived deterministically from the
  // existing-row count plus the input index, so the creates run concurrently
  // and Promise.all preserves input order in the returned array.
  const results = await Promise.all(
    images.map(async (image, index) => {
      const sortOrder = baseSortOrder + index;
      const dbImage = await ImageRepository.create({
        src: image.cdnUrl,
        caption: image.caption,
        altText: image.altText,
        ...ownerData,
        sortOrder,
      });

      return {
        id: dbImage.id,
        src: dbImage.src ?? '',
        caption: dbImage.caption ?? undefined,
        altText: dbImage.altText ?? undefined,
        sortOrder: dbImage.sortOrder ?? sortOrder,
      };
    })
  );

  return results;
};
