/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect } from '@playwright/test';

import type { Locator } from '@playwright/test';

export interface Edges {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * The edges of the boxes the visible elements draw, read from one layout
 * frame. Reading each box with its own `boundingBox()` call lets the page
 * move between reads: on CI the bio section's lazy-loaded editor mounted
 * above the links mid-sequence, so the row's buttons measured 105px below
 * the URL they share a line with (run 38188524412).
 */
export const edgesOfAll = async (locators: readonly Locator[]): Promise<Edges[]> => {
  for (const locator of locators) await expect(locator).toBeVisible();
  const handles = await Promise.all(locators.map((locator) => locator.elementHandle()));
  const page = locators[0].page();
  return page.evaluate(
    (elements) =>
      elements.map((element) => {
        if (!element) throw new Error('A visible element has no box');
        const { left, right, top, bottom } = element.getBoundingClientRect();
        return { left, right, top, bottom };
      }),
    handles
  );
};
