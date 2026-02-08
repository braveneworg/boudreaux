#!/usr/bin/env node

/**
 * S3 Backup and Restore Script
 * This script provides utilities to backup S3 bucket contents to local storage
 * and restore from local backup to S3
 *
 * Usage:
 *   # Backup S3 bucket to local directory
 *   npm run s3:backup [local-directory]
 *   # or
 *   ts-node scripts/s3-backup.ts backup [local-directory]
 *
 *   # Restore local backup to S3 bucket
 *   npm run s3:restore <local-directory>
 *   # or
 *   ts-node scripts/s3-backup.ts restore <local-directory>
 *
 *   # List available backups
 *   npm run s3:list
 *   # or
 *   ts-node scripts/s3-backup.ts list
 *
 * Examples:
 *   npm run s3:backup
 *   npm run s3:backup backups/s3-2026-02-07
 *   npm run s3:restore backups/s3-2026-02-07
 *   npm run s3:list
 *
 * Environment Variables:
 *   S3_BUCKET - S3 bucket name (required)
 *   AWS_REGION - AWS region (default: us-east-1)
 *   S3_BACKUP_PREFIX - S3 key prefix to backup/restore (default: '' - entire bucket)
 *   S3_MAX_BACKUPS - Maximum number of backups to keep (default: 5)
 *               Older backups are automatically deleted after successful backup
 */

import { createWriteStream, createReadStream } from 'fs';
import { basename, dirname, extname, join, posix } from 'path';
import { pipeline } from 'stream/promises';

import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import mime from 'mime';

import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
  readFileSync,
  rmdirSync,
  unlinkSync,
} from '../src/lib/system-utils';
import { sanitizeFilePath } from '../src/lib/utils/sanitization';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config(); // This loads .env as fallback

const S3_BUCKET = process.env.S3_BUCKET;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const S3_BACKUP_PREFIX = process.env.S3_BACKUP_PREFIX || '';
const MAX_BACKUPS_TO_KEEP = parseInt(process.env.S3_MAX_BACKUPS || '5', 10);
const CLOUDFRONT_DISTRIBUTION_ID = process.env.CLOUDFRONT_DISTRIBUTION_ID;

// Only check S3_BUCKET if running as main script (not when imported for testing)
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

interface BackupMetadata {
  timestamp: string;
  bucket: string;
  prefix: string;
  region: string;
  totalFiles: number;
  totalSize: number;
  files: Array<{
    key: string;
    size: number;
    lastModified: string;
    contentType?: string;
  }>;
}

