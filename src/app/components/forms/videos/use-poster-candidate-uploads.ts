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

/** Wrap one captured frame as the JPEG File the presigned PUT expects. */
const candidateFile = (candidate: PosterCandidate, index: number): File =>
  new File([candidate.blob], `poster-candidate-${index + 1}.jpg`, { type: 'image/jpeg' });

/** PUT one candidate; null on any failure (skip-and-continue contract). */
const uploadOne = async (
  candidate: PosterCandidate,
  index: number,
  presigned: { uploadUrl: string; s3Key: string; cdnUrl: string } | undefined
): Promise<VideoPosterCandidate | null> => {
  if (!presigned) return null;
  const result = await uploadFileToS3(candidateFile(candidate, index), presigned);
  return result.success
    ? { url: result.cdnUrl, atSeconds: candidate.atSeconds, score: candidate.score }
    : null;
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
 * a network call, so the previous file's frames can never be persisted for a
 * new one.
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
      const presigned = await getPresignedUploadUrlsAction(
        'videos',
        preGeneratedId,
        candidates.map((candidate, index) => ({
          fileName: `poster-candidate-${index + 1}.jpg`,
          contentType: 'image/jpeg',
          fileSize: candidate.blob.size,
        }))
      );
      if (!presigned.success || !presigned.data) return [];
      const targets = presigned.data;
      const aligned = await Promise.all(
        candidates.map((candidate, index) => uploadOne(candidate, index, targets.at(index)))
      );
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
