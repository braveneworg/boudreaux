/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect } from '@playwright/test';

import type { Page } from '@playwright/test';

/** Which drawer owns each drawered destination (spec: Music ▾ / Label ▾). */
const DRAWER_BY_LINK = new Map<string, string>([
  ['Releases', 'Music'],
  ['Artists', 'Music'],
  ['Playlists', 'Music'],
  ['Videos', 'Music'],
  ['Tours', 'Label'],
  ['Merch', 'Label'],
  ['About', 'Label'],
]);

/**
 * Navigate via the desktop header nav. Drawered destinations need their
 * drawer opened first — click (not hover) for determinism; Radix toggles on
 * click. One race is guarded: if the pointer was already resting on the
 * trigger, the 150ms hover-intent may have opened the drawer so the click
 * toggled it closed — when `aria-expanded` doesn't settle to `'true'`, one
 * more click restores the open state before the link is clicked.
 */
export const openDesktopNavLink = async (page: Page, name: string): Promise<void> => {
  const banner = page.getByRole('banner');
  const drawer = DRAWER_BY_LINK.get(name);
  if (drawer) {
    const trigger = banner.getByRole('button', { name: drawer });
    await trigger.click();
    try {
      await expect(trigger).toHaveAttribute('aria-expanded', 'true', { timeout: 1_000 });
    } catch {
      await trigger.click();
    }
  }
  const link = banner.getByRole('link', { name });
  await expect(link).toBeVisible();
  await link.click();
};
