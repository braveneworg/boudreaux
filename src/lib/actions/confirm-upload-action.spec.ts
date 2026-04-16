/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { requireRole } from '@/lib/utils/auth/require-role';

import {
  confirmDigitalFormatUploadAction,
  confirmMultiTrackUploadAction,
} from './confirm-upload-action';

vi.mock('server-only', () => ({}));
vi.mock('../utils/auth/require-role');

const mockVerifyS3ObjectExists = vi.fn();
vi.mock('../utils/s3-client', () => ({
  verifyS3ObjectExists: (...args: unknown[]) => mockVerifyS3ObjectExists(...args),
}));

const mockCreateFormatMetadata = vi.fn();
vi.mock('../services/upload-service', () => {
  return {
    UploadService: class MockUploadService {
      createFormatMetadata = mockCreateFormatMetadata;
    },
  };
});

const mockRepoCreate = vi.fn();
const mockRepoUpsertParent = vi.fn();
const mockRepoUpdateTrackCounts = vi.fn();
vi.mock('../repositories/release-digital-format-repository', () => {
  return {
    ReleaseDigitalFormatRepository: class MockRepo {
      create = mockRepoCreate;
      upsertParent = mockRepoUpsertParent;
      updateTrackCounts = mockRepoUpdateTrackCounts;
    },
  };
});

const mockFileRepoDeleteAllByFormatId = vi.fn();
const mockFileRepoCreateMany = vi.fn();
vi.mock('../repositories/release-digital-format-file-repository', () => {
  return {
    ReleaseDigitalFormatFileRepository: class MockFileRepo {
      deleteAllByFormatId = mockFileRepoDeleteAllByFormatId;
      createMany = mockFileRepoCreateMany;
    },
  };
});

