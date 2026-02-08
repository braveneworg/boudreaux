#!/usr/bin/env node

/**
 * MongoDB Backup and Restore Script
 * This script provides utilities to dump and restore MongoDB databases
 *
 * Usage:
 *   # Dump database to file
 *   npm run mongo:dump [output-file]
 *   # or
 *   ts-node scripts/mongo-backup.ts dump [output-file]
 *
 *   # Restore database from file
 *   npm run mongo:restore <input-file>
 *   # or
 *   ts-node scripts/mongo-backup.ts restore <input-file>
 *
 * Examples:
 *   npm run mongo:dump
 *   npm run mongo:dump backups/2026-02-07T10-00-00-mongo-backup.archive
 *   npm run mongo:restore backups/2026-02-07T10-00-00-mongo-backup.archive
 */

import { dirname, resolve, join } from 'path';

import dotenv from 'dotenv';

import {
  execSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  unlinkSync,
} from '../src/lib/system-utils';

// Load environment variables
dotenv.config({ path: '.env.local' });
dotenv.config(); // This loads .env as fallback

const DATABASE_URL = process.env.DATABASE_URL;

// Only check DATABASE_URL if running as main script (not when imported for testing)
if (!DATABASE_URL && require.main === module) {
  console.error('Error: DATABASE_URL environment variable is not set');
  console.error('Please ensure your .env.local or .env file contains DATABASE_URL');
  process.exit(1);
}

interface MongoConnectionInfo {
  uri: string;
  database: string;
}

/**
 * Parse MongoDB connection string to extract database name and connection URI
 */
