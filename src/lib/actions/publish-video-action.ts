/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { VideoService } from '@/lib/services/video-service';

import { runAdminEntityAction, type AdminActionResult } from './run-admin-entity-action';

/**
 * Server action to publish a video (stamps `publishedAt`). Returns a plain
 * result the {@link usePublishVideoMutation} hook maps to a toast.
 */
export const publishVideoAction = async (videoId: string): Promise<AdminActionResult> =>
  runAdminEntityAction({
    id: videoId,
    entityLabel: 'video',
    perform: (id) => VideoService.publishVideo(id),
    event: 'media.video.published',
    metadataKey: 'videoId',
    revalidate: ['/admin/videos', '/videos'],
    failureError: 'Failed to publish video',
  });
