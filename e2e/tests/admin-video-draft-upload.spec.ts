/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../fixtures/auth.fixture';
import { deleteUnlinkedArtistByDisplayName, deleteVideoCascade } from '../helpers/e2e-db';

/**
 * Keystone E2E for the upload → draft → pre-save enrichment flow.
 *
 * The multipart upload runs FOR REAL here. With E2E_MODE true
 * (playwright.config.ts) only the S3 calls themselves are substituted, below
 * the four multipart Server Actions: the browser uploader genuinely initiates,
 * presigns a just-in-time batch, PUTs each part slice over its XHR worker pool
 * to a local sink route, collects the returned ETags, and completes — and the
 * `fileSize` the form persists is the size the parts actually delivered. The
 * confirm-time existence check is answered honestly too, from the local store's
 * record of the completed upload. See `src/lib/actions/multipart-local-adapters.ts`.
 *
 * So: picking a file really uploads it, the filename parser prefills the
 * metadata, and upload-complete creates an UNPUBLISHED draft row whose URL
 * swaps in place to the edit route (history.replaceState — the mounted form
 * survives). With BIO_GENERATOR_FAKE true the draft's post-save pipeline
 * auto-kicks the fake enrichment, which completes in ~4s with the
 * deterministic videoEnrichmentFixture: a video-level description and a
 * discovered featured artist 'E2E Discovered Feature'. The draft's
 * description is blank (nothing prefills it from the file), so the server
 * auto-applies the synthesized prose and the panel's editor mirrors it with
 * no click; applying the featured artist appends a feat clause; Save persists
 * via the UPDATE path and the re-kicked artist sync links a FEATURED shell for
 * the discovered name.
 *
 * Parallel safety: this spec CREATES a real (unpublished, non-archived) video
 * mid-run, which the count-pinning specs (admin-dashboard / admin-videos-list)
 * tolerate via `toPass` reload loops. The row is hard-deleted in `finally` via
 * deleteVideoCascade so nothing survives the run.
 */

/** The apply-button accessible name is the aria-label `Apply <field label> suggestion`. */
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

      // The automatic release-date lookup fires as soon as the upload starts
      // (title + artist prefilled, MUSIC, empty date). With BIO_GENERATOR_FAKE
      // the fake lookup always finds 2020-06-01, which the DatePicker shows as
      // 06/01/2020 — and never today: the draft row carries NO date of its own.
      const dateInput = adminPage.getByPlaceholder('mm/dd/yyyy').first();
      await expect(dateInput).toHaveValue('06/01/2020', { timeout: 15_000 });
      await expect(adminPage.getByText('No release date found. Set it manually.')).toHaveCount(0);

      // The found date autosaves onto the draft row through the single-field
      // action — poll the detail route until the day lands.
      await expect(async () => {
        const response = await adminPage.request.get(`/api/videos/${videoId}`);
        expect(response.ok()).toBe(true);
        const body = (await response.json()) as { releasedOn?: string | null };
        expect(body.releasedOn ?? '').toMatch(/^2020-06-01/);
      }).toPass({ timeout: 15_000 });

      // The enrichment panel mounts PRE-SAVE (a draft row exists; every
      // category qualifies) and hosts the only description editor.
      const panel = adminPage.getByTestId('video-enrichment-panel');
      await expect(panel).toBeVisible({ timeout: 15_000 });
      const descriptionEditor = panel.getByLabel('Description', { exact: true });

      // The auto-kicked fake run reaches a terminal 'Enriched' state. It
      // dwells ≥4s; widen the terminal-state wait so heavy parallel
      // fake-enrichment contention can't starve it.
      const chip = panel.getByTestId('video-enrichment-status-chip');
      await expect(chip).toHaveText('Enriched', { timeout: 45_000 });

      // Nothing prefills a description from the file (the fake probe's comment
      // tag is ignored) and nothing synthesizes one outside enrichment, so the
      // draft row was blank when the run completed: the server auto-applied
      // the synthesized prose and the panel's editor mirrors it — no click.
      // An applied description row renders no card at all.
      await expect(descriptionEditor).toHaveValue(/deterministic E2E description/, {
        timeout: 15_000,
      });
      await expect(panel.getByTestId('video-description-suggestion')).toHaveCount(0);

      // The discovered featured artist still renders as a pending card.
      const featuredCard = panel.getByTestId('video-featured-artist-suggestion');
      await expect(featuredCard).toBeVisible();

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
