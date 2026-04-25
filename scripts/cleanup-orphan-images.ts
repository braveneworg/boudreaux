#!/usr/bin/env node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One-shot cleanup: delete S3 objects under a prefix that no DB row
 * references. Targets the random-UUID orphans accumulated by older versions
 * of `CoverArtField` (when each upload created a fresh `crypto.randomUUID()`
 * directory) plus anything else that drifted out of sync with the DB.
 *
 * Defaults to dry-run AND `media/featured-artists/` since that's the prefix
 * with the most accumulated drift. Use `--prefix` to point it elsewhere.
 *
 * Algorithm — directory-level matching:
 *   1. Collect every DB-referenced cover-art URL (Release.coverArt,
 *      FeaturedArtist.coverArt, Image.src), reduce to S3 keys.
 *   2. From those keys, build the set of "referenced directories" (parent
 *      prefixes ending in `/`).
 *   3. Walk S3 under the requested prefix. Any object whose parent directory
 *      is NOT in the referenced set is an orphan.
 *
 * Why directory-level: the variant generator emits siblings (`cover_w640.webp`,
 * etc.) under the same prefix as the original. The DB only references the
 * original, but the variants are legitimate. As long as ANY file in a directory
 * is DB-referenced, every file in that directory is kept.
 *
 * Usage:
 *   pnpm run images:cleanup-orphans
 *   pnpm run images:cleanup-orphans -- --execute
 *   pnpm run images:cleanup-orphans -- --execute --prefix media/releases/coverart/
 *   pnpm run images:cleanup-orphans -- --execute --no-invalidate
 *
 * Required env: S3_BUCKET, DATABASE_URL, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 * Optional env: AWS_REGION (default us-east-1), CLOUDFRONT_DISTRIBUTION_ID
 */

import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { DeleteObjectsCommand, ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  reset: '\x1b[0m',
};

function log(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
  const tag = {
    info: colors.blue,
    success: colors.green,
    warning: colors.yellow,
    error: colors.red,
  }[type];
  const line = `${tag}[CLEANUP-ORPHANS]${colors.reset} ${message}`;
  if (type === 'error') console.error(line);
  else if (type === 'warning') console.warn(line);
  else console.info(line);
}

interface CliOptions {
  prefix: string;
  execute: boolean;
  invalidate: boolean;
  help: boolean;
}

export function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    prefix: 'media/featured-artists/',
    execute: false,
    invalidate: true,
    help: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--execute') opts.execute = true;
    else if (arg === '--no-invalidate') opts.invalidate = false;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if ((arg === '--prefix' || arg === '-p') && i + 1 < argv.length) {
      opts.prefix = argv[++i];
      if (!opts.prefix.endsWith('/')) opts.prefix += '/';
    }
  }
  return opts;
}

/** Extract the S3 key from a CDN/HTTPS URL. Returns null for non-URL inputs. */
export function extractS3KeyFromUrl(url: string | null | undefined): string | null {
  if (!url || typeof url !== 'string') return null;
  if (!/^https?:\/\//.test(url)) return null;
  try {
    return decodeURIComponent(new URL(url).pathname).replace(/^\//, '');
  } catch {
    return null;
  }
}

/** Parent prefix of an S3 key, including the trailing slash. */
export function parentPrefix(key: string): string {
  const lastSlash = key.lastIndexOf('/');
  return lastSlash === -1 ? '' : key.substring(0, lastSlash + 1);
}

async function listAllKeys(s3: S3Client, bucket: string, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | undefined;
  do {
    const response = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
      })
    );
    for (const obj of response.Contents ?? []) {
      if (obj.Key) keys.push(obj.Key);
    }
    token = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (token);
  return keys;
}

