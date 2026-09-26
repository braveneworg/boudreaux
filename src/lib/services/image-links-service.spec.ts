/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { DataError } from '@/lib/types/domain/errors';
import { MAX_IMAGE_LINKS } from '@/lib/validation/image-links-schema';
import { STALE_JOB_MS, STALE_JOB_TIMEOUT_MESSAGE } from '@/utils/async-job-lifecycle';

import { ImageLinksService } from './image-links-service';

vi.mock('server-only', () => ({}));

const mockLoggerWarn = vi.hoisted(() => vi.fn());
const mockLoggerError = vi.hoisted(() => vi.fn());
const sendMock = vi.hoisted(() => vi.fn());
const findByIdMock = vi.hoisted(() => vi.fn());
const setImageLinksStatusMock = vi.hoisted(() => vi.fn());
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

vi.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: class {
    send = sendMock;
  },
  InvokeCommand: class {
    constructor(public input: unknown) {}
  },
}));

vi.mock('@/lib/utils/logger', () => ({
  loggers: { media: { warn: mockLoggerWarn, error: mockLoggerError, info: vi.fn() } },
}));

vi.mock('@/lib/repositories/artist-repository', () => ({
  ArtistRepository: {
    findById: (id: string) => findByIdMock(id),
    existsById: (id: string) => existsByIdMock(id),
    setImageLinksStatus: (id: string, status: string, opts: unknown) =>
      setImageLinksStatusMock(id, status, opts),
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

type SentCommand = {
  input: { InvocationType?: string; FunctionName?: string; Payload?: Uint8Array };
};

const lastCommand = (): SentCommand => sendMock.mock.calls.at(-1)?.[0] as SentCommand;

const decodePayload = (command: SentCommand): Record<string, unknown> =>
  JSON.parse(Buffer.from(command.input.Payload as Uint8Array).toString('utf-8'));

const artist = {
  id: 'a1',
  displayName: 'Ceschi',
  firstName: 'C',
  middleName: null,
  surname: 'R',
  isPseudonymous: true,
  slug: 'ceschi',
  images: [{ src: 'https://cdn/artist-1.jpg' }],
};

const sourceLinks = [
  { id: 'l1', url: 'https://press.test/kit', label: 'press.test' },
  { id: 'l2', url: 'https://photos.test/a.jpg', label: 'photos.test' },
];

const fetchMock = vi.fn(async (): Promise<{ ok: boolean; status: number }> => ({
  ok: true,
  status: 202,
}));

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'https://app.test');
  vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'fakefour-bio-generator');
  vi.stubEnv('BIO_GENERATOR_FAKE', 'false');
  vi.stubEnv('BIO_GENERATOR_FAKE_DELAY_MS', '0');
  findByIdMock.mockResolvedValue(artist);
  findImageSourcesMock.mockResolvedValue(sourceLinks);
  findCustomUrlsMock.mockResolvedValue(['https://cdn/custom-1.jpg']);
  findExistingUrlsMock.mockResolvedValue(new Set<string>());
  findFingerprintsMock.mockResolvedValue([]);
  createManyMock.mockResolvedValue(0);
  sendMock.mockResolvedValue({});
  rehostImagesMock.mockResolvedValue({ results: [], duplicateAliases: new Map() });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 202 });
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

