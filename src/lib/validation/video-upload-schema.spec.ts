/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  VIDEO_MAX_FILE_SIZE,
  VIDEO_MAX_PARTS,
  VIDEO_PART_URL_BATCH_MAX,
} from '@/lib/constants/video-uploads';

import {
  abortVideoUploadSchema,
  completeVideoUploadSchema,
  initiateVideoUploadSchema,
  presignVideoPartsSchema,
} from './video-upload-schema';

const VALID_OBJECT_ID = 'a'.repeat(24);
const VALID_KEY = `media/videos/${VALID_OBJECT_ID}/clip-123-abc.mp4`;

interface ParseLike {
  success: boolean;
  error?: { issues: Array<{ message: string }> };
}

/** Join every issue message so a single test can assert on the friendly text. */
const messagesOf = (result: ParseLike): string =>
  result.success ? '' : (result.error?.issues.map((issue) => issue.message).join(' ') ?? '');

describe('initiateVideoUploadSchema', () => {
  const base = {
    videoId: VALID_OBJECT_ID,
    fileName: 'clip.mp4',
    contentType: 'video/mp4',
    fileSize: 1024,
  };

  it('accepts a valid MP4 upload', () => {
    expect(initiateVideoUploadSchema.safeParse(base).success).toBe(true);
  });

  it('accepts a valid WebM upload', () => {
    const result = initiateVideoUploadSchema.safeParse({
      ...base,
      fileName: 'clip.webm',
      contentType: 'video/webm',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a file exactly at the maximum size', () => {
    const result = initiateVideoUploadSchema.safeParse({ ...base, fileSize: VIDEO_MAX_FILE_SIZE });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid ObjectId', () => {
    const result = initiateVideoUploadSchema.safeParse({ ...base, videoId: 'not-a-valid-id' });
    expect(result.success).toBe(false);
  });

  it('rejects an empty file name', () => {
    const result = initiateVideoUploadSchema.safeParse({ ...base, fileName: '' });
    expect(result.success).toBe(false);
  });

  it('rejects an unsupported content type', () => {
    const result = initiateVideoUploadSchema.safeParse({
      ...base,
      fileName: 'clip.mov',
      contentType: 'video/quicktime',
    });
    expect(result.success).toBe(false);
  });

  it('names the supported formats when the content type is unsupported', () => {
    const result = initiateVideoUploadSchema.safeParse({
      ...base,
      fileName: 'clip.mov',
      contentType: 'video/quicktime',
    });
    expect(messagesOf(result)).toContain('MP4');
  });

  it('also names WebM in the unsupported content type message', () => {
    const result = initiateVideoUploadSchema.safeParse({
      ...base,
      contentType: 'video/quicktime',
    });
    expect(messagesOf(result)).toContain('WebM');
  });

  it('rejects a zero file size', () => {
    const result = initiateVideoUploadSchema.safeParse({ ...base, fileSize: 0 });
    expect(result.success).toBe(false);
  });

  it('rejects a negative file size', () => {
    const result = initiateVideoUploadSchema.safeParse({ ...base, fileSize: -1 });
    expect(result.success).toBe(false);
  });

  it('rejects a non-integer file size', () => {
    const result = initiateVideoUploadSchema.safeParse({ ...base, fileSize: 1024.5 });
    expect(result.success).toBe(false);
  });

  it('rejects a file larger than the maximum size', () => {
    const result = initiateVideoUploadSchema.safeParse({
      ...base,
      fileSize: VIDEO_MAX_FILE_SIZE + 1,
    });
    expect(result.success).toBe(false);
  });
});

describe('presignVideoPartsSchema', () => {
  const base = {
    s3Key: VALID_KEY,
    uploadId: 'upload-123',
    partNumbers: [1, 2, 3],
  };

  it('accepts a valid batch of part numbers', () => {
    expect(presignVideoPartsSchema.safeParse(base).success).toBe(true);
  });

  it('rejects an empty s3Key', () => {
    expect(presignVideoPartsSchema.safeParse({ ...base, s3Key: '' }).success).toBe(false);
  });

  it('rejects an empty uploadId', () => {
    expect(presignVideoPartsSchema.safeParse({ ...base, uploadId: '' }).success).toBe(false);
  });

  it('rejects an empty part-number batch', () => {
    expect(presignVideoPartsSchema.safeParse({ ...base, partNumbers: [] }).success).toBe(false);
  });

  it('rejects a batch larger than the batch maximum', () => {
    const partNumbers = Array.from({ length: VIDEO_PART_URL_BATCH_MAX + 1 }, (_, i) => i + 1);
    expect(presignVideoPartsSchema.safeParse({ ...base, partNumbers }).success).toBe(false);
  });

  it('rejects a part number below one', () => {
    expect(presignVideoPartsSchema.safeParse({ ...base, partNumbers: [0] }).success).toBe(false);
  });

  it('rejects a part number above the maximum', () => {
    const result = presignVideoPartsSchema.safeParse({
      ...base,
      partNumbers: [VIDEO_MAX_PARTS + 1],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a non-integer part number', () => {
    expect(presignVideoPartsSchema.safeParse({ ...base, partNumbers: [1.5] }).success).toBe(false);
  });
});

describe('completeVideoUploadSchema', () => {
  const base = {
    s3Key: VALID_KEY,
    uploadId: 'upload-123',
    parts: [
      { partNumber: 1, eTag: 'etag-1' },
      { partNumber: 2, eTag: 'etag-2' },
    ],
  };

  it('accepts a valid completion payload', () => {
    expect(completeVideoUploadSchema.safeParse(base).success).toBe(true);
  });

  it('rejects an empty parts array', () => {
    expect(completeVideoUploadSchema.safeParse({ ...base, parts: [] }).success).toBe(false);
  });

  it('rejects a part with an empty eTag', () => {
    const result = completeVideoUploadSchema.safeParse({
      ...base,
      parts: [{ partNumber: 1, eTag: '' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a part with a part number below one', () => {
    const result = completeVideoUploadSchema.safeParse({
      ...base,
      parts: [{ partNumber: 0, eTag: 'etag-0' }],
    });
    expect(result.success).toBe(false);
  });

  it('rejects a parts array longer than the maximum', () => {
    const parts = Array.from({ length: VIDEO_MAX_PARTS + 1 }, (_, i) => ({
      partNumber: i + 1,
      eTag: `etag-${i + 1}`,
    }));
    expect(completeVideoUploadSchema.safeParse({ ...base, parts }).success).toBe(false);
  });
});

describe('abortVideoUploadSchema', () => {
  const base = { s3Key: VALID_KEY, uploadId: 'upload-123' };

  it('accepts a valid abort payload', () => {
    expect(abortVideoUploadSchema.safeParse(base).success).toBe(true);
  });

  it('rejects an empty s3Key', () => {
    expect(abortVideoUploadSchema.safeParse({ ...base, s3Key: '' }).success).toBe(false);
  });

  it('rejects an empty uploadId', () => {
    expect(abortVideoUploadSchema.safeParse({ ...base, uploadId: '' }).success).toBe(false);
  });
});
