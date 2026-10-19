/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { test, expect } from '../fixtures/base.fixture';

import type { Page } from '@playwright/test';

const CDN_HOST = 'cdn.fakefourrecords.com';

/**
 * Open the seeded artist page and prove its CDN bio image is answered by the
 * local fixture: a PNG with status 200 that the browser decodes.
 */
const expectInlineBioImageServedLocally = async (page: Page): Promise<void> => {
  const cdnResponse = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.host === CDN_HOST && url.pathname.includes('/artists/e2e-artist/bio/inline');
  });

  await page.goto('/artists/e2e-artist');

  const inlineImage = page.getByRole('img', { name: 'E2E inline bio image' });
  await inlineImage.scrollIntoViewIfNeeded();

  const response = await cdnResponse;
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toBe('image/png');

  await expect
    .poll(() => inlineImage.evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
};

test.describe('CDN fixture', () => {
  test('answers CDN images locally for the anonymous page', async ({ page }) => {
    await expectInlineBioImageServedLocally(page);
  });

  test('answers CDN images locally for a fixture-built context', async ({ adminPage }) => {
    await expectInlineBioImageServedLocally(adminPage);
  });
});
