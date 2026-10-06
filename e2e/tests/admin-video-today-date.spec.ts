/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { E2E_TODAY_RELEASE_MARKER } from '@/lib/services/fake-release-day';

import { expect, test } from '../fixtures/auth.fixture';
import { deleteVideoCascade } from '../helpers/e2e-db';

/**
 * Today is never a release date by itself (#743, #810). The marker in the
 * title makes both fakes answer today: the release-date lookup and the
 * enrichment run. The lookup treats today as a miss, and the run leaves its
 * today-dated suggestion pending instead of filling the empty date.
 */

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

const STAMP = randomUUID().slice(0, 8);
let videoId: string | undefined;

test.afterAll(async () => {
  if (videoId) await deleteVideoCascade(videoId);
  await prisma.$disconnect();
});

test('a today-dated release suggestion stays pending on a dateless draft', async ({
  adminPage,
}) => {
  // A fake lookup, a fake run of at least 4s, polling and a reload.
  test.slow();
  ({ id: videoId } = await prisma.video.create({
    data: {
      title: `E2E Today ${STAMP} ${E2E_TODAY_RELEASE_MARKER}`,
      artist: `ZZ E2E Today Artist ${STAMP}`,
      category: 'MUSIC',
      s3Key: `media/videos/e2e/e2e-today-${STAMP}.mp4`,
      fileName: 'e2e-today.mp4',
      mimeType: 'video/mp4',
      fileSize: BigInt(1048576),
      archivedAt: new Date('2000-01-01T00:00:00.000Z'),
    },
    select: { id: true },
  }));

  await adminPage.goto(`/admin/videos/${videoId}`);
  const dateInput = adminPage.getByPlaceholder('mm/dd/yyyy').first();
  // The lookup ran and treated today as a miss: it keeps retrying (20s, then
  // 60s) and never fills the field.
  await expect(
    adminPage.getByRole('status').filter({ hasText: 'Looking up release date' })
  ).toBeVisible({
    timeout: 20_000,
  });
  await expect(dateInput).toHaveValue('');

  const panel = adminPage.getByTestId('video-enrichment-panel');
  await panel.getByRole('button', { name: 'Run enrichment' }).click();
  await expect(panel.getByTestId('video-enrichment-status-chip')).toHaveText('Enriched', {
    timeout: 45_000,
  });

  const card = adminPage.getByTestId('video-release-date-suggestion');
  await expect(card.getByRole('button', { name: 'Apply Release date suggestion' })).toBeEnabled();
  await expect(card.getByText('Applied', { exact: true })).toHaveCount(0);
  await expect(dateInput).toHaveValue('');

  const stored = await prisma.video.findUniqueOrThrow({
    where: { id: videoId },
    select: { releasedOn: true },
  });
  expect(stored.releasedOn).toBeNull();
  const suggestion = await prisma.videoEnrichmentSuggestion.findFirst({
    where: { videoId, field: 'releasedOn' },
    select: { status: true },
  });
  expect(suggestion?.status).toBe('pending');
});
