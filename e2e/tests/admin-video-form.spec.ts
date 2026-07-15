/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../fixtures/auth.fixture';

/**
 * E2E coverage for the admin "New Video" form (`/admin/videos/new`).
 *
 * Form-validation only: E2E has no S3, so no real upload is attempted. The specs
 * assert the form renders, that an empty submit surfaces the required-field
 * errors plus the missing-upload blocker, that the category radios select, that
 * the Music category is pre-checked on load (Task 2), that the artist comboboxes
 * and producer combobox behave correctly (Tasks 14/15/9), and that the
 * "Find release date" button fills the date field when BIO_GENERATOR_FAKE=true
 * (Task 21).
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
    await expect(adminPage.getByText('Release date', { exact: true })).toBeVisible();
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

  // ── Task 2: Music is the default ───────────────────────────────────────────

  test('Music category is pre-checked on load without any interaction (Task 2)', async ({
    adminPage,
  }) => {
    await adminPage.goto('/admin/videos/new');

    // The form defaults category to 'MUSIC' (buildVideoDefaults), so the Music
    // radio must be checked immediately on load — no click required.
    await expect(adminPage.getByRole('radio', { name: 'Music' })).toBeChecked();
    await expect(adminPage.getByRole('radio', { name: 'Informational' })).not.toBeChecked();
  });

  // ── Task 22: Save + Publish buttons render for a new (draft) video ──────────

  test('both Save and Publish buttons render for a new video (Task 22)', async ({ adminPage }) => {
    await adminPage.goto('/admin/videos/new');

    // The form footer renders Save (primary, type=submit) + Publish (secondary,
    // type=submit with an onClick handler that sets the intent to 'publish') for
    // a new (draft-mode) video. Unpublish is absent — that only appears in edit
    // mode once the video already has a publishedAt.
    await expect(adminPage.getByRole('button', { name: 'Save' })).toBeVisible();
    await expect(adminPage.getByRole('button', { name: 'Publish' })).toBeVisible();
    await expect(adminPage.getByRole('button', { name: 'Unpublish' })).toHaveCount(0);
  });

  // ── Tasks 14 + 15: Artist / Creator combobox + Featured combobox ───────────

  test('Artist / Creator combobox is present and Featured combobox is disabled until primary is set (Tasks 14+15)', async ({
    adminPage,
  }) => {
    await adminPage.goto('/admin/videos/new');

    // The primary artist control is a combobox trigger labelled "Artist / Creator"
    // (ArtistSearchCombobox). The FormLabel renders the label text as a <label>;
    // the trigger carries role="combobox".
    const artistLabel = adminPage.getByText('Artist / Creator');
    await expect(artistLabel).toBeVisible();

    // The Featured artists combobox trigger is disabled until primary is set.
    // The FeaturedArtistsCombobox renders a <Button role="combobox"> whose
    // `disabled` prop is `primary.trim() === ''`. Its accessible name comes
    // from the <label htmlFor={triggerId}>Featured artists</label> linkage.
    const featuredTrigger = adminPage.getByRole('combobox', { name: 'Featured artists' });
    await expect(featuredTrigger).toBeDisabled();

    // Open the primary artist popover and type a name to exercise the combobox.
    // The seeded "Test Artist One" will appear in the search results from the
    // artist list API. The primary trigger's accessible name is "Artist / Creator"
    // (linked via <label htmlFor={triggerId}>) — this is stable regardless of
    // which artist is selected (unlike hasText which changes on selection).
    const primaryTrigger = adminPage.getByRole('combobox', { name: 'Artist / Creator' });
    await primaryTrigger.click();

    // Type in the combobox input to filter results.
    const comboboxInput = adminPage.getByPlaceholder('Search artists…').first();
    await comboboxInput.fill('Test Artist');
    // Wait for the API response and select the first match.
    const artistOption = adminPage.getByRole('option', { name: 'Test Artist One' });
    await expect(artistOption).toBeVisible({ timeout: 5_000 });
    await artistOption.click();

    // After selection the trigger shows the chosen name (accessible name is
    // still "Artist / Creator" — the label does not change).
    await expect(primaryTrigger).toContainText('Test Artist One');

    // Featured combobox should now be enabled.
    await expect(featuredTrigger).toBeEnabled();
  });

  test('Featured artists combobox accepts a free-text name and shows a removable pill (Task 15)', async ({
    adminPage,
  }) => {
    await adminPage.goto('/admin/videos/new');

    // Set a primary artist first to enable the featured combobox.
    // Use the stable accessible name rather than hasText (which changes on select).
    const primaryTrigger = adminPage.getByRole('combobox', { name: 'Artist / Creator' });
    await primaryTrigger.click();

    const primaryInput = adminPage.getByPlaceholder('Search artists…').first();
    await primaryInput.fill('Test Artist One');
    const artistOption = adminPage.getByRole('option', { name: 'Test Artist One' });
    await expect(artistOption).toBeVisible({ timeout: 5_000 });
    await artistOption.click();

    // Now open the featured combobox and add a free-text featured artist name.
    // Stable accessible name via <label htmlFor> → "Featured artists".
    const featuredTrigger = adminPage.getByRole('combobox', { name: 'Featured artists' });
    await featuredTrigger.click();

    const featuredInput = adminPage.getByPlaceholder('Search featured artists…');
    await featuredInput.fill('E2E Featured Guest');

    // The "Add" option appears for a name with no exact DB match.
    const addOption = adminPage.getByRole('option', { name: /Add "E2E Featured Guest"/i });
    await expect(addOption).toBeVisible({ timeout: 5_000 });
    await addOption.click();

    // A pill with the name appears in the Selected featured artists list.
    const pillsList = adminPage.getByRole('list', { name: 'Selected featured artists' });
    await expect(pillsList.getByText('E2E Featured Guest')).toBeVisible();

    // The pill has a remove button.
    const removeBtn = adminPage.getByRole('button', { name: 'Remove E2E Featured Guest' });
    await expect(removeBtn).toBeVisible();
  });

  // ── Task 9: Producers combobox ────────────────────────────────────────────

  test('Producers combobox: search a seeded producer + add a free-text producer, then remove one (Task 9)', async ({
    adminPage,
  }) => {
    await adminPage.goto('/admin/videos/new');

    // The Producers section heading and its combobox trigger should be present.
    await expect(adminPage.getByRole('heading', { name: 'Producers' })).toBeVisible();

    // Use stable accessible name (label→id link); trigger text changes after
    // a producer is added ("1 producers selected") so hasText would go stale.
    const producerTrigger = adminPage.getByRole('combobox', { name: 'Producers' });
    await expect(producerTrigger).toBeVisible();
    await producerTrigger.click();

    // Search for the seeded producer "E2E Producer One".
    const producerInput = adminPage.getByPlaceholder('Search producers…');
    await producerInput.fill('E2E Producer');
    const seededOption = adminPage.getByRole('option', { name: 'E2E Producer One' });
    await expect(seededOption).toBeVisible({ timeout: 5_000 });
    await seededOption.click();

    // The seeded producer pill appears.
    const pillsList = adminPage.getByRole('list', { name: 'Selected producers' });
    await expect(pillsList.getByText('E2E Producer One')).toBeVisible();

    // Re-open the combobox and add a free-text producer (no DB match).
    await producerTrigger.click();
    await producerInput.fill('Brand New Producer');
    const addNewOption = adminPage.getByRole('option', { name: /Add "Brand New Producer"/i });
    await expect(addNewOption).toBeVisible({ timeout: 5_000 });
    await addNewOption.click();

    // Both pills are now visible.
    await expect(pillsList.getByText('E2E Producer One')).toBeVisible();
    await expect(pillsList.getByText('Brand New Producer')).toBeVisible();

    // Remove the free-text producer.
    const removeBtn = adminPage.getByRole('button', { name: 'Remove Brand New Producer' });
    await removeBtn.click();

    // The removed pill is gone; the seeded one remains.
    await expect(pillsList.getByText('Brand New Producer')).toHaveCount(0);
    await expect(pillsList.getByText('E2E Producer One')).toBeVisible();
  });

  // ── Task 21: Find release date button ────────────────────────────────────

  test('Find release date fills the date field when BIO_GENERATOR_FAKE is true (Task 21)', async ({
    adminPage,
  }) => {
    await adminPage.goto('/admin/videos/new');

    // The button is disabled when the title is empty.
    const findBtn = adminPage.getByRole('button', { name: 'Find release date' });
    await expect(findBtn).toBeDisabled();

    // Fill the title — the button becomes enabled.
    await adminPage.getByLabel('Title').fill('Test Video Title');
    await expect(findBtn).toBeEnabled();

    // The date input is initially empty.
    const dateInput = adminPage.getByPlaceholder('mm/dd/yyyy').first();
    await expect(dateInput).toHaveValue('');

    // Click the button. With BIO_GENERATOR_FAKE=true the fake lookup returns
    // releasedOn: '2020-06-01', which the DatePicker formats as '06/01/2020'.
    await findBtn.click();

    // Wait for the async lookup to complete and the field to be filled.
    // Codec-agnostic: we assert the value changed from empty, not a specific toast.
    await expect(dateInput).not.toHaveValue('', { timeout: 10_000 });
    // Verify it is exactly the fixture date (locale-independent input value).
    await expect(dateInput).toHaveValue('06/01/2020');
  });
});
