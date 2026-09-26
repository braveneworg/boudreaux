/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  isImageLinksTask,
  LINK_PROBE_TIMEOUT_MS,
  MAX_LINK_IMAGES,
  runImageLinksLambda,
} from './image-links.js';
import { IMAGE_LINKS_TASK } from './types.js';

import type { ImageLinksDeps } from './image-links.js';
import type { ScrapedImage } from './jina.js';
import type { ImageLinksInput } from './types.js';

const PAGE_LINK = 'https://example.com/press';
const CALLBACK_URL = 'https://web.example.com/api/callback';
const JOB_TOKEN = 'job-token-1';

const scraped = (url: string, overrides: Partial<ScrapedImage> = {}): ScrapedImage => ({
  url,
  alt: null,
  sourceUrl: PAGE_LINK,
  ...overrides,
});

/** A probe response carrying only a content-type (HEAD, or the GET fallback). */
const probeResponse = (contentType: string | null, status = 200): Response =>
  new Response(null, {
    status,
    headers: contentType ? { 'content-type': contentType } : {},
  });

/** A small image body for the candidate byte fetch (Rekognition input). */
const imageBytes = (mimeType = 'image/jpeg'): Response =>
  new Response(new Uint8Array([255, 216, 255, 224]), {
    status: 200,
    headers: { 'content-type': mimeType, 'content-length': '4' },
  });

/** The base64 the module derives from {@link imageBytes} for Rekognition. */
const IMAGE_BYTES_BASE64 = Buffer.from([255, 216, 255, 224]).toString('base64');

/** Classifies a fetch call so a router can answer HEAD probes, GET probes and byte fetches apart. */
const probeKind = (init: RequestInit | undefined): 'head' | 'get-probe' | 'bytes' => {
  if (init?.method === 'HEAD') return 'head';
  const accept = new Headers(init?.headers).get('accept');
  return accept === 'image/*' ? 'get-probe' : 'bytes';
};

interface RouterResponses {
  /** HEAD probe answer per URL; defaults to an HTML page. */
  head?: (url: string) => Response;
  /** GET-with-Accept probe answer per URL; defaults to an HTML page. */
  getProbe?: (url: string) => Response;
  /** Candidate byte fetch per URL; defaults to a JPEG body. */
  bytes?: (url: string) => Response;
}

/** An injectable fetch that routes on the request shape the module sends. */
const fetchRouter = ({ head, getProbe, bytes }: RouterResponses = {}): typeof fetch =>
  vi.fn<typeof fetch>(async (input, init) => {
    const url = String(input);
    switch (probeKind(init)) {
      case 'head':
        return (head ?? (() => probeResponse('text/html; charset=utf-8')))(url);
      case 'get-probe':
        return (getProbe ?? (() => probeResponse('text/html; charset=utf-8')))(url);
      default:
        return (bytes ?? (() => imageBytes()))(url);
    }
  });

const buildDeps = (overrides: Partial<ImageLinksDeps> = {}): ImageLinksDeps => ({
  readUrl: vi.fn().mockResolvedValue(null),
  getScrapeApiKey: vi.fn().mockResolvedValue('scrape-key'),
  fetchReferenceBytes: vi.fn().mockResolvedValue([]),
  annotateFaces: vi.fn(async (candidates) =>
    candidates.map(() => ({ hasFace: null, faceScore: null }))
  ),
  postCallback: vi.fn().mockResolvedValue(undefined),
  fetchFn: fetchRouter(),
  ...overrides,
});

const baseInput: ImageLinksInput = {
  task: IMAGE_LINKS_TASK,
  artistId: 'a'.repeat(24),
  displayName: 'Ceschi',
  links: [PAGE_LINK],
  callbackUrl: CALLBACK_URL,
  jobToken: JOB_TOKEN,
};

/** A read result whose only interesting part is its images. */
const readResult = (images: ScrapedImage[]): { content: string; images: ScrapedImage[] } => ({
  content: 'page text',
  images,
});

