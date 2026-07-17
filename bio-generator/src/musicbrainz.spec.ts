/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  listReleaseGroups,
  lookupArtist,
  lookupArtistIdentity,
  searchArtistCandidates,
  searchRecordingCandidates,
} from './musicbrainz.js';

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

  it('skips a streaming relation with a malformed URL resource instead of throwing', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ artists: [{ id: 'mbid-11', name: 'Artist' }] }))
      .mockResolvedValueOnce(
        jsonResponse({
          relations: [
            { type: 'streaming', url: { resource: 'not-a-valid-url' } },
            { type: 'streaming', url: { resource: 'https://open.spotify.com/artist/x' } },
          ],
        })
      );

    const result = await lookupArtist('Artist', fetchFn, { sleep: noSleep });

    const streamingLinks = result?.links.filter((l) => l.kind === 'streaming') ?? [];
    expect(streamingLinks).toHaveLength(1);
    expect(streamingLinks[0].label).toBe('open.spotify.com');
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

describe('service relations', () => {
  const relationsResponse = {
    artists: undefined,
    type: 'Person',
    relations: [
      { type: 'discogs', url: { resource: 'https://www.discogs.com/artist/123' } },
      { type: 'youtube', url: { resource: 'https://www.youtube.com/@ceschi' } },
      { type: 'soundcloud', url: { resource: 'https://soundcloud.com/ceschi' } },
      { type: 'bandcamp', url: { resource: 'https://ceschi.bandcamp.com' } },
      { type: 'allmusic', url: { resource: 'https://www.allmusic.com/artist/x' } },
    ],
  };

  it('maps service relations to labeled links', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ artists: [{ id: 'mbid-1', name: 'Ceschi' }] }))
      .mockResolvedValueOnce(jsonResponse(relationsResponse));
    const match = await lookupArtist('Ceschi', fetchFn, { sleep: async () => {} });
    const byLabel = new Map(match?.links.map((link) => [link.label, link]));
    expect(byLabel.get('Discogs')?.kind).toBe('other');
    expect(byLabel.get('YouTube')?.kind).toBe('social');
    expect(byLabel.get('SoundCloud')?.kind).toBe('streaming');
    expect(byLabel.get('Bandcamp')?.kind).toBe('streaming');
    expect(byLabel.get('AllMusic')?.kind).toBe('press');
  });
});

describe('listReleaseGroups', () => {
  it('returns titled release groups with first-release dates', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(
      jsonResponse({
        'release-groups': [
          {
            id: 'rg-1',
            title: 'Broken Bone Ballads',
            'first-release-date': '2015-04-14',
            'primary-type': 'Album',
          },
          { id: 'rg-2', title: 'Untitled', 'first-release-date': '', 'primary-type': null },
        ],
      })
    );
    const groups = await listReleaseGroups('mbid-1', fetchFn, { sleep: async () => {} });
    expect(groups).toEqual([
      {
        rgMbid: 'rg-1',
        title: 'Broken Bone Ballads',
        firstReleaseDate: '2015-04-14',
        primaryType: 'Album',
      },
      { rgMbid: 'rg-2', title: 'Untitled', firstReleaseDate: null, primaryType: null },
    ]);
    expect(String(fetchFn.mock.calls[0][0])).toContain('/release-group?artist=mbid-1');
  });

  it('returns an empty list when the request fails', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(new Response('nope', { status: 503 }));
    await expect(
      listReleaseGroups('mbid-1', fetchFn, { sleep: async () => {}, retries: 0 })
    ).resolves.toEqual([]);
  });
});

describe('searchArtistCandidates', () => {
  it('maps candidates with score, sort-name, and aliases', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          artists: [
            {
              id: 'mbid-1',
              name: 'Ceschi',
              score: 98,
              'sort-name': 'Ceschi',
              aliases: [{ name: 'Ceschi Ramos' }],
            },
          ],
        })
      )
    );

    const result = await searchArtistCandidates('Ceschi', 5, fetchFn);

    expect(result).toEqual([
      {
        mbid: 'mbid-1',
        name: 'Ceschi',
        score: 98,
        sortName: 'Ceschi',
        aliases: ['Ceschi Ramos'],
      },
    ]);
  });

  it('threads the limit into the search URL', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ artists: [] })));

    await searchArtistCandidates('Ceschi', 3, fetchFn);

    expect(String(fetchFn.mock.calls[0][0])).toContain('limit=3');
  });

  it('returns [] on a failed request', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('nope', { status: 404 }));

    const result = await searchArtistCandidates('Ceschi', 5, fetchFn, { retries: 0 });

    expect(result).toEqual([]);
  });
});

