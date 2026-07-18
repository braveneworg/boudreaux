/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useId, useState } from 'react';

import Image from 'next/image';

import { ImageIcon } from 'lucide-react';
import { useWatch } from 'react-hook-form';

import { Button } from '@/app/components/ui/button';
import type { VideoFormData } from '@/lib/validation/create-video-schema';

import type { Control } from 'react-hook-form';

interface VideoPosterSectionProps {
  control: Control<VideoFormData>;
  /** Poster frame captured from a freshly-selected video, offered as a candidate. */
  candidate: Blob | null;
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

/**
 * Poster capture/upload — replace-only (no clear). Priority: a poster uploaded
 * this session → the captured-frame candidate → the existing `posterUrl` → an
 * empty placeholder. "Use this frame" and the manual picker share one presign +
 * PUT path (the `uploadPoster` the parent form now owns). The form submits fine
 * without any poster; and clicking Save with only the candidate visible commits
 * it automatically (the parent auto-uploads the candidate before submitting).
 */
export const VideoPosterSection = ({
  control,
  candidate,
  uploadedPosterUrl,
  isUploading,
  errorMessage,
  uploadPoster,
}: VideoPosterSectionProps): React.ReactElement => {
  const inputId = useId();
  const existingPosterUrl = useWatch({ control, name: 'posterUrl' });

  // Create + revoke the candidate object URL in a single effect keyed on the
  // candidate blob, so StrictMode's dev double-render can't leak an orphan URL.
  const [candidateUrl, setCandidateUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!candidate) {
      setCandidateUrl(null);
      return;
    }
    const url = URL.createObjectURL(candidate);
    setCandidateUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [candidate]);

  const previewSrc = uploadedPosterUrl ?? candidateUrl ?? existingPosterUrl ?? null;
  const showUseFrame = candidate !== null && uploadedPosterUrl === null;

  const onManualPick = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (file) void uploadPoster(file);
  };

  const onUseFrame = (): void => {
    if (candidate) void uploadPoster(posterCandidateToFile(candidate));
  };

  return (
    <section className="space-y-3">
      <h2 className="font-semibold">Poster</h2>
      <PosterPreview src={previewSrc || null} />

      <div className="flex flex-wrap items-center gap-3">
        {showUseFrame ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isUploading}
            onClick={onUseFrame}
          >
            Use this frame
          </Button>
        ) : null}
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
