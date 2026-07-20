/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../fixtures/auth.fixture';
import { deleteUnlinkedArtistByDisplayName, deleteVideoCascade } from '../helpers/e2e-db';

/**
 * Keystone E2E for the upload → draft → pre-save enrichment flow.
 *
 * With NEXT_PUBLIC_E2E_MODE/E2E_MODE/BIO_GENERATOR_FAKE all true
 * (playwright.config.ts) the multipart upload short-circuits instantly and
 * offline: picking a file writes the fake s3Key, the filename parser prefills
 * the metadata, and upload-complete creates an UNPUBLISHED draft row whose URL
 * swaps in place to the edit route (history.replaceState — the mounted form
 * survives). The draft's post-save pipeline auto-kicks the fake enrichment,
 * which completes in ~4s with the deterministic videoEnrichmentFixture: a
 * video-level description and a discovered featured artist 'E2E Discovered
 * Feature'. Applying the description fills the form; applying the featured
 * artist appends a feat clause; Save persists via the UPDATE path and the
 * re-kicked artist sync links a FEATURED shell for the discovered name.
 *
 * Parallel safety: this spec CREATES a real (unpublished, non-archived) video
 * mid-run, which the count-pinning specs (admin-dashboard / admin-videos-list)
 * tolerate via `toPass` reload loops. The row is hard-deleted in `finally` via
 * deleteVideoCascade so nothing survives the run.
 */

/** The apply-button accessible name is the aria-label `Apply <field label> suggestion`. */
const APPLY_DESCRIPTION = 'Apply Description suggestion';
const APPLY_FEATURED_ARTIST = 'Apply Featured artist suggestion';

/** The discovered featured artist the fake fixture emits (video-enrichment-fixture.ts). */
const DISCOVERED_FEATURE = 'E2E Discovered Feature';

