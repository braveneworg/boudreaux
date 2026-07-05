#!/usr/bin/env node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * ⚠️  READ THIS BEFORE RUNNING — PUBLIC VISIBILITY WARNING ⚠️
 *
 * One-shot migration: copy admin `artist.images` (Image rows) into `bioImages`
 * (ArtistBioImage rows) so that manually uploaded artist photos appear in the
 * bio image palette alongside AI-discovered images.
 *
 * IMPORTANT — PUBLICLY VISIBLE AFTER MIGRATION:
 *   The public artist DETAIL page renders every `bioImages` row for an artist.
 *   Once migrated, these images become **publicly visible** for any artist that
 *   has at least one bioImage (including the newly migrated rows). All migrated
 *   rows are `isPrimary: false`, so they NEVER appear on the public artist INDEX
 *   card (which queries only `isPrimary: true` rows). Review the data before
 *   running `--execute` against production.
 *
 * Defaults to a dry-run (counts only, no writes). Pass `--execute` to write.
 * The migration is fully idempotent: re-running skips any image whose `src` URL
 * already exists as a `bioImages.url` for that artist (exact-URL match).
 *
 * Counts returned / logged:
 *   scanned  — total Image rows iterated (all images, including null/empty src)
 *   migrated — images created (or would-be-created in dry-run)
 *   skipped  — images not migrated (null/empty src, or URL already in bioImages)
 *   scanned = migrated + skipped always holds.
 *
 * Usage:
 *   pnpm exec tsx scripts/migrate-artist-images-to-bio-images.ts            # dry-run
 *   pnpm exec tsx scripts/migrate-artist-images-to-bio-images.ts --execute  # apply
 *
 * Required env: DATABASE_URL (the target database — dev first, then production).
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

import type { Prisma } from '@prisma/client';

dotenv.config({ path: '.env.local' });
dotenv.config();

/** Minimal image fields needed to map an admin image to a bio image. */
interface MigratableImage {
  src: string | null;
  caption: string | null;
  altText: string | null;
  sortOrder: number;
}

/** Image where `src` is guaranteed non-empty — validated by the caller. */
interface ValidatedImage extends MigratableImage {
  src: string;
}

/** Minimal artist fields needed for the migration loop. */
interface MigratableArtist {
  id: string;
  displayName: string | null;
  images: MigratableImage[];
  bioImages: { url: string }[];
}

/** Per-artist result aggregated into the overall summary. */
interface ArtistMigrationResult {
  scanned: number;
  migrated: number;
  skipped: number;
}

/**
 * Builds the `artistBioImage.create` data from a validated (non-empty-src) image.
 * Attribution precedence: caption → altText → 'Uploaded'.
 */
const mapImageToBioImage = (
  { src, caption, altText, sortOrder }: ValidatedImage,
  artistId: string
): Prisma.ArtistBioImageUncheckedCreateInput => ({
  url: src,
  title: caption,
  alt: altText,
  attribution: caption ?? altText ?? 'Uploaded',
  kind: 'upload',
  isPrimary: false,
  sortOrder,
  artistId,
});

/**
 * Migrates one artist's images. Returns per-artist scanned/migrated/skipped counts.
 * In dry-run mode (`execute = false`) creates are counted but not performed.
 */
const migrateArtist = async (
  prisma: PrismaClient,
  { id, displayName, images, bioImages }: MigratableArtist,
  execute: boolean
): Promise<ArtistMigrationResult> => {
  const existingUrls = new Set(bioImages.map(({ url }) => url));
  let migrated = 0;
  let skipped = 0;

  for (const image of images) {
    if (!image.src) {
      skipped++;
      continue;
    }

    const { src, caption, altText, sortOrder } = image;

    if (existingUrls.has(src)) {
      skipped++;
      continue;
    }

    const data = mapImageToBioImage({ src, caption, altText, sortOrder }, id);

    if (execute) {
      await prisma.artistBioImage.create({ data });
    }

    migrated++;
  }

  const label = displayName ?? id;
  console.info(
    `[migrate-artist-images] ${label}: scanned=${images.length}, migrated=${migrated}, skipped=${skipped}`
  );

  return { scanned: images.length, migrated, skipped };
};

/**
 * Orchestrate the dry-run / execute flow for all artists, owning the Prisma
 * client unless one is injected (injection is used by tests to avoid real DB).
 */
export const migrateArtistImagesToBioImages = async (
  argv: string[],
  injectedPrisma?: PrismaClient
): Promise<{ scanned: number; migrated: number; skipped: number }> => {
  const execute = argv.includes('--execute');
  const prisma = injectedPrisma ?? new PrismaClient();

  try {
    const artists = await prisma.artist.findMany({
      include: {
        images: { orderBy: { sortOrder: 'asc' } },
        bioImages: { select: { url: true } },
      },
    });

    let scanned = 0;
    let migrated = 0;
    let skipped = 0;

    for (const artist of artists) {
      const result = await migrateArtist(prisma, artist, execute);
      scanned += result.scanned;
      migrated += result.migrated;
      skipped += result.skipped;
    }

    const mode = execute ? 'EXECUTE' : 'DRY RUN';
    console.info(
      `[migrate-artist-images] ${mode} complete — scanned: ${scanned}, migrated: ${migrated}, skipped: ${skipped}`
    );

    return { scanned, migrated, skipped };
  } finally {
    if (!injectedPrisma) {
      await prisma.$disconnect();
    }
  }
};

/* istanbul ignore next -- top-level CLI entry */
if (process.argv[1]?.endsWith('migrate-artist-images-to-bio-images.ts')) {
  migrateArtistImagesToBioImages(process.argv.slice(2))
    .then(({ scanned, migrated, skipped }) => {
      console.info(
        `[migrate-artist-images] Finished — scanned: ${scanned}, migrated: ${migrated}, skipped: ${skipped}`
      );
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
