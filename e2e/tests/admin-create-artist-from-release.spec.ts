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

    // The admin form is a client component; under CI's production build + load
    // its hydration can briefly mount a second copy before settling to one.
    // Wait for a single heading so this assertion can't trip on the transient.
    const heading = adminPage.getByRole('heading', { name: 'Create New Artist', exact: true });
    await expect(heading).toHaveCount(1, { timeout: 15_000 });
    await expect(heading).toBeVisible();
  });

  test('creating the artist returns to the originating release', async ({ adminPage }) => {
    const releaseId = await firstReleaseId(adminPage);
    const returnTo = `/admin/releases/${releaseId}`;
    const unique = Date.now();

    await adminPage.goto(
      `/admin/artists/new?releaseId=${releaseId}&returnTo=${encodeURIComponent(returnTo)}`
    );

    // Wait for the client form to settle to a single instance before filling —
    // hydration can transiently double-mount it under CI's production build,
    // which would otherwise trip strict-mode on the name="displayName" locator.
    const displayNameInput = adminPage.locator('[name="displayName"]');
    await expect(displayNameInput).toHaveCount(1, { timeout: 15_000 });
    await displayNameInput.fill(`E2E From Release ${unique}`);
    await adminPage.locator('[name="slug"]').fill(`e2e-from-release-${unique}`);

    await adminPage.getByRole('button', { name: 'Create', exact: true }).click();

    await expect(adminPage).toHaveURL((url) => url.pathname === `/admin/releases/${releaseId}`, {
      timeout: 20_000,
    });
  });
});
