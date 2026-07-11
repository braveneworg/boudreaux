/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { devices } from '@playwright/test';

import { expect, test } from '../fixtures/auth.fixture';

/**
 * Coarse-pointer (touch) scroll-pinning coverage for the chat drawer,
 * under Pixel 7 mobile emulation.
 *
 * On touch devices only real user input (touch drag / wheel) may unpin
 * the message list from the bottom. Browsers fire scroll events of their
 * own — iOS Safari resets scrollTop inside transformed containers when
 * the drawer's open transition ends, and clamps it on visual-viewport
 * changes — and those displacements must snap back to the latest
 * message. Desktop (fine-pointer) semantics are unchanged and covered in
 * chat-drawer.spec.ts.
 */

test.use({ ...devices['Pixel 7'] });

test.describe('Chat drawer — touch-device scroll pinning', () => {
  test('undoes browser scroll resets but respects user scrolling', async ({ userPage }) => {
    await userPage.goto('/');
    await userPage.getByRole('button', { name: /open chat/i }).click();
    const composer = userPage.getByLabel('Chat message');
    await expect(composer).toBeVisible();

    // Ensure the list overflows its viewport so scroll position is meaningful.
    const stamp = Date.now();
    for (let i = 0; i < 8; i++) {
      const body = `touch-pin-${stamp}-${i} — lorem ipsum dolor sit amet`;
      await composer.fill(body);
      await expect(composer).toHaveValue(body);
      await composer.press('Enter');
      await expect(userPage.getByText(body)).toBeVisible({ timeout: 10_000 });
      await expect(composer).toBeEnabled({ timeout: 10_000 });
    }

    const distanceFromBottom = () =>
      userPage.evaluate(() => {
        const el = document.querySelector('[data-testid="chat-message-list"]');
        if (!el) return Number.POSITIVE_INFINITY;
        return el.scrollHeight - el.scrollTop - el.clientHeight;
      });

    await userPage.getByLabel('Close chat').click();
    await expect(userPage.getByRole('img', { name: 'live chat' })).toBeHidden();
    await userPage.getByRole('button', { name: /open chat/i }).click();
    await expect(userPage.getByText(`touch-pin-${stamp}-7`, { exact: false })).toBeVisible({
      timeout: 10_000,
    });
    await expect.poll(distanceFromBottom, { timeout: 5_000 }).toBeLessThan(60);

    // Browser-initiated displacement (no user input) → snapped back.
    await userPage.evaluate(() => {
      const el = document.querySelector('[data-testid="chat-message-list"]');
      if (el) el.scrollTop = 0;
    });
    await expect.poll(distanceFromBottom, { timeout: 5_000 }).toBeLessThan(60);

    // Real user input (wheel) scrolling up must unpin and stay put.
    await userPage.getByTestId('chat-message-list').hover();
    await userPage.mouse.wheel(0, -600);
    // Wait past the momentum window so a wrongly-armed pin would have
    // yanked the viewport back down by now.
    await userPage.waitForTimeout(500);
    expect(await distanceFromBottom()).toBeGreaterThan(100);
  });
});
