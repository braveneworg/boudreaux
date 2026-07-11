/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  DEFAULT_VISION_CANDIDATE_LIMIT,
  boundedEnvInt,
  FACE_MATCH_TITLE_THRESHOLD,
  lambdaHandler,
  licenseRank,
  MAX_FOLLOWED_LINKS,
  runBioGeneration,
  runLambda,
  visionCandidateLimit,
} from './handler.js';

import type { BioGeneratorDeps } from './handler.js';
import type { ArtistFacts, BioImage } from './types.js';
import type { VerifiedScrapedImage } from './vision.js';

/**
 * Wraps verified images in the {@link VerifiedScrapedImage} envelope the vision
 * gate now returns (survivors carry their fetched bytes). The bytes are
 * placeholders — the handler only reads `.image` when merging.
 */
const verified = (images: BioImage[]): VerifiedScrapedImage[] =>
  images.map((image) => ({ image, mimeType: 'image/jpeg', base64: '' }));

const image = (overrides: Partial<BioImage> = {}): BioImage => ({
  url: 'https://upload.wikimedia.org/a.jpg',
  thumbnailUrl: 'https://upload.wikimedia.org/thumb/a.jpg',
  title: 'a.jpg',
  attribution: 'Photographer',
  license: 'CC BY-SA 4.0',
  sourceUrl: 'https://commons.wikimedia.org/wiki/File:a.jpg',
  width: 1000,
  height: 800,
  isPrimary: false,
  ...overrides,
});

const commonsImage = (url: string): BioImage => ({
  url,
  thumbnailUrl: null,
  title: null,
  attribution: 'Wikimedia Commons',
  license: null,
  sourceUrl: null,
  width: null,
  height: null,
  isPrimary: false,
});

const baseInput = () => ({ artistId: 'a1', displayName: 'Ceschi' });

