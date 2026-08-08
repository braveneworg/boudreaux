/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { runVideoDescriptionLookupLambda } from './video-description-lookup.js';

import type { VideoDescriptionLookupDeps } from './video-description-lookup.js';

const suggestion = {
  value: 'Ceschi’s "Bite Through Stone" drew praise — "a jagged miracle" — Pitchfork.',
  confidence: 'medium' as const,
  sources: [{ url: 'https://example.com/review' }],
  note: 'Synthesized from the review page.',
};

/** Deps wired to "found nothing"; override per test. */
const buildDeps = (
  overrides: Partial<VideoDescriptionLookupDeps> = {}
): VideoDescriptionLookupDeps =>
  ({
    getSerperApiKey: vi.fn().mockResolvedValue('serper'),
    getGeminiApiKey: vi.fn().mockResolvedValue('gemini'),
    resolveDescriptionSuggestion: vi.fn().mockResolvedValue(null),
    ...overrides,
  }) as unknown as VideoDescriptionLookupDeps;

const lookup = (deps: VideoDescriptionLookupDeps, extra: Record<string, unknown> = {}) =>
  runVideoDescriptionLookupLambda(
    { task: 'video-description-lookup', title: 'Song', artist: 'Band', ...extra },
    deps
  );

describe('runVideoDescriptionLookupLambda', () => {
  it('returns the synthesized description with its sources', async () => {
    const deps = buildDeps({
      resolveDescriptionSuggestion: vi.fn().mockResolvedValue(suggestion),
    });

    const out = await lookup(deps);

    expect(out).toEqual({
      ok: true,
      result: {
        description: suggestion.value,
        confidence: 'medium',
        sources: ['https://example.com/review'],
      },
    });
  });

  it('passes the title, artist, release date, and no facts to the resolver', async () => {
    const resolveDescriptionSuggestion = vi.fn().mockResolvedValue(suggestion);
    const deps = buildDeps({ resolveDescriptionSuggestion });

    await lookup(deps, { releasedOn: '2021-04-09' });

    expect(resolveDescriptionSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Song',
        artistDisplay: 'Band',
        releasedOn: '2021-04-09',
        facts: [],
        serperKey: 'serper',
        geminiKey: 'gemini',
      })
    );
  });

  it('omits the release date from the resolver args when not supplied', async () => {
    const resolveDescriptionSuggestion = vi.fn().mockResolvedValue(suggestion);
    const deps = buildDeps({ resolveDescriptionSuggestion });

    await lookup(deps);

    const [args] = resolveDescriptionSuggestion.mock.calls[0];
    expect(args.releasedOn).toBeUndefined();
  });

  it('returns result:null when the resolver synthesizes nothing', async () => {
    const out = await lookup(buildDeps());

    expect(out).toEqual({ ok: true, result: null });
  });

  it('returns result:null without calling the resolver when Serper has no key', async () => {
    const deps = buildDeps({ getSerperApiKey: vi.fn().mockResolvedValue(null) });

    const out = await lookup(deps);

    expect(out).toEqual({ ok: true, result: null });
    expect(deps.resolveDescriptionSuggestion).not.toHaveBeenCalled();
  });

  it('returns ok:false when the title is missing', async () => {
    const out = await runVideoDescriptionLookupLambda(
      { task: 'video-description-lookup', artist: 'Band' },
      buildDeps()
    );

    expect(out.ok).toBe(false);
  });

  it('returns ok:false when the artist is missing (the prose must name one)', async () => {
    const out = await runVideoDescriptionLookupLambda(
      { task: 'video-description-lookup', title: 'Song' },
      buildDeps()
    );

    expect(out.ok).toBe(false);
  });

  it('converts an unexpected throw into the ok:false envelope', async () => {
    const deps = buildDeps({
      getGeminiApiKey: vi.fn().mockRejectedValue(new Error('ssm down')),
    });

    const out = await lookup(deps);

    expect(out).toEqual({ ok: false, error: 'ssm down' });
  });
});
