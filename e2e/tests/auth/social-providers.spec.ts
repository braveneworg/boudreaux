/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { test, expect } from '@playwright/test';

import { mockTurnstile } from '../../helpers/turnstile-mock';

// Coverage for the redesigned social sign-in initiation. A full external OAuth
// round-trip cannot run in E2E (and no provider credentials are configured for
// the E2E server), so we assert the CLIENT INITIATES the better-auth social
// sign-in — i.e. clicking a provider button POSTs to the better-auth
// `/api/auth/sign-in/social` endpoint with that provider — rather than
// completing an external authorize redirect.
const SOCIAL_SIGN_IN_ENDPOINT = '**/api/auth/sign-in/social';

// The server-side half of the Turnstile gate: a browser that skips the widget
// and POSTs straight to better-auth is refused. The UI path (clicking a
// provider button after the widget verifies) is covered below — it succeeds
// only because the confirm action issued the gate cookie first.
test.describe('Turnstile gate on the sign-in API', () => {
  test('rejects a direct social sign-in POST that skipped the challenge', async ({
    request,
    baseURL,
  }) => {
    const response = await request.post('/api/auth/sign-in/social', {
      data: { provider: 'google', callbackURL: '/' },
      headers: { origin: baseURL ?? '' },
    });

    expect(response.status()).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'TURNSTILE_REQUIRED' });
  });

  test('rejects a direct magic-link POST that skipped the challenge', async ({
    request,
    baseURL,
  }) => {
    const response = await request.post('/api/auth/sign-in/magic-link', {
      data: { email: 'gate-probe@example.com', callbackURL: '/' },
      headers: { origin: baseURL ?? '' },
    });

    expect(response.status()).toBe(403);
    expect(await response.json()).toMatchObject({ code: 'TURNSTILE_REQUIRED' });
  });
});

test.describe('Social provider sign-in initiation', () => {
  test.beforeEach(async ({ page }) => {
    await mockTurnstile(page);
  });

  test('clicking Google posts to the better-auth social sign-in endpoint', async ({ page }) => {
    await page.goto('/signin');

    const button = page.getByRole('button', { name: 'Continue with Google' });
    await expect(button).toBeVisible();

    const [request] = await Promise.all([
      page.waitForRequest(
        (req) => req.url().includes('/api/auth/sign-in/social') && req.method() === 'POST'
      ),
      button.click(),
    ]);

    expect(request.postData() ?? '').toContain('google');
  });

  test('clicking Facebook initiates the social sign-in request', async ({ page }) => {
    await page.goto('/signin');

    const button = page.getByRole('button', { name: 'Continue with Facebook' });
    await expect(button).toBeVisible();

    const [request] = await Promise.all([
      page.waitForRequest(
        (req) => req.url().includes('/api/auth/sign-in/social') && req.method() === 'POST'
      ),
      button.click(),
    ]);

    expect(request.postData() ?? '').toContain('facebook');
  });

  test('a stubbed provider authorize URL is followed when present', async ({ page }) => {
    // Deterministically simulate a configured provider: intercept the social
    // sign-in call and return better-auth's redirect-branch shape
    // ({ url, redirect: true }). The client then navigates to that URL — here a
    // local stub page — proving the initiation→redirect wiring without a real
    // external IdP.
    await page.route(SOCIAL_SIGN_IN_ENDPOINT, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ url: '/signin?oauth=stubbed', redirect: true }),
      });
    });

    await page.goto('/signin');
    await page.getByRole('button', { name: 'Continue with Apple' }).click();

    await expect(page).toHaveURL(/oauth=stubbed/, { timeout: 15_000 });
  });
});
