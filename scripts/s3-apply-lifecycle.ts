#!/usr/bin/env node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * S3 Lifecycle Configuration Script
 *
 * Applies a managed lifecycle configuration to the bucket used by the app.
 * The rules here exist to contain the long-tail storage cost and DoS surface
 * of code paths that write into `tmp/` prefixes on S3 — most notably the
 * bundle-download route which uploads a per-request ZIP at
 * `tmp/bundles/{userId}/{uuid}.zip` and only deletes it on the failure path.
 *
 * Rules applied:
 *   1. tmp-bundles-expire-after-1-day
 *      Expires every object under `tmp/bundles/` 1 day after creation. The
 *      download presigned URL is only valid for 15 minutes, so 1 day is
 *      already 96× the useful lifetime.
 *   2. tmp-generic-expire-after-7-days
 *      Expires every object under `tmp/` (that is NOT already covered by
 *      the more-specific bundle rule) after 7 days. Anything we stash under
 *      `tmp/` is by definition short-lived.
 *   3. abort-incomplete-multipart-after-1-day
 *      Aborts any multipart upload that has been inactive for 1 day. This
 *      covers bundle ZIP uploads and digital-format proxy uploads that fail
 *      before `CompleteMultipartUpload` — without this rule AWS retains the
 *      parts indefinitely and charges for them.
 *
 * Usage:
 *   # Dry run (default) — print the rules and exit without applying
 *   pnpm run s3:lifecycle
 *
 *   # Apply the configuration
 *   pnpm run s3:lifecycle -- --apply
 *
 *   # Show the bucket's current lifecycle configuration and exit
 *   pnpm run s3:lifecycle -- --show
 *
 * Environment Variables:
 *   AWS_S3_BUCKET_NAME / S3_BUCKET - S3 bucket name (required)
 *   AWS_REGION                     - AWS region (default: us-east-1)
 *   AWS_ACCESS_KEY_ID              - AWS credentials (required)
 *   AWS_SECRET_ACCESS_KEY          - AWS credentials (required)
 */

import {
  GetBucketLifecycleConfigurationCommand,
  PutBucketLifecycleConfigurationCommand,
  S3Client,
  S3ServiceException,
  type LifecycleRule,
} from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME ?? process.env.S3_BUCKET;
const AWS_REGION = process.env.AWS_REGION ?? 'us-east-1';

const colors = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
} as const;

/**
 * Lifecycle rules for the bucket. Rule IDs are stable so this script is
 * idempotent: re-running it replaces these rules but leaves any other rules
 * alone (see `mergeRules` below).
 */
const MANAGED_RULES: LifecycleRule[] = [
  {
    ID: 'tmp-bundles-expire-after-1-day',
    Status: 'Enabled',
    Filter: { Prefix: 'tmp/bundles/' },
    Expiration: { Days: 1 },
    // Object versions aren't enabled on this bucket today, but these fields
    // make the rule safe if versioning is ever turned on.
    NoncurrentVersionExpiration: { NoncurrentDays: 1 },
  },
  {
    ID: 'tmp-generic-expire-after-7-days',
    Status: 'Enabled',
    Filter: {
      And: {
        Prefix: 'tmp/',
        // Don't double-delete bundles — the rule above owns that prefix.
        ObjectSizeGreaterThan: 0,
      },
    },
    Expiration: { Days: 7 },
    NoncurrentVersionExpiration: { NoncurrentDays: 7 },
  },
  {
    ID: 'abort-incomplete-multipart-after-1-day',
    Status: 'Enabled',
    // Empty filter = apply to all objects in the bucket.
    Filter: { Prefix: '' },
    AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 },
  },
];

function log(prefix: string, color: keyof typeof colors, message: string): void {
  process.stdout.write(`${colors[color]}${prefix}${colors.reset} ${message}\n`);
}

function fail(message: string): never {
  process.stderr.write(`${colors.red}✗${colors.reset} ${message}\n`);
  process.exit(1);
}

