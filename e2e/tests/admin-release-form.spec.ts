/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../fixtures/auth.fixture';

/**
 * E2E coverage for the release create/edit form views, reached from the
 * releases list, plus the "Generate blurb" button — which fills the description
 * from the fake blurb lookup when BIO_GENERATOR_FAKE=true
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

  test('Generate blurb fills the description when BIO_GENERATOR_FAKE is true', async ({
    adminPage,
  }) => {
    await adminPage.goto('/admin/releases/new');

    // Disabled until BOTH a title and a credited artist exist — the
    // synthesized blurb must name the artist, so a title alone is not enough.
    const generateBtn = adminPage.getByRole('button', { name: 'Generate blurb' });
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

    // The label's own notes are the generator's grounding, so write them first.
    const notes = adminPage.getByLabel('Release Notes');
    await notes.fill('Hand-numbered edition of 300');

    const description = adminPage.getByLabel('Description');
    await expect(description).toHaveValue('');

    // With BIO_GENERATOR_FAKE=true the fake lookup leads with the label note,
    // then interpolates the title and artist into ~500 deterministic chars.
    await generateBtn.click();
    await expect(description).toHaveValue(/Hand-numbered edition of 300\./, { timeout: 10_000 });
    await expect(description).toHaveValue(/Test Release Title/);
    await expect(description).toHaveValue(/Test Artist One/);
    await expect(description).toHaveValue(/Tape Deck Quarterly/);

    // Generating must never touch the label's own writing.
    await expect(notes).toHaveValue('Hand-numbered edition of 300');
  });
});