interface RestoreResult {
  successful: number;
  failed: number;
  skipped: number;
  errors: Array<{ key: string; error: string }>;
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
 * Generate timestamp for backup directory
 */
export function generateTimestamp(): string {
  const now = new Date();
  return now.toISOString().replace(/:/g, '-').replace(/\..+/, '');
}

/**
 * Create default backup directory path
 */
export function getDefaultBackupPath(): string {
  const timestamp = generateTimestamp();
  return join('backups', `s3-${timestamp}`);
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
  const formattedMessage = `${color}[S3-BACKUP]${colors.reset} ${message}`;

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
 * Allowed file extensions for backup (images, audio, video only)
 */
const ALLOWED_EXTENSIONS = new Set([
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
  // Video
  '.mp4',
  '.webm',
  '.mov',
  '.avi',
  '.mkv',
  '.m4v',
  '.wmv',
  '.flv',
  '.ogv',
]);

/**
 * Check if a file key has an allowed media extension
 */
function isAllowedMediaFile(key: string): boolean {
  const ext = extname(key).toLowerCase();
  return ALLOWED_EXTENSIONS.has(ext);
}

/**
 * Determine the backups root directory from a given local directory path.
 * If localDir is a timestamped backup directory (starts with 's3-'), returns its parent.
 * Otherwise, returns localDir itself as the backups root.
 */
export function getBackupRootDir(localDir: string): string {
  const localDirBasename = basename(localDir);
  const isTimestampedBackup = localDirBasename.startsWith('s3-');
  return isTimestampedBackup ? dirname(localDir) : localDir;
}

/**
 * Load the most recent backup's metadata for change detection
 */
export function getLatestBackupMetadata(backupDir = 'backups'): BackupMetadata | null {
  if (!existsSync(backupDir)) {
    return null;
  }

  const items = readdirSync(backupDir);
  const s3Backups = items
    .filter((item) => {
      const itemPath = join(backupDir, item);
      try {
        return statSync(itemPath).isDirectory() && item.startsWith('s3-');
      } catch {
        // Ignore if the file/directory was deleted between readdirSync and statSync
        return false;
      }
    })
    .sort()
    .reverse();

  if (s3Backups.length === 0) {
    return null;
  }

  const latestPath = join(backupDir, s3Backups[0], 'backup-metadata.json');
  if (!existsSync(latestPath)) {
    return null;
  }

  try {
    const content = readFileSync(latestPath, 'utf8');
    return JSON.parse(content) as BackupMetadata;
  } catch {
    return null;
  }
}

/**
 * Check if the current S3 manifest matches the previous backup
 * Compares key, size, and lastModified for each file
 */
function hasChangedSinceLastBackup(
  currentFiles: Array<{ key: string; size: number; lastModified: string }>,
  previousMetadata: BackupMetadata
): boolean {
  if (currentFiles.length !== previousMetadata.files.length) {
    return true;
  }

  const previousMap = new Map(
    previousMetadata.files.map((f) => [f.key, { size: f.size, lastModified: f.lastModified }])
  );

  for (const file of currentFiles) {
    const prev = previousMap.get(file.key);
    if (!prev) return true;
    if (prev.size !== file.size) return true;
    if (prev.lastModified !== file.lastModified) return true;
  }

  return false;
}

/**
 * Backup S3 bucket to local directory
 */
export async function backupS3ToLocal(
  localDir: string,
  bucket: string = S3_BUCKET as string,
  prefix: string = S3_BACKUP_PREFIX,
  region: string = AWS_REGION
): Promise<BackupMetadata> {
  log(`Starting S3 backup from bucket: ${bucket}`, 'info');
  if (prefix) {
    log(`Filtering by prefix: ${prefix}`, 'info');
  }

  const s3Client = new S3Client({ region });
  const metadata: BackupMetadata = {
    timestamp: new Date().toISOString(),
    bucket,
    prefix,
    region,
    totalFiles: 0,
    totalSize: 0,
    files: [],
  };

  try {
    log(`Fetching list of objects from S3...`, 'info');

    // Phase 1: Collect the full manifest of eligible media files from S3
    const s3Manifest: Array<{
      key: string;
      size: number;
      lastModified: string;
    }> = [];
    let continuationToken: string | undefined;

    do {
      const listCommand = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });

      const listResponse = await s3Client.send(listCommand);

      if (!listResponse.Contents || listResponse.Contents.length === 0) {
        break;
      }

      for (const object of listResponse.Contents) {
        if (!object.Key) continue;

        if (!isAllowedMediaFile(object.Key)) {
          continue;
        }

        s3Manifest.push({
          key: object.Key,
          size: object.Size || 0,
          lastModified: object.LastModified?.toISOString() || '',
        });
      }

      continuationToken = listResponse.NextContinuationToken;
    } while (continuationToken);

    if (s3Manifest.length === 0) {
      log('No eligible media files found in bucket', 'warning');
      return metadata;
    }

    log(`Found ${s3Manifest.length} eligible media file(s) in S3`, 'info');

    // Phase 2: Compare against the most recent backup to detect changes
    const backupDir = getBackupRootDir(localDir);
    const previousMetadata = getLatestBackupMetadata(backupDir);

    if (previousMetadata && !hasChangedSinceLastBackup(s3Manifest, previousMetadata)) {
      log('No changes detected since last backup. Skipping.', 'success');
      return metadata;
    }

    if (previousMetadata) {
      log('Changes detected since last backup. Proceeding with download...', 'info');
    } else {
      log('No previous backup found. Proceeding with full download...', 'info');
    }

    // Phase 3: Download all eligible files
    // Ensure backup directory exists
    if (!existsSync(localDir)) {
      mkdirSync(localDir, { recursive: true });
    }

    for (const manifest of s3Manifest) {
      // Sanitize the S3 key to prevent path traversal attacks
      let sanitizedKey: string;
      try {
        sanitizedKey = sanitizeFilePath(manifest.key, localDir);
      } catch (error) {
        log(
          `Skipping object with invalid key: ${manifest.key} (${error instanceof Error ? error.message : 'Invalid path'})`,
          'warning'
        );
        continue;
      }

      const localPath = join(localDir, sanitizedKey);
      const localDirPath = dirname(localPath);

      // Create directory structure
      if (!existsSync(localDirPath)) {
        mkdirSync(localDirPath, { recursive: true });
      }

      log(`Downloading: ${manifest.key} (${formatBytes(manifest.size)})`, 'info');

      try {
        // Get object metadata and content
        const getCommand = new GetObjectCommand({
          Bucket: bucket,
          Key: manifest.key,
        });

        const response = await s3Client.send(getCommand);

        if (!response.Body) {
          log(`Warning: No body for ${manifest.key}`, 'warning');
          continue;
        }

        // Stream to file
        const writeStream = createWriteStream(localPath);
        await pipeline(response.Body as NodeJS.ReadableStream, writeStream);

        // Add to metadata
        metadata.files.push({
          key: manifest.key,
          size: manifest.size,
          lastModified: manifest.lastModified,
          contentType: response.ContentType,
        });

        metadata.totalSize += manifest.size;
        metadata.totalFiles++;

        log(`Downloaded: ${manifest.key}`, 'success');
      } catch (error) {
        log(
          `Error downloading ${manifest.key}: ${error instanceof Error ? error.message : 'Unknown error'}`,
          'error'
        );
      }
    }

    // Save metadata
    const metadataPath = join(localDir, 'backup-metadata.json');
    writeFileSync(metadataPath, JSON.stringify(metadata, null, 2));

    log(`Backup complete!`, 'success');
    log(`Total files: ${metadata.totalFiles}`, 'info');
    log(`Total size: ${formatBytes(metadata.totalSize)}`, 'info');
    log(`Backup saved to: ${localDir}`, 'info');

    return metadata;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log(`Backup failed: ${errorMessage}`, 'error');
    throw error;
  }
}

