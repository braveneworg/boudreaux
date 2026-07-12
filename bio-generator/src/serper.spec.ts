/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { MAX_SERPER_IMAGES_PER_QUERY, searchSerperImages, searchSerperWeb } from './serper.js';

interface SerperImage {
  imageUrl?: string;
  title?: string;
  link?: string;
}

const serperResponse = (images: SerperImage[]): Response =>
  new Response(JSON.stringify({ images }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const errorResponse = (status: number): Response => new Response('nope', { status });

describe('searchSerperImages', () => {
  it('runs four image queries against the Serper images endpoint', async () => {
    const fetchFn = vi.fn().mockResolvedValue(serperResponse([]));

    await searchSerperImages('Some Artist', 'serper-key', fetchFn);

    expect(fetchFn).toHaveBeenCalledTimes(4);
    for (const call of fetchFn.mock.calls) {
      expect(call[0]).toBe('https://google.serper.dev/images');
    }
  });

  it('issues the four targeted image queries', async () => {
    const fetchFn = vi.fn().mockResolvedValue(serperResponse([]));

    await searchSerperImages('Some Artist', 'serper-key', fetchFn);

    const bodies = fetchFn.mock.calls.map((call) => JSON.parse(call[1].body).q);
    expect(bodies).toEqual([
      'Some Artist musician press photo',
      'Some Artist live performance',
      'Some Artist band portrait',
      'Some Artist album cover',
    ]);
  });

  it('POSTs with the api-key and JSON content-type headers', async () => {
    const fetchFn = vi.fn().mockResolvedValue(serperResponse([]));

    await searchSerperImages('Some Artist', 'serper-secret', fetchFn);

    const [, init] = fetchFn.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.headers['X-API-KEY']).toBe('serper-secret');
    expect(init.headers['Content-Type']).toBe('application/json');
  });

  it('maps imageUrl, title, and link into scraped-image candidates', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(
      serperResponse([
        {
          imageUrl: 'https://a.example/press.jpg',
          title: 'Press shot',
          link: 'https://a.example',
        },
      ])
    );
    fetchFn.mockResolvedValue(serperResponse([]));

    const result = await searchSerperImages('Some Artist', 'k', fetchFn);

    expect(result).toEqual([
      { url: 'https://a.example/press.jpg', alt: 'Press shot', sourceUrl: 'https://a.example' },
    ]);
  });

  it('maps a missing or whitespace title to a null alt', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        serperResponse([
          { imageUrl: 'https://a.example/one.jpg', title: '   ', link: 'https://a.example' },
        ])
      );
    fetchFn.mockResolvedValue(serperResponse([]));

    const result = await searchSerperImages('Some Artist', 'k', fetchFn);

    expect(result?.[0].alt).toBeNull();
  });

  it('skips items with no link (provenance is required)', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(
      serperResponse([
        { imageUrl: 'https://a.example/kept.jpg', title: 'Kept', link: 'https://a.example' },
        { imageUrl: 'https://a.example/dropped.jpg', title: 'No link' },
      ])
    );
    fetchFn.mockResolvedValue(serperResponse([]));

    const result = await searchSerperImages('Some Artist', 'k', fetchFn);

    expect(result?.map((image) => image.url)).toEqual(['https://a.example/kept.jpg']);
  });

  it('filters out junk URLs (logos, icons, vectors)', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(
      serperResponse([
        { imageUrl: 'https://a.example/logo.png', title: 'Photo', link: 'https://a.example' },
        { imageUrl: 'https://a.example/real.jpg', title: 'Photo', link: 'https://a.example' },
      ])
    );
    fetchFn.mockResolvedValue(serperResponse([]));

    const result = await searchSerperImages('Some Artist', 'k', fetchFn);

    expect(result?.map((image) => image.url)).toEqual(['https://a.example/real.jpg']);
  });

  it('filters out images whose alt text is page chrome', async () => {
    const fetchFn = vi.fn().mockResolvedValueOnce(
      serperResponse([
        {
          imageUrl: 'https://a.example/one.jpg',
          title: 'Subscribe now',
          link: 'https://a.example',
        },
        {
          imageUrl: 'https://a.example/two.jpg',
          title: 'Live at the venue',
          link: 'https://a.example',
        },
      ])
    );
    fetchFn.mockResolvedValue(serperResponse([]));

    const result = await searchSerperImages('Some Artist', 'k', fetchFn);

    expect(result?.map((image) => image.url)).toEqual(['https://a.example/two.jpg']);
  });

  it('caps kept images per query', async () => {
    const many = Array.from({ length: MAX_SERPER_IMAGES_PER_QUERY + 10 }, (_, i) => ({
      imageUrl: `https://a.example/photo-${i}.jpg`,
      title: `Photo ${i}`,
      link: 'https://a.example',
    }));
    const fetchFn = vi.fn().mockResolvedValueOnce(serperResponse(many));
    fetchFn.mockResolvedValue(serperResponse([]));

    const result = await searchSerperImages('Some Artist', 'k', fetchFn);

    expect(result).toHaveLength(MAX_SERPER_IMAGES_PER_QUERY);
  });

  it('dedupes by lowercased URL across queries, keeping the first occurrence', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        serperResponse([
          { imageUrl: 'https://a.example/Shared.jpg', title: 'First', link: 'https://a.example/1' },
        ])
      )
      .mockResolvedValueOnce(
        serperResponse([
          {
            imageUrl: 'https://a.example/shared.JPG',
            title: 'Second',
            link: 'https://a.example/2',
          },
        ])
      );
    fetchFn.mockResolvedValue(serperResponse([]));

    const result = await searchSerperImages('Some Artist', 'k', fetchFn);

    expect(result).toEqual([
      { url: 'https://a.example/Shared.jpg', alt: 'First', sourceUrl: 'https://a.example/1' },
    ]);
  });

  it('merges results from other queries when one query is non-ok', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(errorResponse(429))
      .mockResolvedValueOnce(
        serperResponse([
          { imageUrl: 'https://a.example/ok.jpg', title: 'OK', link: 'https://a.example' },
        ])
      );
    fetchFn.mockResolvedValue(serperResponse([]));

    const result = await searchSerperImages('Some Artist', 'k', fetchFn);

    expect(result?.map((image) => image.url)).toEqual(['https://a.example/ok.jpg']);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('returns null and warns when all queries fail', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchFn = vi.fn().mockResolvedValue(errorResponse(500));

    const result = await searchSerperImages('Some Artist', 'k', fetchFn);

    expect(result).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('returns null when all queries are genuinely empty', async () => {
    const fetchFn = vi.fn().mockResolvedValue(serperResponse([]));

    const result = await searchSerperImages('Some Artist', 'k', fetchFn);

    expect(result).toBeNull();
  });

  it('catches a thrown fetch for one query and continues', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchFn = vi
      .fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce(
        serperResponse([
          { imageUrl: 'https://a.example/ok.jpg', title: 'OK', link: 'https://a.example' },
        ])
      );
    fetchFn.mockResolvedValue(serperResponse([]));

    const result = await searchSerperImages('Some Artist', 'k', fetchFn);

    expect(result?.map((image) => image.url)).toEqual(['https://a.example/ok.jpg']);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('never rejects even when every fetch throws', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fetchFn = vi.fn().mockRejectedValue(new Error('network down'));

    await expect(searchSerperImages('Some Artist', 'k', fetchFn)).resolves.toBeNull();
  });

  it('logs an info summary with the merged count on success', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {});
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        serperResponse([
          { imageUrl: 'https://a.example/one.jpg', title: 'One', link: 'https://a.example' },
        ])
      );
    fetchFn.mockResolvedValue(serperResponse([]));

    await searchSerperImages('Some Artist', 'k', fetchFn);

    const events = info.mock.calls.map((call) => JSON.parse(call[0] as string).event);
    expect(events).toContain('serper_images');
    info.mockRestore();
  });
});

