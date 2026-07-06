/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { createHash } from 'crypto';

import type * as ImageQualityModule from '@/lib/utils/image-quality';
import { loggers } from '@/lib/utils/logger';

import { BioImageService } from './bio-image-service';

vi.mock('server-only', () => ({}));

const sendMock = vi.fn();
vi.mock('@aws-sdk/client-s3', () => ({
  PutObjectCommand: class {
    constructor(public input: unknown) {}
  },
}));
vi.mock('@/lib/utils/s3-client', () => ({
  getS3Client: () => ({ send: sendMock }),
  getS3BucketName: () => 'test-bucket',
}));

const generateVariantsMock = vi.fn();
vi.mock('@/lib/utils/image-variants', () => ({
  generateVariantsFromBuffer: (buffer: Buffer, key: string) => generateVariantsMock(buffer, key),
}));

vi.mock('@/lib/utils/cdn-url', () => ({
  buildCdnUrl: (key: string) => `https://cdn.example.com/${key}`,
}));

const isPubliclyRoutableUrlMock = vi.fn();
vi.mock('@/lib/utils/ip-guard', () => ({
  isPubliclyRoutableUrl: (url: string) => isPubliclyRoutableUrlMock(url),
}));

const assessImageQualityMock = vi.fn();
vi.mock('@/lib/utils/image-quality', async (importOriginal) => ({
  ...((await importOriginal()) as typeof ImageQualityModule),
  assessImageQuality: (buffer: Buffer) => assessImageQualityMock(buffer),
}));

const mockSharpInstance = {
  resize: vi.fn().mockReturnThis(),
  webp: vi.fn().mockReturnThis(),
  toBuffer: vi.fn(),
};
vi.mock('sharp', () => ({
  default: vi.fn(() => mockSharpInstance),
}));

const imageResponse = (): Response =>
  new Response(new Uint8Array([1, 2, 3, 4]), {
    status: 200,
    headers: { 'Content-Type': 'image/jpeg' },
  });

