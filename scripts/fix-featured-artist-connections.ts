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

const prisma = new PrismaClient();
const isDryRun = process.argv.includes('--dry-run');

async function main() {
  console.info(isDryRun ? '=== DRY RUN ===' : '=== LIVE RUN ===');

  // Find all featured artists with their connected artists and release artists
  const featuredArtists = await prisma.featuredArtist.findMany({
    include: {
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
    },
  });

  console.info(`Found ${featuredArtists.length} featured artist(s)\n`);

  let fixedCount = 0;

  for (const fa of featuredArtists) {
    const name = fa.displayName || `(id: ${fa.id})`;
    const hasArtists = fa.artists.length > 0;
    const releaseArtists = fa.release?.artistReleases?.map((ar) => ar.artist) ?? [];

    if (hasArtists) {
      const artistNames = fa.artists
        .map((a) => a.displayName || `${a.firstName} ${a.surname}`.trim() || a.id)
        .join(', ');
      console.info(`✓ ${name} — already has ${fa.artists.length} artist(s): ${artistNames}`);
      continue;
    }

    if (releaseArtists.length === 0) {
      console.info(
        `⚠ ${name} — no connected artists and no release artists to backfill from${fa.releaseId ? ` (release: ${fa.releaseId})` : ' (no release linked)'}`
      );
      continue;
    }

    const artistNames = releaseArtists
      .map((a) => a.displayName || `${a.firstName} ${a.surname}`.trim() || a.id)
      .join(', ');
    console.info(`→ ${name} — connecting ${releaseArtists.length} artist(s): ${artistNames}`);

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

    fixedCount++;
  }

  console.info(`\n${isDryRun ? 'Would fix' : 'Fixed'} ${fixedCount} featured artist(s)`);
}

main()
  .catch((err) => {
    console.error('Script failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
