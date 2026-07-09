/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { revalidatePath } from 'next/cache';

import { VideoService } from '@/lib/services/video-service';
import type { FormState } from '@/lib/types/form-state';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { setUnknownError } from '@/lib/utils/auth/auth-utils';
import { getActionState } from '@/lib/utils/auth/get-action-state';
import { requireRole } from '@/lib/utils/auth/require-role';
import { verifyS3ObjectExists } from '@/lib/utils/s3-client';

import { createVideoAction } from './create-video-action';

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('@/lib/services/video-service');
vi.mock('@/lib/utils/audit-log');
vi.mock('@/lib/utils/auth/auth-utils');
vi.mock('@/lib/utils/auth/get-action-state');
vi.mock('@/lib/utils/auth/require-role');
vi.mock('@/lib/utils/s3-client');

const mockSession = { user: { id: 'user-123', role: 'admin', email: 'admin@example.com' } };
const videoId = '507f1f77bcf86cd799439011';
const validS3Key = `media/videos/${videoId}/clip-abc.mp4`;

const initialFormState: FormState = { fields: {}, success: false };

const buildFormData = (): FormData => {
  const formData = new FormData();
  formData.append('preGeneratedId', videoId);
  formData.append('title', 'Live at the Venue');
  return formData;
};

const parsedData = {
  title: 'Live at the Venue',
  artist: 'The Band',
  category: 'MUSIC',
  description: 'A great set',
  releasedOn: '2024-01-15',
  durationSeconds: '212',
  s3Key: validS3Key,
  fileName: 'clip.mp4',
  fileSize: '10485760',
  mimeType: 'video/mp4',
  posterUrl: 'https://example.com/poster.jpg',
  publishedAt: '2024-01-20T00:00:00.000Z',
};

const mockParsedSuccess = (data: Record<string, unknown> = parsedData): void => {
  vi.mocked(getActionState).mockReturnValue({
    formState: { fields: {}, success: false },
    parsed: { success: true, data },
  } as never);
};

beforeEach(() => {
  vi.mocked(requireRole).mockResolvedValue(mockSession as never);
  vi.mocked(revalidatePath).mockImplementation(() => {});
  vi.mocked(verifyS3ObjectExists).mockResolvedValue(true);
  vi.mocked(VideoService.createVideo).mockResolvedValue({
    success: true,
    data: { id: videoId },
  } as never);
});

