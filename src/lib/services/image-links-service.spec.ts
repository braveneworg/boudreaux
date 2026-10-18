/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { DataError } from '@/lib/types/domain/errors';
import { imageLinksCallbackSchema, MAX_IMAGE_LINKS } from '@/lib/validation/image-links-schema';

import { imageLinksJob, ImageLinksService } from './image-links-service';

vi.mock('server-only', () => ({}));

const mockLoggerWarn = vi.hoisted(() => vi.fn());
const mockLoggerError = vi.hoisted(() => vi.fn());
const findByIdMock = vi.hoisted(() => vi.fn());
const setImageLinksStatusMock = vi.hoisted(() => vi.fn());
const beginImageLinksRunMock = vi.hoisted(() => vi.fn());
const setImageLinksJobTokenMock = vi.hoisted(() => vi.fn());
const claimImageLinksJobTokenMock = vi.hoisted(() => vi.fn());
const getImageLinksJobStateMock = vi.hoisted(() => vi.fn());
const findImageSourcesMock = vi.hoisted(() => vi.fn());
const existsByIdMock = vi.hoisted(() => vi.fn());
const upsertImageSourceMock = vi.hoisted(() => vi.fn());
const removeImageSourceMock = vi.hoisted(() => vi.fn());
const findCustomUrlsMock = vi.hoisted(() => vi.fn());
const findExistingUrlsMock = vi.hoisted(() => vi.fn());
const findFingerprintsMock = vi.hoisted(() => vi.fn());
const createManyMock = vi.hoisted(() => vi.fn());
const rehostImagesMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/utils/logger', () => ({
  loggers: { media: { warn: mockLoggerWarn, error: mockLoggerError, info: vi.fn() } },
}));

vi.mock('@/lib/repositories/artist-repository', () => ({
  ArtistRepository: {
    findById: (id: string) => findByIdMock(id),
    existsById: (id: string) => existsByIdMock(id),
    setImageLinksStatus: (id: string, status: string, opts: unknown) =>
      setImageLinksStatusMock(id, status, opts),
    beginImageLinksRun: (id: string, now: Date) => beginImageLinksRunMock(id, now),
    setImageLinksJobToken: (id: string, token: string | null) =>
      setImageLinksJobTokenMock(id, token),
    claimImageLinksJobToken: (id: string, token: string) => claimImageLinksJobTokenMock(id, token),
    getImageLinksJobState: (id: string) => getImageLinksJobStateMock(id),
  },
}));

vi.mock('@/lib/repositories/artist-bio-link-repository', () => ({
  ArtistBioLinkRepository: {
    findImageSources: (id: string) => findImageSourcesMock(id),
    upsertImageSource: (id: string, url: string, label: string) =>
      upsertImageSourceMock(id, url, label),
    removeImageSource: (id: string, linkId: string) => removeImageSourceMock(id, linkId),
  },
}));

vi.mock('@/lib/repositories/artist-bio-image-repository', () => ({
  ArtistBioImageRepository: {
    findCustomUrls: (id: string) => findCustomUrlsMock(id),
    findExistingUrls: (id: string) => findExistingUrlsMock(id),
    findFingerprints: (id: string, origins?: string[]) => findFingerprintsMock(id, origins),
    createMany: (rows: unknown[]) => createManyMock(rows),
  },
}));

vi.mock('./bio-image-service', () => ({
  BioImageService: {
    rehostImages: (
      images: ReadonlyArray<{ url: string; index: number }>,
      artistId: string,
      knownImages: unknown
    ) => rehostImagesMock(images, artistId, knownImages),
  },
}));

const artist = {
  id: 'a1',
  displayName: 'Ceschi',
  firstName: 'C',
  middleName: null,
  surname: 'R',
  isPseudonymous: true,
  slug: 'ceschi',
};

const sourceLinks = [
  { id: 'l1', url: 'https://press.test/kit', label: 'press.test' },
  { id: 'l2', url: 'https://photos.test/a.jpg', label: 'photos.test' },
];

