/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useEffect, useId, useMemo } from 'react';

import Image from 'next/image';

import { ImageIcon } from 'lucide-react';
import { useWatch } from 'react-hook-form';

import { Button } from '@/app/components/ui/button';
import type { VideoFormData } from '@/lib/validation/create-video-schema';

import { useVideoPosterUpload } from './use-video-poster-upload';

import type { Control, UseFormSetValue } from 'react-hook-form';

interface VideoPosterSectionProps {
  control: Control<VideoFormData>;
  setValue: UseFormSetValue<VideoFormData>;
  preGeneratedId: string;
  /** Poster frame captured from a freshly-selected video, offered as a candidate. */
  candidate: Blob | null;
}

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
 * PUT path; the form submits fine without any poster.
 */
export const VideoPosterSection = ({
  control,
  setValue,
  preGeneratedId,
  candidate,
}: VideoPosterSectionProps): React.ReactElement => {
  const inputId = useId();
  const existingPosterUrl = useWatch({ control, name: 'posterUrl' });
  const { uploadedPosterUrl, isUploading, errorMessage, uploadPoster } = useVideoPosterUpload({
    preGeneratedId,
    setValue,
  });

  const candidateUrl = useMemo(
    () => (candidate ? URL.createObjectURL(candidate) : null),
    [candidate]
  );
  useEffect(
    () => () => {
      if (candidateUrl) URL.revokeObjectURL(candidateUrl);
    },
    [candidateUrl]
  );

  const previewSrc = uploadedPosterUrl ?? candidateUrl ?? existingPosterUrl ?? null;
  const showUseFrame = candidate !== null && uploadedPosterUrl === null;

  const onManualPick = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.target.files?.[0];
    if (file) void uploadPoster(file);
  };

  const onUseFrame = (): void => {
    if (candidate) void uploadPoster(new File([candidate], 'poster.jpg', { type: 'image/jpeg' }));
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
