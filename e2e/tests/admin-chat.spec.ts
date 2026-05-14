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
    await expect(adminPage.getByTestId('chat-users-table')).toBeVisible({ timeout: 10_000 });

    // The seed user that just sent a message should be listed.
    const switches = adminPage.getByRole('switch');
    await expect(switches.first()).toBeVisible();

    // Flip the first switch on; expect a success toast.
    await switches.first().click();
    await expect(adminPage.getByText(/chat access disabled/i)).toBeVisible({ timeout: 10_000 });
  });

  test('disabled user receives a disabled toast on their next send', async ({ userPage }) => {
    await userPage.goto('/');
    await userPage.getByRole('button', { name: /open chat/i }).click();

    const composer = userPage.getByLabel('Chat message');
    await composer.fill('attempt after disable');
    await composer.press('Enter');

    await expect(userPage.getByText(/chat access has been disabled for your account/i)).toBeVisible(
      { timeout: 10_000 }
    );
  });

  test('admin can re-enable the user', async ({ adminPage }) => {
    await adminPage.goto('/admin/chat');
    await expect(adminPage.getByTestId('chat-users-table')).toBeVisible({ timeout: 10_000 });

    const switches = adminPage.getByRole('switch');
    await switches.first().click();
    await expect(adminPage.getByText(/chat access restored/i)).toBeVisible({ timeout: 10_000 });
  });
});
