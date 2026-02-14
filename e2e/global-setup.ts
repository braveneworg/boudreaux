import fs from 'node:fs';
import path from 'node:path';

import { createStorageState } from './helpers/auth-helpers';
import { seedTestDatabase, TEST_USERS } from './helpers/seed-test-db';

const AUTH_DIR = path.join(__dirname, '.auth');

/**
 * The AUTH_SECRET must match the value in playwright.config.ts webServer.env.
 * Playwright passes this as a process env var to the Next.js dev server,
 * and process env takes precedence over .env.local / .env files.
 */
const AUTH_SECRET = 'e2e-test-secret-key-that-is-at-least-32-characters-long';

export default async function globalSetup() {
  // Ensure .auth directory exists
  fs.mkdirSync(AUTH_DIR, { recursive: true });

  // Seed the test database with deterministic data
  await seedTestDatabase();

  // Generate storageState files for pre-authenticated test contexts
  const userState = await createStorageState(TEST_USERS.regular, AUTH_SECRET);
  fs.writeFileSync(path.join(AUTH_DIR, 'user.json'), JSON.stringify(userState, null, 2));

  const adminState = await createStorageState(TEST_USERS.admin, AUTH_SECRET);
  fs.writeFileSync(path.join(AUTH_DIR, 'admin.json'), JSON.stringify(adminState, null, 2));

  console.info('Global setup complete: database seeded, auth state generated.');
}
