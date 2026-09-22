/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../fixtures/auth.fixture';
import { BIO_PALETTE_ARTIST_ID } from '../helpers/seed-test-db';

/**
 * Pins how many `/api/` requests one admin artist edit page mount makes
 * before the bio image pool is on screen.
 *
 * nginx's `api` zone (10 r/s, `burst=50` on `location /api/` in
 * `nginx/nginx.conf`) is sized from this number, and CI never crosses nginx,
 * so this spec is the only guard against the fan-out growing until rapid
 * admin navigation (list → edit → list → edit, or two quick reloads) trips
 * the limiter again — with `burst=20` that took about three mounts
 * (2026-09-21), and the throttled status read looked like an empty pool.
 *
 * The count is the app's own: no proxy, no retries (nothing fails here).
 * Measured 2026-09-21: 5 on the dev server — `GET /api/auth/get-session`
 * once, then `GET /api/artists/<id>` and `GET /api/artists/<id>/bio-generation`
 * twice each because React StrictMode's dev remount cancels and re-issues
 * the first fetch — so 3 on CI's production build. The budget leaves room
 * for one more page query and the dev doubling, no more.
 */
const API_REQUEST_BUDGET = 10;

test.describe('Admin artist edit request budget', () => {
  test('mounts the edit page within the /api/ request budget', async ({ adminPage }) => {
    const apiRequests: string[] = [];
    adminPage.on('request', (request) => {
      const { pathname } = new URL(request.url());
      if (pathname.startsWith('/api/')) {
        apiRequests.push(`${request.method()} ${pathname}`);
      }
    });

    await adminPage.goto(`/admin/artists/${BIO_PALETTE_ARTIST_ID}`);
    await expect(adminPage.getByRole('heading', { name: 'Edit Artist', exact: true })).toBeVisible({
      timeout: 15_000,
    });
    const manager = adminPage.getByRole('region', { name: 'Bio images' });
    await expect(manager).toHaveCount(1, { timeout: 15_000 });
    const pool = manager.getByRole('group', { name: 'Image pool' });
    await expect(pool.getByText('E2E seeded attribution')).toBeVisible({ timeout: 15_000 });

    const mounted = [...apiRequests];
    // Surfaces the measured count in the report (HTML/JSON) on every run, so
    // growth is visible before it crosses the budget.
    test.info().annotations.push({
      type: 'api-requests-on-mount',
      description: `${mounted.length}: ${mounted.join(', ')}`,
    });
    expect(
      mounted.length,
      `The edit page made ${mounted.length} /api/ requests on mount (budget ${API_REQUEST_BUDGET}):\n${mounted.join('\n')}`
    ).toBeLessThanOrEqual(API_REQUEST_BUDGET);
  });
});