const makeDeps = (overrides: Partial<BioGeneratorDeps> = {}): BioGeneratorDeps => ({
  lookupArtist: vi.fn().mockResolvedValue({
    mbid: 'mbid-1',
    name: 'Radiohead',
    wikidataId: 'Q11649',
    artistType: 'Group',
    area: 'United Kingdom',
    beginDate: '1985',
    tags: ['alternative rock'],
    links: [
      { label: 'MusicBrainz', url: 'https://musicbrainz.org/artist/mbid-1', kind: 'musicbrainz' },
    ],
  }),
  getWikidataData: vi.fn().mockResolvedValue({
    imageFileNames: ['a.jpg', 'b.jpg'],
    officialUrl: 'https://radiohead.com',
    wikipediaUrl: 'https://en.wikipedia.org/wiki/Radiohead',
  }),
  getWikipediaExtract: vi.fn().mockResolvedValue({
    title: 'Radiohead',
    extract: 'Radiohead are an English rock band formed in Abingdon in 1985.',
    url: 'https://en.wikipedia.org/wiki/Radiohead',
  }),
  getCommonsImage: vi
    .fn()
    .mockImplementation(async (fileName: string) =>
      image({ title: fileName, url: `https://upload.wikimedia.org/${fileName}` })
    ),
  generateProse: vi.fn().mockResolvedValue({
    shortBio: 'Short teaser.',
    longBio: '<p>Long bio.</p>',
    altBio: 'Punchy promo blurb.',
    genres: 'alternative rock',
    primaryImageIndexes: [0],
  }),
  critiqueProse: vi.fn().mockResolvedValue({ violations: [] }),
  reviseProse: vi.fn(),
  getGeminiApiKey: vi.fn().mockResolvedValue('test-key'),
  getScrapeApiKey: vi.fn().mockResolvedValue(null),
  getSerperApiKey: vi.fn().mockResolvedValue(null),
  searchArtistSources: vi.fn().mockResolvedValue(null),
  searchSerperImages: vi.fn().mockResolvedValue(null),
  readUrl: vi.fn().mockResolvedValue(null),
  listReleaseGroups: vi.fn().mockResolvedValue([]),
  getCoverArtImages: vi.fn().mockResolvedValue([]),
  getCommonsCategoryImages: vi.fn().mockResolvedValue([]),
  verifyScrapedImages: vi.fn().mockResolvedValue([]),
  fetchReferenceBytes: vi.fn().mockResolvedValue([]),
  annotateFaces: vi.fn().mockResolvedValue([]),
  postCallback: vi.fn().mockResolvedValue(undefined),
  postProgress: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const factsArg = (deps: BioGeneratorDeps) =>
  (deps.generateProse as ReturnType<typeof vi.fn>).mock.calls[0][0];

describe('runBioGeneration', () => {
  it('assembles prose, images, links, and genres', async () => {
    const result = await runBioGeneration({ artistId: 'a1', displayName: 'Radiohead' }, makeDeps());

    expect(result.shortBio).toBe('Short teaser.');
    expect(result.longBio).toBe('<p>Long bio.</p>');
    expect(result.altBio).toBe('Punchy promo blurb.');
    expect(result.genres).toBe('alternative rock');
    expect(result.images).toHaveLength(2);
    expect(result.links.some((l) => l.kind === 'wikipedia')).toBe(true);
  });

  it('falls back to an empty alt bio when the model omits it', async () => {
    const deps = makeDeps({
      generateProse: vi.fn().mockResolvedValue({ shortBio: 's', longBio: 'l' }),
    });

    const result = await runBioGeneration({ artistId: 'a1', displayName: 'Radiohead' }, deps);

    expect(result.altBio).toBe('');
  });

  it('generates with the Gemini model and resolved key', async () => {
    const deps = makeDeps();

    await runBioGeneration({ artistId: 'a1', displayName: 'Radiohead' }, deps);

    const [, apiKey] = (deps.generateProse as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(apiKey).toBe('test-key');
  });

  it('feeds the Wikipedia article extract to the model as source text', async () => {
    const deps = makeDeps();

    await runBioGeneration({ artistId: 'a1', displayName: 'Radiohead' }, deps);

    expect(factsArg(deps).sourceText).toContain('formed in Abingdon in 1985');
  });

  it('reads the official site via Jina Reader and merges it into source text', async () => {
    const deps = makeDeps({
      getWikipediaExtract: vi.fn().mockResolvedValue(null),
      readUrl: vi
        .fn()
        .mockResolvedValue({ content: 'Official site copy about the band.', images: [] }),
    });

    await runBioGeneration({ artistId: 'a1', displayName: 'Radiohead' }, deps);

    expect(deps.readUrl).toHaveBeenCalledWith('https://radiohead.com', null);
    expect(factsArg(deps).sourceText).toContain('Official site copy about the band.');
  });

  it('propagates MusicBrainz structured facts to the model', async () => {
    const deps = makeDeps();

    await runBioGeneration({ artistId: 'a1', displayName: 'Radiohead' }, deps);

    const facts = factsArg(deps);
    expect(facts.area).toBe('United Kingdom');
    expect(facts.beginDate).toBe('1985');
    expect(facts.tags).toEqual(['alternative rock']);
  });

  it('forwards bornOn/diedOn/formedOn from input to the facts passed to generateProse', async () => {
    const deps = makeDeps();

    await runBioGeneration(
      {
        artistId: 'a1',
        displayName: 'Test Artist',
        bornOn: '1965-03-15',
        diedOn: '2020-11-01',
        formedOn: '1990-06-01',
      },
      deps
    );

    const passedFacts = factsArg(deps);
    expect(passedFacts.bornOn).toBe('1965-03-15');
    expect(passedFacts.diedOn).toBe('2020-11-01');
    expect(passedFacts.formedOn).toBe('1990-06-01');
  });

  it('degrades to no source text when no source is available', async () => {
    const deps = makeDeps({ getWikipediaExtract: vi.fn().mockResolvedValue(null) });

    const result = await runBioGeneration({ artistId: 'a1', displayName: 'Radiohead' }, deps);

    expect(factsArg(deps).sourceText).toBeUndefined();
    expect(result.longBio).toBe('<p>Long bio.</p>');
  });

  it('always attempts web search even without a Jina key', async () => {
    const searchArtistSources = vi.fn().mockResolvedValue(null);
    const deps = makeDeps({
      lookupArtist: vi.fn().mockResolvedValue(null),
      getScrapeApiKey: vi.fn().mockResolvedValue(null),
      searchArtistSources,
    });

    await runBioGeneration({ artistId: 'a1', displayName: 'Obscure Act' }, deps);

    expect(searchArtistSources).toHaveBeenCalledWith('Obscure Act', null, undefined, {
      query: undefined,
    });
  });

  it('issues targeted bandcamp, discogs, and press-photo image search queries', async () => {
    const searchArtistSources = vi.fn().mockResolvedValue(null);
    const deps = makeDeps({ searchArtistSources });

    await runBioGeneration({ artistId: 'a1', displayName: 'Radiohead' }, deps);

    expect(searchArtistSources).toHaveBeenCalledTimes(6);
    expect(searchArtistSources).toHaveBeenCalledWith('Radiohead', null, undefined, {
      query: 'Radiohead press photo live performance',
    });
    expect(searchArtistSources).toHaveBeenCalledWith('Radiohead', null, undefined, {
      query: 'Radiohead musician site:bandcamp.com',
    });
    expect(searchArtistSources).toHaveBeenCalledWith('Radiohead', null, undefined, {
      query: 'Radiohead musician site:discogs.com',
    });
  });

  it('uses web search content as grounding when found', async () => {
    const searchArtistSources = vi
      .fn()
      .mockResolvedValueOnce({
        sourceText: 'Web-sourced bio text.',
        sourceUrls: ['https://x.example'],
        images: [],
        references: [{ url: 'https://x.example', title: null }],
      })
      .mockResolvedValueOnce(null);
    const deps = makeDeps({
      lookupArtist: vi.fn().mockResolvedValue(null),
      getScrapeApiKey: vi.fn().mockResolvedValue('jina-key'),
      searchArtistSources,
    });

    const result = await runBioGeneration({ artistId: 'a1', displayName: 'Obscure Act' }, deps);

    expect(searchArtistSources).toHaveBeenCalledWith('Obscure Act', 'jina-key', undefined, {
      query: undefined,
    });
    const facts = factsArg(deps);
    expect(facts.sourceText).toBe('Web-sourced bio text.');
    expect(facts.sourceUrls).toEqual(['https://x.example']);
    expect(result.links.some((l) => l.url === 'https://x.example')).toBe(true);
  });

  it('merges web search context with the Wikipedia extract when both exist', async () => {
    const searchArtistSources = vi
      .fn()
      .mockResolvedValueOnce({
        sourceText: 'Extra web context.',
        sourceUrls: ['https://x.example'],
        images: [],
        references: [],
      })
      .mockResolvedValueOnce(null);
    const deps = makeDeps({ searchArtistSources });

    await runBioGeneration({ artistId: 'a1', displayName: 'Radiohead' }, deps);

    const facts = factsArg(deps);
    expect(facts.sourceText).toContain('formed in Abingdon in 1985');
    expect(facts.sourceText).toContain('Extra web context.');
    expect(facts.sourceUrls).toContain('https://en.wikipedia.org/wiki/Radiohead');
    expect(facts.sourceUrls).toContain('https://x.example');
  });

  it('does not filter listening-service URLs from facts.sourceUrls', async () => {
    const searchArtistSources = vi
      .fn()
      .mockResolvedValueOnce({
        sourceText: 'Web context.',
        sourceUrls: ['https://genius.com/radiohead', 'https://open.spotify.com/artist/x'],
        images: [],
        references: [],
      })
      .mockResolvedValueOnce(null);
    const deps = makeDeps({ searchArtistSources });

    await runBioGeneration({ artistId: 'a1', displayName: 'Radiohead' }, deps);

    const facts = factsArg(deps);
    expect(facts.sourceUrls).toContain('https://genius.com/radiohead');
    expect(facts.sourceUrls).toContain('https://open.spotify.com/artist/x');
  });

  it('classifies admin-supplied listening-service links as streaming kind', async () => {
    const result = await runBioGeneration(
      {
        artistId: 'a1',
        displayName: 'Radiohead',
        links: [
          'https://radiohead.com',
          'https://radiohead.bandcamp.com',
          'https://open.spotify.com/artist/x',
        ],
      },
      makeDeps()
    );

    expect(result.links.some((l) => l.url === 'https://radiohead.com')).toBe(true);
    const bandcampLink = result.links.find((l) => l.url.includes('bandcamp.com'));
    const spotifyLink = result.links.find((l) => l.url.includes('spotify.com'));
    expect(bandcampLink).toBeDefined();
    expect(bandcampLink?.kind).toBe('streaming');
    expect(spotifyLink).toBeDefined();
    expect(spotifyLink?.kind).toBe('streaming');
  });

  it('marks the LLM-ranked image as primary', async () => {
    const result = await runBioGeneration({ artistId: 'a1', displayName: 'Radiohead' }, makeDeps());

    expect(result.images[0].isPrimary).toBe(true);
    expect(result.images[1].isPrimary).toBe(false);
  });

  it('keeps a primary image the model selects at an index >= MAX_PRIMARY', async () => {
    const deps = makeDeps({
      getWikidataData: vi.fn().mockResolvedValue({
        imageFileNames: ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg', 'e.jpg'],
        officialUrl: 'https://radiohead.com',
        wikipediaUrl: 'https://en.wikipedia.org/wiki/Radiohead',
      }),
      generateProse: vi.fn().mockResolvedValue({
        shortBio: 'Short teaser.',
        longBio: '<p>Long bio.</p>',
        genres: 'alternative rock',
        primaryImageIndexes: [4],
      }),
    });

    const result = await runBioGeneration({ artistId: 'a1', displayName: 'Radiohead' }, deps);

    expect(result.images[4].isPrimary).toBe(true);
    expect(result.images.filter((img) => img.isPrimary)).toHaveLength(1);
  });

  it('appends optional admin-supplied links and dedupes by url', async () => {
    const result = await runBioGeneration(
      {
        artistId: 'a1',
        displayName: 'Radiohead',
        links: ['https://radiohead.com', 'https://radiohead.com'],
      },
      makeDeps()
    );

    const radioheadLinks = result.links.filter((l) => l.url === 'https://radiohead.com');
    expect(radioheadLinks).toHaveLength(1);
  });

  it('degrades to prose-only when MusicBrainz finds no match', async () => {
    const deps = makeDeps({ lookupArtist: vi.fn().mockResolvedValue(null) });

    const result = await runBioGeneration(
      { artistId: 'a1', displayName: 'Obscure Local Act' },
      deps
    );

    expect(result.images).toEqual([]);
    expect(result.shortBio).toBe('Short teaser.');
  });

  it('still produces a bio when metadata lookup throws', async () => {
    const deps = makeDeps({
      lookupArtist: vi.fn().mockRejectedValue(new Error('MusicBrainz request failed (503)')),
    });

    const result = await runBioGeneration({ artistId: 'a1', displayName: 'Radiohead' }, deps);

    expect(result.images).toEqual([]);
    expect(result.longBio).toBe('<p>Long bio.</p>');
  });

  it('keeps the other Commons images when one image fetch fails', async () => {
    const deps = makeDeps({
      getCommonsImage: vi.fn().mockImplementation(async (fileName: string) => {
        if (fileName === 'b.jpg') throw new Error('Commons 503');
        return image({ title: fileName, url: `https://upload.wikimedia.org/${fileName}` });
      }),
    });

    const result = await runBioGeneration({ artistId: 'a1', displayName: 'Radiohead' }, deps);

    expect(result.images).toHaveLength(1);
    expect(result.images[0].title).toBe('a.jpg');
  });

  it('keeps the MusicBrainz links when the Wikidata lookup fails', async () => {
    const deps = makeDeps({
      getWikidataData: vi.fn().mockRejectedValue(new Error('Wikidata 500')),
    });

    const result = await runBioGeneration({ artistId: 'a1', displayName: 'Radiohead' }, deps);

    expect(result.links.some((l) => l.kind === 'musicbrainz')).toBe(true);
    expect(result.images).toEqual([]);
  });

  it('falls back to web-scraped images when Commons yields none', async () => {
    const deps = makeDeps({
      lookupArtist: vi.fn().mockResolvedValue(null),
      searchArtistSources: vi
        .fn()
        .mockResolvedValueOnce({
          sourceText: 'Web-sourced bio text.',
          sourceUrls: ['https://a.example/bio'],
          images: [
            {
              url: 'https://a.example/artist.jpg',
              alt: 'Artist in 2015',
              sourceUrl: 'https://a.example/bio',
            },
          ],
          references: [],
        })
        .mockResolvedValueOnce(null),
      verifyScrapedImages: vi.fn().mockImplementation(async (candidates) => verified(candidates)),
    });

    const result = await runBioGeneration({ artistId: 'a1', displayName: 'Obscure Act' }, deps);

    expect(result.images).toEqual([
      {
        url: 'https://a.example/artist.jpg',
        thumbnailUrl: null,
        title: 'Artist in 2015',
        attribution: 'a.example',
        license: null,
        licenseUrl: null,
        sourceUrl: 'https://a.example/bio',
        width: null,
        height: null,
        isPrimary: true,
      },
    ]);
    expect(factsArg(deps).imageTitles).toEqual(['Artist in 2015']);
  });

  it('includes Commons images first then scraped images when both are available', async () => {
    const deps = makeDeps({
      searchArtistSources: vi
        .fn()
        .mockResolvedValueOnce({
          sourceText: 'Web context.',
          sourceUrls: ['https://a.example/bio'],
          images: [
            {
              url: 'https://a.example/artist.jpg',
              alt: 'Artist',
              sourceUrl: 'https://a.example/bio',
            },
          ],
          references: [],
        })
        .mockResolvedValueOnce(null),
      verifyScrapedImages: vi.fn().mockImplementation(async (candidates) => verified(candidates)),
    });

    const result = await runBioGeneration({ artistId: 'a1', displayName: 'Radiohead' }, deps);

    // 2 Commons + 1 scraped
    expect(result.images).toHaveLength(3);
    expect(result.images[0].url).toContain('upload.wikimedia.org');
    expect(result.images[1].url).toContain('upload.wikimedia.org');
    expect(result.images[2].url).toBe('https://a.example/artist.jpg');
  });

  it('ranks alt-titled scraped images first; all 8 candidates fit under the cap', async () => {
    const scraped = Array.from({ length: 8 }, (_, i) => ({
      url: `https://a.example/photo-${i}.jpg`,
      alt: i % 2 === 0 ? null : `Photo ${i}`,
      sourceUrl: 'https://a.example/bio',
    }));
    const deps = makeDeps({
      lookupArtist: vi.fn().mockResolvedValue(null),
      searchArtistSources: vi
        .fn()
        .mockResolvedValueOnce({
          sourceText: 'Web context.',
          sourceUrls: ['https://a.example/bio'],
          images: scraped,
          references: [],
        })
        .mockResolvedValueOnce(null),
      verifyScrapedImages: vi.fn().mockImplementation(async (candidates) => verified(candidates)),
    });

    const result = await runBioGeneration({ artistId: 'a1', displayName: 'Obscure Act' }, deps);

    expect(result.images).toHaveLength(8);
    expect(result.images.slice(0, 4).map((img) => img.title)).toEqual([
      'Photo 1',
      'Photo 3',
      'Photo 5',
      'Photo 7',
    ]);
  });

  it('uses official-site page images in the scraped fallback', async () => {
    const deps = makeDeps({
      getWikidataData: vi.fn().mockResolvedValue({
        imageFileNames: [],
        officialUrl: 'https://radiohead.com',
        wikipediaUrl: 'https://en.wikipedia.org/wiki/Radiohead',
      }),
      readUrl: vi.fn().mockResolvedValue({
        content: 'Official site copy.',
        images: [
          {
            url: 'https://radiohead.com/band.jpg',
            alt: 'Band photo',
            sourceUrl: 'https://radiohead.com',
          },
        ],
      }),
      verifyScrapedImages: vi.fn().mockImplementation(async (candidates) => verified(candidates)),
    });

    const result = await runBioGeneration({ artistId: 'a1', displayName: 'Radiohead' }, deps);

    expect(result.images).toHaveLength(1);
    expect(result.images[0].url).toBe('https://radiohead.com/band.jpg');
    expect(result.images[0].attribution).toBe('radiohead.com');
  });

  it('logs a scraped_images_merged event with candidate and total counts', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const deps = makeDeps({
      lookupArtist: vi.fn().mockResolvedValue(null),
      searchArtistSources: vi
        .fn()
        .mockResolvedValueOnce({
          sourceText: 'Web context.',
          sourceUrls: ['https://a.example/bio'],
          images: [
            {
              url: 'https://a.example/artist.jpg',
              alt: 'Artist',
              sourceUrl: 'https://a.example/bio',
            },
          ],
          references: [],
        })
        .mockResolvedValueOnce(null),
      verifyScrapedImages: vi.fn().mockImplementation(async (candidates) => verified(candidates)),
    });

    await runBioGeneration({ artistId: 'a1', displayName: 'Obscure Act' }, deps);

    const events = info.mock.calls.map((call) => JSON.parse(call[0] as string));
    const merged = events.find((e) => e.event === 'scraped_images_merged');
    expect(merged).toMatchObject({ candidates: 1, total: 1 });
    info.mockRestore();
  });

  it('merges scraped images after Commons — 2 Commons + 5 scraped = 7, alt-titled scraped first', async () => {
    const scraped = [
      { url: 'https://a.example/photo-0.jpg', alt: null, sourceUrl: 'https://a.example/bio' },
      {
        url: 'https://a.example/photo-1.jpg',
        alt: 'Artist live',
        sourceUrl: 'https://a.example/bio',
      },
      { url: 'https://a.example/photo-2.jpg', alt: null, sourceUrl: 'https://a.example/bio' },
      { url: 'https://a.example/photo-3.jpg', alt: 'Portrait', sourceUrl: 'https://a.example/bio' },
      { url: 'https://a.example/photo-4.jpg', alt: null, sourceUrl: 'https://a.example/bio' },
    ];
    const deps = makeDeps({
      searchArtistSources: vi
        .fn()
        .mockResolvedValueOnce({
          sourceText: 'Web context.',
          sourceUrls: ['https://a.example/bio'],
          images: scraped,
          references: [],
        })
        .mockResolvedValueOnce(null),
      verifyScrapedImages: vi.fn().mockImplementation(async (candidates) => verified(candidates)),
    });

    const result = await runBioGeneration({ artistId: 'a1', displayName: 'Radiohead' }, deps);

    expect(result.images).toHaveLength(7);
    expect(result.images[0].url).toContain('upload.wikimedia.org');
    expect(result.images[1].url).toContain('upload.wikimedia.org');
    expect(result.images[2].title).toBe('Artist live');
    expect(result.images[3].title).toBe('Portrait');
  });

  it('caps total images at 100 when vision returns more than the global limit', async () => {
    // Verify receives ≤visionCandidateLimit() candidates; mock always returns 150 to
    // confirm the global MAX_IMAGES=100 cap fires regardless.
    const deps = makeDeps({
      lookupArtist: vi.fn().mockResolvedValue(null),
      searchArtistSources: vi
        .fn()
        .mockResolvedValueOnce({
          sourceText: 'Web context.',
          sourceUrls: ['https://a.example/bio'],
          images: Array.from({ length: visionCandidateLimit() + 20 }, (_, i) => ({
            url: `https://a.example/photo-${i}.jpg`,
            alt: `Photo ${i}`,
            sourceUrl: 'https://a.example/bio',
          })),
          references: [],
        })
        .mockResolvedValueOnce(null),
      verifyScrapedImages: vi
        .fn()
        .mockResolvedValue(
          verified(
            Array.from({ length: 150 }, (_, i) => commonsImage(`https://a.example/photo-${i}.jpg`))
          )
        ),
    });

    const result = await runBioGeneration({ artistId: 'a1', displayName: 'Many Images' }, deps);

    expect(result.images).toHaveLength(100);
  });

  it('fills facts.imageTitles entries with Photo of {displayName} when title is absent', async () => {
    const deps = makeDeps({
      lookupArtist: vi.fn().mockResolvedValue(null),
      searchArtistSources: vi
        .fn()
        .mockResolvedValueOnce({
          sourceText: 'Web context.',
          sourceUrls: ['https://a.example/bio'],
          images: [
            { url: 'https://a.example/photo-0.jpg', alt: null, sourceUrl: 'https://a.example/bio' },
            {
              url: 'https://a.example/photo-1.jpg',
              alt: 'Live shot',
              sourceUrl: 'https://a.example/bio',
            },
          ],
          references: [],
        })
        .mockResolvedValueOnce(null),
      verifyScrapedImages: vi.fn().mockImplementation(async (candidates) => verified(candidates)),
    });

    await runBioGeneration({ artistId: 'a1', displayName: 'Test Artist' }, deps);

    const imageTitles = factsArg(deps).imageTitles as string[];
    // alt-titled image is ranked first → index 0 = 'Live shot', index 1 = fallback
    expect(imageTitles[0]).toBe('Live shot');
    expect(imageTitles[1]).toBe('Photo of Test Artist');
    expect(imageTitles.every((t) => t.length > 0)).toBe(true);
  });

  it('logs a structured enrichment_complete event with image and link counts', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});

    await runBioGeneration({ artistId: 'a1', displayName: 'Radiohead' }, makeDeps());

    const events = info.mock.calls.map((call) => JSON.parse(call[0] as string));
    const complete = events.find((e) => e.event === 'enrichment_complete');
    expect(complete).toBeDefined();
    expect(complete.images).toBe(2);
    info.mockRestore();
  });

  it('falls back to existing genres when the model returns none', async () => {
    const deps = makeDeps({
      generateProse: vi.fn().mockResolvedValue({ shortBio: 's', longBio: 'l' }),
    });

    const result = await runBioGeneration(
      { artistId: 'a1', displayName: 'Radiohead', existingGenres: 'rock' },
      deps
    );

    expect(result.genres).toBe('rock');
  });

  it('runs the quality pass on generated prose and returns the revised bios', async () => {
    const revised = {
      shortBio: 'Revised short.',
      longBio: '<p>Revised long.</p>',
      altBio: 'Revised alt.',
      genres: 'indie rock',
      primaryImageIndexes: [0],
    };
    const deps = makeDeps({
      critiqueProse: vi.fn().mockResolvedValue({
        violations: [{ location: 'shortBio', quote: 'Short teaser.', issue: 'test violation' }],
      }),
      reviseProse: vi.fn().mockResolvedValue(revised),
    });

    const result = await runBioGeneration({ artistId: 'a1', displayName: 'Radiohead' }, deps);

    expect(deps.reviseProse).toHaveBeenCalled();
    expect(result.shortBio).toBe('Revised short.');
    expect(result.longBio).toBe('<p>Revised long.</p>');
    expect(result.altBio).toBe('Revised alt.');
    expect(result.genres).toBe('indie rock');
  });

  it('streaming links from MB relations survive finalizeMetadata with kind streaming', async () => {
    const deps = makeDeps({
      lookupArtist: vi.fn().mockResolvedValue({
        mbid: 'mbid-1',
        name: 'Artist',
        wikidataId: null,
        artistType: 'Person',
        area: 'USA',
        beginDate: '1990',
        tags: [],
        links: [
          {
            label: 'open.spotify.com',
            url: 'https://open.spotify.com/artist/x',
            kind: 'streaming' as const,
          },
          {
            label: 'MusicBrainz',
            url: 'https://musicbrainz.org/artist/mbid-1',
            kind: 'musicbrainz' as const,
          },
        ],
      }),
      getWikidataData: vi.fn().mockRejectedValue(new Error('no wikidata')),
    });

    const result = await runBioGeneration({ artistId: 'a1', displayName: 'Artist' }, deps);

    const spotifyLink = result.links.find((l) => l.url === 'https://open.spotify.com/artist/x');
    expect(spotifyLink).toBeDefined();
    expect(spotifyLink?.kind).toBe('streaming');
  });

  it('labels jina reference links with the page title, falling back to artist-hostname', async () => {
    const searchArtistSources = vi
      .fn()
      .mockResolvedValueOnce({
        sourceText: 'Web context.',
        sourceUrls: ['https://a.example/bio', 'https://b.example/page'],
        images: [],
        references: [
          { url: 'https://a.example/bio', title: 'Artist Biography' },
          { url: 'https://b.example/page', title: null },
        ],
      })
      .mockResolvedValueOnce(null);
    const deps = makeDeps({
      lookupArtist: vi.fn().mockResolvedValue(null),
      searchArtistSources,
    });

    const result = await runBioGeneration({ artistId: 'a1', displayName: 'Artist' }, deps);

    const bioLink = result.links.find((l) => l.url === 'https://a.example/bio');
    const pageLink = result.links.find((l) => l.url === 'https://b.example/page');
    expect(bioLink?.label).toBe('Artist Biography');
    expect(pageLink?.label).toBe('Artist — b.example');
  });

  it('drops links from search-engine hosts', async () => {
    const searchArtistSources = vi
      .fn()
      .mockResolvedValueOnce({
        sourceText: 'Web context.',
        sourceUrls: ['https://www.google.com/search?q=artist'],
        images: [],
        references: [{ url: 'https://www.google.com/search?q=artist', title: 'Google Search' }],
      })
      .mockResolvedValueOnce(null);
    const deps = makeDeps({
      lookupArtist: vi.fn().mockResolvedValue(null),
      searchArtistSources,
    });

    const result = await runBioGeneration({ artistId: 'a1', displayName: 'Artist' }, deps);

    expect(result.links.some((l) => l.url.includes('google.com'))).toBe(false);
  });

  it('searches web and MusicBrainz by displayName when both names are present', async () => {
    const lookupArtist = vi.fn().mockResolvedValue(null);
    const searchArtistSources = vi.fn().mockResolvedValue(null);
    const deps = makeDeps({ lookupArtist, searchArtistSources });

    await runBioGeneration(
      { artistId: 'a1', displayName: 'Ceschi', realName: 'Julio Francisco Ramos' },
      deps
    );

    expect(lookupArtist).toHaveBeenCalledWith('Ceschi');
    expect(searchArtistSources).toHaveBeenCalledWith('Ceschi', null, undefined, {
      query: undefined,
    });
  });

  it('falls back to realName for MusicBrainz when displayName lookup misses', async () => {
    const lookupArtist = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValue({
        mbid: 'mbid-real',
        name: 'Ceschi',
        wikidataId: null,
        artistType: 'Person' as const,
        area: 'USA',
        beginDate: '1990',
        endDate: undefined,
        tags: [],
        links: [],
      });
    const deps = makeDeps({
      lookupArtist,
      getWikidataData: vi.fn().mockRejectedValue(new Error('no wikidata')),
    });

    await runBioGeneration(
      { artistId: 'a1', displayName: 'Ceschi', realName: 'Julio Francisco Ramos' },
      deps
    );

    expect(lookupArtist).toHaveBeenNthCalledWith(1, 'Ceschi');
    expect(lookupArtist).toHaveBeenNthCalledWith(2, 'Julio Francisco Ramos');
  });

  it('caps scraped candidates at the vision candidate limit before vision verification', async () => {
    const verifyMock = vi.fn().mockResolvedValue([]);
    const deps = makeDeps({
      lookupArtist: vi.fn().mockResolvedValue(null),
      searchArtistSources: vi
        .fn()
        .mockResolvedValueOnce({
          sourceText: 'Web context.',
          sourceUrls: ['https://a.example/bio'],
          images: Array.from({ length: visionCandidateLimit() + 5 }, (_, i) => ({
            url: `https://a.example/photo-${i}.jpg`,
            alt: `Photo ${i}`,
            sourceUrl: 'https://a.example/bio',
          })),
          references: [],
        })
        .mockResolvedValueOnce(null),
      verifyScrapedImages: verifyMock,
    });

    await runBioGeneration({ artistId: 'a1', displayName: 'Obscure Act' }, deps);

    const [candidates] = (verifyMock as ReturnType<typeof vi.fn>).mock.calls[0] as [unknown[]];
    expect(candidates).toHaveLength(visionCandidateLimit());
  });

  it('threads synthesisModel=gemini-2.5-pro into generateProse by default', async () => {
    const deps = makeDeps();

    await runBioGeneration({ artistId: 'a1', displayName: 'Radiohead' }, deps);

    const call = (deps.generateProse as ReturnType<typeof vi.fn>).mock.calls[0];
    // 4th arg is options; synthesisModel must be the pro model
    expect(call[3]).toMatchObject({ synthesisModel: 'gemini-2.5-pro' });
  });

  it('uses GEMINI_PRO_MODEL env override as synthesisModel when set', async () => {
    vi.stubEnv('GEMINI_PRO_MODEL', 'gemini-2.5-pro-preview');
    const deps = makeDeps();

    await runBioGeneration({ artistId: 'a1', displayName: 'Radiohead' }, deps);

    const call = (deps.generateProse as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[3]).toMatchObject({ synthesisModel: 'gemini-2.5-pro-preview' });
    vi.unstubAllEnvs();
  });

  it('quality passes receive pro as primary model and flash as fallback', async () => {
    const deps = makeDeps({
      critiqueProse: vi.fn().mockResolvedValue({ violations: [] }),
    });

    await runBioGeneration({ artistId: 'a1', displayName: 'Radiohead' }, deps);

    const critiqueCall = (deps.critiqueProse as ReturnType<typeof vi.fn>).mock.calls[0][0] as {
      model: string;
      fallbackModel: string;
    };
    expect(critiqueCall.model).toBe('gemini-2.5-pro');
    expect(critiqueCall.fallbackModel).toBe('gemini-2.5-flash');
  });

  it('vision verification still uses the base flash model, not the pro model', async () => {
    const verifyScrapedImages = vi.fn().mockResolvedValue([]);
    const deps = makeDeps({
      lookupArtist: vi.fn().mockResolvedValue(null),
      searchArtistSources: vi
        .fn()
        .mockResolvedValueOnce({
          sourceText: 'text',
          sourceUrls: ['https://a.example'],
          images: [{ url: 'https://a.example/p.jpg', alt: null, sourceUrl: 'https://a.example' }],
          references: [],
        })
        .mockResolvedValueOnce(null),
      verifyScrapedImages,
    });

    await runBioGeneration({ artistId: 'a1', displayName: 'Radiohead' }, deps);

    const verifyCall = (verifyScrapedImages as ReturnType<typeof vi.fn>).mock.calls[0];
    // 3rd arg is options: { apiKey, model }
    expect(verifyCall[2]).toMatchObject({ model: 'gemini-2.5-flash' });
  });

  it('caps links at 100 when many candidates exist', async () => {
    const manyRefs = Array.from({ length: 130 }, (_, i) => ({
      url: `https://source-${i}.example/page`,
      title: `Source ${i}`,
    }));
    const searchArtistSources = vi
      .fn()
      .mockResolvedValueOnce({
        sourceText: 'Web context.',
        sourceUrls: manyRefs.map((r) => r.url),
        images: [],
        references: manyRefs,
      })
      .mockResolvedValueOnce(null);
    const deps = makeDeps({
      lookupArtist: vi.fn().mockResolvedValue(null),
      searchArtistSources,
    });

    const result = await runBioGeneration({ artistId: 'a1', displayName: 'Artist' }, deps);

    expect(result.links.length).toBe(100);
  });
});

