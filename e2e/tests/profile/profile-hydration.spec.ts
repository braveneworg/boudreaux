/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { test, expect } from '../../fixtures/base.fixture';

import type { Page } from '@playwright/test';

/** Long enough for the session fetch to land before the page chunk does. */
const SLOW_CHUNK_MS = 1500;

/**
 * Copy that only `ProfileForm` renders. Chunk names are hashed on the dev
 * server, so the spec finds the chunk that carries the form by its content.
 */
const PROFILE_FORM_MARKER = 'Email me updates';

/**
 * React reports a hydration mismatch as a recoverable error: the dev build
 * logs it to the console in words, and the production build throws the
 * minified #418 / #423 / #425 through `reportError`, which reaches the page as
 * a `pageerror`. Either form names the failure, so match both.
 */
const HYDRATION_ERROR = /hydrat|did not match|Minified React error #(418|423|425)/i;

/** Collects every console error/warning and uncaught page error from load on. */
const collectPageProblems = (page: Page): string[] => {
  const problems: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      problems.push(`console.${message.type()}: ${message.text()}`);
    }
  });
  page.on('pageerror', (error) => problems.push(`pageerror: ${error.message}`));
  return problems;
};

test.describe('Auth pages hydrate without a mismatch', () => {
  test('a signed-in /profile hydrates cleanly', async ({ userPage }) => {
    const problems = collectPageProblems(userPage);

    await userPage.goto('/profile');
    // The form renders only on the client, after the session resolves, so
    // its heading being visible proves hydration has run.
    await expect(userPage.getByText('Personal Information')).toBeVisible();
    await expect(userPage.getByRole('heading', { name: 'Social accounts' })).toBeVisible();

    expect(problems.filter((problem) => HYDRATION_ERROR.test(problem))).toEqual([]);
  });

  // The header starts the session fetch as soon as it hydrates. The profile
  // segment hydrates under its own Suspense boundary once its page chunk has
  // loaded, so on a slow connection the session is already resolved by then.
  // Holding the chunk that carries the form reproduces that on both servers.
  test('a signed-in /profile hydrates cleanly when its page chunk is slow', async ({
    userPage,
  }) => {
    const problems = collectPageProblems(userPage);
    const heldChunks: string[] = [];
    await userPage.route('**/_next/static/chunks/**', async (route) => {
      if (route.request().resourceType() !== 'script') {
        await route.fallback();
        return;
      }
      const response = await route.fetch();
      const body = await response.text();
      if (body.includes(PROFILE_FORM_MARKER)) {
        heldChunks.push(route.request().url());
        await new Promise((resolve) => setTimeout(resolve, SLOW_CHUNK_MS));
      }
      await route.fulfill({ response, body });
    });

    await userPage.goto('/profile');
    await expect(userPage.getByText('Personal Information')).toBeVisible();

    expect(heldChunks.length).toBeGreaterThan(0);
    expect(problems.filter((problem) => HYDRATION_ERROR.test(problem))).toEqual([]);
  });

  for (const path of ['/signin', '/signup']) {
    test(`a signed-out ${path} hydrates cleanly`, async ({ page }) => {
      const problems = collectPageProblems(page);

      await page.goto(path);
      await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
      await page.waitForLoadState('networkidle');

      expect(problems.filter((problem) => HYDRATION_ERROR.test(problem))).toEqual([]);
    });
  }
});
