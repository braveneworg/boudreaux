/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { runReleaseNotesLookupLambda } from './release-notes-lookup.js';

import type { ReleaseNotesLookupDeps } from './release-notes-lookup.js';

const suggestion = {
  value: ['Broken Bone Ballads is the fourth solo album by Ceschi.', 'It was recorded at home.'],
  confidence: 'medium' as const,
  sources: [{ url: 'https://example.com/album' }],
  note: 'Synthesized from the album page.',
};

/** Deps wired to "found nothing"; override per test. */
const buildDeps = (overrides: Partial<ReleaseNotesLookupDeps> = {}): ReleaseNotesLookupDeps =>
  ({
    getSerperApiKey: vi.fn().mockResolvedValue('serper'),
    getGeminiApiKey: vi.fn().mockResolvedValue('gemini'),
    resolveReleaseNotesSuggestion: vi.fn().mockResolvedValue(null),
    ...overrides,
  }) as unknown as ReleaseNotesLookupDeps;

const lookup = (deps: ReleaseNotesLookupDeps, extra: Record<string, unknown> = {}) =>
  runReleaseNotesLookupLambda(
    { task: 'release-notes-lookup', title: 'Album', artist: 'Band', ...extra },
    deps
  );

describe('runReleaseNotesLookupLambda', () => {
  it('returns the synthesized note paragraphs with their sources', async () => {
    const deps = buildDeps({
      resolveReleaseNotesSuggestion: vi.fn().mockResolvedValue(suggestion),
    });

    const out = await lookup(deps);

    expect(out).toEqual({
      ok: true,
      result: {
        notes: suggestion.value,
        confidence: 'medium',
        sources: ['https://example.com/album'],
      },
    });
  });

  it('passes the release context through to the resolver', async () => {
    const resolveReleaseNotesSuggestion = vi.fn().mockResolvedValue(suggestion);
    const deps = buildDeps({ resolveReleaseNotesSuggestion });

    await lookup(deps, {
      releasedOn: '2015-03-03',
      catalogNumber: 'FF4-042',
      formats: ['VINYL_12_INCH'],
    });

    expect(resolveReleaseNotesSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Album',
        artistDisplay: 'Band',
        releasedOn: '2015-03-03',
        catalogNumber: 'FF4-042',
        formats: ['VINYL_12_INCH'],
        serperKey: 'serper',
        geminiKey: 'gemini',
      })
    );
  });

  it('omits the optional context from the resolver args when not supplied', async () => {
    const resolveReleaseNotesSuggestion = vi.fn().mockResolvedValue(suggestion);
    const deps = buildDeps({ resolveReleaseNotesSuggestion });

    await lookup(deps);

    const [args] = resolveReleaseNotesSuggestion.mock.calls[0];
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
    expect(deps.resolveReleaseNotesSuggestion).not.toHaveBeenCalled();
  });

  it('returns ok:false when the title is missing', async () => {
    const out = await runReleaseNotesLookupLambda(
      { task: 'release-notes-lookup', artist: 'Band' },
      buildDeps()
    );

    expect(out.ok).toBe(false);
  });

  it('returns ok:false when the artist is missing (the prose must name one)', async () => {
    const out = await runReleaseNotesLookupLambda(
      { task: 'release-notes-lookup', title: 'Album' },
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

describe('isReleaseNotesLookupTask', () => {
  it('recognizes only its own task envelope', async () => {
    const { isReleaseNotesLookupTask } = await import('./release-notes-lookup.js');

    expect(isReleaseNotesLookupTask({ task: 'release-notes-lookup' })).toBe(true);
    expect(isReleaseNotesLookupTask({ task: 'video-description-lookup' })).toBe(false);
    expect(isReleaseNotesLookupTask(null)).toBe(false);
  });
});