describe('runBioGeneration face annotation', () => {
  /**
   * Wraps images as vision survivors carrying each image's `kind`, so the
   * handler's photo/non-photo partition sees realistic verdict-enriched output.
   */
  const survivorsWithKind = (images: BioImage[]): VerifiedScrapedImage[] =>
    images.map((image) => ({ image, mimeType: 'image/jpeg', base64: '' }));

  /** A scraped web-search source whose images enter the vision gate. */
  const scrapedSource = (images: Array<{ url: string; alt: string | null }>) =>
    vi
      .fn()
      .mockResolvedValueOnce({
        sourceText: 'Web context.',
        sourceUrls: ['https://a.example/bio'],
        images: images.map(({ url, alt }) => ({ url, alt, sourceUrl: 'https://a.example/bio' })),
        references: [],
      })
      .mockResolvedValueOnce(null);

  const annotationsArg = (deps: BioGeneratorDeps): VerifiedScrapedImage[] =>
    (deps.annotateFaces as ReturnType<typeof vi.fn>).mock.calls[0][0];

  it('passes only photo survivors (not covers) to annotateFaces', async () => {
    const deps = makeDeps({
      lookupArtist: vi.fn().mockResolvedValue(null),
      searchArtistSources: scrapedSource([
        { url: 'https://a.example/photo.jpg', alt: 'A photo' },
        { url: 'https://a.example/cover.jpg', alt: 'A cover' },
      ]),
      verifyScrapedImages: vi.fn().mockImplementation(async (candidates: BioImage[]) =>
        survivorsWithKind([
          { ...candidates[0], kind: 'photo' },
          { ...candidates[1], kind: 'cover' },
        ])
      ),
      annotateFaces: vi.fn().mockResolvedValue([{ hasFace: true, faceScore: 80 }]),
    });

    await runBioGeneration({ artistId: 'a1', displayName: 'Artist' }, deps);

    const passed = annotationsArg(deps);
    expect(passed).toHaveLength(1);
    expect(passed[0].image.url).toBe('https://a.example/photo.jpg');
  });

  it('merges each annotation onto its photo by input order', async () => {
    const deps = makeDeps({
      lookupArtist: vi.fn().mockResolvedValue(null),
      searchArtistSources: scrapedSource([
        { url: 'https://a.example/one.jpg', alt: 'One' },
        { url: 'https://a.example/two.jpg', alt: 'Two' },
      ]),
      verifyScrapedImages: vi
        .fn()
        .mockImplementation(async (candidates: BioImage[]) =>
          survivorsWithKind(candidates.map((image) => ({ ...image, kind: 'photo' as const })))
        ),
      annotateFaces: vi.fn().mockResolvedValue([
        { hasFace: true, faceScore: 95 },
        { hasFace: false, faceScore: null },
      ]),
    });

    const result = await runBioGeneration({ artistId: 'a1', displayName: 'Artist' }, deps);

    const byUrl = new Map(result.images.map((image) => [image.url, image]));
    expect(byUrl.get('https://a.example/one.jpg')).toMatchObject({ hasFace: true, faceScore: 95 });
    expect(byUrl.get('https://a.example/two.jpg')).toMatchObject({
      hasFace: false,
      faceScore: null,
    });
  });

  it('sorts a face-scored photo ahead of a cover and an unscored photo', async () => {
    const deps = makeDeps({
      lookupArtist: vi.fn().mockResolvedValue(null),
      searchArtistSources: scrapedSource([
        { url: 'https://a.example/cover.jpg', alt: 'Cover' },
        { url: 'https://a.example/unscored.jpg', alt: 'Unscored' },
        { url: 'https://a.example/scored.jpg', alt: 'Scored' },
      ]),
      verifyScrapedImages: vi.fn().mockImplementation(async (candidates: BioImage[]) =>
        survivorsWithKind([
          { ...candidates[0], kind: 'cover' },
          { ...candidates[1], kind: 'photo' },
          { ...candidates[2], kind: 'photo' },
        ])
      ),
      // photos in partition order: [unscored, scored]
      annotateFaces: vi.fn().mockResolvedValue([
        { hasFace: false, faceScore: null },
        { hasFace: true, faceScore: 88 },
      ]),
    });

    const result = await runBioGeneration({ artistId: 'a1', displayName: 'Artist' }, deps);

    expect(result.images[0].url).toBe('https://a.example/scored.jpg');
  });

  it('fetches reference bytes when referenceImageUrls are supplied', async () => {
    const fetchReferenceBytes = vi.fn().mockResolvedValue([Buffer.from('ref')]);
    const deps = makeDeps({
      lookupArtist: vi.fn().mockResolvedValue(null),
      searchArtistSources: scrapedSource([{ url: 'https://a.example/photo.jpg', alt: 'Photo' }]),
      verifyScrapedImages: vi
        .fn()
        .mockImplementation(async (candidates: BioImage[]) =>
          survivorsWithKind(candidates.map((image) => ({ ...image, kind: 'photo' as const })))
        ),
      fetchReferenceBytes,
      annotateFaces: vi.fn().mockResolvedValue([{ hasFace: true, faceScore: 91 }]),
    });

    await runBioGeneration(
      {
        artistId: 'a1',
        displayName: 'Artist',
        referenceImageUrls: ['https://a.example/ref.jpg'],
      },
      deps
    );

    expect(fetchReferenceBytes).toHaveBeenCalledWith(['https://a.example/ref.jpg']);
    expect((deps.annotateFaces as ReturnType<typeof vi.fn>).mock.calls[0][1]).toEqual([
      Buffer.from('ref'),
    ]);
  });

  it('skips the reference fetch but still runs DetectFaces when refs are absent', async () => {
    const fetchReferenceBytes = vi.fn().mockResolvedValue([]);
    const deps = makeDeps({
      lookupArtist: vi.fn().mockResolvedValue(null),
      searchArtistSources: scrapedSource([{ url: 'https://a.example/photo.jpg', alt: 'Photo' }]),
      verifyScrapedImages: vi
        .fn()
        .mockImplementation(async (candidates: BioImage[]) =>
          survivorsWithKind(candidates.map((image) => ({ ...image, kind: 'photo' as const })))
        ),
      fetchReferenceBytes,
      annotateFaces: vi.fn().mockResolvedValue([{ hasFace: true, faceScore: null }]),
    });

    await runBioGeneration({ artistId: 'a1', displayName: 'Artist' }, deps);

    expect(fetchReferenceBytes).not.toHaveBeenCalled();
    expect((deps.annotateFaces as ReturnType<typeof vi.fn>).mock.calls[0][1]).toEqual([]);
  });

  it('makes zero face calls when the vision gate returns nothing', async () => {
    const fetchReferenceBytes = vi.fn().mockResolvedValue([]);
    const annotateFaces = vi.fn().mockResolvedValue([]);
    const deps = makeDeps({
      lookupArtist: vi.fn().mockResolvedValue(null),
      searchArtistSources: scrapedSource([{ url: 'https://a.example/photo.jpg', alt: 'Photo' }]),
      verifyScrapedImages: vi.fn().mockResolvedValue([]),
      fetchReferenceBytes,
      annotateFaces,
    });

    await runBioGeneration(
      { artistId: 'a1', displayName: 'Artist', referenceImageUrls: ['https://a.example/ref.jpg'] },
      deps
    );

    expect(annotateFaces).not.toHaveBeenCalled();
    expect(fetchReferenceBytes).not.toHaveBeenCalled();
  });

  it('preserves the pre-face merge order when every annotation is null (Rekognition down)', async () => {
    const deps = makeDeps({
      lookupArtist: vi.fn().mockResolvedValue(null),
      searchArtistSources: scrapedSource([
        { url: 'https://a.example/one.jpg', alt: 'One' },
        { url: 'https://a.example/two.jpg', alt: 'Two' },
        { url: 'https://a.example/three.jpg', alt: 'Three' },
      ]),
      verifyScrapedImages: vi
        .fn()
        .mockImplementation(async (candidates: BioImage[]) =>
          survivorsWithKind(candidates.map((image) => ({ ...image, kind: 'photo' as const })))
        ),
      annotateFaces: vi.fn().mockResolvedValue([
        { hasFace: null, faceScore: null },
        { hasFace: null, faceScore: null },
        { hasFace: null, faceScore: null },
      ]),
    });

    const result = await runBioGeneration({ artistId: 'a1', displayName: 'Artist' }, deps);

    expect(result.images.map((image) => image.url)).toEqual([
      'https://a.example/one.jpg',
      'https://a.example/two.jpg',
      'https://a.example/three.jpg',
    ]);
  });

  it('marks image titles for photos at or above the face-match threshold only', async () => {
    const deps = makeDeps({
      lookupArtist: vi.fn().mockResolvedValue(null),
      searchArtistSources: scrapedSource([
        { url: 'https://a.example/strong.jpg', alt: 'Strong' },
        { url: 'https://a.example/weak.jpg', alt: 'Weak' },
      ]),
      verifyScrapedImages: vi
        .fn()
        .mockImplementation(async (candidates: BioImage[]) =>
          survivorsWithKind(candidates.map((image) => ({ ...image, kind: 'photo' as const })))
        ),
      annotateFaces: vi.fn().mockResolvedValue([
        { hasFace: true, faceScore: 90 },
        { hasFace: true, faceScore: 89.9 },
      ]),
    });

    await runBioGeneration({ artistId: 'a1', displayName: 'Artist' }, deps);

    const imageTitles = factsArg(deps).imageTitles as string[];
    expect(imageTitles).toEqual(['Strong (verified face match)', 'Weak']);
  });

  it('exports the face-match title threshold at 90', () => {
    expect(FACE_MATCH_TITLE_THRESHOLD).toBe(90);
  });

  it('does not persist the face-match marker on the image title itself', async () => {
    const deps = makeDeps({
      lookupArtist: vi.fn().mockResolvedValue(null),
      searchArtistSources: scrapedSource([{ url: 'https://a.example/strong.jpg', alt: 'Strong' }]),
      verifyScrapedImages: vi
        .fn()
        .mockImplementation(async (candidates: BioImage[]) =>
          survivorsWithKind(candidates.map((image) => ({ ...image, kind: 'photo' as const })))
        ),
      annotateFaces: vi.fn().mockResolvedValue([{ hasFace: true, faceScore: 95 }]),
    });

    const result = await runBioGeneration({ artistId: 'a1', displayName: 'Artist' }, deps);
    const imageTitles = factsArg(deps).imageTitles as string[];

    // The marker lives on the prompt title list, never on the persisted image.
    expect(imageTitles[0]).toContain('verified face match');
    expect(result.images[0].title).not.toContain('verified face match');
  });
});

