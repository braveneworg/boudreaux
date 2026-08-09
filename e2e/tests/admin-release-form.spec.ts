/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../fixtures/auth.fixture';

/**
 * E2E coverage for the release create/edit form views, reached from the
 * releases list, plus the "Generate notes" button — which fills the notes
 * field from the fake release-notes lookup when BIO_GENERATOR_FAKE=true
 * (see playwright.config.ts).
 */

test.describe('Admin release form', () => {
  test('renders the create-release view', async ({ adminPage }) => {
    await adminPage.goto('/admin/releases/new');

    await expect(adminPage.getByText('Create New Release')).toBeVisible({ timeout: 15_000 });
    await expect(adminPage.locator('[name="title"]')).toBeVisible();
  });

  test('reaches the create view from the list create button', async ({ adminPage }) => {
    await adminPage.goto('/admin/releases');

    await adminPage.getByRole('button', { name: /create release/i }).click();

    await expect(adminPage).toHaveURL(/\/admin\/releases\/new$/);
  });

  test('opens the edit view for a seeded release from the list', async ({ adminPage }) => {
    await adminPage.goto('/admin/releases');

    const editLink = adminPage.getByRole('link', { name: /edit/i }).first();
    await expect(editLink).toBeVisible({ timeout: 15_000 });
    await editLink.click();

    await expect(adminPage).toHaveURL(/\/admin\/releases\/[a-f0-9]{24}$/);
    await expect(
      adminPage.locator('[data-slot="card-title"]', { hasText: 'Edit Release' })
    ).toBeVisible({ timeout: 15_000 });
  });

  test('Generate notes fills the field when BIO_GENERATOR_FAKE is true', async ({ adminPage }) => {
    await adminPage.goto('/admin/releases/new');

    // Disabled until BOTH a title and a credited artist exist — the
    // synthesized notes must name the artist, so a title alone is not enough.
    const generateBtn = adminPage.getByRole('button', { name: 'Generate notes' });
    await expect(generateBtn).toBeVisible({ timeout: 15_000 });
    await expect(generateBtn).toBeDisabled();

    await adminPage.locator('[name="title"]').fill('Test Release Title');
    await expect(generateBtn).toBeDisabled();

    await adminPage.getByRole('combobox', { name: 'Artists' }).click();
    await adminPage.getByPlaceholder('Search artists...').first().fill('Test Artist');
    const artistOption = adminPage.getByRole('option', { name: 'Test Artist One' });
    await expect(artistOption).toBeVisible({ timeout: 5_000 });
    await artistOption.click();
    await adminPage.keyboard.press('Escape');

    // The name is resolved through a per-artist fetch, so the button only
    // enables once that lands.
    await expect(generateBtn).toBeEnabled({ timeout: 10_000 });

    const notes = adminPage.getByLabel('Release Notes');
    await expect(notes).toHaveValue('');

    // With BIO_GENERATOR_FAKE=true the fake lookup interpolates the title and
    // artist into deterministic paragraphs carrying an attributed quote.
    await generateBtn.click();
    await expect(notes).toHaveValue(/Test Release Title/, { timeout: 10_000 });
    await expect(notes).toHaveValue(/Test Artist One/);
    await expect(notes).toHaveValue(/Tape Deck Quarterly/);
    // Paragraphs round-trip blank-line separated, one note per line on save.
    await expect(notes).toHaveValue(/\n\n/);
  });
});
