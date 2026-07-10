/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../../fixtures/auth.fixture';

/**
 * E2E coverage for the admin Announcements SMS-blast flow against real Mongo +
 * a real Next.js server. Seeded users cover every recipient branch:
 *
 * - `sms-optin-1` / `sms-optin-2`: opted in AND with a phone → recipients.
 * - `sms-optout`: opted OUT (phone present) → excluded by `allowSmsNotifications`.
 * - `sms-optin-nophone`: opted in but phone field ABSENT → excluded by the
 *   Mongo `isSet` clause in `UserRepository.countSmsOptedIn`.
 *
 * This is the only real-database proof of that `isSet` recipient filter — the
 * unit tests only assert the Prisma where-shape. The recipient count therefore
 * proves opt-out + phoneless exclusion in one shot: it stays at exactly 2 (the
 * two dedicated opt-in users), never 3 or 4. No shared user is ever persisted
 * opted-in with a phone (the profile specs toggle the switch without saving and
 * save a phone with opt-in left false), so the count is deterministic under
 * parallel shards.
 *
 * `SMS_PROVIDER` is unset in the E2E web server env, so the NoOp SMS provider is
 * used — every send returns `{ ok: true }` and no real texts are dispatched.
 */

const RECIPIENT_LINE = /Will send to (\d+) subscribers/;
const EXPECTED_RECIPIENTS = 2;

test.describe('Admin announcements SMS blast', () => {
  test('sends a blast to opted-in subscribers and records it in history', async ({ adminPage }) => {
    await adminPage.goto('/admin/announcements');

    await expect(
      adminPage.getByRole('heading', { name: 'Announcements', exact: true })
    ).toBeVisible({ timeout: 15_000 });

    // Read the SSR recipient preview and extract N. Exactly the two dedicated
    // opt-in-with-phone users are counted; the opted-out and phoneless users
    // (and the never-opted-in shared regular user) are excluded.
    const recipientLine = adminPage.getByText(RECIPIENT_LINE);
    await expect(recipientLine).toBeVisible();
    const recipientText = (await recipientLine.textContent()) ?? '';
    const recipientMatch = recipientText.match(RECIPIENT_LINE);
    expect(recipientMatch).not.toBeNull();
    const recipientCount = Number(recipientMatch?.[1] ?? '0');
    expect(recipientCount).toBe(EXPECTED_RECIPIENTS);

    // Compose a message unique to this run so the history assertion targets this
    // run's row and never collides with another shard's blast.
    const uniqueMessage = `E2E announcement ${Date.now()}`;
    const messageBox = adminPage.getByRole('textbox', { name: 'Message' });
    await expect(messageBox).toHaveCount(1, { timeout: 15_000 });
    await messageBox.fill(uniqueMessage);

    await adminPage.getByRole('button', { name: 'Send announcement', exact: true }).click();

    // Confirmation dialog echoes the same recipient count.
    const confirmDialog = adminPage.getByRole('alertdialog');
    await expect(confirmDialog).toBeVisible();
    await expect(
      confirmDialog.getByText(`Send this message to ${recipientCount} subscribers?`)
    ).toBeVisible();

    await confirmDialog.getByRole('button', { name: 'Send now' }).click();

    // NoOp provider succeeds for every recipient, so all N send and none fail;
    // the toast carries no ` — failed` suffix. A generous timeout covers the
    // inline send (N ≤ 10 completes without the inter-chunk delay).
    await expect(
      adminPage.getByText(`Sent to ${recipientCount} of ${recipientCount} subscribers`)
    ).toBeVisible({ timeout: 20_000 });

    // History records this run's blast with the sent count.
    await expect(adminPage.getByRole('heading', { name: 'History', exact: true })).toBeVisible();
    const historyRow = adminPage.getByRole('listitem').filter({ hasText: uniqueMessage });
    await expect(historyRow).toHaveCount(1, { timeout: 15_000 });
    await expect(historyRow.getByText(`${recipientCount} sent`)).toBeVisible();
  });
});
