/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { revalidatePath } from 'next/cache';

import { gateAction } from '@/lib/auth/action-gate';
import { VideoService } from '@/lib/services/video-service';
import type { FormState } from '@/lib/types/form-state';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { setUnknownError } from '@/lib/utils/auth/auth-utils';
import { getActionState } from '@/lib/utils/auth/get-action-state';
import { deleteS3Object, verifyS3ObjectExists } from '@/lib/utils/s3-client';
import { extractS3KeyFromUrl } from '@/lib/utils/s3-key-utils';

import { updateVideoAction } from './update-video-action';

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('@/lib/services/video-service');
vi.mock('@/lib/utils/audit-log');
vi.mock('@/lib/utils/auth/auth-utils');
vi.mock('@/lib/utils/auth/get-action-state');
vi.mock('@/lib/auth/action-gate');
vi.mock('@/lib/utils/s3-client');
vi.mock('@/lib/utils/s3-key-utils');

const REFUSAL = { success: false as const, error: 'Unauthorized', code: 'FORBIDDEN' as const };

const mockSession = { user: { id: 'user-123', role: 'admin', email: 'admin@example.com' } };
const videoId = '507f1f77bcf86cd799439011';
const currentS3Key = `media/videos/${videoId}/current.mp4`;
const replacementS3Key = `media/videos/${videoId}/replacement.mp4`;

const currentVideo = {
  id: videoId,
  title: 'Old Title',
  artist: 'The Band',
  category: 'MUSIC',
  description: null,
  releasedOn: new Date('2024-01-01'),
  durationSeconds: 100,
  s3Key: currentS3Key,
  fileName: 'current.mp4',
  fileSize: BigInt(1000),
  mimeType: 'video/mp4',
  posterUrl: 'https://cdn.example.com/old-poster.jpg',
  posterCandidates: [],
  publishedAt: null,
  archivedAt: null,
  createdBy: 'user-123',
  updatedBy: null,
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-01'),
};

const mockFormData = new FormData();
const initialFormState: FormState = { fields: {}, success: false };

const parsedData = {
  title: 'New Title',
  artist: 'The Band',
  category: 'MUSIC',
  description: 'Updated',
  releasedOn: '2024-02-01',
  durationSeconds: '212',
  s3Key: currentS3Key,
  fileName: 'current.mp4',
  fileSize: '2000',
  mimeType: 'video/mp4',
  posterUrl: 'https://cdn.example.com/old-poster.jpg',
  publishedAt: '',
};

const mockParsedSuccess = (data: Record<string, unknown> = parsedData): void => {
  vi.mocked(getActionState).mockReturnValue({
    formState: { fields: {}, success: false },
    parsed: { success: true, data },
  } as never);
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(gateAction).mockResolvedValue({ success: true, session: mockSession as never });
  vi.mocked(revalidatePath).mockImplementation(() => {});
  vi.mocked(verifyS3ObjectExists).mockResolvedValue(true);
  vi.mocked(deleteS3Object).mockResolvedValue(true);
  vi.mocked(extractS3KeyFromUrl).mockReturnValue('media/videos/old-poster-key.jpg');
  vi.mocked(VideoService.getVideoById).mockResolvedValue({
    success: true,
    data: currentVideo,
  } as never);
  vi.mocked(VideoService.updateVideo).mockResolvedValue({
    success: true,
    data: { id: videoId },
  } as never);
  vi.mocked(VideoService.schedulePostSave).mockResolvedValue(undefined);
});

