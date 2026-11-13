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

const PHOTO_TITLE = `E2E show photo ${STAMP}`;

const REPORTED_TITLE = `E2E reported poem ${STAMP}`;
const REPORT_NOTE = `That is my poem, not theirs. Run ${STAMP}.`;
const REPORT_CONTACT = `wronged-${STAMP}@example.invalid`;
// A fixed day in the past: a row this spec seeds never sorts ahead of one a
// page lists by date, however long the run has been going.
const APPROVED_LONG_AGO = new Date('2001-01-01T00:00:00.000Z');

/** The smallest valid PNG: one transparent pixel. */
const ONE_PIXEL_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

// A published attachment file's address: its submission, its attachment, then the file.
const PUBLISHED_COPY = /media\/submissions\/[a-f0-9]{24}\/[a-f0-9]{24}\/copy\.jpg$/;
const PUBLISHED_CARD = /media\/submissions\/[a-f0-9]{24}\/[a-f0-9]{24}\/card\.webp$/;

let owner: StampedUser | undefined;
let approver: StampedUser | undefined;
// The photo's owner is a third user, so they always still owe the upload
// agreement whichever order the tests run in.
let photographer: StampedUser | undefined;

const openPageAs = async (browser: Browser, user: StampedUser | undefined): Promise<Page> => {
  if (!user) {
    throw new Error('The stamped user was not created');
  }
  const context = await newStampedUserContext(browser, user);
  return context.newPage();
};

/** Pick a category from the form's dropdown. */
const chooseCategory = async (page: Page, name: RegExp): Promise<void> => {
  await page.getByRole('combobox', { name: 'Category' }).click();
  await page.getByRole('option', { name }).click();
};

test.beforeAll(async () => {
  owner = await createStampedUser(prisma, { handle: `e2eowner${STAMP}`, name: 'E2E Owner' });
  approver = await createStampedUser(prisma, { handle: `e2eappr${STAMP}`, name: 'E2E Approver' });
  photographer = await createStampedUser(prisma, {
    handle: `e2ephoto${STAMP}`,
    name: 'E2E Photographer',
  });
  await prisma.user.updateMany({
    where: { id: { in: [owner.id, approver.id, photographer.id] } },
    data: { role: 'manager' },
  });
});

test.afterAll(async () => {
  // By the ids this worker created, never by a prefix another worker shares.
  // Deleting a submission through Prisma takes its attachments with it.
  const ids = [owner?.id, approver?.id, photographer?.id].filter(
    (id): id is string => id !== undefined
  );
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
    await chooseCategory(ownerPage, /^Writings/);
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
      where: { ownerId: owner?.id ?? '', title: EDITED_TITLE },
      select: { status: true, title: true, firstApprovedAt: true },
    });
    expect(stored).toMatchObject({ status: 'AWAITING_APPROVAL', title: EDITED_TITLE });
    expect(stored?.firstApprovedAt).not.toBeNull();
  });
});

/**
 * An attachment, end to end (ADR-0026, ADR-0027): the upload goes to the local
 * sink, the fake re-encode answers through the real signed callback route,
 * and approval is what puts the file at its CDN address.
 */
