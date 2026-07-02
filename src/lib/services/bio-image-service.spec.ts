/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

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
  sendMock.mockResolvedValue({});
  generateVariantsMock.mockResolvedValue({ variantsGenerated: 14, width: 1200, height: 800 });
  mockSharpInstance.toBuffer.mockResolvedValue({
    data: Buffer.from('webp-data'),
    info: { width: 384, height: 256 },
  });
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
    expect(result).toHaveLength(2);
    expect(result[0]).not.toBeNull();
    expect(result[1]).not.toBeNull();
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
    expect(result[0]).not.toBeNull();
    expect(result[1]).toBeNull();
  });

  it('returns null for an image whose fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 404 })));

    const result = await BioImageService.rehostImages(
      [{ url: 'https://x/a.jpg', index: 0 }],
      'artist-1'
    );

    expect(sendMock).not.toHaveBeenCalled();
    expect(result).toEqual([null]);
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
    expect(result.at(0)).not.toBeNull();
    // Index 1 is a byte-identical duplicate and must be dropped.
    expect(result.at(1)).toBeNull();
    // Exactly one S3 upload for the surviving copy.
    expect(sendMock).toHaveBeenCalledTimes(1);
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
    expect(result).toEqual([
      { url: 'https://x/a.jpg', width: null, height: null },
      { url: 'https://x/a.jpg', width: null, height: null },
    ]);
  });
});

describe('BioImageService.rehostThumbnail', () => {
  it('uploads a single 384px webp and returns its CDN URL', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', '');
    vi.stubEnv('E2E_MODE', '');
    vi.stubEnv('NEXT_PUBLIC_E2E_MODE', '');
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(imageResponse()));

    const result = await BioImageService.rehostThumbnail('https://ex.com/big.jpg', 'artist1', 0);

    expect(sendMock).toHaveBeenCalledTimes(1); // exactly one object — no variants
    const putInput = sendMock.mock.calls[0][0].input as { Key: string; ContentType: string };
    expect(putInput.Key).toMatch(/^media\/artists\/artist1\/bio\/thumbs\/0-[a-f0-9]{8}\.webp$/);
    expect(putInput.ContentType).toBe('image/webp');
    expect(result.url).toContain('/media/artists/artist1/bio/thumbs/');
  });

  it('skips upload in fake/E2E mode and echoes the source URL', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', 'true');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const result = await BioImageService.rehostThumbnail('https://ex.com/big.jpg', 'artist1', 0);

    expect(result).toEqual({ url: 'https://ex.com/big.jpg', width: null, height: null });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendMock).not.toHaveBeenCalled();
  });
});