beforeEach(() => {
  findByIdMock.mockResolvedValue(artist);
  findImageSourcesMock.mockResolvedValue(sourceLinks);
  findCustomUrlsMock.mockResolvedValue(['https://cdn/custom-1.jpg']);
  findExistingUrlsMock.mockResolvedValue(new Set<string>());
  findFingerprintsMock.mockResolvedValue([]);
  createManyMock.mockResolvedValue(0);
  rehostImagesMock.mockResolvedValue({ results: [], duplicateAliases: new Map() });
});

describe('ImageLinksService.addSourceLink / removeSourceLink', () => {
  const atCap = Array.from({ length: MAX_IMAGE_LINKS }, (_, index) => ({
    id: `l${index}`,
    url: `https://press.test/${index}`,
    label: 'press.test',
  }));

  it('reports not-found when the artist does not exist', async () => {
    existsByIdMock.mockResolvedValueOnce(false);

    expect(await ImageLinksService.addSourceLink('a1', 'https://x.test/p')).toEqual({
      status: 'not-found',
    });
    expect(upsertImageSourceMock).not.toHaveBeenCalled();
  });

  it('sanitizes the URL, derives the label and returns the wire shape', async () => {
    existsByIdMock.mockResolvedValueOnce(true);
    upsertImageSourceMock.mockResolvedValueOnce({
      id: 'l1',
      label: 'x.test',
      url: 'https://x.test/p',
      kind: 'other',
    });

    const result = await ImageLinksService.addSourceLink('a1', 'https://x.test/p ');

    expect(upsertImageSourceMock.mock.calls).toEqual([['a1', 'https://x.test/p', 'x.test']]);
    expect(result).toEqual({
      status: 'added',
      link: { id: 'l1', label: 'x.test', url: 'https://x.test/p' },
    });
  });

  it('refuses a new URL once the artist already has MAX_IMAGE_LINKS sources', async () => {
    existsByIdMock.mockResolvedValueOnce(true);
    findImageSourcesMock.mockResolvedValueOnce(atCap);

    expect(await ImageLinksService.addSourceLink('a1', 'https://x.test/new')).toEqual({
      status: 'limit',
    });
    expect(upsertImageSourceMock).not.toHaveBeenCalled();
  });

  it('still accepts a URL that is already one of the sources at the cap (idempotent)', async () => {
    existsByIdMock.mockResolvedValueOnce(true);
    findImageSourcesMock.mockResolvedValueOnce(atCap);
    upsertImageSourceMock.mockResolvedValueOnce(atCap[0]);

    expect(await ImageLinksService.addSourceLink('a1', atCap[0].url)).toEqual({
      status: 'added',
      link: atCap[0],
    });
  });

  it('retries the upsert once when a concurrent add loses the unique index', async () => {
    existsByIdMock.mockResolvedValueOnce(true);
    upsertImageSourceMock
      .mockRejectedValueOnce(new DataError('DUPLICATE', 'Unique constraint failed'))
      .mockResolvedValueOnce({ id: 'l1', label: 'x.test', url: 'https://x.test/p' });

    const result = await ImageLinksService.addSourceLink('a1', 'https://x.test/p');

    expect(upsertImageSourceMock).toHaveBeenCalledTimes(2);
    expect(result).toEqual({
      status: 'added',
      link: { id: 'l1', label: 'x.test', url: 'https://x.test/p' },
    });
  });

  it('rethrows a non-duplicate repository error from the upsert', async () => {
    existsByIdMock.mockResolvedValueOnce(true);
    upsertImageSourceMock.mockRejectedValueOnce(new DataError('UNAVAILABLE', 'Connection failed'));

    await expect(ImageLinksService.addSourceLink('a1', 'https://x.test/p')).rejects.toThrow(
      'Connection failed'
    );
    expect(upsertImageSourceMock).toHaveBeenCalledTimes(1);
  });

  it('removeSourceLink delegates to the repository', async () => {
    removeImageSourceMock.mockResolvedValueOnce(true);

    expect(await ImageLinksService.removeSourceLink('a1', 'l1')).toBe(true);
    expect(removeImageSourceMock.mock.calls).toEqual([['a1', 'l1']]);
  });
});

