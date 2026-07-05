/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type {
  BioGenerationData,
  BioGenerationResult,
} from '@/lib/validation/bio-generation-schema';

import { BioGenerationService, persistGeneratedBio } from './bio-generation-service';

import type { BioGenerationLambdaInput } from './bio-generation-fixture';

vi.mock('server-only', () => ({}));

const mockLoggerWarn = vi.hoisted(() => vi.fn());
const mockLoggerError = vi.hoisted(() => vi.fn());
const sendMock = vi.hoisted(() => vi.fn());
const findByIdMock = vi.hoisted(() => vi.fn());
const replaceBioContentMock = vi.hoisted(() => vi.fn());
const setBioStatusMock = vi.hoisted(() => vi.fn());
const setBioJobTokenMock = vi.hoisted(() => vi.fn());
const getBioGenerationStateMock = vi.hoisted(() => vi.fn());
const findPublishedByArtistWithCoversMock = vi.hoisted(() => vi.fn());
const fakeBioGenerationMock = vi.hoisted(() => vi.fn());

vi.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: class {
    send = sendMock;
  },
  InvokeCommand: class {
    constructor(public input: unknown) {}
  },
}));

vi.mock('@/lib/utils/logger', () => ({
  loggers: { media: { warn: mockLoggerWarn, error: mockLoggerError } },
}));

vi.mock('@/lib/repositories/artist-repository', () => ({
  ArtistRepository: {
    findById: (id: string) => findByIdMock(id),
    replaceBioContent: (id: string, content: unknown) => replaceBioContentMock(id, content),
    setBioStatus: (id: string, status: string, opts: unknown) => setBioStatusMock(id, status, opts),
    setBioJobToken: (id: string, token: string | null) => setBioJobTokenMock(id, token),
    getBioGenerationState: (id: string) => getBioGenerationStateMock(id),
  },
}));

vi.mock('@/lib/repositories/release-repository', () => ({
  ReleaseRepository: {
    findPublishedByArtistWithCovers: (id: string) => findPublishedByArtistWithCoversMock(id),
  },
}));

vi.mock('./bio-generation-fixture', () => ({
  fakeBioGeneration: (input: BioGenerationLambdaInput) => fakeBioGenerationMock(input),
}));

const rehostWithVariantsMock = vi.fn();
const rehostImagesMock = vi.fn();
vi.mock('./bio-image-service', () => ({
  BioImageService: {
    rehostWithVariants: (url: string, artistId: string, index: number) =>
      rehostWithVariantsMock(url, artistId, index),
    rehostImages: (images: ReadonlyArray<{ url: string; index: number }>, artistId: string) =>
      rehostImagesMock(images, artistId),
  },
}));

/** Shape of a captured `InvokeCommand` instance (our mock stores its input). */
type SentCommand = {
  input: { InvocationType?: string; FunctionName?: string; Payload?: Uint8Array };
};

/** The last `InvokeCommand` passed to `LambdaClient.send`. */
const lastCommand = (): SentCommand => sendMock.mock.calls.at(-1)?.[0] as SentCommand;

/** Decode the JSON payload the invoke carried back to a lambda input. */
const decodePayload = (command: SentCommand): BioGenerationLambdaInput =>
  JSON.parse(Buffer.from(command.input.Payload as Uint8Array).toString('utf-8'));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('BioGenerationService.generate', () => {
  beforeEach(() => {
    sendMock.mockReset().mockResolvedValue({ StatusCode: 202 });
    mockLoggerError.mockReset();
    delete process.env.BIO_GENERATOR_FAKE;
  });

  it('returns an error when the function name is not configured', async () => {
    delete process.env.BIO_GENERATOR_LAMBDA_NAME;

    const result = await BioGenerationService.generate({ artistId: 'a1', displayName: 'Nas' });

    expect(result).toEqual({
      ok: false,
      error: 'Bio generator is not configured (BIO_GENERATOR_LAMBDA_NAME unset)',
    });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('fires an async Event invoke and returns a fire acknowledgement', async () => {
    vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'fakefour-bio-generator');

    const result = await BioGenerationService.generate({
      artistId: 'a1',
      displayName: 'Nas',
      callbackUrl: 'https://fakefourrecords.com/api/artists/a1/bio-generation/callback',
      jobToken: 'tok-123',
    });

    expect(result).toEqual({ ok: true });
    expect(lastCommand().input.InvocationType).toBe('Event');
  });

  it('targets the configured function and carries the callback token in the payload', async () => {
    vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'fakefour-bio-generator');

    await BioGenerationService.generate({
      artistId: 'a1',
      displayName: 'Nas',
      callbackUrl: 'https://fakefourrecords.com/api/artists/a1/bio-generation/callback',
      jobToken: 'tok-123',
    });

    expect(lastCommand().input.FunctionName).toBe('fakefour-bio-generator');
    const payload = decodePayload(lastCommand());
    expect(payload.callbackUrl).toBe(
      'https://fakefourrecords.com/api/artists/a1/bio-generation/callback'
    );
    expect(payload.jobToken).toBe('tok-123');
  });

  it('returns an error when the invoke throws', async () => {
    vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'fakefour-bio-generator');
    sendMock.mockRejectedValue(new Error('network down'));

    const result = await BioGenerationService.generate({ artistId: 'a1', displayName: 'Nas' });

    expect(result).toEqual({ ok: false, error: 'Failed to reach the bio generator' });
  });
});

