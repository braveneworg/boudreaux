/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { test, expect } from '../fixtures/base.fixture';

/**
 * The on-site Merch placeholder was retired for the external shirt store.
 * Old links to /merch must land on the store, not the 404 page. The redirect
 * is read without following it, so the spec never leaves the site.
 */
test.describe('Merch redirect', () => {
  test('permanently redirects the retired /merch page to the shirt store', async ({ request }) => {
    const response = await request.get('/merch', { maxRedirects: 0 });

    expect(response.status()).toBe(308);
    expect(response.headers()['location']).toBe('https://fakefourshirts.com/');
  });
});
