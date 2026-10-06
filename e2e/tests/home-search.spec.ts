/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { PrismaClient } from '@prisma/client';

import { expect, test } from '../fixtures/base.fixture';

/**
 * The homepage's click-to-open artist and release search (#758): a hint
 * until three characters, then one group per artist with its releases
 * indented under it, and a release pick that opens it on the artist's page.
 * Read-only against the seed.
 */

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

test.afterAll(async () => {
  await prisma.$disconnect();
});

test('the home search groups releases under their artist and opens a pick', async ({ page }) => {
  const release = await prisma.release.findFirstOrThrow({
    where: { title: 'E2E Album One' },
    select: { id: true },
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Search artists and releases' }).click();
  await expect(page.getByText('Type at least 3 characters')).toBeVisible();

  await page.getByRole('combobox', { name: 'Search artists and releases' }).fill('E2E Artist');
  const artistRow = page.getByRole('option', { name: /^E2E Artist\b.*releases?$/ }).first();
  const releaseRow = page.getByRole('option', { name: 'E2E Album One', exact: true });
  await expect(artistRow).toBeVisible({ timeout: 15_000 });
  await expect(releaseRow).toBeVisible();

  const [artistIndent, releaseIndent] = await Promise.all(
    [artistRow, releaseRow].map((row) =>
      row.evaluate((element) => parseFloat(getComputedStyle(element).paddingLeft))
    )
  );
  expect(releaseIndent).toBeGreaterThan(artistIndent);

  await releaseRow.click();
  // A release pick opens the release page; the artist page leads with its
  // latest release and lists the rest under /releases (ADR-0006 amendment).
  await page.waitForURL((url) => url.pathname === `/releases/${release.id}`);
});