describe('searchSerperWeb', () => {
  it('maps organic results and caps at 10', async () => {
    const organic = Array.from({ length: 12 }, (_, i) => ({
      title: `Result ${i}`,
      link: `https://example.com/${i}`,
      snippet: `Snippet ${i}`,
      date: i === 0 ? 'Jun 1, 2020' : undefined,
    }));
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ organic })));

    const result = await searchSerperWeb('ceschi premiere', 'key-1', fetchFn);

    expect(result).toHaveLength(10);
    expect(result[0]).toEqual({
      title: 'Result 0',
      link: 'https://example.com/0',
      snippet: 'Snippet 0',
      date: 'Jun 1, 2020',
    });
  });

  it('POSTs the query to the search endpoint with the API key', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(JSON.stringify({ organic: [] })));

    await searchSerperWeb('ceschi premiere', 'key-1', fetchFn);

    expect(fetchFn).toHaveBeenCalledWith('https://google.serper.dev/search', {
      method: 'POST',
      headers: { 'X-API-KEY': 'key-1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ q: 'ceschi premiere' }),
    });
  });

  it('returns [] on a non-ok response', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('rate limited', { status: 429 }));

    const result = await searchSerperWeb('q', 'key-1', fetchFn);

    expect(result).toEqual([]);
  });

  it('returns [] when the fetch throws (never throws)', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('network'));

    const result = await searchSerperWeb('q', 'key-1', fetchFn);

    expect(result).toEqual([]);
  });
});