describe('Serper image source', () => {
  it('feeds Serper images into the vision gate candidates', async () => {
    const serperImage = {
      url: 'https://serper.example/press.jpg',
      alt: 'Press photo',
      sourceUrl: 'https://serper.example',
    };
    const deps = makeDeps({
      lookupArtist: vi.fn().mockResolvedValue(null),
      getSerperApiKey: vi.fn().mockResolvedValue('serper-key'),
      searchSerperImages: vi.fn().mockResolvedValue([serperImage]),
      verifyScrapedImages: vi.fn().mockImplementation(async (candidates) => verified(candidates)),
    });

    const result = await runBioGeneration({ artistId: 'a1', displayName: 'Obscure Act' }, deps);

    expect(result.images.map((img) => img.url)).toContain('https://serper.example/press.jpg');
  });

  it('calls searchSerperImages with the search name and resolved key', async () => {
    const searchSerperImages = vi.fn().mockResolvedValue(null);
    const deps = makeDeps({
      getSerperApiKey: vi.fn().mockResolvedValue('serper-key'),
      searchSerperImages,
    });

    await runBioGeneration({ artistId: 'a1', displayName: 'Radiohead' }, deps);

    expect(searchSerperImages).toHaveBeenCalledWith('Radiohead', 'serper-key');
  });

  it('never calls searchSerperImages when no Serper key is configured', async () => {
    const searchSerperImages = vi.fn().mockResolvedValue(null);
    const deps = makeDeps({
      getSerperApiKey: vi.fn().mockResolvedValue(null),
      searchSerperImages,
    });

    await runBioGeneration({ artistId: 'a1', displayName: 'Radiohead' }, deps);

    expect(searchSerperImages).not.toHaveBeenCalled();
  });

  it('produces identical output whether or not the Serper key is configured', async () => {
    const withoutKey = await runBioGeneration(
      { artistId: 'a1', displayName: 'Radiohead' },
      makeDeps({ getSerperApiKey: vi.fn().mockResolvedValue(null) })
    );
    const withKeyNoResults = await runBioGeneration(
      { artistId: 'a1', displayName: 'Radiohead' },
      makeDeps({
        getSerperApiKey: vi.fn().mockResolvedValue('serper-key'),
        searchSerperImages: vi.fn().mockResolvedValue(null),
      })
    );

    expect(withKeyNoResults.images).toEqual(withoutKey.images);
  });

  it('proceeds when searchSerperImages returns null', async () => {
    const deps = makeDeps({
      getSerperApiKey: vi.fn().mockResolvedValue('serper-key'),
      searchSerperImages: vi.fn().mockResolvedValue(null),
    });

    const result = await runBioGeneration({ artistId: 'a1', displayName: 'Radiohead' }, deps);

    expect(result.shortBio).toBe('Short teaser.');
  });

  it('runs Serper after web-search and before link-follow', async () => {
    const order: string[] = [];
    const searchArtistSources = vi.fn().mockImplementation(async () => {
      order.push('web-search');
      return {
        sourceText: 'text',
        sourceUrls: ['https://a.example/bio'],
        images: [],
        references: [{ url: 'https://artist.bandcamp.com', title: 'Bandcamp' }],
      };
    });
    const searchSerperImages = vi.fn().mockImplementation(async () => {
      order.push('serper');
      return null;
    });
    // readUrl is the follow-known-links reader: a Bandcamp reference above makes
    // it fire, marking the link-follow boundary that Serper must precede.
    const readUrl = vi.fn().mockImplementation(async () => {
      order.push('link-follow');
      return null;
    });
    const deps = makeDeps({
      lookupArtist: vi.fn().mockResolvedValue(null),
      getSerperApiKey: vi.fn().mockResolvedValue('serper-key'),
      searchArtistSources,
      searchSerperImages,
      readUrl,
    });

    await runBioGeneration({ artistId: 'a1', displayName: 'Radiohead' }, deps);

    expect(order.indexOf('serper')).toBeGreaterThan(order.lastIndexOf('web-search'));
    expect(order.indexOf('serper')).toBeLessThan(order.indexOf('link-follow'));
  });
});

