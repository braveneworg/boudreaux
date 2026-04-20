/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { generateImageVariantsAction } from './generate-image-variants-action';
import { requireRole } from '../utils/auth/require-role';

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
function fakeS3Body(buffer: Buffer): AsyncIterable<Uint8Array> {
  return {
    async *[Symbol.asyncIterator]() {
      yield new Uint8Array(buffer);
    },
  };
}

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

  it('generates variants for all device sizes smaller than the original', async () => {
    const result = await generateImageVariantsAction(
      'https://cdn.fakefourrecords.com/media/releases/coverart/album-cover.jpg'
    );

    expect(result.success).toBe(true);
    // Original is 2000px wide → all 5 device sizes (640, 750, 828, 1080, 1200) are smaller
    expect(result.variantsGenerated).toBe(5);

    // 1 GetObject + 5 PutObject calls
    expect(mockS3Send).toHaveBeenCalledTimes(6);
  });

  it('skips widths larger than or equal to the original', async () => {
    mockSharpInstance.metadata.mockResolvedValue({ width: 800, height: 600 });

    const result = await generateImageVariantsAction(
      'https://cdn.fakefourrecords.com/media/releases/coverart/small.jpg'
    );

    expect(result.success).toBe(true);
    // 800px original → only 640 and 750 are smaller
    expect(result.variantsGenerated).toBe(2);
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

  it('generates no variants when original is smaller than all device sizes', async () => {
    mockSharpInstance.metadata.mockResolvedValue({ width: 320, height: 240 });

    const result = await generateImageVariantsAction(
      'https://cdn.fakefourrecords.com/media/releases/coverart/tiny.jpg'
    );

    expect(result.success).toBe(true);
    expect(result.variantsGenerated).toBe(0);
    // Only 1 GetObject, no PutObject calls
    expect(mockS3Send).toHaveBeenCalledTimes(1);
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
      ContentLength: 21 * 1024 * 1024,
    });

    const result = await generateImageVariantsAction(
      'https://cdn.fakefourrecords.com/media/releases/coverart/large.jpg'
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('Source image exceeds 20MB limit');
  });
});
