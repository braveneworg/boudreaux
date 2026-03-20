#!/usr/bin/env node

/**
 * Fix stripeCustomerId Unique Index
 *
 * Drops the legacy non-partial unique index on User.stripeCustomerId so that
 * `prisma db push` can recreate it as a partial unique index.
 *
 * Background:
 *   MongoDB standard unique indexes do not allow multiple documents to have
 *   null for the indexed field. Prisma 5+ creates a partial-filter-expression
 *   unique index instead (filtering on { stripeCustomerId: { $type: "string" } }),
 *   which allows multiple nulls while still enforcing uniqueness for real values.
 *   If the collection was indexed before Prisma 5, the old non-partial index must
 *   be dropped first.
 *
 * Usage:
 *   npx tsx scripts/fix-stripe-customer-id-index.ts
 *   npx prisma db push
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Dropping legacy User_stripeCustomerId_key index...');

  try {
    await prisma.$runCommandRaw({
      dropIndexes: 'User',
      index: 'User_stripeCustomerId_key',
    });
    console.log(
      '✓ Index dropped. Run `npx prisma db push` to recreate it as a partial unique index.'
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('index not found') || message.includes('27')) {
      console.log('Index does not exist — nothing to drop.');
    } else {
      throw err;
    }
  }
}

main()
  .catch((err) => {
    console.error('Failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