/**
 * Restore backup from local directory to S3
 */
export async function restoreLocalToS3(
  localDir: string,
  bucket: string = S3_BUCKET as string,
  region: string = AWS_REGION,
  overwrite = false
): Promise<RestoreResult> {
  log(`Starting restore to S3 bucket: ${bucket}`, 'info');
  log(`Restore source: ${localDir}`, 'info');

  if (!existsSync(localDir)) {
    throw new Error(`Backup directory not found: ${localDir}`);
  }

  const metadataPath = join(localDir, 'backup-metadata.json');
  let metadata: BackupMetadata | null = null;

  if (existsSync(metadataPath)) {
    try {
      const metadataContent = readFileSync(metadataPath, 'utf8');
      const parsedMetadata = JSON.parse(metadataContent) as BackupMetadata;
      metadata = parsedMetadata;
      log(`Found backup metadata from ${parsedMetadata.timestamp}`, 'info');
      log(`Original bucket: ${parsedMetadata.bucket}`, 'info');
      log(`Files to restore: ${parsedMetadata.totalFiles}`, 'info');
    } catch {
      log('Warning: Could not read backup metadata', 'warning');
    }
  }

  const s3Client = new S3Client({ region });
  const result: RestoreResult = {
    successful: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  };

  try {
    // If metadata exists, use it to restore files
    if (metadata && metadata.files.length > 0) {
      for (const file of metadata.files) {
        await restoreFile(
          s3Client,
          bucket,
          localDir,
          file.key,
          file.contentType,
          overwrite,
          result
        );
      }
    } else {
      // Otherwise, scan directory and upload all files
      log('No metadata found, scanning directory...', 'warning');
      await restoreDirectory(s3Client, bucket, localDir, '', overwrite, result);
    }

    log(`Restore complete!`, 'success');
    log(`Successful: ${result.successful}`, 'success');
    if (result.skipped > 0) {
      log(`Skipped: ${result.skipped}`, 'warning');
    }
    if (result.failed > 0) {
      log(`Failed: ${result.failed}`, 'error');
      if (result.errors.length > 0) {
        log('Errors:', 'error');
        result.errors.forEach((err) => log(`  ${err.key}: ${err.error}`, 'error'));
      }
    }

    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log(`Restore failed: ${errorMessage}`, 'error');
    throw error;
  }
}

