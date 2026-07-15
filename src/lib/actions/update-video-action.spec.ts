/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { revalidatePath } from 'next/cache';

import { ProducerService } from '@/lib/services/producer-service';
import { VideoEnrichmentService } from '@/lib/services/video-enrichment-service';
import { VideoProbeService } from '@/lib/services/video-probe-service';
import { VideoService } from '@/lib/services/video-service';
import type { FormState } from '@/lib/types/form-state';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { setUnknownError } from '@/lib/utils/auth/auth-utils';
import { getActionState } from '@/lib/utils/auth/get-action-state';
import { requireRole } from '@/lib/utils/auth/require-role';
import { deleteS3Object, verifyS3ObjectExists } from '@/lib/utils/s3-client';
import { extractS3KeyFromUrl } from '@/lib/utils/s3-key-utils';

import { updateVideoAction } from './update-video-action';

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('@/lib/services/video-service');
vi.mock('@/lib/utils/audit-log');
vi.mock('@/lib/utils/auth/auth-utils');
vi.mock('@/lib/utils/auth/get-action-state');
vi.mock('@/lib/utils/auth/require-role');
vi.mock('@/lib/utils/s3-client');
vi.mock('@/lib/utils/s3-key-utils');
vi.mock('@/lib/services/video-enrichment-service', () => ({
  VideoEnrichmentService: { syncVideoArtists: vi.fn(), runEnrichmentJob: vi.fn() },
}));
vi.mock('@/lib/services/video-probe-service', () => ({
  VideoProbeService: { probeAndPersist: vi.fn() },
}));
vi.mock('@/lib/services/producer-service', () => ({
  ProducerService: { syncVideoProducers: vi.fn() },
}));

// Capture the after() callback so tests can run the "background" kick on demand.
let afterCallback: (() => Promise<void>) | null = null;
vi.mock('next/server', () => ({
  after: (cb: () => Promise<void>) => {
    afterCallback = cb;
  },
}));

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
  vi.mocked(requireRole).mockResolvedValue(mockSession as never);
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
  afterCallback = null;
  vi.mocked(VideoEnrichmentService.syncVideoArtists).mockResolvedValue(undefined);
  vi.mocked(VideoEnrichmentService.runEnrichmentJob).mockResolvedValue(undefined);
  vi.mocked(VideoProbeService.probeAndPersist).mockResolvedValue(undefined);
  vi.mocked(ProducerService.syncVideoProducers).mockResolvedValue(undefined);
});

