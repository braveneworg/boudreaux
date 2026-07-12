/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { expect, test } from '../fixtures/base.fixture';

/**
 * Coverage for the authenticated `/collection` page. The seeded regular user
 * (`testuser`) has one purchase — E2E Album One — so the page renders exactly
 * one collection row with a download dialog and no admin-only delete control.
 * Admin-gated deletion is exercised separately in admin-entity-delete.spec.ts.
 */

test.describe('My Collection — auth gate', () => {
  test('redirects an unauthenticated visitor to sign in', async ({ page }) => {
    await page.goto('/collection');
    await page.waitForURL(/\/signin/, { timeout: 10_000 });
  });
});

test.describe('My Collection — purchased user', () => {
  test('lists the purchased release with its artist', async ({ userPage }) => {
    await userPage.goto('/collection');

    // The per-row download trigger carries an unambiguous aria-label, so it is
    // the most reliable signal that the purchased row has hydrated.
    // The per-row download trigger (unambiguous aria-label) and the artist name
    // together prove the purchased row rendered. "My Collection" itself is
    // avoided as an assertion target: it appears in both the header nav and a
    // responsive (mobile + desktop) breadcrumb, so it is intrinsically ambiguous.
    await expect(userPage.getByRole('button', { name: 'Download E2E Album One' })).toBeVisible({
      timeout: 10_000,
    });
    // The row's artist name can momentarily appear twice while the page hydrates
    // (server HTML + client render both briefly in the DOM), so wait for the
    // count to settle to one before asserting visibility.
    const artistName = userPage.getByText('E2E Artist');
    await expect(artistName).toHaveCount(1);
    await expect(artistName).toBeVisible();
  });

  test('opens the per-release download dialog with format options', async ({ userPage }) => {
    await userPage.goto('/collection');

    const trigger = userPage.getByRole('button', { name: 'Download E2E Album One' });
    await expect(trigger).toBeVisible({ timeout: 10_000 });
    await trigger.click();

    // Dialog title is "Download"; Album One seeds 4 downloadable formats
    // (MP3 320kbps, AAC, FLAC, WAV), all selected by default.
    await expect(userPage.getByRole('heading', { name: 'Download', exact: true })).toBeVisible({
      timeout: 5_000,
    });
    await expect(userPage.getByRole('button', { name: /Download \d+ formats?/ })).toBeVisible();
  });

  test('does not expose a delete-purchase control to a non-admin user', async ({ userPage }) => {
    await userPage.goto('/collection');

    // Ensure the row has rendered before asserting the absence of the control.
    await expect(userPage.getByRole('button', { name: 'Download E2E Album One' })).toBeVisible({
      timeout: 10_000,
    });
    await expect(userPage.getByRole('button', { name: /Delete purchase for/ })).toHaveCount(0);
  });
});

test.describe('My Collection — mobile layout (360px)', () => {
  // 360px is the narrow-Android width where the purchased row was reported to
  // overflow. Each test compares the card row's box to its grid column (the
  // panel's content width): the row must never spill past it.
  test.beforeEach(async ({ userPage }) => {
    await userPage.setViewportSize({ width: 360, height: 740 });
    await userPage.goto('/collection');
    // The per-row download trigger's unambiguous aria-label signals hydration.
    await expect(userPage.getByRole('button', { name: 'Download E2E Album One' })).toBeVisible({
      timeout: 10_000,
    });
  });

  test('the purchased-release card fits within its content column', async ({ userPage }) => {
    const m = await userPage.evaluate(() => {
      const round = (n: number): number => Math.round(n * 100) / 100;
      const card = document
        .querySelector('button[aria-label^="Download"]')
        ?.closest('div.shadow-zine-sm');
      if (!card) return null;
      const grid = card.parentElement;
      if (!grid) return null;
      const c = card.getBoundingClientRect();
      const g = grid.getBoundingClientRect();
      return { cardRight: round(c.right), gridRight: round(g.right) };
    });

    expect(m, 'card row / grid not found — selector drift?').not.toBeNull();
    if (!m) throw new Error('metrics not captured');
    expect(
      m.cardRight,
      `card overflows its content column @360px: ${JSON.stringify(m)}`
    ).toBeLessThanOrEqual(m.gridRight + 1);
  });

  test('a long release title cannot blow the card out of its content column', async ({
    userPage,
  }) => {
    // The seeded title is short; a real long-titled release is what triggered
    // the report. Force the pathological case: without `min-w-0` on the row the
    // flex layout ignores `truncate` and the row blows past its grid column
    // (~1692px vs the 292px column) instead of ellipsing the title.
    const m = await userPage.evaluate(() => {
      const round = (n: number): number => Math.round(n * 100) / 100;
      const card = document
        .querySelector('button[aria-label^="Download"]')
        ?.closest('div.shadow-zine-sm');
      if (!card) return null;
      const grid = card.parentElement;
      const info = card.children.item(1);
      if (!grid || !info) return null;
      const title = info.querySelector('a');
      const artist = info.querySelector('p');
      if (title) title.textContent = 'Supercalifragilisticexpialidocious'.repeat(6);
      if (artist) artist.textContent = `Artist ${'Nombre'.repeat(30)}`;
      // getBoundingClientRect() below forces the synchronous reflow that
      // reflects the mutated text before measuring.
      const c = card.getBoundingClientRect();
      const g = grid.getBoundingClientRect();
      return {
        cardWidth: round(c.width),
        cardRight: round(c.right),
        gridWidth: round(g.width),
        gridRight: round(g.right),
      };
    });

    expect(m, 'card row / grid / info not found — selector drift?').not.toBeNull();
    if (!m) throw new Error('metrics not captured');
    expect(
      m.cardWidth,
      `long title widened the row past its column @360px: ${JSON.stringify(m)}`
    ).toBeLessThanOrEqual(m.gridWidth + 1);
    expect(m.cardRight).toBeLessThanOrEqual(m.gridRight + 1);
  });
});
