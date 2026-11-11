/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { expect, test } from '../fixtures/auth.fixture';
import { createStampedUser, newStampedUserContext } from '../helpers/stamped-user';

import type { StampedUser } from '../helpers/stamped-user';
import type { Browser, Page } from '@playwright/test';

/**
 * The submission approval loop, end to end (ADR-0025): an owner publishes a
 * writing, a second approver approves it, and an edit takes it back out for
 * approval.
 *
 * Until the community page launches, only approvers may use the feature, so
 * both the owner and the approver here are managers. They are stamped users
 * of this run: a manager's role is state other specs must not see on a seeded
 * user. A manager cannot approve their own submission, which is why there are
 * two.
 */

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

const STAMP = randomUUID().slice(0, 8);
const TITLE = `E2E bus poem ${STAMP}`;
const EDITED_TITLE = `${TITLE} fixed`;
const POEM = `Written on the bus, run ${STAMP}.`;

let owner: StampedUser | undefined;
let approver: StampedUser | undefined;

const openPageAs = async (browser: Browser, user: StampedUser | undefined): Promise<Page> => {
  if (!user) {
    throw new Error('The stamped user was not created');
  }
  const context = await newStampedUserContext(browser, user);
  return context.newPage();
};

test.beforeAll(async () => {
  owner = await createStampedUser(prisma, { handle: `e2eowner${STAMP}`, name: 'E2E Owner' });
  approver = await createStampedUser(prisma, { handle: `e2eappr${STAMP}`, name: 'E2E Approver' });
  await prisma.user.updateMany({
    where: { id: { in: [owner.id, approver.id] } },
    data: { role: 'manager' },
  });
});

test.afterAll(async () => {
  // By the ids this worker created, never by a prefix another worker shares.
  const ids = [owner?.id, approver?.id].filter((id): id is string => id !== undefined);
  if (ids.length > 0) {
    await prisma.submission.deleteMany({ where: { ownerId: { in: ids } } });
    await prisma.session.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
  }
  await prisma.$disconnect();
});

test('a writing is published, approved by another approver, and goes back out when edited', async ({
  browser,
  userPage,
  adminPage,
}) => {
  test.setTimeout(120_000);
  const ownerPage = await openPageAs(browser, owner);
  const approverPage = await openPageAs(browser, approver);
  let submissionPath = '';

  await test.step('the owner accepts the agreement and publishes', async () => {
    await ownerPage.goto('/community/submit');
    // Enabled buttons mean the form has hydrated and verification has passed.
    await expect(ownerPage.getByRole('button', { name: 'Publish' })).toBeEnabled();

    await ownerPage.getByRole('switch', { name: /I won't post anything that harms/ }).click();
    await ownerPage.getByLabel('Title').fill(TITLE);
    const writing = ownerPage.getByRole('textbox', { name: 'Writing' });
    await writing.click();
    await ownerPage.keyboard.type(POEM);
    await expect(writing).toContainText(POEM);

    await ownerPage.getByRole('button', { name: 'Publish' }).click();

    await expect(ownerPage.getByText('Sent for approval.')).toBeVisible();
    await expect(
      ownerPage.getByText('We usually reply within 2 to 5 business days.')
    ).toBeVisible();
    const href = await ownerPage
      .getByRole('link', { name: 'View your submission' })
      .getAttribute('href');
    expect(href).toMatch(/^\/community\/[a-f0-9]{24}$/);
    submissionPath = href ?? '';
  });

  await test.step('nobody the feature is not open to can open its link', async () => {
    await userPage.goto(submissionPath);

    await expect(userPage.getByRole('img', { name: 'page not found' })).toBeVisible();
    await expect(userPage.getByText(TITLE)).toHaveCount(0);
  });

  await test.step('a manager reaches the queue and nothing else in the admin area', async () => {
    await approverPage.goto('/admin/community');

    await expect(
      approverPage.getByRole('navigation', { name: 'Admin sections' }).getByRole('link')
    ).toHaveText(['Community']);
    await expect(approverPage.getByRole('link', { name: 'Managers' })).toHaveCount(0);

    // Every other admin route refuses a manager, one of two ways. Once the
    // session cookie caches the role, the proxy answers 403 before any page
    // renders; until then the admin layout's own gate throws. Which one a
    // request meets depends on the cache, so either refusal is the proof.
    await approverPage.goto('/admin/releases');
    await expect(
      approverPage
        .getByText('Forbidden')
        .or(approverPage.getByRole('heading', { name: 'Something went wrong' }))
    ).toBeVisible();
    await expect(approverPage.getByRole('navigation', { name: 'Admin sections' })).toHaveCount(0);

    await approverPage.goto('/admin/community/managers');
    await expect(approverPage.getByRole('img', { name: 'page not found' })).toBeVisible();
  });

  await test.step('the other approver approves it from the queue', async () => {
    await approverPage.goto('/admin/community');
    await approverPage.getByRole('link', { name: TITLE, exact: true }).click();

    await expect(approverPage.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
    await expect(approverPage.getByText(POEM)).toBeVisible();
    await approverPage.getByRole('button', { name: 'Approve' }).click();

    await approverPage.waitForURL(/\/admin\/community$/);
    await expect(approverPage.getByRole('link', { name: TITLE, exact: true })).toHaveCount(0);
  });

  await test.step('once approved it opens, unlisted, with sharing', async () => {
    await adminPage.goto(submissionPath);

    await expect(adminPage.getByRole('heading', { level: 1, name: TITLE })).toBeVisible();
    await expect(adminPage.getByText(POEM)).toBeVisible();
    await expect(adminPage.getByRole('status')).toContainText('Approved and unlisted');
    await expect(adminPage.getByRole('button', { name: 'Copy link' })).toBeVisible();
  });

  await test.step('the owner’s edit is warned about, then takes it offline', async () => {
    await ownerPage.goto(`${submissionPath}/edit`);
    await expect(ownerPage.getByRole('button', { name: 'Save changes' })).toBeEnabled();
    await ownerPage.getByLabel('Title').fill(EDITED_TITLE);

    await ownerPage.getByRole('button', { name: 'Save changes' }).click();
    const warning = ownerPage.getByRole('alertdialog');
    await expect(warning).toContainText('Editing takes this offline until it is approved again.');
    await warning.getByRole('button', { name: 'Save and send for approval' }).click();

    await expect(ownerPage.getByText('Sent for approval.')).toBeVisible();
  });

  await test.step('it is awaiting approval again, and no longer shareable', async () => {
    await adminPage.goto(submissionPath);

    await expect(adminPage.getByRole('heading', { level: 1, name: EDITED_TITLE })).toBeVisible();
    await expect(adminPage.getByRole('status')).toContainText('Awaiting approval.');
    await expect(adminPage.getByRole('button', { name: 'Copy link' })).toHaveCount(0);

    // The stored row, not only what a page rendered.
    const stored = await prisma.submission.findFirst({
      where: { ownerId: owner?.id ?? '' },
      select: { status: true, title: true, firstApprovedAt: true },
    });
    expect(stored).toMatchObject({ status: 'AWAITING_APPROVAL', title: EDITED_TITLE });
    expect(stored?.firstApprovedAt).not.toBeNull();
  });
});
