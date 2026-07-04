/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { BioGenerationResult } from '@/lib/validation/bio-generation-schema';

import { BioGenerationService } from './bio-generation-service';

import type { BioGenerationLambdaInput } from './bio-generation-fixture';

vi.mock('server-only', () => ({}));

const mockLoggerWarn = vi.hoisted(() => vi.fn());
const mockLoggerError = vi.hoisted(() => vi.fn());
const sendMock = vi.hoisted(() => vi.fn());
const findByIdMock = vi.hoisted(() => vi.fn());
const replaceBioContentMock = vi.hoisted(() => vi.fn());
const setBioStatusMock = vi.hoisted(() => vi.fn());
const getBioGenerationStateMock = vi.hoisted(() => vi.fn());
const findPublishedByArtistWithCoversMock = vi.hoisted(() => vi.fn());

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
    getBioGenerationState: (id: string) => getBioGenerationStateMock(id),
  },
}));

vi.mock('@/lib/repositories/release-repository', () => ({
  ReleaseRepository: {
    findPublishedByArtistWithCovers: (id: string) => findPublishedByArtistWithCoversMock(id),
  },
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

const okResult: BioGenerationResult = {
  ok: true,
  data: {
    shortBio: 'short',
    longBio: '<p>long</p>',
    altBio: '<p>alt</p>',
    genres: 'rock',
    images: [],
    links: [],
    model: 'gemini-2.5-pro',
  },
};

const encode = (value: unknown): Uint8Array => new TextEncoder().encode(JSON.stringify(value));

describe('BioGenerationService.generate', () => {
  it('returns the deterministic fixture in fake mode', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', 'true');

    const result = await BioGenerationService.generate({ artistId: 'a1', displayName: 'Nas' });

    expect(result.ok).toBe(true);
    expect(sendMock).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it('returns an error when the function name is not configured', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', '');
    delete process.env.BIO_GENERATOR_LAMBDA_NAME;

    const result = await BioGenerationService.generate({ artistId: 'a1', displayName: 'Nas' });

    expect(result).toEqual({
      ok: false,
      error: 'Bio generator is not configured (BIO_GENERATOR_LAMBDA_NAME unset)',
    });
    vi.unstubAllEnvs();
  });

  it('parses a successful Lambda payload', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', '');
    vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'fakefour-bio-generator');
    sendMock.mockResolvedValue({ Payload: encode(okResult) });

    const result = await BioGenerationService.generate({ artistId: 'a1', displayName: 'Nas' });

    expect(result).toEqual(okResult);
    vi.unstubAllEnvs();
  });

  it('returns an error when the Lambda reports a function error', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', '');
    vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'fakefour-bio-generator');
    sendMock.mockResolvedValue({ FunctionError: 'Unhandled', Payload: encode({}) });

    const result = await BioGenerationService.generate({ artistId: 'a1', displayName: 'Nas' });

    expect(result).toEqual({ ok: false, error: 'Bio generation failed' });
    vi.unstubAllEnvs();
  });

  it('returns an error for a malformed payload', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', '');
    vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'fakefour-bio-generator');
    sendMock.mockResolvedValue({ Payload: encode({ ok: true, data: { shortBio: 1 } }) });

    const result = await BioGenerationService.generate({ artistId: 'a1', displayName: 'Nas' });

    expect(result.ok).toBe(false);
    vi.unstubAllEnvs();
  });

  it('returns an error when the invoke throws', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', '');
    vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'fakefour-bio-generator');
    sendMock.mockRejectedValue(new Error('network down'));

    const result = await BioGenerationService.generate({ artistId: 'a1', displayName: 'Nas' });

    expect(result).toEqual({ ok: false, error: 'Failed to reach the bio generator' });
    vi.unstubAllEnvs();
  });

  it('treats a missing Payload as malformed JSON and fails gracefully', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', '');
    vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'fakefour-bio-generator');
    // No Payload at all → empty string → JSON.parse('') throws → caught.
    sendMock.mockResolvedValue({});

    const result = await BioGenerationService.generate({ artistId: 'a1', displayName: 'Nas' });

    expect(result).toEqual({ ok: false, error: 'Failed to reach the bio generator' });
    vi.unstubAllEnvs();
  });
});

