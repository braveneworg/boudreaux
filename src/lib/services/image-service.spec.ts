/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { ImageService } from './image-service';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    image: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

const { prisma } = await import('@/lib/prisma');

describe('ImageService.registerForArtist', () => {
  beforeEach(() => vi.clearAllMocks());

  it('seeds sortOrder from existing-row count and writes artistId on each row', async () => {
    vi.mocked(prisma.image.findMany).mockResolvedValue([{ id: 'a' }, { id: 'b' }] as never);
    vi.mocked(prisma.image.create)
      .mockResolvedValueOnce({
        id: 'img-1',
        src: 'https://cdn.example.com/1',
        caption: 'cap',
        altText: 'alt',
        sortOrder: 2,
      } as never)
      .mockResolvedValueOnce({
        id: 'img-2',
        src: 'https://cdn.example.com/2',
        caption: null,
        altText: null,
        sortOrder: 3,
      } as never);

    const result = await ImageService.registerForArtist('artist-1', [
      { cdnUrl: 'https://cdn.example.com/1', caption: 'cap', altText: 'alt' },
      { cdnUrl: 'https://cdn.example.com/2' },
    ]);

    expect(prisma.image.findMany).toHaveBeenCalledWith({
      where: { artistId: 'artist-1' },
      select: { id: true },
    });
    expect(prisma.image.create).toHaveBeenNthCalledWith(1, {
      data: {
        src: 'https://cdn.example.com/1',
        caption: 'cap',
        altText: 'alt',
        artistId: 'artist-1',
        sortOrder: 2,
      },
    });
    expect(prisma.image.create).toHaveBeenNthCalledWith(2, {
      data: {
        src: 'https://cdn.example.com/2',
        caption: undefined,
        altText: undefined,
        artistId: 'artist-1',
        sortOrder: 3,
      },
    });
    expect(result).toEqual([
      {
        id: 'img-1',
        src: 'https://cdn.example.com/1',
        caption: 'cap',
        altText: 'alt',
        sortOrder: 2,
      },
      {
        id: 'img-2',
        src: 'https://cdn.example.com/2',
        caption: undefined,
        altText: undefined,
        sortOrder: 3,
      },
    ]);
  });

  it('falls back to empty src and the seed sortOrder when prisma returns nullish values', async () => {
    vi.mocked(prisma.image.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.image.create).mockResolvedValue({
      id: 'img-1',
      src: null,
      caption: null,
      altText: null,
      sortOrder: null,
    } as never);

    const result = await ImageService.registerForArtist('artist-1', [
      { cdnUrl: 'https://cdn.example.com/1' },
    ]);

    expect(result).toEqual([
      {
        id: 'img-1',
        src: '',
        caption: undefined,
        altText: undefined,
        sortOrder: 0,
      },
    ]);
  });

  it('returns [] when no images are supplied (and skips create entirely)', async () => {
    vi.mocked(prisma.image.findMany).mockResolvedValue([] as never);

    const result = await ImageService.registerForArtist('artist-1', []);

    expect(result).toEqual([]);
    expect(prisma.image.create).not.toHaveBeenCalled();
  });
});

describe('ImageService.registerForRelease', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses releaseId for both the existing-count query and the create call', async () => {
    vi.mocked(prisma.image.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.image.create).mockResolvedValue({
      id: 'img-1',
      src: 'https://cdn.example.com/1',
      caption: null,
      altText: null,
      sortOrder: 0,
    } as never);

    await ImageService.registerForRelease('release-1', [{ cdnUrl: 'https://cdn.example.com/1' }]);

    expect(prisma.image.findMany).toHaveBeenCalledWith({
      where: { releaseId: 'release-1' },
      select: { id: true },
    });
    expect(prisma.image.create).toHaveBeenCalledWith({
      data: {
        src: 'https://cdn.example.com/1',
        caption: undefined,
        altText: undefined,
        releaseId: 'release-1',
        sortOrder: 0,
      },
    });
  });
});
