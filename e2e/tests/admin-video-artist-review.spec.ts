/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../fixtures/auth.fixture';
import { REVIEW_VIDEO_ID } from '../helpers/seed-test-db';

/**
 * E2E coverage for the video artist-review flow and the probe-metadata
 * endpoint contract.
 *
 * The review section debounces 400ms then fires a name-lookup query. All
 * assertions use web-first matchers — no fixed sleeps. Artist creation runs
 * server-side in `after()` post-response, so new artists are asserted via
 * expect.poll against GET /api/artists.
 *
 * Parallel safety: the spec uses REVIEW_VIDEO_ID (dedicated, archived) and
 * the seeded 'E2E Review Lead' artist (matched by displayName string, not ID).
 * The new artist "Zora Quill Brandt" is created only inside the single
 * edit-flow test and carries a unique displayName no other spec seeds or reads.
 */

/** Artist field label text in the video metadata section. */
const ARTIST_LABEL = 'Artist / Creator';

/** displayName of the seeded artist the lookup should match. */
const EXISTING_ARTIST_NAME = 'E2E Review Lead';

/** A valid 24-char hex OID (matches REVIEW_VIDEO_ID pattern). */
const VALID_OID = REVIEW_VIDEO_ID;

test.describe('Admin video artist-review — edit-page flow', () => {
  test('matched chip + new-artist block + persistence after save', async ({ adminPage }) => {
    // Artist sync runs server-side in after() post-response — budget extra time.
    test.slow();

    await adminPage.goto(`/admin/videos/${REVIEW_VIDEO_ID}`);

    // Wait for the form to hydrate — field must be visible and non-empty before
    // interacting (avoids asserting a specific seeded value that mutates on save,
    // which would cause this test to fail deterministically on a CI retry).
    const artistField = adminPage.getByLabel(ARTIST_LABEL);
    await expect(artistField).toBeVisible({ timeout: 10_000 });
    await expect(artistField).not.toHaveValue('', { timeout: 10_000 });

    // Replace the artist string with a mixed name: one that matches an existing
    // artist plus a new featured artist.
    await artistField.fill('');
    await artistField.fill(`${EXISTING_ARTIST_NAME} feat. Zora Quill Brandt`);

    // Wait for the 400ms debounce + lookup round-trip.
    const reviewSection = adminPage.getByTestId('video-artist-review-section');
    await expect(reviewSection).toBeVisible({ timeout: 5_000 });

    // Existing-artist chip should link to the matched artist.
    const chip = reviewSection.getByRole('link', {
      name: `Links to existing artist ${EXISTING_ARTIST_NAME}`,
    });
    await expect(chip).toBeVisible({ timeout: 5_000 });

    // New-artist block should appear with pre-filled name parts.
    await expect(reviewSection.getByText('Zora Quill Brandt')).toBeVisible();
    const firstInput = reviewSection.getByRole('textbox', { name: 'First name' });
    const middleInput = reviewSection.getByRole('textbox', { name: 'Middle name' });
    const surnameInput = reviewSection.getByRole('textbox', { name: 'Surname' });
    const displayInput = reviewSection.getByRole('textbox', { name: 'Display name' });

    await expect(firstInput).toHaveValue('Zora');
    await expect(middleInput).toHaveValue('Quill');
    await expect(surnameInput).toHaveValue('Brandt');
    await expect(displayInput).toHaveValue('Zora Quill Brandt');

    // Admin edits the middle name.
    await middleInput.fill('Quill-Edited');

    // Save the form.
    await adminPage.getByRole('button', { name: 'Save' }).click();

    // The action redirects to /admin/videos on success — wait for navigation.
    await expect(adminPage).toHaveURL('/admin/videos', { timeout: 15_000 });

    // Verify persistence: artist sync runs in after() post-response, so poll.
    await expect
      .poll(
        async () => {
          const resp = await adminPage.request.get('/api/artists?search=Zora');
          if (!resp.ok()) return null;
          const body = (await resp.json()) as {
            rows: Array<{
              firstName?: string;
              middleName?: string;
              surname?: string;
            }>;
          };
          return body.rows.find(
            (r) =>
              r.firstName === 'Zora' && r.middleName === 'Quill-Edited' && r.surname === 'Brandt'
          );
        },
        { timeout: 20_000, intervals: [500, 1000, 2000] }
      )
      .toBeTruthy();
  });

  test('exact existing name → chip only, no new-artist block', async ({ adminPage }) => {
    await adminPage.goto(`/admin/videos/${REVIEW_VIDEO_ID}`);

    // Wait for the form to hydrate before interacting (the artist field may hold
    // any previously-saved value — reset it to the exact existing name to ensure
    // the lookup fires cleanly with a single known name).
    const artistField = adminPage.getByLabel(ARTIST_LABEL);
    await expect(artistField).toBeVisible({ timeout: 10_000 });

    // Clear and fill with the exact existing artist name.
    await artistField.fill('');
    await artistField.fill(EXISTING_ARTIST_NAME);

    const reviewSection = adminPage.getByTestId('video-artist-review-section');
    await expect(reviewSection).toBeVisible({ timeout: 5_000 });

    // Chip renders for the matched artist.
    await expect(
      reviewSection.getByRole('link', {
        name: `Links to existing artist ${EXISTING_ARTIST_NAME}`,
      })
    ).toBeVisible({ timeout: 5_000 });

    // No new-artist block (no unmatched names).
    await expect(reviewSection.getByRole('textbox', { name: 'First name' })).toHaveCount(0);
  });
});

test.describe('Admin video — probe-metadata endpoint contract', () => {
  test('valid videoId + matching s3Key → 200 with fixture tags', async ({ adminPage }) => {
    // The E2E server runs BIO_GENERATOR_FAKE=true so VideoProbeService.probeForPrefill
    // short-circuits to videoProbeFixture instead of spawning ffprobe.
    const resp = await adminPage.request.get(
      `/api/videos/probe-metadata?videoId=${VALID_OID}&s3Key=media/videos/${VALID_OID}/review-video.mp4`
    );
    expect(resp.status()).toBe(200);

    const body = (await resp.json()) as {
      ok: boolean;
      tags?: {
        title?: string;
        artist?: string;
        releasedOn?: string;
        description?: string;
        durationSeconds?: number;
      };
    };
    expect(body.ok).toBe(true);
    expect(body.tags?.title).toBe('E2E Probe Title');
    expect(body.tags?.artist).toBe('E2E Probe Artist');
    // date tag '2019-08-01' → releasedOn after parseReleasedOn (ISO truncation).
    expect(body.tags?.releasedOn).toBe('2019-08-01');
    // comment tag 'E2E probe description' → description (primary, falls back from comment).
    expect(body.tags?.description).toBe('E2E probe description');
    expect(body.tags?.durationSeconds).toBe(245);
  });

  test('out-of-namespace s3Key → 400', async ({ adminPage }) => {
    // s3Key references a different OID — fails the namespace check.
    const differentOid = '65a1b2c3d4e5f6a7b8c9d2b1';
    const resp = await adminPage.request.get(
      `/api/videos/probe-metadata?videoId=${VALID_OID}&s3Key=media/videos/${differentOid}/clip.mp4`
    );
    expect(resp.status()).toBe(400);
  });
});
