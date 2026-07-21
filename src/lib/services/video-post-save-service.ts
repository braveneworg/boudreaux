/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import {
  VideoArtistRepository,
  type VideoArtistWithArtist,
} from '@/lib/repositories/video-artist-repository';
import { ProducerService } from '@/lib/services/producer-service';
import { VideoEnrichmentService } from '@/lib/services/video-enrichment-service';
import { VideoProbeService } from '@/lib/services/video-probe-service';
import type { VideoCategory } from '@/lib/types/domain/video';
import { loggers } from '@/lib/utils/logger';
import type { VideoArtistDetail } from '@/lib/validation/video-artist-detail-schema';
import type { VideoProducerInput } from '@/lib/validation/video-producer-schema';

const logger = loggers.media;

/** Which save produced the post-save work. */
export type VideoSaveIntent = 'draft' | 'create' | 'update';

/** The values a save persisted — the planner reads only what it decides on. */
export interface SavedVideoValues {
  artist: string;
  category: VideoCategory;
  s3Key: string;
  /** Absent means "the payload omitted producers"; `[]` means "clear them all". */
  producers?: VideoProducerInput[];
  artistDetails?: VideoArtistDetail[];
}

/** The stored row as it was before an update. */
export interface PreviousVideoValues {
  artist: string;
  s3Key: string;
}

/**
 * A save to plan for. `previous` is structurally required on an update and
 * absent otherwise, so the planner can never be handed an update with nothing
 * to diff against.
 */
export type VideoPostSaveInput =
  | { intent: 'draft' | 'create'; next: SavedVideoValues }
  | { intent: 'update'; next: SavedVideoValues; previous: PreviousVideoValues };

/**
 * Everything the post-save pipeline should do for one save. Each flag is
 * decided once, here, so the callers that schedule the work and the caller that
 * pre-marks the enrichment job read the same decision instead of each
 * re-deriving it.
 */
export interface VideoPostSavePlan {
  /** Sync the `VideoArtist` links from the artist string. */
  syncArtists: boolean;
  /** Probe (or re-probe) the uploaded file. */
  probe: boolean;
  /** Dispatch the async web enrichment job. */
  dispatchEnrichment: boolean;
  /**
   * Re-check the stored artist links before doing any of the above. Set only on
   * a details-only update, where an ordinary save must not re-run a job that
   * already ran at upload-complete.
   */
  confirmArtistDetailsChanged: boolean;
  /**
   * Sync the producer join rows. Scheduled in its own `after()` independently of
   * the enrichment stages, so clearing producers to `[]` always persists even
   * when nothing enrichment-relevant changed.
   */
  syncProducers: boolean;
}

/** Enrichment is dispatched only for a MUSIC video that actually names an artist. */
const dispatchesEnrichment = (next: SavedVideoValues, hasArtist: boolean): boolean =>
  hasArtist && next.category === 'MUSIC';

/**
 * A freshly uploaded file (draft or create). The file has never been probed, so
 * it always is; the artist stages run only once an artist is present, so a
 * blank-artist draft never mints an "Unknown Artist" shell.
 */
const planNewVideo = (next: SavedVideoValues, intent: VideoSaveIntent): VideoPostSavePlan => {
  const hasArtist = next.artist.trim() !== '';
  return {
    syncArtists: hasArtist,
    probe: true,
    dispatchEnrichment: dispatchesEnrichment(next, hasArtist),
    confirmArtistDetailsChanged: false,
    // A draft carries no producers; a create has nothing to clear, so an empty
    // list is a no-op rather than a sync.
    syncProducers: intent === 'create' && (next.producers?.length ?? 0) > 0,
  };
};

/**
 * An update. A changed artist string or a replaced file kicks immediately. A
 * details-only save instead defers to a comparison against the stored links —
 * the common case in the draft flow, where the job already ran at upload.
 */
const planUpdatedVideo = (
  next: SavedVideoValues,
  previous: PreviousVideoValues
): VideoPostSavePlan => {
  const hasArtist = next.artist.trim() !== '';
  const fileReplaced = next.s3Key !== previous.s3Key;
  // `undefined` means the payload omitted producers; `[]` means "clear all".
  const syncProducers = next.producers !== undefined;

  if (next.artist !== previous.artist || fileReplaced) {
    return {
      syncArtists: hasArtist,
      probe: fileReplaced,
      dispatchEnrichment: dispatchesEnrichment(next, hasArtist),
      confirmArtistDetailsChanged: false,
      syncProducers,
    };
  }

  if (next.artistDetails?.length) {
    return {
      syncArtists: hasArtist,
      probe: false,
      dispatchEnrichment: dispatchesEnrichment(next, hasArtist),
      confirmArtistDetailsChanged: true,
      syncProducers,
    };
  }

  return {
    syncArtists: false,
    probe: false,
    dispatchEnrichment: false,
    confirmArtistDetailsChanged: false,
    syncProducers,
  };
};

