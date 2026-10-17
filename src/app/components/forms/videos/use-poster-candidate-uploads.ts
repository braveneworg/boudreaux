/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useRef, useState } from 'react';

import { getPresignedUploadUrlsAction } from '@/lib/actions/presigned-upload-actions';
import type { VideoPosterCandidate } from '@/lib/types/domain/video';
import { uploadFileToS3 } from '@/lib/utils/direct-upload';

import type { PosterCandidate } from './video-metadata';

export interface UsePosterCandidateUploadsResult {
  /**
   * Kick the parallel presign+PUT fan-out for a fresh candidate set. An empty
   * set resets the fan-out state without touching the network — call it for
   * every capture, including the ones that produced nothing.
   */
  startUploads: (candidates: PosterCandidate[]) => void;
  /** Index-aligned uploaded candidates (null = that frame's upload failed). Empty until settled. */
  alignedNow: (VideoPosterCandidate | null)[];
  /** Resolves once the in-flight fan-out settles (immediately-[] when none started). */
  getSettledAligned: () => Promise<(VideoPosterCandidate | null)[]>;
}

/** The display name of the frame at `ordinal` (1-based across every batch of a video). */
const candidateFileName = (ordinal: number): string => `poster-candidate-${ordinal}.jpg`;

/** Wrap one captured frame as the JPEG File the presigned PUT expects. */
const candidateFile = (candidate: PosterCandidate, ordinal: number): File =>
  new File([candidate.blob], candidateFileName(ordinal), { type: 'image/jpeg' });

/** PUT one candidate; null on any failure (skip-and-continue contract). */
const uploadOne = async (
  candidate: PosterCandidate,
  ordinal: number,
  presigned: { uploadUrl: string; s3Key: string; cdnUrl: string } | undefined
): Promise<VideoPosterCandidate | null> => {
  if (!presigned) return null;
  const result = await uploadFileToS3(candidateFile(candidate, ordinal), presigned);
  return result.success
    ? { url: result.cdnUrl, atSeconds: candidate.atSeconds, score: candidate.score }
    : null;
};

/**
 * One presign batch plus parallel PUTs for a set of captured frames, resolving
 * the index-aligned uploaded candidates (`null` where a PUT failed, `[]` when
 * the presign batch itself failed). `ordinalOffset` numbers the files after
 * the frames the video already holds, so a "Next 5 frames" batch reads
 * `poster-candidate-6.jpg` onward; the S3 keys carry their own unique suffix,
 * so the names are for humans only. Shared by the upload-time fan-out hook
 * and the next-frames capture.
 */
export const uploadPosterCandidates = async (
  candidates: PosterCandidate[],
  preGeneratedId: string,
  ordinalOffset: number
): Promise<(VideoPosterCandidate | null)[]> => {
  const presigned = await getPresignedUploadUrlsAction(
    'videos',
    preGeneratedId,
    candidates.map((candidate, index) => ({
      fileName: candidateFileName(ordinalOffset + index + 1),
      contentType: 'image/jpeg',
      fileSize: candidate.blob.size,
    }))
  );
  if (!presigned.success || !presigned.data) return [];
  const targets = presigned.data;
  return Promise.all(
    candidates.map((candidate, index) =>
      uploadOne(candidate, ordinalOffset + index + 1, targets.at(index))
    )
  );
};

/**
 * Fire-and-track fan-out that persists every captured poster candidate to S3
 * the moment capture finishes — one presign batch, parallel PUTs,
 * skip-and-continue per frame. Zero successes degrades to the legacy
 * Save-time blob upload; nothing here ever blocks the video upload.
 *
 * Latest-run-wins: if `startUploads` is called again before an in-flight
 * fan-out settles, the older run's network resolution is discarded rather
 * than clobbering `alignedNow` with stale, index-misaligned candidates. That
 * holds for a capture that produced nothing too — it resets the state without
 * a network call, so THIS hook never hands a previous file's frames to a new
 * one. (A stale frame can still reach a submit through the form's `posterUrl`
 * field when a draft already wrote it — that lives outside this hook.)
 */
export const usePosterCandidateUploads = ({
  preGeneratedId,
}: {
  preGeneratedId: string;
}): UsePosterCandidateUploadsResult => {
  const [alignedNow, setAlignedNow] = useState<(VideoPosterCandidate | null)[]>([]);
  const settledRef = useRef<Promise<(VideoPosterCandidate | null)[]>>(Promise.resolve([]));
  const generationRef = useRef<number>(0);

  const runUploads = useCallback(
    async (
      candidates: PosterCandidate[],
      generation: number
    ): Promise<(VideoPosterCandidate | null)[]> => {
      const aligned = await uploadPosterCandidates(candidates, preGeneratedId, 0);
      // Only the newest run may publish to alignedNow — an older run that
      // resolves after a newer one started would otherwise overwrite it with
      // stale, index-misaligned data.
      if (generationRef.current === generation) {
        setAlignedNow(aligned);
      }
      return aligned;
    },
    [preGeneratedId]
  );

  const startUploads = useCallback(
    (candidates: PosterCandidate[]): void => {
      const generation = (generationRef.current += 1);
      // Unconditional: this reset always reflects the newest run, regardless
      // of which run's network settles first.
      setAlignedNow([]);
      // An empty capture (an undecodable file, or E2E's fake capture) still
      // resets both halves of the state — the previous file's frames must not
      // ride the new one's draft/save payload — but presigning zero files is
      // pure noise the Server Action would only refuse. The generation bump
      // above still discards any older run in flight.
      if (candidates.length === 0) {
        settledRef.current = Promise.resolve([]);
        return;
      }
      // Never rejects: presign/PUT failures resolve to []/nulls above; a thrown
      // network error degrades to the legacy Save-time path.
      settledRef.current = runUploads(candidates, generation).catch(() => []);
    },
    [runUploads]
  );

  const getSettledAligned = useCallback(() => settledRef.current, []);

  return { startUploads, alignedNow, getSettledAligned };
};
