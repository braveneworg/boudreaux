/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  bioGenerationCallbackSchema,
  bioProgressPostSchema,
  type BioGenerationData,
} from '@/lib/validation/bio-generation-schema';

import { fakeBioGeneration } from './bio-generation-fixture';
import {
  bioGenerationJob,
  BioGenerationService,
  MAX_LAMBDA_RELEASES,
  persistGeneratedBio,
} from './bio-generation-service';

import type { BioGenerationLambdaInput } from './bio-generation-fixture';

vi.mock('server-only', () => ({}));

const mockLoggerWarn = vi.hoisted(() => vi.fn());
const mockLoggerError = vi.hoisted(() => vi.fn());
const findByIdMock = vi.hoisted(() => vi.fn());
const replaceBioContentMock = vi.hoisted(() => vi.fn());
const setBioStatusMock = vi.hoisted(() => vi.fn());
const beginBioRunMock = vi.hoisted(() => vi.fn());
const setBioJobTokenMock = vi.hoisted(() => vi.fn());
const claimBioJobTokenMock = vi.hoisted(() => vi.fn());
const setBioProgressMock = vi.hoisted(() => vi.fn());
const getBioGenerationStateMock = vi.hoisted(() => vi.fn());
const findCustomBioImageUrlsMock = vi.hoisted(() => vi.fn());
// Baked-in empty pool: `mockReset()` restores it, so only the pool-dedupe
// tests opt in to stored fingerprints.
const findFingerprintsMock = vi.hoisted(() =>
  vi.fn(
    async (
      _artistId: string,
      _origins?: string[]
    ): Promise<
      Array<{ url: string; contentHash: string | null; perceptualHash: string | null }>
    > => []
  )
);
const findPublishedByArtistWithCoversMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/utils/logger', () => ({
  loggers: { media: { warn: mockLoggerWarn, error: mockLoggerError } },
}));

vi.mock('@/lib/repositories/artist-repository', () => ({
  ArtistRepository: {
    findById: (id: string) => findByIdMock(id),
    replaceBioContent: (id: string, content: unknown) => replaceBioContentMock(id, content),
    setBioStatus: (id: string, status: string, opts: unknown) => setBioStatusMock(id, status, opts),
    beginBioRun: (id: string, now: Date) => beginBioRunMock(id, now),
    setBioJobToken: (id: string, token: string | null) => setBioJobTokenMock(id, token),
    claimBioJobToken: (id: string, token: string) => claimBioJobTokenMock(id, token),
    setBioProgress: (id: string, progress: unknown) => setBioProgressMock(id, progress),
    getBioGenerationState: (id: string) => getBioGenerationStateMock(id),
  },
}));

vi.mock('@/lib/repositories/artist-bio-image-repository', () => ({
  ArtistBioImageRepository: {
    findCustomUrls: (id: string) => findCustomBioImageUrlsMock(id),
    findFingerprints: (id: string, origins?: string[]) => findFingerprintsMock(id, origins),
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
    rehostImages: (
      images: ReadonlyArray<{ url: string; index: number }>,
      artistId: string,
      knownImages: unknown
    ) => rehostImagesMock(images, artistId, knownImages),
  },
}));

