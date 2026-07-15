/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { runReleaseDateLookupLambda } from './release-date-lookup.js';

describe('runReleaseDateLookupLambda', () => {
  it('returns a found date from the resolver', async () => {
    const deps = {
      getSerperApiKey: vi.fn().mockResolvedValue('serper'),
      getGeminiApiKey: vi.fn().mockResolvedValue('gemini'),
      resolveReleaseDateSuggestion: vi.fn().mockResolvedValue({
        value: '2020-06-01',
        confidence: 'medium',
        sources: [{ url: 'https://example.com' }],
        note: 'x',
      }),
    };
    const out = await runReleaseDateLookupLambda(
      { task: 'release-date-lookup', title: 'Song', artist: 'Band' },
      deps
    );
    expect(out).toEqual({
      ok: true,
      result: { releasedOn: '2020-06-01', confidence: 'medium', sources: ['https://example.com'] },
    });
  });

  it('returns result:null when the resolver finds nothing', async () => {
    const deps = {
      getSerperApiKey: vi.fn().mockResolvedValue('serper'),
      getGeminiApiKey: vi.fn().mockResolvedValue('gemini'),
      resolveReleaseDateSuggestion: vi.fn().mockResolvedValue(null),
    };
    const out = await runReleaseDateLookupLambda(
      { task: 'release-date-lookup', title: 'Song' },
      deps
    );
    expect(out).toEqual({ ok: true, result: null });
  });

  it('returns ok:false for invalid input', async () => {
    const out = await runReleaseDateLookupLambda({ task: 'release-date-lookup' }, {});
    expect(out.ok).toBe(false);
  });

  it('returns result:null when Serper has no key configured', async () => {
    const deps = { getSerperApiKey: vi.fn().mockResolvedValue(null), getGeminiApiKey: vi.fn() };
    const out = await runReleaseDateLookupLambda(
      { task: 'release-date-lookup', title: 'Song' },
      deps
    );
    expect(out).toEqual({ ok: true, result: null });
  });
});
