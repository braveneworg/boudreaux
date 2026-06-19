/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { lookupArtist } from './musicbrainz.js';

const jsonResponse = (body: unknown): Response =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('lookupArtist', () => {
  it('returns null when no artist matches', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ artists: [] }));

    const result = await lookupArtist('Nonexistent Local Act', fetchFn);

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

    const result = await lookupArtist('Radiohead', fetchFn);

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

    const result = await lookupArtist('Artist', fetchFn);

    expect(result?.links.map((l) => l.kind)).toEqual([
      'official',
      'wikipedia',
      'social',
      'musicbrainz',
    ]);
  });

  it('sends the required descriptive User-Agent header', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ artists: [{ id: 'mbid-3', name: 'Artist' }] }))
      .mockResolvedValueOnce(jsonResponse({ relations: [] }));

    await lookupArtist('Artist', fetchFn);

    const headers = fetchFn.mock.calls[0][1].headers;
    expect(headers['User-Agent']).toContain('FakeFourRecords-BioGenerator');
  });

  it('throws when MusicBrainz returns a non-OK status', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('rate limited', { status: 503 }));

    await expect(lookupArtist('Artist', fetchFn)).rejects.toThrow('MusicBrainz request failed');
  });
});