describe('BioGenerationService.generateForArtist', () => {
  const artist = {
    id: 'a'.repeat(24),
    firstName: 'Thom',
    surname: 'Yorke',
    displayName: 'Radiohead',
    akaNames: null,
    genres: 'rock',
    isPseudonymous: false,
    slug: 'radiohead',
  };

  const generateResult: BioGenerationResult = {
    ok: true,
    data: {
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
    },
  };

  let generateSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockLoggerWarn.mockReset();
    mockLoggerError.mockReset();
    findByIdMock.mockResolvedValue(artist);
    replaceBioContentMock.mockResolvedValue(undefined);
    findPublishedByArtistWithCoversMock.mockResolvedValue([]);
    // rehostImages returns { results, duplicateAliases } — position-preserving
    rehostImagesMock.mockResolvedValue({
      results: [
        {
          url: 'https://cdn.example.com/media/artists/a/bio/0-abcd1234.jpg',
          width: 1200,
          height: 800,
        },
      ],
      duplicateAliases: new Map(),
    });
    rehostWithVariantsMock.mockResolvedValue({
      url: 'https://cdn.example.com/media/artists/a/bio/0-abcd1234.jpg',
      width: 1200,
      height: 800,
    });
    generateSpy = vi.spyOn(BioGenerationService, 'generate').mockResolvedValue(generateResult);
  });

  afterEach(() => {
    generateSpy.mockRestore();
  });

  it('returns an error when the artist does not exist', async () => {
    findByIdMock.mockResolvedValue(null);

    const result = await BioGenerationService.generateForArtist(artist.id);

    expect(result).toEqual({ success: false, error: 'Artist not found.' });
    expect(generateSpy).not.toHaveBeenCalled();
  });

  it('sanitizes the long bio, stripping scripts and javascript links', async () => {
    const result = await BioGenerationService.generateForArtist(artist.id);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.longBio).not.toContain('javascript:');
    expect(result.data.longBio).not.toContain('<script>');
    // <b> is now preserved by the bio allowlist (no emphasis is stripped).
    expect(result.data.shortBio).toBe('<b>Short</b> teaser');
    expect(result.slug).toBe('radiohead');
  });

  it('strips <img> from the short bio even when the long bio keeps its images', async () => {
    generateSpy.mockResolvedValue({
      ...generateResult,
      data: {
        ...generateResult.data,
        shortBio: '<p>Teaser. <img src="https://cdn.example/x.webp" alt="x"> The end.</p>',
        longBio: '<p>Full bio. <img src="https://cdn.example/x.webp" alt="x"></p>',
      },
    });

    const result = await BioGenerationService.generateForArtist(artist.id);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.shortBio).not.toContain('<img');
    expect(result.data.shortBio).toContain('Teaser.');
    expect(result.data.shortBio).toContain('The end.');
    expect(result.data.longBio).toContain('<img');
  });

  it('sanitizes the alt bio and persists it via the repository', async () => {
    await BioGenerationService.generateForArtist(artist.id);

    const [, content] = replaceBioContentMock.mock.calls[0];
    expect(content.altBio).toContain('<strong>promo</strong>');
    expect(content.altBio).not.toContain('<script>');
  });

  it('rewrites an inline image:N placeholder in the alt bio to the CDN url', async () => {
    generateSpy.mockResolvedValue({
      ...generateResult,
      data: {
        ...generateResult.data,
        altBio: '<p>Promo <img src="image:0" alt="x"></p>',
      },
    });

    const result = await BioGenerationService.generateForArtist(artist.id);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.altBio).toContain(
      'src="https://cdn.example.com/media/artists/a/bio/0-abcd1234.jpg"'
    );
    expect(result.data.altBio).not.toContain('image:0');
  });

  it('persists re-hosted images with attribution via the repository', async () => {
    await BioGenerationService.generateForArtist(artist.id, { links: ['https://example.com'] });

    expect(rehostImagesMock).toHaveBeenCalledWith(
      [{ url: 'https://upload.wikimedia.org/a.jpg', index: 0 }],
      artist.id
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

  it('persists attribution, license, sourceUrl and originalUrl from the lambda result', async () => {
    await BioGenerationService.generateForArtist(artist.id);

    expect(replaceBioContentMock).toHaveBeenCalledWith(
      artist.id,
      expect.objectContaining({
        images: [
          expect.objectContaining({
            attribution: 'Photographer',
            license: 'CC BY-SA 4.0',
            sourceUrl: 'https://commons.wikimedia.org/wiki/File:a.jpg',
            originalUrl: 'https://upload.wikimedia.org/a.jpg',
            thumbnailUrl: expect.stringContaining('cdn'),
          }),
        ],
      })
    );
  });

  it('re-hosts via rehostImages (not rehostWithVariants) at generation time', async () => {
    await BioGenerationService.generateForArtist(artist.id);

    expect(rehostImagesMock).toHaveBeenCalledWith(
      [{ url: 'https://upload.wikimedia.org/a.jpg', index: 0 }],
      artist.id
    );
    expect(rehostWithVariantsMock).not.toHaveBeenCalled();
  });

  it('rewrites inline image:N placeholders to the re-hosted CDN url', async () => {
    generateSpy.mockResolvedValue({
      ...generateResult,
      data: {
        ...generateResult.data,
        longBio: '<p>Intro</p><img src="image:0" alt="Portrait"><p>More</p>',
      },
    });

    const result = await BioGenerationService.generateForArtist(artist.id);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.longBio).toContain(
      'src="https://cdn.example.com/media/artists/a/bio/0-abcd1234.jpg"'
    );
    expect(result.data.longBio).not.toContain('image:0');
  });

  it('drops an inline image:N placeholder that has no re-hosted url', async () => {
    // rehostImages returns { results: [null] } to signal the image was dropped (fetch failed).
    rehostImagesMock.mockResolvedValueOnce({ results: [null], duplicateAliases: new Map() });
    generateSpy.mockResolvedValue({
      ...generateResult,
      data: { ...generateResult.data, longBio: '<p>Intro</p><img src="image:0" alt="x">' },
    });

    const result = await BioGenerationService.generateForArtist(artist.id);

    expect(result.success).toBe(true);
    if (!result.success) return;
    // The unresolved placeholder is a non-http(s) src, so the sanitizer drops it.
    expect(result.data.longBio).not.toContain('image:0');
  });

  it('aliases an image:N placeholder to the survivor URL when index N was deduped', async () => {
    // index 1 is byte-identical to index 0; rehostImages drops index 1 (results[1] = null)
    // and maps it to the survivor URL via duplicateAliases so image:1 still resolves.
    const survivorUrl = 'https://cdn.example.com/media/artists/a/bio/thumbs/0-abcd1234.webp';
    rehostImagesMock.mockResolvedValueOnce({
      results: [{ url: survivorUrl, width: 384, height: 256 }, null],
      duplicateAliases: new Map([[1, survivorUrl]]),
    });
    generateSpy.mockResolvedValue({
      ...generateResult,
      data: {
        ...generateResult.data,
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
            attribution: null,
            license: null,
            sourceUrl: null,
            width: null,
            height: null,
            isPrimary: false,
          },
        ],
        longBio: '<p>Bio <img src="image:1" alt="same photo"> text</p>',
      },
    });

    const result = await BioGenerationService.generateForArtist(artist.id);

    expect(result.success).toBe(true);
    if (!result.success) return;
    // image:1 was deduped — its placeholder must resolve to the survivor's CDN URL.
    expect(result.data.longBio).toContain(survivorUrl);
    expect(result.data.longBio).not.toContain('image:1');
  });

  it('keeps streaming-service links (Spotify, Bandcamp) — product rule reversed 2026-07', async () => {
    generateSpy.mockResolvedValue({
      ...generateResult,
      data: {
        ...generateResult.data,
        links: [
          { label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Radiohead', kind: 'wikipedia' },
          {
            label: 'Spotify',
            url: 'https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb',
            kind: 'streaming',
          },
          { label: 'Bandcamp', url: 'https://radiohead.bandcamp.com', kind: 'streaming' },
        ],
      },
    });

    await BioGenerationService.generateForArtist(artist.id);

    const [, content] = replaceBioContentMock.mock.calls[0];
    expect(content.links).toHaveLength(3);
    expect(content.links[0].url).toBe('https://en.wikipedia.org/wiki/Radiohead');
    expect(content.links[1].url).toBe('https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb');
    expect(content.links[2].url).toBe('https://radiohead.bandcamp.com/');
  });

  it('drops a discovered link whose URL is not http(s)', async () => {
    generateSpy.mockResolvedValue({
      ...generateResult,
      data: {
        ...generateResult.data,
        links: [
          { label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Radiohead', kind: 'wikipedia' },
          { label: 'Evil', url: 'javascript:alert(1)', kind: 'other' },
        ],
      },
    });

    await BioGenerationService.generateForArtist(artist.id);

    const [, content] = replaceBioContentMock.mock.calls[0];
    expect(content.links).toHaveLength(1);
    expect(content.links[0].url).toBe('https://en.wikipedia.org/wiki/Radiohead');
    expect(content.links.some((link: { url: string }) => link.url.includes('javascript:'))).toBe(
      false
    );
  });

  it('drops an image whose re-host fails without aborting generation', async () => {
    // rehostImages returns { results: [null] } when the image failed to fetch.
    rehostImagesMock.mockResolvedValueOnce({ results: [null], duplicateAliases: new Map() });

    const result = await BioGenerationService.generateForArtist(artist.id);

    expect(result.success).toBe(true);
    const [, content] = replaceBioContentMock.mock.calls[0];
    expect(content.images).toHaveLength(0);
  });

  it('forwards the artist real name and optional links to generation', async () => {
    await BioGenerationService.generateForArtist(artist.id, { links: ['https://example.com'] });

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

    await BioGenerationService.generateForArtist(artist.id);

    expect(generateSpy).toHaveBeenCalledWith(expect.objectContaining({ realName: undefined }));
  });

  it('propagates the generation error without writing', async () => {
    generateSpy.mockResolvedValue({ ok: false, error: 'Bio generation failed' });

    const result = await BioGenerationService.generateForArtist(artist.id);

    expect(result).toEqual({ success: false, error: 'Bio generation failed' });
    expect(replaceBioContentMock).not.toHaveBeenCalled();
  });

  it('grounds on the real name when displayName is blank', async () => {
    findByIdMock.mockResolvedValue({ ...artist, displayName: '   ' });

    await BioGenerationService.generateForArtist(artist.id);

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

    await BioGenerationService.generateForArtist(artist.id);

    expect(generateSpy).toHaveBeenCalledWith(expect.objectContaining({ displayName: 'Tommy' }));
  });

  it('errors when the artist has no name at all', async () => {
    findByIdMock.mockResolvedValue({
      ...artist,
      displayName: null,
      firstName: '',
      surname: '',
      akaNames: null,
    });

    const result = await BioGenerationService.generateForArtist(artist.id);

    expect(result).toEqual({
      success: false,
      error: 'Artist has no name to generate a bio from.',
    });
    expect(generateSpy).not.toHaveBeenCalled();
  });

  it('omits the real name when first and surname are blank but not pseudonymous', async () => {
    findByIdMock.mockResolvedValue({
      ...artist,
      firstName: ' ',
      surname: ' ',
      displayName: 'Radiohead',
    });

    await BioGenerationService.generateForArtist(artist.id);

    expect(generateSpy).toHaveBeenCalledWith(expect.objectContaining({ realName: undefined }));
  });

  it('forwards undefined akaNames and genres when the artist has none', async () => {
    findByIdMock.mockResolvedValue({ ...artist, akaNames: null, genres: null });

    await BioGenerationService.generateForArtist(artist.id);

    expect(generateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ akaNames: undefined, existingGenres: undefined })
    );
  });

  it('persists null genres when generation returns no genres', async () => {
    generateSpy.mockResolvedValue({
      ...generateResult,
      data: { ...generateResult.data, genres: null },
    });

    await BioGenerationService.generateForArtist(artist.id);

    const [, content] = replaceBioContentMock.mock.calls[0];
    expect(content.genres).toBeNull();
  });

  it('persists null genres when the value sanitizes down to an empty string', async () => {
    generateSpy.mockResolvedValue({
      ...generateResult,
      // Tag-only content collapses to '' after sanitizeBioText → `|| null`.
      data: { ...generateResult.data, genres: '<script></script>' },
    });

    await BioGenerationService.generateForArtist(artist.id);

    const [, content] = replaceBioContentMock.mock.calls[0];
    expect(content.genres).toBeNull();
  });

  it('falls back to the original image dimensions and null title when re-host omits them', async () => {
    rehostImagesMock.mockResolvedValue({
      results: [{ url: 'https://cdn.example.com/x.jpg' }],
      duplicateAliases: new Map(),
    });
    generateSpy.mockResolvedValue({
      ...generateResult,
      data: {
        ...generateResult.data,
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
      },
    });

    await BioGenerationService.generateForArtist(artist.id);

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
    generateSpy.mockResolvedValue({
      ...generateResult,
      data: {
        ...generateResult.data,
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
      },
    });

    await BioGenerationService.generateForArtist(artist.id);

    const [, content] = replaceBioContentMock.mock.calls[0];
    expect(content.images[0].width).toBeNull();
    expect(content.images[0].height).toBeNull();
  });

  it('persists a null kind for a link that has none', async () => {
    generateSpy.mockResolvedValue({
      ...generateResult,
      data: {
        ...generateResult.data,
        links: [{ label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Radiohead' }],
      },
    });

    await BioGenerationService.generateForArtist(artist.id);

    const [, content] = replaceBioContentMock.mock.calls[0];
    expect(content.links[0].kind).toBeNull();
  });

  it('derives the real name including the middle name', async () => {
    findByIdMock.mockResolvedValue({
      ...artist,
      firstName: 'Julio',
      middleName: 'Francisco',
      surname: 'Ramos',
      isPseudonymous: false,
      bornOn: new Date('1982-05-01'),
      displayName: 'Julio Ramos',
    });

    await BioGenerationService.generateForArtist('id1');

    expect(generateSpy).toHaveBeenCalledWith(
      expect.objectContaining({ realName: 'Julio Francisco Ramos', bornOn: '1982-05-01' })
    );
  });

  it('omits dates the artist record does not have', async () => {
    findByIdMock.mockResolvedValue({ ...artist, bornOn: null, diedOn: null, formedOn: null });

    await BioGenerationService.generateForArtist(artist.id);

    const callArg = generateSpy.mock.calls[0][0] as BioGenerationLambdaInput;
    expect(callArg.bornOn).toBeUndefined();
    expect(callArg.diedOn).toBeUndefined();
    expect(callArg.formedOn).toBeUndefined();
  });

  it('appends kind:release links for the artist published releases', async () => {
    findPublishedByArtistWithCoversMock.mockResolvedValue([
      { id: '665f1f77bcf86cd799439021', title: 'Sad, Fat Luck', releasedOn: null, coverUrl: null },
    ]);

    await BioGenerationService.generateForArtist(artist.id);

    const [, persisted] = replaceBioContentMock.mock.calls[0];
    expect(persisted.links).toContainEqual(
      expect.objectContaining({
        label: 'Sad, Fat Luck',
        url: '/releases/665f1f77bcf86cd799439021',
        kind: 'release',
      })
    );
  });

  it('does not duplicate a release link already present', async () => {
    findPublishedByArtistWithCoversMock.mockResolvedValue([
      { id: '665f1f77bcf86cd799439021', title: 'Sad, Fat Luck', releasedOn: null, coverUrl: null },
      { id: '665f1f77bcf86cd799439021', title: 'Sad, Fat Luck', releasedOn: null, coverUrl: null },
    ]);

    await BioGenerationService.generateForArtist(artist.id);

    const [, persisted] = replaceBioContentMock.mock.calls[0];
    const matches = persisted.links.filter(
      (link: { url: string }) => link.url === '/releases/665f1f77bcf86cd799439021'
    );
    expect(matches).toHaveLength(1);
  });

  it('persists the discovered links unchanged when the release lookup fails', async () => {
    findPublishedByArtistWithCoversMock.mockRejectedValue(new Error('db down'));

    await BioGenerationService.generateForArtist(artist.id);

    // Only the discovered Wikipedia link survives — no kind:'release' entries
    // are appended when the lookup fails, and the failure stays non-fatal.
    const [, persisted] = replaceBioContentMock.mock.calls[0];
    expect(persisted.links).toHaveLength(1);
    expect(persisted.links[0]).toEqual(
      expect.objectContaining({
        url: 'https://en.wikipedia.org/wiki/Radiohead',
        kind: 'wikipedia',
      })
    );
  });

  it('logs the cover lookup failure while still completing generation', async () => {
    const releaseError = new Error('connection timeout');
    findPublishedByArtistWithCoversMock.mockRejectedValue(releaseError);

    await BioGenerationService.generateForArtist(artist.id);

    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'bio_release_covers_failed',
      expect.objectContaining({ artistId: artist.id })
    );
    // Generation still succeeds despite the cover lookup failure.
    expect(replaceBioContentMock).toHaveBeenCalled();
  });

  describe('internal release grounding and covers', () => {
    it('passes label releases to the lambda input', async () => {
      findPublishedByArtistWithCoversMock.mockResolvedValue([
        {
          id: 'rel1',
          title: 'Label Album',
          releasedOn: new Date('2020-02-02T00:00:00Z'),
          coverUrl: 'https://cdn.fakefour.com/media/releases/rel1/cover.jpg',
        },
      ]);
      await BioGenerationService.generateForArtist('a'.repeat(24));
      const input = generateSpy.mock.calls[0][0] as BioGenerationLambdaInput;
      expect(input.releases).toEqual([
        { title: 'Label Album', releasedOn: '2020-02-02', url: '/releases/rel1' },
      ]);
    });

    it('appends internal cover images with kind cover and CDN thumbnail', async () => {
      findPublishedByArtistWithCoversMock.mockResolvedValue([
        {
          id: 'rel1',
          title: 'Label Album',
          releasedOn: new Date('2020-02-02T00:00:00Z'),
          coverUrl: 'https://cdn.fakefour.com/media/releases/rel1/cover.jpg',
        },
      ]);
      const result = await BioGenerationService.generateForArtist('a'.repeat(24));
      if (!result.success) throw new Error(result.error);
      const cover = result.data.images.find((image) => image.kind === 'cover');
      expect(cover).toMatchObject({
        url: 'https://cdn.fakefour.com/media/releases/rel1/cover.jpg',
        title: 'Label Album',
        alt: 'Label Album album cover',
      });
      // Persisted through the repository with sortOrder after discovered images.
      const persisted = replaceBioContentMock.mock.calls[0][1].images;
      expect(persisted.at(-1)).toMatchObject({ kind: 'cover', title: 'Label Album' });
    });

    it('skips cover rows whose url already exists among discovered images', async () => {
      const coverUrl = 'https://cdn.fakefour.com/media/releases/rel1/cover.jpg';
      findPublishedByArtistWithCoversMock.mockResolvedValue([
        {
          id: 'rel1',
          title: 'Label Album',
          releasedOn: new Date('2020-02-02T00:00:00Z'),
          coverUrl,
        },
      ]);
      // rehostImages returns the same CDN url as the release cover so it's already persisted
      rehostImagesMock.mockResolvedValueOnce({
        results: [{ url: coverUrl, width: null, height: null }],
        duplicateAliases: new Map(),
      });

      const result = await BioGenerationService.generateForArtist('a'.repeat(24));
      if (!result.success) throw new Error(result.error);

      const matching = result.data.images.filter((image) => image.url === coverUrl);
      expect(matching).toHaveLength(1);
    });
  });
});

