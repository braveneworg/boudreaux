/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { VideoService } from '@/lib/services/video-service';
import type { VideoPosterCandidate } from '@/lib/types/domain/video';
import { posterCandidatesSchema } from '@/lib/validation/video-poster-candidate-schema';

import { runAdminEntityAction, type AdminActionResult } from './run-admin-entity-action';
import { areCandidatesForVideo } from './video-action-helpers';

/** The admin-facing refusal for any malformed or foreign frame in the batch. */
const INVALID_FRAMES_ERROR = 'Invalid poster frames';

/**
 * Server Action: persist a "Next 5 frames" batch onto the video's stored
 * candidates right after its uploads settle, so a pick on one of them is
 * instant like every other pick. `runAdminEntityAction` enforces the admin
 * role and the video id shape before `perform` runs; inside it the batch must
 * parse as a non-empty candidate list AND every URL must resolve into this
 * video's own S3 namespace — the same write-path injection guard the
 * create/update actions apply. The cap and the duplicate rule are
 * `VideoService.appendVideoPosterCandidates`'s. Returns the plain result the
 * mutation hook maps to a toast.
 */
export const appendVideoPosterCandidatesAction = async (
  videoId: string,
  candidates: VideoPosterCandidate[]
): Promise<AdminActionResult> =>
  runAdminEntityAction({
    id: videoId,
    entityLabel: 'video',
    perform: async (id) => {
      const parsed = posterCandidatesSchema.min(1).safeParse(candidates);
      if (!parsed.success || !areCandidatesForVideo(parsed.data, id)) {
        return { success: false, error: INVALID_FRAMES_ERROR, code: 'INVALID_INPUT' };
      }
      return VideoService.appendVideoPosterCandidates(id, parsed.data);
    },
    event: 'media.video.poster_candidates_appended',
    metadataKey: 'videoId',
    revalidate: ['/admin/videos', '/videos'],
    failureError: 'Failed to add poster frames',
  });
