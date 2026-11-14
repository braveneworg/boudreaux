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

interface ListIndexesResult {
  cursor: { firstBatch: Array<{ name: string; unique?: boolean }> };
}

const isListIndexesResult = (value: unknown): value is ListIndexesResult => {
  const cursor = (value as { cursor?: { firstBatch?: unknown } } | null)?.cursor;
  return Array.isArray(cursor?.firstBatch);
};

/** The names of the unique indexes a collection holds. */
export const listUniqueIndexNames = async (
  prisma: PrismaClient,
  collection: string
): Promise<string[]> => {
  const result: unknown = await prisma.$runCommandRaw({ listIndexes: collection });
  if (!isListIndexesResult(result)) {
    throw new Error('listIndexes returned an unexpected shape');
  }
  return result.cursor.firstBatch.filter(({ unique }) => unique === true).map(({ name }) => name);
};

/** The unique index on a view event's key, named as a schema push names it. */
export const VIEW_KEY_INDEX = {
  collection: 'SubmissionViewEvent',
  name: 'SubmissionViewEvent_viewKey_key',
} as const;

/**
 * Give a view event's key its unique index (ADR-0029).
 *
 * Nothing pushes the schema to the E2E database, so it holds none of the
 * schema's unique indexes. Most features do not lean on one. A view does:
 * the index is what makes a viewer's second opening on one day not count,
 * and without it the development server's double mount stores two views for
 * one opening. Any views a crashed run left are cleared first, since a
 * duplicate among them would refuse the index.
 */
export const ensureViewKeyIndex = async (prisma: PrismaClient): Promise<void> => {
  await prisma.submissionViewEvent.deleteMany();
  await prisma.$runCommandRaw({
    createIndexes: VIEW_KEY_INDEX.collection,
    indexes: [{ key: { viewKey: 1 }, name: VIEW_KEY_INDEX.name, unique: true }],
  });
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
