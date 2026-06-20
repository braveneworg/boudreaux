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

const imageResponse = (): Response =>
  new Response(new Uint8Array([1, 2, 3, 4]), {
    status: 200,
    headers: { 'Content-Type': 'image/jpeg' },
  });

beforeEach(() => {
  sendMock.mockResolvedValue({});
  generateVariantsMock.mockResolvedValue({ variantsGenerated: 14, width: 1200, height: 800 });
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
});