describe('imageLinksJob.prepare', () => {
  it('builds the images-from-links request from the artist and its sources', async () => {
    expect(await imageLinksJob.prepare('a1', undefined)).toEqual({
      ok: true,
      request: {
        task: 'images-from-links',
        artistId: 'a1',
        displayName: 'Ceschi',
        links: ['https://press.test/kit', 'https://photos.test/a.jpg'],
        referenceImageUrls: ['https://cdn/custom-1.jpg'],
      },
    });
  });

  it('fails when the artist is missing', async () => {
    findByIdMock.mockResolvedValueOnce(null);

    expect(await imageLinksJob.prepare('a1', undefined)).toEqual({
      ok: false,
      error: 'Artist not found.',
    });
  });

  it('fails when the artist has no name to match faces against', async () => {
    findByIdMock.mockResolvedValueOnce({
      ...artist,
      displayName: null,
      firstName: '',
      surname: '',
      akaNames: null,
    });

    expect(await imageLinksJob.prepare('a1', undefined)).toEqual({
      ok: false,
      error: 'Artist has no name to match faces against.',
    });
  });

  it('fails when the artist has no image-source links', async () => {
    findImageSourcesMock.mockResolvedValueOnce([]);

    expect(await imageLinksJob.prepare('a1', undefined)).toEqual({
      ok: false,
      error: 'Add at least one link first.',
    });
  });

  it('caps the links sent to the Lambda at MAX_IMAGE_LINKS', async () => {
    findImageSourcesMock.mockResolvedValueOnce(
      Array.from({ length: 25 }, (_, i) => ({
        id: `l${i}`,
        url: `https://x.test/${i}`,
        label: 'x',
      }))
    );

    const prepared = await imageLinksJob.prepare('a1', undefined);

    expect(prepared.ok && prepared.request.links).toHaveLength(MAX_IMAGE_LINKS);
  });

  it('omits reference images and warns when the custom-image lookup fails', async () => {
    findCustomUrlsMock.mockRejectedValueOnce(new Error('db'));

    const prepared = await imageLinksJob.prepare('a1', undefined);

    expect(prepared).toMatchObject({ ok: true, request: { referenceImageUrls: undefined } });
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'image_links_reference_images_failed',
      expect.objectContaining({ artistId: 'a1' })
    );
  });
});

describe('imageLinksJob — the artist images-from-links columns', () => {
  const ID = 'a1';
  const START = new Date('2026-10-18T12:00:00.000Z');
  const record = {
    slug: 'ceschi',
    imageLinksStatus: 'processing',
    imageLinksError: 'earlier',
    imageLinksStartedAt: START,
    imageLinksJobToken: 'tok',
    imageLinksAddedCount: null,
  };

  it('reads the images-from-links state', async () => {
    getImageLinksJobStateMock.mockResolvedValueOnce(record);

    expect(await imageLinksJob.read(ID)).toBe(record);
    expect(getImageLinksJobStateMock).toHaveBeenCalledWith(ID);
  });

  it('maps its lifecycle columns onto the job state, with no progress', () => {
    expect(imageLinksJob.state(record)).toEqual({
      status: 'processing',
      startedAt: START,
      error: 'earlier',
      jobToken: 'tok',
      progress: null,
    });
  });

  it('hands a won claim the artist slug', () => {
    expect(imageLinksJob.claimContext(record)).toEqual({ slug: 'ceschi' });
  });

  it('answers on the images-from-links callback route and has no progress channel', () => {
    expect(imageLinksJob.callbackPath(ID)).toBe('/api/artists/a1/image-links/callback');
    expect(imageLinksJob.progress).toBeUndefined();
  });

  it.each([
    [
      'marks pending with a cleared error and its start',
      () => imageLinksJob.markPending(ID, START),
      setImageLinksStatusMock,
      [ID, 'pending', { error: null, startedAt: START }],
    ],
    [
      'begins with the conditional write',
      () => imageLinksJob.begin(ID, START),
      beginImageLinksRunMock,
      [ID, START],
    ],
    [
      'stores the token',
      () => imageLinksJob.setToken(ID, 'tok'),
      setImageLinksJobTokenMock,
      [ID, 'tok'],
    ],
    [
      'claims the token',
      () => imageLinksJob.claimToken(ID, 'tok'),
      claimImageLinksJobTokenMock,
      [ID, 'tok'],
    ],
    [
      'records failed with its error',
      () => imageLinksJob.recordFailed(ID, 'Jina down'),
      setImageLinksStatusMock,
      [ID, 'failed', { error: 'Jina down' }],
    ],
    [
      'records succeeded with the added count',
      () => imageLinksJob.recordSucceeded(ID, 3),
      setImageLinksStatusMock,
      [ID, 'succeeded', { error: null, addedCount: 3 }],
    ],
  ])('%s', async (_name, write, repositoryMethod, args) => {
    await write();

    expect(repositoryMethod.mock.calls).toEqual([args]);
  });

  it('keeps its copy byte-identical', () => {
    expect(imageLinksJob.copy).toEqual({
      notFound: 'Artist not found.',
      noCallbackUrl: 'Bio generator callback URL is not configured',
      notConfigured: 'Bio generator is not configured (BIO_GENERATOR_LAMBDA_NAME unset)',
      unreachable: 'Failed to reach the bio generator',
      runFailed: 'Image generation failed unexpectedly.',
      persistFailed: 'Image persistence failed.',
    });
  });
});

