#!/usr/bin/env node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One-time batch script to back-fill WebP siblings for existing raster images
 * in S3 — typically cover art uploaded before variant generation transcoded
 * to WebP. For every original raster image under `media/` (JPG/PNG/TIFF/BMP),
 * this script creates `_w{width}.webp` siblings at each device-size breakpoint.
 *
 * Idempotent: skips originals that already have their `_w{width}.webp`
 * siblings present in S3.
 *
 * Usage:
 *   pnpm run images:convert-to-webp
 *   pnpm run images:convert-to-webp -- --dry-run
 *   pnpm run images:convert-to-webp -- --prefix media/releases/coverart/
 *   pnpm run images:convert-to-webp -- --no-invalidate
 *
 * Environment Variables:
 *   S3_BUCKET                    S3 bucket name (required)
 *   AWS_REGION                   AWS region (default: us-east-1)
 *   CLOUDFRONT_DISTRIBUTION_ID   CloudFront distribution ID (optional)
 */

import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import sharp from 'sharp';

import {
  IMAGE_VARIANT_DEVICE_SIZES,
  IMAGE_VARIANT_SUFFIX_REGEX,
  WEBP_QUALITY,
  WEBP_TRANSCODE_EXTENSIONS,
} from '../src/lib/constants/image-variants';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

dotenv.config({ path: '.env.local' });
dotenv.config();

const S3_BUCKET = process.env.S3_BUCKET;
const AWS_REGION = process.env.AWS_REGION ?? 'us-east-1';

const CONCURRENCY = 5;

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
  const colorMap = {
    info: colors.blue,
    success: colors.green,
    warning: colors.yellow,
    error: colors.red,
  };
  const formatted = `${colorMap[type]}[CONVERT-WEBP]${colors.reset} ${message}`;
  if (type === 'error') console.error(formatted);
  else if (type === 'warning') console.warn(formatted);
  else console.info(formatted);
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

// ---------------------------------------------------------------------------
// S3 helpers
// ---------------------------------------------------------------------------

async function listAllObjects(s3: S3Client, bucket: string, prefix: string): Promise<Set<string>> {
  const keys = new Set<string>();
  let continuationToken: string | undefined;

  do {
    const response = await s3.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      })
    );

    for (const obj of response.Contents ?? []) {
      if (obj.Key) keys.add(obj.Key);
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

async function downloadObject(s3: S3Client, bucket: string, key: string): Promise<Buffer> {
  const response = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const stream = response.Body;
  if (!stream) throw new Error(`Empty body for ${key}`);

  const chunks: Uint8Array[] = [];
  for await (const chunk of stream as AsyncIterable<Uint8Array>) {
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function uploadBuffer(
  s3: S3Client,
  bucket: string,
  key: string,
  buffer: Buffer
): Promise<void> {
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: 'image/webp',
      CacheControl: 'public, max-age=31536000, immutable',
    })
  );
}

async function invalidateCloudFront(
  distributionId: string,
  keys: string[],
  region: string
): Promise<void> {
  if (keys.length === 0) return;

  const cloudfront = new CloudFrontClient({ region });
  const MAX_PATHS = 3000;

  if (keys.length > MAX_PATHS) {
    log(`Invalidating CloudFront cache (wildcard) for ${keys.length} file(s)...`, 'info');
    await cloudfront.send(
      new CreateInvalidationCommand({
        DistributionId: distributionId,
        InvalidationBatch: {
          CallerReference: `convert-webp-wildcard-${Date.now()}`,
          Paths: { Quantity: 1, Items: ['/*'] },
        },
      })
    );
    log('CloudFront wildcard invalidation initiated', 'success');
    return;
  }

  log(`Invalidating CloudFront cache for ${keys.length} file(s)...`, 'info');
  const paths = keys.map((k) => `/${k}`);
  await cloudfront.send(
    new CreateInvalidationCommand({
      DistributionId: distributionId,
      InvalidationBatch: {
        CallerReference: `convert-webp-${Date.now()}`,
        Paths: { Quantity: paths.length, Items: paths },
      },
    })
  );
  log('CloudFront invalidation initiated', 'success');
}

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

function getExtension(key: string): string {
  const dot = key.lastIndexOf('.');
  return dot === -1 ? '' : key.substring(dot).toLowerCase();
}

function isTranscodableOriginal(key: string): boolean {
  const ext = getExtension(key);
  return WEBP_TRANSCODE_EXTENSIONS.has(ext) && !IMAGE_VARIANT_SUFFIX_REGEX.test(key);
}

function buildWebpVariantKey(originalKey: string, width: number): string {
  const dot = originalKey.lastIndexOf('.');
  if (dot === -1) return `${originalKey}_w${width}.webp`;
  return `${originalKey.substring(0, dot)}_w${width}.webp`;
}

// ---------------------------------------------------------------------------
// Per-image processing
// ---------------------------------------------------------------------------

interface ProcessResult {
  originalKey: string;
  variantsUploaded: number;
  variantsSkipped: number;
  uploadedVariantKeys: string[];
  error?: string;
}

