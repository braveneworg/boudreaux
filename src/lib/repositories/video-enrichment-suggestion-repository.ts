/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { prisma } from '@/lib/prisma';
import type { Json } from '@/lib/types/domain/shared';
import type {
  CreateSuggestionRow,
  VideoEnrichmentSuggestionRecord,
} from '@/lib/types/domain/video-enrichment';

import { runQuery } from './_internal/map-prisma-error';

import type { AssertExact } from './_internal/drift';
import type { Prisma } from '@prisma/client';

// Compile-time drift guard: fails `pnpm run typecheck` if the hand-written
// domain record diverges from the Prisma scalar payload (same idiom as
// `video-repository.ts`). If this errors, align the mirror in
// `@/lib/types/domain/video-enrichment` with `prisma/schema.prisma`.
type _SuggestionDrift = AssertExact<
  VideoEnrichmentSuggestionRecord,
  Prisma.VideoEnrichmentSuggestionGetPayload<Record<string, never>>
>;
const _suggestionDrift: _SuggestionDrift = true;

/**
 * Suggestion sources arrive as domain `Json` (a JSON-safe value validated
 * upstream; never a top-level null for `sources`); narrow it for Prisma's
 * required-Json column input (same idiom as `toPrismaJson` in
 * `video-repository.ts`).
 */
const toPrismaSources = (value: Json): Prisma.InputJsonValue => value as Prisma.InputJsonValue;

/**
 * Data-access layer for the `VideoEnrichmentSuggestion` model. Re-runs replace
 * only PENDING rows — applied/dismissed rows survive as an audit trail and
 * fence re-discovered facts (see `findExistingFacts`).
 */
export class VideoEnrichmentSuggestionRepository {
  /** Replace the video's pending rows with a fresh batch in one transaction. */
  static async replacePending(videoId: string, rows: CreateSuggestionRow[]): Promise<void> {
    await runQuery(() =>
      prisma.$transaction(async (tx) => {
        await tx.videoEnrichmentSuggestion.deleteMany({
          where: { videoId, status: 'pending' },
        });
        if (rows.length > 0) {
          await tx.videoEnrichmentSuggestion.createMany({
            data: rows.map(({ sources, ...rest }) => ({
              ...rest,
              sources: toPrismaSources(sources),
              videoId,
              status: 'pending',
            })),
          });
        }
      })
    );
  }

  /** All suggestion rows for a video, oldest first. */
  static async findByVideoId(videoId: string): Promise<VideoEnrichmentSuggestionRecord[]> {
    return runQuery(() =>
      prisma.videoEnrichmentSuggestion.findMany({
        where: { videoId },
        orderBy: { createdAt: 'asc' },
      })
    );
  }

  /** One suggestion row by id, or null. */
  static async findById(id: string): Promise<VideoEnrichmentSuggestionRecord | null> {
    return runQuery(() => prisma.videoEnrichmentSuggestion.findUnique({ where: { id } }));
  }

  /**
   * Atomically flip a PENDING row to applied, stamping the audit fields.
   * Returns true iff THIS caller won (updateMany count > 0) — a concurrent
   * apply/dismiss of the same row loses.
   */
  static async markApplied(id: string, userId: string): Promise<boolean> {
    const result = await runQuery(() =>
      prisma.videoEnrichmentSuggestion.updateMany({
        where: { id, status: 'pending' },
        data: { status: 'applied', appliedAt: new Date(), appliedBy: userId },
      })
    );
    return result.count > 0;
  }

  /** Atomically flip a PENDING row to dismissed. True iff this caller won. */
  static async markDismissed(id: string): Promise<boolean> {
    const result = await runQuery(() =>
      prisma.videoEnrichmentSuggestion.updateMany({
        where: { id, status: 'pending' },
        data: { status: 'dismissed' },
      })
    );
    return result.count > 0;
  }

  /** Applied/dismissed facts that fence re-discovered suggestions on re-run. */
  static async findExistingFacts(
    videoId: string
  ): Promise<Array<{ artistId: string | null; field: string; value: string }>> {
    return runQuery(() =>
      prisma.videoEnrichmentSuggestion.findMany({
        where: { videoId, status: { in: ['applied', 'dismissed'] } },
        select: { artistId: true, field: true, value: true },
      })
    );
  }

  /** Drop pending rows for artists detached by an artist-string re-sync. */
  static async deletePendingForArtists(videoId: string, artistIds: string[]): Promise<void> {
    if (artistIds.length === 0) return;
    await runQuery(() =>
      prisma.videoEnrichmentSuggestion.deleteMany({
        where: { videoId, status: 'pending', artistId: { in: artistIds } },
      })
    );
  }
}
