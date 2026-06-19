/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../fixtures/auth.fixture';

import type { Page } from '@playwright/test';

/**
 * E2E coverage for the rule that artists are created only in the context of a
 * release. The artist picker on a release links to /admin/artists/new with the
 * release context; creating an artist there returns to the originating release.
 */

/** Resolve a real seeded release id by reading the first edit link on the list. */
const firstReleaseId = async (adminPage: Page): Promise<string> => {
  await adminPage.goto('/admin/releases');
  const editLink = adminPage.getByRole('link', { name: /edit/i }).first();
  await expect(editLink).toBeVisible({ timeout: 15_000 });
  const href = await editLink.getAttribute('href');
  const id = href?.split('/').at(-1);
  if (!id) throw new Error('expected a release id in the edit link href');
  return id;
};

test.describe('Create artist from a release', () => {
  test('the standalone create route is allowed when launched from a release', async ({
    adminPage,
  }) => {
    const releaseId = await firstReleaseId(adminPage);
    const returnTo = `/admin/releases/${releaseId}`;

    await adminPage.goto(
      `/admin/artists/new?releaseId=${releaseId}&returnTo=${encodeURIComponent(returnTo)}`
    );

    await expect(
      adminPage.getByRole('heading', { name: 'Create New Artist', exact: true })
    ).toBeVisible({ timeout: 15_000 });
  });

  test('creating the artist returns to the originating release', async ({ adminPage }) => {
    const releaseId = await firstReleaseId(adminPage);
    const returnTo = `/admin/releases/${releaseId}`;
    const unique = Date.now();

    await adminPage.goto(
      `/admin/artists/new?releaseId=${releaseId}&returnTo=${encodeURIComponent(returnTo)}`
    );

    await adminPage.locator('[name="displayName"]').fill(`E2E From Release ${unique}`);
    await adminPage.locator('[name="slug"]').fill(`e2e-from-release-${unique}`);

    await adminPage.getByRole('button', { name: 'Create', exact: true }).click();

    await expect(adminPage).toHaveURL((url) => url.pathname === `/admin/releases/${releaseId}`, {
      timeout: 20_000,
    });
  });
});
