#!/usr/bin/env node

/**
 * CDN Sync Script for Next.js Build Process
 * This script syncs static assets to S3 and invalidates CloudFront using AWS SDK
 */

import { execSync, spawn } from 'child_process';
import { existsSync, readdirSync, statSync, createReadStream } from 'fs';
import { join } from 'path';

import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import {
  S3Client,
  ListObjectsV2Command,
  HeadObjectCommand,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import dotenv from 'dotenv';
import * as mime from 'mime';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config(); // This loads .env as fallback

const S3_BUCKET = process.env.S3_BUCKET;
const CDN_DOMAIN = process.env.CDN_DOMAIN;

if (!S3_BUCKET) {
  console.error('[CDN-SYNC] S3_BUCKET environment variable must be set');
  process.exit(1);
}

if (!CDN_DOMAIN) {
  console.error('[CDN-SYNC] CDN_DOMAIN environment variable must be set');
  process.exit(1);
}

// Color codes for console output
const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  reset: '\x1b[0m',
};

// Configuration interface
interface SyncConfig {
  s3Bucket: string;
  cloudFrontDistributionId?: string;
  cdnDomain: string;
  buildDir: string;
  mediaDir: string;
  skipBuild: boolean;
  skipInvalidation: boolean;
  skipCleanup: boolean;
  awsRegion: string;
}

// File upload interface
interface FileToUpload {
  localPath: string;
  s3Key: string;
  contentType: string;
  cacheControl: string;
}

// Content types are now handled automatically by mime.getType() during upload

class CDNSync {
  private config: SyncConfig;
  private s3Client: S3Client;
  private cloudFrontClient: CloudFrontClient;

  constructor() {
    this.config = this.loadConfig();
    this.s3Client = new S3Client({ region: this.config.awsRegion });
    this.cloudFrontClient = new CloudFrontClient({ region: 'us-east-1' }); // CloudFront is always us-east-1
  }

  private loadConfig(): SyncConfig {
    return {
      s3Bucket: process.env.S3_BUCKET || 'fakefourmedia',
      cloudFrontDistributionId: process.env.CLOUDFRONT_DISTRIBUTION_ID,
      cdnDomain: process.env.CDN_DOMAIN || 'not found', // CloudFront domain, not S3
      buildDir: '.next',
      mediaDir: join('public', 'media'),
      skipBuild: process.env.SKIP_BUILD === 'true',
      skipInvalidation: process.env.SKIP_INVALIDATION === 'true',
      skipCleanup: process.env.SKIP_CLEANUP === 'true',
      awsRegion: process.env.AWS_REGION || 'us-east-1',
    };
  }

  private log(message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info'): void {
    const colorMap = {
      info: colors.blue,
      success: colors.green,
      warning: colors.yellow,
      error: colors.red,
    };

    console.info(`${colorMap[type]}[CDN-SYNC]${colors.reset} ${message}`);
  }

  private async execCommand(command: string, options: { quiet?: boolean } = {}): Promise<string> {
    try {
      const result = execSync(command, {
        encoding: 'utf8',
        stdio: options.quiet ? 'pipe' : 'inherit',
        cwd: process.cwd(), // Ensure we're in the right directory
      });
      return result.toString().trim();
    } catch (error: unknown) {
      const err = error as { status?: number; signal?: string; stderr?: Buffer; stdout?: Buffer };
      let errorMessage = `Command failed: ${command}`;

      if (err.status !== undefined) {
        errorMessage += `\nExit code: ${err.status}`;
      }

      if (err.stderr) {
        errorMessage += `\nStderr: ${err.stderr.toString()}`;
      }

      if (err.stdout) {
        errorMessage += `\nStdout: ${err.stdout.toString()}`;
      }

      throw new Error(errorMessage);
    }
  }

  private validateConfig(): void {
    if (this.config.s3Bucket !== process.env.S3_BUCKET) {
      this.log('S3_BUCKET environment variable must be set', 'error');
      process.exit(1);
    }

    if (!this.config.cloudFrontDistributionId && !this.config.skipInvalidation) {
      this.log('CLOUDFRONT_DISTRIBUTION_ID not set, skipping invalidation', 'warning');
      this.config.skipInvalidation = true;
    }
  }

