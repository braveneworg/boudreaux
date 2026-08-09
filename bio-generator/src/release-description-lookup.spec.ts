/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { runReleaseDescriptionLookupLambda } from './release-description-lookup.js';

import type { ReleaseDescriptionLookupDeps } from './release-description-lookup.js';

const suggestion = {
  value: 'Broken Bone Ballads is the fourth solo album by Ceschi.',
  confidence: 'medium' as const,
  sources: [{ url: 'https://example.com/album' }],
  note: 'Synthesized from the album page.',
};

/** Deps wired to "found nothing"; override per test. */
const buildDeps = (
  overrides: Partial<ReleaseDescriptionLookupDeps> = {}
): ReleaseDescriptionLookupDeps =>
  ({
    getSerperApiKey: vi.fn().mockResolvedValue('serper'),
    getGeminiApiKey: vi.fn().mockResolvedValue('gemini'),
    resolveReleaseDescriptionSuggestion: vi.fn().mockResolvedValue(null),
    ...overrides,
  }) as unknown as ReleaseDescriptionLookupDeps;

const lookup = (deps: ReleaseDescriptionLookupDeps, extra: Record<string, unknown> = {}) =>
  runReleaseDescriptionLookupLambda(
    { task: 'release-description-lookup', title: 'Album', artist: 'Band', ...extra },
    deps
  );

describe('runReleaseDescriptionLookupLambda', () => {
  it('returns the synthesized blurb with its sources', async () => {
    const deps = buildDeps({
      resolveReleaseDescriptionSuggestion: vi.fn().mockResolvedValue(suggestion),
    });

    const out = await lookup(deps);

    expect(out).toEqual({
      ok: true,
      result: {
        description: suggestion.value,
        confidence: 'medium',
        sources: ['https://example.com/album'],
      },
    });
  });

  it('passes the release context and the label notes through to the resolver', async () => {
    const resolveReleaseDescriptionSuggestion = vi.fn().mockResolvedValue(suggestion);
    const deps = buildDeps({ resolveReleaseDescriptionSuggestion });

    await lookup(deps, {
      releasedOn: '2015-03-03',
      catalogNumber: 'FF4-042',
      formats: ['VINYL_12_INCH'],
      labelNotes: ['Cut live to tape.'],
    });

    expect(resolveReleaseDescriptionSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Album',
        artistDisplay: 'Band',
        releasedOn: '2015-03-03',
        catalogNumber: 'FF4-042',
        formats: ['VINYL_12_INCH'],
        labelNotes: ['Cut live to tape.'],
        serperKey: 'serper',
        geminiKey: 'gemini',
      })
    );
  });

  it('defaults the label notes to an empty list when none are supplied', async () => {
    const resolveReleaseDescriptionSuggestion = vi.fn().mockResolvedValue(suggestion);
    const deps = buildDeps({ resolveReleaseDescriptionSuggestion });

    await lookup(deps);

    const [args] = resolveReleaseDescriptionSuggestion.mock.calls[0];
    expect(args.labelNotes).toEqual([]);
    expect(args.releasedOn).toBeUndefined();
    expect(args.catalogNumber).toBeUndefined();
    expect(args.formats).toBeUndefined();
  });

  it('returns result:null when the resolver synthesizes nothing', async () => {
    const out = await lookup(buildDeps());

    expect(out).toEqual({ ok: true, result: null });
  });

  it('returns result:null without calling the resolver when Serper has no key', async () => {
    const deps = buildDeps({ getSerperApiKey: vi.fn().mockResolvedValue(null) });

    const out = await lookup(deps);

    expect(out).toEqual({ ok: true, result: null });
    expect(deps.resolveReleaseDescriptionSuggestion).not.toHaveBeenCalled();
  });

  it('returns ok:false when the title is missing', async () => {
    const out = await runReleaseDescriptionLookupLambda(
      { task: 'release-description-lookup', artist: 'Band' },
      buildDeps()
    );

    expect(out.ok).toBe(false);
  });

  it('returns ok:false when the artist is missing (the prose must name one)', async () => {
    const out = await runReleaseDescriptionLookupLambda(
      { task: 'release-description-lookup', title: 'Album' },
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

describe('isReleaseDescriptionLookupTask', () => {
  it('recognizes only its own task envelope', async () => {
    const { isReleaseDescriptionLookupTask } = await import('./release-description-lookup.js');

    expect(isReleaseDescriptionLookupTask({ task: 'release-description-lookup' })).toBe(true);
    expect(isReleaseDescriptionLookupTask({ task: 'video-description-lookup' })).toBe(false);
    expect(isReleaseDescriptionLookupTask(null)).toBe(false);
  });
});
