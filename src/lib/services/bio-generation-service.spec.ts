/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { BioGenerationResult } from '@/lib/validation/bio-generation-schema';

import { BioGenerationService } from './bio-generation-service';

vi.mock('server-only', () => ({}));

const sendMock = vi.fn();
vi.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: class {
    send = sendMock;
  },
  InvokeCommand: class {
    constructor(public input: unknown) {}
  },
}));

const findByIdMock = vi.fn();
const replaceBioContentMock = vi.fn();
const setBioStatusMock = vi.fn();
const getBioGenerationStateMock = vi.fn();
vi.mock('@/lib/repositories/artist-repository', () => ({
  ArtistRepository: {
    findById: (id: string) => findByIdMock(id),
    replaceBioContent: (id: string, content: unknown) => replaceBioContentMock(id, content),
    setBioStatus: (id: string, status: string, opts: unknown) => setBioStatusMock(id, status, opts),
    getBioGenerationState: (id: string) => getBioGenerationStateMock(id),
  },
}));

const rehostMock = vi.fn();
vi.mock('./bio-image-service', () => ({
  BioImageService: {
    rehostWithVariants: (url: string, artistId: string, index: number) =>
      rehostMock(url, artistId, index),
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
    findByIdMock.mockResolvedValue(artist);
    replaceBioContentMock.mockResolvedValue(undefined);
    rehostMock.mockResolvedValue({
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

  it('persists re-hosted images (CDN url, no attribution) via the repository', async () => {
    await BioGenerationService.generateForArtist(artist.id, { links: ['https://example.com'] });

    expect(rehostMock).toHaveBeenCalledWith('https://upload.wikimedia.org/a.jpg', artist.id, 0);
    expect(replaceBioContentMock).toHaveBeenCalledTimes(1);
    const [, content] = replaceBioContentMock.mock.calls[0];
    expect(content.images[0].url).toBe(
      'https://cdn.example.com/media/artists/a/bio/0-abcd1234.jpg'
    );
    expect(content.images[0].attribution).toBeNull();
    expect(content.images[0].sortOrder).toBe(0);
    expect(content.images[0].isPrimary).toBe(true);
    expect(content.bioModel).toBe('gemini-2.5-pro');
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
    rehostMock.mockRejectedValueOnce(new Error('fetch failed'));
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

  it('drops a discovered link to a listening service', async () => {
    generateSpy.mockResolvedValue({
      ...generateResult,
      data: {
        ...generateResult.data,
        links: [
          { label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Radiohead', kind: 'wikipedia' },
          {
            label: 'Spotify',
            url: 'https://open.spotify.com/artist/4Z8W4fKeB5YxbusRsdQVPb',
            kind: 'other',
          },
          { label: 'Bandcamp', url: 'https://radiohead.bandcamp.com', kind: 'other' },
        ],
      },
    });

    await BioGenerationService.generateForArtist(artist.id);

    const [, content] = replaceBioContentMock.mock.calls[0];
    expect(content.links).toHaveLength(1);
    expect(content.links[0].url).toBe('https://en.wikipedia.org/wiki/Radiohead');
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
    rehostMock.mockRejectedValueOnce(new Error('fetch failed'));

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
    rehostMock.mockResolvedValue({ url: 'https://cdn.example.com/x.jpg' });
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
    rehostMock.mockResolvedValue({ url: 'https://cdn.example.com/x.jpg' });
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
