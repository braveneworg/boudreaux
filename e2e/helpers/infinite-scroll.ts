/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect } from '@playwright/test';

import type { Locator, Page } from '@playwright/test';

/**
 * Load infinitely-scrolled admin data-view pages until `untilVisible` appears.
 *
 * The data-view footer (`LoadMoreTrigger`) auto-loads the next page via an
 * IntersectionObserver on its sentinel when it scrolls into view. Do NOT click
 * the transient "Load More" button: the button lives inside that same sentinel
 * and is swapped out for the loading spinner the instant `isFetchingNextPage`
 * flips, so `getByRole('button', { name: 'Load More' }).click()` races the
 * auto-load — the element detaches mid-click and, once the page finishes
 * loading, never returns ("All items loaded"), so the click retries until it
 * times out. The race only loses under parallel load (a single fast worker wins
 * it), which is why it surfaced as an intermittent CI hang.
 *
 * This scrolls the window to the bottom inside a `toPass` retry loop to drive
 * the observer, then confirms the target is present — robust regardless of how
 * many pages must load or how the auto-load timing falls.
 *
 * @param page - The Playwright page.
 * @param untilVisible - A locator that becomes visible once the needed page(s)
 *   have loaded (e.g. a heading only present on a later page).
 */
export const scrollToLoad = async (page: Page, untilVisible: Locator): Promise<void> => {
  await expect(async () => {
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(untilVisible).toBeVisible({ timeout: 750 });
  }).toPass({ timeout: 15_000 });
};
