/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { VideoRepository } from '@/lib/repositories/video-repository';
import { DataError } from '@/lib/types/domain/errors';
import type {
  CreateVideoData,
  UpdateVideoData,
  Video,
  VideoListFilters,
} from '@/lib/types/domain/video';

import { VideoService } from './video-service';

// Mock server-only to prevent client component error in tests
vi.mock('server-only', () => ({}));

vi.mock('../utils/s3-client', () => ({
  deleteS3Object: vi.fn().mockResolvedValue(true),
}));

vi.mock('../utils/s3-key-utils', () => ({
  extractS3KeyFromUrl: vi.fn().mockReturnValue(null),
}));

vi.mock('@/lib/repositories/video-repository', () => ({
  VideoRepository: {
    create: vi.fn(),
    findById: vi.fn(),
    findMany: vi.fn(),
    findPublished: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}));

describe('VideoService', () => {
  const mockVideo: Video = {
    id: 'video-123',
    title: 'Test Video',
    artist: 'Test Artist',
    category: 'MUSIC',
    description: null,
    releasedOn: new Date('2024-01-15'),
    durationSeconds: 180,
    s3Key: 'videos/video-123/test.mp4',
    fileName: 'test.mp4',
    fileSize: BigInt(1024 * 1024),
    mimeType: 'video/mp4',
    posterUrl: null,
    publishedAt: null,
    archivedAt: null,
    createdBy: null,
    updatedBy: null,
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
  };

  describe('createVideo', () => {
    const createInput: CreateVideoData = {
      title: 'Test Video',
      artist: 'Test Artist',
      category: 'MUSIC',
      releasedOn: new Date('2024-01-15'),
      s3Key: 'videos/video-123/test.mp4',
      fileName: 'test.mp4',
      mimeType: 'video/mp4',
    };

    it('creates a video successfully', async () => {
      vi.mocked(VideoRepository.create).mockResolvedValue(mockVideo);

      const result = await VideoService.createVideo(createInput);

      expect(result).toMatchObject({ success: true, data: mockVideo });
      expect(VideoRepository.create).toHaveBeenCalledWith(createInput);
    });

    it('maps a DataError to a failure response', async () => {
      vi.mocked(VideoRepository.create).mockRejectedValue(
        new DataError('DUPLICATE', 'Unique constraint failed')
      );

      const result = await VideoService.createVideo(createInput);

      expect(result).toMatchObject({
        success: false,
        error: 'Video with this title already exists',
      });
    });

    it('maps an unknown error to a failure response', async () => {
      vi.mocked(VideoRepository.create).mockRejectedValue(new Error('Unknown error'));

      const result = await VideoService.createVideo(createInput);

      expect(result).toMatchObject({ success: false, error: 'Failed to create video' });
    });
  });

  describe('getVideoById', () => {
    it('returns a video by id', async () => {
      vi.mocked(VideoRepository.findById).mockResolvedValue(mockVideo);

      const result = await VideoService.getVideoById('video-123');

      expect(result).toMatchObject({ success: true, data: mockVideo });
      expect(VideoRepository.findById).toHaveBeenCalledWith('video-123');
    });

    it('returns a NOT_FOUND failure when the video is missing', async () => {
      vi.mocked(VideoRepository.findById).mockResolvedValue(null);

      const result = await VideoService.getVideoById('non-existent');

      expect(result).toMatchObject({ success: false, error: 'Video not found' });
    });

    it('maps a DataError to a failure response', async () => {
      vi.mocked(VideoRepository.findById).mockRejectedValue(
        new DataError('UNAVAILABLE', 'Connection failed')
      );

      const result = await VideoService.getVideoById('video-123');

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('maps an unknown error to a failure response', async () => {
      vi.mocked(VideoRepository.findById).mockRejectedValue(new Error('Unknown error'));

      const result = await VideoService.getVideoById('video-123');

      expect(result).toMatchObject({ success: false, error: 'Failed to retrieve video' });
    });
  });

  describe('getVideos', () => {
    it('returns a list of videos', async () => {
      vi.mocked(VideoRepository.findMany).mockResolvedValue([mockVideo]);

      const result = await VideoService.getVideos({});

      expect(result).toMatchObject({ success: true, data: [mockVideo] });
      expect(VideoRepository.findMany).toHaveBeenCalledWith({});
    });

    it('forwards filters to the repository', async () => {
      vi.mocked(VideoRepository.findMany).mockResolvedValue([]);
      const filters: VideoListFilters = { search: 'test', published: true };

      await VideoService.getVideos(filters);

      expect(VideoRepository.findMany).toHaveBeenCalledWith(filters);
    });

    it('maps a DataError to a failure response', async () => {
      vi.mocked(VideoRepository.findMany).mockRejectedValue(
        new DataError('UNAVAILABLE', 'Connection failed')
      );

      const result = await VideoService.getVideos({});

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('maps an unknown error to a failure response', async () => {
      vi.mocked(VideoRepository.findMany).mockRejectedValue(new Error('Unknown error'));

      const result = await VideoService.getVideos({});

      expect(result).toMatchObject({ success: false, error: 'Failed to retrieve videos' });
    });
  });

  describe('getPublishedVideos', () => {
    it('returns published videos', async () => {
      const published = { ...mockVideo, publishedAt: new Date('2024-01-10') };
      vi.mocked(VideoRepository.findPublished).mockResolvedValue([published]);

      const result = await VideoService.getPublishedVideos({});

      expect(result).toMatchObject({ success: true, data: [published] });
      expect(VideoRepository.findPublished).toHaveBeenCalledWith({});
    });

    it('forwards pagination filters to the repository', async () => {
      vi.mocked(VideoRepository.findPublished).mockResolvedValue([]);

      await VideoService.getPublishedVideos({ skip: 5, take: 10, sort: 'asc' });

      expect(VideoRepository.findPublished).toHaveBeenCalledWith({
        skip: 5,
        take: 10,
        sort: 'asc',
      });
    });

    it('maps a DataError to a failure response', async () => {
      vi.mocked(VideoRepository.findPublished).mockRejectedValue(
        new DataError('UNAVAILABLE', 'Connection failed')
      );

      const result = await VideoService.getPublishedVideos({});

      expect(result).toMatchObject({ success: false, error: 'Database unavailable' });
    });

    it('maps an unknown error to a failure response', async () => {
      vi.mocked(VideoRepository.findPublished).mockRejectedValue(new Error('Unknown error'));

      const result = await VideoService.getPublishedVideos({});

      expect(result).toMatchObject({ success: false, error: 'Failed to retrieve videos' });
    });
  });

  describe('updateVideo', () => {
    const updateData: UpdateVideoData = { title: 'Updated Video' };

    it('updates a video successfully', async () => {
      const updated = { ...mockVideo, title: 'Updated Video' };
      vi.mocked(VideoRepository.update).mockResolvedValue(updated);

      const result = await VideoService.updateVideo('video-123', updateData);

      expect(result).toMatchObject({ success: true, data: updated });
      expect(VideoRepository.update).toHaveBeenCalledWith('video-123', updateData);
    });

    it('maps a DataError NOT_FOUND to a failure response', async () => {
      vi.mocked(VideoRepository.update).mockRejectedValue(
        new DataError('NOT_FOUND', 'Record not found')
      );

      const result = await VideoService.updateVideo('non-existent', updateData);

      expect(result).toMatchObject({ success: false, error: 'Video not found' });
    });

    it('maps an unknown error to a failure response', async () => {
      vi.mocked(VideoRepository.update).mockRejectedValue(new Error('Unknown error'));

      const result = await VideoService.updateVideo('video-123', updateData);

      expect(result).toMatchObject({ success: false, error: 'Failed to update video' });
    });
  });

  describe('publishVideo', () => {
    it('stamps publishedAt with the current time', async () => {
      const published = { ...mockVideo, publishedAt: new Date() };
      vi.mocked(VideoRepository.update).mockResolvedValue(published);

      const result = await VideoService.publishVideo('video-123');

      expect(result).toMatchObject({ success: true, data: published });
      expect(VideoRepository.update).toHaveBeenCalledWith('video-123', {
        publishedAt: expect.any(Date),
      });
    });

    it('maps a DataError NOT_FOUND to a failure response', async () => {
      vi.mocked(VideoRepository.update).mockRejectedValue(
        new DataError('NOT_FOUND', 'Record not found')
      );

      const result = await VideoService.publishVideo('non-existent');

      expect(result).toMatchObject({ success: false, error: 'Video not found' });
    });

    it('maps an unknown error to a failure response', async () => {
      vi.mocked(VideoRepository.update).mockRejectedValue(new Error('Unknown error'));

      const result = await VideoService.publishVideo('video-123');

      expect(result).toMatchObject({ success: false, error: 'Failed to publish video' });
    });
  });

  describe('unpublishVideo', () => {
    it('clears publishedAt to null', async () => {
      const unpublished = { ...mockVideo, publishedAt: null };
      vi.mocked(VideoRepository.update).mockResolvedValue(unpublished);

      const result = await VideoService.unpublishVideo('video-123');

      expect(result).toMatchObject({ success: true, data: unpublished });
      expect(VideoRepository.update).toHaveBeenCalledWith('video-123', { publishedAt: null });
    });

    it('maps a DataError NOT_FOUND to a failure response', async () => {
      vi.mocked(VideoRepository.update).mockRejectedValue(
        new DataError('NOT_FOUND', 'Record not found')
      );

      const result = await VideoService.unpublishVideo('non-existent');

      expect(result).toMatchObject({ success: false, error: 'Video not found' });
    });

    it('maps an unknown error to a failure response', async () => {
      vi.mocked(VideoRepository.update).mockRejectedValue(new Error('Unknown error'));

      const result = await VideoService.unpublishVideo('video-123');

      expect(result).toMatchObject({ success: false, error: 'Failed to unpublish video' });
    });
  });

  describe('archiveVideo', () => {
    it('stamps archivedAt with the current time', async () => {
      const archived = { ...mockVideo, archivedAt: new Date() };
      vi.mocked(VideoRepository.update).mockResolvedValue(archived);

      const result = await VideoService.archiveVideo('video-123');

      expect(result).toMatchObject({ success: true, data: archived });
      expect(VideoRepository.update).toHaveBeenCalledWith('video-123', {
        archivedAt: expect.any(Date),
      });
    });

    it('maps a DataError NOT_FOUND to a failure response', async () => {
      vi.mocked(VideoRepository.update).mockRejectedValue(
        new DataError('NOT_FOUND', 'Record not found')
      );

      const result = await VideoService.archiveVideo('non-existent');

      expect(result).toMatchObject({ success: false, error: 'Video not found' });
    });

    it('maps an unknown error to a failure response', async () => {
      vi.mocked(VideoRepository.update).mockRejectedValue(new Error('Unknown error'));

      const result = await VideoService.archiveVideo('video-123');

      expect(result).toMatchObject({ success: false, error: 'Failed to archive video' });
    });
  });

  describe('restoreVideo', () => {
    it('clears archivedAt to null', async () => {
      const restored = { ...mockVideo, archivedAt: null };
      vi.mocked(VideoRepository.update).mockResolvedValue(restored);

      const result = await VideoService.restoreVideo('video-123');

      expect(result).toMatchObject({ success: true, data: restored });
      expect(VideoRepository.update).toHaveBeenCalledWith('video-123', { archivedAt: null });
    });

    it('maps a DataError NOT_FOUND to a failure response', async () => {
      vi.mocked(VideoRepository.update).mockRejectedValue(
        new DataError('NOT_FOUND', 'Record not found')
      );

      const result = await VideoService.restoreVideo('non-existent');

      expect(result).toMatchObject({ success: false, error: 'Video not found' });
    });

    it('maps an unknown error to a failure response', async () => {
      vi.mocked(VideoRepository.update).mockRejectedValue(new Error('Unknown error'));

      const result = await VideoService.restoreVideo('video-123');

      expect(result).toMatchObject({ success: false, error: 'Failed to restore video' });
    });
  });

  describe('deleteVideo', () => {
    it('returns NOT_FOUND when the video does not exist, and does not call delete', async () => {
      vi.mocked(VideoRepository.findById).mockResolvedValue(null);

      const result = await VideoService.deleteVideo('non-existent');

      expect(result).toMatchObject({ success: false, error: 'Video not found' });
      expect(VideoRepository.delete).not.toHaveBeenCalled();
    });

    it('deletes both s3Key and poster key when posterUrl is set and extractable', async () => {
      const { deleteS3Object } = await import('../utils/s3-client');
      const { extractS3KeyFromUrl } = await import('../utils/s3-key-utils');
      const withPoster = { ...mockVideo, posterUrl: 'https://cdn.example.com/posters/test.jpg' };
      vi.mocked(VideoRepository.findById).mockResolvedValue(withPoster);
      vi.mocked(VideoRepository.delete).mockResolvedValue(withPoster);
      vi.mocked(extractS3KeyFromUrl).mockReturnValue('media/videos/video-123/poster.jpg');

      const result = await VideoService.deleteVideo('video-123');

      expect(result).toMatchObject({ success: true });
      expect(deleteS3Object).toHaveBeenCalledWith('videos/video-123/test.mp4');
      expect(deleteS3Object).toHaveBeenCalledWith('media/videos/video-123/poster.jpg');
    });

    it('does not delete a poster key outside the video namespace', async () => {
      const { deleteS3Object } = await import('../utils/s3-client');
      const { extractS3KeyFromUrl } = await import('../utils/s3-key-utils');
      const withPoster = {
        ...mockVideo,
        posterUrl: 'https://cdn.example.com/releases/x/cover.jpg',
      };
      vi.mocked(VideoRepository.findById).mockResolvedValue(withPoster);
      vi.mocked(VideoRepository.delete).mockResolvedValue(withPoster);
      vi.mocked(extractS3KeyFromUrl).mockReturnValue('media/releases/x/cover.jpg');

      const result = await VideoService.deleteVideo('video-123');

      expect(result).toMatchObject({ success: true });
      expect(deleteS3Object).toHaveBeenCalledTimes(1);
      expect(deleteS3Object).toHaveBeenCalledWith('videos/video-123/test.mp4');
    });

    it('deletes only the s3Key when posterUrl is null', async () => {
      const { deleteS3Object } = await import('../utils/s3-client');
      vi.mocked(VideoRepository.findById).mockResolvedValue(mockVideo);
      vi.mocked(VideoRepository.delete).mockResolvedValue(mockVideo);

      const result = await VideoService.deleteVideo('video-123');

      expect(result).toMatchObject({ success: true });
      expect(deleteS3Object).toHaveBeenCalledTimes(1);
      expect(deleteS3Object).toHaveBeenCalledWith('videos/video-123/test.mp4');
    });

    it('deletes only the s3Key when extractS3KeyFromUrl returns null for posterUrl', async () => {
      const { deleteS3Object } = await import('../utils/s3-client');
      const { extractS3KeyFromUrl } = await import('../utils/s3-key-utils');
      const withPoster = { ...mockVideo, posterUrl: 'https://external.example.com/poster.jpg' };
      vi.mocked(VideoRepository.findById).mockResolvedValue(withPoster);
      vi.mocked(VideoRepository.delete).mockResolvedValue(withPoster);
      vi.mocked(extractS3KeyFromUrl).mockReturnValue(null);

      const result = await VideoService.deleteVideo('video-123');

      expect(result).toMatchObject({ success: true });
      expect(deleteS3Object).toHaveBeenCalledTimes(1);
      expect(deleteS3Object).toHaveBeenCalledWith('videos/video-123/test.mp4');
    });

    it('returns success even when S3 deletion rejects', async () => {
      const { deleteS3Object } = await import('../utils/s3-client');
      vi.mocked(VideoRepository.findById).mockResolvedValue(mockVideo);
      vi.mocked(VideoRepository.delete).mockResolvedValue(mockVideo);
      vi.mocked(deleteS3Object).mockRejectedValueOnce(new Error('S3 error'));

      const result = await VideoService.deleteVideo('video-123');

      expect(result).toMatchObject({ success: true });
    });

    it('returns failure and does not attempt S3 cleanup when DB delete rejects', async () => {
      const { deleteS3Object } = await import('../utils/s3-client');
      vi.mocked(VideoRepository.findById).mockResolvedValue(mockVideo);
      vi.mocked(VideoRepository.delete).mockRejectedValue(
        new DataError('NOT_FOUND', 'Record not found')
      );

      const result = await VideoService.deleteVideo('video-123');

      expect(result).toMatchObject({ success: false, error: 'Video not found' });
      expect(deleteS3Object).not.toHaveBeenCalled();
    });
  });
});