describe('confirmDigitalFormatUploadAction', () => {
  const mockSession = {
    user: { id: 'admin-1', role: 'admin', email: 'admin@test.com' },
  };

  const validParams = {
    releaseId: 'release-123',
    formatType: 'MP3_320KBPS' as const,
    s3Key: 'releases/release-123/digital-formats/MP3_320KBPS/file.mp3',
    fileName: 'album.mp3',
    fileSize: 50000000,
    mimeType: 'audio/mpeg',
  };

  beforeEach(() => {
    vi.mocked(requireRole).mockResolvedValue(mockSession as never);
    mockVerifyS3ObjectExists.mockResolvedValue(true);
    mockCreateFormatMetadata.mockReturnValue({
      releaseId: validParams.releaseId,
      formatType: validParams.formatType,
      s3Key: validParams.s3Key,
      fileName: validParams.fileName,
      fileSize: BigInt(validParams.fileSize),
      mimeType: validParams.mimeType,
      uploadedAt: new Date(),
    });
    mockRepoCreate.mockResolvedValue({ id: 'format-1' });
  });

  it('should require admin role', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

    await expect(confirmDigitalFormatUploadAction(validParams)).rejects.toThrow('Unauthorized');
    expect(requireRole).toHaveBeenCalledWith('admin');
  });

  it('should return success with format id on valid confirmation', async () => {
    const result = await confirmDigitalFormatUploadAction(validParams);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ id: 'format-1' });
  });

  it('should return error when validation fails (missing releaseId)', async () => {
    const result = await confirmDigitalFormatUploadAction({
      ...validParams,
      releaseId: '',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should return error when S3 object does not exist', async () => {
    mockVerifyS3ObjectExists.mockResolvedValue(false);

    const result = await confirmDigitalFormatUploadAction(validParams);

    expect(result.success).toBe(false);
    expect(result.error).toContain('File not found in S3');
  });

  it('should handle P2002 unique constraint error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const prismaError = { code: 'P2002', message: 'Unique constraint failed' };
    mockRepoCreate.mockRejectedValue(prismaError);

    const result = await confirmDigitalFormatUploadAction(validParams);

    expect(result.success).toBe(false);
    expect(result.error).toContain('already exists');

    consoleSpy.mockRestore();
  });

  it('should handle generic Error throw', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRepoCreate.mockRejectedValue(new Error('Database failure'));

    const result = await confirmDigitalFormatUploadAction(validParams);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Database failure');

    consoleSpy.mockRestore();
  });

  it('should handle non-Error throw gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRepoCreate.mockRejectedValue('string error');

    const result = await confirmDigitalFormatUploadAction(validParams);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to confirm upload');

    consoleSpy.mockRestore();
  });

  // ─── Security: S3 key path traversal rejection ───

  it('should return error when s3Key contains path traversal (..)', async () => {
    const result = await confirmDigitalFormatUploadAction({
      ...validParams,
      s3Key: 'releases/release-123/digital-formats/MP3_320KBPS/../../../etc/passwd',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid S3 key');
    expect(mockVerifyS3ObjectExists).not.toHaveBeenCalled();
    expect(mockRepoCreate).not.toHaveBeenCalled();
  });

  it('should return error when s3Key does not match expected prefix', async () => {
    const result = await confirmDigitalFormatUploadAction({
      ...validParams,
      s3Key: 'releases/WRONG-ID/digital-formats/MP3_320KBPS/file.mp3',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid S3 key');
    expect(mockVerifyS3ObjectExists).not.toHaveBeenCalled();
    expect(mockRepoCreate).not.toHaveBeenCalled();
  });
});

describe('confirmMultiTrackUploadAction', () => {
  const mockSession = {
    user: { id: 'admin-1', role: 'admin', email: 'admin@test.com' },
  };

  const validParams = {
    releaseId: 'release-123',
    formatType: 'MP3_320KBPS' as const,
    files: [
      {
        trackNumber: 1,
        s3Key: 'releases/123/digital-formats/MP3_320KBPS/tracks/1-song.mp3',
        fileName: 'song1.mp3',
        fileSize: 10000000,
        mimeType: 'audio/mpeg',
      },
      {
        trackNumber: 2,
        s3Key: 'releases/123/digital-formats/MP3_320KBPS/tracks/2-song.mp3',
        fileName: 'song2.mp3',
        fileSize: 12000000,
        mimeType: 'audio/mpeg',
      },
    ],
  };

  beforeEach(() => {
    vi.mocked(requireRole).mockResolvedValue(mockSession as never);
    mockVerifyS3ObjectExists.mockResolvedValue(true);
    mockRepoUpsertParent.mockResolvedValue({ id: 'format-1' });
    mockFileRepoDeleteAllByFormatId.mockResolvedValue(0);
    mockFileRepoCreateMany.mockResolvedValue(2);
    mockRepoUpdateTrackCounts.mockResolvedValue({});
  });

  it('should require admin role', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

    await expect(confirmMultiTrackUploadAction(validParams)).rejects.toThrow('Unauthorized');
  });

  it('should return success with formatId and fileCount', async () => {
    const result = await confirmMultiTrackUploadAction(validParams);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ formatId: 'format-1', fileCount: 2 });
  });

  it('should return error when validation fails (empty files array)', async () => {
    const result = await confirmMultiTrackUploadAction({
      ...validParams,
      files: [],
    });

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should return error when first S3 object does not exist', async () => {
    mockVerifyS3ObjectExists.mockResolvedValue(false);

    const result = await confirmMultiTrackUploadAction(validParams);

    expect(result.success).toBe(false);
    expect(result.error).toContain('File not found in S3');
  });

  it('should delete existing files before creating new ones', async () => {
    await confirmMultiTrackUploadAction(validParams);

    expect(mockFileRepoDeleteAllByFormatId).toHaveBeenCalledWith('format-1');
    expect(mockFileRepoCreateMany).toHaveBeenCalledWith(
      'format-1',
      expect.arrayContaining([
        expect.objectContaining({ trackNumber: 1 }),
        expect.objectContaining({ trackNumber: 2 }),
      ])
    );
    expect(mockRepoUpdateTrackCounts).toHaveBeenCalledWith('format-1');
  });

  it('should handle generic Error throw', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRepoUpsertParent.mockRejectedValue(new Error('DB failure'));

    const result = await confirmMultiTrackUploadAction(validParams);

    expect(result.success).toBe(false);
    expect(result.error).toBe('DB failure');

    consoleSpy.mockRestore();
  });

  it('should handle non-Error throw gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRepoUpsertParent.mockRejectedValue('string error');

    const result = await confirmMultiTrackUploadAction(validParams);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to confirm multi-track upload');

    consoleSpy.mockRestore();
  });
});
