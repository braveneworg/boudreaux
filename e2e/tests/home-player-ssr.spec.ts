/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { expect, test } from '../fixtures/base.fixture';

/**
 * Regression guard for the desktop LCP fix: the featured-artists player must
 * be present in the server-rendered HTML payload. With `ssr: false` on the
 * player's dynamic import (the old behavior), none of this markup exists in
 * the response — the cover art was undiscoverable until the JS chunk chain
 * hydrated, costing ~1.4s of measured LCP load delay.
 *
 * Asserts on the raw response body (not the rendered DOM): the home route
 * streams through the `loading.tsx` Suspense boundary, so the player arrives
 * as a hidden segment swapped in by inline scripts. The byte stream is what
 * the browser's preload scanner reads, so it is the right layer to guard.
 */
test.describe('home player SSR', () => {
  test('serves the player shell in the initial HTML payload', async ({ page }) => {
    const response = await page.request.get('/');
    expect(response.ok()).toBe(true);

    const html = await response.text();

    // The interactive cover art — the desktop LCP element — ships as markup:
    // its play/pause button and the <img> for the seeded featured artist.
    // (The now-playing <h2> is unit-covered; it needs a featured digital
    // format, which the seed does not link — see seed-test-db.ts.)
    expect(html).toContain('aria-label="Play"');
    expect(html).toContain('alt="E2E Featured Artist"');
  });
});
