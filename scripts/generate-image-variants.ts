#!/usr/bin/env node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One-time batch script to generate width-variant images on S3.
 *
 * For every original image under `media/` in S3, this script creates
 * resized copies at each device-size breakpoint using the `_w{width}`
 * naming convention (e.g. `hero_w1080.webp`). These variants are what
 * the custom Next.js image loader (`src/lib/image-loader.ts`) resolves.
 *
 * Usage:
 *   pnpm run images:generate-variants
 *   pnpm run images:generate-variants -- --dry-run
 *   pnpm run images:generate-variants -- --prefix media/banners/
 *   pnpm run images:generate-variants -- --no-invalidate
 *
 * Environment Variables:
 *   S3_BUCKET                  - S3 bucket name (required)
 *   AWS_REGION                 - AWS region (default: us-east-1)
 *   CLOUDFRONT_DISTRIBUTION_ID - CloudFront distribution ID (optional)
 */

import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import {
  GetObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import mime from 'mime';
import sharp from 'sharp';

import {
  IMAGE_VARIANT_DEVICE_SIZES,
  IMAGE_VARIANT_SUFFIX_REGEX,
} from '../src/lib/constants/image-variants';

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

dotenv.config({ path: '.env.local' });
dotenv.config();

const S3_BUCKET = process.env.S3_BUCKET;
const AWS_REGION = process.env.AWS_REGION ?? 'us-east-1';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Extensions that cannot be raster-resized (vector, icon, animated). */
const SKIP_EXTENSIONS = new Set(['.svg', '.ico', '.gif']);

/** Raster image extensions we process. */
const IMAGE_EXTENSIONS = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.webp',
  '.avif',
  '.tiff',
  '.tif',
  '.bmp',
]);

/** Maximum images processed in parallel. */
const CONCURRENCY = 5;

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

function log(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
  const colorMap = {
    info: colors.blue,
    success: colors.green,
    warning: colors.yellow,
    error: colors.red,
  };
  const color = colorMap[type];
  const formatted = `${color}[GENERATE-VARIANTS]${colors.reset} ${message}`;

  if (type === 'error') {
    console.error(formatted);
  } else if (type === 'warning') {
    console.warn(formatted);
  } else {
    console.info(formatted);
  }
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

async function listAllObjects(s3: S3Client, bucket: string, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const command = new ListObjectsV2Command({
      Bucket: bucket,
      Prefix: prefix,
      ContinuationToken: continuationToken,
    });
    const response = await s3.send(command);

    for (const obj of response.Contents ?? []) {
      if (obj.Key) {
        keys.push(obj.Key);
      }
    }

    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined;
  } while (continuationToken);

  return keys;
}

async function downloadObject(s3: S3Client, bucket: string, key: string): Promise<Buffer> {
  const command = new GetObjectCommand({ Bucket: bucket, Key: key });
  const response = await s3.send(command);
  const stream = response.Body;

  if (!stream) {
    throw new Error(`Empty body for ${key}`);
  }

  // Collect stream into buffer
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
  buffer: Buffer,
  contentType: string
): Promise<void> {
  const command = new PutObjectCommand({
    Bucket: bucket,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  });
  await s3.send(command);
}

// ---------------------------------------------------------------------------
// CloudFront invalidation (mirrors upload-images.ts)
// ---------------------------------------------------------------------------

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
          CallerReference: `gen-variants-wildcard-${Date.now()}`,
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
        CallerReference: `gen-variants-${Date.now()}`,
        Paths: { Quantity: paths.length, Items: paths },
      },
    })
  );
  log('CloudFront invalidation initiated', 'success');
}

// ---------------------------------------------------------------------------
// Image processing
// ---------------------------------------------------------------------------

function getExtension(key: string): string {
  const dot = key.lastIndexOf('.');
  return dot === -1 ? '' : key.substring(dot).toLowerCase();
}

function isProcessableImage(key: string): boolean {
  const ext = getExtension(key);
  return IMAGE_EXTENSIONS.has(ext) && !SKIP_EXTENSIONS.has(ext);
}

function isExistingVariant(key: string): boolean {
  return IMAGE_VARIANT_SUFFIX_REGEX.test(key);
}