/**
 * Invalidate CloudFront distribution cache after restoring files to S3
 */
export async function invalidateCloudFrontCache(
  distributionId: string = CLOUDFRONT_DISTRIBUTION_ID || '',
  region: string = AWS_REGION
): Promise<string | null> {
  if (!distributionId) {
    log('CLOUDFRONT_DISTRIBUTION_ID not set, skipping cache invalidation', 'warning');
    return null;
  }

  log('Creating CloudFront cache invalidation...', 'info');

  try {
    const cloudFrontClient = new CloudFrontClient({ region });
    const command = new CreateInvalidationCommand({
      DistributionId: distributionId,
      InvalidationBatch: {
        Paths: {
          Quantity: 1,
          Items: ['/*'],
        },
        CallerReference: `s3-restore-${Date.now()}`,
      },
    });

    const response = await cloudFrontClient.send(command);
    const invalidationId = response.Invalidation?.Id || null;

    log(`CloudFront invalidation created: ${invalidationId}`, 'success');
    log('Invalidation may take 5-15 minutes to complete', 'info');

    return invalidationId;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log(`Failed to create CloudFront invalidation: ${errorMessage}`, 'error');
    throw error;
  }
}

/**
 * Restore a single file to S3
 */
async function restoreFile(
  s3Client: S3Client,
  bucket: string,
  localDir: string,
  key: string,
  contentType: string | undefined,
  overwrite: boolean,
  result: RestoreResult
): Promise<void> {
  // Sanitize the key to prevent path traversal (defense in depth)
  let sanitizedKey: string;
  try {
    sanitizedKey = sanitizeFilePath(key, localDir);
  } catch (error) {
    log(
      `Skipping file with invalid key: ${key} (${error instanceof Error ? error.message : 'Invalid path'})`,
      'warning'
    );
    result.skipped++;
    return;
  }

  const localPath = join(localDir, sanitizedKey);

  if (!existsSync(localPath)) {
    log(`Warning: File not found locally: ${key}`, 'warning');
    result.skipped++;
    return;
  }

  try {
    // Check if file exists in S3
    if (!overwrite) {
      try {
        await s3Client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
        log(`Skipping (already exists): ${key}`, 'warning');
        result.skipped++;
        return;
      } catch (error) {
        const headObjectError = error as {
          $metadata?: { httpStatusCode?: number };
          Code?: string;
          name?: string;
        };
        const statusCode = headObjectError?.$metadata?.httpStatusCode;
        const errorCode = headObjectError?.Code ?? headObjectError?.name;

        // Only treat 404/NotFound/NoSuchKey as "object does not exist"
        if (statusCode === 404 || errorCode === 'NotFound' || errorCode === 'NoSuchKey') {
          // File doesn't exist, continue with upload
        } else {
          // Re-throw other errors (permissions, region, transient, etc.)
          throw error;
        }
      }
    }

    log(`Uploading: ${key}`, 'info');

    // Read file and upload
    const fileStream = createReadStream(localPath);
    const fileStats = statSync(localPath);

    // Determine content type
    const finalContentType = contentType || mime.getType(localPath) || 'application/octet-stream';

    const putCommand = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fileStream,
      ContentType: finalContentType,
    });

    await s3Client.send(putCommand);

    log(`Uploaded: ${key} (${formatBytes(fileStats.size)})`, 'success');
    result.successful++;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log(`Error uploading ${key}: ${errorMessage}`, 'error');
    result.failed++;
    result.errors.push({ key, error: errorMessage });
  }
}