/**
 * Decide what post-save work one save needs. Pure — the callers schedule the
 * result; this only chooses it.
 */
export const planVideoPostSave = (input: VideoPostSaveInput): VideoPostSavePlan =>
  input.intent === 'update'
    ? planUpdatedVideo(input.next, input.previous)
    : planNewVideo(input.next, input.intent);

/**
 * True when {@link runVideoPostSave} would do anything, so a caller can skip
 * scheduling an empty `after()`. Producer sync is excluded deliberately: it runs
 * in its own `after()` and is gated on {@link VideoPostSavePlan.syncProducers}.
 */
export const videoPostSaveHasWork = (plan: VideoPostSavePlan): boolean =>
  plan.syncArtists || plan.probe || plan.dispatchEnrichment || plan.confirmArtistDetailsChanged;

/** The linked artist's matchable display name (mirrors the enrichment service). */
const linkedNameFor = (row: VideoArtistWithArtist): string =>
  (
    row.artist.displayName?.trim() || `${row.artist.firstName} ${row.artist.surname}`.trim()
  ).toLowerCase();

/** True when one provided part differs from the stored value (undefined = not provided). */
const detailPartDiffers = (stored: string | null, provided: string | undefined): boolean =>
  provided !== undefined && (stored ?? '').trim() !== provided.trim();

/**
 * True when any admin-reviewed artist detail actually differs from the linked
 * artists' stored name parts (an unmatched sourceName counts as a change).
 */
export const artistDetailsDiffer = (
  details: VideoArtistDetail[],
  rows: VideoArtistWithArtist[]
): boolean =>
  details.some((detail) => {
    const match = rows.find((row) => linkedNameFor(row) === detail.sourceName.trim().toLowerCase());
    if (!match) return true;
    return (
      detailPartDiffers(match.artist.firstName, detail.firstName) ||
      detailPartDiffers(match.artist.middleName, detail.middleName) ||
      detailPartDiffers(match.artist.surname, detail.surname) ||
      detailPartDiffers(match.artist.displayName, detail.displayName)
    );
  });

/**
 * Run one best-effort stage. A failure is logged and swallowed so the admin's
 * already-successful save is never failed retroactively by background work.
 */
const attemptStage = async (
  message: string,
  videoId: string,
  work: () => Promise<unknown>
): Promise<void> => {
  try {
    await work();
  } catch (error) {
    logger.warn(message, {
      videoId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
};

/** What {@link runVideoPostSave} needs beyond the plan itself. */
export interface RunVideoPostSaveInput {
  videoId: string;
  /** The admin-entered display artist string — the source of the artist sync. */
  artist: string;
  artistDetails?: VideoArtistDetail[];
  plan: VideoPostSavePlan;
}

/**
 * Execute a {@link VideoPostSavePlan} inside `after()`. Each stage is
 * independently best-effort — a failure is logged and the remaining stages still
 * run. Never throws.
 *
 * When the plan defers to a stored-detail comparison, that read happens first
 * and a no-op save stops here without touching the enrichment services.
 */
export const runVideoPostSave = async ({
  videoId,
  artist,
  artistDetails,
  plan,
}: RunVideoPostSaveInput): Promise<void> => {
  if (plan.confirmArtistDetailsChanged) {
    const rows = await VideoArtistRepository.findByVideoId(videoId);
    if (!artistDetailsDiffer(artistDetails ?? [], rows)) return;
  }

  if (plan.syncArtists) {
    await attemptStage('Post-save video artist sync failed', videoId, () =>
      VideoEnrichmentService.syncVideoArtists(videoId, artist, artistDetails)
    );
  }

  if (plan.probe) {
    await attemptStage('Post-save video probe failed', videoId, () =>
      VideoProbeService.probeAndPersist(videoId)
    );
  }

  if (plan.dispatchEnrichment) {
    await attemptStage('Post-save enrichment dispatch failed', videoId, () =>
      VideoEnrichmentService.runEnrichmentJob(videoId)
    );
  }
};

/** Best-effort producer-join sync (runs in `after()`, never fails the save). */
export const syncVideoProducersAfterSave = async ({
  videoId,
  producers,
  createdBy,
}: {
  videoId: string;
  producers: VideoProducerInput[];
  createdBy?: string;
}): Promise<void> => {
  await attemptStage('Post-save video producer sync failed', videoId, () =>
    ProducerService.syncVideoProducers(videoId, producers, createdBy)
  );
};
