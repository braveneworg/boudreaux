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
 * Clear a seeded video's `posterUrl` back to the null the seed writes. Used by
 * the poster-select spec in a `finally` so the pick it persists never survives
 * the test: reruns start from "nothing checked" again and any sibling spec
 * reading the row sees seeded state.
 *
 * Uses an isolated Prisma client pinned to the local Docker Mongo — the same
 * datasource the seed uses — and disconnects in `finally` so a failed update
 * can never leak a connection.
 */
export const resetVideoPosterUrl = async (videoId: string): Promise<void> => {
  const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });
  try {
    // updateMany, not update: a no-op is preferable to a P2025 throw masking
    // the real failure when the test bailed before the row existed.
    await prisma.video.updateMany({ where: { id: videoId }, data: { posterUrl: null } });
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

/** The text fields of a featured artist the edit form can clear. */
export interface FeaturedArtistText {
  displayName: string | null;
  description: string | null;
}

/**
 * Create an unpublished featured artist on the seeded E2E Album One (and its
 * MP3 format, so the edit form can save), for a spec that edits it. It sorts
 * after the seeded spotlight (`position` 999) and is never published, so the
 * admin list's first row and the home grid stay the seeded ones while it
 * exists. It credits no artists, so deleting it leaves no id behind on a
 * seeded artist. Delete it by the returned id with {@link deleteFeaturedArtist}.
 */
export const createEditableFeaturedArtist = async ({
  displayName,
  description,
}: {
  displayName: string;
  description: string;
}): Promise<string> => {
  const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });
  try {
    const release = await prisma.release.findFirstOrThrow({ where: { title: 'E2E Album One' } });
    const format = await prisma.releaseDigitalFormat.findFirstOrThrow({
      where: { releaseId: release.id, formatType: 'MP3_320KBPS' },
    });
    const created = await prisma.featuredArtist.create({
      data: {
        displayName,
        description,
        position: 999,
        featuredOn: new Date('2020-01-01T00:00:00.000Z'),
        release: { connect: { id: release.id } },
        digitalFormat: { connect: { id: format.id } },
      },
    });
    return created.id;
  } finally {
    await prisma.$disconnect();
  }
};

/** Read the clearable text fields of one featured artist, or `null` when it is gone. */
export const readFeaturedArtistText = async (id: string): Promise<FeaturedArtistText | null> => {
  const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });
  try {
    return await prisma.featuredArtist.findUnique({
      where: { id },
      select: { displayName: true, description: true },
    });
  } finally {
    await prisma.$disconnect();
  }
};

/**
 * Hard-delete one spec-created featured artist by id. `deleteMany`, so a test
 * that bailed before the row existed does not mask its real failure.
 */
export const deleteFeaturedArtist = async (id: string): Promise<void> => {
  const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });
  try {
    await prisma.featuredArtist.deleteMany({ where: { id } });
  } finally {
    await prisma.$disconnect();
  }
};
