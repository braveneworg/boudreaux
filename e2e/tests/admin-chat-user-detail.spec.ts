/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../fixtures/auth.fixture';
import { sendChatMessage } from '../helpers/send-chat-message';

/**
 * E2E coverage for the /admin/chat/users/[userId] detail view. Tests run serial
 * because the user must first send a message so the detail view has a message
 * with a per-message hide control to render. That control is a toggle switch on
 * every viewport (the desktop checkbox was removed).
 *
 * The first test waits for the message to be stored, not just shown: the
 * drawer shows it optimistically, and a test that ends there closes the page
 * with the send still in flight, so the detail view sometimes had nothing.
 */

// Deterministic seeded regular-user id (see e2e/helpers/seed-test-db.ts).
const REGULAR_USER_ID = '65a1b2c3d4e5f6a7b8c9d0e1';

test.describe.configure({ mode: 'serial' });

test.describe('Admin chat user detail', () => {
  test('a user sends a message so the detail view has content', async ({ userPage }) => {
    await userPage.goto('/');
    await userPage.getByRole('button', { name: /open chat/i }).click();

    await sendChatMessage(userPage, 'detail view seed message');
  });

  test('renders the user detail view with a chat-access toggle', async ({ adminPage }) => {
    await adminPage.goto(`/admin/chat/users/${REGULAR_USER_ID}`);

    await expect(adminPage.getByText('Chat access')).toBeVisible({ timeout: 15_000 });
    await expect(adminPage.getByRole('switch', { name: /chat for this user/i })).toBeVisible();
  });

  test('per-message hide control is a toggle switch', async ({ adminPage }) => {
    await adminPage.goto(`/admin/chat/users/${REGULAR_USER_ID}`);

    await expect(adminPage.getByText('detail view seed message')).toBeVisible({ timeout: 15_000 });
    await expect(adminPage.getByRole('switch', { name: /hide message/i }).first()).toBeVisible();
    // The checkbox variant was removed in favour of the switch everywhere.
    await expect(adminPage.getByRole('checkbox', { name: /hide message/i })).toHaveCount(0);
  });
});
