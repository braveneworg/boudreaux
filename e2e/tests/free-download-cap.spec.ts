/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { randomUUID } from 'node:crypto';

import { devices, expect, test } from '@playwright/test';
import { PrismaClient } from '@prisma/client';

/**
 * 007-free-digital-downloads — User Story 2 + User Story 3
 *
 *  - US2 (P2): When a visitor reaches the per-release free-download cap (3
 *    successful downloads in the trailing 24h window), the free-format step
 *    must render a "Download limit reached" state with a live reset
 *    countdown instead of an active download button.
 *
 *  - US3 (P3): The same cap blocks BOTH free formats (MP3 320Kbps + AAC)
 *    simultaneously for the capped release, while a different release with
 *    remaining capacity continues to allow free downloads. There is no
 *    separate cross-release AAC quota.
 *
 * Setup strategy:
 *  - Mint a UUID `visitorId`, attach it as the `boudreaux_visitor_id`
 *    cookie on the browser context BEFORE navigating, so the
 *    `/api/.../download/free-status` call adopts the seeded identity.
 *  - Insert a `VisitorIdentity` row + 3 successful `DownloadEvent` rows for
 *    that (visitorId, releaseId) pair to push the visitor over the cap.
 *  - Pixel 7 mobile emulation matches US1 to keep the free-flow specs
 *    consistent and to validate the mobile cap-reached layout.
 */

test.use({ ...devices['Pixel 7'] });

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

let cappedReleaseId: string; // E2E Album One — has BOTH MP3_320KBPS and AAC
let openReleaseId: string; // E2E Album Two — has MP3_320KBPS only

test.beforeAll(async () => {
  const capped = await prisma.release.findFirstOrThrow({
    where: { title: 'E2E Album One' },
    select: { id: true },
  });
  const open = await prisma.release.findFirstOrThrow({
    where: { title: 'E2E Album Two' },
    select: { id: true },
  });
  cappedReleaseId = capped.id;
  openReleaseId = open.id;
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

interface SeededIdentity {
  visitorId: string;
}

const seedCapReached = async (releaseId: string): Promise<SeededIdentity> => {
  const visitorId = randomUUID();
  await prisma.visitorIdentity.create({
    data: {
      visitorId,
      fingerprintHash: `e2e-fingerprint-${visitorId}`,
    },
  });
  // Three successful DownloadEvents pushes the (visitorId, releaseId) pair
  // to the FREE_DOWNLOAD_CAP (3) and forces the cap-reached state.
  const now = Date.now();
  for (let i = 0; i < 3; i += 1) {
    await prisma.downloadEvent.create({
      data: {
        visitorId,
        releaseId,
        formatType: i === 0 ? 'AAC' : 'MP3_320KBPS',
        success: true,
        downloadedAt: new Date(now - (i + 1) * 60_000),
      },
    });
  }
  return { visitorId };
};

const clearSeededIdentity = async ({ visitorId }: SeededIdentity): Promise<void> => {
  await prisma.downloadEvent.deleteMany({ where: { visitorId } });
  await prisma.visitorIdentity.deleteMany({ where: { visitorId } });
};

const visitorCookie = (visitorId: string, baseURL: string | undefined) => {
  const url = new URL(baseURL ?? 'http://127.0.0.1:3000');
  return {
    name: 'boudreaux_visitor_id',
    value: visitorId,
    domain: url.hostname,
    path: '/api',
    httpOnly: true,
    secure: false,
    sameSite: 'Lax' as const,
  };
};

test.describe('Free download per-release cap (007 US2 + US3) — Pixel 7', () => {
  test('US2: cap-reached state shows live countdown and disabled CTA', async ({
    page,
    context,
    baseURL,
  }) => {
    const identity = await seedCapReached(cappedReleaseId);

    try {
      await context.addCookies([visitorCookie(identity.visitorId, baseURL)]);

      await page.goto(`/releases/${cappedReleaseId}`);

      // Open the dialog and pick the Free radio.
      const downloadButton = page.getByRole('button', { name: 'Download' });
      await expect(downloadButton).toBeVisible({ timeout: 10_000 });
      await downloadButton.click();

      const freeRadio = page.getByRole('radio', { name: /MP3 \(320Kbps\) and AAC/i });
      await expect(freeRadio).toBeVisible();
      await expect(freeRadio).toBeEnabled();
      await freeRadio.click();
      await page.getByRole('button', { name: /^Download$/ }).click();

      // The free-format-select step renders in cap-reached mode.
      const capContainer = page.getByTestId('free-cap-reached');
      await expect(capContainer).toBeVisible({ timeout: 10_000 });

      // Disabled "Download limit reached" button inside the cap-reached block.
      await expect(
        capContainer.getByRole('button', { name: /Download limit reached/i })
      ).toBeDisabled();

      // Live countdown is present, has a valid datetime attr, and exposes the
      // ARIA timer role for assistive tech.
      const countdown = page.getByTestId('time-remaining');
      await expect(countdown).toBeVisible();
      await expect(countdown).toHaveAttribute('datetime', /\d{4}-\d{2}-\d{2}T/);
      await expect(countdown).toHaveAttribute('role', 'timer');

      // Pay-what-you-want upsell CTA points to the release's purchase entry.
      const pwywLink = page.getByRole('link', { name: /Pay what you want/i });
      await expect(pwywLink).toBeVisible();
      await expect(pwywLink).toHaveAttribute('href', new RegExp(`/releases/${cappedReleaseId}`));

      // The format combobox is replaced by the cap-reached layout.
      await expect(page.getByRole('combobox')).toHaveCount(0);
    } finally {
      await clearSeededIdentity(identity);
    }
  });

  test('US3: cap on Album One blocks AAC + MP3 together; Album Two remains downloadable', async ({
    page,
    context,
    baseURL,
  }) => {
    const identity = await seedCapReached(cappedReleaseId);

    try {
      await context.addCookies([visitorCookie(identity.visitorId, baseURL)]);

      // 1) Capped release — both free formats are blocked at the same time.
      //    The cap-reached layout entirely replaces the format combobox, so
      //    asserting the absence of the combobox + presence of the
      //    cap-reached block confirms AAC and MP3 320Kbps are simultaneously
      //    inaccessible (no separate per-format quota).
      await page.goto(`/releases/${cappedReleaseId}`);
      await page.getByRole('button', { name: 'Download' }).click();
      await page.getByRole('radio', { name: /MP3 \(320Kbps\) and AAC/i }).click();
      await page.getByRole('button', { name: /^Download$/ }).click();

      await expect(page.getByTestId('free-cap-reached')).toBeVisible({ timeout: 10_000 });
      await expect(page.getByRole('combobox')).toHaveCount(0);

      // 2) A different release for the same visitor still has remaining
      //    capacity, so the free flow advances normally and the format
      //    combobox is rendered.
      await page.goto(`/releases/${openReleaseId}`);
      await page.getByRole('button', { name: 'Download' }).click();
      await page.getByRole('radio', { name: /MP3 \(320Kbps\) and AAC/i }).click();
      await page.getByRole('button', { name: /^Download$/ }).click();

      await expect(page.getByRole('heading', { name: /Free Download/i })).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByTestId('free-cap-reached')).toHaveCount(0);
      await expect(page.getByRole('combobox')).toBeVisible({ timeout: 10_000 });
    } finally {
      await clearSeededIdentity(identity);
    }
  });
});