describe('updateVideoAction', () => {
  describe('Authorization', () => {
    it('resolves the gate refusal as a form error without updating the video', async () => {
      vi.mocked(gateAction).mockResolvedValueOnce(REFUSAL);

      const result = await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(result).toEqual({ fields: {}, success: false, errors: { general: ['Unauthorized'] } });
      expect(VideoService.getVideoById).not.toHaveBeenCalled();
      expect(VideoService.updateVideo).not.toHaveBeenCalled();
    });

    it('should reject an invalid video id', async () => {
      const result = await updateVideoAction('invalid-id', initialFormState, mockFormData);

      expect(result).toEqual({
        fields: {},
        success: false,
        errors: { general: ['Invalid video ID'] },
      });
    });

    it('should not validate the body when the id is invalid', async () => {
      await updateVideoAction('invalid-id', initialFormState, mockFormData);

      expect(getActionState).not.toHaveBeenCalled();
    });
  });

  describe('Validation', () => {
    it('should apply zod issues to the form state and not update', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: false,
          error: { issues: [{ path: ['title'], message: 'Title is required' }] },
        },
      } as never);

      const result = await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(result.errors?.title).toEqual(['Title is required']);
    });

    it('should not call the service when validation fails', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: {
          success: false,
          error: { issues: [{ path: ['title'], message: 'Title is required' }] },
        },
      } as never);

      await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(VideoService.updateVideo).not.toHaveBeenCalled();
    });
  });

  describe('Current video lookup', () => {
    it('should error when the current video cannot be loaded', async () => {
      mockParsedSuccess();
      vi.mocked(VideoService.getVideoById).mockResolvedValue({
        success: false,
        error: 'Video not found',
      } as never);

      const result = await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(result.errors?.general).toEqual(['Video not found']);
    });

    it('should not update when the current video cannot be loaded', async () => {
      mockParsedSuccess();
      vi.mocked(VideoService.getVideoById).mockResolvedValue({
        success: false,
        error: 'Video not found',
      } as never);

      await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(VideoService.updateVideo).not.toHaveBeenCalled();
    });
  });

  describe('Update without file replacement', () => {
    it('should update the video stamping updatedBy', async () => {
      mockParsedSuccess();

      await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(VideoService.updateVideo).toHaveBeenCalledWith(
        videoId,
        expect.objectContaining({
          title: 'New Title',
          releasedOn: expect.any(Date),
          durationSeconds: 212,
          fileSize: BigInt(2000),
          updatedBy: 'user-123',
        })
      );
    });

    it('should not confirm S3 when the s3Key is unchanged', async () => {
      mockParsedSuccess();

      await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(verifyS3ObjectExists).not.toHaveBeenCalled();
    });

    it('should not delete any S3 object when nothing was replaced', async () => {
      mockParsedSuccess();

      await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(deleteS3Object).not.toHaveBeenCalled();
    });

    it('should return the video id in the form state on success', async () => {
      mockParsedSuccess();

      const result = await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(result.success).toBe(true);
      expect(result.data?.videoId).toBe(videoId);
    });
  });

  describe('Update with file replacement', () => {
    it('should confirm the replacement key before updating', async () => {
      mockParsedSuccess({ ...parsedData, s3Key: replacementS3Key });

      await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(verifyS3ObjectExists).toHaveBeenCalledWith(replacementS3Key);
    });

    it('should delete the old video key after a successful update', async () => {
      mockParsedSuccess({ ...parsedData, s3Key: replacementS3Key });

      await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(deleteS3Object).toHaveBeenCalledWith(currentS3Key);
    });

    it('should error and not update when the replacement key fails confirmation', async () => {
      mockParsedSuccess({ ...parsedData, s3Key: replacementS3Key });
      vi.mocked(verifyS3ObjectExists).mockResolvedValue(false);

      const result = await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(result.success).toBe(false);
      expect(VideoService.updateVideo).not.toHaveBeenCalled();
    });

    it('should still succeed when the old-key delete rejects', async () => {
      mockParsedSuccess({ ...parsedData, s3Key: replacementS3Key });
      vi.mocked(deleteS3Object).mockRejectedValue(new Error('S3 down'));

      const result = await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(result.success).toBe(true);
    });
  });

  describe('Poster replacement', () => {
    it('should delete the old poster key when the poster changed', async () => {
      mockParsedSuccess({ ...parsedData, posterUrl: 'https://cdn.example.com/new-poster.jpg' });

      await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(deleteS3Object).toHaveBeenCalledWith('media/videos/old-poster-key.jpg');
    });

    it('should not delete a poster key when the poster is unchanged', async () => {
      mockParsedSuccess();

      await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(deleteS3Object).not.toHaveBeenCalled();
    });
  });

  describe('Service failure', () => {
    it('should map a generic update failure to a general error', async () => {
      mockParsedSuccess({ ...parsedData, s3Key: replacementS3Key });
      vi.mocked(VideoService.updateVideo).mockResolvedValue({
        success: false,
        error: 'Database error',
      } as never);

      const result = await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(result.errors?.general).toEqual(['Failed to update video']);
    });

    it('should not delete any S3 object when the update fails', async () => {
      mockParsedSuccess({ ...parsedData, s3Key: replacementS3Key });
      vi.mocked(VideoService.updateVideo).mockResolvedValue({
        success: false,
        error: 'Database error',
      } as never);

      await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(deleteS3Object).not.toHaveBeenCalled();
    });

    it('should map a not-found update failure to a not-found error', async () => {
      mockParsedSuccess();
      vi.mocked(VideoService.updateVideo).mockResolvedValue({
        success: false,
        error: 'Video not found',
      } as never);

      const result = await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(result.errors?.general).toEqual(['Video not found']);
    });

    it('should map a failure without a message to a general error', async () => {
      mockParsedSuccess();
      vi.mocked(VideoService.updateVideo).mockResolvedValue({ success: false } as never);

      const result = await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(result.errors?.general).toEqual(['Failed to update video']);
    });

    it('should preserve a pre-existing errors object on a not-found failure', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false, errors: { prior: ['stale'] } },
        parsed: { success: true, data: parsedData },
      } as never);
      vi.mocked(VideoService.updateVideo).mockResolvedValue({
        success: false,
        error: 'Video not found',
      } as never);

      const result = await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(result.errors?.prior).toEqual(['stale']);
      expect(result.errors?.general).toEqual(['Video not found']);
    });

    it('should handle an unexpected error', async () => {
      mockParsedSuccess();
      vi.mocked(VideoService.updateVideo).mockRejectedValue(Error('boom'));

      await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(setUnknownError).toHaveBeenCalled();
    });
  });

  describe('Security logging and revalidation', () => {
    it('should log the update event', async () => {
      mockParsedSuccess();

      await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(logSecurityEvent).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'media.video.updated', userId: 'user-123' })
      );
    });

    it('should revalidate the admin and public video paths on success', async () => {
      mockParsedSuccess();

      await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(revalidatePath).toHaveBeenCalledWith('/admin/videos');
      expect(revalidatePath).toHaveBeenCalledWith('/videos');
    });
  });

  describe('Post-save work', () => {
    it('schedules the post-save work against the row as it was before the update', async () => {
      mockParsedSuccess();

      await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(vi.mocked(VideoService.schedulePostSave).mock.calls).toEqual([
        [
          {
            intent: 'update',
            videoId,
            next: parsedData,
            previous: { artist: 'The Band', s3Key: currentS3Key },
            createdBy: 'user-123',
          },
        ],
      ]);
    });

    it('hands a replaced file, the reviewed artist details and producers to the post-save work', async () => {
      const artistDetails = [{ sourceName: 'The Band', surname: 'Bandit' }];
      const producers = [{ name: 'Studio Pro' }];
      mockParsedSuccess({ ...parsedData, s3Key: replacementS3Key, artistDetails, producers });

      await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(vi.mocked(VideoService.schedulePostSave).mock.calls[0]?.[0].next).toEqual(
        expect.objectContaining({ s3Key: replacementS3Key, artistDetails, producers })
      );
    });

    it('does not schedule post-save work when the update fails', async () => {
      mockParsedSuccess({ ...parsedData, artist: 'New Band', producers: [{ name: 'Someone' }] });
      vi.mocked(VideoService.updateVideo).mockResolvedValue({
        success: false,
        error: 'nope',
      } as never);

      await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(VideoService.schedulePostSave).not.toHaveBeenCalled();
    });

    it('does not schedule post-save work when the current video cannot be loaded', async () => {
      mockParsedSuccess();
      vi.mocked(VideoService.getVideoById).mockResolvedValue({
        success: false,
        error: 'Video not found',
      } as never);

      await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(VideoService.schedulePostSave).not.toHaveBeenCalled();
    });

    it('does not schedule post-save work when the replacement key fails confirmation', async () => {
      mockParsedSuccess({ ...parsedData, s3Key: replacementS3Key });
      vi.mocked(verifyS3ObjectExists).mockResolvedValue(false);

      await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(VideoService.schedulePostSave).not.toHaveBeenCalled();
    });

    it('does not schedule post-save work when validation fails', async () => {
      vi.mocked(getActionState).mockReturnValue({
        formState: { fields: {}, success: false },
        parsed: { success: false, error: { issues: [] } },
      } as never);

      await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(VideoService.schedulePostSave).not.toHaveBeenCalled();
    });

    it('does not schedule post-save work when the update throws', async () => {
      mockParsedSuccess();
      vi.mocked(VideoService.updateVideo).mockRejectedValue(Error('boom'));

      await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(VideoService.schedulePostSave).not.toHaveBeenCalled();
    });

    it('does not include artistDetails in the repository update payload', async () => {
      const artistDetails = [{ sourceName: 'The Band' }];
      mockParsedSuccess({ ...parsedData, artistDetails });

      await updateVideoAction(videoId, initialFormState, mockFormData);

      const updateCall = vi.mocked(VideoService.updateVideo).mock.calls[0][1];
      expect(Object.prototype.hasOwnProperty.call(updateCall, 'artistDetails')).toBe(false);
    });

    it('does not include producers in the repository update payload', async () => {
      const producers = [{ name: 'Studio Pro' }];
      mockParsedSuccess({ ...parsedData, producers });

      await updateVideoAction(videoId, initialFormState, mockFormData);

      const updateCall = vi.mocked(VideoService.updateVideo).mock.calls[0][1];
      expect(Object.prototype.hasOwnProperty.call(updateCall, 'producers')).toBe(false);
    });
  });

  describe('Poster candidates', () => {
    const posterCandidates = [
      { url: 'https://cdn.example.com/candidate-1.jpg', atSeconds: 1, score: 0.9 },
      { url: 'https://cdn.example.com/candidate-2.jpg', atSeconds: 2, score: 0.8 },
    ];

    beforeEach(() => {
      // Namespaced-to-this-video for every candidate, regardless of input URL.
      vi.mocked(extractS3KeyFromUrl).mockReturnValue(`media/videos/${videoId}/candidate.jpg`);
    });

    it('includes candidates in the update payload when the file was replaced', async () => {
      mockParsedSuccess({ ...parsedData, s3Key: replacementS3Key, posterCandidates });

      await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(VideoService.updateVideo).toHaveBeenCalledWith(
        videoId,
        expect.objectContaining({ posterCandidates })
      );
    });

    it('omits candidates from the update payload when the s3Key is unchanged', async () => {
      mockParsedSuccess({ ...parsedData, posterCandidates });

      await updateVideoAction(videoId, initialFormState, mockFormData);

      const updateCall = vi.mocked(VideoService.updateVideo).mock.calls[0][1];
      expect(Object.prototype.hasOwnProperty.call(updateCall, 'posterCandidates')).toBe(false);
    });

    /**
     * Candidates belong to the file they were captured from (spec §7), so a
     * replacement arriving without a fresh set must not inherit the outgoing
     * file's frames — nor the poster that pointed into them (spec §9: zero
     * candidates persists nothing). The client empties `posterUrl` for exactly
     * that case; a poster it still supplies is the admin's own image.
     */
    it('clears the outgoing candidates when a replacement brings none', async () => {
      mockParsedSuccess({ ...parsedData, s3Key: replacementS3Key, posterUrl: '' });

      await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(VideoService.updateVideo).toHaveBeenCalledWith(
        videoId,
        expect.objectContaining({ posterCandidates: [] })
      );
    });

    it('clears the outgoing poster when a replacement brings none', async () => {
      mockParsedSuccess({ ...parsedData, s3Key: replacementS3Key, posterUrl: '' });

      await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(VideoService.updateVideo).toHaveBeenCalledWith(
        videoId,
        expect.objectContaining({ posterUrl: null })
      );
    });

    it('keeps a poster the replacement does supply', async () => {
      const manual = 'https://cdn.example.com/manual-poster.jpg';
      mockParsedSuccess({ ...parsedData, s3Key: replacementS3Key, posterUrl: manual });

      await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(VideoService.updateVideo).toHaveBeenCalledWith(
        videoId,
        expect.objectContaining({ posterUrl: manual })
      );
    });

    it('never clears the poster on a save that does not replace the file', async () => {
      mockParsedSuccess({ ...parsedData, posterUrl: '' });

      await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(VideoService.updateVideo).toHaveBeenCalledWith(
        videoId,
        expect.objectContaining({ posterUrl: undefined })
      );
    });

    it('drops a foreign-namespaced candidate set rather than persisting it', async () => {
      vi.mocked(extractS3KeyFromUrl).mockReturnValue('media/videos/other-video/candidate.jpg');
      mockParsedSuccess({ ...parsedData, s3Key: replacementS3Key, posterCandidates });

      await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(VideoService.updateVideo).toHaveBeenCalledWith(
        videoId,
        expect.objectContaining({ posterCandidates: [] })
      );
    });
  });
});
