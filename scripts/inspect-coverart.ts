/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
/* Diagnostic — sample what shape cover-art URLs actually take in the DB. */
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const prisma = new PrismaClient();

const classify = (value: string | null): string => {
  if (!value) return 'null/empty';
  if (value.startsWith('data:')) return 'data:URI';
  if (value.startsWith('http')) return 'http(s) URL';
  if (value.startsWith('/')) return 'relative path';
  return 'other';
};

const head = (value: string | null, n = 80): string => {
  if (!value) return '<null>';
  return value.length > n ? value.substring(0, n) + '...' : value;
};

const extension = (value: string | null): string => {
  if (!value) return '<null>';
  const cleaned = value.split('?')[0].split('#')[0];
  const dot = cleaned.lastIndexOf('.');
  return dot === -1 ? '<no ext>' : cleaned.substring(dot).toLowerCase();
};

/** Tally values into a `key → count` object using the given classifier. */
const countBy = (
  values: (string | null)[],
  classifier: (value: string | null) => string
): {
  [key: string]: number;
} => {
  const counts = new Map<string, number>();
  for (const value of values) {
    const key = classifier(value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return Object.fromEntries(counts);
};

/** Print the Release/FeaturedArtist/Image sample sections. */
const printSamples = async (): Promise<void> => {
  console.info('=== Release.coverArt sample (10) — FULL URLs ===');
  const releases = await prisma.release.findMany({
    select: { id: true, title: true, coverArt: true },
    take: 10,
  });
  for (const r of releases) {
    console.info(`  ext=${extension(r.coverArt)} title=${r.title?.substring(0, 30)}`);
    console.info(`    ${r.coverArt ?? '<null>'}`);
  }

  console.info('\n=== FeaturedArtist.coverArt sample (10) ===');
  const fas = await prisma.featuredArtist.findMany({
    select: { id: true, coverArt: true },
    take: 10,
  });
  for (const fa of fas) {
    console.info(`  [${classify(fa.coverArt)}] ${fa.id}: ${head(fa.coverArt, 200)}`);
  }

  console.info('\n=== Image.src sample (15) — FULL URLs ===');
  const images = await prisma.image.findMany({
    select: { id: true, src: true, artistId: true, releaseId: true },
    take: 15,
  });
  for (const img of images) {
    const owner = img.artistId ? `artist ${img.artistId}` : `release ${img.releaseId}`;
    console.info(`  ext=${extension(img.src)} owner=${owner}`);
    console.info(`    ${img.src ?? '<null>'}`);
  }
};

/** Print the extension-breakdown sections for Release.coverArt and Image.src. */
const printExtensionBreakdowns = async (): Promise<void> => {
  console.info('\n=== Release.coverArt extension breakdown ===');
  const allReleasesForExt = await prisma.release.findMany({ select: { coverArt: true } });
  console.info(
    ' ',
    countBy(
      allReleasesForExt.map((r) => r.coverArt),
      extension
    )
  );

  console.info('\n=== Image.src extension breakdown ===');
  const allImgsForExt = await prisma.image.findMany({ select: { src: true } });
  console.info(
    ' ',
    countBy(
      allImgsForExt.map((img) => img.src),
      extension
    )
  );
};

/** Print the classification-count sections across all three models. */
const printClassificationCounts = async (): Promise<void> => {
  console.info('\n=== Counts by classification ===');
  const allImageSrcs = await prisma.image.findMany({ select: { src: true } });
  console.info(
    '  Image.src:',
    countBy(
      allImageSrcs.map((img) => img.src),
      classify
    )
  );

  const allReleaseCovers = await prisma.release.findMany({ select: { coverArt: true } });
  console.info(
    '  Release.coverArt:',
    countBy(
      allReleaseCovers.map((r) => r.coverArt),
      classify
    )
  );

  const allFaCovers = await prisma.featuredArtist.findMany({ select: { coverArt: true } });
  console.info(
    '  FeaturedArtist.coverArt:',
    countBy(
      allFaCovers.map((fa) => fa.coverArt),
      classify
    )
  );
};

const main = async () => {
  await printSamples();
  await printExtensionBreakdowns();
  await printClassificationCounts();
};

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error(err);
    return prisma.$disconnect().then(() => process.exit(1));
  });
