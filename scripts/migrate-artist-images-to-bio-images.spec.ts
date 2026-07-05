/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { migrateArtistImagesToBioImages } from './migrate-artist-images-to-bio-images';

import type { PrismaClient } from '@prisma/client';

interface ImageFixture {
  src: string | null;
  caption: string | null;
  altText: string | null;
  sortOrder: number;
}

interface ArtistFixture {
  id: string;
  displayName: string | null;
  images: ImageFixture[];
  bioImages: { url: string }[];
}

const makeMockPrisma = (artists: ArtistFixture[]) => {
  const findMany = vi.fn().mockResolvedValue(artists);
  const create = vi.fn().mockResolvedValue({ id: 'mock-id' });
  const disconnect = vi.fn().mockResolvedValue(undefined);
  const prisma = {
    artist: { findMany },
    artistBioImage: { create },
    $disconnect: disconnect,
  } as unknown as PrismaClient;
  return { prisma, findMany, create, disconnect };
};

describe('migrateArtistImagesToBioImages', () => {
  describe('dry-run (default — no --execute)', () => {
    it('reports counts but calls no artistBioImage.create', async () => {
      const { prisma, create } = makeMockPrisma([
        {
          id: 'artist-1',
          displayName: 'Test Artist',
          images: [
            {
              src: 'https://cdn.example.com/img1.jpg',
              caption: 'Caption',
              altText: 'Alt',
              sortOrder: 0,
            },
            { src: 'https://cdn.example.com/img2.jpg', caption: null, altText: null, sortOrder: 1 },
          ],
          bioImages: [],
        },
      ]);

      const result = await migrateArtistImagesToBioImages([], prisma);

      expect(create).not.toHaveBeenCalled();
      expect(result).toEqual({ scanned: 2, migrated: 2, skipped: 0 });
    });

    it('counts across multiple artists', async () => {
      const { prisma, create } = makeMockPrisma([
        {
          id: 'artist-1',
          displayName: 'Artist One',
          images: [
            { src: 'https://cdn.example.com/a1.jpg', caption: null, altText: null, sortOrder: 0 },
          ],
          bioImages: [],
        },
        {
          id: 'artist-2',
          displayName: 'Artist Two',
          images: [
            { src: 'https://cdn.example.com/a2.jpg', caption: null, altText: null, sortOrder: 0 },
            { src: 'https://cdn.example.com/a3.jpg', caption: null, altText: null, sortOrder: 1 },
          ],
          bioImages: [],
        },
      ]);

      const result = await migrateArtistImagesToBioImages([], prisma);

      expect(create).not.toHaveBeenCalled();
      expect(result).toEqual({ scanned: 3, migrated: 3, skipped: 0 });
    });
  });

  describe('--execute mode: creates bio images with correct field mapping', () => {
    it('maps url, title, alt, and attribution=caption when caption is present', async () => {
      const { prisma, create } = makeMockPrisma([
        {
          id: 'artist-1',
          displayName: 'Test Artist',
          images: [
            {
              src: 'https://cdn.example.com/img1.jpg',
              caption: 'My Caption',
              altText: 'My Alt',
              sortOrder: 3,
            },
          ],
          bioImages: [],
        },
      ]);

      await migrateArtistImagesToBioImages(['--execute'], prisma);

      expect(create).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledWith({
        data: {
          url: 'https://cdn.example.com/img1.jpg',
          title: 'My Caption',
          alt: 'My Alt',
          attribution: 'My Caption',
          kind: 'upload',
          isPrimary: false,
          sortOrder: 3,
          artistId: 'artist-1',
        },
      });
    });

    it('maps attribution=altText when caption is null and altText is present', async () => {
      const { prisma, create } = makeMockPrisma([
        {
          id: 'artist-1',
          displayName: 'Test Artist',
          images: [
            {
              src: 'https://cdn.example.com/img2.jpg',
              caption: null,
              altText: 'Descriptive Alt',
              sortOrder: 1,
            },
          ],
          bioImages: [],
        },
      ]);

      await migrateArtistImagesToBioImages(['--execute'], prisma);

      expect(create).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledWith({
        data: {
          url: 'https://cdn.example.com/img2.jpg',
          title: null,
          alt: 'Descriptive Alt',
          attribution: 'Descriptive Alt',
          kind: 'upload',
          isPrimary: false,
          sortOrder: 1,
          artistId: 'artist-1',
        },
      });
    });

    it('maps attribution=Uploaded when both caption and altText are null', async () => {
      const { prisma, create } = makeMockPrisma([
        {
          id: 'artist-1',
          displayName: 'Test Artist',
          images: [
            { src: 'https://cdn.example.com/img3.jpg', caption: null, altText: null, sortOrder: 2 },
          ],
          bioImages: [],
        },
      ]);

      await migrateArtistImagesToBioImages(['--execute'], prisma);

      expect(create).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledWith({
        data: {
          url: 'https://cdn.example.com/img3.jpg',
          title: null,
          alt: null,
          attribution: 'Uploaded',
          kind: 'upload',
          isPrimary: false,
          sortOrder: 2,
          artistId: 'artist-1',
        },
      });
    });

    it('returns correct counts after creating all three attribution variants', async () => {
      const { prisma, create } = makeMockPrisma([
        {
          id: 'artist-1',
          displayName: 'Test Artist',
          images: [
            {
              src: 'https://cdn.example.com/img1.jpg',
              caption: 'Caption 1',
              altText: 'Alt 1',
              sortOrder: 0,
            },
            {
              src: 'https://cdn.example.com/img2.jpg',
              caption: null,
              altText: 'Alt 2',
              sortOrder: 1,
            },
            { src: 'https://cdn.example.com/img3.jpg', caption: null, altText: null, sortOrder: 2 },
          ],
          bioImages: [],
        },
      ]);

      const result = await migrateArtistImagesToBioImages(['--execute'], prisma);

      expect(create).toHaveBeenCalledTimes(3);
      expect(result).toEqual({ scanned: 3, migrated: 3, skipped: 0 });
    });
  });

  describe('idempotency', () => {
    it('skips images whose src already exists in bioImages (exact-URL match)', async () => {
      const { prisma, create } = makeMockPrisma([
        {
          id: 'artist-1',
          displayName: 'Test Artist',
          images: [
            {
              src: 'https://cdn.example.com/existing.jpg',
              caption: null,
              altText: null,
              sortOrder: 0,
            },
            { src: 'https://cdn.example.com/new.jpg', caption: null, altText: null, sortOrder: 1 },
          ],
          bioImages: [{ url: 'https://cdn.example.com/existing.jpg' }],
        },
      ]);

      const result = await migrateArtistImagesToBioImages(['--execute'], prisma);

      expect(create).toHaveBeenCalledTimes(1);
      expect(create).toHaveBeenCalledWith({
        data: expect.objectContaining({ url: 'https://cdn.example.com/new.jpg' }),
      });
      expect(result).toEqual({ scanned: 2, migrated: 1, skipped: 1 });
    });

    it('skips all images when every src already exists in bioImages', async () => {
      const { prisma, create } = makeMockPrisma([
        {
          id: 'artist-1',
          displayName: 'Test Artist',
          images: [
            { src: 'https://cdn.example.com/img1.jpg', caption: null, altText: null, sortOrder: 0 },
          ],
          bioImages: [{ url: 'https://cdn.example.com/img1.jpg' }],
        },
      ]);

      const result = await migrateArtistImagesToBioImages(['--execute'], prisma);

      expect(create).not.toHaveBeenCalled();
      expect(result).toEqual({ scanned: 1, migrated: 0, skipped: 1 });
    });
  });

  describe('empty/null src filtering', () => {
    it('skips images with null src', async () => {
      const { prisma, create } = makeMockPrisma([
        {
          id: 'artist-1',
          displayName: 'Test Artist',
          images: [
            { src: null, caption: 'Caption', altText: 'Alt', sortOrder: 0 },
            {
              src: 'https://cdn.example.com/valid.jpg',
              caption: null,
              altText: null,
              sortOrder: 1,
            },
          ],
          bioImages: [],
        },
      ]);

      const result = await migrateArtistImagesToBioImages(['--execute'], prisma);

      expect(create).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ scanned: 2, migrated: 1, skipped: 1 });
    });

    it('skips images with empty string src', async () => {
      const { prisma, create } = makeMockPrisma([
        {
          id: 'artist-1',
          displayName: 'Test Artist',
          images: [
            { src: '', caption: null, altText: null, sortOrder: 0 },
            {
              src: 'https://cdn.example.com/valid.jpg',
              caption: null,
              altText: null,
              sortOrder: 1,
            },
          ],
          bioImages: [],
        },
      ]);

      const result = await migrateArtistImagesToBioImages(['--execute'], prisma);

      expect(create).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ scanned: 2, migrated: 1, skipped: 1 });
    });

    it('skips null and empty src together while counting correctly', async () => {
      const { prisma, create } = makeMockPrisma([
        {
          id: 'artist-1',
          displayName: 'Test Artist',
          images: [
            { src: null, caption: 'Caption', altText: 'Alt', sortOrder: 0 },
            { src: '', caption: null, altText: null, sortOrder: 1 },
            {
              src: 'https://cdn.example.com/valid.jpg',
              caption: null,
              altText: null,
              sortOrder: 2,
            },
          ],
          bioImages: [],
        },
      ]);

      const result = await migrateArtistImagesToBioImages(['--execute'], prisma);

      expect(create).toHaveBeenCalledTimes(1);
      expect(result).toEqual({ scanned: 3, migrated: 1, skipped: 2 });
    });
  });

  describe('PrismaClient lifecycle', () => {
    it('does not disconnect an injected PrismaClient', async () => {
      const { prisma, disconnect } = makeMockPrisma([]);

      await migrateArtistImagesToBioImages([], prisma);

      expect(disconnect).not.toHaveBeenCalled();
    });

    it('returns zero counts when no artists exist', async () => {
      const { prisma } = makeMockPrisma([]);

      const result = await migrateArtistImagesToBioImages([], prisma);

      expect(result).toEqual({ scanned: 0, migrated: 0, skipped: 0 });
    });

    it('returns zero counts when an artist has no images', async () => {
      const { prisma } = makeMockPrisma([
        { id: 'artist-1', displayName: 'No Images Artist', images: [], bioImages: [] },
      ]);

      const result = await migrateArtistImagesToBioImages([], prisma);

      expect(result).toEqual({ scanned: 0, migrated: 0, skipped: 0 });
    });
  });
});
