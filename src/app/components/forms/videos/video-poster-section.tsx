/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useId, useState } from 'react';

import Image from 'next/image';

import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { ImageIcon, RefreshCw } from 'lucide-react';
import { useWatch } from 'react-hook-form';

import { Button } from '@/app/components/ui/button';
import { VIDEO_POSTER_CANDIDATE_CAP } from '@/lib/constants/video-uploads';
import { cn } from '@/lib/utils';
import type { VideoFormData } from '@/lib/validation/create-video-schema';

import { POSTER_CANDIDATE_COUNT } from './video-metadata';

import type { NextFramesBlocker } from './use-next-poster-frames';
import type { StripCandidate } from './use-video-poster-strip';
import type { Control } from 'react-hook-form';

/** What the "Next 5 frames" button needs from `useNextPosterFrames`. */
export interface NextFramesControl {
  onRequest: () => void;
  isCapturing: boolean;
  blocker: NextFramesBlocker | null;
}

interface VideoPosterSectionProps {
  control: Control<VideoFormData>;
  /**
   * Scored candidate frames in time order — freshly captured blobs this
   * session, or the row's stored (already uploaded) candidates on a revisit.
   */
  candidates: StripCandidate[];
  /** Index of the highlighted candidate; `-1` highlights none. */
  selectedIndex: number;
  /** Swap the pending candidate (and the big preview) to another frame. */
  onSelectCandidate: (index: number) => void;
  /** CDN URL of a poster uploaded this session (highest display priority). */
  uploadedPosterUrl: string | null;
  /** True while a poster presign/PUT is in flight — disables the pick affordances. */
  isUploading: boolean;
  /** Inline poster-upload error message, or null. */
  errorMessage: string | null;
  /** Presign-and-PUT a poster image, writing `posterUrl` on success. */
  uploadPoster: (file: File) => Promise<void>;
  /**
   * The "Next 5 frames" control, or null when there is no uploaded video to
   * read later frames from (a new video before its file is picked).
   */
  nextFrames: NextFramesControl | null;
}

/** The visible label — the count is the sample window's, never hand-written. */
const NEXT_FRAMES_LABEL = `Next ${POSTER_CANDIDATE_COUNT} frames`;

/** Why the button is disabled, when that is worth a line; the upload bar already says "uploading". */
const nextFramesHint = (blocker: NextFramesBlocker | null): string | null => {
  switch (blocker) {
    case 'cap':
      return `Frame limit reached (${VIDEO_POSTER_CANDIDATE_CAP}).`;
    case 'end':
      return 'No later frames in this video.';
    case 'no-source':
      return 'The video stream is not available here.';
    default:
      return null;
  }
};

interface PosterDisplayArgs {
  uploadedPosterUrl: string | null;
  selectedCandidateUrl: string | undefined;
  existingPosterUrl: string | undefined;
  candidates: StripCandidate[];
}

/**
 * What the section shows: the preview by display priority (this session's
 * manual upload, then the highlighted thumb, then the stored poster), and
 * whether the strip renders — two or more frames, unless a manual upload
 * this session has replaced a fresh capture (a stored strip stays, so the
 * manual poster can be swapped back).
 */
const resolvePosterDisplay = ({
  uploadedPosterUrl,
  selectedCandidateUrl,
  existingPosterUrl,
  candidates,
}: PosterDisplayArgs): { previewSrc: string | null; showStrip: boolean } => {
  const previewSrc = uploadedPosterUrl ?? selectedCandidateUrl ?? existingPosterUrl ?? null;
  const hasFreshCapture = candidates.some((candidate) => 'blob' in candidate);
  const showStrip = candidates.length > 1 && (!hasFreshCapture || uploadedPosterUrl === null);
  return { previewSrc: previewSrc || null, showStrip };
};

/**
 * The round-arrow "Next 5 frames" button. Each press captures the next sample
 * window of the uploaded video and appends its frames to the strip, so the
 * admin can pick a shot from later in the video. Disabled while a capture is
 * in flight or while `blocker` names a reason, with a hint beside it for the
 * reasons the page does not already show.
 */
const NextFramesButton = ({ onRequest, isCapturing, blocker }: NextFramesControl) => {
  const hint = nextFramesHint(blocker);
  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onRequest()}
        disabled={isCapturing || blocker !== null}
        aria-busy={isCapturing}
      >
        <RefreshCw className={cn(isCapturing && 'animate-spin')} aria-hidden />
        {NEXT_FRAMES_LABEL}
      </Button>
      {hint ? <p className="text-muted-foreground text-sm">{hint}</p> : null}
    </div>
  );
};

/** Wrap a captured candidate frame as the `poster.jpg` JPEG File the upload expects. */
export const posterCandidateToFile = (candidate: Blob): File =>
  new File([candidate], 'poster.jpg', { type: 'image/jpeg' });

const PosterPreview = ({ src }: { src: string | null }): React.ReactElement =>
  src ? (
    <div className="border-input relative h-40 w-64 overflow-hidden rounded-none border">
      <Image src={src} alt="Video poster" fill className="object-cover" sizes="256px" unoptimized />
    </div>
  ) : (
    <div className="border-input flex h-40 w-64 items-center justify-center rounded-none border border-dashed text-zinc-600">
      <ImageIcon className="size-8" aria-hidden />
    </div>
  );

