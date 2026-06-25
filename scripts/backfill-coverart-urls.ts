#!/usr/bin/env node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One-shot backfill: normalize `Release.coverArt` and `FeaturedArtist.coverArt`
 * to WebP CDN URLs. Handles two input shapes:
 *   1. `data:image/*;base64,...` URIs (seeded or extracted from audio metadata):
 *      decode, transcode to WebP, upload to S3, rewrite the DB column.
 *   2. Existing CDN URLs in transcodable raster formats (JPG/JPEG/PNG/TIFF/BMP):
 *      download from S3, transcode to WebP, upload alongside the original
 *      (`cover.jpg` → `cover.webp`), rewrite the DB column.
 *
 * Why: base64 cover art bloats the SSR HTML to 2+ MB and crushes LCP on mobile.
 * Non-webp CDN URLs work but pay a payload-size penalty on every render.
 *
 * Defaults to dry-run. Pass `--execute` to actually upload + write to the DB.
 *
 * Usage:
 *   pnpm run backfill:coverart
 *   pnpm run backfill:coverart -- --execute
 *   pnpm run backfill:coverart -- --execute --limit 5
 *   pnpm run backfill:coverart -- --model release
 *   pnpm run backfill:coverart -- --execute --no-invalidate
 *
 * Flags:
 *   --execute              Actually upload + update DB (default: dry-run)
 *   --limit <N>            Process at most N rows per model (default: all)
 *   --concurrency <N>      Parallel uploads (default: 3)
 *   --model <name>         "release" | "featured-artist" | "all" (default: all)
 *   --no-invalidate        Skip CloudFront cache invalidation after upload
 *   --help, -h             Print usage and exit
 *
 * Required env vars: S3_BUCKET, DATABASE_URL, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
 * Optional env vars: AWS_REGION (default us-east-1), CLOUDFRONT_DISTRIBUTION_ID,
 *                    NEXT_PUBLIC_CDN_DOMAIN / CDN_DOMAIN (default https://cdn.fakefourrecords.com)
 */

import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';
import sharp from 'sharp';

import { WEBP_QUALITY, WEBP_TRANSCODE_EXTENSIONS } from '../src/lib/constants/image-variants';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

dotenv.config({ path: '.env.local' });
dotenv.config();

const DEFAULT_CDN_DOMAIN = 'https://cdn.fakefourrecords.com';

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------

const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  reset: '\x1b[0m',
};

const log = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): void => {
  const tagColor = new Map([
    ['info', colors.blue],
    ['success', colors.green],
    ['warning', colors.yellow],
    ['error', colors.red],
  ]).get(type);
  const line = `${tagColor}[BACKFILL-COVERART]${colors.reset} ${message}`;
  if (type === 'error') console.error(line);
  else if (type === 'warning') console.warn(line);
  else console.info(line);
};

// ---------------------------------------------------------------------------
// Pure helpers (exported for tests)
// ---------------------------------------------------------------------------

export type ModelName = 'release' | 'featured-artist';

export interface CliOptions {
  execute: boolean;
  limit: number | null;
  concurrency: number;
  models: ModelName[];
  invalidate: boolean;
  help: boolean;
}

const DEFAULT_OPTIONS: CliOptions = {
  execute: false,
  limit: null,
  concurrency: 3,
  models: ['release', 'featured-artist'],
  invalidate: true,
  help: false,
};

/** Parse a strictly-positive integer, or `null` when invalid. */
const parsePositiveInt = (raw: string): number | null => {
  const n = parseInt(raw, 10);
  return !Number.isNaN(n) && n > 0 ? n : null;
};

/** Map a `--model` value to its model list, or `null` for unknown values. */
const resolveModels = (value: string): ModelName[] | null => {
  if (value === 'all') return ['release', 'featured-artist'];
  if (value === 'release') return ['release'];
  if (value === 'featured-artist') return ['featured-artist'];
  return null;
};

/** Apply boolean flags to `opts`; returns true when the token was consumed. */
const applyBooleanFlag = (opts: CliOptions, arg: string | undefined): boolean => {
  if (arg === '--execute') opts.execute = true;
  else if (arg === '--no-invalidate') opts.invalidate = false;
  else if (arg === '--help' || arg === '-h') opts.help = true;
  else return false;
  return true;
};

