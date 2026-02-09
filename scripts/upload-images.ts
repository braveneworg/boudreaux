#!/usr/bin/env node

/**
 * Image Upload Script
 * This script uploads one or more images to S3 bucket
 *
 * Usage:
 *   # Upload single image
 *   npm run images:upload path/to/image.jpg
 *
 *   # Upload multiple images (comma-separated)
 *   npm run images:upload path/to/image1.jpg,path/to/image2.png
 *
 *   # Upload all images in a directory (recursive)
 *   npm run images:upload --dir path/to/images/
 *
 *   # Upload with custom S3 prefix (default: media/)
 *   npm run images:upload path/to/image.jpg --prefix media/photos/
 *
 * Examples:
 *   npm run images:upload public/media/profile.jpg
 *   npm run images:upload ./images/photo1.jpg,./images/photo2.png
 *   npm run images:upload --dir public/media/gallery
 *   npm run images:upload --dir ./uploads --prefix user-content/
 *
 * Environment Variables:
 *   S3_BUCKET - S3 bucket name (required)
 *   AWS_REGION - AWS region (default: us-east-1)
 *   CLOUDFRONT_DISTRIBUTION_ID - CloudFront distribution ID for cache invalidation (optional)
 */

import { createReadStream } from 'fs';
import { isAbsolute, join, normalize, relative, resolve } from 'path';

import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import mime from 'mime';

import { existsSync, readdirSync, statSync } from '../src/lib/system-utils';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config(); // This loads .env as fallback

const S3_BUCKET = process.env.S3_BUCKET;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

// Only check S3_BUCKET if running as main script
if (!S3_BUCKET && require.main === module) {
  console.error('Error: S3_BUCKET environment variable is not set');
  console.error('Please ensure your .env.local or .env file contains S3_BUCKET');
  process.exit(1);
}

// Color codes for console output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
};

/**
 * Allowed image extensions
 */
const IMAGE_EXTENSIONS = new Set([
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
]);

interface UploadResult {
  successful: number;
  failed: number;
  skipped: number;
  uploadedKeys: string[];
  errors: Array<{ path: string; error: string }>;
}

interface UploadOptions {
  prefix?: string;
  invalidateCache?: boolean;
  baseDir?: string;
}

/**
 * Format bytes to human-readable string
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Log message with color
 */
function log(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
  const colorMap = {
    info: colors.blue,
    success: colors.green,
    warning: colors.yellow,
    error: colors.red,
  };

  const color = colorMap[type];
  const formattedMessage = `${color}[UPLOAD-IMAGES]${colors.reset} ${message}`;

  switch (type) {
    case 'error':
      console.error(formattedMessage);
      break;
    case 'warning':
      console.warn(formattedMessage);
      break;
    default:
      console.info(formattedMessage);
      break;
  }
}

/**
 * Check if a file has an allowed image extension
 */
export function isImageFile(filePath: string): boolean {
  const ext = filePath.toLowerCase().substring(filePath.lastIndexOf('.'));
  return IMAGE_EXTENSIONS.has(ext);
}

/**
 * Resolve relative or absolute path
 */
export function resolvePath(filePath: string): string {
  if (isAbsolute(filePath)) {
    return normalize(filePath);
  }
  return resolve(process.cwd(), filePath);
}

/**
 * Generate S3 key from file path
 */