  private async checkAWSCredentials(): Promise<void> {
    this.log('Validating AWS credentials and S3 access...');

    // Check if AWS credentials are available in environment
    if (!process.env.AWS_ACCESS_KEY_ID && !process.env.AWS_PROFILE) {
      this.log(
        'No AWS credentials found. Please set AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY or AWS_PROFILE',
        'error'
      );
      this.log('You can also run: aws configure', 'error');
      process.exit(1);
    }

    try {
      // Test S3 connection by trying to list objects (this will validate credentials)
      this.log(`Testing access to S3 bucket: ${this.config.s3Bucket}`);
      await this.s3Client.send(
        new ListObjectsV2Command({
          Bucket: this.config.s3Bucket,
          MaxKeys: 1,
        })
      );
      this.log('AWS credentials and S3 access validated', 'success');
    } catch (error: unknown) {
      const err = error as {
        name?: string;
        message?: string;
        $metadata?: { httpStatusCode?: number };
      };

      this.log(`AWS validation failed with error: ${err.name}`, 'error');

      if (err.name === 'NoSuchBucket') {
        this.log(
          `S3 bucket '${this.config.s3Bucket}' does not exist or is not accessible`,
          'error'
        );
        this.log('Please verify the bucket name and that it exists in your AWS account', 'error');
      } else if (err.name === 'AccessDenied') {
        this.log('AWS credentials do not have permission to access this S3 bucket', 'error');
        this.log('Required permissions: s3:ListBucket, s3:PutObject, s3:GetObject', 'error');
      } else if (err.name === 'CredentialsProviderError' || err.name === 'UnknownEndpoint') {
        this.log('AWS credentials are invalid or not properly configured', 'error');
        this.log('Please check your AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY', 'error');
      } else if (err.name === 'NetworkingError') {
        this.log('Network error connecting to AWS. Check your internet connection', 'error');
      } else {
        this.log(`Unexpected error: ${err.message || String(error)}`, 'error');
        this.log('Please check your AWS configuration and try again', 'error');
      }

      // Additional debugging info
      this.log(`AWS Region: ${this.config.awsRegion}`, 'info');
      this.log(`Using AWS Profile: ${process.env.AWS_PROFILE || 'default'}`, 'info');

      process.exit(1);
    }
  }

  private async buildApplication(): Promise<void> {
    if (this.config.skipBuild) {
      this.log('Skipping build (SKIP_BUILD=true)', 'warning');
      return;
    }

    this.log('Building Next.js application...');

    return new Promise((resolve, reject) => {
      const child = spawn('npm', ['run', 'build'], {
        stdio: 'inherit',
        cwd: process.cwd(),
      });

      child.on('close', (code) => {
        if (code === 0) {
          this.log('Build completed', 'success');
          resolve();
        } else {
          reject(new Error(`Build failed with exit code ${code}`));
        }
      });

      child.on('error', (error) => {
        reject(new Error(`Build process error: ${error.message}`));
      });
    });
  }

  private validateBuildDirectory(): void {
    if (!existsSync(this.config.buildDir)) {
      this.log(
        `Build directory '${this.config.buildDir}' not found. Make sure to run 'npm run build' first.`,
        'error'
      );
      process.exit(1);
    }
  }

  private async syncStaticFiles(): Promise<void> {
    this.log('Syncing Next.js static files...');

    // Check if build directory exists before trying to sync static files
    if (!existsSync(this.config.buildDir)) {
      this.log(
        `Build directory '${this.config.buildDir}' not found. Skipping static files sync.`,
        'warning'
      );
      return;
    }

    const staticDir = join(this.config.buildDir, 'static');
    if (!existsSync(staticDir)) {
      this.log('No static files found to sync', 'warning');
      return;
    }

    const filesToUpload = this.getFilesToUpload(staticDir, 'media/_next/static', {
      cacheControl: 'public, max-age=31536000, immutable',
      excludePatterns: ['*.map', '*.DS_Store'],
    });

    await this.uploadFiles(filesToUpload);
    this.log(`Uploaded ${filesToUpload.length} static files`, 'success');
  }

  private async syncMediaFiles(): Promise<void> {
    this.log('Syncing media directory files...');

    if (!existsSync(this.config.mediaDir)) {
      this.log('Media directory not found, skipping', 'warning');
      return;
    }

    // Sync non-HTML files with longer cache
    const regularFiles = this.getFilesToUpload(this.config.mediaDir, 'media', {
      cacheControl: 'public, max-age=86400',
      excludePatterns: ['*.html', '*.DS_Store'],
    });

    // Sync HTML files with shorter cache
    const htmlFiles = this.getFilesToUpload(this.config.mediaDir, 'media', {
      cacheControl: 'public, max-age=300',
      excludePatterns: ['*.DS_Store'],
    }).filter((file) => file.localPath.endsWith('.html'));

    const allFiles = [...regularFiles, ...htmlFiles];

    if (allFiles.length > 0) {
      await this.uploadFiles(allFiles);
      this.log(`Uploaded ${allFiles.length} media files`, 'success');
    } else {
      this.log('No media files to sync', 'warning');
    }
  }