// Baked-in passthrough: `mockReset()` restores this original implementation,
// so every test starts from "the validator keeps everything" unless it opts in
// to a drop via `mockImplementationOnce`.
const validateBioLinksMock = vi.fn(
  async <T extends { url: string }>(links: T[]): Promise<T[]> => links
);
vi.mock('@/lib/utils/validate-bio-links', () => ({
  validateBioLinks: (links: Array<{ url: string }>) => validateBioLinksMock(links),
}));

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('persistGeneratedBio', () => {
  const artistId = 'a'.repeat(24);
  const artistSlug = 'radiohead';

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
    const content = await persistGeneratedBio(artistId, baseData, [], artistSlug);

    expect(content.longBio).not.toContain('<script>');
    expect(content.longBio).not.toContain('javascript:');
    expect(content.altBio).toContain('<strong>promo</strong>');
    expect(content.genres).toBe('art-rock');
    expect(content.model).toBe('gemini-2.5-pro');
    expect(content.images[0].url).toBe(
      'https://cdn.example.com/media/artists/a/bio/0-abcd1234.jpg'
    );
    expect(content.links[0].url).toBe('https://en.wikipedia.org/wiki/Radiohead');
  });

  it('keeps the emphasis markup in the sanitized short bio', async () => {
    const content = await persistGeneratedBio(artistId, baseData, [], artistSlug);

    expect(content.shortBio).toBe('<b>Short</b> teaser');
  });

  it('strips <img> from the short bio even when the long bio keeps its images', async () => {
    const content = await persistGeneratedBio(
      artistId,
      withData({
        shortBio: '<p>Teaser. <img src="https://cdn.example/x.webp" alt="x"> The end.</p>',
        longBio: '<p>Full bio. <img src="https://cdn.example/x.webp" alt="x"></p>',
      }),
      [],
      artistSlug
    );

    expect(content.shortBio).not.toContain('<img');
    expect(content.shortBio).toContain('Teaser.');
    expect(content.shortBio).toContain('The end.');
    expect(content.longBio).toContain('<img');
  });

  it('sanitizes the alt bio and persists it via the repository', async () => {
    await persistGeneratedBio(artistId, baseData, [], artistSlug);

    const [, content] = replaceBioContentMock.mock.calls[0];
    expect(content.altBio).toContain('<strong>promo</strong>');
    expect(content.altBio).not.toContain('<script>');
  });

  // A human's display-image choice outlives regeneration (ADR-0008): the job
  // persists its suggestion in isPrimary and never a display position.
  it('persists images without a display position, keeping isPrimary as the suggestion', async () => {
    await persistGeneratedBio(artistId, baseData, [], artistSlug);

    const [, content] = replaceBioContentMock.mock.calls[0];
    expect(content.images[0]).toMatchObject({ isPrimary: true });
    expect(content.images[0]).not.toHaveProperty('displayOrder');
  });

  it('rewrites an inline image:N placeholder in the alt bio to the CDN url', async () => {
    const content = await persistGeneratedBio(
      artistId,
      withData({ altBio: '<p>Promo <img src="image:0" alt="x"></p>' }),
      [],
      artistSlug
    );

    expect(content.altBio).toContain(
      'src="https://cdn.example.com/media/artists/a/bio/0-abcd1234.jpg"'
    );
    expect(content.altBio).not.toContain('image:0');
  });

  it('persists re-hosted images with attribution via the repository', async () => {
    await persistGeneratedBio(artistId, baseData, [], artistSlug);

    expect(rehostImagesMock).toHaveBeenCalledWith(
      [{ url: 'https://upload.wikimedia.org/a.jpg', index: 0 }],
      artistId,
      []
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
    await persistGeneratedBio(artistId, baseData, [], artistSlug);

    expect(rehostImagesMock).toHaveBeenCalledWith(
      [{ url: 'https://upload.wikimedia.org/a.jpg', index: 0 }],
      artistId,
      []
    );
    expect(rehostWithVariantsMock).not.toHaveBeenCalled();
  });

  it('seeds the re-host dedupe with the hashes of the rows a regeneration keeps', async () => {
    const survivors = [
      { url: 'https://cdn/linked.webp', contentHash: 'sha-linked', perceptualHash: null },
    ];
    findFingerprintsMock.mockResolvedValueOnce(survivors);

    await persistGeneratedBio(artistId, baseData, [], artistSlug);

    // Generated rows are about to be replaced, so only custom + linked rows
    // may shadow a newly discovered image.
    expect(findFingerprintsMock.mock.calls).toEqual([[artistId, ['custom', 'linked']]]);
    expect(rehostImagesMock.mock.calls).toEqual([
      [[{ url: 'https://upload.wikimedia.org/a.jpg', index: 0 }], artistId, survivors],
    ]);
  });

  it('re-hosts without a pool seed when the fingerprint lookup fails', async () => {
    findFingerprintsMock.mockRejectedValueOnce(new Error('db down'));

    await persistGeneratedBio(artistId, baseData, [], artistSlug);

    expect(rehostImagesMock.mock.calls).toEqual([
      [[{ url: 'https://upload.wikimedia.org/a.jpg', index: 0 }], artistId, []],
    ]);
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'bio_pool_fingerprints_failed',
      expect.objectContaining({ artistId })
    );
    expect(replaceBioContentMock).toHaveBeenCalledTimes(1);
  });

  it('resolves the placeholder of an image already in the pool to the pool copy', async () => {
    rehostImagesMock.mockResolvedValueOnce({
      results: [null],
      duplicateAliases: new Map([[0, 'https://cdn/linked.webp']]),
    });

    const content = await persistGeneratedBio(
      artistId,
      withData({ altBio: '<p>Promo <img src="image:0" alt="x"></p>' }),
      [],
      artistSlug
    );

    expect(content.altBio).toContain('src="https://cdn/linked.webp"');
    const [, persisted] = replaceBioContentMock.mock.calls[0];
    expect(persisted.images).toEqual([]);
  });

  it("stores each re-hosted image's content and perceptual hashes", async () => {
    rehostImagesMock.mockResolvedValueOnce({
      results: [
        {
          url: 'https://cdn.example.com/media/artists/a/bio/0-abcd1234.jpg',
          width: 1200,
          height: 800,
          contentHash: 'sha-a',
          perceptualHash: '0000000000000abc',
        },
      ],
      duplicateAliases: new Map(),
    });

    const content = await persistGeneratedBio(artistId, baseData, [], artistSlug);

    const [, persisted] = replaceBioContentMock.mock.calls[0];
    expect(persisted.images[0]).toMatchObject({
      contentHash: 'sha-a',
      perceptualHash: '0000000000000abc',
    });
    // Hashes are storage-only: the admin preview payload never carries them.
    expect(content.images[0]).not.toHaveProperty('contentHash');
    expect(content.images[0]).not.toHaveProperty('perceptualHash');
  });

  it('rewrites inline image:N placeholders to the re-hosted CDN url', async () => {
    const content = await persistGeneratedBio(
      artistId,
      withData({ longBio: '<p>Intro</p><img src="image:0" alt="Portrait"><p>More</p>' }),
      [],
      artistSlug
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
      [],
      artistSlug
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
      [],
      artistSlug
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
      [],
      artistSlug
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
      [],
      artistSlug
    );

    const [, content] = replaceBioContentMock.mock.calls[0];
    expect(content.links).toHaveLength(1);
    expect(content.links[0].url).toBe('https://en.wikipedia.org/wiki/Radiohead');
  });

  it('drops an image whose re-host fails without aborting persistence', async () => {
    rehostImagesMock.mockResolvedValueOnce({ results: [null], duplicateAliases: new Map() });

    await persistGeneratedBio(artistId, baseData, [], artistSlug);

    const [, content] = replaceBioContentMock.mock.calls[0];
    expect(content.images).toHaveLength(0);
  });

  it('persists null genres when the data returns no genres', async () => {
    await persistGeneratedBio(artistId, withData({ genres: null }), [], artistSlug);

    const [, content] = replaceBioContentMock.mock.calls[0];
    expect(content.genres).toBeNull();
  });

  it('persists null genres when the value sanitizes down to an empty string', async () => {
    await persistGeneratedBio(artistId, withData({ genres: '<script></script>' }), [], artistSlug);

    const [, content] = replaceBioContentMock.mock.calls[0];
    expect(content.genres).toBeNull();
  });

  it('normalises the generated genres into the stored lowercase-dashed form', async () => {
    await persistGeneratedBio(
      artistId,
      withData({ genres: 'Indie Rock, Post Punk' }),
      [],
      artistSlug
    );

    const [, content] = replaceBioContentMock.mock.calls[0];
    expect(content.genres).toBe('indie-rock,post-punk');
  });

  it('drops genres the model repeated in a different case', async () => {
    await persistGeneratedBio(artistId, withData({ genres: 'Punk, punk' }), [], artistSlug);

    const [, content] = replaceBioContentMock.mock.calls[0];
    expect(content.genres).toBe('punk');
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
      [],
      artistSlug
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
      [],
      artistSlug
    );

    const [, content] = replaceBioContentMock.mock.calls[0];
    expect(content.images[0].width).toBeNull();
    expect(content.images[0].height).toBeNull();
  });

  it('persists a null kind for a link that has none', async () => {
    await persistGeneratedBio(
      artistId,
      withData({ links: [{ label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Radiohead' }] }),
      [],
      artistSlug
    );

    const [, content] = replaceBioContentMock.mock.calls[0];
    expect(content.links[0].kind).toBeNull();
  });

  it('appends kind:release links for the artist published releases', async () => {
    await persistGeneratedBio(
      artistId,
      baseData,
      [
        {
          id: '665f1f77bcf86cd799439021',
          title: 'Sad, Fat Luck',
          releasedOn: null,
          coverUrl: null,
        },
      ],
      artistSlug
    );

    const [, content] = replaceBioContentMock.mock.calls[0];
    expect(content.links).toContainEqual(
      expect.objectContaining({
        label: 'Sad, Fat Luck',
        url: '/releases?artist=radiohead&release=665f1f77bcf86cd799439021',
        kind: 'release',
      })
    );
  });

  it('does not duplicate a release link already present', async () => {
    await persistGeneratedBio(
      artistId,
      baseData,
      [
        {
          id: '665f1f77bcf86cd799439021',
          title: 'Sad, Fat Luck',
          releasedOn: null,
          coverUrl: null,
        },
        {
          id: '665f1f77bcf86cd799439021',
          title: 'Sad, Fat Luck',
          releasedOn: null,
          coverUrl: null,
        },
      ],
      artistSlug
    );

    const [, content] = replaceBioContentMock.mock.calls[0];
    const matches = content.links.filter(
      (link: { url: string }) =>
        link.url === '/releases?artist=radiohead&release=665f1f77bcf86cd799439021'
    );
    expect(matches).toHaveLength(1);
  });

  it('appends internal cover images with kind cover and CDN thumbnail', async () => {
    const content = await persistGeneratedBio(
      artistId,
      baseData,
      [
        {
          id: 'rel1',
          title: 'Label Album',
          releasedOn: new Date('2020-02-02T00:00:00Z'),
          coverUrl: 'https://cdn.fakefour.com/media/releases/rel1/cover.jpg',
        },
      ],
      artistSlug
    );

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

    const content = await persistGeneratedBio(
      artistId,
      baseData,
      [
        {
          id: 'rel1',
          title: 'Label Album',
          releasedOn: new Date('2020-02-02T00:00:00Z'),
          coverUrl,
        },
      ],
      artistSlug
    );

    const matching = content.images.filter((image) => image.url === coverUrl);
    expect(matching).toHaveLength(1);
  });

  it('threads a licenseUrl from the discovered image through to the persisted row', async () => {
    const content = await persistGeneratedBio(
      artistId,
      withData({
        images: [
          {
            url: 'https://upload.wikimedia.org/a.jpg',
            thumbnailUrl: null,
            title: 'Portrait',
            attribution: 'Photographer',
            license: 'CC BY-SA 4.0',
            licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
            sourceUrl: null,
            isPrimary: true,
          },
        ],
      }),
      [],
      artistSlug
    );

    expect(content.images[0].licenseUrl).toBe('https://creativecommons.org/licenses/by-sa/4.0/');
  });

  it('defaults licenseUrl to null when the discovered image omits it', async () => {
    const content = await persistGeneratedBio(artistId, baseData, [], artistSlug);

    expect(content.images[0].licenseUrl).toBeNull();
  });

  it('drops a non-http(s) licenseUrl (javascript:) to null before persistence', async () => {
    const content = await persistGeneratedBio(
      artistId,
      withData({
        images: [
          {
            url: 'https://upload.wikimedia.org/a.jpg',
            thumbnailUrl: null,
            title: 'Portrait',
            attribution: 'Photographer',
            license: 'CC BY-SA 4.0',
            licenseUrl: 'javascript:alert(1)',
            sourceUrl: null,
            isPrimary: true,
          },
        ],
      }),
      [],
      artistSlug
    );

    expect(content.images[0].licenseUrl).toBeNull();
  });

  it('drops a non-http(s) sourceUrl (javascript:) to null before persistence', async () => {
    const content = await persistGeneratedBio(
      artistId,
      withData({
        images: [
          {
            url: 'https://upload.wikimedia.org/a.jpg',
            thumbnailUrl: null,
            title: 'Portrait',
            attribution: 'Photographer',
            license: 'CC BY-SA 4.0',
            licenseUrl: null,
            sourceUrl: 'javascript:alert(1)',
            isPrimary: true,
          },
        ],
      }),
      [],
      artistSlug
    );

    expect(content.images[0].sourceUrl).toBeNull();
  });

  it('threads hasFace and faceScore from the discovered image through to the persisted row', async () => {
    const content = await persistGeneratedBio(
      artistId,
      withData({
        images: [
          {
            url: 'https://upload.wikimedia.org/a.jpg',
            thumbnailUrl: null,
            title: 'Portrait',
            attribution: 'Photographer',
            license: null,
            sourceUrl: null,
            hasFace: true,
            faceScore: 97.4,
            isPrimary: true,
          },
        ],
      }),
      [],
      artistSlug
    );

    expect(content.images[0].hasFace).toBe(true);
    expect(content.images[0].faceScore).toBe(97.4);
  });

  it('defaults hasFace and faceScore to null when the discovered image omits them', async () => {
    const content = await persistGeneratedBio(artistId, baseData, [], artistSlug);

    expect(content.images[0].hasFace).toBeNull();
    expect(content.images[0].faceScore).toBeNull();
  });
});

describe('persistGeneratedBio image-rank sort', () => {
  const artistId = 'a'.repeat(24);
  const artistSlug = 'radiohead';

  // A discovered image whose fields default to a non-primary, unlicensed,
  // face-unscored row.
  const image = (
    overrides: Partial<BioGenerationData['images'][number]> & { url: string }
  ): BioGenerationData['images'][number] => ({
    thumbnailUrl: null,
    title: null,
    attribution: 'src',
    license: null,
    sourceUrl: null,
    isPrimary: false,
    ...overrides,
  });

  const buildData = (images: BioGenerationData['images']): BioGenerationData => ({
    shortBio: '<p>s</p>',
    longBio: '<p>l</p>',
    altBio: '<p>a</p>',
    genres: 'rock',
    images,
    links: [],
    model: 'gemini-2.5-pro',
  });

  // A CDN URL that survives HTML sanitization, derived from a per-image token.
  const cdn = (token: string): string => `https://cdn.example.com/media/artists/a/bio/${token}.jpg`;

  // Re-host mock that echoes each input URL as its CDN URL, preserving order so
  // the persist sort (not the re-host) is what reorders the survivors.
  const mockRehostEcho = (tokens: string[]): void => {
    rehostImagesMock.mockResolvedValue({
      results: tokens.map((token) => ({ url: cdn(token), width: null, height: null })),
      duplicateAliases: new Map(),
    });
  };

  beforeEach(() => {
    replaceBioContentMock.mockReset().mockResolvedValue(undefined);
    rehostImagesMock.mockReset();
  });

  it('orders primaries first, then licensed non-primaries before unlicensed ones', async () => {
    // Input deliberately interleaves tiers so a stable sort must reorder them:
    // [unlicensed non-primary, licensed non-primary, primary]. Neither the
    // licensed nor unlicensed row carries a face score, so they fall through the
    // face tier and are separated by the license tier.
    const urls = ['u', 'l', 'p'];
    mockRehostEcho(urls);

    const content = await persistGeneratedBio(
      artistId,
      buildData([
        image({ url: 'u' }),
        image({ url: 'l', license: 'CC BY 4.0' }),
        image({ url: 'p', isPrimary: true }),
      ]),
      [],
      artistSlug
    );

    expect(content.images.map((img) => img.url)).toEqual([cdn('p'), cdn('l'), cdn('u')]);
  });

  it('ranks a higher face score ahead of a lower one, both ahead of an unscored row', async () => {
    // face 95 beats face 60 beats null-face (nulls sort last within the tier).
    const urls = ['f60', 'none', 'f95'];
    mockRehostEcho(urls);

    const content = await persistGeneratedBio(
      artistId,
      buildData([
        image({ url: 'f60', faceScore: 60 }),
        image({ url: 'none' }),
        image({ url: 'f95', faceScore: 95 }),
      ]),
      [],
      artistSlug
    );

    expect(content.images.map((img) => img.url)).toEqual([cdn('f95'), cdn('f60'), cdn('none')]);
  });

  it('breaks a face-score tie of nulls by license, keeping licensed ahead of unlicensed', async () => {
    // Both rows are non-primary and face-unscored; the license tier decides.
    const urls = ['unlicensed', 'licensed'];
    mockRehostEcho(urls);

    const content = await persistGeneratedBio(
      artistId,
      buildData([image({ url: 'unlicensed' }), image({ url: 'licensed', license: 'CC BY 4.0' })]),
      [],
      artistSlug
    );

    expect(content.images.map((img) => img.url)).toEqual([cdn('licensed'), cdn('unlicensed')]);
  });

  it('keeps a primary ahead of a higher-scored non-primary', async () => {
    // isPrimary is the top tier, so it wins even against a strong face score.
    const urls = ['face99', 'primary'];
    mockRehostEcho(urls);

    const content = await persistGeneratedBio(
      artistId,
      buildData([
        image({ url: 'face99', faceScore: 99 }),
        image({ url: 'primary', isPrimary: true }),
      ]),
      [],
      artistSlug
    );

    expect(content.images.map((img) => img.url)).toEqual([cdn('primary'), cdn('face99')]);
  });

  it('re-indexes sortOrder to 0..n after the image-rank sort', async () => {
    const urls = ['u', 'l', 'p'];
    mockRehostEcho(urls);

    await persistGeneratedBio(
      artistId,
      buildData([
        image({ url: 'u' }),
        image({ url: 'l', license: 'CC BY 4.0' }),
        image({ url: 'p', isPrimary: true }),
      ]),
      [],
      artistSlug
    );

    const persisted = replaceBioContentMock.mock.calls[0][1].images;
    expect(persisted.map((img: { sortOrder: number }) => img.sortOrder)).toEqual([0, 1, 2]);
  });

  it('keeps stable order among non-adjacent same-tier (unlicensed) images', async () => {
    // Two unlicensed rows straddle a licensed one; the licensed row jumps ahead
    // but the two unlicensed rows must keep their original relative order.
    const urls = ['u1', 'l', 'u2'];
    mockRehostEcho(urls);

    const content = await persistGeneratedBio(
      artistId,
      buildData([
        image({ url: 'u1' }),
        image({ url: 'l', license: 'CC BY 4.0' }),
        image({ url: 'u2' }),
      ]),
      [],
      artistSlug
    );

    expect(content.images.map((img) => img.url)).toEqual([cdn('l'), cdn('u1'), cdn('u2')]);
  });

  it('resolves an image:N placeholder for an image the sort moves to a later slot', async () => {
    // image:0 is the unlicensed row that the image-rank sort demotes to last;
    // the placeholder index is the ORIGINAL index, so it must still resolve to
    // that image's CDN url even though its persisted position changed.
    const urls = ['u', 'l'];
    mockRehostEcho(urls);

    const content = await persistGeneratedBio(
      artistId,
      {
        ...buildData([image({ url: 'u' }), image({ url: 'l', license: 'CC BY 4.0' })]),
        longBio: '<p>Here: <img src="image:0" alt="x"></p>',
      },
      [],
      artistSlug
    );

    expect(content.longBio).toContain(`src="${cdn('u')}"`);
    expect(content.longBio).not.toContain('image:0');
  });
});

describe('persistGeneratedBio figure composition', () => {
  const artistId = 'a'.repeat(24);
  const artistSlug = 'radiohead';

  // A discovered image with minimal caption metadata (schema requires a
  // non-null attribution).
  const image = (
    overrides: Partial<BioGenerationData['images'][number]> & { url: string }
  ): BioGenerationData['images'][number] => ({
    thumbnailUrl: null,
    title: null,
    attribution: 'src',
    license: null,
    sourceUrl: null,
    isPrimary: false,
    ...overrides,
  });

  const buildData = (
    overrides: Partial<BioGenerationData> & Pick<BioGenerationData, 'longBio' | 'images'>
  ): BioGenerationData => ({
    shortBio: '<p>s</p>',
    altBio: '<p>a</p>',
    genres: 'rock',
    links: [],
    model: 'gemini-2.5-pro',
    ...overrides,
  });

  // A CDN URL that survives HTML sanitization, derived from a per-image token.
  const cdn = (token: string): string =>
    `https://cdn.example.com/media/artists/a/bio/${token}.webp`;

  // Re-host mock echoing one CDN URL per token, position-preserving.
  const mockRehostEcho = (tokens: string[]): void => {
    rehostImagesMock.mockResolvedValue({
      results: tokens.map((token) => ({ url: cdn(token), width: null, height: null })),
      duplicateAliases: new Map(),
    });
  };

  beforeEach(() => {
    replaceBioContentMock.mockReset().mockResolvedValue(undefined);
    rehostImagesMock.mockReset();
  });

  it('composes mapped placeholders into alternating right/left captioned figures', async () => {
    mockRehostEcho(['p0', 'p1']);

    const content = await persistGeneratedBio(
      artistId,
      buildData({
        images: [
          image({
            url: 'https://src.example.com/a.jpg',
            title: 'Portrait',
            attribution: 'Photographer',
            alt: 'Portrait photo',
            isPrimary: true,
          }),
          image({
            url: 'https://src.example.com/b.jpg',
            title: 'Album',
            attribution: 'Cover Art Archive',
            alt: 'Album cover',
          }),
        ],
        longBio:
          '<p>Intro</p><img src="image:0" alt=""><p>Middle</p><img src="image:1" alt=""><p>End</p>',
      }),
      [],
      artistSlug
    );

    const rightAt = content.longBio.indexOf('bio-figure--right');
    const leftAt = content.longBio.indexOf('bio-figure--left');
    expect(rightAt).toBeGreaterThan(-1);
    expect(leftAt).toBeGreaterThan(rightAt);
    expect(content.longBio).toContain(`src="${cdn('p0')}"`);
    expect(content.longBio).toContain(`src="${cdn('p1')}"`);
    expect(content.longBio).toContain('<span class="bio-figure-title">Portrait</span>');
    expect(content.longBio).toContain('<span class="bio-figure-attribution">Photographer</span>');
    expect(content.longBio).toContain('<span class="bio-figure-title">Album</span>');
    expect(content.longBio).toContain(
      '<span class="bio-figure-attribution">Cover Art Archive</span>'
    );
  });

  it('plain-swaps placeholders past the five-figure cap (fallback order proof)', async () => {
    const tokens = ['t0', 't1', 't2', 't3', 't4', 't5'];
    mockRehostEcho(tokens);

    const content = await persistGeneratedBio(
      artistId,
      buildData({
        images: tokens.map((token, index) =>
          image({ url: `https://src.example.com/${token}.jpg`, title: `Title ${index}` })
        ),
        longBio:
          tokens.map((_, index) => `<p>x</p><img src="image:${index}" alt="">`).join('') +
          '<p>end</p>',
      }),
      [],
      artistSlug
    );

    expect(content.longBio.match(/<figure\b/g)).toHaveLength(5);
    // The sixth placeholder fell through to the plain src-swap fallback: its
    // CDN url renders as a bare <img> AFTER the last composed figure.
    expect(content.longBio).not.toContain('image:5');
    expect(content.longBio.indexOf(`<img src="${cdn('t5')}"`)).toBeGreaterThan(
      content.longBio.lastIndexOf('</figure>')
    );
  });

  it('composes a duplicate-aliased placeholder with the survivor meta', async () => {
    const survivorUrl = cdn('surv');
    rehostImagesMock.mockResolvedValue({
      results: [{ url: survivorUrl, width: null, height: null }, null],
      duplicateAliases: new Map([[1, survivorUrl]]),
    });

    const content = await persistGeneratedBio(
      artistId,
      buildData({
        images: [
          image({
            url: 'https://src.example.com/a.jpg',
            title: 'Survivor Title',
            attribution: 'Survivor Credit',
            isPrimary: true,
          }),
          image({ url: 'https://src.example.com/b.jpg' }),
        ],
        longBio: '<p>Intro</p><img src="image:1" alt=""><p>End</p>',
      }),
      [],
      artistSlug
    );

    expect(content.longBio).toContain('bio-figure--right');
    expect(content.longBio).toContain(`src="${survivorUrl}"`);
    expect(content.longBio).toContain('<span class="bio-figure-title">Survivor Title</span>');
    expect(content.longBio).toContain(
      '<span class="bio-figure-attribution">Survivor Credit</span>'
    );
  });

  it('keeps the short bio image-free while the long bio composes figures', async () => {
    mockRehostEcho(['p0']);

    const content = await persistGeneratedBio(
      artistId,
      buildData({
        images: [image({ url: 'https://src.example.com/a.jpg', title: 'Portrait' })],
        shortBio: '<p>Teaser <img src="image:0" alt=""> end.</p>',
        longBio: '<p>Long</p><img src="image:0" alt="">',
      }),
      [],
      artistSlug
    );

    expect(content.shortBio).not.toContain('<img');
    expect(content.shortBio).not.toContain('<figure');
  });

  it('plain-swaps the alt bio placeholder without composing a figure', async () => {
    mockRehostEcho(['p0']);

    const content = await persistGeneratedBio(
      artistId,
      buildData({
        images: [image({ url: 'https://src.example.com/a.jpg', title: 'Portrait' })],
        longBio: '<p>Long</p>',
        altBio: '<p>Alt <img src="image:0" alt="x"></p>',
      }),
      [],
      artistSlug
    );

    expect(content.altBio).toContain(`<img src="${cdn('p0')}"`);
    expect(content.altBio).not.toContain('<figure');
  });
});

describe('persistGeneratedBio link validation', () => {
  const artistId = 'a'.repeat(24);
  const artistSlug = 'radiohead';

  const link = (label: string, url: string): BioGenerationData['links'][number] => ({
    label,
    url,
    kind: 'other',
  });

  const buildData = (links: BioGenerationData['links']): BioGenerationData => ({
    shortBio: '<p>s</p>',
    longBio: '<p>l</p>',
    altBio: '<p>a</p>',
    genres: 'rock',
    images: [],
    links,
    model: 'gemini-2.5-pro',
  });

  const release = {
    id: '665f1f77bcf86cd799439021',
    title: 'Sad, Fat Luck',
    releasedOn: null,
    coverUrl: null,
  };

  /** The links array persisted through the repository on the first call. */
  const persistedLinks = (): Array<{ url: string; sortOrder: number }> =>
    replaceBioContentMock.mock.calls[0][1].links;

  beforeEach(() => {
    replaceBioContentMock.mockReset().mockResolvedValue(undefined);
    rehostImagesMock.mockReset().mockResolvedValue({ results: [], duplicateAliases: new Map() });
    validateBioLinksMock.mockReset();
  });

  it('probes only the sanitized external links — never internal release links', async () => {
    await persistGeneratedBio(
      artistId,
      buildData([
        link('Wikipedia', 'https://en.wikipedia.org/wiki/Radiohead'),
        link('Evil', 'javascript:alert(1)'),
      ]),
      [release],
      artistSlug
    );

    expect(validateBioLinksMock).toHaveBeenCalledTimes(1);
    const probed = validateBioLinksMock.mock.calls[0][0] as Array<{ url: string }>;
    expect(probed.map(({ url }) => url)).toEqual(['https://en.wikipedia.org/wiki/Radiohead']);
  });

  it('appends release links after validation, past the kept external links', async () => {
    await persistGeneratedBio(
      artistId,
      buildData([link('Wikipedia', 'https://en.wikipedia.org/wiki/Radiohead')]),
      [release],
      artistSlug
    );

    expect(persistedLinks().map(({ url }) => url)).toEqual([
      'https://en.wikipedia.org/wiki/Radiohead',
      '/releases?artist=radiohead&release=665f1f77bcf86cd799439021',
    ]);
  });

  it('drops validator-rejected links and re-indexes sortOrder densely', async () => {
    validateBioLinksMock.mockImplementationOnce(async (links) =>
      links.filter(({ url }) => !url.includes('dead'))
    );

    await persistGeneratedBio(
      artistId,
      buildData([
        link('Alive', 'https://alive.example.com/'),
        link('Dead', 'https://dead.example.com/'),
        link('Also alive', 'https://also.example.com/'),
      ]),
      [release],
      artistSlug
    );

    expect(persistedLinks().map(({ url }) => url)).toEqual([
      'https://alive.example.com/',
      'https://also.example.com/',
      '/releases?artist=radiohead&release=665f1f77bcf86cd799439021',
    ]);
    expect(persistedLinks().map(({ sortOrder }) => sortOrder)).toEqual([0, 1, 2]);
  });

  it('skips validation when BIO_GENERATOR_FAKE=true', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', 'true');

    await persistGeneratedBio(
      artistId,
      buildData([link('Wikipedia', 'https://en.wikipedia.org/wiki/Radiohead')]),
      [],
      artistSlug
    );

    expect(validateBioLinksMock).not.toHaveBeenCalled();
    expect(persistedLinks().map(({ url }) => url)).toEqual([
      'https://en.wikipedia.org/wiki/Radiohead',
    ]);
  });

  it('skips validation when E2E_MODE=true', async () => {
    vi.stubEnv('E2E_MODE', 'true');

    await persistGeneratedBio(
      artistId,
      buildData([link('Wikipedia', 'https://en.wikipedia.org/wiki/Radiohead')]),
      [],
      artistSlug
    );

    expect(validateBioLinksMock).not.toHaveBeenCalled();
  });

  it('skips validation when NEXT_PUBLIC_E2E_MODE=true', async () => {
    vi.stubEnv('NEXT_PUBLIC_E2E_MODE', 'true');

    await persistGeneratedBio(
      artistId,
      buildData([link('Wikipedia', 'https://en.wikipedia.org/wiki/Radiohead')]),
      [],
      artistSlug
    );

    expect(validateBioLinksMock).not.toHaveBeenCalled();
  });
});

describe('bioGenerationJob.prepare', () => {
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

  /** The Lambda request the adapter prepares for `artist`; throws on a refusal. */
  const requestFor = async (
    opts: { links?: string[]; description?: string } = {}
  ): Promise<BioGenerationLambdaInput> => {
    const prepared = await bioGenerationJob.prepare(artist.id, opts);
    if (!prepared.ok) throw new Error(prepared.error);
    return prepared.request;
  };

  beforeEach(() => {
    findByIdMock.mockReset().mockResolvedValue(artist);
    findCustomBioImageUrlsMock.mockReset().mockResolvedValue([]);
    findPublishedByArtistWithCoversMock.mockReset().mockResolvedValue([]);
    mockLoggerWarn.mockReset();
  });

  it('fails when the artist does not exist', async () => {
    findByIdMock.mockResolvedValue(null);

    expect(await bioGenerationJob.prepare(artist.id, {})).toEqual({
      ok: false,
      error: 'Artist not found.',
    });
  });

  it('fails when the artist has no name to generate from', async () => {
    findByIdMock.mockResolvedValue({
      ...artist,
      displayName: null,
      firstName: '',
      surname: '',
      akaNames: null,
    });

    expect(await bioGenerationJob.prepare(artist.id, {})).toEqual({
      ok: false,
      error: 'Artist has no name to generate a bio from.',
    });
  });

  it('forwards the artist names and the admin links and description', async () => {
    const request = await requestFor({ links: ['https://example.com'], description: 'Band.' });

    expect(request).toMatchObject({
      artistId: artist.id,
      displayName: 'Radiohead',
      realName: 'Thom Yorke',
      links: ['https://example.com'],
      description: 'Band.',
      existingGenres: 'rock',
    });
  });

  /**
   * The Lambda caps `releases` at 100. It rejects an over-cap payload
   * wholesale, and because the invoke is fire-and-forget the rejection is
   * invisible until the 17-minute stale sweep — so the cap has to be honoured
   * on this side, not discovered on the other.
   */
  it('caps the releases payload at the limit the Lambda accepts', async () => {
    findPublishedByArtistWithCoversMock.mockResolvedValue(
      Array.from({ length: MAX_LAMBDA_RELEASES + 25 }, (_, index) => ({
        id: `r${index}`,
        title: `Release ${index}`,
        releasedOn: new Date('2020-01-01'),
        coverArt: null,
      }))
    );

    const request = await requestFor();

    expect(request.releases).toHaveLength(MAX_LAMBDA_RELEASES);
  });

  it('keeps the most recent releases when it caps them', async () => {
    findPublishedByArtistWithCoversMock.mockResolvedValue(
      Array.from({ length: MAX_LAMBDA_RELEASES + 25 }, (_, index) => ({
        id: `r${index}`,
        title: `Release ${index}`,
        releasedOn: new Date('2020-01-01'),
        coverArt: null,
      }))
    );

    const request = await requestFor();

    // The repository returns newest-first, so the cap takes from the front.
    expect(request.releases?.[0]?.title).toBe('Release 0');
  });

  it('omits the real name when the artist is pseudonymous', async () => {
    findByIdMock.mockResolvedValue({ ...artist, isPseudonymous: true });

    expect((await requestFor()).realName).toBeUndefined();
  });

  it('grounds on the real name when displayName is blank', async () => {
    findByIdMock.mockResolvedValue({ ...artist, displayName: '   ' });

    expect((await requestFor()).displayName).toBe('Thom Yorke');
  });

  it('falls back to the first aka name when no display or real name exists', async () => {
    findByIdMock.mockResolvedValue({
      ...artist,
      displayName: null,
      firstName: '',
      surname: '',
      akaNames: 'Tommy, Tom',
    });

    expect((await requestFor()).displayName).toBe('Tommy');
  });

  it('omits the real name when first and surname are blank but not pseudonymous', async () => {
    findByIdMock.mockResolvedValue({ ...artist, firstName: ' ', surname: ' ' });

    expect((await requestFor()).realName).toBeUndefined();
  });

  it('forwards undefined akaNames and genres when the artist has none', async () => {
    findByIdMock.mockResolvedValue({ ...artist, akaNames: null, genres: null });

    expect(await requestFor()).toMatchObject({ akaNames: undefined, existingGenres: undefined });
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

    expect(await requestFor()).toMatchObject({
      realName: 'Julio Francisco Ramos',
      bornOn: '1982-05-01',
    });
  });

  it('omits dates the artist record does not have', async () => {
    const request = await requestFor();

    expect(request.bornOn).toBeUndefined();
    expect(request.diedOn).toBeUndefined();
    expect(request.formedOn).toBeUndefined();
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

    expect((await requestFor()).releases).toEqual([
      {
        title: 'Label Album',
        releasedOn: '2020-02-02',
        url: '/releases?artist=radiohead&release=rel1',
      },
    ]);
  });

  it('omits releases and logs a warning when the cover lookup fails', async () => {
    findPublishedByArtistWithCoversMock.mockRejectedValue(new Error('db down'));

    const request = await requestFor();

    expect(request.releases).toBeUndefined();
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'bio_release_covers_failed',
      expect.objectContaining({ artistId: artist.id })
    );
  });

  it('builds referenceImageUrls from the custom bio images', async () => {
    findCustomBioImageUrlsMock.mockResolvedValue([
      'https://cdn.fakefour.com/custom/a.jpg',
      'https://cdn.fakefour.com/custom/b.jpg',
    ]);

    expect((await requestFor()).referenceImageUrls).toEqual([
      'https://cdn.fakefour.com/custom/a.jpg',
      'https://cdn.fakefour.com/custom/b.jpg',
    ]);
  });

  it('keeps only absolute http(s) reference URLs and caps the list at three', async () => {
    findCustomBioImageUrlsMock.mockResolvedValue([
      'https://cdn.fakefour.com/1.jpg',
      '/relative/2.jpg',
      'javascript:alert(1)',
      'https://cdn.fakefour.com/3.jpg',
      'https://cdn.fakefour.com/4.jpg',
      'https://cdn.fakefour.com/5.jpg',
    ]);

    expect((await requestFor()).referenceImageUrls).toEqual([
      'https://cdn.fakefour.com/1.jpg',
      'https://cdn.fakefour.com/3.jpg',
      'https://cdn.fakefour.com/4.jpg',
    ]);
  });

  it('dedupes reference URLs case-insensitively', async () => {
    findCustomBioImageUrlsMock.mockResolvedValue([
      'https://cdn.fakefour.com/A.jpg',
      'https://cdn.fakefour.com/a.jpg',
    ]);

    expect((await requestFor()).referenceImageUrls).toEqual(['https://cdn.fakefour.com/A.jpg']);
  });

  it('omits referenceImageUrls entirely when no absolute URLs are available', async () => {
    findCustomBioImageUrlsMock.mockResolvedValue(['/relative/only.jpg']);

    expect((await requestFor()).referenceImageUrls).toBeUndefined();
  });

  it('omits referenceImageUrls and warns when the custom-image lookup fails', async () => {
    findCustomBioImageUrlsMock.mockRejectedValue(new Error('db down'));

    const request = await requestFor();

    expect(request.referenceImageUrls).toBeUndefined();
    expect(mockLoggerWarn).toHaveBeenCalledWith(
      'bio_custom_reference_images_failed',
      expect.objectContaining({ artistId: artist.id })
    );
  });
});

