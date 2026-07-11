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

/**
 * Asserts the public full-bio page renders BOTH fixture placeholders as
 * floated, captioned figures: the fixture's image 0 (titled/attributed
 * portrait) composes to a right float and image 1 (cover) to a left float.
 * Assertions target what the BioHtml renderer actually emits — the
 * `bio-figure` class plus Tailwind float utilities — scoped to the long-bio
 * article so the discovered-image gallery can never satisfy them.
 */
const assertPublicBioFigures = async (page: Page, slug: string): Promise<void> => {
  await page.goto(`/artists/${slug}/bio`);
  const figures = page.locator('article figure.bio-figure');
  await expect(figures).toHaveCount(2, { timeout: 15_000 });
  await expect(figures.first()).toHaveClass(/float-right/);
  await expect(figures.nth(1)).toHaveClass(/float-left/);
  // Captions carry the fixture's title/attribution metadata through
  // compose → sanitize → persist → render.
  await expect(figures.first().locator('.bio-figure-title')).toHaveText(/portrait$/);
  await expect(figures.first().locator('.bio-figure-attribution')).toHaveText('Public domain');
  await expect(figures.nth(1).locator('.bio-figure-title')).toHaveText('Fixture Album');
  await expect(figures.nth(1).locator('.bio-figure-attribution')).toHaveText('Cover Art Archive');
  // The images resolve to the fixture URLs with their metadata alts intact.
  await expect(figures.first().locator('img')).toHaveAttribute('alt', /portrait photo$/);
  await expect(figures.nth(1).locator('img')).toHaveAttribute('alt', 'Fixture Album cover art');
};

test.describe('Admin AI bio generation', () => {
  // One end-to-end flow (generate → public floats → no-edit save round-trip →
  // regenerate → edit → save). Kept as a single test because each step mutates
  // the same artist, so splitting it would make the steps order-dependent (and
  // fullyParallel could race two generations against the same first-listed
  // artist).
  test('generates, floats figures, round-trips, and saves', async ({ adminPage }) => {
    // Generate + regenerate each pause ~4s (fake-path delay) and the flow adds
    // two public-page visits; triple the budget so CI never clips the tail.
    test.slow();

    await openFirstArtistEdit(adminPage);

    // The public bio page for the artist under edit is derived from its slug.
    const slugField = adminPage.getByRole('textbox', { name: /slug/i });
    await expect(slugField).not.toHaveValue('');
    const slug = await slugField.inputValue();

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

    // The fixture's two image:N placeholders composed into floated figures at
    // persist time; the Bio editor renders them via the BioFigure NodeView.
    const longBioEditor = adminPage.getByRole('textbox', { name: 'Bio' });
    await expect(longBioEditor.locator('figure.bio-figure')).toHaveCount(2);

    // Public page (a second tab, so the dirty admin form survives): both
    // floated figures render with captions — the persisted generation output.
    const publicPage = await adminPage.context().newPage();
    await assertPublicBioFigures(publicPage, slug);

    // Round-trip: save WITHOUT edits (generation itself dirtied the form),
    // then re-visit the public page — the figures must survive the
    // editor-backed form → server sanitize → DB → renderer loop with no drift.
    const save = adminPage.getByRole('button', { name: 'Save', exact: true });
    await expect(save).toBeEnabled({ timeout: 10_000 });
    await save.click();
    const savedToast = adminPage.getByText(/saved successfully/i);
    await expect(savedToast).toBeVisible({ timeout: 15_000 });
    // Let the toast auto-dismiss so the post-regenerate save's toast assertion
    // below cannot match this stale one.
    await expect(savedToast).not.toBeVisible({ timeout: 15_000 });
    await assertPublicBioFigures(publicPage, slug);
    await publicPage.close();

    // Regenerate replaces the preview (also async — poll again). Wait for the
    // completion toast — it fires in the SAME effect that populates the form
    // (onGenerated) — before editing below. The palette tiles re-render from a
    // separate media query and can appear BEFORE that effect runs; editing on
    // the palette signal alone races a late onGenerated overwrite that would
    // revert the edit and un-dirty the form (disabling Save).
    await regenerate.click();
    await expect(adminPage.getByText(/bios generated — review below/i)).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      discoveredLinks.getByRole('button', { name: 'Delete link Wikipedia' })
    ).toBeVisible({ timeout: 30_000 });

    // Editing a generated field dirties the form so Save (which persists the
    // possibly hand-edited bio) becomes enabled.
    await adminPage
      .getByRole('textbox', { name: 'Short Bio' })
      .fill('Edited short bio for the save flow.');

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
