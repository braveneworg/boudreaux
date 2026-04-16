/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { PrismaClient } from '@prisma/client';

/** Reuse across warm Lambda invocations. */
let prismaClient: PrismaClient | null = null;

/**
 * Returns the Prisma client, creating it lazily on first call.
 * Requires `initSecrets()` to have been called beforehand so that
 * `process.env.DATABASE_URL` is set.
 */
export function getPrisma(): PrismaClient {
  if (!prismaClient) {
    prismaClient = new PrismaClient();
  }
  return prismaClient;
}