describe('isImageLinksTask', () => {
  it('recognizes the task discriminator', () => {
    expect(isImageLinksTask({ task: IMAGE_LINKS_TASK })).toBe(true);
  });

  it('rejects a bio event (no task field)', () => {
    expect(isImageLinksTask({ artistId: 'x', displayName: 'Ceschi' })).toBe(false);
  });

  it('rejects another task discriminator', () => {
    expect(isImageLinksTask({ task: 'video-enrichment' })).toBe(false);
  });

  it('rejects a non-object event', () => {
    expect(isImageLinksTask(IMAGE_LINKS_TASK)).toBe(false);
  });
});

describe('runImageLinksLambda input validation', () => {
  it('posts ok:false to the callback when the event is malformed but carries callback plumbing', async () => {
    const deps = buildDeps();

    const result = await runImageLinksLambda(
      { task: IMAGE_LINKS_TASK, links: [], callbackUrl: CALLBACK_URL, jobToken: JOB_TOKEN },
      deps
    );

    expect(result).toEqual({ ok: false, error: expect.stringMatching(/^Invalid input:/) });
    expect(vi.mocked(deps.postCallback).mock.calls).toEqual([
      [{ url: CALLBACK_URL, jobToken: JOB_TOKEN, result }],
    ]);
    expect(deps.readUrl).not.toHaveBeenCalled();
  });

  it('returns ok:false without a callback when the malformed event has no callback plumbing', async () => {
    const deps = buildDeps();

    const result = await runImageLinksLambda({ task: IMAGE_LINKS_TASK }, deps);

    expect(result.ok).toBe(false);
    expect(deps.postCallback).not.toHaveBeenCalled();
  });
});

describe('runImageLinksLambda page links', () => {
  it('reads a page link through the reader and ships its images as photos with provenance', async () => {
    const deps = buildDeps({
      readUrl: vi
        .fn()
        .mockResolvedValueOnce(
          readResult([scraped('https://cdn.example.com/band.jpg', { alt: 'Band on stage' })])
        ),
    });

    const result = await runImageLinksLambda(baseInput, deps);

    expect(result).toEqual({
      ok: true,
      data: {
        images: [
          {
            url: 'https://cdn.example.com/band.jpg',
            thumbnailUrl: null,
            title: 'Band on stage',
            attribution: 'example.com',
            license: null,
            licenseUrl: null,
            sourceUrl: PAGE_LINK,
            width: null,
            height: null,
            isPrimary: false,
            kind: 'photo',
            hasFace: null,
            faceScore: null,
          },
        ],
      },
    });
    expect(vi.mocked(deps.readUrl).mock.calls).toEqual([[PAGE_LINK, 'scrape-key']]);
  });

  it('posts the callback exactly once with the success payload', async () => {
    const deps = buildDeps({
      readUrl: vi
        .fn()
        .mockResolvedValueOnce(readResult([scraped('https://cdn.example.com/band.jpg')])),
    });

    const result = await runImageLinksLambda(baseInput, deps);

    expect(vi.mocked(deps.postCallback).mock.calls).toEqual([
      [
        {
          url: CALLBACK_URL,
          jobToken: JOB_TOKEN,
          result: {
            ok: true,
            data: {
              images: [expect.objectContaining({ url: 'https://cdn.example.com/band.jpg' })],
            },
          },
        },
      ],
    ]);
    expect(result.ok).toBe(true);
  });

  it('passes a keyless read through when no scrape key is configured', async () => {
    const deps = buildDeps({
      getScrapeApiKey: vi.fn().mockResolvedValueOnce(null),
      readUrl: vi.fn().mockResolvedValueOnce(readResult([])),
    });

    await runImageLinksLambda(baseInput, deps);

    expect(vi.mocked(deps.readUrl).mock.calls).toEqual([[PAGE_LINK, null]]);
  });

  it('contributes nothing from a link the reader could not read', async () => {
    const deps = buildDeps({ readUrl: vi.fn().mockResolvedValueOnce(null) });

    const result = await runImageLinksLambda(baseInput, deps);

    expect(result).toEqual({ ok: true, data: { images: [] } });
    expect(vi.mocked(deps.postCallback).mock.calls).toEqual([
      [{ url: CALLBACK_URL, jobToken: JOB_TOKEN, result: { ok: true, data: { images: [] } } }],
    ]);
  });

  it('does not GET-probe a link whose HEAD already answered with a non-image type', async () => {
    const fetchFn = fetchRouter();
    const deps = buildDeps({ fetchFn, readUrl: vi.fn().mockResolvedValueOnce(readResult([])) });

    await runImageLinksLambda(baseInput, deps);

    const probes = vi.mocked(fetchFn).mock.calls.map(([, init]) => probeKind(init));
    expect(probes).toEqual(['head']);
  });
});