describe('ImageLinksService.runJob', () => {
  it('flips to processing, mints a token and fires an Event invoke with the task payload', async () => {
    const result = await ImageLinksService.runJob('a1');

    expect(result).toEqual({ status: 'dispatched' });
    expect(setImageLinksStatusMock.mock.calls[0]).toEqual(['a1', 'processing', undefined]);
    const token = setImageLinksJobTokenMock.mock.calls[0][1] as string;
    expect(token).toMatch(/^[0-9a-f-]{36}$/);
    const command = lastCommand();
    expect(command.input.InvocationType).toBe('Event');
    expect(command.input.FunctionName).toBe('fakefour-bio-generator');
    expect(decodePayload(command)).toEqual({
      task: 'images-from-links',
      artistId: 'a1',
      displayName: 'Ceschi',
      links: ['https://press.test/kit', 'https://photos.test/a.jpg'],
      referenceImageUrls: ['https://cdn/artist-1.jpg', 'https://cdn/custom-1.jpg'],
      callbackUrl: 'https://app.test/api/artists/a1/image-links/callback',
      jobToken: token,
    });
  });

  it('fails without invoking when the artist has no image-source links', async () => {
    findImageSourcesMock.mockResolvedValueOnce([]);

    const result = await ImageLinksService.runJob('a1');

    expect(result).toEqual({ status: 'failed', error: 'Add at least one link first.' });
    expect(sendMock).not.toHaveBeenCalled();
    expect(setImageLinksStatusMock.mock.calls.at(-1)).toEqual([
      'a1',
      'failed',
      { error: 'Add at least one link first.' },
    ]);
  });

  it('fails when the artist is missing', async () => {
    findByIdMock.mockResolvedValueOnce(null);

    const result = await ImageLinksService.runJob('a1');

    expect(result).toEqual({ status: 'failed', error: 'Artist not found.' });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('fails when the callback base URL is unconfigured', async () => {
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', '');

    const result = await ImageLinksService.runJob('a1');

    expect(result).toEqual({
      status: 'failed',
      error: 'Bio generator callback URL is not configured',
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('records a failed status and clears the token when the invoke cannot be reached', async () => {
    sendMock.mockRejectedValueOnce(new Error('network'));

    const result = await ImageLinksService.runJob('a1');

    expect(result).toEqual({ status: 'failed', error: 'Failed to reach the bio generator' });
    expect(setImageLinksJobTokenMock.mock.calls.at(-1)).toEqual(['a1', null]);
    expect(setImageLinksStatusMock.mock.calls.at(-1)).toEqual([
      'a1',
      'failed',
      { error: 'Failed to reach the bio generator' },
    ]);
  });

  it('caps the links sent to the Lambda at MAX_IMAGE_LINKS', async () => {
    findImageSourcesMock.mockResolvedValueOnce(
      Array.from({ length: 25 }, (_, i) => ({
        id: `l${i}`,
        url: `https://x.test/${i}`,
        label: 'x',
      }))
    );

    await ImageLinksService.runJob('a1');

    expect((decodePayload(lastCommand()).links as string[]).length).toBe(20);
  });

  it('degrades to artist images only when the custom-image lookup fails', async () => {
    findCustomUrlsMock.mockRejectedValueOnce(new Error('db'));

    await ImageLinksService.runJob('a1');

    expect(decodePayload(lastCommand()).referenceImageUrls).toEqual(['https://cdn/artist-1.jpg']);
    expect(mockLoggerWarn).toHaveBeenCalled();
  });

  it('under BIO_GENERATOR_FAKE posts an empty ok callback to the callback URL instead of invoking', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', 'true');

    const result = await ImageLinksService.runJob('a1');

    expect(result).toEqual({ status: 'dispatched' });
    expect(sendMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, { body: string }];
    expect(url).toBe('https://app.test/api/artists/a1/image-links/callback');
    expect(JSON.parse(init.body)).toEqual({
      jobToken: setImageLinksJobTokenMock.mock.calls[0][1],
      result: { ok: true, data: { images: [] } },
    });
  });

  it('never throws: an unexpected repository error records failed', async () => {
    findImageSourcesMock.mockRejectedValueOnce(new Error('boom'));

    const result = await ImageLinksService.runJob('a1');

    expect(result).toEqual({ status: 'failed', error: 'boom' });
  });

  it('never throws even when recording the failure itself fails', async () => {
    findImageSourcesMock.mockRejectedValueOnce(new Error('boom'));
    // First call flips to processing; the second (failed) write is the one that breaks.
    setImageLinksStatusMock
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('mongo down'));

    await expect(ImageLinksService.runJob('a1')).resolves.toEqual({
      status: 'failed',
      error: 'boom',
    });
    expect(mockLoggerError).toHaveBeenCalledWith(
      'image_links_status_write_failed',
      expect.objectContaining({ artistId: 'a1', status: 'failed' })
    );
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

  it('coerces a processing job older than STALE_JOB_MS to failed with the timeout copy', async () => {
    getImageLinksJobStateMock.mockResolvedValueOnce({
      slug: 'ceschi',
      imageLinksStatus: 'processing',
      imageLinksError: null,
      imageLinksStartedAt: new Date(Date.now() - (STALE_JOB_MS + 60_000)),
      imageLinksJobToken: 'tok',
      imageLinksAddedCount: null,
    });

    const status = await ImageLinksService.getStatus('a1');

    expect(status?.status).toBe('failed');
    expect(status?.error).toBe(STALE_JOB_TIMEOUT_MESSAGE);
  });
});

describe('ImageLinksService.verifyAndClaimCallback', () => {
  const processing = {
    slug: 'ceschi',
    imageLinksStatus: 'processing',
    imageLinksError: null,
    imageLinksStartedAt: new Date(),
    imageLinksJobToken: 'tok',
    imageLinksAddedCount: null,
  };

  it('claims a processing job whose token matches and returns the slug', async () => {
    getImageLinksJobStateMock.mockResolvedValueOnce(processing);
    claimImageLinksJobTokenMock.mockResolvedValueOnce(true);

    expect(await ImageLinksService.verifyAndClaimCallback('a1', 'tok')).toEqual({ slug: 'ceschi' });
    expect(claimImageLinksJobTokenMock.mock.calls).toEqual([['a1', 'tok']]);
  });

  it('never attempts the claim on a mismatched token', async () => {
    getImageLinksJobStateMock.mockResolvedValueOnce(processing);

    expect(await ImageLinksService.verifyAndClaimCallback('a1', 'nope')).toBeNull();
    expect(claimImageLinksJobTokenMock).not.toHaveBeenCalled();
  });

  it('returns null when the job is not processing', async () => {
    getImageLinksJobStateMock.mockResolvedValueOnce({
      ...processing,
      imageLinksStatus: 'succeeded',
    });

    expect(await ImageLinksService.verifyAndClaimCallback('a1', 'tok')).toBeNull();
  });

  it('returns null when a concurrent callback already won the claim', async () => {
    getImageLinksJobStateMock.mockResolvedValueOnce(processing);
    claimImageLinksJobTokenMock.mockResolvedValueOnce(false);

    expect(await ImageLinksService.verifyAndClaimCallback('a1', 'tok')).toBeNull();
  });
});

describe('ImageLinksService.completeCallback', () => {
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

  it('records failed with the Lambda error for a non-ok result', async () => {
    await ImageLinksService.completeCallback('a1', { ok: false, error: 'Jina down' });

    expect(setImageLinksStatusMock.mock.calls).toEqual([['a1', 'failed', { error: 'Jina down' }]]);
    expect(rehostImagesMock).not.toHaveBeenCalled();
  });

  it('skips images already in the pool, re-hosts the rest as linked rows and records the count', async () => {
    findExistingUrlsMock.mockResolvedValueOnce(new Set(['https://press.test/old.jpg']));
    rehostImagesMock.mockResolvedValueOnce({
      results: [
        { url: 'https://cdn/new-1.webp', width: 800, height: 600 },
        null, // duplicate within the batch / fetch failure
      ],
      duplicateAliases: new Map(),
    });
    createManyMock.mockResolvedValueOnce(1);

    await ImageLinksService.completeCallback('a1', {
      ok: true,
      data: {
        images: [
          image('https://press.test/old.jpg'),
          image('https://press.test/new-1.jpg', 88),
          image('https://press.test/new-2.jpg'),
        ],
      },
    });

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
    expect(setImageLinksStatusMock.mock.calls).toEqual([
      ['a1', 'succeeded', { error: null, addedCount: 1 }],
    ]);
  });

  it("seeds the re-host dedupe with every pool image's hashes, whatever its origin", async () => {
    const fingerprints = [
      { url: 'https://cdn/commons.webp', contentHash: 'sha-commons', perceptualHash: null },
      { url: 'https://cdn/custom.webp', contentHash: null, perceptualHash: '00000000000000ff' },
    ];
    findFingerprintsMock.mockResolvedValueOnce(fingerprints);

    await ImageLinksService.completeCallback('a1', {
      ok: true,
      data: { images: [image('https://band.test/same-photo.jpg')] },
    });

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

    await ImageLinksService.completeCallback('a1', {
      ok: true,
      data: { images: [image('https://band.test/same-photo.jpg')] },
    });

    expect(createManyMock.mock.calls).toEqual([[[]]]);
    expect(setImageLinksStatusMock.mock.calls).toEqual([
      ['a1', 'succeeded', { error: null, addedCount: 0 }],
    ]);
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

    await ImageLinksService.completeCallback('a1', {
      ok: true,
      data: { images: [image('https://press.test/new-1.jpg')] },
    });

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

    await ImageLinksService.completeCallback('a1', {
      ok: true,
      data: { images: [image('https://press.test/old.jpg')] },
    });

    expect(rehostImagesMock).not.toHaveBeenCalled();
    expect(setImageLinksStatusMock.mock.calls).toEqual([
      ['a1', 'succeeded', { error: null, addedCount: 0 }],
    ]);
  });

  it('succeeds with a zero count when every image was already in the pool', async () => {
    findExistingUrlsMock.mockResolvedValueOnce(new Set(['https://press.test/old.jpg']));

    await ImageLinksService.completeCallback('a1', {
      ok: true,
      data: { images: [image('https://press.test/old.jpg')] },
    });

    expect(rehostImagesMock).not.toHaveBeenCalled();
    expect(createManyMock).not.toHaveBeenCalled();
    expect(setImageLinksStatusMock.mock.calls).toEqual([
      ['a1', 'succeeded', { error: null, addedCount: 0 }],
    ]);
  });

  it('records failed when persistence throws', async () => {
    rehostImagesMock.mockRejectedValueOnce(new Error('S3 down'));

    await ImageLinksService.completeCallback('a1', {
      ok: true,
      data: { images: [image('https://press.test/x.jpg')] },
    });

    expect(setImageLinksStatusMock.mock.calls).toEqual([['a1', 'failed', { error: 'S3 down' }]]);
  });

  it('never throws when recording a Lambda failure itself fails', async () => {
    setImageLinksStatusMock.mockRejectedValueOnce(new Error('mongo down'));

    await expect(
      ImageLinksService.completeCallback('a1', { ok: false, error: 'Jina down' })
    ).resolves.toBeUndefined();
    expect(mockLoggerError).toHaveBeenCalledWith(
      'image_links_status_write_failed',
      expect.objectContaining({ artistId: 'a1', status: 'failed' })
    );
  });
});
