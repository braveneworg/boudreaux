/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { expect, test } from '../fixtures/base.fixture';

/**
 * The site's text is Jost. Unit specs prove the theme compiles and the layout
 * carries the font variable; only the browser proves the cascade — for months
 * body computed to Jost while every paragraph under ContentContainer's
 * `font-sans` rendered in the system stack. Measure the text, not the body.
 */
test.describe('site font', () => {
  test('page text computes to Jost, not the system stack', async ({ page }) => {
    await page.goto('/about');
    await page.evaluate(() => document.fonts.ready);

    const paragraph = page.locator('#main-content p').first();
    await expect(paragraph).toBeVisible();

    const fontFamily = await paragraph.evaluate((el) => getComputedStyle(el).fontFamily);
    expect(fontFamily).toMatch(/^jost\b/i);
  });

  test('the Jost face is loaded for the page', async ({ page }) => {
    await page.goto('/about');
    await page.evaluate(() => document.fonts.ready);

    const loadedFamilies = await page.evaluate(() =>
      [...document.fonts].filter((face) => face.status === 'loaded').map((face) => face.family)
    );
    expect(loadedFamilies).toContain('jost');
  });
});
