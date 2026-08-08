/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { defineConfig } from 'prisma/config';

// With a Prisma config file present, the Prisma CLI no longer auto-loads
// .env — restore that for local CLI runs (db push, studio, validate).
// Already-set variables always win, so an explicitly scoped DATABASE_URL
// (e.g. the E2E harness's isolated URL) is never overridden.
try {
  process.loadEnvFile();
} catch {
  // No .env file — the environment provides the variables (CI, Docker).
}

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    seed: 'pnpm exec tsx prisma/seed.ts',
  },
});
