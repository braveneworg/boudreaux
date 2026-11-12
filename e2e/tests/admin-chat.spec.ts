/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { expect, test } from '../fixtures/auth.fixture';
import { sendChatMessage } from '../helpers/send-chat-message';
import { createStampedUser, newStampedUserContext } from '../helpers/stamped-user';

import type { StampedUser } from '../helpers/stamped-user';
import type { Browser, Page } from '@playwright/test';

/**
 * E2E coverage for the /admin/chat moderation panel.
 *
 * Tests run in serial because they build cumulative state in the test
 * database: the user must first send a message (creating a ChatUser row)
 * before the admin panel has anything to render or disable.
 *
 * The moderated user is created for this run alone. Disabling chat is one
 * value per user that every worker reads: when this spec disabled the shared
 * seeded `testuser`, the chat-drawer and chat-user-detail specs in other
 * workers found "You have been reported for abuse" where their composer
 * should be (see docs/lessons/e2e-playwright/specs-sharing-a-global-flag-share-a-file.md).
 *
 * Pusher broadcast and Upstash rate-limiting are short-circuited in
 * `E2E_MODE`; see chat-drawer.spec.ts for the rationale.
 */

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

const HANDLE = `e2emod${randomUUID().slice(0, 8)}`;
const SEED_MESSAGE = `seed message for admin test ${HANDLE}`;

let moderated: StampedUser | undefined;

const openModeratedUserPage = async (browser: Browser): Promise<Page> => {
  if (!moderated) {
    throw new Error('The moderated user was not created');
  }
  const context = await newStampedUserContext(browser, moderated);
  return context.newPage();
};

const openAllUsersView = async (adminPage: Page): Promise<void> => {
  await adminPage.goto('/admin/chat');
  await expect(adminPage.getByRole('heading', { name: /chat moderation/i })).toBeVisible();

  // The moderation page defaults to the "Reported users" view; switch to
  // "All users" so the chat-users table is rendered.
  await adminPage.getByRole('combobox', { name: /view/i }).click();
  await adminPage.getByRole('option', { name: /all users/i }).click();
  await expect(adminPage.getByTestId('chat-users-table')).toBeVisible({ timeout: 10_000 });
};

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
  moderated = await createStampedUser(prisma, { handle: HANDLE, name: `E2E Moderated ${HANDLE}` });
});

test.afterAll(async () => {
  if (moderated) {
    const where = { userId: moderated.id };
    await prisma.chatMessage.deleteMany({ where });
    await prisma.chatUser.deleteMany({ where });
    await prisma.session.deleteMany({ where });
    await prisma.user.deleteMany({ where: { id: moderated.id } });
  }
  await prisma.$disconnect();
});

test.describe('Admin chat moderation', () => {
  test('a user must first send a message so the admin panel has a row to manage', async ({
    browser,
  }) => {
    const page = await openModeratedUserPage(browser);
    try {
      await page.goto('/');
      await page.getByRole('button', { name: /open chat/i }).click();

      await sendChatMessage(page, SEED_MESSAGE);
    } finally {
      await page.context().close();
    }
  });

  test('admin sees the chat user and can disable their account', async ({ adminPage }) => {
    await openAllUsersView(adminPage);

    await adminPage.getByRole('switch', { name: `Disable chat for ${HANDLE}` }).click();
    await expect(adminPage.getByText(/chat access disabled/i)).toBeVisible({ timeout: 10_000 });
  });

  test('disabled user sees the disabled state instead of the composer', async ({ browser }) => {
    const page = await openModeratedUserPage(browser);
    try {
      await page.goto('/');
      await page.getByRole('button', { name: /open chat/i }).click();

      // When chat access is disabled, the composer is removed entirely and
      // replaced with the disabled-state message (see ChatDisabledState).
      await expect(page.getByText(/reported for abuse/i)).toBeVisible({ timeout: 10_000 });
      await expect(page.getByLabel('Chat message')).not.toBeVisible();
    } finally {
      await page.context().close();
    }
  });

  test('admin can re-enable the user', async ({ adminPage }) => {
    await openAllUsersView(adminPage);

    await adminPage.getByRole('switch', { name: `Enable chat for ${HANDLE}` }).click();
    await expect(adminPage.getByText(/chat access restored/i)).toBeVisible({ timeout: 10_000 });
  });
});