describe('BioGenerationService.runGenerationJob', () => {
  let generateForArtistSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setBioStatusMock.mockReset().mockResolvedValue(undefined);
    generateForArtistSpy = vi.spyOn(BioGenerationService, 'generateForArtist');
  });

  afterEach(() => {
    generateForArtistSpy.mockRestore();
  });

  const okContent = {
    shortBio: 's',
    longBio: '<p>l</p>',
    genres: null,
    images: [],
    links: [],
    model: 'gemini-2.5-pro',
  };

  it('flips to processing then succeeded (clearing the error) on success', async () => {
    generateForArtistSpy.mockResolvedValue({ success: true, data: okContent, slug: 'x' });

    const result = await BioGenerationService.runGenerationJob('a1', { links: ['u'] });

    expect(result.success).toBe(true);
    expect(generateForArtistSpy).toHaveBeenCalledWith('a1', { links: ['u'] });
    expect(setBioStatusMock.mock.calls[0]).toEqual(['a1', 'processing', undefined]);
    expect(setBioStatusMock.mock.calls[1]).toEqual(['a1', 'succeeded', { error: null }]);
  });

  it('flips to failed with the message when generation returns an error', async () => {
    generateForArtistSpy.mockResolvedValue({ success: false, error: 'nope' });

    await BioGenerationService.runGenerationJob('a1');

    expect(setBioStatusMock.mock.calls[1]).toEqual(['a1', 'failed', { error: 'nope' }]);
  });

  it('flips to failed and never throws when generation throws', async () => {
    generateForArtistSpy.mockRejectedValue(new Error('DB down'));

    const result = await BioGenerationService.runGenerationJob('a1');

    expect(result).toEqual({ success: false, error: 'DB down' });
    expect(setBioStatusMock.mock.calls[1]).toEqual(['a1', 'failed', { error: 'DB down' }]);
  });

  it('uses a default message when a non-Error value is thrown', async () => {
    generateForArtistSpy.mockRejectedValue('boom');

    const result = await BioGenerationService.runGenerationJob('a1');

    expect(result).toEqual({ success: false, error: 'Bio generation failed unexpectedly.' });
    expect(setBioStatusMock.mock.calls[1]).toEqual([
      'a1',
      'failed',
      { error: 'Bio generation failed unexpectedly.' },
    ]);
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
});

describe('INVOKE_REQUEST_TIMEOUT_MS', () => {
  it('out-waits the Lambda function timeout (900s) so invokes are never aborted early', async () => {
    const { INVOKE_REQUEST_TIMEOUT_MS } = await import('./bio-generation-service');

    expect(INVOKE_REQUEST_TIMEOUT_MS).toBeGreaterThan(900_000);
  });
});
