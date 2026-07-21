/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { auth } from '@/auth';
import {
  VIDEO_MAX_FILE_SIZE,
  VIDEO_MAX_PARTS,
  VIDEO_PART_SIZE,
} from '@/lib/constants/video-uploads';
import { requireRole } from '@/lib/utils/auth/require-role';
import { loggers } from '@/lib/utils/logger';

import {
  LOCAL_PART_SINK_PATH,
  localObjectExists,
  localRecordPart,
} from './multipart-local-adapters';
import {
  abortVideoUploadAction,
  completeVideoUploadAction,
  initiateVideoUploadAction,
  presignVideoPartsAction,
} from './multipart-upload-actions';

vi.mock('server-only', () => ({}));
vi.mock('@/auth');
vi.mock('@/lib/utils/auth/require-role');
vi.mock('@/lib/utils/logger', () => ({
  loggers: {
    s3: {
      info: vi.fn(),
      debug: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      operationStart: vi.fn(),
      operationComplete: vi.fn(),
      operationFailed: vi.fn(),
    },
  },
}));

const { mockSend, mockGetSignedUrl } = vi.hoisted(() => ({
  mockSend: vi.fn(),
  mockGetSignedUrl: vi.fn(),
}));

vi.mock('@/lib/utils/s3-client', () => ({
  getS3Client: vi.fn(() => ({ send: mockSend })),
  getS3BucketName: vi.fn(() => 'test-bucket'),
}));

interface CommandParams {
  params: Record<string, unknown>;
}

vi.mock('@aws-sdk/client-s3', () => ({
  CreateMultipartUploadCommand: class {
    constructor(public params: Record<string, unknown>) {}
  },
  UploadPartCommand: class {
    constructor(public params: Record<string, unknown>) {}
  },
  CompleteMultipartUploadCommand: class {
    constructor(public params: Record<string, unknown>) {}
  },
  AbortMultipartUploadCommand: class {
    constructor(public params: Record<string, unknown>) {}
  },
  HeadObjectCommand: class {
    constructor(public params: Record<string, unknown>) {}
  },
}));

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: (...args: unknown[]) => mockGetSignedUrl(...args),
}));

const VALID_VIDEO_ID = 'a'.repeat(24);
const VALID_KEY = `media/videos/${VALID_VIDEO_ID}/clip-123-abc.mp4`;
const mockSession = { user: { id: 'user-123', role: 'admin', email: 'admin@example.com' } };

/** Read the constructor params of the nth command handed to `s3Client.send`. */
const sentCommand = (index: number): CommandParams =>
  mockSend.mock.calls.at(index)?.[0] as CommandParams;

beforeEach(() => {
  vi.mocked(requireRole).mockResolvedValue(mockSession as never);
  vi.mocked(auth).mockResolvedValue(mockSession as never);
  mockSend.mockResolvedValue({ UploadId: 'test-upload-id', ContentLength: 12345 });
  mockGetSignedUrl.mockResolvedValue('https://s3.amazonaws.com/signed-part-url?sig=abc');
});

