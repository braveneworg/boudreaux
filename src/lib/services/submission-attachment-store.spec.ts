/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

import { localStoreObject } from '@/lib/actions/upload-local-adapter';
import { invalidateCloudFrontPaths } from '@/lib/utils/cloudfront-invalidation';

import { attachmentStore } from './submission-attachment-store';

vi.mock('server-only', () => ({}));

interface SentCommand {
  name: string;
  input: Record<string, unknown>;
}

const mockSend = vi.hoisted(() => vi.fn());
const mockLoggerError = vi.hoisted(() => vi.fn());

vi.mock('@aws-sdk/client-s3', () => {
  const command = (name: string) =>
    class {
      readonly name = name;
      constructor(readonly input: Record<string, unknown>) {}
    };

  return {
    S3Client: class {
      send = mockSend;
    },
    PutObjectCommand: command('PutObject'),
    GetObjectCommand: command('GetObject'),
    HeadObjectCommand: command('HeadObject'),
    CopyObjectCommand: command('CopyObject'),
    DeleteObjectsCommand: command('DeleteObjects'),
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({ getSignedUrl: vi.fn() }));

vi.mock('@/lib/utils/cloudfront-invalidation', () => ({
  invalidateCloudFrontPaths: vi.fn(),
}));

vi.mock('@/lib/utils/logger', () => ({
  loggers: { s3: { error: mockLoggerError, warn: vi.fn(), info: vi.fn() } },
}));

const SUBMISSION_ID = 'a'.repeat(24);
const ATTACHMENT_ID = 'b'.repeat(24);
const UPLOAD_KEY = `uploads/${SUBMISSION_ID}/3f0c9a52-6a1d-4d1e-9a51-0c1d2e3f4a5b`;
const COPY_KEY = `copies/${SUBMISSION_ID}/${ATTACHMENT_ID}/copy.jpg`;
const CARD_KEY = `copies/${SUBMISSION_ID}/${ATTACHMENT_ID}/card.webp`;
const PUBLISHED_COPY = `media/submissions/${SUBMISSION_ID}/${ATTACHMENT_ID}/copy.jpg`;
const PUBLISHED_CARD = `media/submissions/${SUBMISSION_ID}/${ATTACHMENT_ID}/card.webp`;

const sent = (): SentCommand[] => mockSend.mock.calls.map(([command]) => command as SentCommand);
const sentNamed = (name: string): SentCommand[] =>
  sent().filter((command) => command.name === name);

/** The command a presign was asked to sign, and for how long. */
const signed = (): { command: SentCommand; expiresIn: number | undefined } => {
  const [, command, options] = vi.mocked(getSignedUrl).mock.calls[0] ?? [];

  return { command: command as unknown as SentCommand, expiresIn: options?.expiresIn };
};

beforeEach(() => {
  mockSend.mockReset().mockResolvedValue({});
  mockLoggerError.mockReset();
  vi.mocked(getSignedUrl).mockReset().mockResolvedValue('https://signed.example/object');
  vi.mocked(invalidateCloudFrontPaths).mockReset().mockResolvedValue();
  vi.stubEnv('E2E_MODE', '');
  vi.stubEnv('NEXT_PUBLIC_E2E_MODE', '');
  vi.stubEnv('AWS_ACCESS_KEY_ID', 'test-key-id');
  vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'test-secret-key');
  vi.stubEnv('AWS_REGION', 'us-east-1');
  vi.stubEnv('AWS_S3_BUCKET_NAME', 'media-bucket');
  vi.stubEnv('S3_BUCKET', '');
  vi.stubEnv('SUBMISSION_UPLOADS_BUCKET', 'private-bucket');
  vi.stubEnv('CLOUDFRONT_DISTRIBUTION_ID', 'DIST123');
  vi.stubEnv('CDN_DOMAIN', 'cdn.example.com');
  vi.stubEnv('NEXT_PUBLIC_CDN_DOMAIN', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('attachmentStore on S3', () => {
  describe('isConfigured', () => {
    it('is configured when the private bucket is named', () => {
      expect(attachmentStore.isConfigured()).toBe(true);
    });

    it('is not configured without the private bucket', () => {
      vi.stubEnv('SUBMISSION_UPLOADS_BUCKET', '');

      expect(attachmentStore.isConfigured()).toBe(false);
    });
  });

  describe('presignUpload', () => {
    const target = { key: UPLOAD_KEY, contentType: 'image/png', contentLength: 1234 };

    it('answers the signed URL', async () => {
      await expect(attachmentStore.presignUpload(target)).resolves.toBe(
        'https://signed.example/object'
      );
    });

    it('signs a PUT of that key into the private bucket', async () => {
      await attachmentStore.presignUpload(target);

      expect(signed().command).toMatchObject({
        name: 'PutObject',
        input: { Bucket: 'private-bucket', Key: UPLOAD_KEY },
      });
    });

    it('signs the declared length and type, so S3 refuses any other body', async () => {
      await attachmentStore.presignUpload(target);

      expect(signed().command.input).toMatchObject({
        ContentType: 'image/png',
        ContentLength: 1234,
      });
    });

    it('signs for fifteen minutes', async () => {
      await attachmentStore.presignUpload(target);

      expect(signed().expiresIn).toBe(900);
    });
  });

  describe('headUpload', () => {
    it('answers the stored size and type', async () => {
      mockSend.mockResolvedValueOnce({ ContentLength: 1234, ContentType: 'image/png' });

      await expect(attachmentStore.headUpload(UPLOAD_KEY)).resolves.toEqual({
        bytes: 1234,
        contentType: 'image/png',
      });
    });

    it('reads the private bucket', async () => {
      mockSend.mockResolvedValueOnce({ ContentLength: 1234, ContentType: 'image/png' });

      await attachmentStore.headUpload(UPLOAD_KEY);

      expect(sentNamed('HeadObject').at(0)?.input).toEqual({
        Bucket: 'private-bucket',
        Key: UPLOAD_KEY,
      });
    });

    it('answers null when the object is not there', async () => {
      mockSend.mockRejectedValueOnce(new Error('NotFound'));

      await expect(attachmentStore.headUpload(UPLOAD_KEY)).resolves.toBeNull();
    });

    it('answers null for an object with no length', async () => {
      mockSend.mockResolvedValueOnce({ ContentType: 'image/png' });

      await expect(attachmentStore.headUpload(UPLOAD_KEY)).resolves.toBeNull();
    });
  });

  describe('previewUrl', () => {
    it('signs a read of the private copy', async () => {
      await attachmentStore.previewUrl(COPY_KEY);

      expect(signed().command).toMatchObject({
        name: 'GetObject',
        input: { Bucket: 'private-bucket', Key: COPY_KEY },
      });
    });

    it('signs for an hour', async () => {
      await attachmentStore.previewUrl(COPY_KEY);

      expect(signed().expiresIn).toBe(3600);
    });
  });

  describe('publicUrl', () => {
    it('is the CDN address of the published key', () => {
      expect(attachmentStore.publicUrl(COPY_KEY)).toBe(`https://cdn.example.com/${PUBLISHED_COPY}`);
    });
  });

  describe('publish', () => {
    it('copies each private file to its published key in the media bucket', async () => {
      await attachmentStore.publish([COPY_KEY, CARD_KEY]);

      expect(sentNamed('CopyObject').map(({ input }) => input)).toEqual([
        {
          Bucket: 'media-bucket',
          Key: PUBLISHED_COPY,
          CopySource: `private-bucket/${COPY_KEY}`,
          MetadataDirective: 'COPY',
        },
        {
          Bucket: 'media-bucket',
          Key: PUBLISHED_CARD,
          CopySource: `private-bucket/${CARD_KEY}`,
          MetadataDirective: 'COPY',
        },
      ]);
    });

    it('rejects when a copy fails', async () => {
      mockSend.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('AccessDenied'));

      await expect(attachmentStore.publish([COPY_KEY, CARD_KEY])).rejects.toThrow('AccessDenied');
    });

    it('removes what it published when a copy fails', async () => {
      mockSend.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('AccessDenied'));

      await attachmentStore.publish([COPY_KEY, CARD_KEY]).catch(() => undefined);

      expect(sentNamed('DeleteObjects').at(0)?.input).toEqual({
        Bucket: 'media-bucket',
        Delete: { Objects: [{ Key: PUBLISHED_COPY }, { Key: PUBLISHED_CARD }], Quiet: true },
      });
    });

    it('copies nothing for a submission without files', async () => {
      await attachmentStore.publish([]);

      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('unpublish', () => {
    it('deletes the published files from the media bucket', async () => {
      await attachmentStore.unpublish([COPY_KEY, CARD_KEY]);

      expect(sentNamed('DeleteObjects').at(0)?.input).toEqual({
        Bucket: 'media-bucket',
        Delete: { Objects: [{ Key: PUBLISHED_COPY }, { Key: PUBLISHED_CARD }], Quiet: true },
      });
    });

    it('asks the CDN to drop them', async () => {
      await attachmentStore.unpublish([COPY_KEY, CARD_KEY]);

      expect(invalidateCloudFrontPaths).toHaveBeenCalledWith([
        `/${PUBLISHED_COPY}`,
        `/${PUBLISHED_CARD}`,
      ]);
    });

    it('skips the CDN when no distribution is configured', async () => {
      vi.stubEnv('CLOUDFRONT_DISTRIBUTION_ID', '');

      await attachmentStore.unpublish([COPY_KEY]);

      expect(invalidateCloudFrontPaths).not.toHaveBeenCalled();
    });

    it('still resolves when the CDN refuses, and logs it', async () => {
      const error = new Error('Throttled');
      vi.mocked(invalidateCloudFrontPaths).mockRejectedValueOnce(error);

      await expect(attachmentStore.unpublish([COPY_KEY])).resolves.toBeUndefined();
      expect(mockLoggerError).toHaveBeenCalledWith(
        '[attachment store] CDN invalidation failed',
        error
      );
    });

    it('does nothing for a submission without files', async () => {
      await attachmentStore.unpublish([]);

      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('deletePrivate', () => {
    it('deletes the files from the private bucket', async () => {
      await attachmentStore.deletePrivate([UPLOAD_KEY, COPY_KEY]);

      expect(sentNamed('DeleteObjects').at(0)?.input).toEqual({
        Bucket: 'private-bucket',
        Delete: { Objects: [{ Key: UPLOAD_KEY }, { Key: COPY_KEY }], Quiet: true },
      });
    });

    it('does nothing for an empty list', async () => {
      await attachmentStore.deletePrivate([]);

      expect(mockSend).not.toHaveBeenCalled();
    });
  });

  describe('bucket', () => {
    it('names the private bucket', () => {
      expect(attachmentStore.bucket()).toBe('private-bucket');
    });
  });
});

describe('attachmentStore under E2E', () => {
  beforeEach(() => {
    vi.stubEnv('E2E_MODE', 'true');
    vi.stubEnv('NEXT_PUBLIC_BASE_URL', 'http://localhost:3000');
    vi.stubEnv('SUBMISSION_UPLOADS_BUCKET', '');
  });

  it('is configured without a bucket', () => {
    expect(attachmentStore.isConfigured()).toBe(true);
  });

  it('hands out the local sink in place of a presigned URL', async () => {
    const url = await attachmentStore.presignUpload({
      key: UPLOAD_KEY,
      contentType: 'image/png',
      contentLength: 3,
    });

    expect(url).toBe(
      `http://localhost:3000/api/test-harness/upload-sink?key=${encodeURIComponent(UPLOAD_KEY)}`
    );
  });

  it('reads an upload back from the local sink', async () => {
    localStoreObject(UPLOAD_KEY, { body: new ArrayBuffer(3), contentType: 'image/png' });

    await expect(attachmentStore.headUpload(UPLOAD_KEY)).resolves.toEqual({
      bytes: 3,
      contentType: 'image/png',
    });
  });

  it('answers null for an upload the sink never received', async () => {
    await expect(
      attachmentStore.headUpload(`uploads/${SUBMISSION_ID}/never-uploaded-file`)
    ).resolves.toBeNull();
  });

  it('previews a copy at its CDN address, which the suite routes locally', async () => {
    await expect(attachmentStore.previewUrl(COPY_KEY)).resolves.toBe(
      `https://cdn.example.com/${PUBLISHED_COPY}`
    );
  });

  it('never reaches S3 to publish, unpublish or delete', async () => {
    await attachmentStore.publish([COPY_KEY]);
    await attachmentStore.unpublish([COPY_KEY]);
    await attachmentStore.deletePrivate([COPY_KEY]);

    expect(mockSend).not.toHaveBeenCalled();
  });
});
