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
    genres: 'alternative rock',
    primaryImageIndexes: [0],
  }),
  getGroqApiKey: vi.fn().mockResolvedValue('test-key'),
  getSearchApiKey: vi.fn().mockResolvedValue(null),
  searchArtistSources: vi.fn().mockResolvedValue(null),
  ...overrides,
});

describe('runBioGeneration', () => {
  it('assembles prose, images, links, and genres', async () => {
    const result = await runBioGeneration({ artistId: 'a1', displayName: 'Radiohead' }, makeDeps());

    expect(result.shortBio).toBe('Short teaser.');
    expect(result.longBio).toBe('<p>Long bio.</p>');
    expect(result.genres).toBe('alternative rock');
    expect(result.images).toHaveLength(2);
    expect(result.links.some((l) => l.kind === 'wikipedia')).toBe(true);
  });

  it('feeds the Wikipedia article extract to the model as source text', async () => {
    const deps = makeDeps();

    await runBioGeneration({ artistId: 'a1', displayName: 'Radiohead' }, deps);

    const facts = (deps.generateProse as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(facts.sourceText).toContain('formed in Abingdon in 1985');
  });

  it('propagates MusicBrainz structured facts to the model', async () => {
    const deps = makeDeps();

    await runBioGeneration({ artistId: 'a1', displayName: 'Radiohead' }, deps);

    const facts = (deps.generateProse as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(facts.area).toBe('United Kingdom');
    expect(facts.beginDate).toBe('1985');
    expect(facts.tags).toEqual(['alternative rock']);
  });

  it('degrades to no source text when the Wikipedia extract is unavailable', async () => {
    const deps = makeDeps({ getWikipediaExtract: vi.fn().mockResolvedValue(null) });

    const result = await runBioGeneration({ artistId: 'a1', displayName: 'Radiohead' }, deps);

    const facts = (deps.generateProse as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(facts.sourceText).toBeUndefined();
    expect(result.longBio).toBe('<p>Long bio.</p>');
  });

  it('falls back to web search when no structured source text and a key is set', async () => {
    const searchArtistSources = vi.fn().mockResolvedValue({
      sourceText: 'Web-sourced bio text.',
      sourceUrls: ['https://x.example'],
    });
    const deps = makeDeps({
      lookupArtist: vi.fn().mockResolvedValue(null),
      getSearchApiKey: vi.fn().mockResolvedValue('tvly-key'),
      searchArtistSources,
    });

    const result = await runBioGeneration({ artistId: 'a1', displayName: 'Obscure Act' }, deps);

    expect(searchArtistSources).toHaveBeenCalledWith('Obscure Act', 'tvly-key');
    const facts = (deps.generateProse as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(facts.sourceText).toBe('Web-sourced bio text.');
    expect(facts.sourceUrls).toEqual(['https://x.example']);
    expect(result.links.some((l) => l.url === 'https://x.example')).toBe(true);
  });

  it('skips web search when a Wikipedia extract was already found', async () => {
    const searchArtistSources = vi.fn();
    const deps = makeDeps({
      getSearchApiKey: vi.fn().mockResolvedValue('tvly-key'),
      searchArtistSources,
    });

    await runBioGeneration({ artistId: 'a1', displayName: 'Radiohead' }, deps);

    expect(searchArtistSources).not.toHaveBeenCalled();
  });

  it('skips web search when no search key is configured', async () => {
    const searchArtistSources = vi.fn();
    const deps = makeDeps({
      lookupArtist: vi.fn().mockResolvedValue(null),
      getSearchApiKey: vi.fn().mockResolvedValue(null),
      searchArtistSources,
    });

    await runBioGeneration({ artistId: 'a1', displayName: 'Obscure Act' }, deps);

    expect(searchArtistSources).not.toHaveBeenCalled();
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
    expect(result.images.filter((image) => image.isPrimary)).toHaveLength(1);
  });

  it('appends optional admin-supplied links and dedupes by url', async () => {
    const result = await runBioGeneration(
      {
        artistId: 'a1',
        displayName: 'Radiohead',
        links: ['https://radiohead.com', 'https://bandcamp.com/radiohead'],
      },
      makeDeps()
    );

    const radioheadLinks = result.links.filter((l) => l.url === 'https://radiohead.com');
    expect(radioheadLinks).toHaveLength(1);
    expect(result.links.some((l) => l.url === 'https://bandcamp.com/radiohead')).toBe(true);
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
});

describe('lambdaHandler', () => {
  it('returns ok:false for invalid input', async () => {
    const result = await lambdaHandler({ artistId: '' });

    expect(result.ok).toBe(false);
  });

  it('returns ok:false with the error message when generation throws', async () => {
    // Stub fetch so metadata gathering fails fast (no live network); with no SSM
    // env configured, getGroqApiKey then throws inside runBioGeneration → ok:false.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network disabled in test')));

    const result = await lambdaHandler({ artistId: 'a1', displayName: 'Radiohead' });

    expect(result.ok).toBe(false);
    vi.unstubAllGlobals();
  });
});
