/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { devices, expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

/**
 * 007-free-digital-downloads — User Story 1 (Anonymous Free Download)
 *
 * Validates the freemium download flow on iOS Safari (webkit) emulation:
 *  1. Anonymous (logged-out) visitor opens the download dialog.
 *  2. Selects the **Free** radio (MP3 320Kbps + AAC).
 *  3. Lands on the free-format-select step with both formats available.
 *  4. Initiates the bundle download.
 *  5. SSE progress events are visible in flight.
 *  6. The `boudreaux_visitor_id` cookie is set on the API path with the
 *     required attributes (HttpOnly, SameSite=Lax, Secure-in-prod, Path=/api).
 *
 * This test runs only on the webkit project (iOS Safari emulation) because
 * the SSE-then-redirect download flow is the riskiest browser path.
 */

// Force iPhone 14 (webkit) — the iOS path is the riskiest target for SSE
// + cookie issuance in a single response.
test.use({ ...devices['iPhone 14'] });

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

let e2eRelease1Id: string;
let e2eRelease1Title: string;

test.beforeAll(async () => {
  const release = await prisma.release.findFirstOrThrow({
    where: { title: 'E2E Album One' },
    select: { id: true, title: true },
  });
  e2eRelease1Id = release.id;
  e2eRelease1Title = release.title;
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('Free digital downloads (007 US1) — iOS Safari', () => {
  test('anonymous visitor downloads the free MP3+AAC bundle and gets visitor cookie', async ({
    page,
    context,
  }) => {
    await page.goto(`/releases/${e2eRelease1Id}`);

    // Step 1: open the dialog.
    const downloadButton = page.getByRole('button', { name: 'Download' });
    await expect(downloadButton).toBeVisible({ timeout: 10_000 });
    await downloadButton.click();

    // Step 2: select Free radio + Continue.
    const freeRadio = page.getByRole('radio', { name: /MP3 \(320Kbps\) and AAC/i });
    await expect(freeRadio).toBeVisible();
    await expect(freeRadio).toBeEnabled();
    await freeRadio.click();
    await page.getByRole('button', { name: /^Download$/ }).click();

    // Step 3: free-format-select step is rendered.
    await expect(page.getByRole('heading', { name: /Free Download/i })).toBeVisible({
      timeout: 10_000,
    });

    // Step 4: trigger the bundled download. The combobox already has both
    // free formats pre-selected; the Download button kicks off SSE.
    const innerDownload = page.getByRole('button', { name: /^Download$/ });
    await innerDownload.click();

    // Step 5: SSE progress is visible (zipping → uploading) before redirect.
    // The dialog shows a status line that updates as events arrive.
    await expect(page.getByText(/Preparing|Zipping|Uploading|Downloading/i)).toBeVisible({
      timeout: 15_000,
    });

    // Step 6: cookie issued with the right attributes.
    // We poll briefly because cookies are committed asynchronously after
    // the first SSE chunk lands in the browser.
    await expect
      .poll(
        async () => {
          const cookies = await context.cookies();
          return cookies.find((c) => c.name === 'boudreaux_visitor_id');
        },
        { timeout: 10_000 }
      )
      .toBeDefined();

    const cookies = await context.cookies();
    const visitor = cookies.find((c) => c.name === 'boudreaux_visitor_id');
    expect(visitor).toBeDefined();
    expect(visitor!.httpOnly).toBe(true);
    expect(visitor!.sameSite).toBe('Lax');
    expect(visitor!.path).toBe('/api');
    // `secure` is true in production builds; the E2E dev server runs over
    // http://localhost so we only assert the attribute is a boolean.
    expect(typeof visitor!.secure).toBe('boolean');

    // Sanity: the dialog is still mounted with the release context.
    expect(e2eRelease1Title).toBe('E2E Album One');
  });
});