/**
 * Recursively restore directory to S3
 */
async function restoreDirectory(
  s3Client: S3Client,
  bucket: string,
  baseDir: string,
  currentPath: string,
  overwrite: boolean,
  result: RestoreResult
): Promise<void> {
  const fullPath = join(baseDir, currentPath);
  const items = readdirSync(fullPath);

  for (const item of items) {
    // Skip metadata file
    if (item === 'backup-metadata.json' && currentPath === '') {
      continue;
    }

    const itemPath = join(fullPath, item);
    // Use POSIX separators for S3 keys (always forward slashes)
    const relativePath = currentPath ? posix.join(currentPath, item) : item;
    const stats = statSync(itemPath);

    if (stats.isDirectory()) {
      await restoreDirectory(s3Client, bucket, baseDir, relativePath, overwrite, result);
    } else {
      await restoreFile(s3Client, bucket, baseDir, relativePath, undefined, overwrite, result);
    }
  }
}

/**
 * List available backups
 */
export function listBackups(backupDir = 'backups'): void {
  if (!existsSync(backupDir)) {
    log('No backups directory found', 'warning');
    return;
  }

  const items = readdirSync(backupDir);
  const s3Backups = items
    .filter((item) => {
      const itemPath = join(backupDir, item);
      return statSync(itemPath).isDirectory() && item.startsWith('s3-');
    })
    .sort()
    .reverse();

  if (s3Backups.length === 0) {
    log('No S3 backups found', 'warning');
    return;
  }

  log(`Found ${s3Backups.length} S3 backup(s):`, 'info');
  console.info('');

  for (const backup of s3Backups) {
    const backupPath = join(backupDir, backup);
    const metadataPath = join(backupPath, 'backup-metadata.json');

    console.info(`${colors.cyan}${backup}${colors.reset}`);
    console.info(`  Path: ${backupPath}`);

    if (existsSync(metadataPath)) {
      try {
        const metadataContent = readFileSync(metadataPath, 'utf8');
        const metadata = JSON.parse(metadataContent) as BackupMetadata;

        console.info(`  Timestamp: ${metadata.timestamp}`);
        console.info(`  Bucket: ${metadata.bucket}`);
        if (metadata.prefix) {
          console.info(`  Prefix: ${metadata.prefix}`);
        }
        console.info(`  Files: ${metadata.totalFiles}`);
        console.info(`  Size: ${formatBytes(metadata.totalSize)}`);
      } catch {
        console.info(`  ${colors.yellow}(metadata read error)${colors.reset}`);
      }
    } else {
      console.info(`  ${colors.yellow}(no metadata)${colors.reset}`);
    }
    console.info('');
  }
}

/**
 * Clean up old backups, keeping only the most recent N backups
 */
