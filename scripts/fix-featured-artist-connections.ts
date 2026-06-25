/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Backfill script: connect artists to featured artists via the release's artistReleases.
 *
 * Problem: FeaturedArtist records were created without connecting Artist records,
 * causing "Unknown Artist" to display. This script finds featured artists that
 * have a linked release but no connected artists, then sets each Artist's
 * `featuredArtistId` to link them.
 *
 * Usage: pnpm exec tsx scripts/fix-featured-artist-connections.ts
 *        Add --dry-run to preview without making changes.
 */

import { PrismaClient } from '@prisma/client';

import type { Prisma } from '@prisma/client';

const prisma = new PrismaClient();
const isDryRun = process.argv.includes('--dry-run');

/** The artist fields selected for display/connection below. */
interface SelectedArtist {
  id: string;
  displayName: string | null;
  firstName: string | null;
  surname: string | null;
}

/** The include shape used to load featured artists with their (release) artists. */
const featuredArtistInclude = {
  artists: { select: { id: true, displayName: true, firstName: true, surname: true } },
  release: {
    include: {
      artistReleases: {
        include: {
          artist: { select: { id: true, displayName: true, firstName: true, surname: true } },
        },
      },
    },
  },
} as const satisfies Prisma.FeaturedArtistInclude;

type FeaturedArtistWithArtists = Prisma.FeaturedArtistGetPayload<{
  include: typeof featuredArtistInclude;
}>;

/** A human-friendly artist label: display name, else full name, else id. */
const artistLabel = (artist: SelectedArtist): string =>
  artist.displayName || `${artist.firstName} ${artist.surname}`.trim() || artist.id;

/** Comma-joined labels for a list of artists. */
const artistNameList = (artists: SelectedArtist[]): string => artists.map(artistLabel).join(', ');

/**
 * Inspect one featured artist and, unless already connected or lacking release
 * artists, connect its release's artists. Logs the outcome and returns whether
 * a (would-be) fix was applied — extracted from main to keep complexity in check.
 */
const processFeaturedArtist = async (fa: FeaturedArtistWithArtists): Promise<boolean> => {
  const name = fa.displayName || `(id: ${fa.id})`;
  const releaseArtists = fa.release?.artistReleases?.map((ar) => ar.artist) ?? [];

  if (fa.artists.length > 0) {
    console.info(
      `✓ ${name} — already has ${fa.artists.length} artist(s): ${artistNameList(fa.artists)}`
    );
    return false;
  }

  if (releaseArtists.length === 0) {
    const reason = fa.releaseId ? ` (release: ${fa.releaseId})` : ' (no release linked)';
    console.info(
      `⚠ ${name} — no connected artists and no release artists to backfill from${reason}`
    );
    return false;
  }

  console.info(
    `→ ${name} — connecting ${releaseArtists.length} artist(s): ${artistNameList(releaseArtists)}`
  );

  if (!isDryRun) {
    // Set featuredArtistId on each Artist to link them to this FeaturedArtist
    await prisma.featuredArtist.update({
      where: { id: fa.id },
      data: {
        artists: {
          connect: releaseArtists.map((a) => ({ id: a.id })),
        },
      },
    });
  }

  return true;
};

const main = async () => {
  console.info(isDryRun ? '=== DRY RUN ===' : '=== LIVE RUN ===');

  // Find all featured artists with their connected artists and release artists
  const featuredArtists = await prisma.featuredArtist.findMany({
    include: featuredArtistInclude,
  });

  console.info(`Found ${featuredArtists.length} featured artist(s)\n`);

  let fixedCount = 0;

  for (const fa of featuredArtists) {
    if (await processFeaturedArtist(fa)) {
      fixedCount++;
    }
  }

  console.info(`\n${isDryRun ? 'Would fix' : 'Fixed'} ${fixedCount} featured artist(s)`);
};

main()
  .catch((err) => {
    console.error('Script failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