describe('licenseRank', () => {
  it('ranks public-domain licenses in the top tier', () => {
    expect(licenseRank({ license: 'Public Domain' })).toBe(2);
  });

  it('ranks CC0 licenses in the top tier', () => {
    expect(licenseRank({ license: 'CC0 1.0' })).toBe(2);
  });

  it('ranks an attribution-required license in the middle tier', () => {
    expect(licenseRank({ license: 'CC BY-SA 4.0' })).toBe(1);
  });

  it('ranks a null license in the bottom tier', () => {
    expect(licenseRank({ license: null })).toBe(0);
  });

  it('ranks an undefined license in the bottom tier', () => {
    expect(licenseRank({ license: undefined })).toBe(0);
  });

  it('ranks an empty-string license in the bottom tier', () => {
    expect(licenseRank({ license: '' })).toBe(0);
  });
});

describe('resolveImages license-aware ranking', () => {
  it('orders attribution-free above licensed above unknown, stable within a tier', async () => {
    // fileName → license, so the mock stays a URL-derived builder (no dynamic
    // object indexing). Input order is `imageFileNames` below; the two `CC BY`
    // entries share a tier, so a stable sort must keep 1 before 2.
    const licenseFor = (fileName: string): string | null =>
      new Map<string, string | null>([
        ['licensed-1.jpg', 'CC BY-SA 4.0'],
        ['pd.jpg', 'Public Domain'],
        ['unknown.jpg', null],
        ['licensed-2.jpg', 'CC BY 3.0'],
      ]).get(fileName) ?? null;
    const deps = makeDeps({
      getWikidataData: vi.fn().mockResolvedValue({
        imageFileNames: ['licensed-1.jpg', 'pd.jpg', 'unknown.jpg', 'licensed-2.jpg'],
      }),
      getCommonsImage: vi
        .fn()
        .mockImplementation(async (fileName: string) =>
          image({ url: `https://upload.wikimedia.org/${fileName}`, license: licenseFor(fileName) })
        ),
    });

    const result = await runBioGeneration({ artistId: 'a1', displayName: 'Radiohead' }, deps);

    expect(result.images.map((img) => img.url)).toEqual([
      'https://upload.wikimedia.org/pd.jpg',
      'https://upload.wikimedia.org/licensed-1.jpg',
      'https://upload.wikimedia.org/licensed-2.jpg',
      'https://upload.wikimedia.org/unknown.jpg',
    ]);
  });
});

