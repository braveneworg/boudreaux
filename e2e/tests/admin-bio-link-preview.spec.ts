/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { expect, test } from '../fixtures/auth.fixture';
import { BIO_PALETTE_ARTIST_ID } from '../helpers/seed-test-db';

import type { Page } from '@playwright/test';

/**
 * E2E coverage for the admin bio-editor link OG-unfurl preview (PR 3).
 *
 * The web server runs with E2E_MODE=true (see playwright.config.ts), so
 * `getLinkPreview` short-circuits to a deterministic, network-free
 * `resolved:false` response — no DNS, fetch, or sharp ever runs. The preview
 * card therefore always renders its graceful fallback
 * ("No preview available — <host>"), which is what the UI test asserts: the Eye
 * trigger opens a card.
 *
 * The endpoint's SSRF + auth guards are checked with direct API requests: a
 * literal-IP host is rejected 403 before any network work, and an
 * unauthenticated caller is rejected by `withAdmin` (401/403). Both are
 * pre-handler rejections, so they never reach the live internet.
 */

// The dedicated seeded palette artist (bioStatus 'succeeded') renders the
// Discovered-links palette on load, carrying one EXTERNAL link:
// "E2E Wikipedia" -> https://en.wikipedia.org/wiki/Music.
const EXTERNAL_LINK_LABEL = 'E2E Wikipedia';
const EXTERNAL_LINK_HOST = 'en.wikipedia.org';

const gotoPaletteArtistEdit = async (adminPage: Page): Promise<void> => {
  await adminPage.goto(`/admin/artists/${BIO_PALETTE_ARTIST_ID}`);
  await expect(adminPage.getByRole('heading', { name: 'Edit Artist', exact: true })).toBeVisible({
    timeout: 15_000,
  });
};

test.describe('Admin bio link OG-unfurl preview', () => {
  test('Eye trigger on an external link opens a preview card', async ({ adminPage }) => {
    await gotoPaletteArtistEdit(adminPage);

    // Guard against transient hydration doubles before interacting.
    const linksGroup = adminPage.getByRole('group', { name: 'Discovered links' });
    await expect(linksGroup).toHaveCount(1, { timeout: 15_000 });
    await expect(linksGroup).toBeVisible();

    // The Eye trigger's accessible name mirrors the row's sibling actions
    // ("Insert link ..." / "Delete link ...") in BioLinkPalette.
    const eyeTrigger = adminPage.getByRole('button', {
      name: `Preview link ${EXTERNAL_LINK_LABEL}`,
    });
    await expect(eyeTrigger).toBeVisible();

    // Desktop viewport -> useIsMobile() false -> shadcn HoverCard, which opens on
    // hover. Under E2E_MODE the query resolves network-free to a fallback card.
    await eyeTrigger.hover();

    const fallback = adminPage.getByText(/No preview available/i);
    await expect(fallback).toBeVisible({ timeout: 15_000 });
    await expect(fallback).toContainText(EXTERNAL_LINK_HOST);
  });

  test('endpoint rejects a private literal-IP host with 403', async ({ adminPage }) => {
    // 169.254.169.254 (link-local cloud-metadata address) is a literal IP, so the
    // route rejects it (isIP(hostname) !== 0 -> 403) BEFORE any DNS/fetch — fully
    // deterministic and network-free. adminPage.request carries the admin session,
    // so the request clears withAdmin and reaches the handler's SSRF guard.
    const response = await adminPage.request.get(
      `/api/link-preview?url=${encodeURIComponent('http://169.254.169.254/latest/meta-data/')}`
    );
    expect(response.status()).toBe(403);
  });

  test('endpoint rejects a bracketed literal IPv6 host with 403', async ({ adminPage }) => {
    // `http://[::1]/` → URL hostname `[::1]`; the route strips the brackets before
    // isIP(), so this loopback literal is rejected 403 before any DNS/fetch —
    // deterministic and network-free.
    const response = await adminPage.request.get(
      `/api/link-preview?url=${encodeURIComponent('http://[::1]/')}`
    );
    expect(response.status()).toBe(403);
  });

  test('endpoint is admin-gated (unauthenticated -> 401/403)', async ({ browser }) => {
    // A fresh context with no storageState is unauthenticated; it still inherits
    // the project baseURL (like the auth-fixture contexts), so the relative URL
    // resolves. withAdmin rejects before the handler runs — no network work.
    const context = await browser.newContext();
    try {
      const response = await context.request.get(
        `/api/link-preview?url=${encodeURIComponent('https://example.com/')}`
      );
      expect([401, 403]).toContain(response.status());
    } finally {
      await context.close();
    }
  });
});
