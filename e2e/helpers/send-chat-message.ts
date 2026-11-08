/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect } from '@playwright/test';

import type { Page } from '@playwright/test';

const SEND_TIMEOUT_MS = 10_000;

/**
 * Send a chat message from the open drawer and wait until the server has
 * stored it.
 *
 * The drawer shows the message the moment Enter is pressed (an optimistic
 * row, `data-pending="true"`), before the send action answers. A test that
 * stops there ends with the request in flight, the fixture closes the page,
 * and whether the message is stored depends on how fast the server is. So
 * this waits for the composer to re-enable (the send settled) and for the
 * row to be the stored copy: neither pending nor failed.
 */
const sendChatMessage = async (page: Page, body: string): Promise<void> => {
  const composer = page.getByLabel('Chat message');
  await composer.fill(body);
  // The keydown handler reads the committed value; wait for it so the
  // Enter is not handled against a stale, empty composer.
  await expect(composer).toHaveValue(body);
  await composer.press('Enter');

  // The composer clears and disables in the same render that starts the
  // send, so an empty, enabled composer means the send has settled.
  await expect(composer).toHaveValue('', { timeout: SEND_TIMEOUT_MS });
  await expect(composer).toBeEnabled({ timeout: SEND_TIMEOUT_MS });

  const row = page.getByTestId('chat-message-row').filter({ hasText: body });
  await expect(row).toHaveCount(1, { timeout: SEND_TIMEOUT_MS });
  await expect(row).not.toHaveAttribute('data-failed', 'true');
  await expect(row).not.toHaveAttribute('data-pending', 'true');
};

export { sendChatMessage };
