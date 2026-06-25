/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { E2E_AUTH_SECRET } from './helpers/auth-constants';
import { createStorageState } from './helpers/auth-helpers';
import { seedTestDatabase, TEST_USERS } from './helpers/seed-test-db';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const AUTH_DIR = path.join(__dirname, '.auth');

/**
 * The HMAC key better-auth uses to sign the session cookie — shared with
 * `playwright.config.ts` webServer.env via {@link E2E_AUTH_SECRET} so the
 * cookies minted here always verify against the running server.
 */
const AUTH_SECRET = E2E_AUTH_SECRET;

export default async function globalSetup() {
  // Ensure .auth directory exists
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  // Seed the test database with deterministic data (also inserts the
  // better-auth `session` rows whose tokens we sign into cookies below).
  await seedTestDatabase();

  // Generate storageState files for pre-authenticated test contexts. Each
  // carries the signed better-auth `boudreaux.session_token` cookie for the
  // matching seeded session row.
  const userState = await createStorageState(TEST_USERS.regular.sessionToken, AUTH_SECRET);
  fs.writeFileSync(path.join(AUTH_DIR, 'user.json'), JSON.stringify(userState, null, 2));

  const adminState = await createStorageState(TEST_USERS.admin.sessionToken, AUTH_SECRET);
  fs.writeFileSync(path.join(AUTH_DIR, 'admin.json'), JSON.stringify(adminState, null, 2));

  const bannedState = await createStorageState(TEST_USERS.banned.sessionToken, AUTH_SECRET);
  fs.writeFileSync(path.join(AUTH_DIR, 'banned.json'), JSON.stringify(bannedState, null, 2));

  console.info('Global setup complete: database seeded, auth state generated.');
}