describe('bioGenerationJob — the artist bio columns', () => {
  const ID = 'a1';
  const START = new Date('2026-10-18T12:00:00.000Z');
  const record = {
    bioStatus: 'processing',
    bioError: 'earlier',
    bioStartedAt: START,
    bioJobToken: 'tok',
    bioProgress: { stage: 'drafting', at: START.toISOString() },
    bioGeneratedAt: null,
    slug: 'radiohead',
    shortBio: null,
    bio: null,
    altBio: null,
    genres: null,
    bioModel: null,
    bioImages: [],
    bioLinks: [],
  };

  it('reads the generation state', async () => {
    getBioGenerationStateMock.mockResolvedValueOnce(record);

    expect(await bioGenerationJob.read(ID)).toBe(record);
    expect(getBioGenerationStateMock).toHaveBeenCalledWith(ID);
  });

  it('maps the bio lifecycle columns onto the job state', () => {
    expect(bioGenerationJob.state(record)).toEqual({
      status: 'processing',
      startedAt: START,
      error: 'earlier',
      jobToken: 'tok',
      progress: record.bioProgress,
    });
  });

  it('hands a won claim the artist slug', () => {
    expect(bioGenerationJob.claimContext(record)).toEqual({ slug: 'radiohead' });
  });

  it('answers on the bio callback and progress routes', () => {
    expect(bioGenerationJob.callbackPath(ID)).toBe('/api/artists/a1/bio-generation/callback');
    expect(bioGenerationJob.progress?.path(ID)).toBe('/api/artists/a1/bio-generation/progress');
  });

  it.each([
    [
      'marks pending with a cleared error and its start',
      () => bioGenerationJob.markPending(ID, START),
      setBioStatusMock,
      [ID, 'pending', { error: null, startedAt: START }],
    ],
    [
      'begins with the conditional write',
      () => bioGenerationJob.begin(ID, START),
      beginBioRunMock,
      [ID, START],
    ],
    [
      'stores the token',
      () => bioGenerationJob.setToken(ID, 'tok'),
      setBioJobTokenMock,
      [ID, 'tok'],
    ],
    [
      'claims the token',
      () => bioGenerationJob.claimToken(ID, 'tok'),
      claimBioJobTokenMock,
      [ID, 'tok'],
    ],
    [
      'records failed with its error',
      () => bioGenerationJob.recordFailed(ID, 'boom'),
      setBioStatusMock,
      [ID, 'failed', { error: 'boom' }],
    ],
    [
      'records succeeded with a cleared error',
      () => bioGenerationJob.recordSucceeded(ID, undefined),
      setBioStatusMock,
      [ID, 'succeeded', { error: null }],
    ],
    [
      'writes a checkpoint to the bio progress column',
      () => bioGenerationJob.progress?.write(ID, { stage: 'drafting', at: START.toISOString() }),
      setBioProgressMock,
      [ID, { stage: 'drafting', at: START.toISOString() }],
    ],
  ])('%s', async (_name, write, repositoryMethod, args) => {
    await write();

    expect(repositoryMethod.mock.calls).toEqual([args]);
  });

  it('keeps its copy byte-identical', () => {
    expect(bioGenerationJob.copy).toEqual({
      notFound: 'Artist not found.',
      noCallbackUrl: 'Bio generator callback URL is not configured',
      notConfigured: 'Bio generator is not configured (BIO_GENERATOR_LAMBDA_NAME unset)',
      unreachable: 'Failed to reach the bio generator',
      runFailed: 'Bio generation failed unexpectedly.',
      persistFailed: 'Bio persistence failed.',
    });
  });
});

