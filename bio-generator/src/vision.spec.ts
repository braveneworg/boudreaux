/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  verifyScrapedImages,
  VISION_BATCH_SIZE,
  VISION_FETCH_MAX_BYTES,
  VISION_MIN_CONFIDENCE,
} from './vision.js';

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

const config = { apiKey: 'key', model: 'gemini-2.5-flash' };

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

const geminiVerdictsWithUsage = (verdicts: unknown, usage: Record<string, number>): Response =>
  new Response(
    JSON.stringify({
      candidates: [{ content: { parts: [{ text: JSON.stringify({ verdicts }) }] } }],
      usageMetadata: usage,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );

/** A Gemini completion whose JSON body is `payload` verbatim — used for malformed responses. */
const geminiRaw = (payload: unknown): Response =>
  new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(payload) }] } }] }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );

/** Structured log lines of `event` captured from the given console method's spy. */
const eventsFrom = (method: 'info' | 'warn', event: string): Array<Record<string, unknown>> => {
  const spy = method === 'info' ? vi.mocked(console.info) : vi.mocked(console.warn);
  return spy.mock.calls
    .map((call) => JSON.parse(call[0] as string) as Record<string, unknown>)
    .filter((entry) => entry.event === event);
};

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

  it('salvages a verdict missing confidence by defaulting it to the confidence floor', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(imageResponse())
      .mockResolvedValueOnce(imageResponse())
      .mockResolvedValueOnce(
        geminiVerdicts([
          { index: 0, verdict: 'artist_photo', alt: 'live shot' },
          { index: 1, verdict: 'album_cover', confidence: 0.9 },
        ])
      );
    const kept = await verifyScrapedImages(
      [candidate('https://a.com/1.png'), candidate('https://a.com/2.png')],
      context,
      config,
      { fetchFn, sleep: async () => {} }
    );
    expect(kept).toHaveLength(2);
    // The confidence-less verdict survives: its default equals the floor and passes the `>=` gate.
    expect(kept[0].url).toBe('https://a.com/1.png');
  });

  it('coerces a stringified confidence and keeps the image', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(imageResponse())
      .mockResolvedValueOnce(
        geminiVerdicts([{ index: 0, verdict: 'album_cover', confidence: '0.8' }])
      );
    const kept = await verifyScrapedImages([candidate('https://a.com/1.png')], context, config, {
      fetchFn,
      sleep: async () => {},
    });
    expect(kept).toHaveLength(1);
    expect(kept[0].kind).toBe('cover');
  });

  it('drops verdicts missing verdict or index while keeping the batch’s valid items', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(imageResponse())
      .mockResolvedValueOnce(imageResponse())
      .mockResolvedValueOnce(imageResponse())
      .mockResolvedValueOnce(
        geminiVerdicts([
          { verdict: 'artist_photo', confidence: 0.9 },
          { index: 1, confidence: 0.9 },
          { index: 2, verdict: 'album_cover', confidence: 0.9 },
        ])
      );
    const kept = await verifyScrapedImages(
      [
        candidate('https://a.com/1.png'),
        candidate('https://a.com/2.png'),
        candidate('https://a.com/3.png'),
      ],
      context,
      config,
      { fetchFn, sleep: async () => {} }
    );
    expect(kept).toHaveLength(1);
    expect(kept[0].url).toBe('https://a.com/3.png');
  });

  it('fails closed on a wholly-unparseable response body: the whole batch is dropped', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(imageResponse())
      .mockResolvedValueOnce(geminiRaw({ notVerdicts: 'garbage' }));
    const kept = await verifyScrapedImages([candidate('https://a.com/1.png')], context, config, {
      fetchFn,
      sleep: async () => {},
      retries: 0,
    });
    expect(kept).toEqual([]);
  });

  it('logs vision_batch_failed for a wholly-unparseable response body', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(imageResponse())
      .mockResolvedValueOnce(geminiRaw({ notVerdicts: 'garbage' }));
    await verifyScrapedImages([candidate('https://a.com/1.png')], context, config, {
      fetchFn,
      sleep: async () => {},
      retries: 0,
    });
    expect(eventsFrom('warn', 'vision_batch_failed')).toHaveLength(1);
  });

  it('emits vision_verdict_salvaged with accurate defaulted, dropped and batchSize counts', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(imageResponse())
      .mockResolvedValueOnce(imageResponse())
      .mockResolvedValueOnce(imageResponse())
      .mockResolvedValueOnce(
        geminiVerdicts([
          { index: 0, verdict: 'artist_photo' },
          { index: 1, confidence: 0.9 },
          { index: 2, verdict: 'album_cover', confidence: 0.9 },
        ])
      );
    await verifyScrapedImages(
      [
        candidate('https://a.com/1.png'),
        candidate('https://a.com/2.png'),
        candidate('https://a.com/3.png'),
      ],
      context,
      config,
      { fetchFn, sleep: async () => {} }
    );
    expect(eventsFrom('info', 'vision_verdict_salvaged')[0]).toMatchObject({
      defaulted: 1,
      dropped: 1,
      batchSize: 3,
    });
  });

  it('does not emit vision_verdict_salvaged for a fully clean batch', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(imageResponse())
      .mockResolvedValueOnce(
        geminiVerdicts([{ index: 0, verdict: 'artist_photo', confidence: 0.9 }])
      );
    await verifyScrapedImages([candidate('https://a.com/1.png')], context, config, {
      fetchFn,
      sleep: async () => {},
    });
    expect(eventsFrom('info', 'vision_verdict_salvaged')).toHaveLength(0);
  });

  it('emits gemini_usage tagged with purpose "vision" for each vision call', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(imageResponse())
      .mockResolvedValueOnce(
        geminiVerdictsWithUsage([{ index: 0, verdict: 'artist_photo', confidence: 0.9 }], {
          promptTokenCount: 1200,
          candidatesTokenCount: 40,
          totalTokenCount: 1240,
        })
      );
    await verifyScrapedImages([candidate('https://a.com/1.png')], context, config, {
      fetchFn,
      sleep: async () => {},
    });
    expect(eventsFrom('info', 'gemini_usage')[0]).toMatchObject({
      purpose: 'vision',
      model: 'gemini-2.5-flash',
      promptTokens: 1200,
      outputTokens: 40,
      totalTokens: 1240,
    });
  });

  it('caps concurrent verify batches at three and aggregates survivors in batch order', async () => {
    const totalBatches = 7;
    const candidates = Array.from({ length: totalBatches * VISION_BATCH_SIZE }, (_, i) =>
      candidate(`https://a.com/${i}.png`)
    );
    let inFlight = 0;
    let maxInFlight = 0;
    let started = 0;
    const fetchFn = vi.fn(async (input: Parameters<typeof fetch>[0]): Promise<Response> => {
      if (!String(input).includes('generativelanguage')) return imageResponse();
      const order = started;
      started += 1;
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      // Earlier-dispatched batches linger longer so batches finish out of dispatch
      // order — proving aggregation follows batch order, not completion order.
      for (let tick = 0; tick < (totalBatches - order) * 3; tick += 1) {
        await Promise.resolve();
      }
      inFlight -= 1;
      // Every batch keeps its own first image, so the survivor's URL identifies the batch.
      return geminiVerdicts([{ index: 0, verdict: 'artist_photo', confidence: 0.9 }]);
    });
    const kept = await verifyScrapedImages(candidates, context, config, {
      fetchFn,
      sleep: async () => {},
    });
    expect(maxInFlight).toBe(3);
    expect(kept.map((image) => image.url)).toEqual(
      Array.from({ length: totalBatches }, (_, k) => `https://a.com/${k * VISION_BATCH_SIZE}.png`)
    );
  });
});