function buildVariantKey(originalKey: string, width: number): string {
  const dot = originalKey.lastIndexOf('.');
  if (dot === -1) return `${originalKey}_w${width}`;
  const base = originalKey.substring(0, dot);
  const ext = originalKey.substring(dot);
  return `${base}_w${width}${ext}`;
}

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
  dryRun: boolean
): Promise<ProcessResult> {
  const result: ProcessResult = {
    originalKey: key,
    variantsUploaded: 0,
    variantsSkipped: 0,
    uploadedVariantKeys: [],
  };

  try {
    const buffer = await downloadObject(s3, bucket, key);
    const metadata = await sharp(buffer).metadata();
    const originalWidth = metadata.width ?? 0;

    if (originalWidth === 0) {
      result.error = 'Could not determine image width';
      return result;
    }

    const contentType = mime.getType(key) ?? 'application/octet-stream';

    for (const targetWidth of IMAGE_VARIANT_DEVICE_SIZES) {
      if (targetWidth >= originalWidth) {
        result.variantsSkipped++;
        continue;
      }

      const variantKey = buildVariantKey(key, targetWidth);

      if (dryRun) {
        log(
          `  ${colors.dim}[dry-run]${colors.reset} Would generate: ${variantKey} (${targetWidth}px from ${originalWidth}px)`,
          'info'
        );
        result.variantsUploaded++;
        continue;
      }

      const resized = await sharp(buffer)
        .resize(targetWidth, undefined, { fit: 'inside', withoutEnlargement: true })
        .toBuffer();

      await uploadBuffer(s3, bucket, variantKey, resized, contentType);
      result.variantsUploaded++;
      result.uploadedVariantKeys.push(variantKey);

      log(
        `  ${colors.green}+${colors.reset} ${variantKey} (${targetWidth}px, ${formatBytes(resized.length)})`,
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
      if (!options.prefix.endsWith('/')) {
        options.prefix += '/';
      }
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
${colors.cyan}Generate Image Width Variants${colors.reset}

Download original images from S3, resize to each device-size breakpoint,
and upload the variants with _w{width} suffix naming.

${colors.yellow}Usage:${colors.reset}
  pnpm run images:generate-variants
  pnpm run images:generate-variants -- --dry-run
  pnpm run images:generate-variants -- --prefix media/banners/
  pnpm run images:generate-variants -- --no-invalidate

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
  if (options.dryRun) {
    log('DRY RUN — no files will be uploaded', 'warning');
  }

  // 1. List all objects
  const allKeys = await listAllObjects(s3, S3_BUCKET, options.prefix);
  log(`Found ${allKeys.length} total object(s)`, 'info');

  // 2. Filter to processable originals
  const originals = allKeys.filter((key) => isProcessableImage(key) && !isExistingVariant(key));
  log(
    `${originals.length} original image(s) to process (excluding SVG/ICO/GIF and existing variants)`,
    'info'
  );

  if (originals.length === 0) {
    log('Nothing to do.', 'success');
    process.exit(0);
  }

  // 3. Process with concurrency
  const uploadedKeys: string[] = [];
  let totalVariants = 0;
  let totalSkipped = 0;
  let totalErrors = 0;

  const results = await mapWithConcurrency(originals, CONCURRENCY, async (key) => {
    log(`Processing: ${key}`, 'info');
    return processImage(s3, S3_BUCKET, key, options.dryRun);
  });

  for (const r of results) {
    totalVariants += r.variantsUploaded;
    totalSkipped += r.variantsSkipped;
    if (r.error) {
      totalErrors++;
      log(`Error processing ${r.originalKey}: ${r.error}`, 'error');
    }
    // Collect exact uploaded variant keys for invalidation
    if (!options.dryRun && r.uploadedVariantKeys.length > 0) {
      uploadedKeys.push(...r.uploadedVariantKeys);
    }
  }

  // 4. CloudFront invalidation
  const distributionId = process.env.CLOUDFRONT_DISTRIBUTION_ID;
  if (!options.dryRun && options.invalidateCache && distributionId && uploadedKeys.length > 0) {
    try {
      await invalidateCloudFront(distributionId, uploadedKeys, AWS_REGION);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      log(`CloudFront invalidation failed: ${msg}`, 'warning');
    }
  }

  // 5. Summary
  console.info('\n' + '='.repeat(60));
  log(
    `Summary: ${originals.length} originals → ${totalVariants} variants generated, ${totalSkipped} skipped (larger than original), ${totalErrors} error(s)`,
    totalErrors > 0 ? 'warning' : 'success'
  );
  console.info('='.repeat(60));

  process.exit(totalErrors > 0 ? 1 : 0);
}

main();
