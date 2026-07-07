/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { VideoService } from '@/lib/services/video-service';

import { runAdminEntityAction, type AdminActionResult } from './run-admin-entity-action';

/**
 * Server action to hard-delete a video. `VideoService.deleteVideo` removes the
 * DB row first, then best-effort deletes the video's S3 objects (the stored
 * `s3Key` plus the poster key derived from `posterUrl`). Returns a plain result
 * the {@link useDeleteVideoMutation} hook maps to a toast.
 */
export const deleteVideoAction = async (videoId: string): Promise<AdminActionResult> =>
  runAdminEntityAction({
    id: videoId,
    entityLabel: 'video',
    perform: (id) => VideoService.deleteVideo(id),
    event: 'media.video.deleted',
    metadataKey: 'videoId',
    revalidate: ['/admin/videos', '/videos'],
    failureError: 'Failed to delete video',
  });
