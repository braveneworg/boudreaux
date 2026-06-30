/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { readUrl, searchArtistSources } from './jina.js';

const jinaSearchResponse = (data: unknown[]): Response =>
  new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const jinaReaderResponse = (content: string): Response =>
  new Response(JSON.stringify({ data: { url: 'https://x', content } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

/** No-op sleep so retries never wait in tests. */
const noSleep = async (): Promise<void> => {};

describe('searchArtistSources', () => {
  it('assembles source text and provenance URLs from the results', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jinaSearchResponse([
        { title: 'Bio', url: 'https://a.example/bio', content: 'Born in 1990, started rapping.' },
        {
          title: 'Profile',
          url: 'https://b.example/profile',
          content: 'Released a debut in 2015.',
        },
      ])
    );

    const result = await searchArtistSources('Some Artist', 'jina-key', fetchFn);

    expect(result?.sourceText).toContain('Born in 1990');
    expect(result?.sourceText).toContain('Released a debut in 2015');
    expect(result?.sourceUrls).toEqual(['https://a.example/bio', 'https://b.example/profile']);
  });

  it('queries s.jina.ai with the artist name and bearer key', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jinaSearchResponse([]));

    await searchArtistSources('Some Artist', 'jina-secret', fetchFn);

    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toContain('s.jina.ai');
    expect(decodeURIComponent(url)).toContain('Some Artist');
    expect(init.headers.Authorization).toBe('Bearer jina-secret');
  });

  it('works without an api key (keyless)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jinaSearchResponse([]));

    await searchArtistSources('Artist', undefined, fetchFn);

    expect(fetchFn.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it('falls back to description when content is absent', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        jinaSearchResponse([{ url: 'https://a.example', description: 'snippet' }])
      );

    const result = await searchArtistSources('Artist', 'k', fetchFn);

    expect(result?.sourceText).toContain('snippet');
  });

  it('returns null when there are no usable results', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jinaSearchResponse([{ url: 'https://a.example', content: '' }]));

    const result = await searchArtistSources('Artist', 'k', fetchFn);

    expect(result).toBeNull();
  });

  it('caps the combined source text length', async () => {
    const huge = 'x'.repeat(40_000);
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jinaSearchResponse([{ url: 'https://a.example', content: huge }]));

    const result = await searchArtistSources('Artist', 'k', fetchFn);

    expect(result && result.sourceText.length).toBeLessThan(huge.length);
  });

  it('returns null (degrades) and logs when Jina responds non-OK', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchFn = vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 }));

    const result = await searchArtistSources('Artist', 'k', fetchFn, { sleep: noSleep });

    expect(result).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('retries a transient 503 then returns the eventual results', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response('unavailable', { status: 503 }))
      .mockResolvedValueOnce(
        jinaSearchResponse([{ url: 'https://a.example', content: 'Recovered content.' }])
      );

    const result = await searchArtistSources('Artist', 'k', fetchFn, { sleep: noSleep });

    expect(result?.sourceText).toContain('Recovered content');
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('returns null and logs when the request throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchFn = vi.fn().mockRejectedValue(new Error('network'));

    const result = await searchArtistSources('Artist', 'k', fetchFn);

    expect(result).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('readUrl', () => {
  it('returns cleaned content from r.jina.ai for the given url', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jinaReaderResponse('Official site copy.'));

    const result = await readUrl('https://radiohead.com', 'k', fetchFn);

    expect(result).toBe('Official site copy.');
    expect(fetchFn.mock.calls[0][0]).toBe('https://r.jina.ai/https://radiohead.com');
  });

  it('caps the reader content length', async () => {
    const huge = 'y'.repeat(40_000);
    const fetchFn = vi.fn().mockResolvedValue(jinaReaderResponse(huge));

    const result = await readUrl('https://x', 'k', fetchFn);

    expect(result && result.length).toBeLessThan(huge.length);
  });

  it('returns null and logs when the reader responds non-OK', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchFn = vi.fn().mockResolvedValue(new Response('nope', { status: 404 }));

    const result = await readUrl('https://x', 'k', fetchFn, { sleep: noSleep });

    expect(result).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('returns null and logs when the request throws', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchFn = vi.fn().mockRejectedValue(new Error('network'));

    const result = await readUrl('https://x', 'k', fetchFn);

    expect(result).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