function parseArgs(argv: readonly string[]): {
  apply: boolean;
  showOnly: boolean;
} {
  let apply = false;
  let showOnly = false;
  for (const arg of argv) {
    // pnpm 10 forwards a literal `--` separator when users invoke the script
    // as `pnpm run s3:lifecycle -- --apply`. Skip it.
    if (arg === '--') continue;
    if (arg === '--apply') apply = true;
    else if (arg === '--show') showOnly = true;
    else if (arg === '--help' || arg === '-h') {
      process.stdout.write(
        `Usage: pnpm run s3:lifecycle [--apply | --show]\n` +
          `  (default)  dry run — print the rules that would be applied\n` +
          `  --apply    apply the managed rules (merged with any existing rules)\n` +
          `  --show     print the bucket's current lifecycle configuration and exit\n`
      );
      process.exit(0);
    } else {
      fail(`Unknown argument: ${arg}`);
    }
  }
  return { apply, showOnly };
}

async function fetchExistingRules(client: S3Client, bucket: string): Promise<LifecycleRule[]> {
  try {
    const result = await client.send(
      new GetBucketLifecycleConfigurationCommand({ Bucket: bucket })
    );
    return result.Rules ?? [];
  } catch (err) {
    if (err instanceof S3ServiceException && err.name === 'NoSuchLifecycleConfiguration') {
      return [];
    }
    throw err;
  }
}

/**
 * Merge our managed rules on top of whatever is already on the bucket so
 * running this script never wipes out unrelated rules a human may have set.
 * Managed rule IDs win; everything else is preserved.
 */
function mergeRules(existing: readonly LifecycleRule[]): LifecycleRule[] {
  const managedIds = new Set(MANAGED_RULES.map((rule) => rule.ID));
  const unchanged = existing.filter((rule) => rule.ID && !managedIds.has(rule.ID));
  return [...unchanged, ...MANAGED_RULES];
}

function printRules(rules: readonly LifecycleRule[]): void {
  if (rules.length === 0) {
    log('∅', 'dim', 'no rules');
    return;
  }
  for (const rule of rules) {
    log('•', 'cyan', `${colors.bold}${rule.ID ?? '<unnamed>'}${colors.reset} (${rule.Status})`);
    process.stdout.write(`    ${colors.dim}${JSON.stringify(rule.Filter)}${colors.reset}\n`);
    if (rule.Expiration) {
      process.stdout.write(`    expire: ${JSON.stringify(rule.Expiration)}\n`);
    }
    if (rule.AbortIncompleteMultipartUpload) {
      process.stdout.write(
        `    abort incomplete multipart: ${JSON.stringify(rule.AbortIncompleteMultipartUpload)}\n`
      );
    }
    if (rule.NoncurrentVersionExpiration) {
      process.stdout.write(
        `    noncurrent version expiration: ${JSON.stringify(rule.NoncurrentVersionExpiration)}\n`
      );
    }
  }
}

async function main(): Promise<void> {
  const { apply, showOnly } = parseArgs(process.argv.slice(2));

  if (!BUCKET_NAME) {
    fail('AWS_S3_BUCKET_NAME (or S3_BUCKET) is not set.');
  }

  if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
    fail('AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be set.');
  }

  const client = new S3Client({ region: AWS_REGION });

  log('→', 'blue', `Bucket: ${BUCKET_NAME} (region: ${AWS_REGION})`);

  const existing = await fetchExistingRules(client, BUCKET_NAME);

  log('→', 'blue', 'Current lifecycle rules on bucket:');
  printRules(existing);

  if (showOnly) return;

  const next = mergeRules(existing);

  log('→', 'blue', 'Rules that will be in effect after this run:');
  printRules(next);

  if (!apply) {
    log('ℹ', 'yellow', 'Dry run — re-run with --apply to make changes.');
    return;
  }

  await client.send(
    new PutBucketLifecycleConfigurationCommand({
      Bucket: BUCKET_NAME,
      LifecycleConfiguration: { Rules: next },
    })
  );

  log('✓', 'green', 'Lifecycle configuration applied.');
}

main().catch((err: unknown) => {
  process.stderr.write(
    `${colors.red}✗${colors.reset} ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`
  );
  process.exit(1);
});
