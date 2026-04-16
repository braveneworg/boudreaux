/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { describe, it, expect, beforeEach, vi } from 'vitest';

import { requireRole } from '@/lib/utils/auth/require-role';

import { uploadDigitalFormatAction } from './upload-digital-format-action';

vi.mock('server-only', () => ({}));
vi.mock('../utils/auth/require-role');

const mockValidateFileInfo = vi.fn();
const mockGeneratePresignedUploadUrl = vi.fn();

vi.mock('../services/upload-service', () => {
  return {
    UploadService: class MockUploadService {
      validateFileInfo = mockValidateFileInfo;
      generatePresignedUploadUrl = mockGeneratePresignedUploadUrl;
    },
  };
});

function createFormData(data: Record<string, string>): FormData {
  const formData = new FormData();
  for (const [key, value] of Object.entries(data)) {
    formData.set(key, value);
  }
  return formData;
}

describe('uploadDigitalFormatAction', () => {
  const mockSession = {
    user: { id: 'admin-1', role: 'admin', email: 'admin@test.com' },
  };

  beforeEach(() => {
    vi.mocked(requireRole).mockResolvedValue(mockSession as never);
    mockValidateFileInfo.mockReturnValue({ valid: true });
    mockGeneratePresignedUploadUrl.mockResolvedValue({
      uploadUrl: 'https://s3.example.com/presigned',
      s3Key: 'releases/123/digital-formats/MP3_320KBPS/file.mp3',
      contentType: 'audio/mpeg',
    });
  });

  it('should require admin role', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

    const formData = createFormData({
      releaseId: 'release-123',
      formatType: 'MP3_320KBPS',
      fileName: 'album.mp3',
      fileSize: '50000000',
      mimeType: 'audio/mpeg',
    });

    await expect(uploadDigitalFormatAction(formData)).rejects.toThrow('Unauthorized');
    expect(requireRole).toHaveBeenCalledWith('admin');
  });

  it('should return presigned URL on successful validation', async () => {
    const formData = createFormData({
      releaseId: 'release-123',
      formatType: 'MP3_320KBPS',
      fileName: 'album.mp3',
      fileSize: '50000000',
      mimeType: 'audio/mpeg',
    });

    const result = await uploadDigitalFormatAction(formData);

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      uploadUrl: 'https://s3.example.com/presigned',
      s3Key: 'releases/123/digital-formats/MP3_320KBPS/file.mp3',
      expiresIn: 900,
      contentType: 'audio/mpeg',
    });
  });

  it('should return error for invalid input (missing releaseId)', async () => {
    const formData = createFormData({
      releaseId: '',
      formatType: 'MP3_320KBPS',
      fileName: 'album.mp3',
      fileSize: '50000000',
      mimeType: 'audio/mpeg',
    });

    const result = await uploadDigitalFormatAction(formData);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should return error for invalid format type', async () => {
    const formData = createFormData({
      releaseId: 'release-123',
      formatType: 'INVALID',
      fileName: 'album.mp3',
      fileSize: '50000000',
      mimeType: 'audio/mpeg',
    });

    const result = await uploadDigitalFormatAction(formData);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should return error for invalid fileSize (NaN)', async () => {
    const formData = createFormData({
      releaseId: 'release-123',
      formatType: 'MP3_320KBPS',
      fileName: 'album.mp3',
      fileSize: 'not-a-number',
      mimeType: 'audio/mpeg',
    });

    const result = await uploadDigitalFormatAction(formData);

    expect(result.success).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('should return error when file validation fails', async () => {
    mockValidateFileInfo.mockReturnValue({ valid: false, error: 'File too large' });

    const formData = createFormData({
      releaseId: 'release-123',
      formatType: 'MP3_320KBPS',
      fileName: 'album.mp3',
      fileSize: '50000000',
      mimeType: 'audio/mpeg',
    });

    const result = await uploadDigitalFormatAction(formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe('File too large');
  });

  it('should return fallback error when file validation fails without error message', async () => {
    mockValidateFileInfo.mockReturnValue({ valid: false });

    const formData = createFormData({
      releaseId: 'release-123',
      formatType: 'MP3_320KBPS',
      fileName: 'album.mp3',
      fileSize: '50000000',
      mimeType: 'audio/mpeg',
    });

    const result = await uploadDigitalFormatAction(formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe('File validation failed');
  });

  it('should handle unexpected errors gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockGeneratePresignedUploadUrl.mockRejectedValue(new Error('S3 failure'));

    const formData = createFormData({
      releaseId: 'release-123',
      formatType: 'MP3_320KBPS',
      fileName: 'album.mp3',
      fileSize: '50000000',
      mimeType: 'audio/mpeg',
    });

    const result = await uploadDigitalFormatAction(formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe('S3 failure');

    consoleSpy.mockRestore();
  });

  it('should handle non-Error throw gracefully', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockGeneratePresignedUploadUrl.mockRejectedValue('string error');

    const formData = createFormData({
      releaseId: 'release-123',
      formatType: 'MP3_320KBPS',
      fileName: 'album.mp3',
      fileSize: '50000000',
      mimeType: 'audio/mpeg',
    });

    const result = await uploadDigitalFormatAction(formData);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Failed to generate upload URL');

    consoleSpy.mockRestore();
  });
});
