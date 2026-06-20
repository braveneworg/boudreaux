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
    genres: 'rock',
    images: [],
    links: [],
    model: 'gemini-3-flash',
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
      model: 'gemini-3-flash',
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
    expect(content.bioModel).toBe('gemini-3-flash');
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
    model: 'gemini-3-flash',
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
        bioModel: 'gemini-3-flash',
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
});
