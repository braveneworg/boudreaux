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
vi.mock('@/lib/repositories/artist-repository', () => ({
  ArtistRepository: {
    findById: (id: string) => findByIdMock(id),
    replaceBioContent: (id: string, content: unknown) => replaceBioContentMock(id, content),
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
    model: 'llama',
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
      model: 'llama-3.3-70b-versatile',
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
    expect(result.data.shortBio).toBe('Short teaser');
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
    expect(content.bioModel).toBe('llama-3.3-70b-versatile');
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