describe('Commons category image license-aware ranking', () => {
  it('orders category images attribution-free above licensed above unknown, stable within a tier', async () => {
    // Empty portrait file list so `resolveImages` contributes nothing and the
    // category-image path is the sole source of `acc.images`. Two `CC BY`
    // entries at non-adjacent input positions share a tier, so a stable sort
    // must keep licensed-1 before licensed-2.
    const withLicense = (url: string, license: string | null): BioImage => ({
      ...commonsImage(url),
      license,
    });
    const deps = makeDeps({
      getWikidataData: vi.fn().mockResolvedValue({
        imageFileNames: [],
        commonsCategory: 'Radiohead',
      }),
      getCommonsCategoryImages: vi
        .fn()
        .mockResolvedValue([
          withLicense('https://commons/licensed-1.jpg', 'CC BY-SA 4.0'),
          withLicense('https://commons/unknown.jpg', null),
          withLicense('https://commons/pd.jpg', 'Public Domain'),
          withLicense('https://commons/licensed-2.jpg', 'CC BY 3.0'),
        ]),
    });

    const result = await runBioGeneration({ artistId: 'a1', displayName: 'Radiohead' }, deps);

    expect(result.images.map((img) => img.url)).toEqual([
      'https://commons/pd.jpg',
      'https://commons/licensed-1.jpg',
      'https://commons/licensed-2.jpg',
      'https://commons/unknown.jpg',
    ]);
  });
});

describe('boundedEnvInt', () => {
  it('returns the default when raw is undefined (env var absent)', () => {
    expect(boundedEnvInt(undefined, 50, 10, 100)).toBe(50);
  });

  it('returns the default when raw is an empty string', () => {
    expect(boundedEnvInt('', 50, 10, 100)).toBe(50);
  });

  it('returns the default when raw is non-numeric garbage', () => {
    expect(boundedEnvInt('abc', 50, 10, 100)).toBe(50);
  });

  it('clamps an over-max value to max (not the default)', () => {
    expect(boundedEnvInt('99999', 50, 10, 100)).toBe(100);
  });

  it('clamps a zero value to min (not the default)', () => {
    expect(boundedEnvInt('0', 50, 10, 100)).toBe(10);
  });

  it('passes through a valid in-range value unchanged', () => {
    expect(boundedEnvInt('75', 50, 10, 100)).toBe(75);
  });
});

