/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useId, useState } from 'react';

import Image from 'next/image';

import * as RadioGroupPrimitive from '@radix-ui/react-radio-group';
import { ImageIcon } from 'lucide-react';
import { useWatch } from 'react-hook-form';

import type { VideoFormData } from '@/lib/validation/create-video-schema';

import type { PosterCandidate } from './video-metadata';
import type { Control } from 'react-hook-form';

interface VideoPosterSectionProps {
  control: Control<VideoFormData>;
  /** Scored candidate frames captured from a freshly-selected video, in time order. */
  candidates: PosterCandidate[];
  /** Index of the candidate currently offered as the pending poster. */
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
}

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
  candidates: PosterCandidate[];
  candidateUrls: string[];
  selectedIndex: number;
  isUploading: boolean;
  onSelectCandidate: (index: number) => void;
}

/**
 * Radio strip of the captured frames. Selecting a thumb swaps the big preview
 * and the frame Save auto-commits — there is no explicit "use this frame" step.
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
 * this session → the selected captured-frame candidate → the existing
 * `posterUrl` → an empty placeholder. With two or more captured frames a radio
 * strip lets the admin pick the frame; Save auto-commits the visible candidate
 * (the parent uploads it before submitting), so there is no explicit commit
 * button. The manual picker shares the same presign + PUT path and overrides
 * the strip once used. The form submits fine without any poster.
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
}: VideoPosterSectionProps): React.ReactElement => {
  const inputId = useId();
  const existingPosterUrl = useWatch({ control, name: 'posterUrl' });

  // Create + revoke every thumb's object URL in a single effect keyed on the
  // candidates array, so StrictMode's dev double-render can't leak orphans.
  const [candidateUrls, setCandidateUrls] = useState<string[]>([]);
  useEffect(() => {
    if (!candidates.length) {
      setCandidateUrls([]);
      return;
    }
    const urls = candidates.map((candidate) => URL.createObjectURL(candidate.blob));
    setCandidateUrls(urls);
    return () => urls.forEach((url) => URL.revokeObjectURL(url));
  }, [candidates]);

  const selectedCandidateUrl = candidateUrls.at(selectedIndex);
  const previewSrc = uploadedPosterUrl ?? selectedCandidateUrl ?? existingPosterUrl ?? null;
  const showStrip = candidates.length > 1 && uploadedPosterUrl === null;

  const onManualPick = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (file) void uploadPoster(file);
  };

  return (
    <section className="space-y-3">
      <h2 className="font-semibold">Poster</h2>
      <PosterPreview src={previewSrc || null} />

      {showStrip ? (
        <PosterCandidateStrip
          candidates={candidates}
          candidateUrls={candidateUrls}
          selectedIndex={selectedIndex}
          isUploading={isUploading}
          onSelectCandidate={onSelectCandidate}
        />
      ) : null}

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
