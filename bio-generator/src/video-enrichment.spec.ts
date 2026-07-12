/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  confidenceFor,
  isVideoEnrichmentTask,
  runVideoEnrichment,
  runVideoEnrichmentLambda,
} from './video-enrichment.js';

import type { MusicBrainzArtistCandidate, MusicBrainzArtistIdentity } from './musicbrainz.js';
import type { VideoEnrichmentInput } from './types.js';
import type { VideoEnrichmentDeps } from './video-enrichment.js';
import type { WikidataData } from './wikidata.js';

const candidate = (
  overrides: Partial<MusicBrainzArtistCandidate> = {}
): MusicBrainzArtistCandidate => ({
  mbid: 'mbid-1',
  name: 'Ceschi',
  score: 98,
  sortName: 'Ceschi',
  aliases: [],
  ...overrides,
});

const identity = (
  overrides: Partial<MusicBrainzArtistIdentity> = {}
): MusicBrainzArtistIdentity => ({
  type: 'Person',
  lifeSpanBegin: '1980-01-02',
  sortName: 'Ceschi',
  legalName: 'Francisco Ramos',
  aliases: ['Francisco Ramos', 'Ceschi Ramos'],
  wikidataId: 'Q123',
  ...overrides,
});

const wikidata = (overrides: Partial<WikidataData> = {}): WikidataData => ({
  imageFileNames: [],
  aliases: [],
  occupationIds: ['Q639669'],
  dateOfBirth: { value: '1980-01-02', precision: 11 },
  ...overrides,
});

