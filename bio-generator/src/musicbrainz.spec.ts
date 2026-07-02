/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { lookupArtist } from './musicbrainz.js';

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

/** No-op sleep so the rate-limit spacing + retries never wait in tests. */
const noSleep = async (): Promise<void> => {};

describe('lookupArtist', () => {
  it('returns null when no artist matches', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ artists: [] }));

    const result = await lookupArtist('Nonexistent Local Act', fetchFn, { sleep: noSleep });

    expect(result).toBeNull();
  });

  it('resolves the wikidata id from the artist relations', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ artists: [{ id: 'mbid-1', name: 'Radiohead' }] }))
      .mockResolvedValueOnce(
        jsonResponse({
          relations: [
            { type: 'wikidata', url: { resource: 'https://www.wikidata.org/wiki/Q11649' } },
          ],
        })
      );

    const result = await lookupArtist('Radiohead', fetchFn, { sleep: noSleep });

    expect(result?.wikidataId).toBe('Q11649');
  });

  it('classifies official, wikipedia, and social links plus a MusicBrainz link', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ artists: [{ id: 'mbid-2', name: 'Artist' }] }))
      .mockResolvedValueOnce(
        jsonResponse({
          relations: [
            { type: 'official homepage', url: { resource: 'https://artist.example' } },
            { type: 'wikipedia', url: { resource: 'https://en.wikipedia.org/wiki/Artist' } },
            { type: 'social network', url: { resource: 'https://instagram.com/artist' } },
          ],
        })
      );

    const result = await lookupArtist('Artist', fetchFn, { sleep: noSleep });

    expect(result?.links.map((l) => l.kind)).toEqual([
      'official',
      'wikipedia',
      'social',
      'musicbrainz',
    ]);
  });

  it('extracts type, area, life-span, and the top tags as grounding facts', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ artists: [{ id: 'mbid-4', name: 'Radiohead' }] }))
      .mockResolvedValueOnce(
        jsonResponse({
          type: 'Group',
          area: { name: 'United Kingdom' },
          'life-span': { begin: '1985', end: null },
          tags: [
            { name: 'alternative rock', count: 10 },
            { name: 'experimental', count: 7 },
          ],
          relations: [],
        })
      );

    const result = await lookupArtist('Radiohead', fetchFn, { sleep: noSleep });

    expect(result?.artistType).toBe('Group');
    expect(result?.area).toBe('United Kingdom');
    expect(result?.beginDate).toBe('1985');
    expect(result?.tags).toEqual(['alternative rock', 'experimental']);
  });

  it('orders tags by usage count and caps the list', async () => {
    const manyTags = Array.from({ length: 12 }, (_, i) => ({ name: `tag-${i}`, count: i }));
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ artists: [{ id: 'mbid-5', name: 'Artist' }] }))
      .mockResolvedValueOnce(jsonResponse({ tags: manyTags, relations: [] }));

    const result = await lookupArtist('Artist', fetchFn, { sleep: noSleep });

    expect(result?.tags).toHaveLength(8);
    expect(result?.tags[0]).toBe('tag-11');
  });

  it('requests tags alongside url-rels in the lookup', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ artists: [{ id: 'mbid-6', name: 'Artist' }] }))
      .mockResolvedValueOnce(jsonResponse({ relations: [] }));

    await lookupArtist('Artist', fetchFn, { sleep: noSleep });

    expect(fetchFn.mock.calls[1][0]).toContain('inc=url-rels+tags');
  });

  it('sends the required descriptive User-Agent header', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ artists: [{ id: 'mbid-3', name: 'Artist' }] }))
      .mockResolvedValueOnce(jsonResponse({ relations: [] }));

    await lookupArtist('Artist', fetchFn, { sleep: noSleep });

    const headers = fetchFn.mock.calls[0][1].headers;
    expect(headers['User-Agent']).toContain('FakeFourRecords-BioGenerator');
  });

  it('spaces the search and lookup calls to respect the rate limit', async () => {
    const sleepFn = vi.fn().mockResolvedValue(undefined);
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ artists: [{ id: 'mbid-7', name: 'Artist' }] }))
      .mockResolvedValueOnce(jsonResponse({ relations: [] }));

    await lookupArtist('Artist', fetchFn, { sleep: sleepFn });

    expect(sleepFn).toHaveBeenCalledTimes(1);
  });

  it('retries a transient 503 on the search call before resolving the match', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response('rate limited', { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ artists: [{ id: 'mbid-8', name: 'Artist' }] }))
      .mockResolvedValueOnce(jsonResponse({ relations: [] }));

    const result = await lookupArtist('Artist', fetchFn, { sleep: noSleep });

    expect(result?.mbid).toBe('mbid-8');
    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('throws after exhausting retries on a persistent non-OK status', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('rate limited', { status: 503 }));

    await expect(lookupArtist('Artist', fetchFn, { sleep: noSleep })).rejects.toThrow(
      'MusicBrainz request failed'
    );
  });

  it('classifies streaming and free streaming relation types as kind streaming', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ artists: [{ id: 'mbid-10', name: 'Artist' }] }))
      .mockResolvedValueOnce(
        jsonResponse({
          relations: [
            { type: 'streaming', url: { resource: 'https://open.spotify.com/artist/x' } },
            { type: 'free streaming', url: { resource: 'https://artist.bandcamp.com' } },
          ],
        })
      );

    const result = await lookupArtist('Artist', fetchFn, { sleep: noSleep });

    const streamingLinks = result?.links.filter((l) => l.kind === 'streaming') ?? [];
    expect(streamingLinks).toHaveLength(2);
    expect(streamingLinks[0].label).toBe('open.spotify.com');
    expect(streamingLinks[1].label).toBe('artist.bandcamp.com');
  });
});
