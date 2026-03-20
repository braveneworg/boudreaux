/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * One-time migration: replace the standard unique index on User.stripeCustomerId
 * with a sparse unique index that ignores null values.
 *
 * MongoDB's standard unique index treats null as a real value, which prevents
 * multiple unsubscribed users from coexisting. A sparse unique index only indexes
 * documents where the field is present and non-null, so duplicates of null are allowed.
 *
 * Run once per environment before or after `prisma db push`:
 *   npx tsx prisma/scripts/fix-stripe-customer-id-index.ts
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const INDEX_NAME = 'User_stripeCustomerId_key';
const COLLECTION = 'User';

async function main(): Promise<void> {
  console.log(`Dropping existing index "${INDEX_NAME}" on ${COLLECTION} if present...`);

  try {
    await prisma.$runCommandRaw({
      dropIndexes: COLLECTION,
      index: INDEX_NAME,
    });
    console.log(`  Dropped index "${INDEX_NAME}".`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('index not found') || message.includes('IndexNotFound')) {
      console.log(`  Index "${INDEX_NAME}" did not exist — nothing to drop.`);
    } else {
      throw err;
    }
  }

  console.log(`Creating sparse unique index "${INDEX_NAME}" on ${COLLECTION}.stripeCustomerId...`);

  await prisma.$runCommandRaw({
    createIndexes: COLLECTION,
    indexes: [
      {
        key: { stripeCustomerId: 1 },
        name: INDEX_NAME,
        unique: true,
        sparse: true,
      },
    ],
  });

  console.log(`  Done. Sparse unique index "${INDEX_NAME}" created successfully.`);
}

main()
  .catch((err: unknown) => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