export function generateS3Key(filePath: string, prefix?: string): string {
  // Normalize the path and convert to forward slashes for cross-platform consistency
  const normalizedPath = normalize(filePath).split('\\').join('/');
  let key = normalizedPath;

  // Handle paths that contain /public/ (Unix absolute, Windows absolute, or relative)
  const publicIndex = normalizedPath.indexOf('/public/');
  if (publicIndex !== -1) {
    // Extract the path after /public/
    key = normalizedPath.substring(publicIndex + '/public/'.length);
  } else if (normalizedPath.startsWith('public/')) {
    // If it's a relative path starting with public/, remove it
    key = normalizedPath.substring('public/'.length);
  } else if (normalizedPath.startsWith('./')) {
    key = normalizedPath.substring(2);
  }

  // Remove leading slashes
  key = key.replace(/^\/+/, '');

  // Apply prefix: use explicit prefix if provided, otherwise default to 'media'
  const effectivePrefix = prefix !== undefined ? prefix : 'media';
  if (effectivePrefix) {
    const cleanPrefix = effectivePrefix.replace(/^\/+/, '').replace(/\/+$/, '');
    // Avoid double-prefixing if key already starts with the prefix
    if (cleanPrefix && !key.startsWith(`${cleanPrefix}/`)) {
      key = `${cleanPrefix}/${key}`;
    }
  }

  return key;
}

/**
 * Upload a single file to S3
 */
async function uploadFile(
  s3Client: S3Client,
  bucket: string,
  localPath: string,
  s3Key: string,
  result: UploadResult
): Promise<void> {
  try {
    if (!existsSync(localPath)) {
      log(`File not found: ${localPath}`, 'error');
      result.failed++;
      result.errors.push({ path: localPath, error: 'File not found' });
      return;
    }

    const stats = statSync(localPath);
    if (!stats.isFile()) {
      log(`Not a file: ${localPath}`, 'warning');
      result.skipped++;
      return;
    }

    if (!isImageFile(localPath)) {
      log(`Skipping non-image file: ${localPath}`, 'warning');
      result.skipped++;
      return;
    }

    log(`Uploading: ${localPath} → s3://${bucket}/${s3Key}`, 'info');

    const fileStream = createReadStream(localPath);
    const contentType = mime.getType(localPath) || 'application/octet-stream';

    const putCommand = new PutObjectCommand({
      Bucket: bucket,
      Key: s3Key,
      Body: fileStream,
      ContentType: contentType,
    });

    await s3Client.send(putCommand);

    log(`✓ Uploaded: ${s3Key} (${formatBytes(stats.size)})`, 'success');
    result.successful++;
    result.uploadedKeys.push(s3Key);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log(`✗ Error uploading ${localPath}: ${errorMessage}`, 'error');
    result.failed++;
    result.errors.push({ path: localPath, error: errorMessage });
  }
}

/**
 * Recursively collect image files from a directory
 */
export function collectImagesFromDirectory(dirPath: string): string[] {
  const images: string[] = [];

  if (!existsSync(dirPath)) {
    throw new Error(`Directory not found: ${dirPath}`);
  }

  const stats = statSync(dirPath);
  if (!stats.isDirectory()) {
    throw new Error(`Not a directory: ${dirPath}`);
  }

  const items = readdirSync(dirPath);

  for (const item of items) {
    const itemPath = join(dirPath, item);
    const itemStats = statSync(itemPath);

    if (itemStats.isDirectory()) {
      // Recursively collect from subdirectories
      images.push(...collectImagesFromDirectory(itemPath));
    } else if (itemStats.isFile() && isImageFile(itemPath)) {
      images.push(itemPath);
    }
  }

  return images;
}

/**
 * Invalidate CloudFront cache for uploaded files.
 * CloudFront has a limit of 3,000 paths per invalidation request.
 * For 3,000 keys or fewer, a single invalidation with explicit paths is sent.
 * For more than 3,000 keys, a single wildcard invalidation is used instead.
 */
