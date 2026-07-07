/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { VideoService } from '@/lib/services/video-service';

import { runAdminEntityAction, type AdminActionResult } from './run-admin-entity-action';

/**
 * Server action to restore a video from the archive (clears `archivedAt`).
 * Returns a plain result the {@link useRestoreVideoMutation} hook maps to a
 * toast.
 */
export const restoreVideoAction = async (videoId: string): Promise<AdminActionResult> =>
  runAdminEntityAction({
    id: videoId,
    entityLabel: 'video',
    perform: (id) => VideoService.restoreVideo(id),
    event: 'media.video.restored',
    metadataKey: 'videoId',
    revalidate: ['/admin/videos', '/videos'],
    failureError: 'Failed to restore video',
  });
