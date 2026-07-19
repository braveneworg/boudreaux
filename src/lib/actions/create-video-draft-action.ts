/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use server';

import 'server-only';

import { revalidatePath } from 'next/cache';
import { after } from 'next/server';

import { VideoRepository } from '@/lib/repositories/video-repository';
import { VideoService } from '@/lib/services/video-service';
import type { CreateVideoData } from '@/lib/types/domain/video';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { requireRole } from '@/lib/utils/auth/require-role';
import { loggers } from '@/lib/utils/logger';
import { videoDraftSchema, type VideoDraftInput } from '@/lib/validation/video-draft-schema';
import { parseVideoFilename } from '@/utils/parse-video-filename';

import {
  confirmVideoUpload,
  kickPostSaveEnrichment,
  parseDurationSeconds,
  parseFileSize,
} from './video-action-helpers';

const logger = loggers.media;

/** Result of the draft create — the caller degrades gracefully on failure. */
export type CreateVideoDraftResult =
  | { success: true; videoId: string }
  | { success: false; error: string };

/** Draft title: the form value, else the cleaned filename stem. */
const draftTitle = (title: string | undefined, fileName: string): string => {
  const provided = title?.trim();
  if (provided) return provided.slice(0, 200);
  const parsed = parseVideoFilename(fileName).title.trim();
  return (parsed || fileName).slice(0, 200);
};

/** Draft release date: the form value when parseable, else today (UTC day). */
const draftReleasedOn = (value: string | undefined): Date => {
  if (value) {
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date(new Date().toISOString().slice(0, 10));
};

/** Repository payload for the draft — `publishedAt` omitted: always a draft. */
const buildDraftCreateInput = (data: VideoDraftInput, userId: string): CreateVideoData => ({
  id: data.preGeneratedId,
  title: draftTitle(data.title, data.fileName),
  artist: data.artist?.trim() ?? '',
  category: data.category,
  description: data.description?.trim() || undefined,
  releasedOn: draftReleasedOn(data.releasedOn),
  durationSeconds: parseDurationSeconds(data.durationSeconds),
  s3Key: data.s3Key,
  fileName: data.fileName,
  fileSize: parseFileSize(data.fileSize),
  mimeType: data.mimeType,
  createdBy: userId,
});

const DRAFT_FAILED: CreateVideoDraftResult = {
  success: false,
  error: 'Could not create the draft.',
};

/**
 * Pre-response `pending` handoff for the auto-kicked enrichment. The edit
 * page's status poll only re-arms while a job is in flight, so the status must
 * be in-flight BEFORE the client's first fetch — the dispatch itself runs
 * post-response in `after()` (mirrors runVideoEnrichmentAction). Gated on the
 * same conditions under which kickPostSaveEnrichment will actually dispatch.
 * Best-effort: a failure never blocks the draft; the kick's own `processing`
 * write self-heals the status.
 */
const markEnrichmentPending = async ({
  videoId,
  artist,
  category,
}: {
  videoId: string;
  artist: string;
  category: VideoDraftInput['category'];
}): Promise<void> => {
  if (category !== 'MUSIC' || artist.trim() === '') return;
  try {
    await VideoRepository.setEnrichmentStatus(videoId, 'pending');
  } catch (error) {
    logger.warn('video_draft_enrichment_pending_failed', {
      videoId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/**
 * Server Action: create the video row as an unpublished draft the moment the
 * S3 multipart upload completes, so enrichment can run while the admin is
 * still filling the form. Idempotent (an existing row returns success and
 * changes nothing — guards double-fire on flaky networks). When enrichment
 * will dispatch (MUSIC + non-blank artist) the job is marked `pending` before
 * the response so the edit page's status poll engages. In `after()` the
 * post-save pipeline probes always; artist sync + enrichment run only when
 * the artist snapshot is non-blank (gate inside kickPostSaveEnrichment).
 * A failure here NEVER blocks the upload — the form falls back to
 * create-on-submit.
 */
export const createVideoDraftAction = async (input: unknown): Promise<CreateVideoDraftResult> => {
  const session = await requireRole('admin');
  const parsed = videoDraftSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid draft request.' };
  const data = parsed.data;

  try {
    const existing = await VideoService.getVideoById(data.preGeneratedId);
    if (existing.success) return { success: true, videoId: data.preGeneratedId };

    const confirmError = await confirmVideoUpload(data.s3Key, data.preGeneratedId);
    if (confirmError) return { success: false, error: confirmError };

    const response = await VideoService.createVideo(buildDraftCreateInput(data, session.user.id));
    logSecurityEvent({
      event: 'media.video.created',
      userId: session.user.id,
      metadata: { videoId: data.preGeneratedId, draft: true, success: response.success },
    });
    if (!response.success) {
      logger.warn('video_draft_create_failed', {
        videoId: data.preGeneratedId,
        error: response.error,
      });
      return DRAFT_FAILED;
    }

    revalidatePath('/admin/videos');
    await markEnrichmentPending({
      videoId: response.data.id,
      artist: data.artist ?? '',
      category: data.category,
    });
    after(() =>
      kickPostSaveEnrichment({
        videoId: response.data.id,
        artist: data.artist ?? '',
        category: data.category,
        reProbe: true,
        artistDetails: data.artistDetails,
      })
    );
    return { success: true, videoId: response.data.id };
  } catch (error) {
    logger.error('video_draft_create_error', {
      videoId: data.preGeneratedId,
      error: error instanceof Error ? error.message : String(error),
    });
    return DRAFT_FAILED;
  }
};
