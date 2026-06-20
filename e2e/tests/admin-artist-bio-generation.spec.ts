/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../fixtures/auth.fixture';

import type { Page } from '@playwright/test';

/**
 * E2E coverage for the admin AI Bio Generation flow. The web server runs with
 * BIO_GENERATOR_FAKE=true (see playwright.config.ts), so generation returns a
 * deterministic fixture instead of invoking the AWS Lambda / Groq.
 */

const openFirstArtistEdit = async (adminPage: Page): Promise<void> => {
  await adminPage.goto('/admin/artists');
  const editLink = adminPage.getByRole('link', { name: /edit/i }).first();
  await expect(editLink).toBeVisible({ timeout: 15_000 });
  await editLink.click();
  await expect(adminPage).toHaveURL(/\/admin\/artists\/[a-f0-9]{24}$/);
};

test.describe('Admin AI bio generation', () => {
  // One end-to-end flow (generate → preview → regenerate → edit → save). Kept as
  // a single test because each step mutates the same artist, so splitting it
  // would make the steps order-dependent.
  test('generates, regenerates, edits, and saves a bio', async ({ adminPage }) => {
    await openFirstArtistEdit(adminPage);

    const generate = adminPage.getByRole('button', { name: /generate bios/i });
    await expect(generate).toBeVisible({ timeout: 15_000 });
    await generate.click();

    // Generation succeeded once the button flips to "Regenerate" and the
    // discovered link + populated short-bio editor appear. The Short Bio field
    // is now a rich-text (contenteditable) editor, so assert its text content
    // rather than a form value.
    const regenerate = adminPage.getByRole('button', { name: /regenerate bios/i });
    await expect(regenerate).toBeVisible({ timeout: 15_000 });
    // `exact` disambiguates the discovered-links "Wikipedia" entry from the
    // inline "their Wikipedia page" link Tiptap renders inside the bio editor.
    await expect(adminPage.getByRole('link', { name: 'Wikipedia', exact: true })).toBeVisible();
    await expect(adminPage.getByRole('textbox', { name: 'Short Bio' })).toContainText(
      /boundary-pushing artist on the roster/
    );

    // Regenerate replaces the preview.
    await regenerate.click();
    await expect(adminPage.getByRole('link', { name: 'Wikipedia', exact: true })).toBeVisible({
      timeout: 15_000,
    });

    // Editing a generated field dirties the form so Save (which persists the
    // possibly hand-edited bio) becomes enabled.
    await adminPage
      .getByRole('textbox', { name: 'Short Bio' })
      .fill('Edited short bio for the save flow.');

    const save = adminPage.getByRole('button', { name: 'Save', exact: true });
    await expect(save).toBeEnabled({ timeout: 10_000 });
    await save.click();

    // A success toast confirms the save without navigating away from the form.
    await expect(adminPage.getByText(/saved successfully/i)).toBeVisible({ timeout: 15_000 });
  });
});
