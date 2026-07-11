/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { devices } from '@playwright/test';

import { test, expect } from '../../fixtures/base.fixture';

/**
 * Mobile header nav coverage. The header is viewport-responsive (CSS), not
 * User-Agent gated: the hamburger sheet shows below the `xl` breakpoint via
 * `xl:hidden`. The sheet renders the same grouped projection as the desktop
 * drawers — Music/Label as accordion categories (one open at a time; the
 * active route's category starts open).
 *
 * The hamburger auth flows are covered separately in auth/signout.spec.ts.
 */
test.use({ ...devices['Pixel 5'] });

const NAV_DIALOG = { name: 'Navigation menu' } as const;

test.describe('Mobile header — categorized navigation', () => {
  test('shows collapsed category triggers with children hidden', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: /open menu/i }).click();

    const dialog = page.getByRole('dialog', NAV_DIALOG);
    const music = dialog.getByRole('button', { name: 'Music' });
    await expect(music).toBeVisible({ timeout: 10_000 });
    await expect(music).toHaveAttribute('aria-expanded', 'false');
    await expect(dialog.getByRole('button', { name: 'Label' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    // Grouped children only render once their category expands.
    await expect(dialog.getByRole('link', { name: 'Releases' })).toHaveCount(0);
    await expect(dialog.getByRole('link', { name: 'Tours' })).toHaveCount(0);
  });

  test('expands Music and navigates to Releases', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: /open menu/i }).click();

    const dialog = page.getByRole('dialog', NAV_DIALOG);
    const music = dialog.getByRole('button', { name: 'Music' });
    await expect(music).toBeVisible({ timeout: 10_000 });
    await music.click();

    // Settle the accordion before tapping a child — guards the animation race.
    await expect(music).toHaveAttribute('aria-expanded', 'true');
    const releases = dialog.getByRole('link', { name: 'Releases' });
    await expect(releases).toBeVisible();

    await releases.click();

    await expect(page).toHaveURL('/releases');
  });

  test('collapses the open category when the other one expands', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: /open menu/i }).click();

    const dialog = page.getByRole('dialog', NAV_DIALOG);
    const music = dialog.getByRole('button', { name: 'Music' });
    await expect(music).toBeVisible({ timeout: 10_000 });
    await music.click();
    await expect(music).toHaveAttribute('aria-expanded', 'true');

    await dialog.getByRole('button', { name: 'Label' }).click();

    await expect(music).toHaveAttribute('aria-expanded', 'false');
    await expect(dialog.getByRole('link', { name: 'Tours' })).toBeVisible();
    // toBeHidden also accepts the detached state Radix leaves after the
    // exit animation unmounts the collapsed panel.
    await expect(dialog.getByRole('link', { name: 'Releases' })).toBeHidden();
  });

  test('auto-opens the category containing the active route', async ({ page }) => {
    await page.goto('/releases');

    await page.getByRole('button', { name: /open menu/i }).click();

    const dialog = page.getByRole('dialog', NAV_DIALOG);
    const music = dialog.getByRole('button', { name: 'Music' });
    await expect(music).toBeVisible({ timeout: 10_000 });
    // No tap needed — the sheet opens with the active trail already expanded,
    // wearing the Music cyan like the desktop trigger's trail state.
    await expect(music).toHaveAttribute('aria-expanded', 'true');
    await expect(music).toHaveClass(/text-menu-item-cyan-400/);
    await expect(dialog.getByRole('link', { name: 'Releases' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Label' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
  });
});
