/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

import { listCollectionNames, modelCollectionNames } from '../helpers/e2e-collections';

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