describe('persistGeneratedBio', () => {
  const artistId = 'a'.repeat(24);

  const baseData: BioGenerationData = {
    shortBio: '<b>Short</b> teaser',
    longBio: '<p>Long</p><a href="javascript:alert(1)">x</a><script>evil()</script>',
    altBio: '<p>Punchy <strong>promo</strong></p><script>evil()</script>',
    genres: 'art rock',
    images: [
      {
        url: 'https://upload.wikimedia.org/a.jpg',
        thumbnailUrl: 'https://upload.wikimedia.org/thumb/a.jpg',
        title: 'Portrait',
        attribution: 'Photographer',
        license: 'CC BY-SA 4.0',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:a.jpg',
        width: 1000,
        height: 800,
        isPrimary: true,
      },
    ],
    links: [
      { label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Radiohead', kind: 'wikipedia' },
    ],
    model: 'gemini-2.5-pro',
  };

  const withData = (overrides: Partial<BioGenerationData>): BioGenerationData => ({
    ...baseData,
    ...overrides,
  });

  beforeEach(() => {
    mockLoggerWarn.mockReset();
    replaceBioContentMock.mockReset().mockResolvedValue(undefined);
    rehostWithVariantsMock.mockReset();
    rehostImagesMock.mockReset().mockResolvedValue({
      results: [
        {
          url: 'https://cdn.example.com/media/artists/a/bio/0-abcd1234.jpg',
          width: 1200,
          height: 800,
        },
      ],
      duplicateAliases: new Map(),
    });
  });

  it('returns the assembled sanitized content', async () => {
    const content = await persistGeneratedBio(artistId, baseData, []);

    expect(content.longBio).not.toContain('<script>');
    expect(content.longBio).not.toContain('javascript:');
    expect(content.altBio).toContain('<strong>promo</strong>');
    expect(content.genres).toBe('art rock');
    expect(content.model).toBe('gemini-2.5-pro');
    expect(content.images[0].url).toBe(
      'https://cdn.example.com/media/artists/a/bio/0-abcd1234.jpg'
    );
    expect(content.links[0].url).toBe('https://en.wikipedia.org/wiki/Radiohead');
  });

  it('keeps the emphasis markup in the sanitized short bio', async () => {
    const content = await persistGeneratedBio(artistId, baseData, []);

    expect(content.shortBio).toBe('<b>Short</b> teaser');
  });

  it('strips <img> from the short bio even when the long bio keeps its images', async () => {
    const content = await persistGeneratedBio(
      artistId,
      withData({
        shortBio: '<p>Teaser. <img src="https://cdn.example/x.webp" alt="x"> The end.</p>',
        longBio: '<p>Full bio. <img src="https://cdn.example/x.webp" alt="x"></p>',
      }),
      []
    );

    expect(content.shortBio).not.toContain('<img');
    expect(content.shortBio).toContain('Teaser.');
    expect(content.shortBio).toContain('The end.');
    expect(content.longBio).toContain('<img');
  });

  it('sanitizes the alt bio and persists it via the repository', async () => {
    await persistGeneratedBio(artistId, baseData, []);

    const [, content] = replaceBioContentMock.mock.calls[0];
    expect(content.altBio).toContain('<strong>promo</strong>');
    expect(content.altBio).not.toContain('<script>');
  });

  it('rewrites an inline image:N placeholder in the alt bio to the CDN url', async () => {
    const content = await persistGeneratedBio(
      artistId,
      withData({ altBio: '<p>Promo <img src="image:0" alt="x"></p>' }),
      []
    );

    expect(content.altBio).toContain(
      'src="https://cdn.example.com/media/artists/a/bio/0-abcd1234.jpg"'
    );
    expect(content.altBio).not.toContain('image:0');
  });

  it('persists re-hosted images with attribution via the repository', async () => {
    await persistGeneratedBio(artistId, baseData, []);

    expect(rehostImagesMock).toHaveBeenCalledWith(
      [{ url: 'https://upload.wikimedia.org/a.jpg', index: 0 }],
      artistId
    );
    expect(replaceBioContentMock).toHaveBeenCalledTimes(1);
    const [, content] = replaceBioContentMock.mock.calls[0];
    expect(content.images[0].url).toBe(
      'https://cdn.example.com/media/artists/a/bio/0-abcd1234.jpg'
    );
    expect(content.images[0].attribution).toBe('Photographer');
    expect(content.images[0].license).toBe('CC BY-SA 4.0');
    expect(content.images[0].sourceUrl).toBe('https://commons.wikimedia.org/wiki/File:a.jpg');
    expect(content.images[0].thumbnailUrl).toBe(
      'https://cdn.example.com/media/artists/a/bio/0-abcd1234.jpg'
    );
    expect(content.images[0].originalUrl).toBe('https://upload.wikimedia.org/a.jpg');
    expect(content.images[0].sortOrder).toBe(0);
    expect(content.images[0].isPrimary).toBe(true);
    expect(content.bioModel).toBe('gemini-2.5-pro');
  });

  it('re-hosts via rehostImages (not rehostWithVariants) at generation time', async () => {
    await persistGeneratedBio(artistId, baseData, []);

    expect(rehostImagesMock).toHaveBeenCalledWith(
      [{ url: 'https://upload.wikimedia.org/a.jpg', index: 0 }],
      artistId
    );
    expect(rehostWithVariantsMock).not.toHaveBeenCalled();
  });

  it('rewrites inline image:N placeholders to the re-hosted CDN url', async () => {
    const content = await persistGeneratedBio(
      artistId,
      withData({ longBio: '<p>Intro</p><img src="image:0" alt="Portrait"><p>More</p>' }),
      []
    );

    expect(content.longBio).toContain(
      'src="https://cdn.example.com/media/artists/a/bio/0-abcd1234.jpg"'
    );
    expect(content.longBio).not.toContain('image:0');
  });

  it('drops an inline image:N placeholder that has no re-hosted url', async () => {
    rehostImagesMock.mockResolvedValueOnce({ results: [null], duplicateAliases: new Map() });

    const content = await persistGeneratedBio(
      artistId,
      withData({ longBio: '<p>Intro</p><img src="image:0" alt="x">' }),
      []
    );

    expect(content.longBio).not.toContain('image:0');
  });

  it('aliases an image:N placeholder to the survivor URL when index N was deduped', async () => {
    const survivorUrl = 'https://cdn.example.com/media/artists/a/bio/thumbs/0-abcd1234.webp';
    rehostImagesMock.mockResolvedValueOnce({
      results: [{ url: survivorUrl, width: 384, height: 256 }, null],
      duplicateAliases: new Map([[1, survivorUrl]]),
    });

    const content = await persistGeneratedBio(
      artistId,
      withData({
        images: [
          {
            url: 'https://commons.example.com/a.jpg',
            thumbnailUrl: null,
            title: 'Photo',
            attribution: 'Author',
            license: 'CC BY-SA 4.0',
            sourceUrl: 'https://commons.example.com/a.jpg',
            width: 800,
            height: 600,
            isPrimary: true,
          },
          {
            url: 'https://scraped.example.com/a.jpg',
            thumbnailUrl: null,
            title: null,
            attribution: 'Scraped source',
            license: null,
            sourceUrl: null,
            width: null,
            height: null,
            isPrimary: false,
          },
        ],
        longBio: '<p>Bio <img src="image:1" alt="same photo"> text</p>',
      }),
      []
    );

    expect(content.longBio).toContain(survivorUrl);
    expect(content.longBio).not.toContain('image:1');
  });

  it('keeps streaming-service links (Spotify, Bandcamp) — product rule reversed 2026-07', async () => {
    await persistGeneratedBio(
      artistId,
      withData({
        links: [
          { label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Radiohead', kind: 'wikipedia' },
          {
            label: 'Spotify',
            url: 'https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb',
            kind: 'streaming',
          },
          { label: 'Bandcamp', url: 'https://radiohead.bandcamp.com', kind: 'streaming' },
        ],
      }),
      []
    );

    const [, content] = replaceBioContentMock.mock.calls[0];
    expect(content.links).toHaveLength(3);
    expect(content.links[0].url).toBe('https://en.wikipedia.org/wiki/Radiohead');
    expect(content.links[1].url).toBe('https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb');
    expect(content.links[2].url).toBe('https://radiohead.bandcamp.com/');
  });

  it('drops a discovered link whose URL is not http(s)', async () => {
    await persistGeneratedBio(
      artistId,
      withData({
        links: [
          { label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Radiohead', kind: 'wikipedia' },
          { label: 'Evil', url: 'javascript:alert(1)', kind: 'other' },
        ],
      }),
      []
    );

    const [, content] = replaceBioContentMock.mock.calls[0];
    expect(content.links).toHaveLength(1);
    expect(content.links[0].url).toBe('https://en.wikipedia.org/wiki/Radiohead');
  });

  it('drops an image whose re-host fails without aborting persistence', async () => {
    rehostImagesMock.mockResolvedValueOnce({ results: [null], duplicateAliases: new Map() });

    await persistGeneratedBio(artistId, baseData, []);

    const [, content] = replaceBioContentMock.mock.calls[0];
    expect(content.images).toHaveLength(0);
  });

  it('persists null genres when the data returns no genres', async () => {
    await persistGeneratedBio(artistId, withData({ genres: null }), []);

    const [, content] = replaceBioContentMock.mock.calls[0];
    expect(content.genres).toBeNull();
  });

  it('persists null genres when the value sanitizes down to an empty string', async () => {
    await persistGeneratedBio(artistId, withData({ genres: '<script></script>' }), []);

    const [, content] = replaceBioContentMock.mock.calls[0];
    expect(content.genres).toBeNull();
  });

  it('falls back to the original image dimensions and null title when re-host omits them', async () => {
    rehostImagesMock.mockResolvedValue({
      results: [{ url: 'https://cdn.example.com/x.jpg' }],
      duplicateAliases: new Map(),
    });

    await persistGeneratedBio(
      artistId,
      withData({
        images: [
          {
            url: 'https://upload.wikimedia.org/a.jpg',
            thumbnailUrl: null,
            title: null,
            attribution: 'Photographer',
            license: null,
            sourceUrl: null,
            width: 640,
            height: 480,
            isPrimary: false,
          },
        ],
      }),
      []
    );

    const [, content] = replaceBioContentMock.mock.calls[0];
    expect(content.images[0].title).toBeNull();
    expect(content.images[0].width).toBe(640);
    expect(content.images[0].height).toBe(480);
  });

  it('persists null dimensions when neither re-host nor source supply them', async () => {
    rehostImagesMock.mockResolvedValue({
      results: [{ url: 'https://cdn.example.com/x.jpg' }],
      duplicateAliases: new Map(),
    });

    await persistGeneratedBio(
      artistId,
      withData({
        images: [
          {
            url: 'https://upload.wikimedia.org/a.jpg',
            thumbnailUrl: null,
            title: 'Cover',
            attribution: 'Photographer',
            license: null,
            sourceUrl: null,
            isPrimary: false,
          },
        ],
      }),
      []
    );

    const [, content] = replaceBioContentMock.mock.calls[0];
    expect(content.images[0].width).toBeNull();
    expect(content.images[0].height).toBeNull();
  });

  it('persists a null kind for a link that has none', async () => {
    await persistGeneratedBio(
      artistId,
      withData({ links: [{ label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Radiohead' }] }),
      []
    );

    const [, content] = replaceBioContentMock.mock.calls[0];
    expect(content.links[0].kind).toBeNull();
  });

  it('appends kind:release links for the artist published releases', async () => {
    await persistGeneratedBio(artistId, baseData, [
      { id: '665f1f77bcf86cd799439021', title: 'Sad, Fat Luck', releasedOn: null, coverUrl: null },
    ]);

    const [, content] = replaceBioContentMock.mock.calls[0];
    expect(content.links).toContainEqual(
      expect.objectContaining({
        label: 'Sad, Fat Luck',
        url: '/releases/665f1f77bcf86cd799439021',
        kind: 'release',
      })
    );
  });

  it('does not duplicate a release link already present', async () => {
    await persistGeneratedBio(artistId, baseData, [
      { id: '665f1f77bcf86cd799439021', title: 'Sad, Fat Luck', releasedOn: null, coverUrl: null },
      { id: '665f1f77bcf86cd799439021', title: 'Sad, Fat Luck', releasedOn: null, coverUrl: null },
    ]);

    const [, content] = replaceBioContentMock.mock.calls[0];
    const matches = content.links.filter(
      (link: { url: string }) => link.url === '/releases/665f1f77bcf86cd799439021'
    );
    expect(matches).toHaveLength(1);
  });

  it('appends internal cover images with kind cover and CDN thumbnail', async () => {
    const content = await persistGeneratedBio(artistId, baseData, [
      {
        id: 'rel1',
        title: 'Label Album',
        releasedOn: new Date('2020-02-02T00:00:00Z'),
        coverUrl: 'https://cdn.fakefour.com/media/releases/rel1/cover.jpg',
      },
    ]);

    const cover = content.images.find((image) => image.kind === 'cover');
    expect(cover).toMatchObject({
      url: 'https://cdn.fakefour.com/media/releases/rel1/cover.jpg',
      title: 'Label Album',
      alt: 'Label Album album cover',
    });
    const persisted = replaceBioContentMock.mock.calls[0][1].images;
    expect(persisted.at(-1)).toMatchObject({ kind: 'cover', title: 'Label Album' });
  });

  it('skips cover rows whose url already exists among discovered images', async () => {
    const coverUrl = 'https://cdn.fakefour.com/media/releases/rel1/cover.jpg';
    rehostImagesMock.mockResolvedValueOnce({
      results: [{ url: coverUrl, width: null, height: null }],
      duplicateAliases: new Map(),
    });

    const content = await persistGeneratedBio(artistId, baseData, [
      {
        id: 'rel1',
        title: 'Label Album',
        releasedOn: new Date('2020-02-02T00:00:00Z'),
        coverUrl,
      },
    ]);

    const matching = content.images.filter((image) => image.url === coverUrl);
    expect(matching).toHaveLength(1);
  });
});

describe('BioGenerationService.runGenerationJob', () => {
  const CALLBACK_BASE = 'https://fakefourrecords.com';

  const artist = {
    id: 'a'.repeat(24),
    firstName: 'Thom',
    middleName: null as string | null,
    surname: 'Yorke',
    displayName: 'Radiohead' as string | null,
    akaNames: null as string | null,
    genres: 'rock' as string | null,
    isPseudonymous: false,
    slug: 'radiohead',
    bornOn: null as Date | null,
    diedOn: null as Date | null,
    formedOn: null as Date | null,
  };

  const fakeOk: BioGenerationResult = {
    ok: true,
    data: {
      shortBio: 's',
      longBio: '<p>l</p>',
      altBio: '<p>a</p>',
      genres: 'rock',
      images: [],
      links: [],
      model: 'fake/deterministic',
    },
  };

  beforeEach(() => {
    setBioStatusMock.mockReset().mockResolvedValue(undefined);
    setBioJobTokenMock.mockReset().mockResolvedValue(undefined);
    findByIdMock.mockReset().mockResolvedValue(artist);
    findPublishedByArtistWithCoversMock.mockReset().mockResolvedValue([]);
    replaceBioContentMock.mockReset().mockResolvedValue(undefined);
    rehostImagesMock.mockReset().mockResolvedValue({ results: [], duplicateAliases: new Map() });
    fakeBioGenerationMock.mockReset().mockReturnValue(fakeOk);
    sendMock.mockReset().mockResolvedValue({ StatusCode: 202 });
    mockLoggerWarn.mockReset();
    mockLoggerError.mockReset();
    delete process.env.BIO_GENERATOR_FAKE;
    delete process.env.BIO_GENERATOR_LAMBDA_NAME;
  });

  describe('fake path', () => {
    beforeEach(() => {
      vi.stubEnv('BIO_GENERATOR_FAKE', 'true');
    });

    it('completes synchronously and returns the persisted content', async () => {
      const result = await BioGenerationService.runGenerationJob(artist.id, { links: ['u'] });

      expect(result).toEqual({
        status: 'completed',
        slug: 'radiohead',
        data: expect.objectContaining({ model: 'fake/deterministic' }),
      });
      expect(replaceBioContentMock).toHaveBeenCalledTimes(1);
    });

    it('flips processing then succeeded (clearing the error) without an invoke', async () => {
      await BioGenerationService.runGenerationJob(artist.id);

      expect(setBioStatusMock.mock.calls[0]).toEqual([artist.id, 'processing', undefined]);
      expect(setBioStatusMock.mock.calls[1]).toEqual([artist.id, 'succeeded', { error: null }]);
      expect(sendMock).not.toHaveBeenCalled();
      expect(setBioJobTokenMock).not.toHaveBeenCalled();
    });

    it('fails when the fixture returns an error', async () => {
      fakeBioGenerationMock.mockReturnValue({ ok: false, error: 'fixture down' });

      const result = await BioGenerationService.runGenerationJob(artist.id);

      expect(result).toEqual({ status: 'failed', error: 'fixture down' });
      expect(setBioStatusMock.mock.calls[1]).toEqual([
        artist.id,
        'failed',
        { error: 'fixture down' },
      ]);
      expect(replaceBioContentMock).not.toHaveBeenCalled();
    });
  });

  describe('real path — dispatch', () => {
    beforeEach(() => {
      vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'fakefour-bio-generator');
      vi.stubEnv('NEXT_PUBLIC_BASE_URL', CALLBACK_BASE);
    });

    it('stores a job token then fires an Event invoke and returns dispatched', async () => {
      const result = await BioGenerationService.runGenerationJob(artist.id);

      expect(result).toEqual({ status: 'dispatched' });
      expect(setBioStatusMock.mock.calls[0]).toEqual([artist.id, 'processing', undefined]);
      const [tokenId, token] = setBioJobTokenMock.mock.calls[0];
      expect(tokenId).toBe(artist.id);
      expect(token).toEqual(expect.any(String));
      expect(lastCommand().input.InvocationType).toBe('Event');
    });

    it('sends a payload carrying the derived callback URL and the stored job token', async () => {
      await BioGenerationService.runGenerationJob(artist.id);

      const token = setBioJobTokenMock.mock.calls[0][1];
      const payload = decodePayload(lastCommand());
      expect(payload.callbackUrl).toBe(
        `${CALLBACK_BASE}/api/artists/${artist.id}/bio-generation/callback`
      );
      expect(payload.jobToken).toBe(token);
    });

    it('leaves the artist processing — no succeeded/failed flip, no persist', async () => {
      await BioGenerationService.runGenerationJob(artist.id);

      const statuses = setBioStatusMock.mock.calls.map(([, status]) => status);
      expect(statuses).toEqual(['processing']);
      expect(replaceBioContentMock).not.toHaveBeenCalled();
    });
  });

  describe('real path — input building', () => {
    let generateSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'fakefour-bio-generator');
      vi.stubEnv('NEXT_PUBLIC_BASE_URL', CALLBACK_BASE);
      generateSpy = vi.spyOn(BioGenerationService, 'generate').mockResolvedValue({ ok: true });
    });

    afterEach(() => {
      generateSpy.mockRestore();
    });

    it('forwards the artist real name and optional links to generation', async () => {
      await BioGenerationService.runGenerationJob(artist.id, { links: ['https://example.com'] });

      expect(generateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          displayName: 'Radiohead',
          realName: 'Thom Yorke',
          links: ['https://example.com'],
        })
      );
    });

    it('omits the real name when the artist is pseudonymous', async () => {
      findByIdMock.mockResolvedValue({ ...artist, isPseudonymous: true });

      await BioGenerationService.runGenerationJob(artist.id);

      expect(generateSpy).toHaveBeenCalledWith(expect.objectContaining({ realName: undefined }));
    });

    it('grounds on the real name when displayName is blank', async () => {
      findByIdMock.mockResolvedValue({ ...artist, displayName: '   ' });

      await BioGenerationService.runGenerationJob(artist.id);

      expect(generateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ displayName: 'Thom Yorke' })
      );
    });

    it('falls back to the first aka name when no display or real name exists', async () => {
      findByIdMock.mockResolvedValue({
        ...artist,
        displayName: null,
        firstName: '',
        surname: '',
        akaNames: 'Tommy, Tom',
      });

      await BioGenerationService.runGenerationJob(artist.id);

      expect(generateSpy).toHaveBeenCalledWith(expect.objectContaining({ displayName: 'Tommy' }));
    });

    it('omits the real name when first and surname are blank but not pseudonymous', async () => {
      findByIdMock.mockResolvedValue({ ...artist, firstName: ' ', surname: ' ' });

      await BioGenerationService.runGenerationJob(artist.id);

      expect(generateSpy).toHaveBeenCalledWith(expect.objectContaining({ realName: undefined }));
    });

    it('forwards undefined akaNames and genres when the artist has none', async () => {
      findByIdMock.mockResolvedValue({ ...artist, akaNames: null, genres: null });

      await BioGenerationService.runGenerationJob(artist.id);

      expect(generateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ akaNames: undefined, existingGenres: undefined })
      );
    });

    it('derives the real name including the middle name', async () => {
      findByIdMock.mockResolvedValue({
        ...artist,
        firstName: 'Julio',
        middleName: 'Francisco',
        surname: 'Ramos',
        bornOn: new Date('1982-05-01'),
        displayName: 'Julio Ramos',
      });

      await BioGenerationService.runGenerationJob(artist.id);

      expect(generateSpy).toHaveBeenCalledWith(
        expect.objectContaining({ realName: 'Julio Francisco Ramos', bornOn: '1982-05-01' })
      );
    });

    it('omits dates the artist record does not have', async () => {
      await BioGenerationService.runGenerationJob(artist.id);

      const input = generateSpy.mock.calls[0][0] as BioGenerationLambdaInput;
      expect(input.bornOn).toBeUndefined();
      expect(input.diedOn).toBeUndefined();
      expect(input.formedOn).toBeUndefined();
    });

    it('passes label releases to the lambda input', async () => {
      findPublishedByArtistWithCoversMock.mockResolvedValue([
        {
          id: 'rel1',
          title: 'Label Album',
          releasedOn: new Date('2020-02-02T00:00:00Z'),
          coverUrl: 'https://cdn.fakefour.com/media/releases/rel1/cover.jpg',
        },
      ]);

      await BioGenerationService.runGenerationJob(artist.id);

      const input = generateSpy.mock.calls[0][0] as BioGenerationLambdaInput;
      expect(input.releases).toEqual([
        { title: 'Label Album', releasedOn: '2020-02-02', url: '/releases/rel1' },
      ]);
    });

    it('omits releases and logs a warning when the cover lookup fails', async () => {
      findPublishedByArtistWithCoversMock.mockRejectedValue(new Error('db down'));

      await BioGenerationService.runGenerationJob(artist.id);

      const input = generateSpy.mock.calls[0][0] as BioGenerationLambdaInput;
      expect(input.releases).toBeUndefined();
      expect(mockLoggerWarn).toHaveBeenCalledWith(
        'bio_release_covers_failed',
        expect.objectContaining({ artistId: artist.id })
      );
    });
  });

  describe('real path — failures', () => {
    it('fails and clears the token when the invoke cannot be dispatched', async () => {
      vi.stubEnv('NEXT_PUBLIC_BASE_URL', CALLBACK_BASE);
      // BIO_GENERATOR_LAMBDA_NAME is unset → generate returns a not-configured error.

      const result = await BioGenerationService.runGenerationJob(artist.id);

      expect(result).toEqual({
        status: 'failed',
        error: 'Bio generator is not configured (BIO_GENERATOR_LAMBDA_NAME unset)',
      });
      expect(setBioStatusMock.mock.calls[1]).toEqual([
        artist.id,
        'failed',
        { error: 'Bio generator is not configured (BIO_GENERATOR_LAMBDA_NAME unset)' },
      ]);
      expect(setBioJobTokenMock.mock.calls.at(-1)).toEqual([artist.id, null]);
    });

    it('fails without minting a token when the callback URL is not configured', async () => {
      vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'fakefour-bio-generator');
      delete process.env.NEXT_PUBLIC_BASE_URL;

      const result = await BioGenerationService.runGenerationJob(artist.id);

      expect(result).toEqual({
        status: 'failed',
        error: 'Bio generator callback URL is not configured',
      });
      expect(setBioStatusMock.mock.calls[1]).toEqual([
        artist.id,
        'failed',
        { error: 'Bio generator callback URL is not configured' },
      ]);
      expect(setBioJobTokenMock).not.toHaveBeenCalled();
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('fails when the artist does not exist', async () => {
      vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'fakefour-bio-generator');
      vi.stubEnv('NEXT_PUBLIC_BASE_URL', CALLBACK_BASE);
      findByIdMock.mockResolvedValue(null);

      const result = await BioGenerationService.runGenerationJob(artist.id);

      expect(result).toEqual({ status: 'failed', error: 'Artist not found.' });
      expect(setBioStatusMock.mock.calls[1]).toEqual([
        artist.id,
        'failed',
        { error: 'Artist not found.' },
      ]);
      expect(sendMock).not.toHaveBeenCalled();
    });

    it('fails when the artist has no name to generate from', async () => {
      vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'fakefour-bio-generator');
      vi.stubEnv('NEXT_PUBLIC_BASE_URL', CALLBACK_BASE);
      findByIdMock.mockResolvedValue({
        ...artist,
        displayName: null,
        firstName: '',
        surname: '',
        akaNames: null,
      });

      const result = await BioGenerationService.runGenerationJob(artist.id);

      expect(result).toEqual({
        status: 'failed',
        error: 'Artist has no name to generate a bio from.',
      });
    });

    it('flips to failed and never throws when dispatch throws', async () => {
      vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'fakefour-bio-generator');
      vi.stubEnv('NEXT_PUBLIC_BASE_URL', CALLBACK_BASE);
      setBioJobTokenMock.mockRejectedValue(new Error('DB down'));

      const result = await BioGenerationService.runGenerationJob(artist.id);

      expect(result).toEqual({ status: 'failed', error: 'DB down' });
      expect(setBioStatusMock.mock.calls[1]).toEqual([artist.id, 'failed', { error: 'DB down' }]);
    });

    it('uses a default message when a non-Error value is thrown', async () => {
      vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'fakefour-bio-generator');
      vi.stubEnv('NEXT_PUBLIC_BASE_URL', CALLBACK_BASE);
      setBioJobTokenMock.mockRejectedValue('boom');

      const result = await BioGenerationService.runGenerationJob(artist.id);

      expect(result).toEqual({ status: 'failed', error: 'Bio generation failed unexpectedly.' });
    });
  });
});

