/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

// Setup for the `db-contract` vitest project (`pnpm run test:db`).
//
// Contract specs run the real Prisma client against a real MongoDB, so this
// file deliberately does NOT install the global `@/lib/prisma` mock from
// `setupTests.ts`. In its place is the one guard that keeps hard constraint 1
// (root AGENTS.md) intact: the client may only ever reach the local Docker
// Mongo on localhost:27018. Worktrees carry copies of the real `.env*` files,
// so a missing or foreign `DATABASE_URL` means the run would hit live data —
// refuse before any spec module loads.

const CONTRACT_DB_URL_PREFIX = 'mongodb://localhost:27018/';

const url = process.env.DATABASE_URL ?? '';

if (!url.startsWith(CONTRACT_DB_URL_PREFIX)) {
  throw new Error(
    `db-contract specs refuse to run: DATABASE_URL must start with ${CONTRACT_DB_URL_PREFIX} ` +
      '(the Docker Mongo from `pnpm run e2e:docker:up`). Run them with `pnpm run test:db`, ' +
      'which scopes the URL to the command.'
  );
}

// `src/lib/prisma.ts` imports `server-only`, which throws outside a Next.js
// server context. Neutralise it the way every unit spec does.
vi.mock('server-only', () => ({}));

// Vitest merges a project's `setupFiles` with the root's instead of replacing
// them, so `setupTests.ts` has already registered its inert `@/lib/prisma`
// Proxy by the time this file runs. Contract specs need the real client.
vi.doUnmock('@/lib/prisma');
