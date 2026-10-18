/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { PrismaClient } from '@prisma/client';
import NodeID3 from 'node-id3';

import { expect, test } from '../fixtures/auth.fixture';

import type { Page } from '@playwright/test';

/**
 * A real MP3 through the format upload module in create mode: the web server
 * runs with `E2E_MODE`, so the upload route and the confirm action share the
 * local object store, and the file never leaves the process.
 *
 * Parallel safety: the upload test tags its file with an album title no other
 * row holds and hard-deletes only the Release with that title. The refusal
 * test only reads the seeded "E2E Album One".
 */

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

const FIXTURE_MP3 = path.join(process.cwd(), 'public/e2e/audio/e2e-track-320.mp3');

const SEEDED_ALBUM = 'E2E Album One';

const TAKEN_COPY = `A release titled "${SEEDED_ALBUM}" already exists. Open it from Releases to upload its formats.`;

/** A fresh folder holding one copy of the E2E MP3, tagged with `album` and no artist. */
const mp3FolderTagged = async (album: string): Promise<string> => {
  const folder = await mkdtemp(path.join(tmpdir(), 'e2e-format-upload-'));
  const file = path.join(folder, '01-track.mp3');
  await copyFile(FIXTURE_MP3, file);
  const written = NodeID3.write({ album }, file);
  if (written !== true) {
    throw written;
  }
  return folder;
};

/**
 * Open the MP3 320kbps item and pick `folder` in its folder input. The item
 * is a Radix accordion, so its content (and the input) exists only once a
 * hydrated click opened it; click again only while it reads closed.
 */
const pickMp3Folder = async (page: Page, folder: string): Promise<void> => {
  const trigger = page.getByRole('button', { name: /MP3 320kbps/ });
  await expect(async () => {
    if ((await trigger.getAttribute('data-state')) !== 'open') {
      await trigger.click();
    }
    await expect(trigger).toHaveAttribute('data-state', 'open', { timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await page.getByLabel('Upload MP3 320kbps folder').setInputFiles(folder);
};

/** Hard-delete a spec-created Release and every format row on it. */
const deleteReleaseTitled = async (title: string): Promise<void> => {
  const release = await prisma.release.findFirst({ where: { title }, select: { id: true } });
  if (!release) {
    return;
  }
  const releaseId = release.id;
  await prisma.releaseDigitalFormatFile.deleteMany({ where: { format: { releaseId } } });
  await prisma.releaseDigitalFormat.deleteMany({ where: { releaseId } });
  await prisma.artistRelease.deleteMany({ where: { releaseId } });
  await prisma.release.deleteMany({ where: { id: releaseId } });
};

test.describe('Admin digital format upload (create mode)', () => {
  test.afterAll(async () => {
    await prisma.$disconnect();
  });

  test('a tagged MP3 creates its release and its MP3 320kbps format', async ({ adminPage }) => {
    const album = `E2E Upload ${randomUUID()}`;
    const folder = await mp3FolderTagged(album);

    try {
      await adminPage.goto('/admin/releases/new');
      await pickMp3Folder(adminPage, folder);

      await expect(adminPage).toHaveURL(/\/admin\/releases\/[a-f0-9]{24}$/, { timeout: 30_000 });
      await expect(adminPage.getByTestId('format-uploaded-checkmark')).toBeVisible({
        timeout: 15_000,
      });

      const releaseId = new URL(adminPage.url()).pathname.split('/').pop();
      const format = await prisma.releaseDigitalFormat.findFirst({
        where: { releaseId, formatType: 'MP3_320KBPS' },
        select: { s3Key: true, release: { select: { title: true } } },
      });
      const prefix = `releases/${releaseId}/digital-formats/MP3_320KBPS/`;
      expect(format?.release.title).toBe(album);
      expect(format?.s3Key?.startsWith(prefix)).toBe(true);
      expect(format?.s3Key?.slice(prefix.length)).toMatch(/^\d+-01-track\.mp3$/);
    } finally {
      await deleteReleaseTitled(album);
      await rm(folder, { recursive: true, force: true });
    }
  });

  test('an album title another release holds is refused before any file is sent', async ({
    adminPage,
  }) => {
    const folder = await mp3FolderTagged(SEEDED_ALBUM);
    const uploads: string[] = [];
    adminPage.on('request', (request) => {
      if (/^\/api\/releases\/[^/]+\/upload\//.test(new URL(request.url()).pathname)) {
        uploads.push(request.url());
      }
    });

    try {
      await adminPage.goto('/admin/releases/new');
      await pickMp3Folder(adminPage, folder);

      await expect(adminPage.getByRole('alert').filter({ hasText: TAKEN_COPY })).toBeVisible({
        timeout: 15_000,
      });
      await expect(
        adminPage.locator('[data-sonner-toast]').filter({ hasText: 'Failed to create release' })
      ).toContainText(TAKEN_COPY);
      await expect(adminPage).toHaveURL(/\/admin\/releases\/new$/);
      expect(uploads).toEqual([]);
      expect(
        await prisma.release.count({
          where: { title: { equals: SEEDED_ALBUM, mode: 'insensitive' } },
        })
      ).toBe(1);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
});
