/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { PrismaClient } from '@prisma/client';

import { expect, test } from '../fixtures/auth.fixture';
import { deleteUnlinkedArtistByDisplayName, deleteVideoCascade } from '../helpers/e2e-db';
import { pickVideoFile } from '../helpers/video-dropzone';

import type { Page } from '@playwright/test';

/**
 * Poster capture from a real upload (#612, #611, #704): picking a video
 * captures frames in the browser, uploads them, and stores them on the draft
 * with no Save. The fixture is a 12 s VP9/Opus WebM, long enough for the
 * sampler's 3–10 s window. Uploads land in the E2E upload sink, which serves
 * them back (upload-local-adapter.ts).
 */

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

const STAMP = randomUUID().slice(0, 8);
const ARTIST = `ZZ E2E Capture Artist ${STAMP}`;
const POSTER_SOURCE = readFileSync(resolve('e2e/fixtures/media/poster-source.webm'));
const CAPTURED_FRAMES = 5;
const made: string[] = [];

const uploadSource = async (page: Page, label: string): Promise<string> => {
  await page.goto('/admin/videos/new');
  await pickVideoFile(page, {
    name: `${ARTIST} - E2E Capture ${label} ${STAMP}.webm`,
    mimeType: 'video/webm',
    buffer: POSTER_SOURCE,
  });
  await page.waitForURL(/\/admin\/videos\/[0-9a-f]{24}$/, { timeout: 30_000 });
  const id = page.url().split('/').pop() ?? '';
  made.push(id);
  return id;
};

/** Pick a new source file on a video's edit page; resolves once its title lands. */
const replaceSource = async (page: Page, label: string): Promise<void> => {
  await pickVideoFile(page, {
    name: `${ARTIST} - E2E Capture ${label} ${STAMP}.webm`,
    mimeType: 'video/webm',
    buffer: POSTER_SOURCE,
  });
  await expect(page.getByLabel('Title')).toHaveValue(`E2E Capture ${label} ${STAMP}`, {
    timeout: 15_000,
  });
};

const uploadManualPoster = (page: Page): Promise<void> =>
  page.getByLabel('Upload a poster image').setInputFiles(resolve('public/icons/icon-512.png'));

const saveAndLeave = async (page: Page): Promise<void> => {
  // Save needs a release date. A draft reopened before its found date was
  // stored looks it up again, so wait for the field before saving.
  await expect(page.getByPlaceholder('mm/dd/yyyy').first()).toHaveValue('06/01/2020', {
    timeout: 20_000,
  });
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await page.waitForURL(/\/admin\/videos$/, { timeout: 30_000 });
};

const storedPoster = (id: string) =>
  prisma.video.findUniqueOrThrow({
    where: { id },
    select: { posterUrl: true, posterCandidates: true },
  });

