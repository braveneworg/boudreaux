/* Diagnostic — sample what shape cover-art URLs actually take in the DB. */
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const prisma = new PrismaClient();

function classify(value: string | null): string {
  if (!value) return 'null/empty';
  if (value.startsWith('data:')) return 'data:URI';
  if (value.startsWith('http')) return 'http(s) URL';
  if (value.startsWith('/')) return 'relative path';
  return 'other';
}

function head(value: string | null, n = 80): string {
  if (!value) return '<null>';
  return value.length > n ? value.substring(0, n) + '...' : value;
}

function extension(value: string | null): string {
  if (!value) return '<null>';
  const cleaned = value.split('?')[0].split('#')[0];
  const dot = cleaned.lastIndexOf('.');
  return dot === -1 ? '<no ext>' : cleaned.substring(dot).toLowerCase();
}

async function main() {
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

  console.info('\n=== Release.coverArt extension breakdown ===');
  const extCounts: Record<string, number> = {};
  const allReleasesForExt = await prisma.release.findMany({ select: { coverArt: true } });
  for (const r of allReleasesForExt) {
    const ext = extension(r.coverArt);
    extCounts[ext] = (extCounts[ext] ?? 0) + 1;
  }
  console.info(' ', extCounts);

  console.info('\n=== Image.src extension breakdown ===');
  const imgExtCounts: Record<string, number> = {};
  const allImgsForExt = await prisma.image.findMany({ select: { src: true } });
  for (const img of allImgsForExt) {
    const ext = extension(img.src);
    imgExtCounts[ext] = (imgExtCounts[ext] ?? 0) + 1;
  }
  console.info(' ', imgExtCounts);

  console.info('\n=== Counts by classification ===');
  const allImageSrcs = await prisma.image.findMany({ select: { src: true } });
  const counts: Record<string, number> = {};
  for (const img of allImageSrcs) {
    const k = classify(img.src);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  console.info('  Image.src:', counts);

  const allReleaseCovers = await prisma.release.findMany({ select: { coverArt: true } });
  const releaseCounts: Record<string, number> = {};
  for (const r of allReleaseCovers) {
    const k = classify(r.coverArt);
    releaseCounts[k] = (releaseCounts[k] ?? 0) + 1;
  }
  console.info('  Release.coverArt:', releaseCounts);

  const allFaCovers = await prisma.featuredArtist.findMany({ select: { coverArt: true } });
  const faCounts: Record<string, number> = {};
  for (const fa of allFaCovers) {
    const k = classify(fa.coverArt);
    faCounts[k] = (faCounts[k] ?? 0) + 1;
  }
  console.info('  FeaturedArtist.coverArt:', faCounts);
}

main()
  .then(() => prisma.$disconnect())
  .catch((err) => {
    console.error(err);
    return prisma.$disconnect().then(() => process.exit(1));
  });
