import fs from 'node:fs';
import path from 'node:path';

import { createStorageState } from './helpers/auth-helpers';
import { seedTestDatabase, TEST_USERS } from './helpers/seed-test-db';

const AUTH_DIR = path.join(__dirname, '.auth');

/**
 * The AUTH_SECRET must match the value in playwright.config.ts webServer.env.
 *
 * IMPORTANT: Do NOT read from process.env.AUTH_SECRET here.  Importing
 * PrismaClient (via seed-test-db) causes Prisma to load .env / .env.local
 * which may contain a different AUTH_SECRET.  Hardcoding guarantees the
 * cookies generated here always match the secret the web server receives
 * from webServer.env in playwright.config.ts.
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