// Each upload is a real, unarchived draft that the admin list counts, so it
// goes as soon as its test ends: the count-pinning specs tolerate a transient
// row, not one that lives for the whole file. The draft's artist sync runs
// after the response and links a VideoArtist; delete only once it has, or
// the link lands between the cascade's steps and the video delete fails.
test.afterEach(async () => {
  for (const id of made.splice(0)) {
    await expect
      .poll(() => prisma.videoArtist.count({ where: { videoId: id } }), { timeout: 15_000 })
      .toBeGreaterThan(0);
    await deleteVideoCascade(id);
  }
  await deleteUnlinkedArtistByDisplayName(ARTIST);
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

test.describe('Admin video poster capture', () => {
  // Each test uploads and decodes a real video and captures five frames. Two
  // at once stalled the dev server for 30s (every request from one page went
  // unanswered, auth included) while the production build kept up, so the
  // file runs in order in one worker.
  test.describe.configure({ mode: 'default' });

  test('an upload stores its captured frames, and a pick sticks', async ({ adminPage }) => {
    // A real upload, frame capture and five frame uploads, then two visits.
    test.slow();
    const id = await uploadSource(adminPage, 'Strip');

    const frames = adminPage.getByRole('radiogroup', { name: 'Captured poster frames' });
    await expect(frames.getByRole('radio')).toHaveCount(CAPTURED_FRAMES, { timeout: 30_000 });

    // Stored without a Save: the row holds the frames and a poster from them.
    await expect(async () => {
      const { posterUrl, posterCandidates } = await storedPoster(id);
      expect(posterCandidates).toHaveLength(CAPTURED_FRAMES);
      expect(posterCandidates.map(({ url }) => url)).toContain(posterUrl);
    }).toPass({ timeout: 30_000 });

    await adminPage.goto('/admin/videos');
    await adminPage.goto(`/admin/videos/${id}`);
    await expect(frames.getByRole('radio')).toHaveCount(CAPTURED_FRAMES, { timeout: 15_000 });
    await expect(frames.getByRole('radio', { checked: true })).toHaveCount(1);

    // Pick a frame that is not the poster; the pick is stored at once.
    const unchecked = frames.getByRole('radio', { checked: false }).first();
    const pickedName = await unchecked.getAttribute('aria-label');
    await unchecked.click();
    await adminPage.reload();
    await expect(frames.getByRole('radio', { checked: true })).toHaveAttribute(
      'aria-label',
      pickedName ?? '',
      { timeout: 15_000 }
    );
  });

  // #704, #727, #730: a replacement captures a new set, which replaces the
  // old frames and the old poster; picking from a second replacement raises
  // no error.
  test('replacing the file swaps the frames and the poster', async ({ adminPage }) => {
    test.slow();
    const id = await uploadSource(adminPage, 'Swap');
    const frames = adminPage.getByRole('radiogroup', { name: 'Captured poster frames' });
    let before = await storedPoster(id);
    await expect(async () => {
      before = await storedPoster(id);
      expect(before.posterCandidates).toHaveLength(CAPTURED_FRAMES);
    }).toPass({ timeout: 30_000 });

    // Still on the page that created the draft: the form survives the swap to
    // the edit URL (#842), so a file picked now is kept.
    await replaceSource(adminPage, 'Swap Two');
    await expect(frames.getByRole('radio')).toHaveCount(CAPTURED_FRAMES, { timeout: 30_000 });
    await replaceSource(adminPage, 'Swap Three');
    await expect(frames.getByRole('radio')).toHaveCount(CAPTURED_FRAMES, { timeout: 30_000 });
    await frames.getByRole('radio', { checked: false }).first().click();
    await saveAndLeave(adminPage);
    await expect(adminPage.locator('li[data-sonner-toast][data-type="error"]')).toHaveCount(0);

    const after = await storedPoster(id);
    const oldUrls = before.posterCandidates.map(({ url }) => url);
    expect(after.posterCandidates).toHaveLength(CAPTURED_FRAMES);
    expect(after.posterCandidates.filter(({ url }) => oldUrls.includes(url))).toEqual([]);
    expect(after.posterUrl).not.toBe(before.posterUrl);
    expect(after.posterCandidates.map(({ url }) => url)).toContain(after.posterUrl);
  });

  // #704, #730: a poster the admin uploads beats the captured frames, until
  // a file replacement drops it with the old file.
  test('a manual poster beats the capture until the file is replaced', async ({ adminPage }) => {
    test.slow();
    const id = await uploadSource(adminPage, 'Manual');
    const frames = adminPage.getByRole('radiogroup', { name: 'Captured poster frames' });
    await expect(frames.getByRole('radio')).toHaveCount(CAPTURED_FRAMES, { timeout: 30_000 });
    // Still on the page that created the draft: the form survives the swap to
    // the edit URL (#842), so a poster uploaded now is kept.
    await uploadManualPoster(adminPage);
    await expect(adminPage.getByRole('img', { name: 'Video poster' })).toHaveAttribute(
      'src',
      /icon-512/,
      { timeout: 15_000 }
    );
    await saveAndLeave(adminPage);

    const manual = await storedPoster(id);
    expect(manual.posterUrl).not.toBeNull();
    expect(manual.posterCandidates.map(({ url }) => url)).not.toContain(manual.posterUrl);

    await adminPage.goto(`/admin/videos/${id}`);
    await replaceSource(adminPage, 'Manual Two');
    await expect(frames.getByRole('radio')).toHaveCount(CAPTURED_FRAMES, { timeout: 30_000 });
    await saveAndLeave(adminPage);

    const replaced = await storedPoster(id);
    expect(replaced.posterUrl).not.toBe(manual.posterUrl);
    expect(replaced.posterCandidates.map(({ url }) => url)).toContain(replaced.posterUrl);
  });

  // #727, #730: a poster uploaded before any file survives that file's capture.
  test('a poster uploaded before the file survives its capture', async ({ adminPage }) => {
    test.slow();
    await adminPage.goto('/admin/videos/new');
    await uploadManualPoster(adminPage);
    await expect(adminPage.getByRole('img', { name: 'Video poster' })).toBeVisible({
      timeout: 15_000,
    });

    await pickVideoFile(adminPage, {
      name: `${ARTIST} - E2E Capture First ${STAMP}.webm`,
      mimeType: 'video/webm',
      buffer: POSTER_SOURCE,
    });
    await adminPage.waitForURL(/\/admin\/videos\/[0-9a-f]{24}$/, { timeout: 30_000 });
    const id = adminPage.url().split('/').pop() ?? '';
    made.push(id);

    await expect(async () => {
      const { posterUrl, posterCandidates } = await storedPoster(id);
      expect(posterUrl).not.toBeNull();
      expect(posterCandidates.map(({ url }) => url)).not.toContain(posterUrl);
    }).toPass({ timeout: 30_000 });
  });
});