  private async syncMediaAssets(): Promise<void> {
    this.log('Syncing additional media assets...');

    // Define directories that might contain media assets
    const mediaDirs = ['music', 'images', 'videos'];
    let totalFiles = 0;

    for (const dir of mediaDirs) {
      if (existsSync(dir)) {
        this.log(`Found ${dir} directory, syncing...`);

        const files = this.getFilesToUpload(dir, `media/${dir}`, {
          cacheControl: 'public, max-age=86400',
          excludePatterns: ['*.DS_Store', '*.tmp'],
        });

        if (files.length > 0) {
          await this.uploadFiles(files);
          totalFiles += files.length;
          this.log(`✓ Synced ${files.length} files from ${dir}/`, 'success');
        }
      }
    }

    if (totalFiles > 0) {
      this.log(`Total media files synced: ${totalFiles}`, 'success');
    } else {
      this.log('No additional media assets found to sync', 'info');
    }
  }

  private getFilesToUpload(
    localDir: string,
    s3Prefix: string,
    options: { cacheControl: string; excludePatterns?: string[] }
  ): FileToUpload[] {
    const files: FileToUpload[] = [];
    const excludePatterns = options.excludePatterns || [];

    const walkDir = (currentDir: string, currentPrefix: string) => {
      try {
        const items = readdirSync(currentDir);
        for (const item of items) {
          const fullPath = join(currentDir, item);
          const stat = statSync(fullPath);

          // Check if file should be excluded
          const shouldExclude = excludePatterns.some((pattern) => {
            const regex = new RegExp(pattern.replace('*', '.*'));
            return regex.test(item);
          });

          if (shouldExclude) continue;

          if (stat.isDirectory()) {
            walkDir(fullPath, `${currentPrefix}/${item}`);
          } else {
            const s3Key = `${s3Prefix}${currentPrefix}/${item}`.replace(/\/+/g, '/');
            const contentType = mime.default.getType(fullPath) || 'application/octet-stream';

            files.push({
              localPath: fullPath,
              s3Key,
              contentType,
              cacheControl: options.cacheControl,
            });
          }
        }
      } catch {
        // Directory might not exist or be accessible
      }
    };

    walkDir(localDir, '');
    return files;
  }

  private async uploadFiles(files: FileToUpload[]): Promise<void> {
    const uploadPromises = files.map(async (file) => {
      try {
        const upload = new Upload({
          client: this.s3Client,
          params: {
            Bucket: this.config.s3Bucket,
            Key: file.s3Key,
            Body: createReadStream(file.localPath),
            ContentType: file.contentType,
            CacheControl: file.cacheControl,
          },
        });

        await upload.done();
        this.log(`✓ ${file.s3Key}`, 'info');
      } catch (error: unknown) {
        this.log(`✗ Failed to upload ${file.s3Key}: ${error}`, 'error');
        throw error;
      }
    });

    await Promise.all(uploadPromises);
  }

  private async clearS3MediaDirectory(): Promise<void> {
    this.log('Clearing existing media files from S3...');

    try {
      // List all objects with the 'media/' prefix
      const listCommand = new ListObjectsV2Command({
        Bucket: this.config.s3Bucket,
        Prefix: 'media/',
      });

      const response = await this.s3Client.send(listCommand);

      if (!response.Contents || response.Contents.length === 0) {
        this.log('No existing media files found in S3', 'info');
        return;
      }

      // Delete objects in batches (S3 allows max 1000 objects per delete request)
      const objectsToDelete = response.Contents.map((obj) => ({ Key: obj.Key! }));

      const deleteCommand = new DeleteObjectsCommand({
        Bucket: this.config.s3Bucket,
        Delete: {
          Objects: objectsToDelete,
          Quiet: false,
        },
      });

      const deleteResponse = await this.s3Client.send(deleteCommand);

      const deletedCount = deleteResponse.Deleted?.length || 0;
      const errorCount = deleteResponse.Errors?.length || 0;

      this.log(`Successfully deleted ${deletedCount} files from S3`, 'success');

      if (errorCount > 0) {
        this.log(`Failed to delete ${errorCount} files`, 'warning');
        deleteResponse.Errors?.forEach((error) => {
          this.log(`Error deleting ${error.Key}: ${error.Message}`, 'error');
        });
      }

      // Handle pagination if there are more than 1000 objects
      if (response.IsTruncated) {
        this.log('More files to delete, continuing...', 'info');
        await this.clearS3MediaDirectory(); // Recursive call for remaining files
      }
    } catch (error: unknown) {
      this.log(
        `Failed to clear S3 media directory: ${error instanceof Error ? error.message : String(error)}`,
        'error'
      );
      throw error;
    }
  }

