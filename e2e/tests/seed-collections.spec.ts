/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { PrismaClient } from '@prisma/client';

import { expect, test } from '../fixtures/base.fixture';
import {
  listCollectionNames,
  listUniqueIndexNames,
  modelCollectionNames,
  VIEW_KEY_INDEX,
} from '../helpers/e2e-collections';

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

// A collection first created mid-suite aborts any transaction racing the
// write that creates it; see ensureModelCollections.
test('the seed creates every model collection', async () => {
  const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });
  try {
    const existing = new Set(await listCollectionNames(prisma));
    expect(modelCollectionNames().filter((name) => !existing.has(name))).toEqual([]);
  } finally {
    await prisma.$disconnect();
  }
});

// Nothing pushes the schema here, so no unique index exists unless the seed
// makes it. The once-a-day rule of a view is its key's unique index
// (ADR-0029); see ensureViewKeyIndex.
test('the seed gives a view key its unique index', async () => {
  const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });
  try {
    expect(await listUniqueIndexNames(prisma, VIEW_KEY_INDEX.collection)).toContain(
      VIEW_KEY_INDEX.name
    );
  } finally {
    await prisma.$disconnect();
  }
});