beforeEach(() => {
  isPubliclyRoutableUrlMock.mockResolvedValue(true);
  sendMock.mockResolvedValue({});
  generateVariantsMock.mockResolvedValue({ variantsGenerated: 14, width: 1200, height: 800 });
  mockSharpInstance.toBuffer.mockResolvedValue({
    data: Buffer.from('webp-data'),
    info: { width: 384, height: 256 },
  });
  assessImageQualityMock.mockImplementation((buffer: Buffer) => ({
    width: 800,
    height: 600,
    sharpness: 500,
    // sha256-derived 64-bit dHash: identical buffers hash identically (those
    // are caught by the exact-SHA-256 dedupe first), distinct buffers land far
    // apart in Hamming space so they are not treated as near-duplicates.
    dHash: BigInt(`0x${createHash('sha256').update(buffer).digest('hex').slice(0, 16)}`),
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('BioImageService.rehostWithVariants', () => {
  it('no-ops and returns the source URL in fake/E2E mode', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', 'true');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await BioImageService.rehostWithVariants('https://x/a.jpg', 'artist-1', 0);

    expect(result).toEqual({ url: 'https://x/a.jpg', width: null, height: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uploads the original, generates variants, and returns a CDN URL', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', '');
    vi.stubEnv('E2E_MODE', '');
    vi.stubEnv('NEXT_PUBLIC_E2E_MODE', '');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(imageResponse()));

    const result = await BioImageService.rehostWithVariants(
      'https://upload.wikimedia.org/a.jpg',
      'artist-1',
      0
    );

    expect(sendMock).toHaveBeenCalledTimes(1); // PutObject for the original
    const [, key] = generateVariantsMock.mock.calls[0];
    expect(key).toMatch(/^media\/artists\/artist-1\/bio\/0-[a-f0-9]{8}\.jpg$/);
    expect(result.url).toBe(`https://cdn.example.com/${key}`);
    expect(result.width).toBe(1200);
  });

  it('throws when the fetch fails', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', '');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 404 })));

    await expect(
      BioImageService.rehostWithVariants('https://x/a.jpg', 'artist-1', 0)
    ).rejects.toThrow('Failed to fetch image (404)');
  });

  it('throws when the content is not an image', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', '');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response('<html>', { status: 200, headers: { 'Content-Type': 'text/html' } })
        )
    );

    await expect(
      BioImageService.rehostWithVariants('https://x/a.html', 'artist-1', 0)
    ).rejects.toThrow('Source is not an image');
  });

  it('no-ops in E2E_MODE', async () => {
    vi.stubEnv('E2E_MODE', 'true');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await BioImageService.rehostWithVariants('https://x/a.jpg', 'artist-1', 1);

    expect(result).toEqual({ url: 'https://x/a.jpg', width: null, height: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('no-ops in NEXT_PUBLIC_E2E_MODE', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', '');
    vi.stubEnv('E2E_MODE', '');
    vi.stubEnv('NEXT_PUBLIC_E2E_MODE', 'true');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await BioImageService.rehostWithVariants('https://x/a.jpg', 'artist-1', 2);

    expect(result).toEqual({ url: 'https://x/a.jpg', width: null, height: null });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('throws when the image exceeds the 50MB limit', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', '');
    vi.stubEnv('E2E_MODE', '');
    vi.stubEnv('NEXT_PUBLIC_E2E_MODE', '');
    const oversized = new Uint8Array(50 * 1024 * 1024 + 1);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(oversized, { status: 200, headers: { 'Content-Type': 'image/jpeg' } })
        )
    );

    await expect(
      BioImageService.rehostWithVariants('https://x/a.jpg', 'artist-1', 0)
    ).rejects.toThrow('Source image exceeds the 50MB limit');
  });

  it('derives the extension from the URL when no content-type header is present', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', '');
    vi.stubEnv('E2E_MODE', '');
    vi.stubEnv('NEXT_PUBLIC_E2E_MODE', '');
    // No Content-Type header → resolveExtension falls back to the URL pathname.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 }))
    );

    const result = await BioImageService.rehostWithVariants(
      'https://upload.example.org/photo.PNG',
      'artist-9',
      3
    );

    const [, key] = generateVariantsMock.mock.calls[0];
    expect(key).toMatch(/^media\/artists\/artist-9\/bio\/3-[a-f0-9]{8}\.png$/);
    expect(result.url).toBe(`https://cdn.example.com/${key}`);
  });

  it('defaults to .jpg when neither the content-type nor the URL yields an extension', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', '');
    vi.stubEnv('E2E_MODE', '');
    vi.stubEnv('NEXT_PUBLIC_E2E_MODE', '');
    // No content-type, and a URL path without an extension → final '.jpg' default.
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 }))
    );

    const result = await BioImageService.rehostWithVariants(
      'https://upload.example.org/no-extension-here',
      'artist-7',
      4
    );

    const [, key] = generateVariantsMock.mock.calls[0];
    expect(key).toMatch(/^media\/artists\/artist-7\/bio\/4-[a-f0-9]{8}\.jpg$/);
    expect(result.url).toBe(`https://cdn.example.com/${key}`);
  });

  it('fetches with redirect: "error" so a vetted URL cannot 302 elsewhere', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', '');
    vi.stubEnv('E2E_MODE', '');
    vi.stubEnv('NEXT_PUBLIC_E2E_MODE', '');
    const fetchMock = vi.fn().mockResolvedValue(imageResponse());
    vi.stubGlobal('fetch', fetchMock);

    await BioImageService.rehostWithVariants('https://x/a.jpg', 'artist-1', 0);

    expect(fetchMock).toHaveBeenCalledWith('https://x/a.jpg', { redirect: 'error' });
  });

  it('never uploads when the source responds with a redirect', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', '');
    vi.stubEnv('E2E_MODE', '');
    vi.stubEnv('NEXT_PUBLIC_E2E_MODE', '');
    // Mirror undici: under redirect:'error' a 3xx rejects the fetch, while a
    // fetch that still follows (the pre-fix default) resolves with the image
    // the redirect target served — which must never reach S3.
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) =>
        init?.redirect === 'error'
          ? Promise.reject(new TypeError('fetch failed: unexpected redirect'))
          : Promise.resolve(imageResponse())
      )
    );

    await expect(
      BioImageService.rehostWithVariants('https://x/redirects.jpg', 'artist-1', 0)
    ).rejects.toThrow();
    expect(sendMock).not.toHaveBeenCalled();
    expect(generateVariantsMock).not.toHaveBeenCalled();
  });

  it('rejects a private-address URL before any fetch is issued', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', '');
    vi.stubEnv('E2E_MODE', '');
    vi.stubEnv('NEXT_PUBLIC_E2E_MODE', '');
    isPubliclyRoutableUrlMock.mockResolvedValue(false);
    const fetchMock = vi.fn().mockResolvedValue(imageResponse());
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      BioImageService.rehostWithVariants('http://192.168.1.10/a.jpg', 'artist-1', 0)
    ).rejects.toThrow('not publicly routable');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('never uploads a localhost-sourced image', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', '');
    vi.stubEnv('E2E_MODE', '');
    vi.stubEnv('NEXT_PUBLIC_E2E_MODE', '');
    isPubliclyRoutableUrlMock.mockResolvedValue(false);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(imageResponse()));

    await expect(
      BioImageService.rehostWithVariants('http://localhost:8080/a.jpg', 'artist-1', 0)
    ).rejects.toThrow();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('uploads with an octet-stream content type when the header is absent', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', '');
    vi.stubEnv('E2E_MODE', '');
    vi.stubEnv('NEXT_PUBLIC_E2E_MODE', '');
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200 }))
    );

    await BioImageService.rehostWithVariants('https://x/no-extension', 'artist-1', 0);

    const putInput = sendMock.mock.calls[0][0].input as { ContentType: string };
    expect(putInput.ContentType).toBe('application/octet-stream');
  });
});