describe('imageLinksJob.fake', () => {
  const payload = {
    task: 'images-from-links' as const,
    artistId: 'a1',
    displayName: 'Ceschi',
    links: ['https://press.test/kit'],
    callbackUrl: 'https://app.test/api/artists/a1/image-links/callback',
    jobToken: 'tok',
    signingKey: 'k'.repeat(64),
  };

  it('answers at once with an empty ok result, as a valid callback, and no checkpoint', () => {
    const result = imageLinksJob.fake.result(payload);

    expect(result).toEqual({ ok: true, data: { images: [] } });
    expect(imageLinksCallbackSchema.safeParse({ jobToken: 'tok', result }).success).toBe(true);
    expect(imageLinksJob.fake.checkpoint).toBeUndefined();
    expect(imageLinksJob.fake.delayMs).toBe(0);
  });
});

describe('ImageLinksService.getStatus', () => {
  it('returns null for a missing artist', async () => {
    getImageLinksJobStateMock.mockResolvedValueOnce(null);

    expect(await ImageLinksService.getStatus('a1')).toBeNull();
  });

  it('returns the lifecycle view plus the image-source links', async () => {
    getImageLinksJobStateMock.mockResolvedValueOnce({
      slug: 'ceschi',
      imageLinksStatus: 'succeeded',
      imageLinksError: null,
      imageLinksStartedAt: new Date(),
      imageLinksJobToken: null,
      imageLinksAddedCount: 3,
    });

    const status = await ImageLinksService.getStatus('a1');

    expect(status).toEqual({
      status: 'succeeded',
      error: null,
      addedCount: 3,
      links: [
        { id: 'l1', label: 'press.test', url: 'https://press.test/kit' },
        { id: 'l2', label: 'photos.test', url: 'https://photos.test/a.jpg' },
      ],
    });
  });
});

