/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useId, useRef, useState } from 'react';
import type { ChangeEvent, JSX } from 'react';

import { ImageIcon } from 'lucide-react';

import { Input } from '@/app/components/ui/input';
import { Label } from '@/app/components/ui/label';
import { UploaderDropZone } from '@/app/components/ui/uploader-drop-zone';
import { useUploaderDrag } from '@/app/components/ui/use-uploader-drag';
import type { ArtistBioImageRecord } from '@/lib/types/domain/artist';

import { uploadBioImage } from './utils/upload-bio-image';

/** Image types the presign step accepts for artist bio images. */
export const BIO_IMAGE_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Presign rejects larger images; mirrored here so the hint is honest. */
const MAX_IMAGE_SIZE_MB = 50;

export interface BioImageUploadZoneProps {
  artistId: string;
  /** Called with the persisted row after a successful upload. */
  onUploaded: (image: ArtistBioImageRecord) => void;
  disabled?: boolean;
}

/**
 * Upload one image into the artist's bio image pool: alt text and attribution
 * are collected up front (alt is what makes the upload eligible as a display
 * image; attribution is optional for the label's own photos), then the shared
 * presign → S3 → register → variants pipeline runs. Errors stay inline.
 */
export const BioImageUploadZone = ({
  artistId,
  onUploaded,
  disabled = false,
}: BioImageUploadZoneProps): JSX.Element => {
  const inputId = useId();
  const altId = useId();
  const attributionId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [alt, setAlt] = useState('');
  const [attribution, setAttribution] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const upload = async (file: File): Promise<void> => {
    if (!(BIO_IMAGE_UPLOAD_TYPES as readonly string[]).includes(file.type)) {
      setErrorMessage('Choose a JPEG, PNG, or WebP image.');
      return;
    }
    setErrorMessage(null);
    setIsUploading(true);
    try {
      const result = await uploadBioImage(file, {
        artistId,
        attribution: attribution.trim(),
        alt: alt.trim() || null,
      });
      if (!result.success || !result.data) {
        setErrorMessage(result.error ?? 'Failed to upload image');
        return;
      }
      setAlt('');
      setAttribution('');
      onUploaded(result.data);
    } finally {
      setIsUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleFiles = (files: FileList | null): void => {
    // Index access rather than `.item()` so a synthetic drop's plain array works too.
    const file = files?.[0];
    if (!file || disabled || isUploading) return;
    void upload(file);
  };

  const { isDragOver, handleDrop, handleDragOver, handleDragLeave } = useUploaderDrag(handleFiles);

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>): void => {
    handleFiles(event.target.files);
  };

  const altMissing = alt.trim().length === 0;

  return (
    <div className="space-y-2">
      <h3 className="text-sm font-semibold">Upload an image</h3>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={altId} className="text-xs">
            Alt text
          </Label>
          <Input
            id={altId}
            value={alt}
            onChange={(event) => setAlt(event.target.value)}
            maxLength={500}
            disabled={disabled || isUploading}
            placeholder="Describe the picture"
            className="h-7 text-xs"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={attributionId} className="text-xs">
            Attribution (optional)
          </Label>
          <Input
            id={attributionId}
            value={attribution}
            onChange={(event) => setAttribution(event.target.value)}
            maxLength={500}
            disabled={disabled || isUploading}
            placeholder="Photo by …"
            className="h-7 text-xs"
          />
        </div>
      </div>
      {altMissing && (
        <p className="text-muted-foreground text-xs">
          Add alt text to use this upload as a display image.
        </p>
      )}
      <UploaderDropZone
        inputRef={inputRef}
        inputId={inputId}
        accept={BIO_IMAGE_UPLOAD_TYPES.join(',')}
        multiple={false}
        onChange={handleInputChange}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        label="Upload bio image"
        isDragOver={isDragOver}
        isDisabled={disabled || isUploading}
        disabled={disabled}
        currentCount={0}
        maxCount={1}
        countUnit="image"
        icon={<ImageIcon className="mb-1 size-6 text-zinc-600" aria-hidden />}
        acceptedTypesLabel="jpeg, png, webp"
        maxSizeMb={MAX_IMAGE_SIZE_MB}
        maxReachedLabel="Upload in progress"
        containerClassName="min-h-24 p-3"
      />
      {isUploading && (
        <p role="status" className="text-xs text-zinc-950">
          Uploading…
        </p>
      )}
      {errorMessage && (
        <p role="alert" className="text-destructive text-xs">
          {errorMessage}
        </p>
      )}
    </div>
  );
};
