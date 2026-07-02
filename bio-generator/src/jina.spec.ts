/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { readUrl, searchArtistSources } from './jina.js';

const jinaSearchResponse = (data: unknown[]): Response =>
  new Response(JSON.stringify({ data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const jinaReaderResponse = (content: string, images?: Record<string, string>): Response =>
  new Response(JSON.stringify({ data: { url: 'https://x', content, images } }), {
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

  it('requests an images summary for each result page', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jinaSearchResponse([]));

    await searchArtistSources('Artist', 'k', fetchFn);

    expect(fetchFn.mock.calls[0][1].headers['X-With-Images-Summary']).toBe('true');
  });

  it('collects scraped images with alt text and the source page URL', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jinaSearchResponse([
        {
          url: 'https://a.example/bio',
          content: 'Bio text.',
          images: {
            'Image 4,1: Artist in 2015': 'https://a.example/photos/artist-2015.png',
            'Image 5,2': 'https://a.example/photos/live.jpg',
          },
        },
      ])
    );

    const result = await searchArtistSources('Artist', 'k', fetchFn);

    expect(result?.images).toEqual([
      {
        url: 'https://a.example/photos/artist-2015.png',
        alt: 'Artist in 2015',
        sourceUrl: 'https://a.example/bio',
      },
      { url: 'https://a.example/photos/live.jpg', alt: null, sourceUrl: 'https://a.example/bio' },
    ]);
  });

  it('filters non-photo and junk image URLs', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jinaSearchResponse([
        {
          url: 'https://a.example/bio',
          content: 'Bio text.',
          images: {
            'Image 1': 'https://a.example/static/site-logo.svg',
            'Image 2: Wikipedia wordmark': 'https://a.example/wordmark.png',
            'Image 3': 'https://a.example/favicon.ico',
            'Image 4': 'https://a.example/anim.gif',
            'Image 5': 'relative/path.jpg',
            'Image 6': "https://a.example/artist/this.src='https://cdn.example/x.jpg",
            'Image 7: Artist portrait': 'https://a.example/portrait.jpg',
          },
        },
      ])
    );

    const result = await searchArtistSources('Artist', 'k', fetchFn);

    expect(result?.images).toEqual([
      {
        url: 'https://a.example/portrait.jpg',
        alt: 'Artist portrait',
        sourceUrl: 'https://a.example/bio',
      },
    ]);
  });

  it('skips images from listening-service result pages', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jinaSearchResponse([
        {
          url: 'https://open.spotify.com/artist/x',
          content: 'Streaming page.',
          images: { 'Image 1': 'https://i.scdn.co/image/cover.jpg' },
        },
        {
          url: 'https://a.example/bio',
          content: 'Bio text.',
          images: { 'Image 1: Artist': 'https://a.example/artist.jpg' },
        },
      ])
    );

    const result = await searchArtistSources('Artist', 'k', fetchFn);

    expect(result?.images).toEqual([
      { url: 'https://a.example/artist.jpg', alt: 'Artist', sourceUrl: 'https://a.example/bio' },
    ]);
  });

  it('dedupes scraped image URLs across results', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jinaSearchResponse([
        {
          url: 'https://a.example/bio',
          content: 'Bio text.',
          images: { 'Image 1: Artist': 'https://cdn.example/artist.jpg' },
        },
        {
          url: 'https://b.example/profile',
          content: 'Profile text.',
          images: { 'Image 1': 'https://cdn.example/artist.jpg' },
        },
      ])
    );

    const result = await searchArtistSources('Artist', 'k', fetchFn);

    expect(result?.images).toHaveLength(1);
  });

  it('returns an empty images list when results carry no images', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValue(jinaSearchResponse([{ url: 'https://a.example', content: 'text' }]));

    const result = await searchArtistSources('Artist', 'k', fetchFn);

    expect(result?.images).toEqual([]);
  });

  it('returns references with url and title for each result', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jinaSearchResponse([
        { title: 'Bio Page', url: 'https://a.example/bio', content: 'some content' },
        { url: 'https://b.example/page', content: 'other content' },
      ])
    );

    const result = await searchArtistSources('Artist', 'k', fetchFn);

    expect(result?.references).toEqual([
      { url: 'https://a.example/bio', title: 'Bio Page' },
      { url: 'https://b.example/page', title: null },
    ]);
  });

  it('uses a custom query when provided', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jinaSearchResponse([]));

    await searchArtistSources('Artist', 'k', fetchFn, {
      query: 'Artist musician interview review',
    });

    const [url] = fetchFn.mock.calls[0];
    expect(decodeURIComponent(url)).toContain('Artist musician interview review');
    expect(decodeURIComponent(url)).not.toContain('biography career discography');
  });

  it('drops scraped images whose alt matches junk keywords', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jinaSearchResponse([
        {
          url: 'https://a.example/bio',
          content: 'Bio text.',
          images: {
            'Image 1: flag': 'https://a.example/flag.jpg',
            'Image 2: Help AllMusic with a subscription': 'https://a.example/sub.jpg',
            'Image 3: Default profile photo': 'https://a.example/default.jpg',
            'Image 4: Ceschi performing in 2015': 'https://a.example/ceschi.jpg',
            'Image 5': 'https://a.example/noalt.jpg',
          },
        },
      ])
    );

    const result = await searchArtistSources('Artist', 'k', fetchFn);

    expect(result?.images).toHaveLength(2);
    const urls = result?.images.map((i) => i.url) ?? [];
    expect(urls).toContain('https://a.example/ceschi.jpg');
    expect(urls).toContain('https://a.example/noalt.jpg');
  });

  it('does not drop images whose alt contains "mDecks Music – Piano & Harmony Tutor"', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jinaSearchResponse([
        {
          url: 'https://a.example/bio',
          content: 'Bio text.',
          images: {
            'Image 1: mDecks Music – Piano & Harmony Tutor': 'https://a.example/mdeck.jpg',
          },
        },
      ])
    );

    const result = await searchArtistSources('Artist', 'k', fetchFn);

    expect(result?.images).toHaveLength(1);
  });

  it('does not truncate beyond the new cap of 20 images per call', async () => {
    const images: Record<string, string> = {};
    for (let i = 0; i < 21; i++) {
      images[`Image ${i}: Photo ${i}`] = `https://a.example/photo-${i}.jpg`;
    }
    const fetchFn = vi
      .fn()
      .mockResolvedValue(
        jinaSearchResponse([{ url: 'https://a.example/bio', content: 'bio text', images }])
      );

    const result = await searchArtistSources('Artist', 'k', fetchFn);

    expect(result?.images).toHaveLength(20);
  });
});

