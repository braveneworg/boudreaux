/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { VideoService } from '@/lib/services/video-service';

import { runAdminEntityAction, type AdminActionResult } from './run-admin-entity-action';

/**
 * Server action to archive a video (stamps `archivedAt`). Returns a plain
 * result the {@link useArchiveVideoMutation} hook maps to a toast.
 */
export const archiveVideoAction = async (videoId: string): Promise<AdminActionResult> =>
  runAdminEntityAction({
    id: videoId,
    entityLabel: 'video',
    perform: (id) => VideoService.archiveVideo(id),
    event: 'media.video.archived',
    metadataKey: 'videoId',
    revalidate: ['/admin/videos', '/videos'],
    failureError: 'Failed to archive video',
  });
