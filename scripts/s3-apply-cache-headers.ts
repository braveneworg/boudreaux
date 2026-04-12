#!/usr/bin/env node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * S3 Cache Header Migration Script
 *
 * Applies Cache-Control headers to existing S3 objects that are missing them.
 * Uses the CopyObject "copy-to-self" technique since S3 does not allow
 * updating metadata in place.
 *
 * Usage:
 *   # Dry run (default) — show what would change without modifying anything
 *   pnpm run s3:cache-headers
 *
 *   # Apply changes
 *   pnpm run s3:cache-headers -- --apply
 *
 *   # Limit to a specific prefix
 *   pnpm run s3:cache-headers -- --prefix media/artists/
 *
 *   # Force update even if Cache-Control is already set
 *   pnpm run s3:cache-headers -- --apply --force
 *
 * Environment Variables:
 *   S3_BUCKET - S3 bucket name (required)
 *   AWS_REGION - AWS region (default: us-east-1)
 */

import { extname } from 'path';

import {
  CopyObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config();

const S3_BUCKET = process.env.S3_BUCKET;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

const CACHE_CONTROL_IMMUTABLE = 'public, max-age=31536000, immutable';

// Color codes for console output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  reset: '\x1b[0m',
};

/**
 * Media file extensions that should receive immutable cache headers.
 */
const MEDIA_EXTENSIONS = new Set([
  // Images
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.svg',
  '.ico',
  '.bmp',
  '.tiff',
  '.tif',
  '.avif',
  // Audio
  '.mp3',
  '.wav',
  '.ogg',
  '.flac',
  '.aac',
  '.m4a',
  '.wma',
  '.opus',
  '.aiff',
]);

function log(
  message: string,
  type: 'info' | 'success' | 'warning' | 'error' | 'dim' = 'info'
): void {
  const colorMap = {
    info: colors.blue,
    success: colors.green,
    warning: colors.yellow,
    error: colors.red,
    dim: colors.dim,
  };

  const color = colorMap[type];
  const formatted = `${color}[S3-CACHE]${colors.reset} ${message}`;

  switch (type) {
    case 'error':
      console.error(formatted);
      break;
    case 'warning':
      console.warn(formatted);
      break;
    default:
      console.info(formatted);
      break;
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

function isMediaFile(key: string): boolean {
  const ext = extname(key).toLowerCase();
  return MEDIA_EXTENSIONS.has(ext);
}

interface ScanResult {
  totalObjects: number;
  mediaObjects: number;
  alreadyCached: number;
  needsUpdate: number;
  updated: number;
  failed: number;
  totalSize: number;
}

interface ParsedArgs {
  apply: boolean;
  force: boolean;
  prefix: string;
}

export function parseArgs(args: string[]): ParsedArgs {
  const result: ParsedArgs = {
    apply: false,
    force: false,
    prefix: 'media/',
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === '--apply') {
      result.apply = true;
    } else if (arg === '--force') {
      result.force = true;
    } else if (arg === '--prefix' && i + 1 < args.length) {
      result.prefix = args[i + 1];
      i++;
    }
  }

  return result;
}

/**
 * Apply Cache-Control headers to existing S3 objects.
 *
 * S3 does not support updating metadata in place. The only way to change
 * an object's Cache-Control header is to copy the object to itself with
 * the new metadata using `MetadataDirective: 'REPLACE'`.
 */
export async function applyCacheHeaders(
  bucket: string,
  options: ParsedArgs,
  region: string = AWS_REGION
): Promise<ScanResult> {
  const s3Client = new S3Client({ region });
  const result: ScanResult = {
    totalObjects: 0,
    mediaObjects: 0,
    alreadyCached: 0,
    needsUpdate: 0,
    updated: 0,
    failed: 0,
    totalSize: 0,
  };

  log(`Scanning bucket: ${bucket}`, 'info');
  log(`Prefix: ${options.prefix || '(entire bucket)'}`, 'info');
  log(`Mode: ${options.apply ? 'APPLY' : 'DRY RUN'}`, options.apply ? 'warning' : 'info');
  if (options.force) {
    log('Force mode: will overwrite existing Cache-Control headers', 'warning');
  }
  console.info('');

  let continuationToken: string | undefined;

  do {
    const listResponse = await s3Client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: options.prefix,
        ContinuationToken: continuationToken,
      })
    );

    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      break;
    }

    for (const object of listResponse.Contents) {
      if (!object.Key) continue;
      result.totalObjects++;

      if (!isMediaFile(object.Key)) {
        continue;
      }

      result.mediaObjects++;
      result.totalSize += object.Size || 0;

      // Check current Cache-Control header
      const headResponse = await s3Client.send(
        new HeadObjectCommand({ Bucket: bucket, Key: object.Key })
      );

      const currentCacheControl = headResponse.CacheControl;

      if (currentCacheControl === CACHE_CONTROL_IMMUTABLE && !options.force) {
        result.alreadyCached++;
        log(`${colors.dim}skip${colors.reset}  ${object.Key} (already set)`, 'dim');
        continue;
      }

      result.needsUpdate++;

      const sizeFmt = formatBytes(object.Size || 0);
      const currentHeader = currentCacheControl || '(none)';

      if (!options.apply) {
        log(
          `would update  ${object.Key}  ${sizeFmt}  ${currentHeader} → ${CACHE_CONTROL_IMMUTABLE}`,
          'info'
        );
        continue;
      }

      // Apply the header via copy-to-self
      try {
        await s3Client.send(
          new CopyObjectCommand({
            Bucket: bucket,
            Key: object.Key,
            CopySource: `${bucket}/${encodeURIComponent(object.Key)}`,
            ContentType: headResponse.ContentType,
            CacheControl: CACHE_CONTROL_IMMUTABLE,
            MetadataDirective: 'REPLACE',
            // Preserve other important headers
            ContentDisposition: headResponse.ContentDisposition,
            ContentEncoding: headResponse.ContentEncoding,
            ContentLanguage: headResponse.ContentLanguage,
            Metadata: headResponse.Metadata,
          })
        );

        result.updated++;
        log(`updated  ${object.Key}  ${sizeFmt}`, 'success');
      } catch (error) {
        result.failed++;
        const msg = error instanceof Error ? error.message : 'Unknown error';
        log(`FAILED   ${object.Key}: ${msg}`, 'error');
      }
    }

    continuationToken = listResponse.NextContinuationToken;
  } while (continuationToken);

  return result;
}

