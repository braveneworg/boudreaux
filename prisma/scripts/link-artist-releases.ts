/**
 * Interactive script to create ArtistRelease junction records.
 *
 * Usage:
 *   npx tsx prisma/scripts/link-artist-releases.ts <artist-slug>
 *
 * Looks up the artist by slug, shows their current linked releases,
 * then lists all unlinked releases and lets you pick which to associate.
 */

import { createInterface } from 'readline/promises';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function prompt(rl: ReturnType<typeof createInterface>, question: string): Promise<string> {
  return rl.question(question);
}

async function main(): Promise<void> {
  const slug = process.argv[2];

  if (!slug) {
    console.error('Usage: npx tsx prisma/scripts/link-artist-releases.ts <artist-slug>');
    process.exit(1);
  }

  // 1. Look up the artist
  const artist = await prisma.artist.findFirst({
    where: { slug },
    include: {
      releases: {
        include: {
          release: { select: { id: true, title: true } },
        },
      },
    },
  });

  if (!artist) {
    console.error(`Artist not found for slug: "${slug}"`);
    process.exit(1);
  }

  console.info(`\nArtist: ${artist.displayName ?? `${artist.firstName} ${artist.surname}`}`);
  console.info(`ID:     ${artist.id}`);
  console.info(`Slug:   ${artist.slug}\n`);

  // 2. Show currently linked releases
  const linkedReleaseIds = new Set(artist.releases.map((ar) => ar.releaseId));

  if (artist.releases.length > 0) {
    console.info(`Currently linked releases (${artist.releases.length}):`);
    for (const ar of artist.releases) {
      console.info(`  - ${ar.release.title}  (${ar.releaseId})`);
    }
  } else {
    console.info('No releases currently linked to this artist.');
  }

  // 3. Find all releases NOT linked to this artist
  const allReleases = await prisma.release.findMany({
    where: {
      id: { notIn: [...linkedReleaseIds] },
    },
    select: { id: true, title: true, publishedAt: true },
    orderBy: { title: 'asc' },
  });

  if (allReleases.length === 0) {
    console.info('\nAll releases are already linked to this artist. Nothing to do.');
    return;
  }

  console.info(`\nAvailable releases to link (${allReleases.length}):\n`);
  for (let i = 0; i < allReleases.length; i++) {
    const r = allReleases[i];
    const published = r.publishedAt ? 'published' : 'unpublished';
    console.info(`  [${i + 1}] ${r.title}  (${published}, ${r.id})`);
  }

  // 4. Prompt user for selection
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  try {
    const answer = await prompt(
      rl,
      '\nEnter release numbers to link (comma-separated), "all", or "none": '
    );

    const trimmed = answer.trim().toLowerCase();

    if (trimmed === 'none' || trimmed === '') {
      console.info('No changes made.');
      return;
    }

    let selectedReleases: typeof allReleases;

    if (trimmed === 'all') {
      selectedReleases = allReleases;
    } else {
      const indices = trimmed
        .split(',')
        .map((s) => parseInt(s.trim(), 10) - 1)
        .filter((i) => i >= 0 && i < allReleases.length);

      if (indices.length === 0) {
        console.error('No valid selections. Exiting.');
        return;
      }

      selectedReleases = indices.map((i) => allReleases[i]);
    }

    // 5. Show confirmation
    console.info(
      `\nWill link ${selectedReleases.length} release(s) to ${artist.displayName ?? artist.firstName}:`
    );
    for (const r of selectedReleases) {
      console.info(`  - ${r.title}`);
    }

    const confirm = await prompt(rl, '\nProceed? (y/n): ');

    if (confirm.trim().toLowerCase() !== 'y') {
      console.info('Cancelled.');
      return;
    }

    // 6. Create ArtistRelease records in a transaction
    const created = await prisma.$transaction(
      selectedReleases.map((r) =>
        prisma.artistRelease.create({
          data: {
            artistId: artist.id,
            releaseId: r.id,
          },
        })
      )
    );

    console.info(`\nCreated ${created.length} ArtistRelease record(s).`);
    for (const ar of created) {
      const release = selectedReleases.find((r) => r.id === ar.releaseId);
      console.info(`  - ${release?.title ?? ar.releaseId}  (ArtistRelease ID: ${ar.id})`);
    }
  } finally {
    rl.close();
  }
}

main()
  .catch((e: unknown) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