async function processImage(
  s3: S3Client,
  bucket: string,
  key: string,
  existingKeys: Set<string>,
  dryRun: boolean
): Promise<ProcessResult> {
  const result: ProcessResult = {
    originalKey: key,
    variantsUploaded: 0,
    variantsSkipped: 0,
    uploadedVariantKeys: [],
  };

  const missingWidths = IMAGE_VARIANT_DEVICE_SIZES.filter(
    (w) => !existingKeys.has(buildWebpVariantKey(key, w))
  );

  if (missingWidths.length === 0) {
    result.variantsSkipped = IMAGE_VARIANT_DEVICE_SIZES.length;
    return result;
  }

  try {
    const buffer = await downloadObject(s3, bucket, key);
    const originalWidth = (await sharp(buffer).metadata()).width ?? 0;
    if (originalWidth === 0) {
      result.error = 'Could not determine image width';
      return result;
    }

    // Generate every variant width — `withoutEnlargement: true` clamps
    // sharp's output to original dims for sizes >= original, so the URL is
    // always live (browsers happily display a 500px image at a `_w1200`
    // filename — they trust the srcset width descriptor).
    for (const targetWidth of IMAGE_VARIANT_DEVICE_SIZES) {
      const webpKey = buildWebpVariantKey(key, targetWidth);

      if (existingKeys.has(webpKey)) {
        result.variantsSkipped++;
        continue;
      }

      if (dryRun) {
        log(
          `  ${colors.dim}[dry-run]${colors.reset} Would generate: ${webpKey} (${targetWidth}px WebP from ${originalWidth}px)`,
          'info'
        );
        result.variantsUploaded++;
        continue;
      }

      const webpBuffer = await sharp(buffer)
        .resize(targetWidth, undefined, { fit: 'inside', withoutEnlargement: true })
        .webp({ quality: WEBP_QUALITY })
        .toBuffer();

      await uploadBuffer(s3, bucket, webpKey, webpBuffer);
      result.variantsUploaded++;
      result.uploadedVariantKeys.push(webpKey);

      log(
        `  ${colors.green}+${colors.reset} ${webpKey} (${targetWidth}px WebP, ${formatBytes(webpBuffer.length)})`,
        'info'
      );
    }
  } catch (err) {
    result.error = err instanceof Error ? err.message : 'Unknown error';
  }

  return result;
}

// ---------------------------------------------------------------------------
// Concurrency helper
// ---------------------------------------------------------------------------

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = [];
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface CliOptions {
  prefix: string;
  dryRun: boolean;
  invalidateCache: boolean;
}

function parseArgs(args: string[]): CliOptions {
  const options: CliOptions = {
    prefix: 'media/',
    dryRun: false,
    invalidateCache: true,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--no-invalidate') {
      options.invalidateCache = false;
    } else if ((arg === '--prefix' || arg === '-p') && i + 1 < args.length) {
      options.prefix = args[++i];
      if (!options.prefix.endsWith('/')) options.prefix += '/';
    }
  }

  return options;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.info(`
${colors.cyan}Convert Existing Raster Images to WebP Variants${colors.reset}

Back-fill _w{width}.webp siblings for cover art uploaded before the variant
pipeline started transcoding to WebP. Idempotent — skips variants that already
exist in S3.

${colors.yellow}Usage:${colors.reset}
  pnpm run images:convert-to-webp
  pnpm run images:convert-to-webp -- --dry-run
  pnpm run images:convert-to-webp -- --prefix media/releases/coverart/
  pnpm run images:convert-to-webp -- --no-invalidate

${colors.yellow}Options:${colors.reset}
  --dry-run           List what would be generated without uploading
  --prefix <prefix>   S3 key prefix to scan (default: media/)
  --no-invalidate     Skip CloudFront cache invalidation

${colors.yellow}Environment Variables:${colors.reset}
  S3_BUCKET                    S3 bucket name (required)
  AWS_REGION                   AWS region (default: us-east-1)
  CLOUDFRONT_DISTRIBUTION_ID   CloudFront distribution ID (optional)
`);
    process.exit(0);
  }

  if (!S3_BUCKET) {
    log('S3_BUCKET environment variable is not set', 'error');
    process.exit(1);
  }

  const options = parseArgs(args);
  const s3 = new S3Client({ region: AWS_REGION });

  log(`Scanning s3://${S3_BUCKET}/${options.prefix}...`, 'info');
  if (options.dryRun) log('DRY RUN — no files will be uploaded', 'warning');

  const allKeys = await listAllObjects(s3, S3_BUCKET, options.prefix);
  log(`Found ${allKeys.size} total object(s)`, 'info');

  const originals = [...allKeys].filter(isTranscodableOriginal);
  log(
    `${originals.length} transcodable original(s) to process (JPG/PNG/TIFF/BMP, excluding existing variants)`,
    'info'
  );

  if (originals.length === 0) {
    log('Nothing to do.', 'success');
    process.exit(0);
  }

  const uploadedKeys: string[] = [];
  let totalVariants = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  const results = await mapWithConcurrency(originals, CONCURRENCY, async (key) => {
    log(`Processing: ${key}`, 'info');
    return processImage(s3, S3_BUCKET, key, allKeys, options.dryRun);
  });

  for (const r of results) {
    totalVariants += r.variantsUploaded;
    totalSkipped += r.variantsSkipped;
    if (r.error) {
      totalErrors++;
      log(`Error processing ${r.originalKey}: ${r.error}`, 'error');
    }
    if (!options.dryRun && r.uploadedVariantKeys.length > 0) {
      uploadedKeys.push(...r.uploadedVariantKeys);
    }
  }

  const distributionId = process.env.CLOUDFRONT_DISTRIBUTION_ID;
  if (!options.dryRun && options.invalidateCache && distributionId && uploadedKeys.length > 0) {
    try {
      await invalidateCloudFront(distributionId, uploadedKeys, AWS_REGION);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      log(`CloudFront invalidation failed: ${msg}`, 'warning');
    }
  }

  console.info('\n' + '='.repeat(60));
  log(
    `Summary: ${originals.length} originals → ${totalVariants} WebP variants generated, ${totalSkipped} skipped, ${totalErrors} error(s)`,
    totalErrors > 0 ? 'warning' : 'success'
  );
  console.info('='.repeat(60));

  process.exit(totalErrors > 0 ? 1 : 0);
}

main();