async function invalidateCloudFront(
  distributionId: string,
  keys: string[],
  region: string
): Promise<void> {
  if (keys.length === 0) {
    return;
  }

  try {
    const cloudfront = new CloudFrontClient({ region });
    const MAX_PATHS_PER_REQUEST = 3000;

    // For very large uploads (>3000 files), use wildcard invalidation
    // This is more cost-effective and faster than multiple requests
    if (keys.length > MAX_PATHS_PER_REQUEST) {
      log(`Invalidating CloudFront cache using wildcard for ${keys.length} file(s)...`, 'info');

      const command = new CreateInvalidationCommand({
        DistributionId: distributionId,
        InvalidationBatch: {
          CallerReference: `upload-images-wildcard-${Date.now()}`,
          Paths: {
            Quantity: 1,
            Items: ['/*'],
          },
        },
      });

      await cloudfront.send(command);
      log('✓ CloudFront cache invalidation initiated (wildcard)', 'success');
      return;
    }

    // For smaller batches (≤3000 files), invalidate specific paths
    log(`Invalidating CloudFront cache for ${keys.length} file(s)...`, 'info');

    // CloudFront paths must start with /
    const paths = keys.map((key) => `/${key}`);

    const command = new CreateInvalidationCommand({
      DistributionId: distributionId,
      InvalidationBatch: {
        CallerReference: `upload-images-${Date.now()}`,
        Paths: {
          Quantity: paths.length,
          Items: paths,
        },
      },
    });

    await cloudfront.send(command);
    log('✓ CloudFront cache invalidation initiated', 'success');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log(`Warning: Failed to invalidate CloudFront cache: ${errorMessage}`, 'warning');
  }
}

/**
 * Upload images to S3
 */
export async function uploadImages(
  bucket: string,
  filePaths: string[],
  options: UploadOptions = {},
  region = AWS_REGION
): Promise<UploadResult> {
  const result: UploadResult = {
    successful: 0,
    failed: 0,
    skipped: 0,
    uploadedKeys: [],
    errors: [],
  };

  const s3Client = new S3Client({ region });

  log(`Starting upload to S3 bucket: ${bucket}`, 'info');
  log(`Using S3 prefix: ${options.prefix ?? 'media (default)'}`, 'info');

  for (const filePath of filePaths) {
    const resolvedPath = resolvePath(filePath);

    // If baseDir is provided, compute the relative path from baseDir
    // This is used when uploading from a directory to get correct S3 keys
    let pathForS3Key = filePath;
    if (options.baseDir) {
      const resolvedBaseDir = resolvePath(options.baseDir);
      const relativePath = relative(resolvedBaseDir, resolvedPath);

      // Ensure the resolvedPath is within resolvedBaseDir and does not traverse upwards
      const hasParentTraversal = relativePath.split(/[\\/]+/).includes('..');

      if (hasParentTraversal || isAbsolute(relativePath)) {
        const message = `Skipping file outside baseDir: filePath="${filePath}", baseDir="${options.baseDir}"`;
        log(message, 'error');
        result.skipped += 1;
        result.errors.push({ path: filePath, error: message });
        continue;
      }

      // Use the safe, normalized relative path for the S3 key
      pathForS3Key = relativePath.replace(/\\/g, '/');
    }

    // When baseDir is used without an explicit prefix, use empty prefix to preserve directory structure
    // Otherwise, generateS3Key will apply its default 'media' prefix
    const effectivePrefix = options.baseDir && options.prefix === undefined ? '' : options.prefix;
    const s3Key = generateS3Key(pathForS3Key, effectivePrefix);
    await uploadFile(s3Client, bucket, resolvedPath, s3Key, result);
  }

  // Invalidate CloudFront cache if configured
  const distributionId = process.env.CLOUDFRONT_DISTRIBUTION_ID;
  if (options.invalidateCache && distributionId && result.uploadedKeys.length > 0) {
    await invalidateCloudFront(distributionId, result.uploadedKeys, region);
  }

  return result;
}

/**
 * Parse command line arguments
 */
export function parseArgs(args: string[]): {
  mode: 'files' | 'directory';
  paths: string[];
  prefix?: string;
  invalidateCache: boolean;
  baseDir?: string;
} {
  const result = {
    mode: 'files' as 'files' | 'directory',
    paths: [] as string[],
    prefix: undefined as string | undefined,
    invalidateCache: true,
    baseDir: undefined as string | undefined,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--dir' || arg === '-d') {
      result.mode = 'directory';
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        result.paths.push(args[i + 1]);
        i++;
      }
    } else if (arg === '--prefix' || arg === '-p') {
      if (i + 1 < args.length && !args[i + 1].startsWith('--')) {
        result.prefix = args[i + 1];
        i++;
      }
    } else if (arg === '--no-invalidate') {
      result.invalidateCache = false;
    } else if (!arg.startsWith('--') && !arg.startsWith('-')) {
      // Handle comma-separated paths
      const paths = arg.split(',').map((p) => p.trim());
      result.paths.push(...paths);
    }
  }

  return result;
}