describe('bioGenerationJob.fake', () => {
  const payload = {
    artistId: 'a'.repeat(24),
    displayName: 'Radiohead',
    callbackUrl: 'https://fakefourrecords.com/api/artists/a1/bio-generation/callback',
    progressUrl: 'https://fakefourrecords.com/api/artists/a1/bio-generation/progress',
    jobToken: 'tok',
    signingKey: 'k'.repeat(64),
  };

  it('checkpoints the vision gate as a valid progress POST', () => {
    const checkpoint = bioGenerationJob.fake.checkpoint?.(payload);

    expect(checkpoint).toEqual({ stage: 'vision-gating', counts: { candidates: 3 } });
    expect(bioProgressPostSchema.safeParse({ jobToken: 'tok', ...checkpoint }).success).toBe(true);
  });

  it('answers with the fixture generation as a valid callback', () => {
    const result = bioGenerationJob.fake.result(payload);

    expect(result).toEqual(fakeBioGeneration(payload));
    expect(bioGenerationCallbackSchema.safeParse({ jobToken: 'tok', result }).success).toBe(true);
  });

  /**
   * The fixture resolves at once, so the dwell gives the polled admin
   * timeline (2.5s) a window to render the checkpoint before the run ends.
   */
  it('dwells four seconds by default', () => {
    expect(bioGenerationJob.fake.delayMs).toBe(4000);
  });
});

