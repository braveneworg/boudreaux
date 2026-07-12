/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { Json } from '@/lib/types/domain/shared';
import type { VideoCategory } from '@/lib/types/domain/video';

/**
 * Hand-written, Prisma-free mirror of the `VideoEnrichmentSuggestion` model.
 * Drift-checked against its Prisma payload in
 * `video-enrichment-suggestion-repository.ts`.
 */
export interface VideoEnrichmentSuggestionRecord {
  id: string;
  videoId: string;
  /** Null for the video-level `releasedOn` suggestion. */
  artistId: string | null;
  field: string;
  value: string;
  confidence: string;
  /** `Array<{ url, label? }>` as persisted JSON; parsed defensively on read. */
  sources: Json;
  note: string | null;
  status: string;
  appliedAt: Date | null;
  appliedBy: string | null;
  createdAt: Date;
}

/** One suggestion row to insert as `pending` (id/status/timestamps are DB-owned). */
export interface CreateSuggestionRow {
  artistId: string | null;
  field: string;
  value: string;
  confidence: string;
  sources: Json;
  note: string | null;
}

/**
 * Projection for the enrichment job lifecycle plus the video context the
 * dispatch payload and status endpoint need.
 */
export interface VideoEnrichmentState {
  id: string;
  enrichmentStatus: string | null;
  enrichmentError: string | null;
  enrichmentStartedAt: Date | null;
  enrichmentJobToken: string | null;
  enrichmentProgress: Json | null;
  enrichedAt: Date | null;
  category: VideoCategory;
  artist: string;
  title: string;
  releasedOn: Date;
  s3Key: string;
}