  private async setContentTypes(): Promise<void> {
    this.log('Content types are set during upload - skipping post-processing', 'info');
    // Content types are now set automatically during upload via mime.getType()
    // This eliminates the need for post-processing and improves performance
  }

  private async createCloudFrontInvalidation(): Promise<void> {
    if (this.config.skipInvalidation) {
      this.log('Skipping CloudFront invalidation', 'warning');
      return;
    }

    if (!this.config.cloudFrontDistributionId) {
      this.log('CloudFront distribution ID not provided, skipping invalidation', 'warning');
      return;
    }

    this.log('Creating CloudFront invalidation...');

    try {
      const command = new CreateInvalidationCommand({
        DistributionId: this.config.cloudFrontDistributionId,
        InvalidationBatch: {
          Paths: {
            Quantity: 1,
            Items: ['/*'],
          },
          CallerReference: `cdn-sync-${Date.now()}`,
        },
      });

      const response = await this.cloudFrontClient.send(command);
      const invalidationId = response.Invalidation?.Id;

      this.log(`CloudFront invalidation created: ${invalidationId}`, 'success');
      this.log('Invalidation may take 5-15 minutes to complete');
    } catch (error: unknown) {
      this.log(`Failed to create CloudFront invalidation: ${error}`, 'error');
      throw error;
    }
  }

  private async testSampleFile(): Promise<void> {
    // Test files in media directory
    const testFiles = [
      'media/_next/static/chunks/webpack.js',
      'media/next.svg', // from public/media directory
      'media/index.html', // if you have HTML files
    ];

    for (const sampleFile of testFiles) {
      try {
        const command = new HeadObjectCommand({
          Bucket: this.config.s3Bucket,
          Key: sampleFile,
        });

        await this.s3Client.send(command);
        this.log(`✓ Sample file confirmed: ${this.config.cdnDomain}/${sampleFile}`, 'success');
        return; // Exit after finding first successful file
      } catch {
        // Try next file
      }
    }

    this.log('Could not confirm any sample files (this might be normal)', 'warning');
  }

  public async run(): Promise<void> {
    try {
      this.log('Starting CDN sync process...');
      this.log(`S3 Bucket: ${this.config.s3Bucket}`);
      this.log(`CDN Domain: ${this.config.cdnDomain}`);

      // Validation
      this.validateConfig();
      await this.checkAWSCredentials();

      // Build process
      await this.buildApplication();
      
      // Only validate build directory if we're not skipping build
      // Media files can be synced without a build
      if (!this.config.skipBuild) {
        this.validateBuildDirectory();
      }

      // Clear existing media files first (unless skipped)
      if (!this.config.skipCleanup) {
        await this.clearS3MediaDirectory();
      } else {
        this.log('Skipping S3 cleanup (SKIP_CLEANUP=true)', 'warning');
      }

      // Sync files
      await this.syncMediaFiles();
      await this.syncStaticFiles();
      await this.syncMediaAssets();

      // Optimize
      await this.setContentTypes();

      // Invalidate CDN
      await this.createCloudFrontInvalidation();

      // Test
      await this.testSampleFile();

      // Success
      this.log('CDN sync completed successfully!', 'success');
      this.log(`Static assets are now available at: ${this.config.cdnDomain}`, 'success');
      this.log('Sync process finished');
    } catch (error) {
      this.log(`Sync failed: ${error instanceof Error ? error.message : String(error)}`, 'error');
      process.exit(1);
    }
  }
}

// Run the script if called directly
if (require.main === module) {
  const cdnSync = new CDNSync();
  cdnSync.run();
}

// Copy files down from cdn.fakefourrecords.com/media directory to public/media
// This makes sure we always have the latest media files locally for development
const cdnMediaDir = 'cdn.fakefourrecords.com/media';
// Create the publicMediaDir if it doesn't exist
const publicMediaDir = join(process.cwd(), 'public', 'media');

if (!existsSync(publicMediaDir)) {
  execSync(`mkdir -p ${publicMediaDir}`);
  console.info(`${colors.green}[CDN-SYNC]${colors.reset} Created directory: ${publicMediaDir}`);
}

if (existsSync(cdnMediaDir)) {
  execSync(`cp -r ${cdnMediaDir}/* ${publicMediaDir}/`);
  console.info(
    `${colors.green}[CDN-SYNC]${colors.reset} Copied media files from ${cdnMediaDir} to ${publicMediaDir}`
  );
} else {
  console.info(
    `${colors.yellow}[CDN-SYNC]${colors.reset} No media files found at ${cdnMediaDir}, skipping copy`
  );
}

export default CDNSync;