describe('bioGenerationJob.persist', () => {
  const okData: BioGenerationData = {
    shortBio: 's',
    longBio: '<p>l</p>',
    altBio: '<p>a</p>',
    genres: 'rock',
    images: [],
    links: [],
    model: 'gemini-2.5-pro',
  };

  beforeEach(() => {
    replaceBioContentMock.mockReset().mockResolvedValue(undefined);
    findPublishedByArtistWithCoversMock.mockReset().mockResolvedValue([]);
    rehostImagesMock.mockReset().mockResolvedValue({ results: [], duplicateAliases: new Map() });
  });

  it('persists the bio', async () => {
    await bioGenerationJob.persist('a1', okData, { slug: 'radiohead' });

    expect(replaceBioContentMock).toHaveBeenCalledTimes(1);
  });

  it("links the artist's releases by their deep link on the artist's own listing", async () => {
    findPublishedByArtistWithCoversMock.mockResolvedValueOnce([
      { id: 'rel1', title: 'Label Album', releasedOn: null, coverUrl: null },
    ]);

    await bioGenerationJob.persist('a1', okData, { slug: 'radiohead' });

    const [, content] = replaceBioContentMock.mock.calls[0];
    expect(content.links).toContainEqual(
      expect.objectContaining({ url: '/releases?artist=radiohead&release=rel1', kind: 'release' })
    );
  });

  it('still persists, without release links, when the catalog lookup fails', async () => {
    findPublishedByArtistWithCoversMock.mockRejectedValue(new Error('mongo down'));

    await bioGenerationJob.persist('a1', okData, { slug: 'radiohead' });

    const [, content] = replaceBioContentMock.mock.calls[0];
    expect(content.links).toEqual([]);
  });

  it('lets a persistence error reach the job runner', async () => {
    replaceBioContentMock.mockRejectedValue(new Error('DB down'));

    await expect(bioGenerationJob.persist('a1', okData, { slug: 'radiohead' })).rejects.toThrow(
      'DB down'
    );
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
    bioJobToken: null,
    bioProgress: null,
    imageLinksStatus: null,
    imageLinksError: null,
    imageLinksStartedAt: null,
    imageLinksJobToken: null,
    imageLinksAddedCount: null,
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

  const checkpoint = { stage: 'drafting', at: '2026-07-08T00:00:00.000Z' };

  it('returns the latest progress checkpoint while processing', async () => {
    getBioGenerationStateMock.mockResolvedValue(
      state({
        bioStatus: 'processing',
        bioStartedAt: new Date(Date.now() - 60_000),
        bioProgress: checkpoint,
      })
    );

    const result = await BioGenerationService.getGenerationStatus('a1');

    expect(result?.progress).toEqual(checkpoint);
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
    getBioGenerationStateMock.mockResolvedValue(
      state({ bioStatus: 'processing', bioStartedAt: new Date(Date.now() - 60_000) })
    );

    const result = await BioGenerationService.getGenerationStatus('a1');

    expect(result?.status).toBe('processing');
    expect(result?.content).toBeNull();
  });

  /**
   * The intrinsics are persisted by replaceBioContent but were absent from the
   * read projection and stripped when content was assembled, so the preview
   * dialog always fell back to 800x600 no matter what the scrape captured.
   */
  it('carries the image intrinsics through to the status content', async () => {
    getBioGenerationStateMock.mockResolvedValue(
      state({
        bioStatus: 'succeeded',
        bioImages: [
          {
            id: 'i1',
            url: 'u',
            thumbnailUrl: null,
            title: null,
            attribution: null,
            license: null,
            sourceUrl: null,
            originalUrl: null,
            isPrimary: false,
            kind: null,
            alt: null,
            origin: 'generated',
            width: 1600,
            height: 900,
          },
        ],
      })
    );

    const result = await BioGenerationService.getGenerationStatus('a1');

    expect(result?.content?.images[0]).toMatchObject({ width: 1600, height: 900 });
  });

  it('carries the image origin through to the status content', async () => {
    getBioGenerationStateMock.mockResolvedValue(
      state({
        bioStatus: 'succeeded',
        bioImages: [
          {
            id: 'i1',
            url: 'u',
            thumbnailUrl: null,
            title: null,
            attribution: null,
            license: null,
            sourceUrl: null,
            originalUrl: null,
            isPrimary: false,
            kind: null,
            alt: null,
            origin: 'custom',
          },
        ],
      })
    );

    const result = await BioGenerationService.getGenerationStatus('a1');

    expect(result?.content?.images[0].origin).toBe('custom');
  });

  it('carries the link origin through to the status content', async () => {
    getBioGenerationStateMock.mockResolvedValue(
      state({
        bioStatus: 'succeeded',
        bioLinks: [{ id: 'l1', label: 'L', url: 'u2', kind: null, origin: 'generated' }],
      })
    );

    const result = await BioGenerationService.getGenerationStatus('a1');

    expect(result?.content?.links[0].origin).toBe('generated');
  });

  it('reports a failed job with its error and no content', async () => {
    getBioGenerationStateMock.mockResolvedValue(state({ bioStatus: 'failed', bioError: 'boom' }));

    const result = await BioGenerationService.getGenerationStatus('a1');

    expect(result).toEqual({ status: 'failed', error: 'boom', content: null, progress: null });
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

    expect(result).toEqual({ status: null, error: null, content: null, progress: null });
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
