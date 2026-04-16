/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { invalidateCloudFrontPaths } from './cloudfront-invalidation';

vi.mock('server-only', () => ({}));

const { mockSend } = vi.hoisted(() => ({
  mockSend: vi.fn().mockResolvedValue({}),
}));

vi.mock('@aws-sdk/client-cloudfront', () => ({
  CloudFrontClient: class MockCloudFrontClient {
    send = mockSend;
  },
  CreateInvalidationCommand: class MockCreateInvalidationCommand {
    input: Record<string, unknown>;
    constructor(input: Record<string, unknown>) {
      this.input = input;
    }
  },
}));

describe('invalidateCloudFrontPaths', () => {
  beforeEach(() => {
    vi.stubEnv('CLOUDFRONT_DISTRIBUTION_ID', 'E1234567890');
    vi.stubEnv('AWS_REGION', 'us-east-1');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('should create a CloudFront invalidation for the given paths', async () => {
    await invalidateCloudFrontPaths(['/audio/ceschi/track123.mp3']);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const command = mockSend.mock.calls[0][0];
    expect(command.input).toEqual(
      expect.objectContaining({
        DistributionId: 'E1234567890',
        InvalidationBatch: expect.objectContaining({
          Paths: {
            Quantity: 1,
            Items: ['/audio/ceschi/track123.mp3'],
          },
        }),
      })
    );
  });

  it('should support multiple paths in a single invalidation', async () => {
    const paths = ['/audio/ceschi/track1.mp3', '/audio/ceschi/track2.flac'];
    await invalidateCloudFrontPaths(paths);

    expect(mockSend).toHaveBeenCalledTimes(1);
    const command = mockSend.mock.calls[0][0];
    expect(command.input.InvalidationBatch.Paths).toEqual({
      Quantity: 2,
      Items: paths,
    });
  });

  it('should throw when CLOUDFRONT_DISTRIBUTION_ID is not configured', async () => {
    delete process.env.CLOUDFRONT_DISTRIBUTION_ID;

    await expect(invalidateCloudFrontPaths(['/audio/test.mp3'])).rejects.toThrow(
      'CLOUDFRONT_DISTRIBUTION_ID environment variable is not configured'
    );
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('should throw when paths array is empty', async () => {
    await expect(invalidateCloudFrontPaths([])).rejects.toThrow(
      'At least one path is required for invalidation'
    );
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('should propagate errors from CloudFront API', async () => {
    mockSend.mockRejectedValueOnce(new Error('AccessDenied'));

    await expect(invalidateCloudFrontPaths(['/audio/test.mp3'])).rejects.toThrow('AccessDenied');
  });

  it('should use a unique CallerReference for each invocation', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1000);
      await invalidateCloudFrontPaths(['/path1']);
      vi.setSystemTime(2000);
      await invalidateCloudFrontPaths(['/path2']);

      const ref1 = mockSend.mock.calls[0][0].input.InvalidationBatch.CallerReference;
      const ref2 = mockSend.mock.calls[1][0].input.InvalidationBatch.CallerReference;

      expect(ref1).not.toBe(ref2);
      expect(ref1).toMatch(/^invalidation-\d+$/);
    } finally {
      vi.useRealTimers();
    }
  });

  it('should default to us-east-1 region when AWS_REGION is not set', async () => {
    delete process.env.AWS_REGION;

    await invalidateCloudFrontPaths(['/audio/test.mp3']);

    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});
