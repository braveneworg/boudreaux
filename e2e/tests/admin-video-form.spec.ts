/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../fixtures/auth.fixture';

/**
 * E2E coverage for the admin "New Video" form (`/admin/videos/new`, Task 10).
 *
 * Form-validation only: E2E has no S3, so no real upload is attempted. The specs
 * assert the form renders, that an empty submit surfaces the required-field
 * errors plus the missing-upload blocker, and that the category radios select.
 */

test.describe('Admin video form — create', () => {
  test('renders the upload dropzone, metadata fields, poster, publish date, and save', async ({
    adminPage,
  }) => {
    await adminPage.goto('/admin/videos/new');

    // The "New Video" CardTitle is a styled div, not a heading — assert the
    // first real section heading instead to confirm the form mounted.
    await expect(adminPage.getByRole('heading', { name: 'Video File' })).toBeVisible();

    // Video file section: the dashed dropzone and its picker label.
    await expect(adminPage.getByTestId('video-dropzone')).toBeVisible();
    await expect(adminPage.getByText('Choose a video file')).toBeVisible();

    // Metadata fields.
    await expect(adminPage.getByLabel('Title')).toBeVisible();
    await expect(adminPage.getByLabel('Artist / Creator')).toBeVisible();
    await expect(adminPage.getByRole('radio', { name: 'Music' })).toBeVisible();
    await expect(adminPage.getByRole('radio', { name: 'Informational' })).toBeVisible();
    await expect(adminPage.getByText('Release date')).toBeVisible();
    await expect(adminPage.getByLabel('Duration (seconds)')).toBeVisible();
    await expect(adminPage.getByLabel('Description')).toBeVisible();

    // Poster and publish sections plus the footer action.
    await expect(adminPage.getByRole('heading', { name: 'Poster' })).toBeVisible();
    await expect(adminPage.getByText('Publish date')).toBeVisible();
    await expect(adminPage.getByRole('button', { name: 'Save' })).toBeVisible();

    // No upload yet → the save-blocker guidance is shown.
    await expect(adminPage.getByText('Upload a video file to enable saving.')).toBeVisible();
  });

  test('an empty submit surfaces the required-field errors and the upload blocker', async ({
    adminPage,
  }) => {
    await adminPage.goto('/admin/videos/new');

    await adminPage.getByRole('button', { name: 'Save' }).click();

    await expect(adminPage.getByText('Title is required')).toBeVisible();
    await expect(adminPage.getByText('Artist is required')).toBeVisible();
    await expect(adminPage.getByText('Category must be MUSIC or INFORMATIONAL')).toBeVisible();
    await expect(adminPage.getByText('Release date is required')).toBeVisible();

    // The upload blocker persists because no video file has been uploaded.
    await expect(adminPage.getByText('Upload a video file to enable saving.')).toBeVisible();
  });

  test('the category radio group selects Music and Informational', async ({ adminPage }) => {
    await adminPage.goto('/admin/videos/new');

    const music = adminPage.getByRole('radio', { name: 'Music' });
    const informational = adminPage.getByRole('radio', { name: 'Informational' });

    await music.click();
    await expect(music).toBeChecked();

    await informational.click();
    await expect(informational).toBeChecked();
    await expect(music).not.toBeChecked();
  });
});
