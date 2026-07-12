/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { prisma } from '@/lib/prisma';

import { VideoArtistRepository } from './video-artist-repository';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/prisma', () => {
  const videoArtist = { deleteMany: vi.fn(), createMany: vi.fn(), findMany: vi.fn() };
  return {
    prisma: {
      videoArtist,
      $transaction: vi.fn(
        async (fn: (tx: { videoArtist: typeof videoArtist }) => Promise<unknown>) =>
          fn({ videoArtist })
      ),
    },
  };
});

const VIDEO_ID = 'f'.repeat(24);
const ARTIST_ID = 'a'.repeat(24);

describe('VideoArtistRepository', () => {
  describe('replaceForVideo', () => {
    it('deletes the existing join rows then bulk-creates the new batch', async () => {
      vi.mocked(prisma.videoArtist.deleteMany).mockResolvedValue({ count: 2 });
      vi.mocked(prisma.videoArtist.createMany).mockResolvedValue({ count: 2 });

      await VideoArtistRepository.replaceForVideo(VIDEO_ID, [
        { artistId: ARTIST_ID, role: 'PRIMARY', sortOrder: 0 },
        { artistId: 'b'.repeat(24), role: 'FEATURED', sortOrder: 1 },
      ]);

      expect(prisma.videoArtist.deleteMany).toHaveBeenCalledWith({
        where: { videoId: VIDEO_ID },
      });
      expect(prisma.videoArtist.createMany).toHaveBeenCalledWith({
        data: [
          { artistId: ARTIST_ID, role: 'PRIMARY', sortOrder: 0, videoId: VIDEO_ID },
          { artistId: 'b'.repeat(24), role: 'FEATURED', sortOrder: 1, videoId: VIDEO_ID },
        ],
      });
    });

    it('skips createMany for an empty batch', async () => {
      vi.mocked(prisma.videoArtist.deleteMany).mockResolvedValue({ count: 1 });

      await VideoArtistRepository.replaceForVideo(VIDEO_ID, []);

      expect(prisma.videoArtist.createMany).not.toHaveBeenCalled();
    });
  });

  describe('findByVideoId', () => {
    it('selects the identity projection ordered by sortOrder', async () => {
      const row = {
        artistId: ARTIST_ID,
        role: 'PRIMARY',
        sortOrder: 0,
        artist: {
          displayName: 'Ceschi',
          firstName: 'Francisco',
          middleName: null,
          surname: 'Ramos',
          akaNames: null,
          bornOn: null,
        },
      };
      vi.mocked(prisma.videoArtist.findMany).mockResolvedValue([row] as never);

      const result = await VideoArtistRepository.findByVideoId(VIDEO_ID);

      expect(result).toEqual([row]);
      expect(prisma.videoArtist.findMany).toHaveBeenCalledWith({
        where: { videoId: VIDEO_ID },
        orderBy: { sortOrder: 'asc' },
        select: {
          artistId: true,
          role: true,
          sortOrder: true,
          artist: {
            select: {
              displayName: true,
              firstName: true,
              middleName: true,
              surname: true,
              akaNames: true,
              bornOn: true,
            },
          },
        },
      });
    });
  });

  describe('deleteByVideoId', () => {
    it('deletes every join row for the video', async () => {
      vi.mocked(prisma.videoArtist.deleteMany).mockResolvedValue({ count: 3 });

      await VideoArtistRepository.deleteByVideoId(VIDEO_ID);

      expect(prisma.videoArtist.deleteMany).toHaveBeenCalledWith({
        where: { videoId: VIDEO_ID },
      });
    });
  });
});