test('a photo is attached, re-encoded, published and approved', async ({ browser }) => {
  test.setTimeout(120_000);
  const ownerPage = await openPageAs(browser, photographer);
  const approverPage = await openPageAs(browser, approver);
  let submissionPath = '';

  await test.step('a photo submission cannot be published without a photo', async () => {
    await ownerPage.goto('/community/submit');
    await expect(ownerPage.getByRole('button', { name: 'Publish' })).toBeEnabled();

    await ownerPage.getByRole('switch', { name: /I won't post anything that harms/ }).click();
    await ownerPage.getByLabel('Title').fill(PHOTO_TITLE);
    await chooseCategory(ownerPage, /^Photos/);
    await ownerPage.getByRole('button', { name: 'Publish' }).click();

    await expect(
      ownerPage.getByText('Add at least one attachment before publishing.')
    ).toBeVisible();
  });

  await test.step('saving a draft is what gives the photo somewhere to go', async () => {
    await expect(ownerPage.getByText(/^Save a draft first\./)).toBeVisible();
    // The refused publish spent the verification; wait for the next round.
    await expect(ownerPage.getByRole('button', { name: 'Save draft' })).toBeEnabled();
    await ownerPage.getByRole('button', { name: 'Save draft' }).click();

    await ownerPage.waitForURL(/\/community\/[a-f0-9]{24}\/edit$/);
    submissionPath = new URL(ownerPage.url()).pathname.replace(/\/edit$/, '');
  });

  await test.step('the owner attaches a photo and sees it re-encoded', async () => {
    const attachments = ownerPage.getByRole('group', { name: 'Attachments' });
    // A file set before hydration is lost without a trace.
    await expect(attachments).toHaveAttribute('data-hydrated', 'true');

    await attachments
      .getByLabel('Add attachments')
      .setInputFiles({ name: 'show.png', mimeType: 'image/png', buffer: ONE_PIXEL_PNG });

    const row = attachments.getByRole('listitem').filter({ hasText: 'show.png' });
    await expect(row).toContainText('Ready', { timeout: 30_000 });

    // The stored row, not only what the form rendered.
    const stored = await prisma.submissionAttachment.findFirst({
      where: { submission: { ownerId: photographer?.id ?? '' } },
      select: { kind: true, reencodeStatus: true, copyKey: true, reencodeJobToken: true },
    });
    expect(stored).toMatchObject({ kind: 'IMAGE', reencodeStatus: 'succeeded' });
    expect(stored?.copyKey).toMatch(/^copies\/[a-f0-9]{24}\/[a-f0-9]{24}\/copy\.jpg$/);
    // The single-use token was claimed by the callback.
    expect(stored?.reencodeJobToken).toBeNull();
  });

  await test.step('with the photo ready, it publishes', async () => {
    await expect(ownerPage.getByRole('button', { name: 'Publish' })).toBeEnabled();
    await ownerPage.getByRole('button', { name: 'Publish' }).click();

    await expect(ownerPage.getByText('Sent for approval.')).toBeVisible();
  });

  await test.step('the approver sees the photo and approves', async () => {
    await approverPage.goto('/admin/community');
    await approverPage.getByRole('link', { name: PHOTO_TITLE, exact: true }).click();

    await expect(approverPage.getByRole('heading', { level: 1, name: PHOTO_TITLE })).toBeVisible();
    await expect(
      approverPage.getByRole('img', { name: `${PHOTO_TITLE}, attachment 1 of 1` })
    ).toBeVisible();
    await approverPage.getByRole('button', { name: 'Approve' }).click();

    await approverPage.waitForURL(/\/admin\/community$/);
  });

  await test.step('once approved, the photo is served from its CDN address', async () => {
    await ownerPage.goto(submissionPath);

    await expect(ownerPage.getByRole('status')).toContainText('Approved and unlisted');
    await expect(
      ownerPage.getByRole('img', { name: `${PHOTO_TITLE}, attachment 1 of 1` })
    ).toHaveAttribute('src', PUBLISHED_COPY);
  });

  await test.step('its card picture stands for it in the owner’s list', async () => {
    await ownerPage.goto('/community/mine');

    const row = ownerPage.getByRole('listitem').filter({ hasText: PHOTO_TITLE });
    await expect(row.getByRole('presentation')).toHaveAttribute('src', PUBLISHED_CARD);
  });
});

/**
 * A submission report, end to end (ADR-0025, ADR-0028): a reader reports an
 * approved submission from its page, an approver finds it under Reported and
 * marks it handled, and at no point does the submission change.
 *
 * Until the community page launches only approvers can open a submission's
 * page, so the reporter here is a manager too. A signed-out reporter is the
 * launch's case to add. The submission is seeded approved: the approval loop
 * has its own test above.
 */
test('a report reaches the approvers, is marked handled, and takes nothing down', async ({
  browser,
  adminPage,
}) => {
  test.setTimeout(120_000);
  if (!owner || !approver) {
    throw new Error('The stamped users were not created');
  }
  const reported = await prisma.submission.create({
    data: {
      ownerId: owner.id,
      title: REPORTED_TITLE,
      category: 'WRITING',
      writingHtml: `<p>${POEM}</p>`,
      status: 'APPROVED',
      publishedAt: APPROVED_LONG_AGO,
      firstApprovedAt: APPROVED_LONG_AGO,
      approvedAt: APPROVED_LONG_AGO,
    },
    select: { id: true, updatedAt: true },
  });
  const submissionPath = `/community/${reported.id}`;
  const reviewPath = `/admin/community/${reported.id}`;
  const reporterPage = await openPageAs(browser, photographer);
  const approverPage = await openPageAs(browser, approver);
  const ownerPage = await openPageAs(browser, owner);

  await test.step('a reader reports it from its page', async () => {
    await reporterPage.goto(submissionPath);
    // The button is disabled until the page has hydrated, so this click waits.
    await reporterPage.getByRole('button', { name: 'Report' }).click();

    const dialog = reporterPage.getByRole('dialog', { name: `Report “${REPORTED_TITLE}”` });
    // Enabled means the dialog has loaded and verification has passed.
    await expect(dialog.getByRole('button', { name: 'Send report' })).toBeEnabled();
    await dialog.getByRole('radio', { name: /^It isn't theirs to post/ }).click();
    await dialog.getByLabel('What should we know?').fill(REPORT_NOTE);
    await dialog.getByLabel('Email (optional)').fill(REPORT_CONTACT);
    await dialog.getByRole('button', { name: 'Send report' }).click();

    // Shown only once the server has answered.
    await expect(dialog.getByText('Thanks. Our team has your report.')).toBeVisible();
    await dialog.getByRole('button', { name: 'Done' }).click();
    await expect(dialog).toBeHidden();
  });

  await test.step('the report is stored open, with nothing about who filed it', async () => {
    const stored = await prisma.submissionReport.findMany({
      where: { submissionId: reported.id },
    });

    expect(stored).toHaveLength(1);
    expect(stored.at(0)).toMatchObject({
      reason: 'NOT_THEIRS',
      note: REPORT_NOTE,
      contactEmail: REPORT_CONTACT,
      handled: false,
      handledBy: null,
    });
    // Every stored field, so a reporter id added later would have to be added here.
    expect(Object.keys(stored.at(0) ?? {}).sort()).toEqual([
      'contactEmail',
      'createdAt',
      'handled',
      'handledAt',
      'handledBy',
      'id',
      'note',
      'reason',
      'submissionId',
    ]);
  });

  await test.step('the submission is as it was, and still opens', async () => {
    const after = await prisma.submission.findUnique({
      where: { id: reported.id },
      select: { status: true, updatedAt: true },
    });
    expect(after).toEqual({ status: 'APPROVED', updatedAt: reported.updatedAt });

    await reporterPage.goto(submissionPath);
    await expect(
      reporterPage.getByRole('heading', { level: 1, name: REPORTED_TITLE })
    ).toBeVisible();
    await expect(reporterPage.getByRole('button', { name: 'Copy link' })).toBeVisible();
  });

  await test.step('its owner, a manager, is kept from the reports against it', async () => {
    await ownerPage.goto('/admin/community?status=reported');
    await expect(ownerPage.getByRole('navigation', { name: 'Queues' })).toBeVisible();
    await expect(ownerPage.getByRole('link', { name: REPORTED_TITLE, exact: true })).toHaveCount(0);

    await ownerPage.goto(reviewPath);
    await expect(ownerPage.getByRole('heading', { level: 1, name: REPORTED_TITLE })).toBeVisible();
    await expect(ownerPage.getByRole('heading', { name: 'Reports' })).toHaveCount(0);

    // And their own page offers them no way to report it.
    await ownerPage.goto(submissionPath);
    await expect(ownerPage.getByRole('button', { name: 'Copy link' })).toBeVisible();
    await expect(ownerPage.getByRole('button', { name: 'Report' })).toHaveCount(0);
  });

  await test.step('another approver finds it under Reported and reads the report', async () => {
    await approverPage.goto('/admin/community');
    await approverPage.getByRole('link', { name: /^Reported \(\d+\)$/ }).click();

    const row = approverPage.getByRole('row').filter({ hasText: REPORTED_TITLE });
    await expect(row).toContainText('Approved');
    await row.getByRole('link', { name: REPORTED_TITLE, exact: true }).click();

    const reports = approverPage.getByRole('list', { name: 'Reports' });
    await expect(reports).toContainText('Reported as not theirs to post');
    await expect(reports).toContainText(REPORT_NOTE);
    // A manager learns that a contact was left, never the address.
    await expect(reports).toContainText('A contact email was left. Ask an admin to reply.');
    await expect(approverPage.getByText(REPORT_CONTACT)).toHaveCount(0);
  });

  await test.step('an admin can read the contact email', async () => {
    await adminPage.goto(reviewPath);

    await expect(adminPage.getByRole('link', { name: REPORT_CONTACT })).toHaveAttribute(
      'href',
      `mailto:${REPORT_CONTACT}`
    );
  });

  await test.step('marking it handled clears it from Reported', async () => {
    await approverPage.getByRole('button', { name: 'Mark handled' }).click();

    await expect(approverPage.getByRole('list', { name: 'Reports' })).toContainText(
      `by ${approver?.username ?? ''}`
    );
    await expect(approverPage.getByRole('button', { name: 'Mark handled' })).toHaveCount(0);

    await approverPage.goto('/admin/community?status=reported');
    await expect(approverPage.getByRole('navigation', { name: 'Queues' })).toBeVisible();
    await expect(approverPage.getByRole('link', { name: REPORTED_TITLE, exact: true })).toHaveCount(
      0
    );
  });

  await test.step('handling changed the report and nothing else', async () => {
    const handled = await prisma.submissionReport.findFirst({
      where: { submissionId: reported.id },
      select: { handled: true, handledBy: true },
    });
    expect(handled).toEqual({ handled: true, handledBy: approver?.id });

    const after = await prisma.submission.findUnique({
      where: { id: reported.id },
      select: { status: true, updatedAt: true },
    });
    expect(after).toEqual({ status: 'APPROVED', updatedAt: reported.updatedAt });
  });
});