describe('visionCandidateLimit', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('defaults to 240 when VISION_CANDIDATE_LIMIT is unset or empty', () => {
    vi.stubEnv('VISION_CANDIDATE_LIMIT', '');
    expect(visionCandidateLimit()).toBe(240);
    expect(DEFAULT_VISION_CANDIDATE_LIMIT).toBe(240);
  });

  it('uses VISION_CANDIDATE_LIMIT when it is a valid in-range integer', () => {
    vi.stubEnv('VISION_CANDIDATE_LIMIT', '200');
    expect(visionCandidateLimit()).toBe(200);
  });

  it('clamps VISION_CANDIDATE_LIMIT above max (300) to 300', () => {
    vi.stubEnv('VISION_CANDIDATE_LIMIT', '99999');
    expect(visionCandidateLimit()).toBe(300);
  });

  it('clamps VISION_CANDIDATE_LIMIT of 0 to min (10), not the default', () => {
    vi.stubEnv('VISION_CANDIDATE_LIMIT', '0');
    expect(visionCandidateLimit()).toBe(10);
  });

  it('falls back to the default when VISION_CANDIDATE_LIMIT is not an integer', () => {
    vi.stubEnv('VISION_CANDIDATE_LIMIT', 'nonsense');
    expect(visionCandidateLimit()).toBe(DEFAULT_VISION_CANDIDATE_LIMIT);
  });
});

describe('followKnownLinksForImages (bounded 1-level link-follow)', () => {
  const matchWithLinks = (links: Array<{ label: string; url: string; kind: string }>) => ({
    mbid: 'mbid-1',
    name: 'Artist',
    wikidataId: null,
    artistType: 'Person',
    area: 'USA',
    beginDate: '1990',
    tags: [],
    links,
  });

  const bandcampScrape = () => ({
    content: '',
    images: [{ url: 'https://img/bc.jpg', alt: null, sourceUrl: 'https://x.bandcamp.com' }],
  });

  it('routes an image from a followed Bandcamp link into the vision-gate candidates', async () => {
    const verifyScrapedImages = vi.fn().mockResolvedValue([]);
    const deps = makeDeps({
      lookupArtist: vi
        .fn()
        .mockResolvedValue(
          matchWithLinks([{ label: 'Bandcamp', url: 'https://x.bandcamp.com', kind: 'streaming' }])
        ),
      readUrl: vi.fn().mockResolvedValue(bandcampScrape()),
      verifyScrapedImages,
    });

    await runBioGeneration({ artistId: 'a1', displayName: 'Artist' }, deps);

    const [candidates] = verifyScrapedImages.mock.calls[0] as [
      Array<{ url: string; sourceUrl: string | null }>,
    ];
    expect(candidates.some((candidate) => candidate.sourceUrl === 'https://x.bandcamp.com')).toBe(
      true
    );
  });

  it('reads a discovered Discogs link one level deep for images', async () => {
    const readUrl = vi.fn().mockResolvedValue({ content: '', images: [] });
    const deps = makeDeps({
      lookupArtist: vi
        .fn()
        .mockResolvedValue(
          matchWithLinks([
            { label: 'Discogs', url: 'https://www.discogs.com/artist/123', kind: 'other' },
          ])
        ),
      readUrl,
    });

    await runBioGeneration({ artistId: 'a1', displayName: 'Artist' }, deps);

    expect(readUrl).toHaveBeenCalledWith('https://www.discogs.com/artist/123', null);
  });

  it('does not follow links outside the known Bandcamp/Discogs hosts', async () => {
    const readUrl = vi.fn().mockResolvedValue(null);
    const deps = makeDeps({
      lookupArtist: vi
        .fn()
        .mockResolvedValue(
          matchWithLinks([{ label: 'Blog', url: 'https://blog.example.com/post', kind: 'other' }])
        ),
      readUrl,
    });

    await runBioGeneration({ artistId: 'a1', displayName: 'Artist' }, deps);

    expect(readUrl).not.toHaveBeenCalled();
  });

  it('caps the number of followed links at MAX_FOLLOWED_LINKS', async () => {
    const readUrl = vi.fn().mockResolvedValue({ content: '', images: [] });
    const links = Array.from({ length: MAX_FOLLOWED_LINKS + 2 }, (_, i) => ({
      label: `Bandcamp ${i}`,
      url: `https://a${i}.bandcamp.com`,
      kind: 'streaming',
    }));
    const deps = makeDeps({
      lookupArtist: vi.fn().mockResolvedValue(matchWithLinks(links)),
      readUrl,
    });

    await runBioGeneration({ artistId: 'a1', displayName: 'Artist' }, deps);

    expect(readUrl).toHaveBeenCalledTimes(MAX_FOLLOWED_LINKS);
  });

  it('subjects followed images to the vision gate rather than trusting them directly', async () => {
    const deps = makeDeps({
      lookupArtist: vi
        .fn()
        .mockResolvedValue(
          matchWithLinks([{ label: 'Bandcamp', url: 'https://x.bandcamp.com', kind: 'streaming' }])
        ),
      readUrl: vi.fn().mockResolvedValue(bandcampScrape()),
      verifyScrapedImages: vi.fn().mockResolvedValue([]),
    });

    const result = await runBioGeneration({ artistId: 'a1', displayName: 'Artist' }, deps);

    expect(result.images.some((img) => img.url === 'https://img/bc.jpg')).toBe(false);
  });

  it('skips a followed link whose URL was already read during earlier scraping', async () => {
    const readUrl = vi.fn().mockResolvedValue(bandcampScrape());
    const deps = makeDeps({
      lookupArtist: vi
        .fn()
        .mockResolvedValue(
          matchWithLinks([{ label: 'Bandcamp', url: 'https://x.bandcamp.com', kind: 'streaming' }])
        ),
      searchArtistSources: vi.fn().mockResolvedValue({
        sourceText: '',
        sourceUrls: ['https://x.bandcamp.com'],
        images: [],
        references: [],
      }),
      readUrl,
    });

    await runBioGeneration({ artistId: 'a1', displayName: 'Artist' }, deps);

    expect(readUrl).not.toHaveBeenCalled();
  });
});

describe('lambdaHandler', () => {
  it('returns ok:false for invalid input', async () => {
    const result = await lambdaHandler({ artistId: '' });

    expect(result.ok).toBe(false);
  });

  it('returns ok:false with the error message when generation throws', async () => {
    // Stub fetch so metadata gathering fails fast (no live network); with no SSM
    // env configured, getGeminiApiKey then throws inside runBioGeneration → ok:false.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network disabled in test')));

    const result = await lambdaHandler({ artistId: 'a1', displayName: 'Radiohead' });

    expect(result.ok).toBe(false);
    vi.unstubAllGlobals();
  });

  it('posts the result to the callback when callbackUrl and jobToken are present', async () => {
    const postCallback = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({ postCallback });

    await runLambda(
      {
        artistId: 'a1',
        displayName: 'Radiohead',
        callbackUrl: 'https://app.example/cb',
        jobToken: 'tok-1',
      },
      deps
    );

    expect(postCallback).toHaveBeenCalledWith({
      url: 'https://app.example/cb',
      jobToken: 'tok-1',
      result: { ok: true, data: expect.objectContaining({ shortBio: 'Short teaser.' }) },
    });
  });

  it('posts the failure result to the callback when generation fails', async () => {
    const postCallback = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({
      postCallback,
      getGeminiApiKey: vi.fn().mockRejectedValue(new Error('no api key')),
    });

    await runLambda(
      {
        artistId: 'a1',
        displayName: 'Radiohead',
        callbackUrl: 'https://app.example/cb',
        jobToken: 'tok-1',
      },
      deps
    );

    expect(postCallback).toHaveBeenCalledWith(
      expect.objectContaining({ result: expect.objectContaining({ ok: false }) })
    );
  });

  it('does not post a callback when no callbackUrl is present', async () => {
    const postCallback = vi.fn().mockResolvedValue(undefined);
    const deps = makeDeps({ postCallback });

    await runLambda({ artistId: 'a1', displayName: 'Radiohead' }, deps);

    expect(postCallback).not.toHaveBeenCalled();
  });

  it('ignores an AWS context passed as the second argument (regression: v4.183.0 hang)', async () => {
    // AWS invokes the handler as (event, context). The context object is NOT a
    // deps bag — it has no getGeminiApiKey/postCallback — so binding it to `deps`
    // made every invoke throw at getGeminiApiKey and, worse, the failure callback
    // (deps.postCallback) also threw unhandled, so no callback was ever sent and
    // the web job hung forever in `processing`. The handler must ignore arg 2 and
    // use its real defaultDeps.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network disabled in test')));
    const awsContext = {
      functionName: 'bio-generator',
      awsRequestId: 'req-1',
      getRemainingTimeInMillis: () => 900_000,
    };

    const result = await lambdaHandler(
      {
        artistId: 'a1',
        displayName: 'Radiohead',
        callbackUrl: 'https://app.example/cb',
        jobToken: 'tok-1',
      },
      awsContext
    );

    // Resolves cleanly (real getGeminiApiKey throws for lack of SSM env → ok:false)
    // rather than rejecting with "getGeminiApiKey/postCallback is not a function".
    expect(result.ok).toBe(false);
    vi.unstubAllGlobals();
  });
});

