/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { lambdaHandler, runBioGeneration } from './handler.js';

import type { BioGeneratorDeps } from './handler.js';
import type { BioImage } from './types.js';

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
  searchArtistSources: vi.fn().mockResolvedValue(null),
  readUrl: vi.fn().mockResolvedValue(null),
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

    expect(searchArtistSources).toHaveBeenCalledWith('Obscure Act', null);
  });

  it('uses web search content as grounding when found', async () => {
    const searchArtistSources = vi.fn().mockResolvedValue({
      sourceText: 'Web-sourced bio text.',
      sourceUrls: ['https://x.example'],
      images: [],
    });
    const deps = makeDeps({
      lookupArtist: vi.fn().mockResolvedValue(null),
      getScrapeApiKey: vi.fn().mockResolvedValue('jina-key'),
      searchArtistSources,
    });

    const result = await runBioGeneration({ artistId: 'a1', displayName: 'Obscure Act' }, deps);

    expect(searchArtistSources).toHaveBeenCalledWith('Obscure Act', 'jina-key');
    const facts = factsArg(deps);
    expect(facts.sourceText).toBe('Web-sourced bio text.');
    expect(facts.sourceUrls).toEqual(['https://x.example']);
    expect(result.links.some((l) => l.url === 'https://x.example')).toBe(true);
  });

  it('merges web search context with the Wikipedia extract when both exist', async () => {
    const searchArtistSources = vi.fn().mockResolvedValue({
      sourceText: 'Extra web context.',
      sourceUrls: ['https://x.example'],
      images: [],
    });
    const deps = makeDeps({ searchArtistSources });

    await runBioGeneration({ artistId: 'a1', displayName: 'Radiohead' }, deps);

    const facts = factsArg(deps);
    expect(facts.sourceText).toContain('formed in Abingdon in 1985');
    expect(facts.sourceText).toContain('Extra web context.');
    expect(facts.sourceUrls).toContain('https://en.wikipedia.org/wiki/Radiohead');
    expect(facts.sourceUrls).toContain('https://x.example');
  });

  it('drops listening-service URLs from the reference URLs given to the model', async () => {
    const searchArtistSources = vi.fn().mockResolvedValue({
      sourceText: 'Web context.',
      sourceUrls: ['https://genius.com/radiohead', 'https://open.spotify.com/artist/x'],
      images: [],
    });
    const deps = makeDeps({ searchArtistSources });

    await runBioGeneration({ artistId: 'a1', displayName: 'Radiohead' }, deps);

    const facts = factsArg(deps);
    expect(facts.sourceUrls).toContain('https://genius.com/radiohead');
    expect(facts.sourceUrls?.some((u: string) => u.includes('spotify.com'))).toBe(false);
  });

  it('drops listening-service links from the discovered links', async () => {
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
    expect(result.links.some((l) => l.url.includes('bandcamp.com'))).toBe(false);
    expect(result.links.some((l) => l.url.includes('spotify.com'))).toBe(false);
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
      searchArtistSources: vi.fn().mockResolvedValue({
        sourceText: 'Web-sourced bio text.',
        sourceUrls: ['https://a.example/bio'],
        images: [
          {
            url: 'https://a.example/artist.jpg',
            alt: 'Artist in 2015',
            sourceUrl: 'https://a.example/bio',
          },
        ],
      }),
    });

    const result = await runBioGeneration({ artistId: 'a1', displayName: 'Obscure Act' }, deps);

    expect(result.images).toEqual([
      {
        url: 'https://a.example/artist.jpg',
        thumbnailUrl: null,
        title: 'Artist in 2015',
        attribution: 'a.example',
        license: null,
        sourceUrl: 'https://a.example/bio',
        width: null,
        height: null,
        isPrimary: true,
      },
    ]);
    expect(factsArg(deps).imageTitles).toEqual(['Artist in 2015']);
  });

  it('keeps Commons images and ignores scraped ones when Commons resolves', async () => {
    const deps = makeDeps({
      searchArtistSources: vi.fn().mockResolvedValue({
        sourceText: 'Web context.',
        sourceUrls: ['https://a.example/bio'],
        images: [
          {
            url: 'https://a.example/artist.jpg',
            alt: 'Artist',
            sourceUrl: 'https://a.example/bio',
          },
        ],
      }),
    });

    const result = await runBioGeneration({ artistId: 'a1', displayName: 'Radiohead' }, deps);

    expect(result.images).toHaveLength(2);
    expect(result.images.every((img) => img.url.includes('upload.wikimedia.org'))).toBe(true);
  });

  it('ranks alt-titled scraped images first and caps the fallback at six', async () => {
    const scraped = Array.from({ length: 8 }, (_, i) => ({
      url: `https://a.example/photo-${i}.jpg`,
      alt: i % 2 === 0 ? null : `Photo ${i}`,
      sourceUrl: 'https://a.example/bio',
    }));
    const deps = makeDeps({
      lookupArtist: vi.fn().mockResolvedValue(null),
      searchArtistSources: vi.fn().mockResolvedValue({
        sourceText: 'Web context.',
        sourceUrls: ['https://a.example/bio'],
        images: scraped,
      }),
    });

    const result = await runBioGeneration({ artistId: 'a1', displayName: 'Obscure Act' }, deps);

    expect(result.images).toHaveLength(6);
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
    });

    const result = await runBioGeneration({ artistId: 'a1', displayName: 'Radiohead' }, deps);

    expect(result.images).toHaveLength(1);
    expect(result.images[0].url).toBe('https://radiohead.com/band.jpg');
    expect(result.images[0].attribution).toBe('radiohead.com');
  });

  it('logs a scraped_images_fallback event with candidate and used counts', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const deps = makeDeps({
      lookupArtist: vi.fn().mockResolvedValue(null),
      searchArtistSources: vi.fn().mockResolvedValue({
        sourceText: 'Web context.',
        sourceUrls: ['https://a.example/bio'],
        images: [
          {
            url: 'https://a.example/artist.jpg',
            alt: 'Artist',
            sourceUrl: 'https://a.example/bio',
          },
        ],
      }),
    });

    await runBioGeneration({ artistId: 'a1', displayName: 'Obscure Act' }, deps);

    const events = info.mock.calls.map((call) => JSON.parse(call[0] as string));
    const fallback = events.find((e) => e.event === 'scraped_images_fallback');
    expect(fallback).toMatchObject({ candidates: 1, used: 1 });
    info.mockRestore();
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

    expect(result.shortBio).toBe('Revised short.');
    expect(result.longBio).toBe('<p>Revised long.</p>');
    expect(result.altBio).toBe('Revised alt.');
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
});
