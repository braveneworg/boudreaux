/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Hand-written, Prisma-free mirror of the `Video` model. Drift-checked against
 * its `Prisma.VideoGetPayload` counterpart in `video-repository`.
 */

/**
 * Category union mirroring the Prisma `VideoCategory` enum. Kept as a string
 * union (not the generated enum) so layers above the repository stay Prisma-free.
 */
export type VideoCategory = 'MUSIC' | 'INFORMATIONAL';

/**
 * Scalar fields of the Prisma `Video` model (no relations). Declared as a `type`
 * (not an `interface`) so video payloads built on it remain assignable to
 * `Record<string, unknown>` — the constraint the generic admin `DataView` uses.
 */
export type Video = {
  id: string;
  title: string;
  artist: string;
  category: VideoCategory;
  description: string | null;
  releasedOn: Date;
  durationSeconds: number | null;
  s3Key: string;
  fileName: string;
  fileSize: bigint | null;
  mimeType: string;
  posterUrl: string | null;
  publishedAt: Date | null;
  archivedAt: Date | null;
  createdBy: string | null;
  updatedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

/**
 * Data accepted by the repository to create a video: the writable scalars
 * (everything except the DB-managed `createdAt`/`updatedAt`). Nullable columns
 * stay optional so callers may omit them. `id` is optional so the create action
 * can thread a client-pre-generated ObjectId (used to namespace the S3 upload)
 * into the new document.
 */
export interface CreateVideoData {
  id?: string;
  title: string;
  artist: string;
  category: VideoCategory;
  description?: string | null;
  releasedOn: Date;
  durationSeconds?: number | null;
  s3Key: string;
  fileName: string;
  fileSize?: bigint | null;
  mimeType: string;
  posterUrl?: string | null;
  publishedAt?: Date | null;
  archivedAt?: Date | null;
  createdBy?: string | null;
  updatedBy?: string | null;
}

/** Data accepted by the repository to update a video (all fields optional). */
export type UpdateVideoData = Partial<CreateVideoData>;

/** Pagination + filters for the admin videos listing. */
export interface VideoListFilters {
  search?: string;
  published?: boolean | null;
  archived?: boolean;
  sort?: 'asc' | 'desc';
  skip?: number;
  take?: number;
}

/** Count filters for the admin dashboard (Prisma-free at the boundary). */
export interface VideoCountFilters {
  published?: boolean;
}