describe('progress checkpoints', () => {
  const progressInput = () => ({
    artistId: 'a1',
    displayName: 'Radiohead',
    progressUrl: 'https://app.example/progress',
    jobToken: 'tok-1',
  });

  // Deps that exercise EVERY stage boundary: a MusicBrainz match with a Wikidata
  // id + Commons category, release groups with cover art, and scraped images so
  // the vision gate runs. The prose mock invokes the injected `onPhase` hook to
  // simulate the real ensemble reaching the synthesis phase.
  const fullRunDeps = (): BioGeneratorDeps =>
    makeDeps({
      getWikidataData: vi.fn().mockResolvedValue({
        imageFileNames: ['a.jpg'],
        commonsCategory: 'Radiohead',
        wikipediaUrl: 'https://en.wikipedia.org/wiki/Radiohead',
        officialUrl: 'https://radiohead.com',
      }),
      getCommonsCategoryImages: vi
        .fn()
        .mockResolvedValue([commonsImage('https://commons/cat.jpg')]),
      listReleaseGroups: vi.fn().mockResolvedValue([
        {
          rgMbid: 'rg-1',
          title: 'OK Computer',
          firstReleaseDate: '1997-05-21',
          primaryType: 'Album',
        },
      ]),
      getCoverArtImages: vi
        .fn()
        .mockResolvedValue([
          { ...commonsImage('https://caa/okc.jpg'), kind: 'cover', alt: 'OK Computer' },
        ]),
      searchArtistSources: vi
        .fn()
        .mockResolvedValueOnce({
          sourceText: 'Web context.',
          sourceUrls: ['https://zine.net/a'],
          references: [],
          images: [
            { url: 'https://zine.net/p1.jpg', alt: 'live', sourceUrl: 'https://zine.net/a' },
            { url: 'https://zine.net/p2.jpg', alt: 'studio', sourceUrl: 'https://zine.net/a' },
          ],
        })
        .mockResolvedValue(null),
      verifyScrapedImages: vi.fn().mockResolvedValue([]),
      generateProse: vi
        .fn()
        .mockImplementation(
          async (
            _facts: ArtistFacts,
            _apiKey: string,
            _model: string,
            options?: { onPhase?: (phase: 'synthesizing') => Promise<void> | void }
          ) => {
            await options?.onPhase?.('synthesizing');
            return { shortBio: 's', longBio: 'l', altBio: 'a', primaryImageIndexes: [0] };
          }
        ),
    });

  const reportedStages = (deps: BioGeneratorDeps): string[] =>
    (deps.postProgress as ReturnType<typeof vi.fn>).mock.calls.map(
      (call) => (call[0] as { stage: string }).stage
    );

  it('reports every stage in the exact wire-contract order on a full run', async () => {
    const deps = fullRunDeps();

    await runBioGeneration(progressInput(), deps);

    expect(reportedStages(deps)).toEqual([
      'musicbrainz',
      'wikidata',
      'commons',
      'cover-art',
      'web-search',
      'link-follow',
      'vision-gating',
      'drafting',
      'synthesizing',
      'quality-pass',
      'finalizing',
    ]);
  });

  it('tags the vision-gating checkpoint with the candidate count about to be gated', async () => {
    const deps = fullRunDeps();

    await runBioGeneration(progressInput(), deps);

    expect(deps.postProgress).toHaveBeenCalledWith(
      expect.objectContaining({
        progressUrl: 'https://app.example/progress',
        jobToken: 'tok-1',
        stage: 'vision-gating',
        counts: { candidates: 2 },
      })
    );
  });

  it('makes zero progress calls when no progressUrl is provided', async () => {
    const deps = fullRunDeps();

    await runBioGeneration({ artistId: 'a1', displayName: 'Radiohead', jobToken: 'tok-1' }, deps);

    expect(deps.postProgress).not.toHaveBeenCalled();
  });

  it('makes zero progress calls when no jobToken is provided', async () => {
    const deps = fullRunDeps();

    await runBioGeneration(
      { artistId: 'a1', displayName: 'Radiohead', progressUrl: 'https://app.example/progress' },
      deps
    );

    expect(deps.postProgress).not.toHaveBeenCalled();
  });

  it('still completes generation when the progress dep rejects', async () => {
    const deps = fullRunDeps();
    deps.postProgress = vi.fn().mockRejectedValue(new Error('progress endpoint down'));

    const result = await runBioGeneration(progressInput(), deps);

    expect(result.shortBio).toBe('s');
  });
});

describe('media discovery v2 orchestration', () => {
  it('merges commons, covers, and vision-verified scraped images with covers before scraped', async () => {
    const deps = makeDeps();
    deps.getWikidataData = vi.fn().mockResolvedValue({
      imageFileNames: ['A.jpg'],
      commonsCategory: 'Ceschi',
      wikipediaUrl: undefined,
      officialUrl: undefined,
    });
    deps.getCommonsImage = vi.fn().mockResolvedValue(commonsImage('https://commons/a.jpg'));
    deps.getCommonsCategoryImages = vi
      .fn()
      .mockResolvedValue([commonsImage('https://commons/cat.jpg')]);
    deps.listReleaseGroups = vi
      .fn()
      .mockResolvedValue([
        { rgMbid: 'rg-1', title: 'BBB', firstReleaseDate: '2015-04-14', primaryType: 'Album' },
      ]);
    deps.getCoverArtImages = vi
      .fn()
      .mockResolvedValue([
        { ...commonsImage('https://caa/500.jpg'), kind: 'cover', alt: 'BBB album cover' },
      ]);
    deps.searchArtistSources = vi.fn().mockResolvedValue({
      sourceText: 'text',
      sourceUrls: ['https://zine.net/a'],
      references: [{ url: 'https://zine.net/a', title: 'An interview with Ceschi' }],
      images: [
        { url: 'https://zine.net/live.jpg', alt: 'Ceschi live', sourceUrl: 'https://zine.net/a' },
      ],
    });
    deps.verifyScrapedImages = vi.fn().mockResolvedValue(
      verified([
        {
          ...commonsImage('https://zine.net/live.jpg'),
          kind: 'photo',
          alt: 'Ceschi live on stage',
        },
      ])
    );

    const data = await runBioGeneration(baseInput(), deps);

    const urls = data.images.map((img) => img.url);
    expect(urls.indexOf('https://caa/500.jpg')).toBeGreaterThan(
      urls.indexOf('https://commons/cat.jpg')
    );
    expect(urls.indexOf('https://zine.net/live.jpg')).toBeGreaterThan(
      urls.indexOf('https://caa/500.jpg')
    );
    expect(deps.verifyScrapedImages).toHaveBeenCalledTimes(1);
  });

  it('labels search references descriptively and classifies press', async () => {
    const deps = makeDeps();
    deps.searchArtistSources = vi.fn().mockResolvedValue({
      sourceText: 'text',
      sourceUrls: ['https://zine.net/a'],
      references: [{ url: 'https://zine.net/a', title: 'Album review: BBB' }],
      images: [],
    });
    const data = await runBioGeneration(baseInput(), deps);
    const ref = data.links.find((link) => link.url === 'https://zine.net/a');
    expect(ref?.label).toBe('Album review: BBB');
    expect(ref?.kind).toBe('press');
  });

  it('builds chronology and internal release urls from label releases + release groups', async () => {
    const deps = makeDeps();
    deps.listReleaseGroups = vi
      .fn()
      .mockResolvedValue([
        { rgMbid: 'rg-1', title: 'Old EP', firstReleaseDate: '2009-06-01', primaryType: 'EP' },
      ]);
    const input = {
      ...baseInput(),
      releases: [{ title: 'Label Album', releasedOn: '2020-02-02', url: '/releases/abc' }],
    };
    let capturedFacts: ArtistFacts | undefined;
    deps.generateProse = vi.fn().mockImplementation(async (facts: ArtistFacts) => {
      capturedFacts = facts;
      return { shortBio: 's', longBio: 'l', altBio: 'a' };
    });
    await runBioGeneration(input, deps);
    expect(capturedFacts?.chronology).toEqual(
      expect.arrayContaining([
        '2020: released "Label Album" (label catalog — authoritative)',
        '2009: released "Old EP" (MusicBrainz)',
      ])
    );
    expect(capturedFacts?.internalReleaseUrls).toEqual(['/releases/abc']);
  });

  it('caps links at 100', async () => {
    const deps = makeDeps();
    deps.searchArtistSources = vi.fn().mockResolvedValue({
      sourceText: 'text',
      sourceUrls: [],
      references: Array.from({ length: 130 }, (_, i) => ({
        url: `https://zine.net/${i}`,
        title: `Ref ${i}`,
      })),
      images: [],
    });
    const data = await runBioGeneration(baseInput(), deps);
    expect(data.links.length).toBeLessThanOrEqual(100);
    expect(data.links.length).toBeGreaterThan(50);
  });
});