describe('runImageLinksLambda direct image links', () => {
  const IMAGE_LINK = 'https://photos.example.com/ceschi.jpg';

  it('treats a link whose HEAD reports an image content-type as the single candidate and skips the reader', async () => {
    const deps = buildDeps({
      fetchFn: fetchRouter({ head: () => probeResponse('image/jpeg') }),
    });

    const result = await runImageLinksLambda({ ...baseInput, links: [IMAGE_LINK] }, deps);

    expect(result).toEqual({
      ok: true,
      data: {
        images: [
          expect.objectContaining({
            url: IMAGE_LINK,
            title: null,
            attribution: 'photos.example.com',
            sourceUrl: IMAGE_LINK,
            kind: 'photo',
            isPrimary: false,
          }),
        ],
      },
    });
    expect(deps.readUrl).not.toHaveBeenCalled();
  });

  it('falls back to a GET probe with Accept image/* when HEAD throws', async () => {
    const fetchFn = fetchRouter({
      head: () => {
        throw new Error('HEAD refused');
      },
      getProbe: () => probeResponse('image/png'),
    });
    const deps = buildDeps({ fetchFn });

    const result = await runImageLinksLambda({ ...baseInput, links: [IMAGE_LINK] }, deps);

    expect(result.ok && result.data.images.map((image) => image.url)).toEqual([IMAGE_LINK]);
    const probes = vi.mocked(fetchFn).mock.calls.map(([, init]) => probeKind(init));
    expect(probes).toEqual(['head', 'get-probe', 'bytes']);
    expect(deps.readUrl).not.toHaveBeenCalled();
  });

  it('falls back to a GET probe when HEAD answers 405', async () => {
    const fetchFn = fetchRouter({
      head: () => probeResponse(null, 405),
      getProbe: () => probeResponse('image/webp'),
    });
    const deps = buildDeps({ fetchFn });

    const result = await runImageLinksLambda({ ...baseInput, links: [IMAGE_LINK] }, deps);

    expect(result.ok && result.data.images.map((image) => image.url)).toEqual([IMAGE_LINK]);
    expect(deps.readUrl).not.toHaveBeenCalled();
  });

  it('bounds every probe with the link timeout', async () => {
    const fetchFn = fetchRouter({
      head: () => probeResponse(null, 405),
      getProbe: () => probeResponse('image/png'),
    });
    const deps = buildDeps({ fetchFn });

    await runImageLinksLambda({ ...baseInput, links: [IMAGE_LINK] }, deps);

    const probeInits = vi
      .mocked(fetchFn)
      .mock.calls.filter(([, init]) => probeKind(init) !== 'bytes')
      .map(([, init]) => init);
    expect(probeInits).toHaveLength(2);
    for (const init of probeInits) {
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
    expect(LINK_PROBE_TIMEOUT_MS).toBe(8_000);
  });

  it('reads the page when both probes fail to identify an image', async () => {
    const fetchFn = fetchRouter({
      head: () => probeResponse(null, 405),
      getProbe: () => {
        throw new Error('GET refused');
      },
    });
    const deps = buildDeps({
      fetchFn,
      readUrl: vi
        .fn()
        .mockResolvedValueOnce(readResult([scraped('https://cdn.example.com/x.jpg')])),
    });

    const result = await runImageLinksLambda({ ...baseInput, links: [IMAGE_LINK] }, deps);

    expect(vi.mocked(deps.readUrl).mock.calls).toEqual([[IMAGE_LINK, 'scrape-key']]);
    expect(result.ok && result.data.images.map((image) => image.url)).toEqual([
      'https://cdn.example.com/x.jpg',
    ]);
  });
});

describe('runImageLinksLambda dedupe and cap', () => {
  it('dedupes candidates by URL across links, keeping the first occurrence', async () => {
    const second = 'https://example.com/interview';
    const deps = buildDeps({
      readUrl: vi
        .fn()
        .mockResolvedValueOnce(
          readResult([scraped('https://cdn.example.com/a.jpg', { alt: 'first' })])
        )
        .mockResolvedValueOnce(
          readResult([
            scraped('https://cdn.example.com/A.JPG', { alt: 'dupe', sourceUrl: second }),
            scraped('https://cdn.example.com/b.jpg', { sourceUrl: second }),
          ])
        ),
    });

    const result = await runImageLinksLambda({ ...baseInput, links: [PAGE_LINK, second] }, deps);

    expect(
      result.ok &&
        result.data.images.map(({ url, title, sourceUrl }) => ({ url, title, sourceUrl }))
    ).toEqual([
      { url: 'https://cdn.example.com/a.jpg', title: 'first', sourceUrl: PAGE_LINK },
      { url: 'https://cdn.example.com/b.jpg', title: null, sourceUrl: second },
    ]);
  });

  it('reads links in order, one at a time', async () => {
    const order: string[] = [];
    const second = 'https://example.com/interview';
    const deps = buildDeps({
      readUrl: vi.fn(async (url: string) => {
        order.push(url);
        return readResult([]);
      }),
    });

    await runImageLinksLambda({ ...baseInput, links: [PAGE_LINK, second] }, deps);

    expect(order).toEqual([PAGE_LINK, second]);
  });

  it('caps the candidate list and stops reading further links once full', async () => {
    const many = Array.from({ length: MAX_LINK_IMAGES + 5 }, (_, i) =>
      scraped(`https://cdn.example.com/${i}.jpg`)
    );
    const deps = buildDeps({
      readUrl: vi.fn().mockResolvedValueOnce(readResult(many)),
    });

    const result = await runImageLinksLambda(
      { ...baseInput, links: [PAGE_LINK, 'https://example.com/second'] },
      deps
    );

    expect(result.ok && result.data.images).toHaveLength(MAX_LINK_IMAGES);
    expect(vi.mocked(deps.readUrl).mock.calls).toEqual([[PAGE_LINK, 'scrape-key']]);
  });
});

describe('runImageLinksLambda face scoring', () => {
  const REFS = ['https://refs.example.com/1.jpg', 'https://refs.example.com/2.jpg'];

  it('drops candidates whose bytes cannot be fetched', async () => {
    const deps = buildDeps({
      fetchFn: fetchRouter({
        bytes: (url) => (url.endsWith('gone.jpg') ? probeResponse(null, 404) : imageBytes()),
      }),
      readUrl: vi
        .fn()
        .mockResolvedValueOnce(
          readResult([
            scraped('https://cdn.example.com/gone.jpg'),
            scraped('https://cdn.example.com/here.jpg'),
          ])
        ),
    });

    const result = await runImageLinksLambda(baseInput, deps);

    expect(result.ok && result.data.images.map((image) => image.url)).toEqual([
      'https://cdn.example.com/here.jpg',
    ]);
  });

  it('feeds the fetched bytes and the reference bytes to Rekognition and attaches the annotations', async () => {
    const refBytes = [Buffer.from('ref-1'), Buffer.from('ref-2')];
    const deps = buildDeps({
      fetchReferenceBytes: vi.fn().mockResolvedValueOnce(refBytes),
      annotateFaces: vi.fn().mockResolvedValueOnce([
        { hasFace: true, faceScore: 93.5 },
        { hasFace: false, faceScore: null },
      ]),
      readUrl: vi
        .fn()
        .mockResolvedValueOnce(
          readResult([
            scraped('https://cdn.example.com/a.jpg'),
            scraped('https://cdn.example.com/b.jpg'),
          ])
        ),
    });

    const result = await runImageLinksLambda({ ...baseInput, referenceImageUrls: REFS }, deps);

    expect(vi.mocked(deps.fetchReferenceBytes).mock.calls).toEqual([[REFS]]);
    expect(vi.mocked(deps.annotateFaces).mock.calls).toEqual([
      [
        [
          {
            image: expect.objectContaining({ url: 'https://cdn.example.com/a.jpg' }),
            mimeType: 'image/jpeg',
            base64: IMAGE_BYTES_BASE64,
          },
          {
            image: expect.objectContaining({ url: 'https://cdn.example.com/b.jpg' }),
            mimeType: 'image/jpeg',
            base64: IMAGE_BYTES_BASE64,
          },
        ],
        refBytes,
      ],
    ]);
    expect(
      result.ok &&
        result.data.images.map(({ url, hasFace, faceScore }) => ({ url, hasFace, faceScore }))
    ).toEqual([
      { url: 'https://cdn.example.com/a.jpg', hasFace: true, faceScore: 93.5 },
      { url: 'https://cdn.example.com/b.jpg', hasFace: false, faceScore: null },
    ]);
  });

  it('skips the reference fetch and still runs face detection when no references are supplied', async () => {
    const deps = buildDeps({
      readUrl: vi
        .fn()
        .mockResolvedValueOnce(readResult([scraped('https://cdn.example.com/a.jpg')])),
    });

    await runImageLinksLambda(baseInput, deps);

    expect(deps.fetchReferenceBytes).not.toHaveBeenCalled();
    expect(vi.mocked(deps.annotateFaces).mock.calls).toEqual([
      [[expect.objectContaining({ mimeType: 'image/jpeg' })], []],
    ]);
  });

  it('makes no Rekognition call when nothing could be fetched', async () => {
    const deps = buildDeps({
      fetchFn: fetchRouter({ bytes: () => probeResponse(null, 500) }),
      readUrl: vi
        .fn()
        .mockResolvedValueOnce(readResult([scraped('https://cdn.example.com/a.jpg')])),
    });

    const result = await runImageLinksLambda({ ...baseInput, referenceImageUrls: REFS }, deps);

    expect(result).toEqual({ ok: true, data: { images: [] } });
    expect(deps.fetchReferenceBytes).not.toHaveBeenCalled();
    expect(deps.annotateFaces).not.toHaveBeenCalled();
  });

  it('degrades a Rekognition failure to null face signals instead of failing the job', async () => {
    const deps = buildDeps({
      annotateFaces: vi.fn().mockRejectedValueOnce(new Error('rekognition down')),
      readUrl: vi
        .fn()
        .mockResolvedValueOnce(readResult([scraped('https://cdn.example.com/a.jpg')])),
    });

    const result = await runImageLinksLambda(baseInput, deps);

    expect(result).toEqual({
      ok: true,
      data: {
        images: [
          expect.objectContaining({
            url: 'https://cdn.example.com/a.jpg',
            hasFace: null,
            faceScore: null,
          }),
        ],
      },
    });
  });

  it('degrades a reference fetch failure to null face signals instead of failing the job', async () => {
    const deps = buildDeps({
      fetchReferenceBytes: vi.fn().mockRejectedValueOnce(new Error('refs unreachable')),
      readUrl: vi
        .fn()
        .mockResolvedValueOnce(readResult([scraped('https://cdn.example.com/a.jpg')])),
    });

    const result = await runImageLinksLambda({ ...baseInput, referenceImageUrls: REFS }, deps);

    expect(
      result.ok && result.data.images.map(({ hasFace, faceScore }) => ({ hasFace, faceScore }))
    ).toEqual([{ hasFace: null, faceScore: null }]);
    expect(deps.annotateFaces).not.toHaveBeenCalled();
  });
});

describe('runImageLinksLambda failure envelope', () => {
  it('converts a thrown run into an ok:false callback posted exactly once', async () => {
    const deps = buildDeps({
      readUrl: vi.fn().mockRejectedValueOnce(new Error('reader exploded')),
    });

    const result = await runImageLinksLambda(baseInput, deps);

    expect(result).toEqual({ ok: false, error: 'reader exploded' });
    expect(vi.mocked(deps.postCallback).mock.calls).toEqual([
      [{ url: CALLBACK_URL, jobToken: JOB_TOKEN, result: { ok: false, error: 'reader exploded' } }],
    ]);
  });
});
