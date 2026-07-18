/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { PrismaClient } from '@prisma/client';

import { expect, test } from '../fixtures/base.fixture';

const E2E_DATABASE_URL =
  process.env.E2E_DATABASE_URL || 'mongodb://localhost:27018/boudreaux-e2e?replicaSet=rs0';

const prisma = new PrismaClient({ datasourceUrl: E2E_DATABASE_URL });

let e2eRelease1Id: string;

test.beforeAll(async () => {
  const release = await prisma.release.findFirstOrThrow({
    where: { title: 'E2E Album One' },
    select: { id: true },
  });
  e2eRelease1Id = release.id;
});

test.afterAll(async () => {
  await prisma.$disconnect();
});

/**
 * Volume/mute persist to localStorage (key `boudreaux-player-prefs`) and are
 * applied to every Video.js player on ready. Drive the media element directly
 * (deterministic — no slider drags) and assert the store round-trip.
 */
test.describe('Player volume persistence', () => {
  test('a volume change persists and re-applies after reload', async ({ userPage }) => {
    await userPage.goto(`/releases/${e2eRelease1Id}`);

    // Video.js wraps the <audio> element in a .video-js container div and adds
    // the vjs-tech class to the underlying media element. Scope to the
    // data-vjs-player container to survive DOM restructuring.
    const audio = userPage.locator('[data-vjs-player] audio.vjs-tech');
    await expect(audio).toBeAttached();

    // Setting .volume on the media element fires volumechange, which Video.js
    // relays to the binding — the write path users hit via the volume slider.
    await audio.evaluate((element) => {
      (element as HTMLAudioElement).volume = 0.37;
    });

    await expect
      .poll(async () =>
        userPage.evaluate(() => {
          const raw = localStorage.getItem('boudreaux-player-prefs');
          if (!raw) return null;
          return (JSON.parse(raw) as { state: { volume: number } }).state.volume;
        })
      )
      .toBeCloseTo(0.37, 2);

    await userPage.reload();
    const audioAfterReload = userPage.locator('[data-vjs-player] audio.vjs-tech');
    await expect(audioAfterReload).toBeAttached();

    // The binding applies the stored volume on player ready.
    await expect
      .poll(async () =>
        audioAfterReload.evaluate((element) => (element as HTMLAudioElement).volume)
      )
      .toBeCloseTo(0.37, 2);
  });
});
