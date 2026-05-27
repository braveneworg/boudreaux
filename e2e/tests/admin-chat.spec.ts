/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../fixtures/auth.fixture';

/**
 * E2E coverage for the /admin/chat moderation panel.
 *
 * Tests run in serial because they build cumulative state in the test
 * database: the user must first send a message (creating a ChatUser row)
 * before the admin panel has anything to render or disable.
 *
 * Pusher broadcast and Upstash rate-limiting are short-circuited in
 * `E2E_MODE`; see chat-drawer.spec.ts for the rationale.
 */

test.describe.configure({ mode: 'serial' });

test.describe('Admin chat moderation', () => {
  test('a user must first send a message so the admin panel has a row to manage', async ({
    userPage,
  }) => {
    await userPage.goto('/');
    await userPage.getByRole('button', { name: /open chat/i }).click();

    const composer = userPage.getByLabel('Chat message');
    await composer.fill('seed message for admin test');
    await composer.press('Enter');

    await expect(userPage.getByText('seed message for admin test')).toBeVisible({
      timeout: 10_000,
    });
  });

  test('admin sees the chat user and can disable their account', async ({ adminPage }) => {
    await adminPage.goto('/admin/chat');

    await expect(adminPage.getByRole('heading', { name: /chat moderation/i })).toBeVisible();

    // The moderation page defaults to the "Reported users" view; switch to
    // "All users" so the chat-users table is rendered.
    await adminPage.getByRole('combobox', { name: /view/i }).click();
    await adminPage.getByRole('option', { name: /all users/i }).click();

    await expect(adminPage.getByTestId('chat-users-table')).toBeVisible({ timeout: 10_000 });

    // The seed user that just sent a message should be listed.
    const switches = adminPage.getByRole('switch');
    await expect(switches.first()).toBeVisible();

    // Flip the first switch on; expect a success toast.
    await switches.first().click();
    await expect(adminPage.getByText(/chat access disabled/i)).toBeVisible({ timeout: 10_000 });
  });

  test('disabled user sees the disabled state instead of the composer', async ({ userPage }) => {
    await userPage.goto('/');
    await userPage.getByRole('button', { name: /open chat/i }).click();

    // When chat access is disabled, the composer is removed entirely and
    // replaced with the disabled-state message (see ChatDisabledState).
    await expect(userPage.getByText(/reported for abuse/i)).toBeVisible({ timeout: 10_000 });
    await expect(userPage.getByLabel('Chat message')).not.toBeVisible();
  });

  test('admin can re-enable the user', async ({ adminPage }) => {
    await adminPage.goto('/admin/chat');

    await adminPage.getByRole('combobox', { name: /view/i }).click();
    await adminPage.getByRole('option', { name: /all users/i }).click();

    await expect(adminPage.getByTestId('chat-users-table')).toBeVisible({ timeout: 10_000 });

    const switches = adminPage.getByRole('switch');
    await switches.first().click();
    await expect(adminPage.getByText(/chat access restored/i)).toBeVisible({ timeout: 10_000 });
  });
});