export function cleanupOldBackups(backupDir = 'backups', maxBackups = MAX_BACKUPS_TO_KEEP): number {
  if (!existsSync(backupDir)) {
    return 0;
  }

  const items = readdirSync(backupDir);
  const s3Backups = items
    .filter((item) => {
      const itemPath = join(backupDir, item);
      return statSync(itemPath).isDirectory() && item.startsWith('s3-');
    })
    .sort()
    .reverse();

  // Calculate how many to delete
  const backupsToDelete = s3Backups.slice(maxBackups);

  if (backupsToDelete.length === 0) {
    return 0;
  }

  log(
    `Cleaning up ${backupsToDelete.length} old backup(s) (keeping ${maxBackups} most recent)...`,
    'info'
  );

  let deletedCount = 0;
  for (const backup of backupsToDelete) {
    const backupPath = join(backupDir, backup);
    try {
      // Recursively delete directory
      deleteDirectory(backupPath);
      log(`Deleted old backup: ${backup}`, 'success');
      deletedCount++;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      log(`Failed to delete backup ${backup}: ${errorMessage}`, 'error');
    }
  }

  return deletedCount;
}

/**
 * Recursively delete a directory and all its contents
 */
function deleteDirectory(dirPath: string): void {
  if (!existsSync(dirPath)) {
    return;
  }

  const items = readdirSync(dirPath);
  for (const item of items) {
    const itemPath = join(dirPath, item);
    const stats = statSync(itemPath);

    if (stats.isDirectory()) {
      deleteDirectory(itemPath);
    } else {
      unlinkSync(itemPath);
    }
  }

  rmdirSync(dirPath);
}

/**
 * Main CLI handler
 */
async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    switch (command) {
      case 'backup': {
        const localDir = args[1] || getDefaultBackupPath();
        await backupS3ToLocal(localDir);

        // Clean up old backups after successful backup
        const backupDir = getBackupRootDir(localDir);
        if (existsSync(backupDir)) {
          const deletedCount = cleanupOldBackups(backupDir);
          if (deletedCount > 0) {
            log(`Cleanup complete: removed ${deletedCount} old backup(s)`, 'info');
          }
        }
        break;
      }

      case 'restore': {
        const localDir = args[1];
        if (!localDir) {
          console.error('Error: Local directory path is required for restore');
          console.error('Usage: npm run s3:restore <local-directory>');
          process.exit(1);
        }
        const overwrite = args.includes('--overwrite') || args.includes('-f');
        const restoreResult = await restoreLocalToS3(
          localDir,
          S3_BUCKET as string,
          AWS_REGION,
          overwrite
        );
        if (restoreResult.successful > 0) {
          await invalidateCloudFrontCache();
        }
        break;
      }

      case 'list': {
        const backupDir = args[1] || 'backups';
        listBackups(backupDir);
        break;
      }

      case 'upload': {
        const localDir = args[1];
        if (!localDir) {
          console.error('Error: Local directory path is required for upload');
          console.error('Usage: npm run s3:upload <local-directory>');
          process.exit(1);
        }
        const uploadResult = await restoreLocalToS3(localDir, S3_BUCKET as string, AWS_REGION);
        if (uploadResult.successful > 0) {
          await invalidateCloudFrontCache();
        }
        break;
      }

      default:
        console.error('Usage:');
        console.error('  npm run s3:backup [local-directory]');
        console.error('  npm run s3:restore <local-directory> [--overwrite]');
        console.error('  npm run s3:list [backups-directory]');
        console.error('  npm run s3:upload <local-directory>');
        console.error('');
        console.error('Commands:');
        console.error('  backup   - Download S3 bucket contents to local directory');
        console.error('  restore  - Upload local backup to S3 bucket');
        console.error('  list     - List available S3 backups');
        console.error(
          '  upload   - Upload local backup to S3 bucket (deprecated, use restore instead)'
        );
        console.error('');
        console.error('Options:');
        console.error('  --overwrite, -f  - Overwrite existing files in S3 during restore');
        process.exit(1);
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    log(`Command failed: ${errorMessage}`, 'error');
    process.exit(1);
  }
}

// Run if called directly
if (require.main === module) {
  main();
}