/**
 * Main function
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.info(`
${colors.cyan}Image Upload Utility${colors.reset}

Upload images to S3 bucket with support for single files, multiple files, or entire directories.

${colors.yellow}Usage:${colors.reset}
  npm run images:upload <paths>                    Upload single or multiple images (comma-separated)
  npm run images:upload --dir <directory>          Upload all images from a directory (recursive)
  npm run images:upload <paths> --prefix <prefix>  Upload with custom S3 prefix
  npm run images:upload --help                     Show this help message

${colors.yellow}Options:${colors.reset}
  --dir, -d <directory>     Upload all images from directory (recursive)
  --prefix, -p <prefix>     S3 key prefix for uploaded files (default: media)
  --no-invalidate           Skip CloudFront cache invalidation

${colors.yellow}Examples:${colors.reset}
  npm run images:upload public/media/profile.jpg
  npm run images:upload ./images/photo1.jpg,./images/photo2.png
  npm run images:upload --dir public/media/gallery
  npm run images:upload --dir ./uploads --prefix user-content/

${colors.yellow}Supported image formats:${colors.reset}
  jpg, jpeg, png, gif, webp, svg, ico, bmp, tiff, tif, avif

${colors.yellow}Environment Variables:${colors.reset}
  S3_BUCKET                    - S3 bucket name (required)
  AWS_REGION                   - AWS region (default: us-east-1)
  CLOUDFRONT_DISTRIBUTION_ID   - CloudFront distribution ID (optional)
    `);
    process.exit(0);
  }

  if (!S3_BUCKET) {
    log('S3_BUCKET environment variable is not set', 'error');
    process.exit(1);
  }

  try {
    const parsedArgs = parseArgs(args);
    let filePaths: string[] = [];

    if (parsedArgs.mode === 'directory') {
      if (parsedArgs.paths.length === 0) {
        log('No directory specified with --dir option', 'error');
        process.exit(1);
      }

      const dirPath = resolvePath(parsedArgs.paths[0]);
      log(`Collecting images from directory: ${dirPath}`, 'info');
      filePaths = collectImagesFromDirectory(dirPath);
      log(`Found ${filePaths.length} image(s)`, 'info');

      // Pass the base directory for proper S3 key generation
      parsedArgs.baseDir = dirPath;
    } else {
      if (parsedArgs.paths.length === 0) {
        log('No file paths specified', 'error');
        process.exit(1);
      }
      filePaths = parsedArgs.paths;
    }

    if (filePaths.length === 0) {
      log('No images to upload', 'warning');
      process.exit(0);
    }

    const result = await uploadImages(S3_BUCKET, filePaths, {
      prefix: parsedArgs.prefix,
      invalidateCache: parsedArgs.invalidateCache,
      baseDir: parsedArgs.baseDir,
    });

    // Print summary
    console.info('\n' + '='.repeat(60));
    log(
      `Upload Summary: ${result.successful} successful, ${result.failed} failed, ${result.skipped} skipped`,
      result.failed > 0 ? 'warning' : 'success'
    );
    console.info('='.repeat(60));

    if (result.errors.length > 0) {
      console.error(`\n${colors.red}Errors:${colors.reset}`);
      result.errors.forEach(({ path, error }) => {
        console.error(`  ${path}: ${error}`);
      });
    }

    process.exit(result.failed > 0 ? 1 : 0);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log(`Fatal error: ${errorMessage}`, 'error');
    process.exit(1);
  }
}

// Run main if this is the entry point
if (require.main === module) {
  main();
}
