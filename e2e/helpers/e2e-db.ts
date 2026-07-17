/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { PrismaClient } from '@prisma/client';

/**
 * E2E database URL — always the local Docker MongoDB container. Mirrors the
 * construction in {@link seedTestDatabase} (`e2e/helpers/seed-test-db.ts`):
 * per the E2E isolation mandate this must NEVER read a URL from `.env*`, the
 * shell, or `process.env.DATABASE_URL`. The `E2E_DATABASE_URL` fallback exists
 * only so the harness can point every child process at the same container.
 */
const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

/**
 * Hard-delete a spec-created video and every row that references it, in
 * dependency-safe order: the enrichment suggestions, the artist/producer join
 * rows, then the video itself. Used by mutating specs (draft-upload) in a
 * `finally` so the transient row never survives to poison seed-derived count
 * assertions in sibling specs.
 *
 * Uses an isolated Prisma client pinned to the local Docker Mongo — the same
 * datasource the seed uses — and disconnects in `finally` so a failed delete
 * can never leak a connection.
 */
export const deleteVideoCascade = async (videoId: string): Promise<void> => {
  const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });
  try {
    await prisma.videoEnrichmentSuggestion.deleteMany({ where: { videoId } });
    await prisma.videoArtist.deleteMany({ where: { videoId } });
    await prisma.videoProducer.deleteMany({ where: { videoId } });
    await prisma.video.deleteMany({ where: { id: videoId } });
  } finally {
    await prisma.$disconnect();
  }
};

/**
 * Hard-delete a spec-created Artist shell — but only when it has no remaining
 * VideoArtist join rows. Guards against accidentally removing a shell that a
 * parallel spec or seed row still references. Safe to call even if the artist
 * was never created (no-op when not found).
 *
 * Uses an isolated Prisma client pinned to the local Docker Mongo — the same
 * datasource the seed uses — and disconnects in `finally` so a failed delete
 * can never leak a connection.
 */
export const deleteUnlinkedArtistByDisplayName = async (displayName: string): Promise<void> => {
  const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });
  try {
    const artists = await prisma.artist.findMany({ where: { displayName } });
    for (const { id: artistId } of artists) {
      const linkedCount = await prisma.videoArtist.count({ where: { artistId } });
      if (linkedCount === 0) {
        await prisma.artist.delete({ where: { id: artistId } });
      }
    }
  } finally {
    await prisma.$disconnect();
  }
};