const buildDeps = (overrides: Partial<VideoEnrichmentDeps> = {}): VideoEnrichmentDeps => ({
  searchArtistCandidates: vi.fn().mockResolvedValue([candidate()]),
  lookupArtistIdentity: vi.fn().mockResolvedValue(identity()),
  getWikidataData: vi.fn().mockResolvedValue(wikidata()),
  searchSerperWeb: vi.fn().mockResolvedValue([]),
  getGeminiApiKey: vi.fn().mockResolvedValue('gemini-key'),
  getSerperApiKey: vi.fn().mockResolvedValue('serper-key'),
  resolveReleaseDateSuggestion: vi.fn().mockResolvedValue(null),
  resolveIdentityFallback: vi.fn().mockResolvedValue(null),
  postCallback: vi.fn().mockResolvedValue(undefined),
  postProgress: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

const baseInput: VideoEnrichmentInput = {
  task: 'video-enrichment',
  videoId: 'f'.repeat(24),
  title: 'Bite Through Stone',
  artistDisplay: 'Ceschi',
  releasedOn: '2021-04-09',
  artists: [{ artistId: 'a'.repeat(24), name: 'Ceschi', role: 'primary' }],
};

describe('confidenceFor', () => {
  it('grants high with MB >= 95 + corroboration + occupation gate', () => {
    expect(
      confidenceFor({ score: 96, corroborated: true, occupationOk: true, singleToken: true })
    ).toBe('high');
  });

  it('caps a single-token name at medium without corroboration', () => {
    expect(
      confidenceFor({ score: 98, corroborated: false, occupationOk: true, singleToken: true })
    ).toBe('medium');
  });

  it('caps at medium when the occupation gate fails', () => {
    expect(
      confidenceFor({ score: 98, corroborated: true, occupationOk: false, singleToken: false })
    ).toBe('medium');
  });
});

describe('runVideoEnrichment', () => {
  it('emits a high-confidence bornOn when MB and Wikidata corroborate', async () => {
    const deps = buildDeps();

    const result = await runVideoEnrichment(baseInput, deps);

    expect(result.artists[0].suggestions).toContainEqual(
      expect.objectContaining({ field: 'bornOn', value: '1980-01-02', confidence: 'high' })
    );
  });

  it('splits the legal name into first/surname suggestions', async () => {
    const deps = buildDeps();

    const result = await runVideoEnrichment(baseInput, deps);

    expect(result.artists[0].suggestions).toContainEqual(
      expect.objectContaining({ field: 'firstName', value: 'Francisco' })
    );
    expect(result.artists[0].suggestions).toContainEqual(
      expect.objectContaining({ field: 'surname', value: 'Ramos' })
    );
  });

  it('skips facts equal to the known identity', async () => {
    const deps = buildDeps();
    const input: VideoEnrichmentInput = {
      ...baseInput,
      artists: [
        {
          artistId: 'a'.repeat(24),
          name: 'Ceschi',
          role: 'primary',
          known: { bornOn: '1980-01-02', firstName: 'Francisco', surname: 'Ramos' },
        },
      ],
    };

    const result = await runVideoEnrichment(input, deps);

    const fields = result.artists[0].suggestions.map(({ field }) => field);
    expect(fields).not.toContain('bornOn');
    expect(fields).not.toContain('firstName');
    expect(fields).not.toContain('surname');
  });

  it('gates out candidates below score 90', async () => {
    const deps = buildDeps({
      searchArtistCandidates: vi.fn().mockResolvedValue([candidate({ score: 85 })]),
    });

    await runVideoEnrichment(baseInput, deps);

    expect(deps.lookupArtistIdentity).not.toHaveBeenCalled();
  });

  it('gates out candidates whose name and aliases do not match', async () => {
    const deps = buildDeps({
      searchArtistCandidates: vi
        .fn()
        .mockResolvedValue([candidate({ name: 'Cassius', aliases: ['Cash'] })]),
    });

    await runVideoEnrichment(baseInput, deps);

    expect(deps.lookupArtistIdentity).not.toHaveBeenCalled();
  });

  it('caps identity lookups at two per artist', async () => {
    const deps = buildDeps({
      searchArtistCandidates: vi
        .fn()
        .mockResolvedValue([
          candidate({ mbid: 'm1' }),
          candidate({ mbid: 'm2' }),
          candidate({ mbid: 'm3' }),
        ]),
      lookupArtistIdentity: vi.fn().mockResolvedValue(null),
    });

    await runVideoEnrichment(baseInput, deps);

    expect(deps.lookupArtistIdentity).toHaveBeenCalledTimes(2);
  });

  it('emits no personal identity facts for a group', async () => {
    const deps = buildDeps({
      lookupArtistIdentity: vi.fn().mockResolvedValue(identity({ type: 'Group' })),
    });

    const result = await runVideoEnrichment(baseInput, deps);

    expect(result.artists[0].suggestions).toEqual([]);
  });

  it('falls back to low-confidence web identity when structured sources miss', async () => {
    const deps = buildDeps({
      searchArtistCandidates: vi.fn().mockResolvedValue([]),
      resolveIdentityFallback: vi.fn().mockResolvedValue({
        bornOn: '1980-01-02',
        sources: [{ url: 'https://example.com/interview' }],
        note: 'Interview.',
      }),
    });

    const result = await runVideoEnrichment(baseInput, deps);

    expect(result.artists[0].suggestions).toContainEqual(
      expect.objectContaining({ field: 'bornOn', confidence: 'low' })
    );
  });

  it('skips the web fallback without a Serper key', async () => {
    const deps = buildDeps({
      searchArtistCandidates: vi.fn().mockResolvedValue([]),
      getSerperApiKey: vi.fn().mockResolvedValue(null),
    });

    await runVideoEnrichment(baseInput, deps);

    expect(deps.resolveIdentityFallback).not.toHaveBeenCalled();
  });

  it('isolates a per-artist failure (other artists still enrich)', async () => {
    const deps = buildDeps({
      searchArtistCandidates: vi
        .fn()
        .mockRejectedValueOnce(new Error('mb down'))
        .mockResolvedValueOnce([candidate()]),
    });
    const input: VideoEnrichmentInput = {
      ...baseInput,
      artists: [
        { artistId: 'a'.repeat(24), name: 'Ceschi', role: 'primary' },
        { artistId: 'b'.repeat(24), name: 'Ceschi', role: 'featured' },
      ],
    };

    const result = await runVideoEnrichment(input, deps);

    expect(result.artists[0].suggestions).toEqual([]);
    expect(result.artists[1].suggestions.length).toBeGreaterThan(0);
  });

  it('attaches the adjudicated release date to the video block', async () => {
    const releasedOn = {
      value: '2020-06-01',
      confidence: 'medium' as const,
      sources: [{ url: 'https://example.com/premiere' }],
      note: 'Premiere article.',
    };
    const deps = buildDeps({
      resolveReleaseDateSuggestion: vi.fn().mockResolvedValue(releasedOn),
    });

    const result = await runVideoEnrichment(baseInput, deps);

    expect(result.video?.releasedOn).toEqual(releasedOn);
  });

  it('posts progress checkpoints when the event carries progress plumbing', async () => {
    const deps = buildDeps();
    const input: VideoEnrichmentInput = {
      ...baseInput,
      progressUrl: 'https://example.com/progress',
      jobToken: 'token-1',
    };

    await runVideoEnrichment(input, deps);

    const stages = vi.mocked(deps.postProgress).mock.calls.map(([args]) => args.stage);
    expect(stages).toEqual(
      expect.arrayContaining(['musicbrainz', 'wikidata', 'adjudicating', 'finalizing'])
    );
  });
});

describe('runVideoEnrichment additional branches', () => {
  it('extracts a middle name from a three-token legal name', async () => {
    const deps = buildDeps({
      lookupArtistIdentity: vi
        .fn()
        .mockResolvedValue(identity({ legalName: 'Francisco Javier Ramos' })),
    });

    const result = await runVideoEnrichment(baseInput, deps);

    expect(result.artists[0].suggestions).toContainEqual(
      expect.objectContaining({ field: 'middleName', value: 'Javier' })
    );
  });

  it('skips a middle name the app already knows', async () => {
    const deps = buildDeps({
      lookupArtistIdentity: vi
        .fn()
        .mockResolvedValue(identity({ legalName: 'Francisco Javier Ramos' })),
    });
    const input: VideoEnrichmentInput = {
      ...baseInput,
      artists: [
        {
          artistId: 'a'.repeat(24),
          name: 'Ceschi',
          role: 'primary',
          known: { middleName: 'Javier' },
        },
      ],
    };

    const result = await runVideoEnrichment(input, deps);

    const fields = result.artists[0].suggestions.map(({ field }) => field);
    expect(fields).not.toContain('middleName');
  });

  it('folds fresh MB + Wikidata aliases into one akaNames suggestion', async () => {
    const deps = buildDeps({
      lookupArtistIdentity: vi.fn().mockResolvedValue(identity({ aliases: ['Ceschi Ramos'] })),
      getWikidataData: vi.fn().mockResolvedValue(wikidata({ aliases: ['C. Ramos'] })),
    });

    const result = await runVideoEnrichment(baseInput, deps);

    expect(result.artists[0].suggestions).toContainEqual(
      expect.objectContaining({ field: 'akaNames', value: 'Ceschi Ramos, C. Ramos' })
    );
  });

  it('omits aliases the app already knows', async () => {
    const deps = buildDeps({
      lookupArtistIdentity: vi.fn().mockResolvedValue(identity({ aliases: ['Ceschi Ramos'] })),
      getWikidataData: vi.fn().mockResolvedValue(wikidata({ aliases: [] })),
    });
    const input: VideoEnrichmentInput = {
      ...baseInput,
      artists: [
        {
          artistId: 'a'.repeat(24),
          name: 'Ceschi',
          role: 'primary',
          known: { akaNames: 'Ceschi Ramos' },
        },
      ],
    };

    const result = await runVideoEnrichment(input, deps);

    const fields = result.artists[0].suggestions.map(({ field }) => field);
    expect(fields).not.toContain('akaNames');
  });

  it('suggests the MB canonical display name when it differs and none is known', async () => {
    const deps = buildDeps({
      searchArtistCandidates: vi
        .fn()
        .mockResolvedValue([candidate({ name: 'Ceschi Ramos', aliases: ['Ceschi'] })]),
    });

    const result = await runVideoEnrichment(baseInput, deps);

    expect(result.artists[0].suggestions).toContainEqual(
      expect.objectContaining({ field: 'displayName', value: 'Ceschi Ramos' })
    );
  });

  it('never suggests a display name the app already holds', async () => {
    const deps = buildDeps({
      searchArtistCandidates: vi
        .fn()
        .mockResolvedValue([candidate({ name: 'Ceschi Ramos', aliases: ['Ceschi'] })]),
    });
    const input: VideoEnrichmentInput = {
      ...baseInput,
      artists: [
        {
          artistId: 'a'.repeat(24),
          name: 'Ceschi',
          role: 'primary',
          known: { displayName: 'Ceschi' },
        },
      ],
    };

    const result = await runVideoEnrichment(input, deps);

    const fields = result.artists[0].suggestions.map(({ field }) => field);
    expect(fields).not.toContain('displayName');
  });

  it('keeps structured facts when Wikidata corroboration throws', async () => {
    const deps = buildDeps({
      getWikidataData: vi.fn().mockRejectedValue(new Error('wikidata down')),
    });

    const result = await runVideoEnrichment(baseInput, deps);

    expect(result.artists[0].suggestions).toContainEqual(
      expect.objectContaining({ field: 'bornOn', value: '1980-01-02' })
    );
  });

  it('maps all web-fallback name parts to low confidence', async () => {
    const deps = buildDeps({
      searchArtistCandidates: vi.fn().mockResolvedValue([]),
      resolveIdentityFallback: vi.fn().mockResolvedValue({
        firstName: 'Francisco',
        middleName: 'Javier',
        surname: 'Ramos',
        sources: [{ url: 'https://example.com/interview' }],
        note: 'Interview.',
      }),
    });

    const result = await runVideoEnrichment(baseInput, deps);

    const fields = result.artists[0].suggestions.map(({ field }) => field);
    expect(fields).toEqual(['firstName', 'middleName', 'surname']);
  });

  it('honors a GEMINI_MODEL override for the adjudication', async () => {
    vi.stubEnv('GEMINI_MODEL', 'gemini-2.5-pro');
    const resolveReleaseDateSuggestion = vi.fn().mockResolvedValue(null);
    const deps = buildDeps({ resolveReleaseDateSuggestion });

    await runVideoEnrichment(baseInput, deps);

    expect(resolveReleaseDateSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gemini-2.5-pro' }),
      expect.anything()
    );
    vi.unstubAllEnvs();
  });
});

describe('runVideoEnrichmentLambda', () => {
  it('returns an invalid-input envelope for a malformed event', async () => {
    const result = await runVideoEnrichmentLambda({ task: 'video-enrichment' }, buildDeps());

    expect(result.ok).toBe(false);
  });

  it('converts a thrown run into an ok:false envelope', async () => {
    const deps = buildDeps({
      getGeminiApiKey: vi.fn().mockRejectedValue(new Error('ssm down')),
    });

    const result = await runVideoEnrichmentLambda(baseInput, deps);

    expect(result.ok).toBe(false);
  });

  it('POSTs the callback when the event carries callback plumbing', async () => {
    const deps = buildDeps();
    const input: VideoEnrichmentInput = {
      ...baseInput,
      callbackUrl: 'https://example.com/callback',
      jobToken: 'token-1',
    };

    const result = await runVideoEnrichmentLambda(input, deps);

    expect(result.ok).toBe(true);
    expect(deps.postCallback).toHaveBeenCalledWith({
      url: 'https://example.com/callback',
      jobToken: 'token-1',
      result,
    });
  });
});

describe('isVideoEnrichmentTask', () => {
  it('recognizes the task discriminator', () => {
    expect(isVideoEnrichmentTask({ task: 'video-enrichment' })).toBe(true);
  });

  it('rejects a bio event (no task field)', () => {
    expect(isVideoEnrichmentTask({ artistId: 'x', displayName: 'Ceschi' })).toBe(false);
  });

  it('rejects a non-object event', () => {
    expect(isVideoEnrichmentTask('video-enrichment')).toBe(false);
  });
});
