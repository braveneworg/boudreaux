/**
 * Interactive script to create ArtistRelease junction records.
 *
 * Usage:
 *   pnpm exec tsx prisma/scripts/link-artist-releases.ts <artist-slug>
 *
 * Looks up the artist by slug, shows their current linked releases,
 * then lists all unlinked releases and lets you pick which to associate.
 */

import { createInterface } from 'readline/promises';

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const prompt = (rl: ReturnType<typeof createInterface>, question: string): Promise<string> =>
  rl.question(question);

type ArtistWithReleases = NonNullable<Awaited<ReturnType<typeof findArtistWithReleases>>>;
type UnlinkedRelease = { id: string; title: string; publishedAt: Date | null };

// 1. Look up the artist and their currently linked releases.
const findArtistWithReleases = (slug: string) =>
  prisma.artist.findFirst({
    where: { slug },
    include: {
      releases: {
        include: {
          release: { select: { id: true, title: true } },
        },
      },
    },
  });

// Print the artist header and currently linked releases (steps 2 in main).
const printArtistAndLinks = (artist: ArtistWithReleases): void => {
  console.info(`\nArtist: ${artist.displayName ?? `${artist.firstName} ${artist.surname}`}`);
  console.info(`ID:     ${artist.id}`);
  console.info(`Slug:   ${artist.slug}\n`);

  if (artist.releases.length > 0) {
    console.info(`Currently linked releases (${artist.releases.length}):`);
    for (const ar of artist.releases) {
      console.info(`  - ${ar.release.title}  (${ar.releaseId})`);
    }
  } else {
    console.info('No releases currently linked to this artist.');
  }
};

// 3. Find all releases NOT already linked to this artist.
const findUnlinkedReleases = (linkedReleaseIds: Set<string>): Promise<UnlinkedRelease[]> =>
  prisma.release.findMany({
    where: {
      id: { notIn: [...linkedReleaseIds] },
    },
    select: { id: true, title: true, publishedAt: true },
    orderBy: { title: 'asc' },
  });

const printAvailableReleases = (allReleases: UnlinkedRelease[]): void => {
  console.info(`\nAvailable releases to link (${allReleases.length}):\n`);
  for (const [i, r] of allReleases.entries()) {
    const published = r.publishedAt ? 'published' : 'unpublished';
    console.info(`  [${i + 1}] ${r.title}  (${published}, ${r.id})`);
  }
};

// Resolve the user's raw selection into the chosen releases.
// Returns `null` when there are no valid selections (caller reports + aborts).
const parseSelection = ({
  trimmed,
  allReleases,
}: {
  trimmed: string;
  allReleases: UnlinkedRelease[];
}): UnlinkedRelease[] | null => {
  if (trimmed === 'all') {
    return allReleases;
  }

  const indices = trimmed
    .split(',')
    .map((s) => parseInt(s.trim(), 10) - 1)
    .filter((i) => i >= 0 && i < allReleases.length);

  if (indices.length === 0) {
    return null;
  }

  return indices.flatMap((i) => {
    const release = allReleases.at(i);
    return release ? [release] : [];
  });
};

// 6. Create ArtistRelease records in a transaction and report what was created.
const createArtistReleases = async ({
  artist,
  selectedReleases,
}: {
  artist: ArtistWithReleases;
  selectedReleases: UnlinkedRelease[];
}): Promise<void> => {
  const created = await prisma.$transaction(
    selectedReleases.map((r: { id: string }) =>
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
    const release = selectedReleases.find((r: { id: string }) => r.id === ar.releaseId);
    console.info(`  - ${release?.title ?? ar.releaseId}  (ArtistRelease ID: ${ar.id})`);
  }
};

// Drive the interactive prompt → confirm → create flow (steps 4–6 in main).
// Owns the readline lifecycle so `main` stays within the function-length limit.
const runInteractiveLinking = async ({
  artist,
  allReleases,
}: {
  artist: ArtistWithReleases;
  allReleases: UnlinkedRelease[];
}): Promise<void> => {
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

    const selectedReleases = parseSelection({ trimmed, allReleases });

    if (!selectedReleases) {
      console.error('No valid selections. Exiting.');
      return;
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

    await createArtistReleases({ artist, selectedReleases });
  } finally {
    rl.close();
  }
};

const main = async (): Promise<void> => {
  const slug = process.argv[2];

  if (!slug) {
    console.error('Usage: pnpm exec tsx prisma/scripts/link-artist-releases.ts <artist-slug>');
    process.exit(1);
  }

  // 1. Look up the artist
  const artist = await findArtistWithReleases(slug);

  if (!artist) {
    console.error(`Artist not found for slug: "${slug}"`);
    process.exit(1);
  }

  // 2. Show artist header + currently linked releases
  printArtistAndLinks(artist);

  const linkedReleaseIds = new Set(
    artist.releases.map((ar: { releaseId: string }) => ar.releaseId)
  );

  // 3. Find all releases NOT linked to this artist
  const allReleases = await findUnlinkedReleases(linkedReleaseIds);

  if (allReleases.length === 0) {
    console.info('\nAll releases are already linked to this artist. Nothing to do.');
    return;
  }

  printAvailableReleases(allReleases);

  // 4–6. Prompt for selection, confirm, and create the links
  await runInteractiveLinking({ artist, allReleases });
};

main()
  .catch((e: unknown) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
