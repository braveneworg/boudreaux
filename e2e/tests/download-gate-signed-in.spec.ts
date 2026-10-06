/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { expect, test } from '../fixtures/base.fixture';
import { E2E_AUTH_SECRET } from '../helpers/auth-constants';
import { createStorageState } from '../helpers/auth-helpers';

import type { APIRequestContext, Browser, BrowserContext } from '@playwright/test';

/**
 * A signed-in user's bundle downloads go through the download gate (#807,
 * ADR-0018): free formats are granted on any release, premium formats only on
 * a purchased one, and only free draws count toward the free cap.
 *
 * The checks read the gate's preflight answer (`respond=preflight`), which
 * decides without touching S3 or charging anything. Each test signs in its
 * own stamped user, because a free bundle's stream records real draws in CI,
 * where the server has S3 credentials, and the shared users' caps are read by
 * other specs.
 */

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

const STAMP = randomUUID().slice(0, 8);

/** Free formats per seeded release: only MP3 on Album Two; FLAC on Album One. */
const FREE_FORMAT = 'MP3_320KBPS';
const PREMIUM_FORMAT = 'FLAC';
const FREE_DOWNLOAD_CAP = 3;

const userIds: string[] = [];
let albumOneId: string;
let albumTwoId: string;

const preflightUrl = (releaseId: string, format: string): string =>
  `/api/releases/${releaseId}/download/bundle?formats=${format}&respond=preflight`;

const signInNewUser = async (
  browser: Browser,
  label: string
): Promise<{ userId: string; context: BrowserContext; request: APIRequestContext }> => {
  const handle = `e2egate${label}${STAMP}`;
  const { id: userId } = await prisma.user.create({
    data: {
      email: `${handle}@example.invalid`,
      name: `E2E Gate ${label} ${STAMP}`,
      username: handle,
      role: 'user',
      emailVerified: true,
      banned: false,
      termsAndConditions: true,
      termsAcceptedAt: new Date(),
    },
    select: { id: true },
  });
  userIds.push(userId);
  const token = `e2e-gate-${label}-${STAMP}`;
  await prisma.session.create({
    data: { token, userId, expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) },
  });
  const context = await browser.newContext({
    storageState: await createStorageState(token, E2E_AUTH_SECRET),
  });
  return { userId, context, request: context.request };
};

const recordDraws = (userId: string, releaseId: string, mode: 'free' | 'purchased') =>
  prisma.downloadEvent.createMany({
    data: Array.from({ length: FREE_DOWNLOAD_CAP }, () => ({
      userId,
      releaseId,
      formatType: FREE_FORMAT,
      success: true,
      mode,
    })),
  });

test.beforeAll(async () => {
  const releases = await prisma.release.findMany({
    where: { title: { in: ['E2E Album One', 'E2E Album Two'] } },
    select: { id: true, title: true },
  });
  albumOneId = releases.find(({ title }) => title === 'E2E Album One')?.id ?? '';
  albumTwoId = releases.find(({ title }) => title === 'E2E Album Two')?.id ?? '';
  expect(albumOneId).not.toBe('');
  expect(albumTwoId).not.toBe('');
});

test.afterAll(async () => {
  const where = { userId: { in: userIds } };
  await prisma.downloadEvent.deleteMany({ where });
  await prisma.userDownloadQuota.deleteMany({ where });
  await prisma.releaseDownload.deleteMany({ where });
  await prisma.releasePurchase.deleteMany({ where });
  await prisma.session.deleteMany({ where });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

test.describe('Download gate for signed-in users', () => {
  test('the free bundle in the dialog passes the gate', async ({ browser }) => {
    const { context } = await signInNewUser(browser, 'dialog');
    try {
      const page = await context.newPage();
      await page.goto(`/releases/${albumTwoId}`);
      await page.getByRole('button', { name: 'Download' }).click();
      await expect(page.getByRole('heading', { name: 'Download', exact: true })).toBeVisible({
        timeout: 10_000,
      });
      await page.getByLabel(/FREE digital formats.*320Kbps.*AAC/i).click();

      await page.getByRole('button', { name: 'Download', exact: true }).click();

      // The free step asks for formats before anything is requested.
      await expect(page.getByRole('heading', { name: 'Free Download' })).toBeVisible();
      await page.getByRole('combobox').click();
      await page.getByRole('option', { name: /MP3 320kbps/i }).click();
      await page.keyboard.press('Escape');
      const preflight = page.waitForResponse(
        (response) =>
          response.url().includes(`/api/releases/${albumTwoId}/download/bundle`) &&
          response.url().includes('respond=preflight')
      );
      await page.getByRole('button', { name: /^Download 1 format/ }).click();
      expect((await preflight).status()).toBe(200);
    } finally {
      await context.close();
    }
  });

  test('premium formats need a purchase, and a purchase grants them', async ({ browser }) => {
    const { userId, context, request } = await signInNewUser(browser, 'premium');
    try {
      const refused = await request.get(preflightUrl(albumOneId, PREMIUM_FORMAT));
      expect(refused.status()).toBe(403);
      expect(((await refused.json()) as { error?: string }).error).toBe('PURCHASE_REQUIRED');

      await prisma.releasePurchase.create({
        data: {
          userId,
          releaseId: albumOneId,
          amountPaid: 500,
          stripePaymentIntentId: `pi_e2e_gate_${STAMP}`,
        },
      });
      const granted = await request.get(preflightUrl(albumOneId, PREMIUM_FORMAT));
      expect(granted.status()).toBe(200);
    } finally {
      await context.close();
    }
  });

  test('only free draws count toward the free cap', async ({ browser }) => {
    const { userId, context, request } = await signInNewUser(browser, 'cap');
    try {
      await recordDraws(userId, albumTwoId, 'purchased');
      expect((await request.get(preflightUrl(albumTwoId, FREE_FORMAT))).status()).toBe(200);

      await recordDraws(userId, albumTwoId, 'free');
      const capped = await request.get(preflightUrl(albumTwoId, FREE_FORMAT));
      expect(capped.status()).toBe(403);
      expect(((await capped.json()) as { error?: string }).error).toBe('CAP_REACHED');
    } finally {
      await context.close();
    }
  });
});
