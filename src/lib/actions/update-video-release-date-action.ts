/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { VideoService } from '@/lib/services/video-service';
import { videoReleaseDateSchema } from '@/lib/validation/video-release-date-schema';

import { runAdminEntityAction, type AdminActionResult } from './run-admin-entity-action';

/**
 * Server Action: persist ONLY a video's release date — the autosave behind the
 * edit form's date field (an admin pick or an AI fill on a row that already
 * exists). `runAdminEntityAction` enforces the admin role and the id shape
 * before `perform` runs; the day shape is validated inside `perform` for the
 * same reason (never do client-suppliable work before the auth/id gate). A
 * `YYYY-MM-DD` day is stored as UTC midnight (the same convention as the full
 * form save); `''` clears the date, which `VideoService.updateVideoReleaseDate`
 * refuses on a published video. Returns the plain result the mutation hook
 * maps to a toast.
 */
export const updateVideoReleaseDateAction = async (
  videoId: string,
  releasedOn: string
): Promise<AdminActionResult> =>
  runAdminEntityAction({
    id: videoId,
    entityLabel: 'video',
    perform: async (id) => {
      const parsed = videoReleaseDateSchema.safeParse(releasedOn);
      if (!parsed.success) {
        return { success: false, error: 'Invalid release date' };
      }
      return VideoService.updateVideoReleaseDate(id, parsed.data ? new Date(parsed.data) : null);
    },
    event: 'media.video.release_date_set',
    metadataKey: 'videoId',
    revalidate: ['/admin/videos', '/videos'],
    failureError: 'Failed to save the release date',
  });