interface PosterCandidateStripProps {
  candidates: StripCandidate[];
  candidateUrls: string[];
  selectedIndex: number;
  isUploading: boolean;
  onSelectCandidate: (index: number) => void;
}

/**
 * Radio strip of the poster frames — the ones captured this session, or the
 * row's stored candidates on a later edit visit. Selecting a thumb swaps the
 * big preview; there is no explicit "use this frame" step, because the parent
 * either persists the pick instantly (a row exists) or auto-commits it on Save.
 * `selectedIndex` of `-1` (a manual poster is live) checks no thumb.
 */
const PosterCandidateStrip = ({
  candidates,
  candidateUrls,
  selectedIndex,
  isUploading,
  onSelectCandidate,
}: PosterCandidateStripProps): React.ReactElement => (
  <RadioGroupPrimitive.Root
    aria-label="Captured poster frames"
    orientation="horizontal"
    className="flex flex-wrap gap-2"
    value={String(selectedIndex)}
    onValueChange={(value) => onSelectCandidate(Number(value))}
    disabled={isUploading}
  >
    {candidates.map((candidate, index) => {
      const thumbUrl = candidateUrls.at(index);
      return (
        <RadioGroupPrimitive.Item
          key={candidate.atSeconds}
          value={String(index)}
          aria-label={`Frame at ${candidate.atSeconds.toFixed(1)}s`}
          className="border-input focus-visible:ring-ring/50 data-[state=checked]:border-primary data-[state=checked]:ring-primary relative h-16 w-24 shrink-0 overflow-hidden rounded-none border outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-50 data-[state=checked]:ring-2"
        >
          {thumbUrl ? (
            <Image src={thumbUrl} alt="" fill className="object-cover" sizes="96px" unoptimized />
          ) : (
            <span className="bg-muted absolute inset-0" aria-hidden />
          )}
        </RadioGroupPrimitive.Item>
      );
    })}
  </RadioGroupPrimitive.Root>
);

/**
 * Poster capture/upload — replace-only (no clear). Priority: a poster uploaded
 * this session → the selected candidate frame → the existing `posterUrl` → an
 * empty placeholder. With two or more candidates a radio strip lets the admin
 * pick the frame — freshly captured blobs this session, or the row's stored
 * candidates on a later edit visit. Picking is instant: the parent persists
 * the choice as soon as a row exists, and otherwise Save auto-commits the
 * visible candidate, so there is no explicit commit button. The manual picker
 * shares the same presign + PUT path; while its upload is the displayed poster
 * it hides a strip of frames captured this session, but a stored strip stays
 * visible (with no thumb highlighted) so a saved frame can still be picked back
 * — and the parent forgets the session upload once such a pick persists, handing
 * the preview to the picked frame. The form submits fine without any poster.
 */
export const VideoPosterSection = ({
  control,
  candidates,
  selectedIndex,
  onSelectCandidate,
  uploadedPosterUrl,
  isUploading,
  errorMessage,
  uploadPoster,
  nextFrames,
}: VideoPosterSectionProps): React.ReactElement => {
  const inputId = useId();
  const existingPosterUrl = useWatch({ control, name: 'posterUrl' });

  // Create + revoke every blob thumb's object URL in a single effect keyed on
  // the candidates array, so StrictMode's dev double-render can't leak orphans.
  // Stored candidates already have a CDN URL — only what was created here is
  // ever revoked.
  const [candidateUrls, setCandidateUrls] = useState<string[]>([]);
  useEffect(() => {
    if (!candidates.length) {
      setCandidateUrls([]);
      return;
    }
    const created: string[] = [];
    const urls = candidates.map((candidate) => {
      if ('url' in candidate) return candidate.url;
      const objectUrl = URL.createObjectURL(candidate.blob);
      created.push(objectUrl);
      return objectUrl;
    });
    setCandidateUrls(urls);
    return () => created.forEach((url) => URL.revokeObjectURL(url));
  }, [candidates]);

  // `.at(-1)` would wrap to the last thumb — a `-1` index means "none".
  const selectedCandidateUrl = selectedIndex >= 0 ? candidateUrls.at(selectedIndex) : undefined;
  const { previewSrc, showStrip } = resolvePosterDisplay({
    uploadedPosterUrl,
    selectedCandidateUrl,
    existingPosterUrl,
    candidates,
  });

  const onManualPick = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (file) void uploadPoster(file);
  };

  return (
    <section className="space-y-3">
      <h2 className="font-semibold">Poster</h2>
      <PosterPreview src={previewSrc} />

      {showStrip ? (
        <PosterCandidateStrip
          candidates={candidates}
          candidateUrls={candidateUrls}
          selectedIndex={selectedIndex}
          isUploading={isUploading}
          onSelectCandidate={onSelectCandidate}
        />
      ) : null}

      {nextFrames ? <NextFramesButton {...nextFrames} /> : null}

      <div className="flex flex-wrap items-center gap-3">
        <label htmlFor={inputId} className="cursor-pointer text-sm font-medium underline">
          Upload a poster image
        </label>
        <input
          id={inputId}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          aria-label="Upload a poster image"
          className="sr-only"
          disabled={isUploading}
          onChange={onManualPick}
        />
      </div>

      {errorMessage ? (
        <p role="alert" className="text-destructive text-sm">
          {errorMessage}
        </p>
      ) : null}
    </section>
  );
};