/** Apply a value-taking flag at `argv[i]` to `opts`; returns the next index. */
const applyValueFlag = (opts: CliOptions, argv: string[], i: number): number => {
  const arg = argv.at(i);
  if (i + 1 >= argv.length) return i;

  if (arg === '--limit') {
    const n = parsePositiveInt(argv[i + 1]);
    if (n !== null) opts.limit = n;
    return i + 1;
  }
  if (arg === '--concurrency') {
    const n = parsePositiveInt(argv[i + 1]);
    if (n !== null) opts.concurrency = n;
    return i + 1;
  }
  if (arg === '--model') {
    const models = resolveModels(argv[i + 1]);
    if (models) opts.models = models;
    return i + 1;
  }

  return i;
};

export const parseArgs = (argv: string[]): CliOptions => {
  const opts: CliOptions = { ...DEFAULT_OPTIONS };

  for (let i = 0; i < argv.length; i++) {
    if (applyBooleanFlag(opts, argv.at(i))) continue;
    i = applyValueFlag(opts, argv, i);
  }

  return opts;
};

export const isDataUri = (value: string | null | undefined): value is string =>
  typeof value === 'string' && value.startsWith('data:');

export interface ParsedDataUri {
  mimeType: string;
  buffer: Buffer;
}

/**
 * Decode a `data:<mime>;base64,<payload>` URI into `{ mimeType, buffer }`.
 * Returns `null` if the input isn't a well-formed base64 data URI.
 */