test.describe('Admin video draft-upload — pre-save enrichment', () => {
  test('upload auto-creates a draft that enriches before the first save', async ({ adminPage }) => {
    // Instant fake upload + a ≥4s fake enrichment dwell + polling + a save
    // round-trip with a re-kicked artist sync — triple the budget.
    test.slow();

    let videoId: string | undefined;
    try {
      await adminPage.goto('/admin/videos/new');
      await expect(adminPage.getByRole('heading', { name: 'Video File' })).toBeVisible();

      // Pick a file on the VIDEO dropzone (scoped so the poster input can't win).
      // Garbage bytes carry no container tags, so prefill falls back to the
      // filename parser: `Artist - Title (feat. Guest) [Official Video]`.
      await adminPage
        .getByTestId('video-dropzone')
        .locator('input[type="file"]')
        .setInputFiles({
          name: 'E2E Draft Artist - E2E Draft Song (feat. E2E Draft Guest) [Official Video].mp4',
          mimeType: 'video/mp4',
          buffer: Buffer.from('e2e-not-a-real-video'),
        });

      // Filename-parser prefill: title stripped of decoration + feat clause.
      // The prefill fans out an async metadata extract before writing the field —
      // widen the wait so it can't lose to heavy parallel load.
      await expect(adminPage.getByLabel('Title')).toHaveValue('E2E Draft Song', {
        timeout: 15_000,
      });

      // Draft created at upload-complete → the URL swaps to the edit route in
      // place (history.replaceState; no navigation).
      await adminPage.waitForURL(/\/admin\/videos\/[0-9a-f]{24}$/);
      videoId = adminPage.url().split('/').pop();
      expect(videoId).toMatch(/^[0-9a-f]{24}$/);

      // The enrichment panel mounts PRE-SAVE (draft row exists + MUSIC default)
      // and the auto-kicked fake run reaches a terminal 'Enriched' state.
      const panel = adminPage.getByTestId('video-enrichment-panel');
      await expect(panel).toBeVisible({ timeout: 15_000 });
      const chip = panel.getByTestId('video-enrichment-status-chip');
      // The auto-kicked fake enrichment dwells ≥4s; widen the terminal-state
      // wait so heavy parallel fake-enrichment contention can't starve it.
      await expect(chip).toHaveText('Enriched', { timeout: 45_000 });

      // The two video-level cards the fixture emits both render.
      const descriptionCard = panel.getByTestId('video-description-suggestion');
      const featuredCard = panel.getByTestId('video-featured-artist-suggestion');
      await expect(descriptionCard).toBeVisible();
      await expect(featuredCard).toBeVisible();

      // Apply the description into the form (client-only; the card flips applied).
      await descriptionCard.getByRole('button', { name: APPLY_DESCRIPTION }).click();
      await expect(adminPage.getByLabel('Description')).toHaveValue(
        /deterministic E2E description/
      );
      await expect(descriptionCard.getByText('Applied', { exact: true })).toBeVisible();

      // Apply the discovered featured artist — the artist string gains its feat
      // clause, so it now appears as a pill in the Selected featured artists list.
      await featuredCard.getByRole('button', { name: APPLY_FEATURED_ARTIST }).click();
      await expect(
        adminPage
          .getByRole('list', { name: 'Selected featured artists' })
          .getByText(DISCOVERED_FEATURE)
      ).toBeVisible();

      // Save persists through the UPDATE path (a draft row exists) and returns
      // to the list. The update mutation re-kicks a server-side artist sync, so
      // widen the navigation wait against heavy parallel server load.
      await adminPage.getByRole('button', { name: 'Save', exact: true }).click();
      await adminPage.waitForURL(/\/admin\/videos$/, { timeout: 30_000 });

      // The applied featured artist became a linked FEATURED shell — artist sync
      // runs server-side post-response, so poll the artists search endpoint.
      await expect(async () => {
        const response = await adminPage.request.get(
          `/api/artists?search=${encodeURIComponent(DISCOVERED_FEATURE)}`
        );
        expect(response.ok()).toBe(true);
        const body = await response.json();
        expect(JSON.stringify(body)).toContain(DISCOVERED_FEATURE);
      }).toPass({ timeout: 20_000 });
    } finally {
      if (videoId) await deleteVideoCascade(videoId);
      await deleteUnlinkedArtistByDisplayName(DISCOVERED_FEATURE);
    }
  });

  test('a blank-artist draft disables Run enrichment with a hint', async ({ adminPage }) => {
    let videoId: string | undefined;
    try {
      await adminPage.goto('/admin/videos/new');
      await expect(adminPage.getByRole('heading', { name: 'Video File' })).toBeVisible();

      // No `Artist - ` prefix → the filename parser yields artist: null, so
      // the draft row persists a BLANK artist and no enrichment auto-kicks.
      await adminPage
        .getByTestId('video-dropzone')
        .locator('input[type="file"]')
        .setInputFiles({
          name: 'E2E Gate Song.mp4',
          mimeType: 'video/mp4',
          buffer: Buffer.from('e2e-not-a-real-video'),
        });

      await expect(adminPage.getByLabel('Title')).toHaveValue('E2E Gate Song', {
        timeout: 15_000,
      });
      await adminPage.waitForURL(/\/admin\/videos\/[0-9a-f]{24}$/);
      videoId = adminPage.url().split('/').pop();
      expect(videoId).toMatch(/^[0-9a-f]{24}$/);

      // The fake probe's container tags carry 'E2E Probe Artist', which the
      // client-side only-if-empty prefill writes into the LIVE Artist field —
      // so immediately post-upload the gate is legitimately open. Wait for
      // that prefill (proving the draft + probe round-trip completed), then
      // reload: the edit page rehydrates from the persisted row (artist '' —
      // the production shape when container tags lack an artist) and the
      // probe-prefill query never runs outside a fresh upload.
      const artistTrigger = adminPage.getByRole('combobox', { name: 'Artist / Creator' });
      await expect(artistTrigger).toContainText('E2E Probe Artist', { timeout: 15_000 });
      await adminPage.reload();

      // Rehydrated from the row: the artist combobox is back to its blank
      // placeholder (the persisted draft artist really is '').
      await expect(artistTrigger).toContainText('Search or type an artist', { timeout: 15_000 });

      // The panel mounts (draft + MUSIC default) but the gate holds: Run is
      // disabled, the hint shows, and no auto-kick ever engaged the status.
      const panel = adminPage.getByTestId('video-enrichment-panel');
      await expect(panel).toBeVisible({ timeout: 15_000 });
      await expect(panel.getByRole('button', { name: 'Run enrichment' })).toBeDisabled();
      await expect(
        panel.getByText('Add an artist or creator to enable web enrichment.')
      ).toBeVisible();
      await expect(panel.getByTestId('video-enrichment-status-chip')).toHaveText('Not enriched');
    } finally {
      if (videoId) {
        await deleteVideoCascade(videoId);
      }
    }
  });
});
