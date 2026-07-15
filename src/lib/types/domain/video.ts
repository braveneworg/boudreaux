/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { Json } from './shared';

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
  // --- ffprobe technical metadata (probe pipeline; all nullable) ---
  probedAt: Date | null;
  probeError: string | null;
  container: string | null;
  width: number | null;
  height: number | null;
  videoCodec: string | null;
  audioCodec: string | null;
  bitrateKbps: number | null;
  frameRate: number | null;
  audioChannels: number | null;
  audioSampleRateHz: number | null;
  colorSpace: string | null;
  colorPrimaries: string | null;
  colorTransfer: string | null;
  sourceCreatedAt: Date | null;
  encoder: string | null;
  probeData: Json | null;
  // --- async web-enrichment job state (mirrors the Artist bio* fields) ---
  enrichmentStatus: string | null;
  enrichmentError: string | null;
  enrichmentStartedAt: Date | null;
  enrichmentJobToken: string | null;
  enrichmentProgress: Json | null;
  enrichedAt: Date | null;
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

/**
 * Repository payload for persisting one ffprobe pass onto a `Video` row.
 * `probedAt` is always stamped; the optional scalar fields mirror
 * `NormalizedProbe` (`@/lib/video-probe/normalize`); `probeData` carries the
 * redacted raw ffprobe JSON (already JSON-safe). A failed probe persists only
 * `probedAt` + `probeError`.
 */
export interface SaveProbeResultData {
  probedAt: Date;
  probeError?: string | null;
  probeData?: unknown;
  container?: string | null;
  width?: number | null;
  height?: number | null;
  videoCodec?: string | null;
  audioCodec?: string | null;
  bitrateKbps?: number | null;
  frameRate?: number | null;
  audioChannels?: number | null;
  audioSampleRateHz?: number | null;
  colorSpace?: string | null;
  colorPrimaries?: string | null;
  colorTransfer?: string | null;
  sourceCreatedAt?: Date | null;
  encoder?: string | null;
}

/** Pagination + filters for the admin videos listing. */
export interface VideoListFilters {
  search?: string;
  published?: boolean | null;
  archived?: boolean;
  sort?: 'asc' | 'desc';
  skip?: number;
  take?: number;
  /**
   * When set, the published filter uses a visibility clause (`publishedAt <= visibleAt`)
   * instead of the presence-based toggle (`publishedAt != null`). Used by the
   * three public reads (`findPublished`, `findManyByIds`, `searchPublished`) to
   * exclude future-dated scheduled videos from the public listing.
   */
  visibleAt?: Date;
}

/** Count filters for the admin dashboard (Prisma-free at the boundary). */
export interface VideoCountFilters {
  published?: boolean;
}
