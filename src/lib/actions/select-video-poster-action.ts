/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { z } from 'zod';

import { VideoService } from '@/lib/services/video-service';
import { isHttpUrl } from '@/lib/utils/is-http-url';

import { runAdminEntityAction, type AdminActionResult } from './run-admin-entity-action';

/** Shape gate for the admin-supplied poster pick — http(s) only, bounded length. */
const candidateUrlSchema = z
  .string()
  .max(2048)
  .refine(isHttpUrl, { message: 'Must be an http(s) URL' });

/**
 * Server Action: instant-persist an admin's poster pick. `runAdminEntityAction`
 * enforces the admin role and the video id shape before `perform` ever runs;
 * the URL shape is validated inside `perform` for the same reason (never do
 * client-suppliable work before the auth/id gate). The stored-candidate
 * membership rule itself is enforced by `VideoService.selectVideoPoster`.
 * Returns the plain result the mutation hook maps to a toast.
 */
export const selectVideoPosterAction = async (
  videoId: string,
  candidateUrl: string
): Promise<AdminActionResult> =>
  runAdminEntityAction({
    id: videoId,
    entityLabel: 'video',
    perform: async (id) => {
      if (!candidateUrlSchema.safeParse(candidateUrl).success) {
        return { success: false, error: 'Invalid poster URL' };
      }
      return VideoService.selectVideoPoster(id, candidateUrl);
    },
    event: 'media.video.poster_selected',
    metadataKey: 'videoId',
    revalidate: ['/admin/videos', '/videos'],
    failureError: 'Failed to set the poster',
  });
