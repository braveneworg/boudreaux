/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Prisma } from '@prisma/client';

import type { PrismaClient } from '@prisma/client';

interface ListCollectionsResult {
  cursor: { firstBatch: Array<{ name: string }> };
}

const isListCollectionsResult = (value: unknown): value is ListCollectionsResult => {
  const cursor = (value as { cursor?: { firstBatch?: unknown } } | null)?.cursor;
  return Array.isArray(cursor?.firstBatch);
};

/** The collection name of every model in the Prisma schema. */
export const modelCollectionNames = (): string[] =>
  Prisma.dmmf.datamodel.models.map(({ name, dbName }) => dbName ?? name);

/** The names of the collections the database holds. */
export const listCollectionNames = async (prisma: PrismaClient): Promise<string[]> => {
  const result: unknown = await prisma.$runCommandRaw({ listCollections: 1, nameOnly: true });
  if (!isListCollectionsResult(result)) {
    throw new Error('listCollections returned an unexpected shape');
  }
  return result.cursor.firstBatch.map(({ name }) => name);
};

/**
 * Create every model's collection that the database lacks.
 *
 * The E2E database starts empty and nothing pushes the schema to it, so a
 * collection the seed never writes is created by its first insert, mid-suite.
 * Mongo aborts a transaction whose insert creates a collection while another
 * write creates it too ("Transaction with { txnNumber: N } has been
 * aborted"), failing whichever spec's transaction loses. Production never
 * meets this: its schema push creates every collection.
 */
export const ensureModelCollections = async (prisma: PrismaClient): Promise<void> => {
  const existing = new Set(await listCollectionNames(prisma));
  for (const name of modelCollectionNames()) {
    if (!existing.has(name)) {
      await prisma.$runCommandRaw({ create: name });
    }
  }
};