describe('initiateVideoUploadAction', () => {
  const validInput = {
    videoId: VALID_VIDEO_ID,
    fileName: 'clip.mp4',
    contentType: 'video/mp4',
    fileSize: 2 * VIDEO_PART_SIZE,
  };

  it('returns an error when the caller is not an admin', async () => {
    vi.mocked(requireRole).mockRejectedValue(Error('Unauthorized'));

    const result = await initiateVideoUploadAction(validInput);

    expect(result.success).toBe(false);
  });

  it('makes no S3 call when the caller is not an admin', async () => {
    vi.mocked(requireRole).mockRejectedValue(Error('Unauthorized'));

    await initiateVideoUploadAction(validInput);

    expect(mockSend).not.toHaveBeenCalled();
  });

  it('returns an authentication error when the session is missing', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const result = await initiateVideoUploadAction(validInput);

    expect(result.error).toBe('Authentication required');
  });

  it('rejects an invalid ObjectId without calling S3', async () => {
    const result = await initiateVideoUploadAction({ ...validInput, videoId: 'bad-id' });

    expect(result.success).toBe(false);
  });

  it('rejects a video/quicktime upload with a friendly message', async () => {
    const result = await initiateVideoUploadAction({
      ...validInput,
      fileName: 'clip.mov',
      contentType: 'video/quicktime',
    });

    expect(result.error).toContain('MP4');
  });

  it('rejects a zero-byte file', async () => {
    const result = await initiateVideoUploadAction({ ...validInput, fileSize: 0 });

    expect(result.success).toBe(false);
  });

  it('rejects a file larger than the 5 GB maximum', async () => {
    const result = await initiateVideoUploadAction({
      ...validInput,
      fileSize: VIDEO_MAX_FILE_SIZE + 1,
    });

    expect(result.success).toBe(false);
  });

  it('returns the namespaced S3 key on success', async () => {
    const result = await initiateVideoUploadAction(validInput);

    expect(result.data?.s3Key).toContain(`media/videos/${VALID_VIDEO_ID}/`);
  });

  it('returns the S3 upload id on success', async () => {
    const result = await initiateVideoUploadAction(validInput);

    expect(result.data?.uploadId).toBe('test-upload-id');
  });

  it('returns the configured part size on success', async () => {
    const result = await initiateVideoUploadAction(validInput);

    expect(result.data?.partSize).toBe(VIDEO_PART_SIZE);
  });

  it('computes the part count for an exact multiple of the part size', async () => {
    const result = await initiateVideoUploadAction({
      ...validInput,
      fileSize: 3 * VIDEO_PART_SIZE,
    });

    expect(result.data?.partCount).toBe(3);
  });

  it('rounds the part count up when there is a remainder', async () => {
    const result = await initiateVideoUploadAction({
      ...validInput,
      fileSize: 2 * VIDEO_PART_SIZE + 1,
    });

    expect(result.data?.partCount).toBe(3);
  });

  it('falls back to an mp4 extension when the file name has none', async () => {
    const result = await initiateVideoUploadAction({ ...validInput, fileName: 'clip.' });

    expect(result.data?.s3Key).toMatch(/\.mp4$/);
  });

  it('sanitizes a hostile extension so it cannot inject a path segment', async () => {
    const result = await initiateVideoUploadAction({ ...validInput, fileName: 'clip.mp4/evil' });

    expect(result.data?.s3Key).toMatch(/\.mp4$/);
  });

  it('keeps the injected key to a single object segment under the video id', async () => {
    const result = await initiateVideoUploadAction({ ...validInput, fileName: 'clip.mp4/evil' });

    const suffix = result.data?.s3Key?.slice(`media/videos/${VALID_VIDEO_ID}/`.length);
    expect(suffix).not.toContain('/');
  });

  it('sends the ContentType to S3', async () => {
    await initiateVideoUploadAction(validInput);

    expect(sentCommand(0).params.ContentType).toBe('video/mp4');
  });

  it('sends an immutable CacheControl to S3', async () => {
    await initiateVideoUploadAction(validInput);

    expect(sentCommand(0).params.CacheControl).toBe('public, max-age=31536000, immutable');
  });

  it('tags the object metadata with the videos entity type', async () => {
    await initiateVideoUploadAction(validInput);

    const metadata = sentCommand(0).params.Metadata as Record<string, string>;
    expect(metadata.entityType).toBe('videos');
  });

  it('tags the object metadata with the video id', async () => {
    await initiateVideoUploadAction(validInput);

    const metadata = sentCommand(0).params.Metadata as Record<string, string>;
    expect(metadata.entityId).toBe(VALID_VIDEO_ID);
  });

  it('tags the object metadata with the original file name', async () => {
    await initiateVideoUploadAction(validInput);

    const metadata = sentCommand(0).params.Metadata as Record<string, string>;
    expect(metadata.originalFileName).toBe('clip.mp4');
  });

  it('returns an error when S3 omits the upload id', async () => {
    mockSend.mockResolvedValueOnce({});

    const result = await initiateVideoUploadAction(validInput);

    expect(result.success).toBe(false);
  });

  it('returns an error when the SDK send fails', async () => {
    mockSend.mockRejectedValueOnce(new Error('create failed'));

    const result = await initiateVideoUploadAction(validInput);

    expect(result.error).toContain('create failed');
  });
});