function printSummary(result: ScanResult, options: ParsedArgs): void {
  console.info('\n' + '='.repeat(60));
  log('Summary', 'info');
  console.info('='.repeat(60));
  console.info(`  Total objects scanned:   ${result.totalObjects}`);
  console.info(
    `  Media files found:       ${result.mediaObjects} (${formatBytes(result.totalSize)})`
  );
  console.info(`  Already has headers:     ${result.alreadyCached}`);
  console.info(`  Needs update:            ${result.needsUpdate}`);

  if (options.apply) {
    console.info(`  ${colors.green}Updated:                 ${result.updated}${colors.reset}`);
    if (result.failed > 0) {
      console.info(`  ${colors.red}Failed:                  ${result.failed}${colors.reset}`);
    }
  } else {
    console.info('');
    log('This was a dry run. Run with --apply to make changes.', 'warning');
  }
  console.info('='.repeat(60));
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes('--help') || args.includes('-h')) {
    console.info(`
${colors.cyan}S3 Cache Header Migration${colors.reset}

Apply Cache-Control: ${CACHE_CONTROL_IMMUTABLE}
to existing media files in S3 that are missing it.

${colors.yellow}Usage:${colors.reset}
  pnpm run s3:cache-headers                          Dry run (default)
  pnpm run s3:cache-headers -- --apply               Apply changes
  pnpm run s3:cache-headers -- --prefix media/audio/  Limit to prefix
  pnpm run s3:cache-headers -- --apply --force       Overwrite existing headers

${colors.yellow}Options:${colors.reset}
  --apply               Actually modify S3 objects (default is dry run)
  --force               Update even if Cache-Control is already set
  --prefix <prefix>     S3 key prefix to scan (default: media/)
  --help, -h            Show this help message

${colors.yellow}Environment Variables:${colors.reset}
  S3_BUCKET             S3 bucket name (required)
  AWS_REGION            AWS region (default: us-east-1)
`);
    process.exit(0);
  }

  if (!S3_BUCKET) {
    log('S3_BUCKET environment variable is not set', 'error');
    process.exit(1);
  }

  try {
    const options = parseArgs(args);
    const result = await applyCacheHeaders(S3_BUCKET, options);
    printSummary(result, options);
    process.exit(result.failed > 0 ? 1 : 0);
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    log(`Fatal error: ${msg}`, 'error');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
