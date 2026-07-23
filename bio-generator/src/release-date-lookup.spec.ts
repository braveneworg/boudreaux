/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { runReleaseDateLookupLambda } from './release-date-lookup.js';

import type { ReleaseDateLookupDeps } from './release-date-lookup.js';

const youtubeMatch = {
  releasedOn: '2019-08-04',
  confidence: 'high' as const,
  url: 'https://www.youtube.com/watch?v=duxo_G6pgPw',
  title: 'Ceschi - My Bad (Animated Video)',
};

const webSuggestion = {
  value: '2020-06-01',
  confidence: 'medium' as const,
  sources: [{ url: 'https://example.com' }],
  note: 'x',
};

/** Deps with both tiers wired to "found nothing"; override per test. */
const buildDeps = (overrides: Partial<ReleaseDateLookupDeps> = {}): ReleaseDateLookupDeps =>
  ({
    getSerperApiKey: vi.fn().mockResolvedValue('serper'),
    getGeminiApiKey: vi.fn().mockResolvedValue('gemini'),
    getYoutubeApiKey: vi.fn().mockResolvedValue('yt'),
    findYoutubeReleaseDate: vi.fn().mockResolvedValue(null),
    resolveReleaseDateSuggestion: vi.fn().mockResolvedValue(null),
    ...overrides,
  }) as unknown as ReleaseDateLookupDeps;

const lookup = (deps: ReleaseDateLookupDeps, artist?: string) =>
  runReleaseDateLookupLambda(
    { task: 'release-date-lookup', title: 'Song', ...(artist ? { artist } : {}) },
    deps
  );

describe('runReleaseDateLookupLambda — YouTube tier', () => {
  it('returns the premiere date from the matched YouTube upload', async () => {
    const deps = buildDeps({
      findYoutubeReleaseDate: vi.fn().mockResolvedValue(youtubeMatch),
    });

    const out = await lookup(deps, 'Band');

    expect(out).toEqual({
      ok: true,
      result: {
        releasedOn: '2019-08-04',
        confidence: 'high',
        sources: ['https://www.youtube.com/watch?v=duxo_G6pgPw'],
      },
    });
  });

  it('does not run the web adjudication when YouTube already answered', async () => {
    const deps = buildDeps({
      findYoutubeReleaseDate: vi.fn().mockResolvedValue(youtubeMatch),
    });

    await lookup(deps, 'Band');

    expect(deps.resolveReleaseDateSuggestion).not.toHaveBeenCalled();
  });

  it('passes the title and artist to the YouTube search', async () => {
    const findYoutubeReleaseDate = vi.fn().mockResolvedValue(youtubeMatch);
    const deps = buildDeps({ findYoutubeReleaseDate });

    await lookup(deps, 'Band');

    expect(findYoutubeReleaseDate).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Song', artist: 'Band', apiKey: 'yt' })
    );
  });

  it('falls through to the web adjudication when YouTube finds nothing', async () => {
    const deps = buildDeps({
      resolveReleaseDateSuggestion: vi.fn().mockResolvedValue(webSuggestion),
    });

    const out = await lookup(deps, 'Band');

    expect(out).toEqual({
      ok: true,
      result: { releasedOn: '2020-06-01', confidence: 'medium', sources: ['https://example.com'] },
    });
  });

  it('falls through to the web adjudication when no YouTube key is configured', async () => {
    const findYoutubeReleaseDate = vi.fn();
    const deps = buildDeps({
      getYoutubeApiKey: vi.fn().mockResolvedValue(null),
      findYoutubeReleaseDate,
      resolveReleaseDateSuggestion: vi.fn().mockResolvedValue(webSuggestion),
    });

    const out = await lookup(deps, 'Band');

    expect(findYoutubeReleaseDate).not.toHaveBeenCalled();
    expect(out.ok).toBe(true);
  });
});

describe('runReleaseDateLookupLambda — web tier and failure modes', () => {
  it('returns a found date from the resolver', async () => {
    const deps = buildDeps({
      resolveReleaseDateSuggestion: vi.fn().mockResolvedValue(webSuggestion),
    });

    const out = await lookup(deps, 'Band');

    expect(out).toEqual({
      ok: true,
      result: { releasedOn: '2020-06-01', confidence: 'medium', sources: ['https://example.com'] },
    });
  });

  it('returns result:null when neither tier finds anything', async () => {
    const out = await lookup(buildDeps());

    expect(out).toEqual({ ok: true, result: null });
  });

  it('returns result:null when Serper has no key and YouTube missed', async () => {
    const deps = buildDeps({ getSerperApiKey: vi.fn().mockResolvedValue(null) });

    const out = await lookup(deps);

    expect(out).toEqual({ ok: true, result: null });
  });

  it('returns ok:false for invalid input', async () => {
    const out = await runReleaseDateLookupLambda({ task: 'release-date-lookup' }, buildDeps());

    expect(out.ok).toBe(false);
  });
});
