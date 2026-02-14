import path from 'node:path';

import { test as base } from '@playwright/test';

import type { Page } from '@playwright/test';

/* eslint-disable react-hooks/rules-of-hooks */

const USER_STORAGE_STATE = path.join(__dirname, '../.auth/user.json');
const ADMIN_STORAGE_STATE = path.join(__dirname, '../.auth/admin.json');

interface AuthFixtures {
  userPage: Page;
  adminPage: Page;
}

/**
 * Extended Playwright test with pre-authenticated page fixtures.
 *
 * - `userPage`: A Page pre-loaded with a regular user session cookie.
 * - `adminPage`: A Page pre-loaded with an admin user session cookie.
 */
const test = base.extend<AuthFixtures>({
  userPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: USER_STORAGE_STATE,
    });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },

  adminPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      storageState: ADMIN_STORAGE_STATE,
    });
    const page = await context.newPage();
    await use(page);
    await context.close();
  },
});

export { test };
export { expect } from '@playwright/test';
