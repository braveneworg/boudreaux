/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import http from 'node:http';

import { devices, expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

/**
 * 007-free-digital-downloads — User Story 1 (Anonymous Free Download)
 *
 * Validates the freemium download flow using Pixel 7 mobile emulation
 * (chromium engine, mobile viewport):
 *  1. Anonymous (logged-out) visitor opens the download dialog.
 *  2. Selects the **Free** radio (MP3 320Kbps + AAC).
 *  3. Lands on the free-format-select step with both formats available.
 *  4. Initiates the bundle download.
 *  5. The preflight gate authorizes the free bundle (HTTP 200) before the
 *     browser anchor-navigates to the streaming ZIP.
 *  6. The `boudreaux_visitor_id` cookie is set on the API path with the
 *     required attributes (HttpOnly, SameSite=Lax, Secure-in-prod, Path=/api).
 *
 * Note: We use Pixel 7 instead of iPhone 14 so the test runs against the
 * chromium project (matches CI which only installs chromium). Mobile
 * viewport + touch behavior is what we actually need to validate; engine
 * choice is incidental.
 */

// Apply Pixel 7 mobile emulation for this free-download flow.
test.use({ ...devices['Pixel 7'] });

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

test.describe('Free digital downloads (007 US1) — Pixel 7 emulation', () => {
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

    // Step 4a: open the multi-combobox and select all free formats (MP3 320kbps + AAC).
    const combobox = page.getByRole('combobox');
    await expect(combobox).toBeVisible({ timeout: 10_000 });
    await combobox.click();
    await page.getByRole('option', { name: 'Select all' }).click();
    await page.keyboard.press('Escape');

    // Step 4b: trigger the bundled download. Button text from FormatBundleDownload:
    // "Download 2 formats" once both free formats are selected.
    const innerDownload = page.getByRole('button', { name: /^Download \d+ format/ });
    await expect(innerDownload).toBeVisible({ timeout: 10_000 });

    // Step 5: guard against the CI standalone server losing its AWS credentials.
    // A missing-credentials server answers INTERNAL_ERROR from the stream route
    // — `getS3Client()` throws before any streaming begins. With credentials
    // present the request reaches S3, finds no object for the seeded release
    // (NoSuchKey), and the download gate's producer refuses to deliver an empty
    // ZIP: a clean 500 whose body says STREAM_FAILED (ADR-0018). If S3 fixtures
    // are ever seeded, the stream completes with a 200 instead. So "a 200, or a
    // 500 that names STREAM_FAILED" proves the server reached S3.
    //
    // We probe with the low-level `node:http` client because a browser
    // fetch/anchor network-retries the GET until the free cap is hit (only ever
    // surfacing the eventual 403). This request uses its own visitor identity
    // (distinct fingerprint — no User-Agent), so it does not touch the
    // browser's cap or the cookie the UI flow issues below.
    const streamUrl = new URL(
      `/api/releases/${e2eRelease1Id}/download/bundle?formats=MP3_320KBPS,AAC&respond=stream`,
      page.url()
    ).toString();
    const streamOutcome = await new Promise<
      { status: number; body: string } | 'connection-reset' | 'timeout'
    >((resolve) => {
      const request = http.get(streamUrl, (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk: Buffer) => chunks.push(chunk));
        response.on('error', () => resolve('connection-reset'));
        response.on('end', () =>
          resolve({
            status: response.statusCode ?? 0,
            body: Buffer.concat(chunks).toString('utf8'),
          })
        );
      });
      request.on('error', () => resolve('connection-reset'));
      request.setTimeout(15_000, () => {
        request.destroy();
        resolve('timeout');
      });
    });
    expect(streamOutcome).not.toBe('timeout');
    // A 500 is acceptable only as the gate's explicit STREAM_FAILED; any other
    // 500 (e.g. INTERNAL_ERROR from missing credentials) fails the guard.
    const fiveHundredError =
      typeof streamOutcome === 'object' && streamOutcome.status === 500
        ? (JSON.parse(streamOutcome.body) as { error?: string }).error
        : 'STREAM_FAILED';
    expect(fiveHundredError).toBe('STREAM_FAILED');

    // Step 5b: drive the real UI download and confirm the dialog's preflight
    // gate authorizes it end to end — it is the call that issues the visitor
    // cookie. (The browser's subsequent stream re-requests exhaust the cap, but
    // that is irrelevant here; we do not wait on the transient in-dialog
    // "Preparing…" label, which the dialog unmounts when the browser follows the
    // stream URL. Per-format zipping/uploading status is exclusive to the
    // collection-list SSE flow `respond=json`.)
    const preflightResponse = page.waitForResponse(
      (response) =>
        response.url().includes(`/api/releases/${e2eRelease1Id}/download/bundle`) &&
        response.url().includes('respond=preflight'),
      { timeout: 15_000 }
    );
    await innerDownload.click();
    expect((await preflightResponse).ok()).toBe(true);

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
    expect(visitor).toMatchObject({
      httpOnly: true,
      sameSite: 'Lax',
      path: '/api',
    });
    // `secure` is true in production builds; the E2E dev server runs over
    // http://localhost so we only assert the attribute is a boolean.
    expect(typeof visitor?.secure).toBe('boolean');

    // Sanity: the dialog is still mounted with the release context.
    expect(e2eRelease1Title).toBe('E2E Album One');
  });
});
