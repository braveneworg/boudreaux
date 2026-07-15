/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react';

import type { VideoFormData } from '@/lib/validation/create-video-schema';

import { useVideoPosterUpload } from './use-video-poster-upload';

import type { UseFormSetValue } from 'react-hook-form';

const getPresignedUploadUrlsActionMock = vi.hoisted(() => vi.fn());
const uploadFileToS3Mock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/actions/presigned-upload-actions', () => ({
  getPresignedUploadUrlsAction: getPresignedUploadUrlsActionMock,
}));

vi.mock('@/lib/utils/direct-upload', () => ({
  uploadFileToS3: uploadFileToS3Mock,
}));

const posterFile = (): File => new File(['poster'], 'poster.jpg', { type: 'image/jpeg' });

const presignedTarget = { uploadUrl: 'https://s3', s3Key: 'k', cdnUrl: 'https://cdn/poster.jpg' };

const renderUpload = (): {
  result: { current: ReturnType<typeof useVideoPosterUpload> };
  setValue: UseFormSetValue<VideoFormData>;
} => {
  const setValue = vi.fn() as unknown as UseFormSetValue<VideoFormData>;
  const { result } = renderHook(() => useVideoPosterUpload({ preGeneratedId: 'vid-1', setValue }));
  return { result, setValue };
};

describe('useVideoPosterUpload', () => {
  beforeEach(() => {
    getPresignedUploadUrlsActionMock.mockReset();
    uploadFileToS3Mock.mockReset();
  });

  it('writes the poster URL and remembers it on a successful upload', async () => {
    getPresignedUploadUrlsActionMock.mockResolvedValue({ success: true, data: [presignedTarget] });
    uploadFileToS3Mock.mockResolvedValue({ success: true, cdnUrl: 'https://cdn/poster.jpg' });

    const { result, setValue } = renderUpload();

    await act(async () => {
      await result.current.uploadPoster(posterFile());
    });

    expect(setValue).toHaveBeenCalledWith('posterUrl', 'https://cdn/poster.jpg', {
      shouldDirty: true,
      shouldValidate: true,
    });
    expect(result.current.uploadedPosterUrl).toBe('https://cdn/poster.jpg');
  });

  it('surfaces the presign error message when the action fails', async () => {
    getPresignedUploadUrlsActionMock.mockResolvedValue({ success: false, error: 'Presign boom' });

    const { result } = renderUpload();

    await act(async () => {
      await result.current.uploadPoster(posterFile());
    });

    expect(result.current.errorMessage).toBe('Presign boom');
  });

  it('falls back to a default message when the presign result has no error', async () => {
    getPresignedUploadUrlsActionMock.mockResolvedValue({ success: false });

    const { result } = renderUpload();

    await act(async () => {
      await result.current.uploadPoster(posterFile());
    });

    expect(result.current.errorMessage).toBe('Failed to prepare the poster upload.');
  });

  it('surfaces the S3 upload error message when the PUT fails', async () => {
    getPresignedUploadUrlsActionMock.mockResolvedValue({ success: true, data: [presignedTarget] });
    uploadFileToS3Mock.mockResolvedValue({ success: false, cdnUrl: '', error: 'Upload boom' });

    const { result } = renderUpload();

    await act(async () => {
      await result.current.uploadPoster(posterFile());
    });

    expect(result.current.errorMessage).toBe('Upload boom');
  });

  it('falls back to a default message when the S3 upload result has no error', async () => {
    getPresignedUploadUrlsActionMock.mockResolvedValue({ success: true, data: [presignedTarget] });
    uploadFileToS3Mock.mockResolvedValue({ success: false, cdnUrl: '' });

    const { result } = renderUpload();

    await act(async () => {
      await result.current.uploadPoster(posterFile());
    });

    expect(result.current.errorMessage).toBe('Failed to upload the poster.');
  });

  it('clears isUploading after the flow settles', async () => {
    getPresignedUploadUrlsActionMock.mockResolvedValue({ success: true, data: [presignedTarget] });
    uploadFileToS3Mock.mockResolvedValue({ success: true, cdnUrl: 'https://cdn/poster.jpg' });

    const { result } = renderUpload();

    await act(async () => {
      await result.current.uploadPoster(posterFile());
    });

    expect(result.current.isUploading).toBe(false);
  });
});
