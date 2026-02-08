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
 */

import { createWriteStream, createReadStream } from 'fs';
import { dirname, join } from 'path';
import { pipeline } from 'stream/promises';

import {
  S3Client,
  ListObjectsV2Command,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
} from '@aws-sdk/client-s3';
import dotenv from 'dotenv';
import * as mime from 'mime';

import {
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
  readFileSync,
} from '../src/lib/system-utils';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config(); // This loads .env as fallback

const S3_BUCKET = process.env.S3_BUCKET;
const AWS_REGION = process.env.AWS_REGION || 'us-east-1';
const S3_BACKUP_PREFIX = process.env.S3_BACKUP_PREFIX || '';

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
    // Ensure backup directory exists
    if (!existsSync(localDir)) {
      mkdirSync(localDir, { recursive: true });
    }

    log(`Fetching list of objects from S3...`, 'info');

    // List all objects in the bucket
    let continuationToken: string | undefined;
    let totalObjects = 0;

    do {
      const listCommand = new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      });

      const listResponse = await s3Client.send(listCommand);

      if (!listResponse.Contents || listResponse.Contents.length === 0) {
        if (totalObjects === 0) {
          log('No objects found in bucket', 'warning');
        }
        break;
      }

      totalObjects += listResponse.Contents.length;

      // Download each object
      for (const object of listResponse.Contents) {
        if (!object.Key) continue;

        const localPath = join(localDir, object.Key);
        const localDirPath = dirname(localPath);

        // Create directory structure
        if (!existsSync(localDirPath)) {
          mkdirSync(localDirPath, { recursive: true });
        }

        log(`Downloading: ${object.Key} (${formatBytes(object.Size || 0)})`, 'info');

        try {
          // Get object metadata and content
          const getCommand = new GetObjectCommand({
            Bucket: bucket,
            Key: object.Key,
          });

          const response = await s3Client.send(getCommand);

          if (!response.Body) {
            log(`Warning: No body for ${object.Key}`, 'warning');
            continue;
          }

          // Stream to file
          const writeStream = createWriteStream(localPath);
          await pipeline(response.Body as NodeJS.ReadableStream, writeStream);

          // Add to metadata
          metadata.files.push({
            key: object.Key,
            size: object.Size || 0,
            lastModified: object.LastModified?.toISOString() || '',
            contentType: response.ContentType,
          });

          metadata.totalSize += object.Size || 0;
          metadata.totalFiles++;

          log(`Downloaded: ${object.Key}`, 'success');
        } catch (error) {
          log(
            `Error downloading ${object.Key}: ${error instanceof Error ? error.message : 'Unknown error'}`,
            'error'
          );
        }
      }

      continuationToken = listResponse.NextContinuationToken;
    } while (continuationToken);

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
      metadata = JSON.parse(metadataContent);
      log(`Found backup metadata from ${metadata.timestamp}`, 'info');
      log(`Original bucket: ${metadata.bucket}`, 'info');
      log(`Files to restore: ${metadata.totalFiles}`, 'info');
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
  const localPath = join(localDir, key);

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
      } catch {
        // File doesn't exist, continue with upload
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
    const relativePath = currentPath ? join(currentPath, item) : item;
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
        await restoreLocalToS3(localDir, S3_BUCKET as string, AWS_REGION, overwrite);
        break;
      }

      case 'list': {
        const backupDir = args[1] || 'backups';
        listBackups(backupDir);
        break;
      }

      default:
        console.error('Usage:');
        console.error('  npm run s3:backup [local-directory]');
        console.error('  npm run s3:restore <local-directory> [--overwrite]');
        console.error('  npm run s3:list [backups-directory]');
        console.error('');
        console.error('Commands:');
        console.error('  backup   - Download S3 bucket contents to local directory');
        console.error('  restore  - Upload local backup to S3 bucket');
        console.error('  list     - List available S3 backups');
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
