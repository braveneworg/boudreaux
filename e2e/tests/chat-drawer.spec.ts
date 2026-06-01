/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { test as baseTest } from '@playwright/test';

import { expect, test } from '../fixtures/auth.fixture';

/**
 * E2E coverage for the live-chat drawer.
 *
 * What this suite *does* exercise:
 *   - The floating chat trigger renders for both anonymous and authenticated
 *     visitors.
 *   - The drawer opens to a "Sign in to chat" gate when there is no session.
 *   - Authenticated users can open the drawer, send a message via the
 *     composer, and see it appear in the list (optimistic + server echo).
 *
 * What this suite intentionally does NOT exercise:
 *   - Cross-browser real-time broadcast over Pusher. The E2E web server runs
 *     with `E2E_MODE=true` and no Pusher credentials, so server-side
 *     `triggerChatEvent` is a no-op and the client uses a stand-in stub.
 *     Multi-client behaviour is covered by the unit tests in
 *     src/app/hooks/use-chat-channel.spec.ts.
 *   - The rate-limit toast. Upstash is short-circuited in `E2E_MODE`, so
 *     11+ rapid sends will not produce a 429.
 */

baseTest.describe('Chat drawer — anonymous', () => {
  baseTest(
    'renders the trigger and shows the sign-in CTA when the drawer is opened',
    async ({ page }) => {
      await page.goto('/');

      const trigger = page.getByRole('button', { name: /open chat/i });
      await expect(trigger).toBeVisible();

      await trigger.click();

      await expect(page.getByText('Sign in to chat')).toBeVisible();
      const signInLink = page.getByRole('link', { name: /sign in/i });
      await expect(signInLink).toHaveAttribute('href', /\/signin\?callbackUrl=/);
    }
  );
});

test.describe('Chat drawer — authenticated', () => {
  test('opens the drawer, shows the empty state, and accepts a sent message', async ({
    userPage,
  }) => {
    await userPage.goto('/');

    await userPage.getByRole('button', { name: /open chat/i }).click();
    await expect(userPage.getByRole('img', { name: 'live chat' })).toBeVisible();

    const composer = userPage.getByLabel('Chat message');
    await expect(composer).toBeVisible();

    const body = `e2e-${Date.now()}`;
    await composer.fill(body);
    await composer.press('Enter');

    // Optimistic append + server echo both surface the body in the list.
    await expect(userPage.getByText(body)).toBeVisible({ timeout: 10_000 });

    // Composer clears after a successful send.
    await expect(composer).toHaveValue('');
  });

  test('preserves a newline on Shift+Enter without sending', async ({ userPage }) => {
    await userPage.goto('/');
    await userPage.getByRole('button', { name: /open chat/i }).click();

    const composer = userPage.getByLabel('Chat message');
    await composer.fill('line 1');
    await composer.press('Shift+Enter');
    await composer.type('line 2');

    await expect(composer).toHaveValue('line 1\nline 2');
  });
});
