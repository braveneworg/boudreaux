/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { PrismaClient } from '@prisma/client';

import { createDataErrorExtension } from '@/lib/repositories/_internal/data-error-extension';
import { createSlowQueryExtension } from '@/lib/utils/slow-query-extension';

// Slow-query logging sits closest to the driver so it times the raw query;
// DataError translation wraps it so every failure leaves the client as a
// `DataError` (ADR-0001) — repositories no longer wrap calls themselves.
const createPrismaClient = () =>
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })
    .$extends(createSlowQueryExtension())
    .$extends(createDataErrorExtension());

type ExtendedPrismaClient = ReturnType<typeof createPrismaClient>;

const globalForPrisma = globalThis as unknown as { prisma: ExtendedPrismaClient };

export const prisma = globalForPrisma.prisma || createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