export const parseDataUri = (uri: string): ParsedDataUri | null => {
  const match = uri.match(/^data:([^;,]+);base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  try {
    return { mimeType: match[1], buffer: Buffer.from(match[2], 'base64') };
  } catch {
    return null;
  }
};

export const buildS3Key = (model: ModelName, id: string, ext: string): string =>
  `media/releases/coverart/backfill-${model}-${id}.${ext}`;

export const buildCdnUrl = (cdnDomain: string, key: string): string => {
  const trimmed = cdnDomain.replace(/\/+$/, '');
  return `${trimmed}/${key}`;
};

/** Extract the S3 object key from a CDN URL, or null if `url` isn't a valid URL. */
export const extractS3KeyFromCdnUrl = (url: string): string | null => {
  try {
    return decodeURIComponent(new URL(url).pathname).replace(/^\//, '');
  } catch {
    return null;
  }
};

/** Lowercase file extension including the leading dot, or '' when absent. */
export const getFileExtension = (value: string): string => {
  // Strip query/hash so `cover.jpg?v=1` returns `.jpg`.
  const cleaned = value.split('?')[0].split('#')[0];
  const dot = cleaned.lastIndexOf('.');
  return dot === -1 ? '' : cleaned.substring(dot).toLowerCase();
};

/** Swap (or append) `.webp` on an S3 key, preserving the rest of the path. */
export const swapKeyExtensionToWebp = (key: string): string => {
  const dot = key.lastIndexOf('.');
  return dot === -1 ? `${key}.webp` : `${key.substring(0, dot)}.webp`;
};

// ---------------------------------------------------------------------------
// Processing
// ---------------------------------------------------------------------------

interface UploadContext {
  s3: S3Client;
  bucket: string;
  cdnDomain: string;
  execute: boolean;
}

interface RowResult {
  id: string;
  status: 'migrated' | 'skipped' | 'failed';
  detail?: string;
  uploadedKey?: string;
}

const downloadObjectFromS3 = async (s3: S3Client, bucket: string, key: string): Promise<Buffer> => {
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const stream = response.Body;
  if (!stream) throw new Error(`empty body for ${key}`);
  const chunks: Uint8Array[] = [];
  for await (const chunk of stream as AsyncIterable<Uint8Array>) chunks.push(chunk);
  return Buffer.concat(chunks);
};

interface SourceImage {
  buffer: Buffer;
  /** Resolved key when the source is an existing S3 object; null for data URIs. */
  existingKey: string | null;
}

/**
 * Resolve the source bytes for a row's `coverArt`. Returns `null` when the
 * value is already a `.webp`, an unsupported format, or otherwise not eligible
 * for transcoding.
 */
const resolveSourceImage = async (
  ctx: UploadContext,
  coverArt: string
): Promise<{ source: SourceImage } | { skip: string }> => {
  if (isDataUri(coverArt)) {
    const parsed = parseDataUri(coverArt);
    if (!parsed) return { skip: 'could not parse data URI' };
    return { source: { buffer: parsed.buffer, existingKey: null } };
  }

  // Treat as a CDN URL. Skip anything we can't safely transcode.
  const ext = getFileExtension(coverArt);
  if (ext === '.webp') {
    return { skip: 'already .webp' };
  }
  if (!WEBP_TRANSCODE_EXTENSIONS.has(ext)) {
    return { skip: `not a transcodable format (${ext || '<no ext>'})` };
  }

  const key = extractS3KeyFromCdnUrl(coverArt);
  if (!key) return { skip: 'could not parse CDN URL' };

  try {
    const buffer = await downloadObjectFromS3(ctx.s3, ctx.bucket, key);
    return { source: { buffer, existingKey: key } };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown S3 error';
    return { skip: `S3 download failed: ${msg}` };
  }
};

/** Transcode source bytes to WebP, returning the buffer or an error message. */
const transcodeToWebp = async (source: Buffer): Promise<{ buffer: Buffer } | { error: string }> => {
  try {
    return { buffer: await sharp(source).webp({ quality: WEBP_QUALITY }).toBuffer() };
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown sharp error';
    return { error: `WebP transcode failed: ${msg}` };
  }
};

/** Upload the WebP buffer to S3; returns `null` on success or an error message. */
const putWebpObject = async (
  ctx: UploadContext,
  key: string,
  webpBuffer: Buffer
): Promise<string | null> => {
  try {
    await ctx.s3.send(
      new PutObjectCommand({
        Bucket: ctx.bucket,
        Key: key,
        Body: webpBuffer,
        ContentType: 'image/webp',
        CacheControl: 'public, max-age=31536000, immutable',
      })
    );
    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown S3 error';
    return `S3 upload failed: ${msg}`;
  }
};

interface UpdateCoverArtArgs {
  prisma: PrismaClient;
  model: ModelName;
  id: string;
  cdnUrl: string;
}

/** Write the new CDN URL to the row; returns `null` on success or an error. */
const updateCoverArt = async ({
  prisma,
  model,
  id,
  cdnUrl,
}: UpdateCoverArtArgs): Promise<string | null> => {
  try {
    if (model === 'release') {
      await prisma.release.update({ where: { id }, data: { coverArt: cdnUrl } });
    } else {
      await prisma.featuredArtist.update({ where: { id }, data: { coverArt: cdnUrl } });
    }
    return null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown DB error';
    return `DB update failed: ${msg}`;
  }
};

const migrateRow = async (
  ctx: UploadContext,
  model: ModelName,
  row: { id: string; coverArt: string | null },
  prisma: PrismaClient
): Promise<RowResult> => {
  const { id, coverArt } = row;
  if (!coverArt) {
    return { id, status: 'skipped', detail: 'no coverArt' };
  }

  const resolved = await resolveSourceImage(ctx, coverArt);
  if ('skip' in resolved) {
    return { id, status: 'skipped', detail: resolved.skip };
  }

  // For existing S3 objects, place the .webp next to the original so the
  // path is intuitive and the variant generator can produce siblings under
  // the same prefix. For data URIs, keep the legacy `backfill-{model}-{id}`
  // naming so re-runs are idempotent.
  const { buffer: sourceBuffer, existingKey } = resolved.source;
  const key = existingKey ? swapKeyExtensionToWebp(existingKey) : buildS3Key(model, id, 'webp');
  const cdnUrl = buildCdnUrl(ctx.cdnDomain, key);

  const transcoded = await transcodeToWebp(sourceBuffer);
  if ('error' in transcoded) {
    return { id, status: 'failed', detail: transcoded.error };
  }
  const webpBuffer = transcoded.buffer;

  const sourceLabel = existingKey ?? 'data URI';
  if (!ctx.execute) {
    return {
      id,
      status: 'migrated',
      detail: `[dry-run] would transcode ${sourceBuffer.length} → ${webpBuffer.length} bytes (${sourceLabel}) → ${key}`,
      uploadedKey: key,
    };
  }

  const uploadError = await putWebpObject(ctx, key, webpBuffer);
  if (uploadError) {
    return { id, status: 'failed', detail: uploadError };
  }

  const dbError = await updateCoverArt({ prisma, model, id, cdnUrl });
  if (dbError) {
    return {
      id,
      status: 'failed',
      detail: `uploaded to ${key} but ${dbError}`,
      uploadedKey: key,
    };
  }

  return {
    id,
    status: 'migrated',
    detail: `transcoded ${sourceBuffer.length} → ${webpBuffer.length} bytes (${sourceLabel}) → ${cdnUrl}`,
    uploadedKey: key,
  };
};

/** Simple bounded-parallelism runner. */
const mapWithConcurrency = async <T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> => {
  const queue = items.map((item, index) => ({ item, index }));
  const results: R[] = new Array<R>(items.length);
  let cursor = 0;
  const worker = async (): Promise<void> => {
    while (cursor < queue.length) {
      const entry = queue.at(cursor++);
      if (entry === undefined) break;
      results.splice(entry.index, 1, await fn(entry.item));
    }
  };
  const workerCount = Math.min(concurrency, Math.max(1, items.length));
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
};

// ---------------------------------------------------------------------------
// CloudFront invalidation
// ---------------------------------------------------------------------------

const invalidateCloudFront = async (
  distributionId: string,
  keys: string[],
  region: string
): Promise<void> => {
  if (keys.length === 0) return;
  const cloudfront = new CloudFrontClient({ region });
  const paths = keys.map((k) => `/${k}`);
  log(`Invalidating CloudFront for ${paths.length} object(s)...`, 'info');
  await cloudfront.send(
    new CreateInvalidationCommand({
      DistributionId: distributionId,
      InvalidationBatch: {
        CallerReference: `backfill-coverart-${Date.now()}`,
        Paths: { Quantity: paths.length, Items: paths },
      },
    })
  );
  log('CloudFront invalidation initiated', 'success');
};

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const HELP = `
${colors.cyan}Backfill coverArt → WebP CDN URLs${colors.reset}

Normalizes Release.coverArt and FeaturedArtist.coverArt to WebP CDN URLs:
  - \`data:image/*;base64,...\` values are decoded, transcoded to WebP, and uploaded.
  - Existing JPG/JPEG/PNG/TIFF/BMP CDN URLs are downloaded, transcoded to WebP,
    and uploaded alongside the original (\`cover.jpg\` → \`cover.webp\`).
  - Already-\`.webp\` values are skipped. Safe to run repeatedly.

${colors.yellow}Usage:${colors.reset}
  pnpm run backfill:coverart
  pnpm run backfill:coverart -- --execute
  pnpm run backfill:coverart -- --execute --limit 5
  pnpm run backfill:coverart -- --model release
  pnpm run backfill:coverart -- --execute --no-invalidate

${colors.yellow}Flags:${colors.reset}
  --execute               Actually perform writes (default: dry-run)
  --limit <N>             Max rows per model (default: all)
  --concurrency <N>       Parallel uploads (default: 3)
  --model <release|featured-artist|all>  (default: all)
  --no-invalidate         Skip CloudFront invalidation
  --help                  Print this help

${colors.yellow}Required env:${colors.reset} S3_BUCKET, DATABASE_URL, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
${colors.yellow}Optional env:${colors.reset} AWS_REGION (default us-east-1), CLOUDFRONT_DISTRIBUTION_ID, NEXT_PUBLIC_CDN_DOMAIN
`;

interface ResolvedEnv {
  bucket: string;
  region: string;
  cdnDomain: string;
}

/** Read and validate required env vars; exits the process when one is missing. */
const resolveEnv = (): ResolvedEnv => {
  const bucket = process.env.S3_BUCKET;
  const region = process.env.AWS_REGION ?? 'us-east-1';
  const cdnDomain =
    process.env.NEXT_PUBLIC_CDN_DOMAIN ?? process.env.CDN_DOMAIN ?? DEFAULT_CDN_DOMAIN;

  if (!bucket) {
    log('S3_BUCKET env var is required', 'error');
    process.exit(1);
  }
  if (!process.env.DATABASE_URL) {
    log('DATABASE_URL env var is required', 'error');
    process.exit(1);
  }

  return { bucket, region, cdnDomain };
};

interface RunTotals {
  uploadedKeys: string[];
  migrated: number;
  skipped: number;
  failed: number;
}

/** Fold one row result into the running totals, logging migrated/failed rows. */
const tallyResult = (totals: RunTotals, model: ModelName, r: RowResult): void => {
  if (r.status === 'migrated') {
    totals.migrated++;
    if (r.uploadedKey) totals.uploadedKeys.push(r.uploadedKey);
    log(`  ${colors.green}✓${colors.reset} ${model} ${r.id}: ${r.detail}`, 'info');
    return;
  }
  if (r.status === 'skipped') {
    totals.skipped++;
    return;
  }
  totals.failed++;
  log(`  ${colors.red}✗${colors.reset} ${model} ${r.id}: ${r.detail}`, 'error');
};

// Pull every row whose coverArt is a data URI or an HTTP(S) URL.
// `migrateRow` skips ones that are already `.webp` or in unsupported
// formats. We can't use `{ coverArt: { not: null } }` here because Prisma
// MongoDB rejects null in `not` filters; the OR avoids the issue and
// additionally excludes empty / weird values cheaply on the DB side.
// No `as const` — Prisma's WhereInput expects a mutable `OR` array, and
// freezing the literal type widens `findMany` row inference back to the
// full model shape (breaking the `select` projection).
const COVERART_WHERE = {
  OR: [{ coverArt: { startsWith: 'data:' } }, { coverArt: { startsWith: 'http' } }],
};

/** Fetch the candidate rows for one model, honoring the optional row limit. */
const fetchRows = async (
  prisma: PrismaClient,
  model: ModelName,
  limit: number | null
): Promise<Array<{ id: string; coverArt: string | null }>> => {
  if (model === 'release') {
    return prisma.release.findMany({
      where: COVERART_WHERE,
      select: { id: true, coverArt: true },
      ...(limit ? { take: limit } : {}),
    });
  }
  return prisma.featuredArtist.findMany({
    where: COVERART_WHERE,
    select: { id: true, coverArt: true },
    ...(limit ? { take: limit } : {}),
  });
};

interface ProcessModelArgs {
  ctx: UploadContext;
  prisma: PrismaClient;
  model: ModelName;
  opts: CliOptions;
  totals: RunTotals;
}

/** Scan one model: fetch rows, migrate them in parallel, and tally results. */
const processModel = async ({
  ctx,
  prisma,
  model,
  opts,
  totals,
}: ProcessModelArgs): Promise<void> => {
  log(`Scanning ${model}...`, 'info');
  const rows = await fetchRows(prisma, model, opts.limit);
  log(`  found ${rows.length} ${model} row(s) with non-webp coverArt`, 'info');

  const results = await mapWithConcurrency(rows, opts.concurrency, (row) =>
    migrateRow(ctx, model, row, prisma)
  );

  for (const r of results) {
    tallyResult(totals, model, r);
  }
};

/** Invalidate CloudFront for uploaded keys, swallowing failures as warnings. */
const maybeInvalidate = async (
  opts: CliOptions,
  uploadedKeys: string[],
  region: string
): Promise<void> => {
  const distributionId = process.env.CLOUDFRONT_DISTRIBUTION_ID;
  if (!opts.execute || !opts.invalidate || !distributionId || uploadedKeys.length === 0) {
    return;
  }
  try {
    await invalidateCloudFront(distributionId, uploadedKeys, region);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'unknown';
    log(`CloudFront invalidation failed: ${msg}`, 'warning');
  }
};

/** Log the run mode banner, selected models, and any row limit. */
const logRunHeader = (opts: CliOptions): void => {
  log(opts.execute ? 'LIVE RUN (writes enabled)' : 'DRY RUN — no writes', 'warning');
  log(`Models: ${opts.models.join(', ')}`, 'info');
  if (opts.limit) log(`Row limit per model: ${opts.limit}`, 'info');
};

export const runBackfill = async (
  argv: string[],
  deps?: { prisma?: PrismaClient }
): Promise<void> => {
  const opts = parseArgs(argv);
  if (opts.help) {
    console.info(HELP);
    return;
  }

  const { bucket, region, cdnDomain } = resolveEnv();
  logRunHeader(opts);

  // Reuse an injected client (tests) and leave its lifecycle to the caller;
  // otherwise own the client we create and disconnect it in `finally`.
  const injectedPrisma = deps?.prisma;
  const prisma = injectedPrisma ?? new PrismaClient();
  const s3 = new S3Client({ region });
  const ctx: UploadContext = { s3, bucket, cdnDomain, execute: opts.execute };

  const totals: RunTotals = { uploadedKeys: [], migrated: 0, skipped: 0, failed: 0 };

  try {
    for (const model of opts.models) {
      await processModel({ ctx, prisma, model, opts, totals });
    }

    await maybeInvalidate(opts, totals.uploadedKeys, region);

    console.info('\n' + '='.repeat(60));
    log(
      `Summary: ${totals.migrated} migrated, ${totals.skipped} skipped, ${totals.failed} failed`,
      totals.failed > 0 ? 'warning' : 'success'
    );
    console.info('='.repeat(60));
  } finally {
    if (!injectedPrisma) {
      await prisma.$disconnect();
    }
  }

  if (totals.failed > 0) process.exit(1);
};

/* istanbul ignore next -- top-level CLI entry */
if (
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1]?.endsWith('backfill-coverart-urls.ts')
) {
  runBackfill(process.argv.slice(2)).catch((err) => {
    log(err instanceof Error ? err.message : String(err), 'error');
    process.exit(1);
  });
}