describe('imageLinksJob.persist', () => {
  const claim = { slug: 'ceschi' };
  const image = (url: string, faceScore: number | null = null) => ({
    url,
    attribution: 'press.test',
    isPrimary: false,
    kind: 'photo' as const,
    sourceUrl: 'https://press.test/kit',
    hasFace: faceScore !== null,
    faceScore,
    title: null,
    alt: null,
  });

  it('skips images already in the pool, re-hosts the rest as linked rows and returns the count', async () => {
    findExistingUrlsMock.mockResolvedValueOnce(new Set(['https://press.test/old.jpg']));
    rehostImagesMock.mockResolvedValueOnce({
      results: [
        { url: 'https://cdn/new-1.webp', width: 800, height: 600 },
        null, // duplicate within the batch / fetch failure
      ],
      duplicateAliases: new Map(),
    });
    createManyMock.mockResolvedValueOnce(1);

    const added = await imageLinksJob.persist(
      'a1',
      {
        images: [
          image('https://press.test/old.jpg'),
          image('https://press.test/new-1.jpg', 88),
          image('https://press.test/new-2.jpg'),
        ],
      },
      claim
    );

    expect(rehostImagesMock.mock.calls).toEqual([
      [
        [
          { url: 'https://press.test/new-1.jpg', index: 0 },
          { url: 'https://press.test/new-2.jpg', index: 1 },
        ],
        'a1',
        [],
      ],
    ]);
    expect(createManyMock.mock.calls).toEqual([
      [
        [
          expect.objectContaining({
            artistId: 'a1',
            url: 'https://cdn/new-1.webp',
            thumbnailUrl: 'https://cdn/new-1.webp',
            originalUrl: 'https://press.test/new-1.jpg',
            sourceUrl: 'https://press.test/kit',
            attribution: 'press.test',
            width: 800,
            height: 600,
            kind: 'photo',
            isPrimary: false,
            hasFace: true,
            faceScore: 88,
            origin: 'linked',
          }),
        ],
      ],
    ]);
    expect(added).toBe(1);
  });

  it("seeds the re-host dedupe with every pool image's hashes, whatever its origin", async () => {
    const fingerprints = [
      { url: 'https://cdn/commons.webp', contentHash: 'sha-commons', perceptualHash: null },
      { url: 'https://cdn/custom.webp', contentHash: null, perceptualHash: '00000000000000ff' },
    ];
    findFingerprintsMock.mockResolvedValueOnce(fingerprints);

    await imageLinksJob.persist(
      'a1',
      { images: [image('https://band.test/same-photo.jpg')] },
      claim
    );

    expect(findFingerprintsMock.mock.calls).toEqual([['a1', undefined]]);
    expect(rehostImagesMock.mock.calls).toEqual([
      [[{ url: 'https://band.test/same-photo.jpg', index: 0 }], 'a1', fingerprints],
    ]);
  });

  it('adds nothing when the only candidate matches a pool image by content', async () => {
    rehostImagesMock.mockResolvedValueOnce({
      results: [null],
      duplicateAliases: new Map([[0, 'https://cdn/commons.webp']]),
    });

    const added = await imageLinksJob.persist(
      'a1',
      { images: [image('https://band.test/same-photo.jpg')] },
      claim
    );

    expect(createManyMock.mock.calls).toEqual([[[]]]);
    expect(added).toBe(0);
  });

  it("stores each new linked row's content and perceptual hashes", async () => {
    rehostImagesMock.mockResolvedValueOnce({
      results: [
        {
          url: 'https://cdn/new-1.webp',
          width: 800,
          height: 600,
          contentHash: 'sha-new-1',
          perceptualHash: '0000000000000abc',
        },
      ],
      duplicateAliases: new Map(),
    });
    createManyMock.mockResolvedValueOnce(1);

    await imageLinksJob.persist('a1', { images: [image('https://press.test/new-1.jpg')] }, claim);

    expect(createManyMock.mock.calls).toEqual([
      [
        [
          expect.objectContaining({
            url: 'https://cdn/new-1.webp',
            contentHash: 'sha-new-1',
            perceptualHash: '0000000000000abc',
          }),
        ],
      ],
    ]);
  });

  it('treats pool URLs as case-insensitive when skipping images', async () => {
    findExistingUrlsMock.mockResolvedValueOnce(new Set(['https://press.test/OLD.jpg']));

    const added = await imageLinksJob.persist(
      'a1',
      { images: [image('https://press.test/old.jpg')] },
      claim
    );

    expect(rehostImagesMock).not.toHaveBeenCalled();
    expect(added).toBe(0);
  });

  it('adds none when every image was already in the pool', async () => {
    findExistingUrlsMock.mockResolvedValueOnce(new Set(['https://press.test/old.jpg']));

    const added = await imageLinksJob.persist(
      'a1',
      { images: [image('https://press.test/old.jpg')] },
      claim
    );

    expect(rehostImagesMock).not.toHaveBeenCalled();
    expect(createManyMock).not.toHaveBeenCalled();
    expect(added).toBe(0);
  });

  it('lets a persistence error reach the job runner', async () => {
    rehostImagesMock.mockRejectedValueOnce(new Error('S3 down'));

    await expect(
      imageLinksJob.persist('a1', { images: [image('https://press.test/x.jpg')] }, claim)
    ).rejects.toThrow('S3 down');
  });
});