describe('BioImageService.rehostImages', () => {
  beforeEach(() => {
    vi.stubEnv('BIO_GENERATOR_FAKE', '');
    vi.stubEnv('E2E_MODE', '');
    vi.stubEnv('NEXT_PUBLIC_E2E_MODE', '');
  });

  it('uploads both images when their buffers are distinct', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(new Uint8Array([1, 2, 3]), {
            status: 200,
            headers: { 'Content-Type': 'image/jpeg' },
          })
        )
        .mockResolvedValueOnce(
          new Response(new Uint8Array([4, 5, 6]), {
            status: 200,
            headers: { 'Content-Type': 'image/jpeg' },
          })
        )
    );

    const result = await BioImageService.rehostImages(
      [
        { url: 'https://x/a.jpg', index: 0 },
        { url: 'https://x/b.jpg', index: 1 },
      ],
      'artist-1'
    );

    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(result.results).toHaveLength(2);
    expect(result.results[0]).not.toBeNull();
    expect(result.results[1]).not.toBeNull();
  });

  it('skips the duplicate when two images have identical content', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(new Uint8Array([9, 8, 7]), {
            status: 200,
            headers: { 'Content-Type': 'image/jpeg' },
          })
        )
        .mockResolvedValueOnce(
          new Response(new Uint8Array([9, 8, 7]), {
            status: 200,
            headers: { 'Content-Type': 'image/jpeg' },
          })
        )
    );

    const result = await BioImageService.rehostImages(
      [
        { url: 'https://x/a.jpg', index: 0 },
        { url: 'https://x/b.jpg', index: 1 },
      ],
      'artist-1'
    );

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(result.results[0]).not.toBeNull();
    expect(result.results[1]).toBeNull();
  });

  it('returns null for an image whose fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 404 })));

    const result = await BioImageService.rehostImages(
      [{ url: 'https://x/a.jpg', index: 0 }],
      'artist-1'
    );

    expect(sendMock).not.toHaveBeenCalled();
    expect(result.results).toEqual([null]);
  });

  it('earlier-index image survives deduplication even when its fetch resolves last', async () => {
    const sameBuffer = new Uint8Array([9, 8, 7]);

    // Deferred promise for index 0 — we control when it resolves.
    let resolveFirst!: (r: Response) => void;
    const firstFetch = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });

    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        // index 0 (attributed Commons image) — resolves LAST via the deferred
        .mockImplementationOnce(() => firstFetch)
        // index 1 (scraped copy) — resolves immediately
        .mockImplementationOnce(() =>
          Promise.resolve(
            new Response(sameBuffer, {
              status: 200,
              headers: { 'Content-Type': 'image/jpeg' },
            })
          )
        )
    );

    const pending = BioImageService.rehostImages(
      [
        { url: 'https://commons.example.com/a.jpg', index: 0 },
        { url: 'https://scraped.example.com/a.jpg', index: 1 },
      ],
      'artist-1'
    );

    // Drain the microtask queue so the index-1 fetch resolves and progresses
    // through fetchImageBuffer (two await points: fetch + arrayBuffer) to the
    // seenHashes check, reproducing the race in the current Promise.all path.
    for (let i = 0; i < 10; i++) {
      await Promise.resolve();
    }

    // Now resolve index-0's fetch so it arrives LAST.
    resolveFirst(
      new Response(sameBuffer, {
        status: 200,
        headers: { 'Content-Type': 'image/jpeg' },
      })
    );

    const result = await pending;

    // Index 0 must survive — it is the first copy by INPUT order.
    expect(result.results.at(0)).not.toBeNull();
    // Index 1 is a byte-identical duplicate and must be dropped.
    expect(result.results.at(1)).toBeNull();
    // Exactly one S3 upload for the surviving copy.
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('skips a redirecting source without uploading anything', async () => {
    // Same undici-mirroring stub as the rehostWithVariants redirect test:
    // redirect:'error' rejects on a 3xx; the pre-fix default would follow.
    vi.stubGlobal(
      'fetch',
      vi.fn((_url: string, init?: RequestInit) =>
        init?.redirect === 'error'
          ? Promise.reject(new TypeError('fetch failed: unexpected redirect'))
          : Promise.resolve(imageResponse())
      )
    );

    const result = await BioImageService.rehostImages(
      [{ url: 'https://x/redirects.jpg', index: 0 }],
      'artist-1'
    );

    expect(result.results).toEqual([null]);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('never fetches a lambda-supplied URL that resolves to a private address', async () => {
    isPubliclyRoutableUrlMock.mockResolvedValue(false);
    const fetchMock = vi.fn().mockResolvedValue(imageResponse());
    vi.stubGlobal('fetch', fetchMock);

    const result = await BioImageService.rehostImages(
      [{ url: 'http://10.0.0.5/internal.jpg', index: 0 }],
      'artist-1'
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.results).toEqual([null]);
  });

  it('never uploads when the source is the cloud metadata endpoint', async () => {
    isPubliclyRoutableUrlMock.mockResolvedValue(false);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(imageResponse()));

    await BioImageService.rehostImages(
      [{ url: 'http://169.254.169.254/latest/meta-data', index: 0 }],
      'artist-1'
    );

    expect(sendMock).not.toHaveBeenCalled();
  });

  it('vets each batched URL through the ip guard before fetching', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(imageResponse()));

    await BioImageService.rehostImages([{ url: 'https://x/a.jpg', index: 0 }], 'artist-1');

    expect(isPubliclyRoutableUrlMock).toHaveBeenCalledWith('https://x/a.jpg');
  });

  it('returns source urls without deduplication in skip-rehost mode', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', 'true');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await BioImageService.rehostImages(
      [
        { url: 'https://x/a.jpg', index: 0 },
        { url: 'https://x/a.jpg', index: 1 },
      ],
      'artist-1'
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.results).toEqual([
      { url: 'https://x/a.jpg', width: null, height: null },
      { url: 'https://x/a.jpg', width: null, height: null },
    ]);
  });

  it('never runs more than 8 fetches concurrently', async () => {
    let inFlight = 0;
    let peak = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(async () => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((resolve) => setTimeout(resolve, 5));
        inFlight -= 1;
        return new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        });
      })
    );

    const images = Array.from({ length: 20 }, (_, i) => ({
      url: `https://x/${i}.jpg`,
      index: i,
    }));

    await BioImageService.rehostImages(images, 'artist-1');

    expect(peak).toBeLessThanOrEqual(8);
  });

  it('drops an image below the resolution floor and uploads nothing for it', async () => {
    assessImageQualityMock.mockResolvedValueOnce({
      width: 100,
      height: 100,
      sharpness: 500,
      dHash: 1n,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(imageResponse()));

    const { results, duplicateAliases } = await BioImageService.rehostImages(
      [{ url: 'https://x/small.jpg', index: 0 }],
      'artist-1'
    );

    expect(results).toEqual([null]);
    expect(duplicateAliases.size).toBe(0);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('drops a blurry image below the sharpness floor', async () => {
    assessImageQualityMock.mockResolvedValueOnce({
      width: 800,
      height: 600,
      sharpness: 5,
      dHash: 1n,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(imageResponse()));

    const { results, duplicateAliases } = await BioImageService.rehostImages(
      [{ url: 'https://x/blurry.jpg', index: 0 }],
      'artist-1'
    );

    expect(results).toEqual([null]);
    expect(duplicateAliases.size).toBe(0);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('aliases a perceptual near-duplicate to the surviving copy', async () => {
    // Two byte-distinct images (so SHA-256 does NOT collide) whose dHashes are
    // 1 bit apart -> within NEAR_DUPLICATE_MAX_DISTANCE.
    assessImageQualityMock
      .mockResolvedValueOnce({ width: 800, height: 600, sharpness: 500, dHash: 0b1010n })
      .mockResolvedValueOnce({ width: 800, height: 600, sharpness: 500, dHash: 0b1011n });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 1, 1, 1]), {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        })
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([2, 2, 2, 2]), {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const { results, duplicateAliases } = await BioImageService.rehostImages(
      [
        { url: 'https://x/a.jpg', index: 0 },
        { url: 'https://x/b.jpg', index: 1 },
      ],
      'artist-1'
    );

    expect(results[0]).not.toBeNull();
    expect(results[1]).toBeNull();
    expect(duplicateAliases.get(1)).toBe(results[0]?.url);
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('keeps two perceptually-distinct images', async () => {
    assessImageQualityMock
      .mockResolvedValueOnce({ width: 800, height: 600, sharpness: 500, dHash: 0n })
      .mockResolvedValueOnce({
        width: 800,
        height: 600,
        sharpness: 500,
        dHash: (1n << 64n) - 1n,
      });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 1, 1, 1]), {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        })
      )
      .mockResolvedValueOnce(
        new Response(new Uint8Array([2, 2, 2, 2]), {
          status: 200,
          headers: { 'Content-Type': 'image/jpeg' },
        })
      );
    vi.stubGlobal('fetch', fetchMock);

    const { results, duplicateAliases } = await BioImageService.rehostImages(
      [
        { url: 'https://x/a.jpg', index: 0 },
        { url: 'https://x/b.jpg', index: 1 },
      ],
      'artist-1'
    );

    expect(results[0]).not.toBeNull();
    expect(results[1]).not.toBeNull();
    expect(duplicateAliases.size).toBe(0);
    expect(sendMock).toHaveBeenCalledTimes(2);
  });

  it('logs a rehost summary counting accepted images and each drop reason', async () => {
    const infoSpy = vi.spyOn(loggers.media, 'info');
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValueOnce(
          new Response(new Uint8Array([1, 2, 3]), {
            status: 200,
            headers: { 'Content-Type': 'image/jpeg' },
          })
        )
        .mockResolvedValueOnce(
          new Response(new Uint8Array([4, 5, 6]), {
            status: 200,
            headers: { 'Content-Type': 'image/jpeg' },
          })
        )
    );

    await BioImageService.rehostImages(
      [
        { url: 'https://x/a.jpg', index: 0 },
        { url: 'https://x/b.jpg', index: 1 },
      ],
      'artist-1'
    );

    expect(infoSpy).toHaveBeenCalledWith(
      'bio_image_rehost_summary',
      expect.objectContaining({
        input: 2,
        accepted: 2,
        fetchFailed: 0,
        exactDuplicate: 0,
        lowQuality: 0,
        nearDuplicate: 0,
      })
    );
    infoSpy.mockRestore();
  });
});