describe('BioGenerationService.getGenerationStatus', () => {
  beforeEach(() => {
    getBioGenerationStateMock.mockReset();
  });

  const state = (overrides: Record<string, unknown>) => ({
    bioStatus: null,
    bioError: null,
    bioStartedAt: null,
    bioGeneratedAt: null,
    slug: 'x',
    shortBio: null,
    bio: null,
    altBio: null,
    genres: null,
    bioModel: null,
    bioImages: [],
    bioLinks: [],
    ...overrides,
  });

  it('returns null when the artist is missing', async () => {
    getBioGenerationStateMock.mockResolvedValue(null);

    expect(await BioGenerationService.getGenerationStatus('a1')).toBeNull();
  });

  it('returns the persisted content when the job has succeeded', async () => {
    getBioGenerationStateMock.mockResolvedValue(
      state({
        bioStatus: 'succeeded',
        shortBio: 's',
        bio: '<p>l</p>',
        genres: 'rock',
        bioModel: 'gemini-2.5-pro',
        bioImages: [
          {
            url: 'u',
            thumbnailUrl: null,
            title: null,
            attribution: null,
            license: null,
            sourceUrl: null,
            isPrimary: true,
          },
        ],
        bioLinks: [{ label: 'L', url: 'u2', kind: null }],
      })
    );

    const result = await BioGenerationService.getGenerationStatus('a1');

    expect(result?.status).toBe('succeeded');
    expect(result?.content?.longBio).toBe('<p>l</p>');
    expect(result?.content?.images).toHaveLength(1);
    expect(result?.content?.links[0].label).toBe('L');
  });

  it('omits content while still processing', async () => {
    getBioGenerationStateMock.mockResolvedValue(state({ bioStatus: 'processing' }));

    const result = await BioGenerationService.getGenerationStatus('a1');

    expect(result?.status).toBe('processing');
    expect(result?.content).toBeNull();
  });

  it('reports a failed job with its error and no content', async () => {
    getBioGenerationStateMock.mockResolvedValue(state({ bioStatus: 'failed', bioError: 'boom' }));

    const result = await BioGenerationService.getGenerationStatus('a1');

    expect(result).toEqual({ status: 'failed', error: 'boom', content: null });
  });

  it('defaults succeeded content fields when the persisted columns are null', async () => {
    getBioGenerationStateMock.mockResolvedValue(state({ bioStatus: 'succeeded' }));

    const result = await BioGenerationService.getGenerationStatus('a1');

    expect(result?.content).toEqual({
      shortBio: '',
      longBio: '',
      altBio: '',
      genres: null,
      images: [],
      links: [],
      model: '',
    });
  });

  it('returns the persisted alt bio when the job has succeeded', async () => {
    getBioGenerationStateMock.mockResolvedValue(
      state({ bioStatus: 'succeeded', altBio: '<p>Punchy promo</p>' })
    );

    const result = await BioGenerationService.getGenerationStatus('a1');

    expect(result?.content?.altBio).toBe('<p>Punchy promo</p>');
  });

  it('normalises a missing bioStatus to null', async () => {
    getBioGenerationStateMock.mockResolvedValue(state({ bioStatus: undefined }));

    const result = await BioGenerationService.getGenerationStatus('a1');

    expect(result).toEqual({ status: null, error: null, content: null });
  });

  it('surfaces persisted bio images even when the job never succeeded', async () => {
    getBioGenerationStateMock.mockResolvedValue(
      state({
        bioStatus: null,
        bioImages: [
          {
            url: 'u',
            thumbnailUrl: null,
            title: null,
            attribution: null,
            license: null,
            sourceUrl: null,
            isPrimary: false,
          },
        ],
      })
    );

    const result = await BioGenerationService.getGenerationStatus('a1');

    expect(result?.status).toBeNull();
    expect(result?.content?.images).toHaveLength(1);
  });

  it('keeps surfacing persisted media after a failed regeneration', async () => {
    getBioGenerationStateMock.mockResolvedValue(
      state({
        bioStatus: 'failed',
        bioError: 'boom',
        bioLinks: [{ label: 'L', url: 'u2', kind: null }],
      })
    );

    const result = await BioGenerationService.getGenerationStatus('a1');

    expect(result?.status).toBe('failed');
    expect(result?.content?.links).toHaveLength(1);
  });
});

describe('INVOKE_REQUEST_TIMEOUT_MS', () => {
  it('is a short dispatch timeout — the Event invoke returns 202 immediately', async () => {
    const { INVOKE_REQUEST_TIMEOUT_MS } = await import('./bio-generation-service');

    expect(INVOKE_REQUEST_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });
});
