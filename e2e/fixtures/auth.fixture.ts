/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { test as base } from '@playwright/test';

import { createDisposableSignoutState } from '../helpers/seed-test-db';

import type { Page } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const USER_STORAGE_STATE = path.join(__dirname, '../.auth/user.json');
const ADMIN_STORAGE_STATE = path.join(__dirname, '../.auth/admin.json');
const BANNED_STORAGE_STATE = path.join(__dirname, '../.auth/banned.json');

interface AuthFixtures {
  userPage: Page;
  adminPage: Page;
  bannedPage: Page;
  signOutPage: Page;
}

/**
 * Extended Playwright test with pre-authenticated page fixtures. Each carries a
 * real signed better-auth session cookie (`boudreaux.session_token`) backed by
 * a seeded `session` row.
 *
 * - `userPage`: A Page pre-loaded with a regular user session cookie.
 * - `adminPage`: A Page pre-loaded with an admin user session cookie.
 * - `bannedPage`: A Page for the dedicated banned user (chat-disabled +
 *   admin-plugin `banned`). Never reuse the shared users for ban tests.
 */
const test = base.extend<AuthFixtures>({
  userPage: async ({ browser }, provide) => {
    const context = await browser.newContext({
      storageState: USER_STORAGE_STATE,
    });
    const page = await context.newPage();
    await provide(page);
    await context.close();
  },

  adminPage: async ({ browser }, provide) => {
    const context = await browser.newContext({
      storageState: ADMIN_STORAGE_STATE,
    });
    const page = await context.newPage();
    await provide(page);
    await context.close();
  },

  bannedPage: async ({ browser }, provide) => {
    const context = await browser.newContext({
      storageState: BANNED_STORAGE_STATE,
    });
    const page = await context.newPage();
    await provide(page);
    await context.close();
  },

  // A page authenticated as the dedicated sign-out user with a THROWAWAY session
  // minted fresh per test (and per retry). better-auth uses DB sessions, so the
  // destructive sign-out specs delete their session row on "Sign out"; giving
  // each its own disposable session keeps that deletion from revoking the shared
  // regular/admin sessions every other spec depends on — even under parallel
  // CI workers.
  signOutPage: async ({ browser }, provide) => {
    const storageState = await createDisposableSignoutState();
    const context = await browser.newContext({ storageState });
    const page = await context.newPage();
    await provide(page);
    await context.close();
  },
});

export { test };
export { expect } from '@playwright/test';