describe('updateVideoAction', () => {
  describe('Authorization', () => {
    it('should require admin role', async () => {
      vi.mocked(requireRole).mockRejectedValue(Error('Unauthorized'));

      await expect(updateVideoAction(videoId, initialFormState, mockFormData)).rejects.toThrow(
        'Unauthorized'
      );
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

  describe('Post-update enrichment kick', () => {
    it('does not schedule a kick when nothing enrichment-relevant changed', async () => {
      mockParsedSuccess();

      await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(afterCallback).toBeNull();
    });

    it('schedules a kick when the artist string changed', async () => {
      mockParsedSuccess({ ...parsedData, artist: 'New Band' });

      await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(afterCallback).toBeTypeOf('function');
    });

    it('re-syncs artists with the new artist string', async () => {
      mockParsedSuccess({ ...parsedData, artist: 'New Band' });

      await updateVideoAction(videoId, initialFormState, mockFormData);
      await afterCallback?.();

      expect(VideoEnrichmentService.syncVideoArtists).toHaveBeenCalledWith(
        videoId,
        'New Band',
        undefined
      );
    });

    it('does not re-probe on an artist-only change', async () => {
      mockParsedSuccess({ ...parsedData, artist: 'New Band' });

      await updateVideoAction(videoId, initialFormState, mockFormData);
      await afterCallback?.();

      expect(VideoProbeService.probeAndPersist).not.toHaveBeenCalled();
    });

    it('re-probes when the video file was replaced', async () => {
      mockParsedSuccess({ ...parsedData, s3Key: replacementS3Key });

      await updateVideoAction(videoId, initialFormState, mockFormData);
      await afterCallback?.();

      expect(VideoProbeService.probeAndPersist).toHaveBeenCalledWith(videoId);
    });

    it('re-dispatches enrichment for a MUSIC video on file replacement', async () => {
      mockParsedSuccess({ ...parsedData, s3Key: replacementS3Key });

      await updateVideoAction(videoId, initialFormState, mockFormData);
      await afterCallback?.();

      expect(VideoEnrichmentService.runEnrichmentJob).toHaveBeenCalledWith(videoId);
    });

    it('does not dispatch enrichment for an INFORMATIONAL video', async () => {
      mockParsedSuccess({ ...parsedData, artist: 'New Band', category: 'INFORMATIONAL' });

      await updateVideoAction(videoId, initialFormState, mockFormData);
      await afterCallback?.();

      expect(VideoEnrichmentService.runEnrichmentJob).not.toHaveBeenCalled();
    });

    it('does not schedule a kick when the update fails', async () => {
      mockParsedSuccess({ ...parsedData, artist: 'New Band' });
      vi.mocked(VideoService.updateVideo).mockResolvedValue({
        success: false,
        error: 'nope',
      } as never);

      await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(afterCallback).toBeNull();
    });

    it('schedules a kick when artistDetails is non-empty (new trigger)', async () => {
      const artistDetails = [{ sourceName: 'The Band' }];
      mockParsedSuccess({ ...parsedData, artistDetails });

      await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(afterCallback).toBeTypeOf('function');
    });

    it('does not include artistDetails in the repository update payload', async () => {
      const artistDetails = [{ sourceName: 'The Band' }];
      mockParsedSuccess({ ...parsedData, artistDetails });

      await updateVideoAction(videoId, initialFormState, mockFormData);

      const updateCall = vi.mocked(VideoService.updateVideo).mock.calls[0][1];
      expect(Object.prototype.hasOwnProperty.call(updateCall, 'artistDetails')).toBe(false);
    });

    it('does not schedule a kick when artistDetails is empty (regression pin)', async () => {
      mockParsedSuccess({ ...parsedData, artistDetails: [] });

      await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(afterCallback).toBeNull();
    });

    it('does not schedule a kick when artist unchanged, no file replaced, and no artistDetails', async () => {
      mockParsedSuccess();

      await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(afterCallback).toBeNull();
    });

    it('forwards artistDetails to syncVideoArtists when present', async () => {
      const artistDetails = [{ sourceName: 'The Band', displayName: 'The Band (official)' }];
      mockParsedSuccess({ ...parsedData, artistDetails });

      await updateVideoAction(videoId, initialFormState, mockFormData);
      await afterCallback?.();

      expect(VideoEnrichmentService.syncVideoArtists).toHaveBeenCalledWith(
        videoId,
        parsedData.artist,
        artistDetails
      );
    });

    it('schedules a kick when producers is non-empty (new trigger)', async () => {
      const producers = [{ name: 'New Producer' }];
      mockParsedSuccess({ ...parsedData, producers });

      await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(afterCallback).toBeTypeOf('function');
    });

    it('does not schedule a kick when producers is empty (regression pin)', async () => {
      mockParsedSuccess({ ...parsedData, producers: [] });

      await updateVideoAction(videoId, initialFormState, mockFormData);

      expect(afterCallback).toBeNull();
    });

    it('syncs producers when producers is non-empty', async () => {
      const producers = [{ name: 'Studio Pro' }, { id: 'p2', name: 'Rick' }];
      mockParsedSuccess({ ...parsedData, producers });

      await updateVideoAction(videoId, initialFormState, mockFormData);
      await afterCallback?.();

      expect(ProducerService.syncVideoProducers).toHaveBeenCalledWith(
        videoId,
        producers,
        'user-123'
      );
    });

    it('does not call syncVideoProducers when producers is absent', async () => {
      mockParsedSuccess({ ...parsedData, artist: 'New Band' });

      await updateVideoAction(videoId, initialFormState, mockFormData);
      await afterCallback?.();

      expect(ProducerService.syncVideoProducers).not.toHaveBeenCalled();
    });

    it('does not include producers in the repository update payload', async () => {
      const producers = [{ name: 'Studio Pro' }];
      mockParsedSuccess({ ...parsedData, producers });

      await updateVideoAction(videoId, initialFormState, mockFormData);

      const updateCall = vi.mocked(VideoService.updateVideo).mock.calls[0][1];
      expect(Object.prototype.hasOwnProperty.call(updateCall, 'producers')).toBe(false);
    });
  });
});
