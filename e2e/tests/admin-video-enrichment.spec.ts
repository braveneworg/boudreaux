/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../fixtures/auth.fixture';
import { ENRICH_INFO_VIDEO_ID, ENRICH_MUSIC_VIDEO_ID } from '../helpers/seed-test-db';

/**
 * E2E coverage for the video web-enrichment flow. The web server runs with
 * BIO_GENERATOR_FAKE=true (playwright.config.ts), so Run enrichment writes the
 * deterministic videoEnrichmentFixture suggestions instead of invoking the
 * Lambda: per artist bornOn 1985-03-15 (high) + akaNames 'E2E Alias' (medium)
 * with musicbrainz.org sources, and releasedOn 2020-06-01 (medium).
 *
 * Parallel safety: both videos, both shell artists, and every suggestion row
 * touched here are DEDICATED to this spec (unique 'E2E Enrich' titles/names,
 * archived so no listing spec ever sees them); no deleteMany anywhere.
 */

test.describe('Admin video enrichment', () => {
  // One sequential flow: run → suggestions → apply → verify on artist →
  // re-run. Split tests would race each other against the same video row.
  test('runs, applies a suggestion, verifies it, and re-runs', async ({ adminPage }) => {
    // Two fake enrichment runs (≥4s pause each) + 2.5s polling + a page
    // round-trip to the artist editor — triple the budget like the bio spec.
    test.slow();

    await adminPage.goto(`/admin/videos/${ENRICH_MUSIC_VIDEO_ID}`);

    // The technical card renders from the seeded probe scalars for ALL
    // categories — this is the MUSIC instance. The seed pins the same values
    // the fake probe re-persists on every Run, so these hold across retries.
    const techCard = adminPage.getByTestId('video-technical-metadata-card');
    await expect(techCard).toBeVisible({ timeout: 15_000 });
    await expect(techCard.getByText('1920×1080')).toBeVisible();
    await expect(techCard.getByText('4.8 Mbps')).toBeVisible();
    // 23.976 rounds to 2dp for display (formatFrameRate → Number(x.toFixed(2))).
    await expect(techCard.getByText('23.98 fps')).toBeVisible();

    const panel = adminPage.getByTestId('video-enrichment-panel');
    await expect(panel).toBeVisible();
    const chip = panel.getByTestId('video-enrichment-status-chip');
    await expect(chip).toHaveText('Not enriched');

    await panel.getByRole('button', { name: 'Run enrichment' }).click();

    // In-flight indicator: the fake path pauses ≥4s before completing, so
    // the 2.5s poll observes the pending/processing chip at least once.
    await expect(chip).toHaveText('Enriching…', { timeout: 20_000 });

    // Terminal success, then one suggestion card per seeded VideoArtist.
    await expect(chip).toHaveText('Enriched', { timeout: 30_000 });
    const cards = panel.getByTestId('video-artist-suggestion-card');
    await expect(cards).toHaveCount(2);

    const leadCard = cards.filter({
      has: adminPage.getByRole('link', { name: 'E2E Enrich Lead' }),
    });
    await expect(leadCard).toHaveCount(1);

    // Fixture values on the lead card: suggested DOB + high confidence +
    // MusicBrainz source; the release-date suggestion renders separately.
    await expect(leadCard.getByText('1985-03-15')).toBeVisible();
    await expect(leadCard.getByText('High', { exact: true })).toBeVisible();
    await expect(
      panel.getByTestId('video-release-date-suggestion').getByText('2020-06-01')
    ).toBeVisible();

    // Apply the lead's bornOn (pessimistic — the row flips only after the
    // server confirms and the status refetch lands).
    await leadCard.getByRole('button', { name: 'Apply Born on suggestion' }).click();
    await expect(leadCard.getByText('Applied', { exact: true })).toBeVisible({
      timeout: 15_000,
    });

    // Verify on the artist editor via the card's own link (robust to ids).
    await leadCard.getByRole('link', { name: 'E2E Enrich Lead' }).click();
    await expect(adminPage).toHaveURL(/\/admin\/artists\/[a-f0-9]{24}$/);
    const datesSection = adminPage.locator('section', {
      has: adminPage.getByRole('heading', { name: 'Important Dates' }),
    });
    // bornOn is the FIRST date field in Important Dates; the DatePicker
    // formats 'YYYY-MM-DD' at local midnight, so this is TZ-independent.
    await expect(datesSection.getByPlaceholder('mm/dd/yyyy').first()).toHaveValue('03/15/1985', {
      timeout: 15_000,
    });

    // Back to the video: the enrichment state is persisted.
    await adminPage.goto(`/admin/videos/${ENRICH_MUSIC_VIDEO_ID}`);
    await expect(chip).toHaveText('Enriched', { timeout: 15_000 });

    // Re-run goes through the AlertDialog and completes a second run.
    await panel.getByRole('button', { name: 'Re-run enrichment' }).click();
    const dialog = adminPage.getByRole('alertdialog');
    await expect(dialog.getByText('Re-run enrichment?')).toBeVisible();
    await dialog.getByRole('button', { name: 'Re-run', exact: true }).click();

    await expect(chip).toHaveText('Enriching…', { timeout: 20_000 });
    await expect(chip).toHaveText('Enriched', { timeout: 30_000 });

    // The earlier apply survives the re-run: applied rows are fenced —
    // only pending rows get replaced.
    await expect(leadCard.getByText('Applied', { exact: true })).toBeVisible();
  });

  test('an informational video shows probe data but never the panel', async ({ adminPage }) => {
    await adminPage.goto(`/admin/videos/${ENRICH_INFO_VIDEO_ID}`);

    await expect(adminPage.getByTestId('video-technical-metadata-card')).toBeVisible({
      timeout: 15_000,
    });
    // Absent from the DOM entirely — not merely hidden (toHaveCount counts
    // hidden elements, so 0 is the only safe assertion).
    await expect(adminPage.getByTestId('video-enrichment-panel')).toHaveCount(0);
  });
});