describe('readUrl', () => {
  it('returns cleaned content from r.jina.ai for the given url', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jinaReaderResponse('Official site copy.'));

    const result = await readUrl('https://radiohead.com', 'k', fetchFn);

    expect(result?.content).toBe('Official site copy.');
    expect(fetchFn.mock.calls[0][0]).toBe('https://r.jina.ai/https://radiohead.com');
  });

  it('requests an images summary and returns filtered page images', async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      jinaReaderResponse('Official site copy.', {
        'Image 1: Band photo': 'https://radiohead.com/band.jpg',
        'Image 2': 'https://radiohead.com/nav-icon.png',
      })
    );

    const result = await readUrl('https://radiohead.com', 'k', fetchFn);

    expect(fetchFn.mock.calls[0][1].headers['X-With-Images-Summary']).toBe('true');
    expect(result?.images).toEqual([
      {
        url: 'https://radiohead.com/band.jpg',
        alt: 'Band photo',
        sourceUrl: 'https://radiohead.com',
      },
    ]);
  });

  it('returns an empty images list when the page has none', async () => {
    const fetchFn = vi.fn().mockResolvedValue(jinaReaderResponse('Copy.'));

    const result = await readUrl('https://x', 'k', fetchFn);

    expect(result?.images).toEqual([]);
  });

  it('caps the reader content length', async () => {
    const huge = 'y'.repeat(40_000);
    const fetchFn = vi.fn().mockResolvedValue(jinaReaderResponse(huge));

    const result = await readUrl('https://x', 'k', fetchFn);

    expect(result && result.content.length).toBeLessThan(huge.length);
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
