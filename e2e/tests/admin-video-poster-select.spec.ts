/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../fixtures/auth.fixture';
import { resetVideoPosterUrl } from '../helpers/e2e-db';
import { POSTER_CANDIDATE_FRAMES, POSTER_CANDIDATES_VIDEO_ID } from '../helpers/seed-test-db';

/**
 * E2E coverage for picking a STORED poster candidate on an existing video.
 *
 * The seed gives 'E2E Video Golf' (POSTER_CANDIDATES_VIDEO_ID) three
 * `posterCandidates` and a null `posterUrl`. Opening its edit page with no
 * capture this session puts the poster strip in *hydrated* mode: it renders the
 * stored frames and checks whichever one the live `posterUrl` points at — none,
 * initially. Clicking a thumb persists instantly through
 * `selectVideoPosterAction` (no Save step), so the proof is the success toast
 * plus the checked radio surviving a full reload — i.e. the pick round-tripped
 * through the database, not just React state.
 *
 * The edit page is reached by direct URL (the pinned seed id) like the
 * enrichment and artist-review specs, rather than paging the admin list, whose
 * "Load More" footer auto-loads and cannot be clicked reliably.
 *
 * Parallel safety: this is the only spec that mutates Golf, and it touches only
 * `posterUrl` — the listing specs (videos / admin-videos-list) assert Golf's
 * title, ordering, and the row counts, never its poster, and no row is created
 * or removed, so no count-pinning assertion can ripple. `finally` restores the
 * seeded null so reruns and retries start from "nothing checked".
 */

/** Radio accessible names are `Frame at {atSeconds.toFixed(1)}s` (VideoPosterSection). */
const frameLabel = (atSeconds: number): string => `Frame at ${atSeconds.toFixed(1)}s`;

/** The middle stored frame — the one the spec picks. */
const PICKED_FRAME = POSTER_CANDIDATE_FRAMES[1];

test.describe('Admin video poster select — stored candidates', () => {
  test('strip hydrates from stored candidates and a click persists', async ({ adminPage }) => {
    try {
      await adminPage.goto(`/admin/videos/${POSTER_CANDIDATES_VIDEO_ID}`);

      // The form hydrates from the video query before the strip can render.
      await expect(adminPage.getByRole('heading', { name: 'Poster' })).toBeVisible({
        timeout: 15_000,
      });

      const strip = adminPage.getByRole('radiogroup', { name: 'Captured poster frames' });
      await expect(strip).toBeVisible();
      await expect(strip.getByRole('radio')).toHaveCount(POSTER_CANDIDATE_FRAMES.length);

      // posterUrl is null in the seed, so no stored candidate matches it → the
      // strip highlights nothing (selectedIndex -1).
      await expect(strip.getByRole('radio', { checked: true })).toHaveCount(0);

      await strip.getByRole('radio', { name: frameLabel(PICKED_FRAME.atSeconds) }).click();

      // Instant persist — the success toast is the Server Action's ack.
      await expect(adminPage.getByText('Poster updated.')).toBeVisible({ timeout: 15_000 });
      await expect(
        strip.getByRole('radio', { name: frameLabel(PICKED_FRAME.atSeconds) })
      ).toBeChecked();

      // The real assertion: a full reload re-reads the row from the database,
      // so the pick can only still be checked if it was written there.
      await adminPage.reload();

      const reloadedStrip = adminPage.getByRole('radiogroup', {
        name: 'Captured poster frames',
      });
      await expect(
        reloadedStrip.getByRole('radio', { name: frameLabel(PICKED_FRAME.atSeconds) })
      ).toBeChecked({ timeout: 15_000 });
      // Exactly one thumb is checked — the pick replaced "none", not added to it.
      await expect(reloadedStrip.getByRole('radio', { checked: true })).toHaveCount(1);
    } finally {
      // Restore the seeded null so a rerun (or a CI retry) sees "nothing checked".
      await resetVideoPosterUrl(POSTER_CANDIDATES_VIDEO_ID);
    }
  });
});
