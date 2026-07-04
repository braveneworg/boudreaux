/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { verifyScrapedImages, VISION_FETCH_MAX_BYTES, VISION_MIN_CONFIDENCE } from './vision.js';

import type { BioImage } from './types.js';

const candidate = (url: string): BioImage => ({
  url,
  thumbnailUrl: null,
  title: null,
  attribution: 'somezine.net',
  license: null,
  sourceUrl: 'https://somezine.net/a',
  width: null,
  height: null,
  isPrimary: false,
});

const context = { artistNames: ['Ceschi', 'Ceschi Ramos'], releaseTitles: ['Broken Bone Ballads'] };

const imageResponse = (): Response =>
  new Response(new Uint8Array([137, 80, 78, 71]), {
    status: 200,
    headers: { 'Content-Type': 'image/png', 'Content-Length': '4' },
  });

const geminiVerdicts = (verdicts: unknown): Response =>
  new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ verdicts }) }] } }],
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );

describe('verifyScrapedImages', () => {
  it('keeps accepted images with kind and alt from the verdict', async () => {
    const fetchFn = vi
      .fn()
      // two candidate image fetches
      .mockResolvedValueOnce(imageResponse())
      .mockResolvedValueOnce(imageResponse())
      // one batched Gemini call
      .mockResolvedValueOnce(
        geminiVerdicts([
          { index: 0, verdict: 'artist_photo', confidence: 0.9, alt: 'Ceschi performing live' },
          { index: 1, verdict: 'reject', confidence: 0.95 },
        ])
      );
    const kept = await verifyScrapedImages(
      [candidate('https://a.com/1.png'), candidate('https://a.com/2.png')],
      context,
      { apiKey: 'key', model: 'gemini-2.5-flash' },
      { fetchFn, sleep: async () => {} }
    );
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({
      url: 'https://a.com/1.png',
      kind: 'photo',
      alt: 'Ceschi performing live',
    });
  });

  it('drops verdicts below the confidence floor', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(imageResponse())
      .mockResolvedValueOnce(
        geminiVerdicts([
          { index: 0, verdict: 'album_cover', confidence: VISION_MIN_CONFIDENCE - 0.1 },
        ])
      );
    const kept = await verifyScrapedImages(
      [candidate('https://a.com/1.png')],
      context,
      { apiKey: 'key', model: 'gemini-2.5-flash' },
      { fetchFn, sleep: async () => {} }
    );
    expect(kept).toEqual([]);
  });

  it('fails closed: a failed Gemini batch drops that batch', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(imageResponse())
      .mockResolvedValue(new Response('quota', { status: 429 }));
    const kept = await verifyScrapedImages(
      [candidate('https://a.com/1.png')],
      context,
      { apiKey: 'key', model: 'gemini-2.5-flash' },
      { fetchFn, sleep: async () => {}, retries: 0 }
    );
    expect(kept).toEqual([]);
  });

  it('fails closed: unfetchable and non-image candidates are dropped', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(
        new Response('html', { status: 200, headers: { 'Content-Type': 'text/html' } })
      )
      .mockRejectedValueOnce(new Error('network'));
    const kept = await verifyScrapedImages(
      [candidate('https://a.com/1.png'), candidate('https://a.com/2.png')],
      context,
      { apiKey: 'key', model: 'gemini-2.5-flash' },
      { fetchFn, sleep: async () => {} }
    );
    expect(kept).toEqual([]);
    // No Gemini call when nothing survived fetching.
    expect(fetchFn).toHaveBeenCalledTimes(2);
  });

  it('rejects a candidate with an oversized content-length header without reading the body', async () => {
    // The body is small (4 bytes — would pass the post-read check), but the
    // Content-Length header declares the payload as oversized. The pre-read check
    // must reject so the body is never consumed.
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: {
          'Content-Type': 'image/png',
          'Content-Length': String(VISION_FETCH_MAX_BYTES + 1),
        },
      })
    );
    const kept = await verifyScrapedImages(
      [candidate('https://a.com/1.png')],
      context,
      { apiKey: 'key', model: 'gemini-2.5-flash' },
      { fetchFn, sleep: async () => {} }
    );
    expect(kept).toEqual([]);
    // Without the pre-read check the 4-byte body would be accepted and Gemini
    // called (2 fetches total). Exactly 1 fetch confirms early rejection.
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('keeps album covers as kind cover with a title-derived alt fallback', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(imageResponse())
      .mockResolvedValueOnce(
        geminiVerdicts([{ index: 0, verdict: 'album_cover', confidence: 0.8 }])
      );
    const withTitle = { ...candidate('https://a.com/1.png'), title: 'BBB cover' };
    const kept = await verifyScrapedImages(
      [withTitle],
      context,
      { apiKey: 'key', model: 'gemini-2.5-flash' },
      {
        fetchFn,
        sleep: async () => {},
      }
    );
    expect(kept[0]).toMatchObject({ kind: 'cover', alt: 'BBB cover' });
  });
});