describe('lookupArtistIdentity', () => {
  const identityBody = {
    type: 'Person',
    'sort-name': 'Ceschi',
    'life-span': { begin: '1980-01-02' },
    aliases: [
      { name: 'Francisco Ramos', type: 'Legal name' },
      { name: 'Ceschi Ramos', type: 'Artist name' },
    ],
    relations: [{ type: 'wikidata', url: { resource: 'https://www.wikidata.org/wiki/Q123' } }],
  };

  it('sleeps the MusicBrainz rate limit before the lookup', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify(identityBody)));

    await lookupArtistIdentity('mbid-1', fetchFn, { sleep });

    expect(sleep).toHaveBeenCalledWith(1100);
  });

  it('extracts type, life-span, legal name, aliases, and wikidata id', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify(identityBody)));

    const result = await lookupArtistIdentity('mbid-1', fetchFn, {
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    expect(result).toEqual({
      type: 'Person',
      lifeSpanBegin: '1980-01-02',
      sortName: 'Ceschi',
      legalName: 'Francisco Ramos',
      aliases: ['Francisco Ramos', 'Ceschi Ramos'],
      wikidataId: 'Q123',
    });
  });

  it('requests aliases and url-rels in one lookup', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify(identityBody)));

    await lookupArtistIdentity('mbid-1', fetchFn, {
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    expect(String(fetchFn.mock.calls[0][0])).toContain('inc=aliases+url-rels');
  });

  it('returns null on a failed lookup', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('nope', { status: 404 }));

    const result = await lookupArtistIdentity('mbid-1', fetchFn, {
      sleep: vi.fn().mockResolvedValue(undefined),
      retries: 0,
    });

    expect(result).toBeNull();
  });
});

describe('searchRecordingCandidates', () => {
  const recordingsBody = {
    recordings: [
      {
        id: 'rec-1',
        title: 'Song',
        score: 100,
        'first-release-date': '2021-04-09',
        'artist-credit': [
          { name: 'Alpha', artist: { id: 'artist-1', name: 'Alpha' } },
          { name: 'B', artist: { id: 'artist-2', name: 'Beta' } },
        ],
      },
    ],
  };

  it('builds a quoted recording+artist Lucene query in the search URL', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify(recordingsBody)));

    await searchRecordingCandidates('Alpha', 'Song', 5, fetchFn, {
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    const url = String(fetchFn.mock.calls[0][0]);
    expect(url).toContain(encodeURIComponent('recording:"Song"'));
    expect(url).toContain(encodeURIComponent('artist:"Alpha"'));
  });

  it('maps recordings to candidates with credited artist names and mbids', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify(recordingsBody)));

    const result = await searchRecordingCandidates('Alpha', 'Song', 5, fetchFn, {
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    expect(result).toEqual([
      {
        rid: 'rec-1',
        title: 'Song',
        score: 100,
        firstReleaseDate: '2021-04-09',
        credits: [
          { mbid: 'artist-1', name: 'Alpha' },
          { mbid: 'artist-2', name: 'Beta' },
        ],
      },
    ]);
  });

  it('falls back to the credit-level name when the artist object is absent', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          recordings: [
            {
              id: 'rec-2',
              title: 'Song',
              score: 88,
              'first-release-date': '2020-01-01',
              'artist-credit': [{ name: 'Featured Guest' }],
            },
          ],
        })
      )
    );

    const result = await searchRecordingCandidates('Alpha', 'Song', 5, fetchFn, {
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    expect(result[0].credits).toEqual([{ mbid: null, name: 'Featured Guest' }]);
  });

  it('trims an empty first-release-date to null', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          recordings: [
            {
              id: 'rec-3',
              title: 'Song',
              score: 50,
              'first-release-date': '',
              'artist-credit': [],
            },
          ],
        })
      )
    );

    const result = await searchRecordingCandidates('Alpha', 'Song', 5, fetchFn, {
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    expect(result[0].firstReleaseDate).toBeNull();
  });

  it('defaults firstReleaseDate to null when the field is missing', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          recordings: [{ id: 'rec-4', title: 'Song', score: 50, 'artist-credit': [] }],
        })
      )
    );

    const result = await searchRecordingCandidates('Alpha', 'Song', 5, fetchFn, {
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    expect(result[0].firstReleaseDate).toBeNull();
  });

  it('escapes embedded quotes in the query terms before encoding', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ recordings: [] })));

    await searchRecordingCandidates('Al"pha', 'Song', 5, fetchFn, {
      sleep: vi.fn().mockResolvedValue(undefined),
    });

    const url = String(fetchFn.mock.calls[0][0]);
    expect(url).toContain(encodeURIComponent('artist:"Al\\"pha"'));
  });

  it('sleeps the MusicBrainz rate limit before the request', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ recordings: [] })));

    await searchRecordingCandidates('Alpha', 'Song', 5, fetchFn, { sleep });

    expect(sleep).toHaveBeenCalledWith(1100);
  });

  it('resolves to an empty list on a failed request', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('nope', { status: 503 }));

    const result = await searchRecordingCandidates('Alpha', 'Song', 5, fetchFn, {
      sleep: vi.fn().mockResolvedValue(undefined),
      retries: 0,
    });

    expect(result).toEqual([]);
  });
});
