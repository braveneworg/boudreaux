/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { getWikipediaExtract, titleFromWikipediaUrl } from './wikipedia.js';

const extractResponse = (page: unknown): Response =>
  new Response(JSON.stringify({ query: { pages: { '12345': page } } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

describe('titleFromWikipediaUrl', () => {
  it('decodes the title segment of an /wiki/ URL', () => {
    expect(titleFromWikipediaUrl('https://en.wikipedia.org/wiki/Radiohead')).toBe('Radiohead');
  });

  it('decodes percent-encoded and underscored titles', () => {
    expect(titleFromWikipediaUrl('https://en.wikipedia.org/wiki/Sigur_R%C3%B3s')).toBe('Sigur Rós');
  });

  it('returns null for a non-article URL', () => {
    expect(titleFromWikipediaUrl('https://en.wikipedia.org/')).toBeNull();
  });
});

describe('getWikipediaExtract', () => {
  it('returns the article title, plaintext extract, and source url', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        extractResponse({ title: 'Radiohead', extract: 'Radiohead are an English rock band.' })
      );

    const result = await getWikipediaExtract('https://en.wikipedia.org/wiki/Radiohead', fetchFn);

    expect(result).toEqual({
      title: 'Radiohead',
      extract: 'Radiohead are an English rock band.',
      url: 'https://en.wikipedia.org/wiki/Radiohead',
    });
  });

  it('queries the same language host as the source URL', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(extractResponse({ title: 'Sigur Rós', extract: 'An Icelandic band.' }));

    await getWikipediaExtract('https://is.wikipedia.org/wiki/Sigur_R%C3%B3s', fetchFn);

    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0][0]).toContain('https://is.wikipedia.org/w/api.php');
  });

  it('returns null for a URL with no parseable title', async () => {
    const fetchFn = vi.fn();

    const result = await getWikipediaExtract('https://en.wikipedia.org/', fetchFn);

    expect(result).toBeNull();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it('returns null when the page is missing or has no extract', async () => {
    const fetchFn = vi.fn().mockResolvedValue(extractResponse({ title: 'Nope', missing: '' }));

    const result = await getWikipediaExtract('https://en.wikipedia.org/wiki/Nope', fetchFn);

    expect(result).toBeNull();
  });

  it('truncates an over-long extract to the character cap', async () => {
    const longText = 'x'.repeat(50_000);
    const fetchFn = vi
      .fn()
      .mockResolvedValue(extractResponse({ title: 'Long', extract: longText }));

    const result = await getWikipediaExtract('https://en.wikipedia.org/wiki/Long', fetchFn);

    expect(result?.extract.length).toBeLessThan(longText.length);
  });

  it('returns null when Wikipedia responds non-OK (degrades gracefully)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('nope', { status: 503 }));

    const result = await getWikipediaExtract('https://en.wikipedia.org/wiki/Radiohead', fetchFn);

    expect(result).toBeNull();
  });
});
