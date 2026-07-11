/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../fixtures/auth.fixture';

import type { Page } from '@playwright/test';

/**
 * E2E coverage for the admin AI Bio Generation flow. The web server runs with
 * BIO_GENERATOR_FAKE=true (see playwright.config.ts), so generation returns a
 * deterministic fixture instead of invoking the AWS Lambda / Gemini.
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

    // The fake path emits one synthetic `vision-gating` checkpoint and pauses
    // ~4s (BIO_GENERATOR_FAKE default) before completing, so the polled live
    // timeline (2.5s cadence) is observable at least once. Assert the active
    // stage surfaces "Verifying images" with its candidate count. The list only
    // renders once a checkpoint arrives — web-first, no sleeps.
    const timeline = adminPage.getByRole('list', { name: /bio generation progress/i });
    const activeStage = timeline.locator('[aria-current="step"]');
    await expect(activeStage).toContainText('Verifying images — 3 candidates', { timeout: 20_000 });

    // Generation now runs in the background (server `after()`); the client polls
    // for completion, so allow extra time. It succeeded once the button flips to
    // "Regenerate" and the discovered link + populated short-bio editor appear.
    // The Short Bio field is a rich-text (contenteditable) editor, so assert its
    // text content rather than a form value.
    const regenerate = adminPage.getByRole('button', { name: /regenerate bios/i });
    await expect(regenerate).toBeVisible({ timeout: 30_000 });
    // The palette renders draggable tiles (not anchors); the delete button's
    // accessible name uniquely identifies the Wikipedia tile within the group.
    const discoveredLinks = adminPage.getByRole('group', { name: 'Discovered links' });
    await expect(
      discoveredLinks.getByRole('button', { name: 'Delete link Wikipedia' })
    ).toBeVisible();
    await expect(adminPage.getByRole('textbox', { name: 'Short Bio' })).toContainText(
      /boundary-pushing artist on the roster/
    );

    // Regenerate replaces the preview (also async — poll again).
    await regenerate.click();
    await expect(
      discoveredLinks.getByRole('button', { name: 'Delete link Wikipedia' })
    ).toBeVisible({ timeout: 30_000 });

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

  test('exposes bulleted and numbered list buttons in the bio editors', async ({ adminPage }) => {
    await openFirstArtistEdit(adminPage);

    // The rich-text bio editors expose list controls (first() — there are
    // multiple bio editors on the form, each with its own toolbar).
    await expect(adminPage.getByRole('button', { name: 'Bulleted list' }).first()).toBeVisible({
      timeout: 15_000,
    });
    await expect(adminPage.getByRole('button', { name: 'Numbered list' }).first()).toBeVisible();
  });
});
