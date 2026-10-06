/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';

import { expect, test } from '../fixtures/auth.fixture';
import { deleteVideoCascade } from '../helpers/e2e-db';

import type { Page } from '@playwright/test';

/**
 * The video edit form's editorial rules, each a manual smoke after #590,
 * #679, #698, #707, #727, #730, #743 and #744.
 *
 * Every test edits its own video row, stamped per worker and archived so no
 * public listing shows it, and removes it by id. BIO_GENERATOR_FAKE makes the
 * release-date lookup answer 2020-06-01.
 */

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

const STAMP = randomUUID().slice(0, 8);
const ARCHIVED = new Date('2000-01-01T00:00:00.000Z');
const made: string[] = [];

interface VideoSeed {
  label: string;
  category?: 'MUSIC' | 'INFORMATIONAL';
  title?: string;
  artist?: string;
  releasedOn?: Date;
  description?: string;
  posterUrl?: string;
  posterCandidates?: Array<{ url: string; atSeconds: number; score: number }>;
  enriched?: boolean;
}

const seedVideo = async ({
  label,
  category = 'MUSIC',
  title = `E2E Editorial ${label} ${STAMP}`,
  artist = `ZZ E2E Editorial Artist ${STAMP}`,
  enriched = false,
  ...rest
}: VideoSeed): Promise<string> => {
  const { id } = await prisma.video.create({
    data: {
      title,
      artist,
      category,
      s3Key: `media/videos/e2e/e2e-editorial-${label.toLowerCase()}-${STAMP}.mp4`,
      fileName: `e2e-editorial-${label.toLowerCase()}.mp4`,
      mimeType: 'video/mp4',
      fileSize: BigInt(1048576),
      archivedAt: ARCHIVED,
      ...(enriched ? { enrichmentStatus: 'succeeded', enrichedAt: ARCHIVED } : {}),
      ...rest,
    },
    select: { id: true },
  });
  made.push(id);
  return id;
};

const pendingReleaseDate = (videoId: string) =>
  prisma.videoEnrichmentSuggestion.create({
    data: {
      videoId,
      field: 'releasedOn',
      value: '2020-06-01',
      confidence: 'high',
      sources: ['https://musicbrainz.org/'],
    },
  });

const storedVideo = (id: string) =>
  prisma.video.findUniqueOrThrow({
    where: { id },
    select: {
      title: true,
      artist: true,
      releasedOn: true,
      publishedAt: true,
      posterUrl: true,
      posterCandidates: true,
    },
  });

const dateInput = (page: Page) => page.getByPlaceholder('mm/dd/yyyy').first();

const saveAndLeave = async (page: Page): Promise<void> => {
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForURL(/\/admin\/videos$/, { timeout: 30_000 });
};

test.afterAll(async () => {
  for (const id of made) {
    await deleteVideoCascade(id);
  }
  await prisma.$disconnect();
});

