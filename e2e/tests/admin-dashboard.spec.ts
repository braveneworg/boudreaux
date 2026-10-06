/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../fixtures/auth.fixture';

import type { Locator } from '@playwright/test';

/**
 * E2E coverage for the /admin dashboard landing.
 *
 * The dashboard replaces the old combobox view-switcher with a stats overview:
 * a tile per section (linking into it) plus a published-vs-unpublished chart.
 */

/** The element's box; throws when it is not rendered. */
const boxOf = async (
  locator: Locator
): Promise<{ x: number; y: number; width: number; height: number }> => {
  const box = await locator.boundingBox();
  if (!box) throw new Error('element is not rendered');
  return box;
};

test.describe('Admin dashboard', () => {
  test('renders the dashboard heading and section overview tiles', async ({ adminPage }) => {
    await adminPage.goto('/admin');

    await expect(adminPage.getByRole('heading', { name: 'Dashboard', exact: true })).toBeVisible();

    const overview = adminPage.getByRole('list', { name: /section overview/i });
    await expect(overview.getByRole('link', { name: 'Releases' })).toBeVisible();
    await expect(overview.getByRole('link', { name: 'Tours' })).toBeVisible();
  });

  test('renders the Videos tile linking into the section with its stats', async ({ adminPage }) => {
    // The stats toPass reload loop (below) can span up to 60s while a mutating
    // spec's transient row clears — extend the per-test budget to fit it.
    test.slow();

    await adminPage.goto('/admin');

    const overview = adminPage.getByRole('list', { name: /section overview/i });
    const videosTile = overview
      .getByRole('listitem')
      .filter({ has: adminPage.getByRole('link', { name: 'Videos', exact: true }) });

    await expect(videosTile).toHaveCount(1);
    await expect(videosTile.getByRole('link', { name: 'Videos', exact: true })).toHaveAttribute(
      'href',
      '/admin/videos'
    );
    // 13 total videos are seeded: 7 published + 1 draft + 1 archived (base) plus
    // 2 archived enrichment fixtures (both with `publishedAt`) plus 1 archived
    // review fixture (publishedAt set, archivedAt set) plus 1 future-dated
    // scheduled video (publishedAt = 2099, so publishedAt > now). The dashboard
    // published count uses VideoRepository.count({ published: true }) which applies
    // publishedAt <= now — the scheduled video does NOT meet that clause, so it
    // counts as draft (total − published = 13 − 11 = 2).
    // toPass: converges past transient rows created by mutating specs (draft-upload).
    await expect(async () => {
      await adminPage.reload();
      const tile = adminPage
        .getByRole('list', { name: /section overview/i })
        .getByRole('listitem')
        .filter({ has: adminPage.getByRole('link', { name: 'Videos', exact: true }) });
      await expect(tile.getByText('13', { exact: true })).toBeVisible({ timeout: 2_000 });
      await expect(tile.getByText('11 published · 2 draft')).toBeVisible({ timeout: 2_000 });
    }).toPass({ timeout: 60_000 });
  });

  test('tiles link into their section', async ({ adminPage }) => {
    await adminPage.goto('/admin');

    const overview = adminPage.getByRole('list', { name: /section overview/i });
    await overview.getByRole('link', { name: 'Releases' }).click();

    await expect(adminPage).toHaveURL(/\/admin\/releases$/);
  });

  test('renders the published-vs-unpublished chart', async ({ adminPage }) => {
    await adminPage.goto('/admin');

    await expect(
      adminPage.getByRole('heading', { name: /published vs unpublished/i })
    ).toBeVisible();
    await expect(adminPage.locator('[data-slot="chart"]')).toBeVisible();
  });

  // #740: before ResponsiveContainer measured its box, recharts drew at -1
  // and warned in the console.
  for (const width of [1280, 390]) {
    test(`draws the chart inside its box with no size warning at ${width}px`, async ({
      adminPage,
    }) => {
      const warnings: string[] = [];
      adminPage.on('console', (message) => {
        if (/width\(-1\) and height\(-1\)/.test(message.text())) warnings.push(message.text());
      });
      await adminPage.setViewportSize({ width, height: 900 });
      await adminPage.goto('/admin');

      const chart = adminPage.locator('[data-slot="chart"]');
      const surface = chart.locator('svg.recharts-surface').first();
      await expect(surface).toBeVisible();
      const [box, drawn] = await Promise.all([boxOf(chart), boxOf(surface)]);
      expect(drawn.width).toBeGreaterThan(0);
      expect(drawn.height).toBeGreaterThan(0);
      expect(drawn.x).toBeGreaterThanOrEqual(box.x - 0.5);
      expect(drawn.x + drawn.width).toBeLessThanOrEqual(box.x + box.width + 0.5);
      expect(warnings).toEqual([]);
    });
  }

  test('no longer renders the section combobox', async ({ adminPage }) => {
    await adminPage.goto('/admin');

    await expect(adminPage.getByRole('combobox', { name: /select a section/i })).toHaveCount(0);
  });
});
