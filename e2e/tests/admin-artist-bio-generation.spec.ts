/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { expect, test } from '../fixtures/auth.fixture';

import type { Page } from '@playwright/test';

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

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
 * article so the discovered-image gallery can never satisfy them. The bio now
 * lives on the artist page itself, not a separate /bio route.
 */
const assertPublicBioFigures = async (page: Page, slug: string): Promise<void> => {
  await page.goto(`/artists/${slug}`);
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

    // The job persisted what it generated, so the form adopts it as SAVED
    // content: the completion toast says so and Save stays disabled — there is
    // nothing for the admin to scroll down and keep. Assert after the toast,
    // which fires in the same effect that populates the form (onGenerated); a
    // pristine form's Save is disabled too, so an earlier check proves nothing.
    const generatedToast = adminPage.getByText(/bios generated and saved/i);
    await expect(generatedToast).toBeVisible({ timeout: 30_000 });
    const save = adminPage.getByRole('button', { name: 'Save', exact: true });
    await expect(save).toBeDisabled();

    // Public page (a second tab, so the admin form survives): both floated
    // figures render with captions — the persisted generation output, live
    // without any Save.
    const publicPage = await adminPage.context().newPage();
    await assertPublicBioFigures(publicPage, slug);

    // Let the toast auto-dismiss so the post-regenerate toast assertion below
    // cannot match this stale one.
    await expect(generatedToast).not.toBeVisible({ timeout: 15_000 });

    // Regenerate replaces the preview (also async — poll again). Wait for the
    // completion toast — it fires in the SAME effect that populates the form
    // (onGenerated) — before editing below. The palette tiles re-render from a
    // separate media query and can appear BEFORE that effect runs; editing on
    // the palette signal alone races a late onGenerated overwrite that would
    // revert the edit and un-dirty the form (disabling Save).
    await regenerate.click();
    await expect(generatedToast).toBeVisible({ timeout: 30_000 });
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

    // Round-trip: that Save submitted the untouched long bio too, so the
    // figures must survive the editor-backed form → server sanitize → DB →
    // renderer loop with no drift.
    await assertPublicBioFigures(publicPage, slug);
    await publicPage.close();
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

// These were manual smokes after #749, #753 and #772. Each test generates for
// its own artist, stamped per worker, named to file after every seeded artist
// and removed by id, so no two tests generate for the same artist.
test.describe('Admin AI bio generation, per artist', () => {
  const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });
  const stamp = randomUUID().slice(0, 8);
  const made: string[] = [];

  const createArtist = async (label: string): Promise<string> => {
    const { id } = await prisma.artist.create({
      data: {
        firstName: 'ZZ',
        surname: `E2E Bio ${label} ${stamp}`,
        displayName: `ZZ E2E Bio ${label} ${stamp}`,
        slug: `e2e-bio-${label.toLowerCase()}-${stamp}`,
        publishedOn: new Date('2000-01-01T00:00:00.000Z'),
      },
      select: { id: true },
    });
    made.push(id);
    return id;
  };

  const generateBios = async (page: Page, button: RegExp): Promise<void> => {
    await page.getByRole('button', { name: button }).click();
    await expect(page.getByText(/bios generated and saved/i)).toBeVisible({ timeout: 30_000 });
  };

  test.afterAll(async () => {
    await prisma.artistBioImage.deleteMany({ where: { artistId: { in: made } } });
    await prisma.artistBioLink.deleteMany({ where: { artistId: { in: made } } });
    await prisma.artist.deleteMany({ where: { id: { in: made } } });
    await prisma.$disconnect();
  });

  // #753: generation saves only what it generated; an edit the admin was
  // making elsewhere on the form is still there, unsaved, afterwards.
  test('an unrelated unsaved edit survives Generate', async ({ adminPage }) => {
    test.slow();
    const id = await createArtist('Edit');
    await adminPage.goto(`/admin/artists/${id}`);
    const aka = adminPage.locator('[name="akaNames"]');
    await expect(aka).toBeVisible({ timeout: 15_000 });
    await aka.fill('E2E Also Known');

    await generateBios(adminPage, /generate bios/i);

    await expect(aka).toHaveValue('E2E Also Known');
    const save = adminPage.getByRole('button', { name: 'Save', exact: true });
    await expect(save).toBeEnabled();
    await save.click();
    await expect(adminPage.getByText(/saved successfully/i)).toBeVisible({ timeout: 15_000 });
    await adminPage.reload();
    await expect(aka).toHaveValue('E2E Also Known', { timeout: 15_000 });
  });

  // #749: regenerating replaces the generated pool, but an image the admin
  // chose to show stays shown; choosing it made it the admin's (Custom).
  test('a chosen generated image stays shown after Regenerate', async ({ adminPage }) => {
    test.slow();
    const id = await createArtist('Keep');
    await adminPage.goto(`/admin/artists/${id}`);
    await expect(adminPage.getByRole('button', { name: /generate bios/i })).toBeVisible({
      timeout: 15_000,
    });
    await generateBios(adminPage, /generate bios/i);

    const use = adminPage.getByRole('button', { name: /^Use .+ as display image$/ }).first();
    await expect(use).toBeEnabled({ timeout: 15_000 });
    const title = ((await use.getAttribute('aria-label')) ?? (await use.textContent()) ?? '')
      .replace(/^Use /, '')
      .replace(/ as display image$/, '');
    await use.click();
    const strip = adminPage.getByRole('list', { name: 'Display images' });
    const chosen = strip.getByRole('listitem', { name: `${title}, display image` });
    await expect(chosen).toBeVisible({ timeout: 15_000 });
    await expect(adminPage.getByText(/bios generated and saved/i)).toBeHidden({
      timeout: 15_000,
    });

    await generateBios(adminPage, /regenerate bios/i);

    await expect(chosen).toBeVisible({ timeout: 15_000 });
    const tile = adminPage
      .getByRole('group', { name: 'Image pool' })
      .getByRole('listitem')
      .filter({ has: adminPage.getByRole('button', { name: `Preview ${title}`, exact: true }) });
    await expect(tile.getByText('Custom', { exact: true })).toBeVisible();
  });

  // #772: image-source links feed the image pool only. They never become
  // reference links for the bio, nor tiles in the link palette.
  test('image-source links pull images without becoming reference links', async ({ adminPage }) => {
    const id = await createArtist('Sources');
    const urls = [
      `https://example.com/e2e-press-${stamp}`,
      `https://example.com/e2e-gallery-${stamp}`,
    ];
    await adminPage.goto(`/admin/artists/${id}`);
    const sources = adminPage.getByRole('region', { name: 'Image sources' });
    await expect(sources).toBeVisible({ timeout: 15_000 });
    for (const url of urls) {
      await sources.getByPlaceholder('https://example.com/press').fill(url);
      await sources.getByRole('button', { name: 'Add' }).click();
      await expect(sources.getByText(url)).toBeVisible({ timeout: 15_000 });
    }

    await sources.getByRole('button', { name: 'Generate images' }).click();

    await expect(adminPage.getByText('No new images found on those pages.')).toBeVisible({
      timeout: 30_000,
    });
    for (const url of urls) {
      await expect(adminPage.getByText(url)).toHaveCount(1);
    }
  });
});
