/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Hand-written mirror of the Prisma `Image` model's scalar fields (no relations
 * loaded). Drift-checked against `Prisma.ImageGetPayload` in image-repository.
 */
export interface ImageRecord {
  id: string;
  caption: string | null;
  releaseId: string | null;
  createdAt: Date;
  updatedAt: Date;
  src: string | null;
  altText: string | null;
  sortOrder: number;
  urlId: string | null;
}

/** Owner scoping for an image — releases are the only owner of `Image` rows. */
export interface ImageOwnerWhere {
  releaseId: string;
}

/** Data accepted by the repository to create an image row. */
export interface CreateImageData {
  src?: string | null;
  caption?: string | null;
  altText?: string | null;
  releaseId?: string | null;
  urlId?: string | null;
  sortOrder?: number;
}
