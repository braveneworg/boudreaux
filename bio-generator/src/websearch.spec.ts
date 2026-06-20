/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { searchArtistSources } from './websearch.js';

const tavilyResponse = (results: unknown[]): Response =>
  new Response(JSON.stringify({ results }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('searchArtistSources', () => {
  it('assembles source text and provenance URLs from the results', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      tavilyResponse([
        {
          title: 'Bio',
          url: 'https://a.example/bio',
          raw_content: 'Born in 1990, started rapping.',
        },
        {
          title: 'Profile',
          url: 'https://b.example/profile',
          content: 'Released a debut in 2015.',
        },
      ])
    );

    const result = await searchArtistSources('Some Artist', 'tvly-key', fetchFn);

    expect(result?.sourceText).toContain('Born in 1990');
    expect(result?.sourceText).toContain('Released a debut in 2015');
    expect(result?.sourceUrls).toEqual(['https://a.example/bio', 'https://b.example/profile']);
  });

  it('sends the query and api key to Tavily', async () => {
    const fetchFn = vi.fn().mockResolvedValue(tavilyResponse([]));

    await searchArtistSources('Some Artist', 'tvly-secret', fetchFn);

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toContain('api.tavily.com');
    expect(init.headers.Authorization).toBe('Bearer tvly-secret');
    expect(JSON.parse(init.body).query).toContain('Some Artist');
  });

  it('prefers raw_content but falls back to content', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(tavilyResponse([{ url: 'https://a.example', content: 'snippet only' }]));

    const result = await searchArtistSources('Artist', 'k', fetchFn);

    expect(result?.sourceText).toContain('snippet only');
  });

  it('returns null when there are no usable results', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(tavilyResponse([{ url: 'https://a.example', content: '' }]));

    const result = await searchArtistSources('Artist', 'k', fetchFn);

    expect(result).toBeNull();
  });

  it('caps the combined source text length', async () => {
    const huge = 'x'.repeat(40_000);
    const fetchFn = vi
      .fn()
      .mockResolvedValue(tavilyResponse([{ url: 'https://a.example', raw_content: huge }]));

    const result = await searchArtistSources('Artist', 'k', fetchFn);

    expect(result && result.sourceText.length).toBeLessThan(huge.length);
  });

  it('returns null (degrades) when Tavily responds non-OK', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 }));

    const result = await searchArtistSources('Artist', 'k', fetchFn);

    expect(result).toBeNull();
  });

  it('returns null when the request throws', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('network'));

    const result = await searchArtistSources('Artist', 'k', fetchFn);

    expect(result).toBeNull();
  });
});