export function parseMongoUri(uri: string): MongoConnectionInfo {
  try {
    // MongoDB URI format: mongodb[+srv]://username:password@host[:port]/database[?options]
    const url = new URL(uri);

    // Extract database name from pathname (remove leading /)
    let database = url.pathname.slice(1);

    // If there are query parameters, remove them from database name
    const queryIndex = database.indexOf('?');
    if (queryIndex !== -1) {
      database = database.substring(0, queryIndex);
    }

    if (!database) {
      throw new Error('Database name not found in connection string');
    }

    return {
      uri,
      database,
    };
  } catch (error) {
    throw new Error(
      `Failed to parse MongoDB URI: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }
}

/**
 * Clean up old backup files, keeping only the most recent ones
 * @param backupDir Directory containing backup files
 * @param keepCount Number of most recent backups to keep (default: 5)
 */
export function cleanupOldBackups(backupDir: string, keepCount = 5): void {
  if (!existsSync(backupDir)) {
    return;
  }

  try {
    // Get all .archive files in the backup directory
    const files = readdirSync(backupDir)
      .filter((file) => file.endsWith('.archive'))
      .map((file) => ({
        name: file,
        path: join(backupDir, file),
        mtime: statSync(join(backupDir, file)).mtime.getTime(),
      }))
      // Sort by modification time, newest first
      .sort((a, b) => b.mtime - a.mtime);

    // If we have more than keepCount files, delete the oldest ones
    if (files.length > keepCount) {
      const filesToDelete = files.slice(keepCount);

      if (filesToDelete.length > 0) {
        console.info(`Cleaning up ${filesToDelete.length} old backup(s)...`);

        filesToDelete.forEach((file) => {
          console.info(`  Deleting: ${file.name}`);
          unlinkSync(file.path);
        });

        console.info('');
      }
    }
  } catch (error) {
    console.warn(
      'Warning: Failed to clean up old backups:',
      error instanceof Error ? error.message : 'Unknown error'
    );
  }
}

/**
 * Create a MongoDB dump
 */
export function dumpDatabase(outputFile?: string, dbUrl?: string): void {
  const { uri, database } = parseMongoUri(dbUrl || DATABASE_URL || '');

  // Generate default filename if not provided (ISO 8601 format: YYYY-MM-DDTHH-MM-SS-mongo-backup.archive)
  const timestamp = new Date().toISOString().replace(/:/g, '-').replace(/\..+/, '');
  const defaultFile = `backups/${timestamp}-mongo-backup.archive`;
  const backupPath = resolve(outputFile || defaultFile);

  // Ensure backup directory exists
  const backupDir = dirname(backupPath);
  if (!existsSync(backupDir)) {
    console.info(`Creating backup directory: ${backupDir}`);
    mkdirSync(backupDir, { recursive: true });
  }

  console.info('Starting MongoDB dump...');
  console.info(`Database: ${database}`);
  console.info(`Output file: ${backupPath}`);
  console.info('');

  try {
    // Use mongodump with --archive flag for single-file backup
    // --gzip compresses the archive
    // --uri includes connection string
    const command = `mongodump --uri="${uri}" --archive="${backupPath}" --gzip`;

    console.info('Running mongodump...');
    execSync(command, {
      stdio: 'inherit',
      env: { ...process.env },
    });

    console.info('');
    console.info('✅ Backup completed successfully!');
    console.info(`📁 Backup saved to: ${backupPath}`);
    console.info('');

    // Clean up old backups (keep only 5 most recent)
    cleanupOldBackups(backupDir, 5);

    console.info(`To restore this backup, run:`);
    console.info(`  npm run mongo:restore ${backupPath}`);
  } catch (error) {
    console.error('');
    console.error('❌ Backup failed!');
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    }
    console.error('');
    console.error('Make sure MongoDB Database Tools are installed:');
    console.error('  macOS: brew install mongodb/brew/mongodb-database-tools');
    console.error('  Ubuntu/Debian: sudo apt-get install mongodb-database-tools');
    console.error('  Windows: Download from https://www.mongodb.com/try/download/database-tools');
    process.exit(1);
  }
}

/**
 * Restore a MongoDB dump
 */
export function restoreDatabase(inputFile: string, dbUrl?: string): void {
  const { uri, database } = parseMongoUri(dbUrl || DATABASE_URL || '');
  const backupPath = resolve(inputFile);

  if (!existsSync(backupPath)) {
    console.error(`Error: Backup file not found: ${backupPath}`);
    process.exit(1);
  }

  console.info('⚠️  WARNING: This will restore the database and may overwrite existing data!');
  console.info(`Database: ${database}`);
  console.info(`Input file: ${backupPath}`);
  console.info('');

  // In a real scenario, you might want to add a confirmation prompt here
  // For now, we'll proceed directly

  try {
    // Use mongorestore with --archive flag
    // --gzip handles compressed archives
    // --drop drops each collection before restoring
    // --uri includes connection string
    const command = `mongorestore --uri="${uri}" --archive="${backupPath}" --gzip --drop`;

    console.info('Running mongorestore...');
    execSync(command, {
      stdio: 'inherit',
      env: { ...process.env },
    });

    console.info('');
    console.info('✅ Restore completed successfully!');
    console.info(`📁 Database restored from: ${backupPath}`);
  } catch (error) {
    console.error('');
    console.error('❌ Restore failed!');
    if (error instanceof Error) {
      console.error(`Error: ${error.message}`);
    }
    console.error('');
    console.error('Make sure MongoDB Database Tools are installed:');
    console.error('  macOS: brew install mongodb/brew/mongodb-database-tools');
    console.error('  Ubuntu/Debian: sudo apt-get install mongodb-database-tools');
    console.error('  Windows: Download from https://www.mongodb.com/try/download/database-tools');
    process.exit(1);
  }
}

/**
 * Display usage information
 */
export function showUsage(): void {
  console.info('MongoDB Backup and Restore Script');
  console.info('');
  console.info('Usage:');
  console.info('  npm run mongo:dump [output-file]    - Create a database backup');
  console.info('  npm run mongo:restore <input-file>  - Restore a database backup');
  console.info('');
  console.info('Examples:');
  console.info('  npm run mongo:dump');
  console.info('  npm run mongo:dump backups/my-backup.archive');
  console.info('  npm run mongo:restore backups/my-backup.archive');
  console.info('');
}

// Main execution - only run when script is executed directly
if (require.main === module) {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || command === '--help' || command === '-h') {
    showUsage();
    process.exit(0);
  }

  switch (command.toLowerCase()) {
    case 'dump':
    case 'backup':
      dumpDatabase(args[1]);
      break;

    case 'restore':
      if (!args[1]) {
        console.error('Error: Input file path required for restore');
        console.error('');
        showUsage();
        process.exit(1);
      }
      restoreDatabase(args[1]);
      break;

    default:
      console.error(`Error: Unknown command '${command}'`);
      console.error('');
      showUsage();
      process.exit(1);
  }
}
