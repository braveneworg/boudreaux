/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { IMAGE_VARIANT_DEVICE_SIZES } from '@/lib/constants/image-variants';
import { requireRole } from '@/utils/auth/require-role';

import { generateImageVariantsAction } from './generate-image-variants-action';

const SIZE_COUNT = IMAGE_VARIANT_DEVICE_SIZES.length;

vi.mock('server-only', () => ({}));
vi.mock('../utils/auth/require-role');

const mockS3Send = vi.fn();
vi.mock('@/lib/utils/s3-client', () => ({
  getS3Client: () => ({ send: mockS3Send }),
  getS3BucketName: () => 'test-bucket',
}));

const mockSharpInstance = {
  metadata: vi.fn(),
  resize: vi.fn().mockReturnThis(),
  clone: vi.fn().mockReturnThis(),
  webp: vi.fn().mockReturnThis(),
  toBuffer: vi.fn(),
};
vi.mock('sharp', () => ({
  default: vi.fn(() => mockSharpInstance),
}));

vi.mock('mime', () => ({
  default: { getType: vi.fn(() => 'image/jpeg') },
}));

/**
 * Helper to create a fake S3 GetObject response body (async iterable).
 */
const fakeS3Body = (buffer: Buffer): AsyncIterable<Uint8Array> => ({
  async *[Symbol.asyncIterator]() {
    yield new Uint8Array(buffer);
  },
});