describe('presignVideoPartsAction', () => {
  const validInput = { s3Key: VALID_KEY, uploadId: 'upload-123', partNumbers: [1, 2, 3] };

  it('returns an error when the caller is not an admin', async () => {
    vi.mocked(requireRole).mockRejectedValue(Error('Unauthorized'));

    const result = await presignVideoPartsAction(validInput);

    expect(result.success).toBe(false);
  });

  it('makes no signing call when the caller is not an admin', async () => {
    vi.mocked(requireRole).mockRejectedValue(Error('Unauthorized'));

    await presignVideoPartsAction(validInput);

    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  it('returns an authentication error when the session is missing', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const result = await presignVideoPartsAction(validInput);

    expect(result.error).toBe('Authentication required');
  });

  it('rejects a key outside the media/videos prefix', async () => {
    const result = await presignVideoPartsAction({
      ...validInput,
      s3Key: `media/audio/${VALID_VIDEO_ID}/clip.mp4`,
    });

    expect(result.error).toContain('Invalid S3 key');
  });

  it('makes no signing call for a key outside the prefix', async () => {
    await presignVideoPartsAction({
      ...validInput,
      s3Key: `media/audio/${VALID_VIDEO_ID}/clip.mp4`,
    });

    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  it('rejects a key containing path traversal', async () => {
    const result = await presignVideoPartsAction({
      ...validInput,
      s3Key: `media/videos/${VALID_VIDEO_ID}/../secret.mp4`,
    });

    expect(result.error).toContain('Invalid S3 key');
  });

  it('rejects a part number below one', async () => {
    const result = await presignVideoPartsAction({ ...validInput, partNumbers: [0] });

    expect(result.success).toBe(false);
  });

  it('rejects a part number above the maximum', async () => {
    const result = await presignVideoPartsAction({
      ...validInput,
      partNumbers: [VIDEO_MAX_PARTS + 1],
    });

    expect(result.success).toBe(false);
  });

  it('rejects a batch larger than the batch limit', async () => {
    const result = await presignVideoPartsAction({
      ...validInput,
      partNumbers: [1, 2, 3, 4, 5, 6],
    });

    expect(result.success).toBe(false);
  });

  it('returns one signed url per requested part', async () => {
    const result = await presignVideoPartsAction(validInput);

    expect(result.data).toHaveLength(3);
  });

  it('pairs each signed url with its part number', async () => {
    const result = await presignVideoPartsAction(validInput);

    expect(result.data?.[0]).toEqual({ partNumber: 1, url: expect.any(String) });
  });

  it('signs each part with the 15-minute upload expiry', async () => {
    await presignVideoPartsAction(validInput);

    const options = mockGetSignedUrl.mock.calls[0][2] as { expiresIn: number };
    expect(options.expiresIn).toBe(900);
  });

  it('builds each UploadPartCommand with the requested s3 key', async () => {
    await presignVideoPartsAction(validInput);

    const keys = mockGetSignedUrl.mock.calls.map((call) => (call[1] as CommandParams).params.Key);
    expect(keys).toEqual([VALID_KEY, VALID_KEY, VALID_KEY]);
  });

  it('builds each UploadPartCommand with the upload id', async () => {
    await presignVideoPartsAction(validInput);

    const uploadIds = mockGetSignedUrl.mock.calls.map(
      (call) => (call[1] as CommandParams).params.UploadId
    );
    expect(uploadIds).toEqual(['upload-123', 'upload-123', 'upload-123']);
  });

  it('builds one UploadPartCommand per requested part number', async () => {
    await presignVideoPartsAction(validInput);

    const partNumbers = mockGetSignedUrl.mock.calls.map(
      (call) => (call[1] as CommandParams).params.PartNumber
    );
    expect(partNumbers).toEqual([1, 2, 3]);
  });

  it('returns an error when signing fails', async () => {
    mockGetSignedUrl.mockRejectedValueOnce(new Error('sign failed'));

    const result = await presignVideoPartsAction(validInput);

    expect(result.success).toBe(false);
  });

  it('reports an unknown error when a non-Error value is thrown', async () => {
    mockGetSignedUrl.mockRejectedValueOnce('boom');

    const result = await presignVideoPartsAction(validInput);

    expect(result.error).toContain('Unknown error');
  });
});

describe('completeVideoUploadAction', () => {
  const validInput = {
    s3Key: VALID_KEY,
    uploadId: 'upload-123',
    parts: [
      { partNumber: 3, eTag: 'etag-3' },
      { partNumber: 1, eTag: 'etag-1' },
      { partNumber: 2, eTag: 'etag-2' },
    ],
  };

  it('returns an error when the caller is not an admin', async () => {
    vi.mocked(requireRole).mockRejectedValue(Error('Unauthorized'));

    const result = await completeVideoUploadAction(validInput);

    expect(result.success).toBe(false);
  });

  it('makes no S3 call when the caller is not an admin', async () => {
    vi.mocked(requireRole).mockRejectedValue(Error('Unauthorized'));

    await completeVideoUploadAction(validInput);

    expect(mockSend).not.toHaveBeenCalled();
  });

  it('returns an authentication error when the session is missing', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const result = await completeVideoUploadAction(validInput);

    expect(result.error).toBe('Authentication required');
  });

  it('rejects a malformed completion payload', async () => {
    const result = await completeVideoUploadAction({ ...validInput, uploadId: '' });

    expect(result.success).toBe(false);
  });

  it('rejects a key outside the media/videos prefix', async () => {
    const result = await completeVideoUploadAction({
      ...validInput,
      s3Key: `media/audio/${VALID_VIDEO_ID}/clip.mp4`,
    });

    expect(result.error).toContain('Invalid S3 key');
  });

  it('rejects a key containing path traversal', async () => {
    const result = await completeVideoUploadAction({
      ...validInput,
      s3Key: `media/videos/${VALID_VIDEO_ID}/../secret.mp4`,
    });

    expect(result.error).toContain('Invalid S3 key');
  });

  it('sends the parts sorted by ascending part number', async () => {
    await completeVideoUploadAction(validInput);

    const upload = sentCommand(0).params.MultipartUpload as {
      Parts: Array<{ PartNumber: number }>;
    };
    expect(upload.Parts.map((part) => part.PartNumber)).toEqual([1, 2, 3]);
  });

  it('maps each part to its S3 ETag', async () => {
    await completeVideoUploadAction(validInput);

    const upload = sentCommand(0).params.MultipartUpload as {
      Parts: Array<{ PartNumber: number; ETag: string }>;
    };
    expect(upload.Parts[0]).toEqual({ PartNumber: 1, ETag: 'etag-1' });
  });

  it('returns an error when the complete command fails', async () => {
    mockSend.mockRejectedValueOnce(new Error('complete failed'));

    const result = await completeVideoUploadAction(validInput);

    expect(result.error).toContain('complete failed');
  });

  it('returns an error when the HEAD verification throws', async () => {
    mockSend.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('not found'));

    const result = await completeVideoUploadAction(validInput);

    expect(result.success).toBe(false);
  });

  it('returns an error when the object reports no content length', async () => {
    mockSend.mockResolvedValueOnce({}).mockResolvedValueOnce({});

    const result = await completeVideoUploadAction(validInput);

    expect(result.success).toBe(false);
  });

  it('returns the authoritative file size from the HEAD response', async () => {
    mockSend.mockResolvedValueOnce({}).mockResolvedValueOnce({ ContentLength: 987654 });

    const result = await completeVideoUploadAction(validInput);

    expect(result.data?.fileSize).toBe(987654);
  });

  it('returns the s3 key on success', async () => {
    mockSend.mockResolvedValueOnce({}).mockResolvedValueOnce({ ContentLength: 10 });

    const result = await completeVideoUploadAction(validInput);

    expect(result.data?.s3Key).toBe(VALID_KEY);
  });
});

describe('abortVideoUploadAction', () => {
  const validInput = { s3Key: VALID_KEY, uploadId: 'upload-123' };

  it('returns an error when the caller is not an admin', async () => {
    vi.mocked(requireRole).mockRejectedValue(Error('Unauthorized'));

    const result = await abortVideoUploadAction(validInput);

    expect(result.success).toBe(false);
  });

  it('makes no S3 call when the caller is not an admin', async () => {
    vi.mocked(requireRole).mockRejectedValue(Error('Unauthorized'));

    await abortVideoUploadAction(validInput);

    expect(mockSend).not.toHaveBeenCalled();
  });

  it('returns an authentication error when the session is missing', async () => {
    vi.mocked(auth).mockResolvedValue(null as never);

    const result = await abortVideoUploadAction(validInput);

    expect(result.error).toBe('Authentication required');
  });

  it('rejects a malformed abort payload', async () => {
    const result = await abortVideoUploadAction({ ...validInput, uploadId: '' });

    expect(result.success).toBe(false);
  });

  it('rejects a key outside the media/videos prefix', async () => {
    const result = await abortVideoUploadAction({
      ...validInput,
      s3Key: `media/audio/${VALID_VIDEO_ID}/clip.mp4`,
    });

    expect(result.error).toContain('Invalid S3 key');
  });

  it('rejects a key containing path traversal', async () => {
    const result = await abortVideoUploadAction({
      ...validInput,
      s3Key: `media/videos/${VALID_VIDEO_ID}/../secret.mp4`,
    });

    expect(result.error).toContain('Invalid S3 key');
  });

  it('aborts the multipart upload on the happy path', async () => {
    const result = await abortVideoUploadAction(validInput);

    expect(result.success).toBe(true);
  });

  it('sends the upload id to S3 when aborting', async () => {
    await abortVideoUploadAction(validInput);

    expect(sentCommand(0).params.UploadId).toBe('upload-123');
  });

  it('still succeeds when the SDK abort fails', async () => {
    mockSend.mockRejectedValueOnce(new Error('abort failed'));

    const result = await abortVideoUploadAction(validInput);

    expect(result.success).toBe(true);
  });

  it('logs the failure when the SDK abort fails', async () => {
    mockSend.mockRejectedValueOnce(new Error('abort failed'));

    await abortVideoUploadAction(validInput);

    expect(loggers.s3.error).toHaveBeenCalled();
  });
});

/**
 * Local (E2E) mode: the four actions substitute the S3 SDK for the local
 * adapters, and nothing else about them changes. The adapters are NOT mocked
 * here — these tests drive a whole upload through them the way the browser
 * does, so the seam is exercised end to end.
 */
describe('multipart actions — local mode', () => {
  const initiateInput = {
    videoId: VALID_VIDEO_ID,
    fileName: 'local-clip.mp4',
    contentType: 'video/mp4',
    fileSize: 12,
  };

  /** Run the full local flow, returning the key, upload id, and part ETags. */
  const runLocalUpload = async (
    partBodies: string[]
  ): Promise<{
    s3Key: string;
    uploadId: string;
    parts: Array<{ partNumber: number; eTag: string }>;
  }> => {
    const initiated = await initiateVideoUploadAction(initiateInput);
    if (!initiated.success || !initiated.data) throw new Error('initiate failed');
    const { s3Key, uploadId } = initiated.data;
    const parts = partBodies.map((text, index) => ({
      partNumber: index + 1,
      eTag:
        localRecordPart({
          uploadId,
          partNumber: index + 1,
          body: new TextEncoder().encode(text),
        }) ?? '',
    }));
    return { s3Key, uploadId, parts };
  };

  beforeEach(() => {
    vi.stubEnv('E2E_MODE', 'true');
  });

  it('initiates without calling S3', async () => {
    await initiateVideoUploadAction(initiateInput);

    expect(mockSend).not.toHaveBeenCalled();
  });

  it('returns a key under the video namespace', async () => {
    const result = await initiateVideoUploadAction(initiateInput);

    expect(result.data?.s3Key.startsWith(`media/videos/${VALID_VIDEO_ID}/`)).toBe(true);
  });

  it('returns the same part sizing the real path does', async () => {
    const result = await initiateVideoUploadAction(initiateInput);

    expect(result.data?.partSize).toBe(VIDEO_PART_SIZE);
  });

  it('still enforces the admin gate', async () => {
    vi.mocked(requireRole).mockRejectedValue(Error('Unauthorized'));

    const result = await initiateVideoUploadAction(initiateInput);

    expect(result.success).toBe(false);
  });

  it('still rejects a video/quicktime upload', async () => {
    const result = await initiateVideoUploadAction({
      ...initiateInput,
      fileName: 'clip.mov',
      contentType: 'video/quicktime',
    });

    expect(result.error).toContain('MP4');
  });

  it('presigns part URLs pointing at the local sink', async () => {
    const { s3Key, uploadId } = await runLocalUpload([]);

    const result = await presignVideoPartsAction({ s3Key, uploadId, partNumbers: [1, 2] });

    expect(result.data?.map((part) => part.url)).toEqual([
      `${LOCAL_PART_SINK_PATH}?uploadId=${encodeURIComponent(uploadId)}&partNumber=1`,
      `${LOCAL_PART_SINK_PATH}?uploadId=${encodeURIComponent(uploadId)}&partNumber=2`,
    ]);
  });

  it('never signs a real S3 URL when presigning locally', async () => {
    const { s3Key, uploadId } = await runLocalUpload([]);

    await presignVideoPartsAction({ s3Key, uploadId, partNumbers: [1] });

    expect(mockGetSignedUrl).not.toHaveBeenCalled();
  });

  it('still rejects a key outside the video namespace when presigning', async () => {
    const { uploadId } = await runLocalUpload([]);

    const result = await presignVideoPartsAction({
      s3Key: `media/audio/${VALID_VIDEO_ID}/clip.mp4`,
      uploadId,
      partNumbers: [1],
    });

    expect(result.error).toContain('Invalid S3 key');
  });

  it('completes with the size of the parts actually delivered', async () => {
    const { s3Key, uploadId, parts } = await runLocalUpload(['12345', '678']);

    const result = await completeVideoUploadAction({ s3Key, uploadId, parts });

    expect(result.data?.fileSize).toBe(8);
  });

  it('makes the completed object visible to the existence check', async () => {
    const { s3Key, uploadId, parts } = await runLocalUpload(['abc']);

    await completeVideoUploadAction({ s3Key, uploadId, parts });

    expect(localObjectExists(s3Key)).toBe(true);
  });

  it('fails loudly when completing an upload id it never issued', async () => {
    const { s3Key } = await runLocalUpload(['abc']);

    const result = await completeVideoUploadAction({
      s3Key,
      uploadId: 'never-issued',
      parts: [{ partNumber: 1, eTag: '"abc"' }],
    });

    expect(result.error).toContain('unknown upload id');
  });

  it('leaves no object behind when the complete fails', async () => {
    const { s3Key } = await runLocalUpload(['abc']);

    await completeVideoUploadAction({
      s3Key,
      uploadId: 'never-issued',
      parts: [{ partNumber: 1, eTag: '"abc"' }],
    });

    expect(localObjectExists(s3Key)).toBe(false);
  });

  it('aborts without calling S3', async () => {
    const { s3Key, uploadId } = await runLocalUpload(['abc']);

    const result = await abortVideoUploadAction({ s3Key, uploadId });

    expect(result.success).toBe(true);
  });

  it('discards the aborted upload so it can no longer complete', async () => {
    const { s3Key, uploadId, parts } = await runLocalUpload(['abc']);
    await abortVideoUploadAction({ s3Key, uploadId });

    const result = await completeVideoUploadAction({ s3Key, uploadId, parts });

    expect(result.success).toBe(false);
  });
});
