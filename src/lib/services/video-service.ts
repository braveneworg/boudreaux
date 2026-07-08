/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { VIDEO_KEY_PREFIX } from '@/lib/constants/video-uploads';
import { VideoRepository } from '@/lib/repositories/video-repository';
import type {
  CreateVideoData,
  UpdateVideoData,
  Video,
  VideoListFilters,
} from '@/lib/types/domain/video';
import { deleteS3Object } from '@/utils/s3-client';
import { extractS3KeyFromUrl } from '@/utils/s3-key-utils';

import { failFromError } from './_internal/map-data-error';

import type { ServiceResponse } from './service.types';

/**
 * Collect the S3 keys to remove when a video is hard-deleted:
 * always the stored `s3Key`; plus the key derived from `posterUrl` when set
 * and extractable. URL→key extraction (CDN and S3 styles) is delegated to
 * {@link extractS3KeyFromUrl}.
 */
const collectVideoS3Keys = ({ s3Key, posterUrl }: Video): string[] => {
  const keys: string[] = [s3Key];

  if (posterUrl) {
    const posterKey = extractS3KeyFromUrl(posterUrl);
    // Only delete poster objects in our own namespace — an admin-supplied
    // posterUrl could otherwise point cleanup at release audio or artist images.
    if (posterKey?.startsWith(VIDEO_KEY_PREFIX)) keys.push(posterKey);
  }

  return keys;
};

export class VideoService {
  /** Create a new video. */
  static async createVideo(data: CreateVideoData): Promise<ServiceResponse<Video>> {
    try {
      const video = await VideoRepository.create(data);
      return { success: true, data: video };
    } catch (error) {
      return failFromError(error, {
        DUPLICATE: 'Video with this title already exists',
        UNKNOWN: 'Failed to create video',
      });
    }
  }

  /** Get a video by id. Returns a NOT_FOUND failure when the video is missing. */
  static async getVideoById(id: string): Promise<ServiceResponse<Video>> {
    try {
      const video = await VideoRepository.findById(id);

      if (!video) {
        return { success: false, error: 'Video not found' };
      }

      return { success: true, data: video };
    } catch (error) {
      return failFromError(error, { UNKNOWN: 'Failed to retrieve video' });
    }
  }

  /**
   * Get videos for the admin listing with optional filters (search, published,
   * archived, sort, skip, take). All filtering logic is owned by the repository.
   */
  static async getVideos(filters: VideoListFilters): Promise<ServiceResponse<Video[]>> {
    try {
      const videos = await VideoRepository.findMany(filters);
      return { success: true, data: videos };
    } catch (error) {
      return failFromError(error, { UNKNOWN: 'Failed to retrieve videos' });
    }
  }

  /**
   * Get a page of published, non-archived videos for the public `/videos`
   * listing. Pagination only — no search or publish/archived filtering.
   */
  static async getPublishedVideos(
    filters: Pick<VideoListFilters, 'sort' | 'skip' | 'take'>
  ): Promise<ServiceResponse<Video[]>> {
    try {
      const videos = await VideoRepository.findPublished(filters);
      return { success: true, data: videos };
    } catch (error) {
      return failFromError(error, { UNKNOWN: 'Failed to retrieve videos' });
    }
  }

  /** Update a video by id. */
  static async updateVideo(id: string, data: UpdateVideoData): Promise<ServiceResponse<Video>> {
    try {
      const video = await VideoRepository.update(id, data);
      return { success: true, data: video };
    } catch (error) {
      return failFromError(error, {
        NOT_FOUND: 'Video not found',
        UNKNOWN: 'Failed to update video',
      });
    }
  }

  /** Publish a video by stamping `publishedAt` with the current time. */
  static async publishVideo(id: string): Promise<ServiceResponse<Video>> {
    try {
      const video = await VideoRepository.update(id, { publishedAt: new Date() });
      return { success: true, data: video };
    } catch (error) {
      return failFromError(error, {
        NOT_FOUND: 'Video not found',
        UNKNOWN: 'Failed to publish video',
      });
    }
  }

  /** Unpublish a video by clearing `publishedAt` to null. */
  static async unpublishVideo(id: string): Promise<ServiceResponse<Video>> {
    try {
      const video = await VideoRepository.update(id, { publishedAt: null });
      return { success: true, data: video };
    } catch (error) {
      return failFromError(error, {
        NOT_FOUND: 'Video not found',
        UNKNOWN: 'Failed to unpublish video',
      });
    }
  }

  /** Archive a video by stamping `archivedAt` with the current time. */
  static async archiveVideo(id: string): Promise<ServiceResponse<Video>> {
    try {
      const video = await VideoRepository.update(id, { archivedAt: new Date() });
      return { success: true, data: video };
    } catch (error) {
      return failFromError(error, {
        NOT_FOUND: 'Video not found',
        UNKNOWN: 'Failed to archive video',
      });
    }
  }

  /** Restore a video from the archive by clearing `archivedAt` to null. */
  static async restoreVideo(id: string): Promise<ServiceResponse<Video>> {
    try {
      const video = await VideoRepository.update(id, { archivedAt: null });
      return { success: true, data: video };
    } catch (error) {
      return failFromError(error, {
        NOT_FOUND: 'Video not found',
        UNKNOWN: 'Failed to restore video',
      });
    }
  }

  /**
   * Hard-delete a video by id, with best-effort S3 cleanup.
   *
   * 1. Verify the video exists and collect its S3 keys (`s3Key` + optional
   *    poster URL) for cleanup.
   * 2. Delete the DB row first — a failed S3 cleanup must never resurrect the
   *    row.
   * 3. Best-effort S3 cleanup via `Promise.allSettled`. S3 failures are caught
   *    internally by {@link deleteS3Object} and are never thrown, never changing
   *    the success result.
   */
  static async deleteVideo(id: string): Promise<ServiceResponse<Video>> {
    try {
      const existing = await VideoRepository.findById(id);

      if (!existing) {
        return { success: false, error: 'Video not found' };
      }

      const s3KeysToDelete = collectVideoS3Keys(existing);

      const video = await VideoRepository.delete(id);

      // Best-effort S3 cleanup (fire-and-forget)
      Promise.allSettled(s3KeysToDelete.map((key) => deleteS3Object(key))).catch(() => {
        // Silently ignore — S3 objects will be cleaned up by lifecycle rules
      });

      return { success: true, data: video };
    } catch (error) {
      return failFromError(error, {
        NOT_FOUND: 'Video not found',
        UNKNOWN: 'Failed to delete video',
      });
    }
  }
}