describe('createVideoAction', () => {
  describe('Authorization', () => {
    it('should require admin role', async () => {
      vi.mocked(requireRole).mockRejectedValue(Error('Unauthorized'));

      await expect(createVideoAction(initialFormState, buildFormData())).rejects.toThrow(
        'Unauthorized'
      );
    });

    it('should not create a video when the admin check fails', async () => {
      vi.mocked(requireRole).mockRejectedValue(Error('Unauthorized'));

      await createVideoAction(initialFormState, buildFormData()).catch(() => undefined);

      expect(VideoService.createVideo).not.toHaveBeenCalled();
    });
  });

  describe('Validation', () => {
    it('should validate form data with the permitted field names', async () => {
      mockParsedSuccess();

      await createVideoAction(initialFormState, buildFormData());

      expect(getActionState).toHaveBeenCalledWith(
        expect.any(FormData),
        [
          'title',
          'artist',
          'category',
          'description',
          'releasedOn',
          'durationSeconds',
          's3Key',
          'fileName',
          'fileSize',
          'mimeType',
          'posterUrl',
          'publishedAt',
        ],
        expect.anything()
      );
    });

    it('should return validation errors and not create when the body is invalid', async () => {
      const invalidFormState = {
        fields: {},
        success: false,
        errors: { title: ['Title is required'] },
      };
      vi.mocked(getActionState).mockReturnValue({
        formState: invalidFormState,
        parsed: { success: false, error: {} },
      } as never);

      const result = await createVideoAction(initialFormState, buildFormData());

      expect(result).toEqual(invalidFormState);
    });

    it('should not call the service when the body is invalid', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false, errors: { title: ['Title is required'] } },
        parsed: { success: false, error: {} },
      } as never);

      await createVideoAction(initialFormState, buildFormData());

      expect(VideoService.createVideo).not.toHaveBeenCalled();
    });
  });

  describe('S3 confirmation', () => {
    it('should reject an s3Key that is not under the video prefix', async () => {
      mockParsedSuccess({ ...parsedData, s3Key: `media/videos/${'a'.repeat(24)}/other.mp4` });

      const result = await createVideoAction(initialFormState, buildFormData());

      expect(result.success).toBe(false);
      expect(result.errors?.general?.[0]).toContain('Invalid S3 key');
    });

    it('should not create a video when the s3Key prefix mismatches', async () => {
      mockParsedSuccess({ ...parsedData, s3Key: 'releases/other/file.mp4' });

      await createVideoAction(initialFormState, buildFormData());

      expect(VideoService.createVideo).not.toHaveBeenCalled();
    });

    it('should reject when the pre-generated id is missing or invalid', async () => {
      mockParsedSuccess();
      const formData = new FormData();
      formData.append('preGeneratedId', 'not-a-valid-object-id');

      const result = await createVideoAction(initialFormState, formData);

      expect(result.success).toBe(false);
      expect(VideoService.createVideo).not.toHaveBeenCalled();
    });

    it('should reject when the S3 object does not exist', async () => {
      mockParsedSuccess();
      vi.mocked(verifyS3ObjectExists).mockResolvedValue(false);

      const result = await createVideoAction(initialFormState, buildFormData());

      expect(result.success).toBe(false);
      expect(result.errors?.general?.[0]).toContain('File not found');
    });

    it('should not create a video when the S3 object does not exist', async () => {
      mockParsedSuccess();
      vi.mocked(verifyS3ObjectExists).mockResolvedValue(false);

      await createVideoAction(initialFormState, buildFormData());

      expect(VideoService.createVideo).not.toHaveBeenCalled();
    });
  });

  describe('Video creation', () => {
    it('should create the video with the pre-generated id and parsed fields', async () => {
      mockParsedSuccess();

      await createVideoAction(initialFormState, buildFormData());

      expect(VideoService.createVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          id: videoId,
          title: 'Live at the Venue',
          artist: 'The Band',
          category: 'MUSIC',
          description: 'A great set',
          releasedOn: expect.any(Date),
          durationSeconds: 212,
          s3Key: validS3Key,
          fileName: 'clip.mp4',
          fileSize: BigInt(10485760),
          mimeType: 'video/mp4',
          posterUrl: 'https://example.com/poster.jpg',
          publishedAt: expect.any(Date),
          createdBy: 'user-123',
        })
      );
    });

    it('should coerce a numeric durationSeconds delivered as a number', async () => {
      mockParsedSuccess({ ...parsedData, durationSeconds: 212, fileSize: 10485760 });

      await createVideoAction(initialFormState, buildFormData());

      expect(VideoService.createVideo).toHaveBeenCalledWith(
        expect.objectContaining({ durationSeconds: 212, fileSize: BigInt(10485760) })
      );
    });

    it('should omit optional fields left empty', async () => {
      mockParsedSuccess({
        title: 'Minimal',
        artist: 'Solo',
        category: 'INFORMATIONAL',
        description: '',
        releasedOn: '2024-01-15',
        durationSeconds: '',
        s3Key: validS3Key,
        fileName: 'clip.mp4',
        fileSize: '',
        mimeType: 'video/mp4',
        posterUrl: '',
        publishedAt: '',
      });

      await createVideoAction(initialFormState, buildFormData());

      expect(VideoService.createVideo).toHaveBeenCalledWith(
        expect.objectContaining({
          description: undefined,
          durationSeconds: undefined,
          fileSize: undefined,
          posterUrl: undefined,
          publishedAt: undefined,
        })
      );
    });

    it('should return the created video id in the form state on success', async () => {
      mockParsedSuccess();

      const result = await createVideoAction(initialFormState, buildFormData());

      expect(result.success).toBe(true);
      expect(result.data?.videoId).toBe(videoId);
      expect(result.errors).toBeUndefined();
    });

    it('should map a title conflict to a title field error', async () => {
      mockParsedSuccess();
      vi.mocked(VideoService.createVideo).mockResolvedValue({
        success: false,
        error: 'Video with this title already exists',
      } as never);

      const result = await createVideoAction(initialFormState, buildFormData());

      expect(result.success).toBe(false);
      expect(result.errors?.title).toEqual([
        'This title is already in use. Please choose a different one.',
      ]);
    });

    it.each(['Title is not unique', 'Duplicate title found'])(
      'should map the title conflict message "%s" to a title field error',
      async (error) => {
        mockParsedSuccess();
        vi.mocked(VideoService.createVideo).mockResolvedValue({ success: false, error } as never);

        const result = await createVideoAction(initialFormState, buildFormData());

        expect(result.errors?.title).toEqual([
          'This title is already in use. Please choose a different one.',
        ]);
      }
    );

    it('should map a service failure without a message to a general error', async () => {
      mockParsedSuccess();
      vi.mocked(VideoService.createVideo).mockResolvedValue({ success: false } as never);

      const result = await createVideoAction(initialFormState, buildFormData());

      expect(result.errors?.general).toEqual(['Failed to create video']);
    });

    it('should overwrite a pre-existing errors object on a generic failure', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false, errors: { prior: ['stale'] } },
        parsed: { success: true, data: parsedData },
      } as never);
      vi.mocked(VideoService.createVideo).mockResolvedValue({
        success: false,
        error: 'Database error',
      } as never);

      const result = await createVideoAction(initialFormState, buildFormData());

      expect(result.errors).toEqual({ general: ['Failed to create video'] });
    });

    it('should reject when preGeneratedId is absent from the payload', async () => {
      mockParsedSuccess();
      const formData = new FormData();
      formData.append('title', 'Live at the Venue');

      const result = await createVideoAction(initialFormState, formData);

      expect(result.success).toBe(false);
      expect(VideoService.createVideo).not.toHaveBeenCalled();
    });

    it('should map a generic service failure to a general error', async () => {
      mockParsedSuccess();
      vi.mocked(VideoService.createVideo).mockResolvedValue({
        success: false,
        error: 'Database connection failed',
      } as never);

      const result = await createVideoAction(initialFormState, buildFormData());

      expect(result.success).toBe(false);
      expect(result.errors?.general).toEqual(['Failed to create video']);
    });

    it('should handle an unexpected service error', async () => {
      mockParsedSuccess();
      vi.mocked(VideoService.createVideo).mockRejectedValue(Error('boom'));

      await createVideoAction(initialFormState, buildFormData());

      expect(setUnknownError).toHaveBeenCalled();
    });
  });

  describe('Security logging', () => {
    it('should log the video creation with the created fields', async () => {
      mockParsedSuccess({
        title: 'Live at the Venue',
        artist: 'The Band',
        category: 'MUSIC',
        releasedOn: '2024-01-15',
        s3Key: validS3Key,
        fileName: 'clip.mp4',
        mimeType: 'video/mp4',
      });

      await createVideoAction(initialFormState, buildFormData());

      expect(logSecurityEvent).toHaveBeenCalledWith({
        event: 'media.video.created',
        userId: 'user-123',
        metadata: {
          createdFields: [
            'title',
            'artist',
            'category',
            'releasedOn',
            's3Key',
            'fileName',
            'mimeType',
          ],
          success: true,
        },
      });
    });
  });

  describe('Cache revalidation', () => {
    it('should revalidate the admin videos path even on service failure', async () => {
      mockParsedSuccess();
      vi.mocked(VideoService.createVideo).mockResolvedValue({
        success: false,
        error: 'Database error',
      } as never);

      await createVideoAction(initialFormState, buildFormData());

      expect(revalidatePath).toHaveBeenCalledWith('/admin/videos');
      expect(revalidatePath).not.toHaveBeenCalledWith('/videos');
    });

    it('should revalidate the public videos path on success', async () => {
      mockParsedSuccess();

      await createVideoAction(initialFormState, buildFormData());

      expect(revalidatePath).toHaveBeenCalledWith('/videos');
    });
  });
});