describe('generateImageVariantsAction', () => {
  const imageBuffer = Buffer.from('fake-image-data');
  const resizedBuffer = Buffer.from('resized');

  beforeEach(() => {
    vi.mocked(requireRole).mockResolvedValue({ user: { role: 'admin' } } as never);
    mockS3Send.mockReset();
    mockSharpInstance.metadata.mockReset();
    mockSharpInstance.toBuffer.mockReset();

    // Default: GetObject returns a valid body, PutObject succeeds
    mockS3Send.mockResolvedValue({ Body: fakeS3Body(imageBuffer) });
    mockSharpInstance.metadata.mockResolvedValue({ width: 2000, height: 1500 });
    mockSharpInstance.toBuffer.mockResolvedValue(resizedBuffer);
  });

  it('requires admin role', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

    await expect(
      generateImageVariantsAction(
        'https://cdn.fakefourrecords.com/media/releases/coverart/album-cover.jpg'
      )
    ).rejects.toThrow('Unauthorized');

    expect(requireRole).toHaveBeenCalledWith('admin');
  });

  it('generates JPG + WebP variants for every device size, regardless of original width', async () => {
    const result = await generateImageVariantsAction(
      'https://cdn.fakefourrecords.com/media/releases/coverart/album-cover.jpg'
    );

    expect(result.success).toBe(true);
    // Each device size emits an original-format + WebP sibling.
    expect(result.variantsGenerated).toBe(SIZE_COUNT * 2);

    // 1 GetObject + (SIZE_COUNT * 2) PutObject calls
    expect(mockS3Send).toHaveBeenCalledTimes(1 + SIZE_COUNT * 2);
  });

  it('still produces every variant when the original is smaller than every device size', async () => {
    // `withoutEnlargement: true` clamps sharp output to the original's dims;
    // each `_w{N}` URL still resolves to a valid (smaller) image so the
    // browser srcset never 403s.
    mockSharpInstance.metadata.mockResolvedValue({ width: 320, height: 240 });

    const result = await generateImageVariantsAction(
      'https://cdn.fakefourrecords.com/media/releases/coverart/tiny.jpg'
    );

    expect(result.success).toBe(true);
    // Each size emits an original-format + WebP sibling.
    expect(result.variantsGenerated).toBe(SIZE_COUNT * 2);
    expect(mockS3Send).toHaveBeenCalledTimes(1 + SIZE_COUNT * 2);
  });

  it('does not emit WebP sibling when the original is already WebP', async () => {
    const result = await generateImageVariantsAction(
      'https://cdn.fakefourrecords.com/media/banners/hero.webp'
    );

    expect(result.success).toBe(true);
    // Only original-format (webp) variants — no transcoded sibling
    expect(result.variantsGenerated).toBe(SIZE_COUNT);
    expect(mockS3Send).toHaveBeenCalledTimes(1 + SIZE_COUNT);
  });

  it('emits a WebP sibling with image/webp content type', async () => {
    mockSharpInstance.metadata.mockResolvedValue({ width: 700, height: 500 });

    await generateImageVariantsAction(
      'https://cdn.fakefourrecords.com/media/releases/coverart/album-cover.jpg'
    );

    // Each size emits jpg + webp PutObject calls + 1 GetObject for the source.
    expect(mockS3Send).toHaveBeenCalledTimes(1 + SIZE_COUNT * 2);

    const putCalls = mockS3Send.mock.calls.slice(1).map(([cmd]) => cmd.input ?? cmd);
    expect(putCalls).toContainEqual(
      expect.objectContaining({
        Key: 'media/releases/coverart/album-cover_w640.jpg',
        ContentType: 'image/jpeg',
      })
    );
    expect(putCalls).toContainEqual(
      expect.objectContaining({
        Key: 'media/releases/coverart/album-cover_w640.webp',
        ContentType: 'image/webp',
      })
    );
    expect(putCalls).toContainEqual(
      expect.objectContaining({
        Key: 'media/releases/coverart/album-cover_w1200.jpg',
      })
    );
  });

  it('skips SVG files', async () => {
    const result = await generateImageVariantsAction(
      'https://cdn.fakefourrecords.com/media/icons/logo.svg'
    );

    expect(result.success).toBe(true);
    expect(result.variantsGenerated).toBe(0);
    // Should not call S3 at all
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  it('skips GIF files', async () => {
    const result = await generateImageVariantsAction(
      'https://cdn.fakefourrecords.com/media/releases/coverart/animated.gif'
    );

    expect(result.success).toBe(true);
    expect(result.variantsGenerated).toBe(0);
  });

  it('returns error when S3 body is empty', async () => {
    mockS3Send.mockResolvedValue({ Body: undefined });

    const result = await generateImageVariantsAction(
      'https://cdn.fakefourrecords.com/media/releases/coverart/missing.jpg'
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('Empty response body from S3');
  });

  it('returns error when image width cannot be determined', async () => {
    mockSharpInstance.metadata.mockResolvedValue({ width: undefined });

    const result = await generateImageVariantsAction(
      'https://cdn.fakefourrecords.com/media/releases/coverart/broken.jpg'
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('Could not determine image width');
  });

  it('returns error on S3 download failure', async () => {
    mockS3Send.mockRejectedValue(new Error('Access Denied'));

    const result = await generateImageVariantsAction(
      'https://cdn.fakefourrecords.com/media/releases/coverart/private.jpg'
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('Access Denied');
  });

  it('extracts S3 key correctly from CDN URL', async () => {
    await generateImageVariantsAction(
      'https://cdn.fakefourrecords.com/media/releases/coverart/test-1234-abc.jpg'
    );

    // The GetObjectCommand should have the correct key
    const getCall = mockS3Send.mock.calls[0][0];
    expect(getCall.params ?? getCall.input ?? getCall).toMatchObject({
      Bucket: 'test-bucket',
      Key: 'media/releases/coverart/test-1234-abc.jpg',
    });
  });

  it('returns error when key is outside media prefix', async () => {
    const result = await generateImageVariantsAction(
      'https://cdn.fakefourrecords.com/uploads/releases/coverart/private.jpg'
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('Image key must start with "media/"');
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  it('skips keys that are already width variants', async () => {
    const result = await generateImageVariantsAction(
      'https://cdn.fakefourrecords.com/media/releases/coverart/album-cover_w1080.jpg'
    );

    expect(result.success).toBe(true);
    expect(result.variantsGenerated).toBe(0);
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  it('returns error when source image content-length exceeds safety limit', async () => {
    mockS3Send.mockResolvedValue({
      Body: fakeS3Body(imageBuffer),
      ContentLength: 51 * 1024 * 1024,
    });

    const result = await generateImageVariantsAction(
      'https://cdn.fakefourrecords.com/media/releases/coverart/large.jpg'
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('Source image exceeds 50MB limit');
  });

  it('returns "Invalid image key" when CDN URL has empty path', async () => {
    const result = await generateImageVariantsAction('https://cdn.fakefourrecords.com/');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid image key');
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  it('returns "Invalid image key" for an empty CDN URL', async () => {
    const result = await generateImageVariantsAction('');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid image key');
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  it('returns "Invalid image key" for an absurdly long CDN URL', async () => {
    const result = await generateImageVariantsAction(`https://cdn.example.com/${'a'.repeat(2100)}`);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Invalid image key');
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  it('treats non-URL strings as raw S3 keys', async () => {
    // The catch in extractS3Key falls back to stripping the leading slash —
    // so a bare/relative key is still validated and rejected for not having
    // the media/ prefix.
    const result = await generateImageVariantsAction('not a url');

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/must start with/);
  });

  it('emits variants for files without an extension (dot === -1 path)', async () => {
    mockSharpInstance.metadata.mockResolvedValue({ width: 800, height: 600 });

    const result = await generateImageVariantsAction(
      'https://cdn.fakefourrecords.com/media/releases/coverart/no-ext-file'
    );

    expect(result.success).toBe(true);
    // Files with no extension still go through the WebP-transcode loop
    // (extension '' is not in SKIP nor WEBP_TRANSCODE sets), so we get one
    // PUT per device size + the GetObject.
    expect(mockS3Send).toHaveBeenCalledTimes(1 + SIZE_COUNT);
  });

  it('returns "Unknown error" when an unexpected non-Error value is thrown', async () => {
    mockS3Send.mockRejectedValue('string-thrown');

    const result = await generateImageVariantsAction(
      'https://cdn.fakefourrecords.com/media/releases/coverart/bad.jpg'
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('Unknown error');
  });

  it('aborts during streaming when accumulated bytes exceed the safety limit', async () => {
    // No ContentLength header — forces the per-chunk safety check at L152
    // to be the path that catches the overflow.
    const huge = Buffer.alloc(60 * 1024 * 1024);
    mockS3Send.mockResolvedValue({ Body: fakeS3Body(huge) });

    const result = await generateImageVariantsAction(
      'https://cdn.fakefourrecords.com/media/releases/coverart/huge.jpg'
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('Source image exceeds 50MB limit');
  });

  it('falls back to application/octet-stream when mime cannot resolve the extension', async () => {
    // Force mime.getType to return null so the `?? 'application/octet-stream'`
    // fallback runs.
    const mime = (await import('mime')).default;
    vi.mocked(mime.getType).mockReturnValueOnce(null);
    mockSharpInstance.metadata.mockResolvedValue({ width: 800, height: 600 });

    const result = await generateImageVariantsAction(
      'https://cdn.fakefourrecords.com/media/releases/coverart/album.jpg'
    );

    expect(result.success).toBe(true);
    const putCalls = mockS3Send.mock.calls.slice(1).map(([cmd]) => cmd.input ?? cmd);
    // At least one PUT used the octet-stream fallback content type.
    expect(putCalls).toContainEqual(
      expect.objectContaining({ ContentType: 'application/octet-stream' })
    );
  });
});