test.describe('Admin video editorial rules', () => {
  // #682: a MUSIC draft with no date looks its date up when opened, and the
  // found date saves itself; the date is never today.
  test('opening a dateless MUSIC draft looks up and saves its release date', async ({
    adminPage,
  }) => {
    const id = await seedVideo({ label: 'Dateless' });

    await adminPage.goto(`/admin/videos/${id}`);

    await expect(dateInput(adminPage)).toHaveValue('06/01/2020', { timeout: 20_000 });
    await expect(async () => {
      const { releasedOn } = await storedVideo(id);
      expect(releasedOn?.toISOString() ?? '').toMatch(/^2020-06-01/);
    }).toPass({ timeout: 15_000 });
  });

  // #743: a video is never published without a release date. An
  // informational video is never looked up, so it stays dateless.
  test('publishing a dateless draft is refused', async ({ adminPage }) => {
    const id = await seedVideo({ label: 'Unpublishable', category: 'INFORMATIONAL' });

    await adminPage.goto(`/admin/videos/${id}`);
    await expect(adminPage.getByRole('button', { name: 'Publish', exact: true })).toBeVisible({
      timeout: 15_000,
    });
    await adminPage.getByRole('button', { name: 'Publish', exact: true }).click();

    await expect(adminPage.getByText('Release date is required')).toBeVisible({
      timeout: 15_000,
    });
    expect((await storedVideo(id)).publishedAt).toBeNull();
  });

  // #698, #744: a description row an admin dismissed before descriptions
  // were auto-applied offers nothing; the editor shows the stored text.
  test('a dismissed description suggestion renders nothing', async ({ adminPage }) => {
    const description = `E2E stored description ${STAMP}`;
    const id = await seedVideo({
      label: 'Dismissed',
      releasedOn: ARCHIVED,
      description,
      enriched: true,
    });
    await prisma.videoEnrichmentSuggestion.create({
      data: {
        videoId: id,
        field: 'description',
        value: 'A dismissed suggestion',
        confidence: 'high',
        sources: ['https://musicbrainz.org/'],
        status: 'dismissed',
      },
    });

    await adminPage.goto(`/admin/videos/${id}`);
    const panel = adminPage.getByTestId('video-enrichment-panel');
    await expect(panel.getByTestId('video-enrichment-status-chip')).toHaveText('Enriched', {
      timeout: 15_000,
    });

    await expect(panel.getByLabel('Description', { exact: true })).toHaveValue(description);
    await expect(panel.getByTestId('video-description-suggestion')).toHaveCount(0);
  });

  // #707: a date the admin typed is kept; the pending suggestion is not
  // applied over it on the next visit.
  test('a typed release date survives a revisit with a pending suggestion', async ({
    adminPage,
  }) => {
    const id = await seedVideo({
      label: 'Typed',
      releasedOn: new Date('2026-02-01T00:00:00.000Z'),
      enriched: true,
    });
    await pendingReleaseDate(id);

    await adminPage.goto(`/admin/videos/${id}`);
    await expect(dateInput(adminPage)).toHaveValue('02/01/2026', { timeout: 15_000 });
    await dateInput(adminPage).fill('03/04/2021');
    await saveAndLeave(adminPage);

    await adminPage.goto(`/admin/videos/${id}`);
    await expect(dateInput(adminPage)).toHaveValue('03/04/2021', { timeout: 15_000 });
    const card = adminPage.getByTestId('video-release-date-suggestion');
    await expect(card.getByRole('button', { name: 'Apply Release date suggestion' })).toBeEnabled();
    await expect(card.getByText('Applied', { exact: true })).toHaveCount(0);
  });

  // #590: "Use this date" fills the form; Save stores it.
  test('an applied release date suggestion is saved', async ({ adminPage }) => {
    const id = await seedVideo({
      label: 'Applied',
      releasedOn: new Date('2026-02-02T00:00:00.000Z'),
      enriched: true,
    });
    await pendingReleaseDate(id);

    await adminPage.goto(`/admin/videos/${id}`);
    const card = adminPage.getByTestId('video-release-date-suggestion');
    await card.getByRole('button', { name: 'Apply Release date suggestion' }).click();
    await expect(dateInput(adminPage)).toHaveValue('06/01/2020', { timeout: 15_000 });
    await saveAndLeave(adminPage);

    expect((await storedVideo(id)).releasedOn?.toISOString() ?? '').toMatch(/^2020-06-01/);
  });

  // #679: replacing the file re-derives the title and artist from it.
  test('replacing the file re-derives the title and artist', async ({ adminPage }) => {
    // A replacement uploads, re-extracts and, on Save, re-kicks server-side
    // work; under parallel load the save round trip outlasts the default
    // budget, as in the draft-upload spec.
    test.slow();
    const id = await seedVideo({
      label: 'Replaced',
      title: `E2E Old Song ${STAMP}`,
      artist: `ZZ E2E Old Artist ${STAMP}`,
      releasedOn: new Date('2026-02-03T00:00:00.000Z'),
    });

    await adminPage.goto(`/admin/videos/${id}`);
    await expect(adminPage.getByLabel('Title')).toHaveValue(`E2E Old Song ${STAMP}`, {
      timeout: 15_000,
    });
    await adminPage
      .getByTestId('video-dropzone')
      .locator('input[type="file"]')
      .setInputFiles({
        name: `ZZ E2E New Artist ${STAMP} - E2E New Song ${STAMP}.mp4`,
        mimeType: 'video/mp4',
        buffer: Buffer.from('e2e-not-a-real-video'),
      });

    await expect(adminPage.getByLabel('Title')).toHaveValue(`E2E New Song ${STAMP}`, {
      timeout: 15_000,
    });
    await expect(adminPage.getByRole('combobox', { name: 'Artist / Creator' })).toContainText(
      `ZZ E2E New Artist ${STAMP}`
    );
    await saveAndLeave(adminPage);

    const { title, artist } = await storedVideo(id);
    expect({ title, artist }).toEqual({
      title: `E2E New Song ${STAMP}`,
      artist: `ZZ E2E New Artist ${STAMP}`,
    });
  });

  // #727, #730: a replacement no browser can decode yields no frames, so the
  // old poster and its captured frames go with the old file.
  test('an undecodable replacement leaves no poster and no frames', async ({ adminPage }) => {
    // A replacement uploads, re-extracts and, on Save, re-kicks server-side
    // work; under parallel load the save round trip outlasts the default
    // budget, as in the draft-upload spec.
    test.slow();
    const frame = (n: number) => ({
      url: `https://example.com/e2e-editorial-frame-${n}-${STAMP}.jpg`,
      atSeconds: 3 + n,
      score: 0.5,
    });
    const id = await seedVideo({
      label: 'Posterless',
      releasedOn: new Date('2026-02-04T00:00:00.000Z'),
      posterUrl: frame(0).url,
      posterCandidates: [frame(0), frame(1), frame(2)],
    });

    await adminPage.goto(`/admin/videos/${id}`);
    const frames = adminPage.getByRole('radiogroup', { name: 'Captured poster frames' });
    await expect(frames.getByRole('radio')).toHaveCount(3, { timeout: 15_000 });
    await adminPage
      .getByTestId('video-dropzone')
      .locator('input[type="file"]')
      .setInputFiles({
        name: `ZZ E2E Editorial Artist ${STAMP} - E2E Posterless ${STAMP}.mp4`,
        mimeType: 'video/mp4',
        buffer: Buffer.from('e2e-not-a-real-video'),
      });

    // The new title proves the replacement landed; the form shows the row's
    // stored frames until the save, which drops them with the old file.
    await expect(adminPage.getByLabel('Title')).toHaveValue(`E2E Posterless ${STAMP}`, {
      timeout: 15_000,
    });
    await saveAndLeave(adminPage);

    const { posterUrl, posterCandidates } = await storedVideo(id);
    expect({ posterUrl, posterCandidates }).toEqual({ posterUrl: null, posterCandidates: [] });
    await adminPage.goto(`/admin/videos/${id}`);
    await expect(adminPage.getByLabel('Title')).toBeVisible({ timeout: 15_000 });
    await expect(frames).toHaveCount(0);
  });
});
