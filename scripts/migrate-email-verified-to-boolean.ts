#!/usr/bin/env node

/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One-shot migration: convert `User.emailVerified` from the Auth.js DateTime
 * shape to the better-auth Boolean shape.
 *
 * Auth.js stored `emailVerified` as a DateTime (the verification timestamp);
 * better-auth's schema types it as `Boolean @default(false)`. User documents
 * created before the migration still hold a DateTime, so every Prisma read of
 * such a user throws P2023 ("Failed to convert 'DateTime(...)' to 'Boolean'"),
 * which breaks magic-link sign-in for pre-existing accounts.
 *
 * Conversion (in place, via a MongoDB aggregation update):
 *   - a stored Date → `true`  (the user WAS verified under Auth.js)
 *   - anything else → `false` (null / missing / unexpected)
 *   - existing Booleans are excluded by the filter, so the migration is
 *     idempotent and safe to re-run.
 *
 * It uses a raw MongoDB command (`$runCommandRaw`) deliberately: Prisma itself
 * cannot read the mistyped rows this script exists to fix.
 *
 * Defaults to a dry-run (counts affected docs). Pass `--execute` to write.
 *
 * Usage:
 *   pnpm exec tsx scripts/migrate-email-verified-to-boolean.ts            # dry-run
 *   pnpm exec tsx scripts/migrate-email-verified-to-boolean.ts --execute  # apply
 *
 * Required env: DATABASE_URL (the target database — dev, then production).
 */

import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

dotenv.config({ path: '.env.local' });
dotenv.config();

const USER_COLLECTION = 'User';

/**
 * Matches User documents whose `emailVerified` is NOT already a boolean, so
 * already-migrated rows are never rewritten (keeps the migration idempotent).
 */
const NON_BOOLEAN_FILTER = { emailVerified: { $not: { $type: 'bool' } } };

/**
 * Aggregation pipeline that coerces `emailVerified` to a boolean: a stored
 * Date (Auth.js "verified at" timestamp) becomes `true`; everything else
 * (null / missing / unexpected) becomes `false`.
 */
const CONVERSION_PIPELINE = [
  { $set: { emailVerified: { $eq: [{ $type: '$emailVerified' }, 'date'] } } },
];

/** Count the User docs that still carry a non-boolean `emailVerified`. */
export const countNonBooleanEmailVerified = async (prisma: PrismaClient): Promise<number> => {
  const result = (await prisma.$runCommandRaw({
    count: USER_COLLECTION,
    query: NON_BOOLEAN_FILTER,
  })) as { n?: number };
  return result.n ?? 0;
};

/** Apply the conversion; returns the number of documents modified. */
export const runEmailVerifiedMigration = async (prisma: PrismaClient): Promise<number> => {
  const result = (await prisma.$runCommandRaw({
    update: USER_COLLECTION,
    updates: [{ q: NON_BOOLEAN_FILTER, u: CONVERSION_PIPELINE, multi: true }],
  })) as { nModified?: number };
  return result.nModified ?? 0;
};

/** Orchestrate the dry-run / execute flow, owning the client unless one is injected. */
export const migrateEmailVerified = async (
  argv: string[],
  deps?: { prisma?: PrismaClient }
): Promise<void> => {
  if (!process.env.DATABASE_URL) {
    console.error('[migrate-email-verified] DATABASE_URL env var is required');
    process.exit(1);
  }

  const execute = argv.includes('--execute');
  const injectedPrisma = deps?.prisma;
  const prisma = injectedPrisma ?? new PrismaClient();

  try {
    if (!execute) {
      const affected = await countNonBooleanEmailVerified(prisma);
      console.info(
        `[migrate-email-verified] DRY RUN — ${affected} user(s) have a non-boolean emailVerified. ` +
          'Re-run with --execute to convert them.'
      );
      return;
    }

    const modified = await runEmailVerifiedMigration(prisma);
    console.info(`[migrate-email-verified] Converted emailVerified on ${modified} user(s).`);
  } finally {
    if (!injectedPrisma) {
      await prisma.$disconnect();
    }
  }
};

/* istanbul ignore next -- top-level CLI entry */
if (
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  process.argv[1]?.endsWith('migrate-email-verified-to-boolean.ts')
) {
  migrateEmailVerified(process.argv.slice(2)).catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