const HELP = `
${colors.cyan}Cleanup S3 orphan images${colors.reset}

Walks an S3 prefix and deletes objects whose parent directory contains no
DB-referenced cover-art URL. Directory-level matching keeps width variants
(\`cover_w640.webp\`, etc.) safe alongside their referenced original.

${colors.yellow}Usage:${colors.reset}
  pnpm run images:cleanup-orphans
  pnpm run images:cleanup-orphans -- --execute
  pnpm run images:cleanup-orphans -- --execute --prefix media/releases/coverart/
  pnpm run images:cleanup-orphans -- --execute --no-invalidate

${colors.yellow}Flags:${colors.reset}
  --execute              Actually delete (default: dry-run)
  --prefix <prefix>      S3 prefix to scan (default: media/featured-artists/)
  --no-invalidate        Skip CloudFront cache invalidation
  --help, -h             Print usage

${colors.yellow}Required env:${colors.reset} S3_BUCKET, DATABASE_URL, AWS_*
${colors.yellow}Optional env:${colors.reset} AWS_REGION (default us-east-1), CLOUDFRONT_DISTRIBUTION_ID
`;

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.info(HELP);
    return;
  }

  const bucket = process.env.S3_BUCKET;
  const region = process.env.AWS_REGION ?? 'us-east-1';
  if (!bucket) {
    log('S3_BUCKET env var is required', 'error');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    log('DATABASE_URL env var is required', 'error');
    process.exit(1);
  }

  const s3 = new S3Client({ region });
  const prisma = new PrismaClient();

  log(opts.execute ? 'LIVE RUN — files will be deleted' : 'DRY RUN — no deletions', 'warning');
  log(`Scanning s3://${bucket}/${opts.prefix}...`, 'info');

  try {
    // 1. Collect every DB-referenced cover-art URL.
    const [releases, featuredArtists, images] = await Promise.all([
      prisma.release.findMany({ select: { coverArt: true } }),
      prisma.featuredArtist.findMany({ select: { coverArt: true } }),
      prisma.image.findMany({ select: { src: true } }),
    ]);

    const referencedKeys = new Set<string>();
    for (const r of releases) {
      const k = extractS3KeyFromUrl(r.coverArt);
      if (k) referencedKeys.add(k);
    }
    for (const fa of featuredArtists) {
      const k = extractS3KeyFromUrl(fa.coverArt);
      if (k) referencedKeys.add(k);
    }
    for (const img of images) {
      const k = extractS3KeyFromUrl(img.src);
      if (k) referencedKeys.add(k);
    }

    // 2. Build set of referenced directories (parent prefixes).
    const referencedDirs = new Set<string>();
    for (const k of referencedKeys) {
      const dir = parentPrefix(k);
      if (dir) referencedDirs.add(dir);
    }

    log(
      `DB references ${referencedKeys.size} cover-art key(s) across ${referencedDirs.size} directory(ies)`,
      'info'
    );

    // 3. List S3 objects under the requested prefix.
    const allKeys = await listAllKeys(s3, bucket, opts.prefix);
    log(`Found ${allKeys.length} S3 object(s) under ${opts.prefix}`, 'info');

    if (allKeys.length === 0) {
      log('Nothing to scan. Done.', 'success');
      await prisma.$disconnect();
      process.exit(0);
    }

    // 4. Filter to orphans: keys whose parent dir is not referenced.
    const orphans = allKeys.filter((k) => !referencedDirs.has(parentPrefix(k)));
    log(
      `${orphans.length} orphan(s) — directories with no DB-referenced cover art`,
      orphans.length > 0 ? 'warning' : 'success'
    );

    if (orphans.length === 0) {
      log('Nothing to do.', 'success');
      await prisma.$disconnect();
      process.exit(0);
    }

    // Sample up to 20 for visibility before deletion.
    const sample = orphans.slice(0, 20);
    for (const k of sample) {
      log(`  ${colors.dim}-${colors.reset} ${k}`, 'info');
    }
    if (orphans.length > sample.length) {
      log(`  ${colors.dim}... and ${orphans.length - sample.length} more${colors.reset}`, 'info');
    }

    if (!opts.execute) {
      log('DRY RUN — re-run with --execute to delete.', 'warning');
      await prisma.$disconnect();
      process.exit(0);
    }

    // 5. Delete in batches of 1000 (S3 DeleteObjects limit).
    let totalDeleted = 0;
    for (let i = 0; i < orphans.length; i += 1000) {
      const batch = orphans.slice(i, i + 1000);
      await s3.send(
        new DeleteObjectsCommand({
          Bucket: bucket,
          Delete: { Objects: batch.map((Key) => ({ Key })), Quiet: true },
        })
      );
      totalDeleted += batch.length;
      log(`Deleted batch ${i / 1000 + 1} (${batch.length} key(s))`, 'info');
    }

    // 6. CloudFront invalidation — single wildcard for the entire prefix.
    const distributionId = process.env.CLOUDFRONT_DISTRIBUTION_ID;
    if (opts.invalidate && distributionId) {
      try {
        const cf = new CloudFrontClient({ region });
        await cf.send(
          new CreateInvalidationCommand({
            DistributionId: distributionId,
            InvalidationBatch: {
              CallerReference: `cleanup-orphans-${Date.now()}`,
              Paths: { Quantity: 1, Items: [`/${opts.prefix}*`] },
            },
          })
        );
        log(`CloudFront invalidation initiated for /${opts.prefix}*`, 'success');
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Unknown';
        log(`CloudFront invalidation failed (non-fatal): ${msg}`, 'warning');
      }
    } else if (!distributionId) {
      log('CLOUDFRONT_DISTRIBUTION_ID not set — skipping invalidation', 'info');
    }

    log(`Done. Deleted ${totalDeleted} orphan(s).`, 'success');
  } finally {
    await prisma.$disconnect();
  }
}

/* istanbul ignore next -- top-level CLI entry */
if (
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1]?.endsWith('cleanup-orphan-images.ts')
) {
  main().catch((err) => {
    log(err instanceof Error ? err.message : String(err), 'error');
    process.exit(1);
  });
}
