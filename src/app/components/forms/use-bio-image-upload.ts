/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { useCallback, useState } from 'react';

import type { ArtistBioImageRecord } from '@/lib/types/domain/artist';

import { uploadBioImage } from './utils/upload-bio-image';

/** Image types the presign step accepts for artist bio images. */
export const BIO_IMAGE_UPLOAD_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

/** Presign rejects larger images; mirrored in the zone's hint so it is honest. */
export const MAX_BIO_IMAGE_SIZE_MB = 50;

const WRONG_TYPE_MESSAGE = 'Choose a JPEG, PNG, or WebP image.';
const GENERIC_FAILURE_MESSAGE = 'Failed to upload image';

/** What the admin entered alongside the file; blank alt gets the artist's name server-side. */
export interface BioImageUploadFields {
  alt: string | null;
  attribution: string;
}

export interface UseBioImageUploadOptions {
  artistId: string;
  /** Called with the persisted row after a successful upload. */
  onUploaded: (image: ArtistBioImageRecord) => void;
}

export interface BioImageUpload {
  /** Runs the pipeline for one file; resolves true on success, false otherwise. */
  upload: (file: File, fields: BioImageUploadFields) => Promise<boolean>;
  isUploading: boolean;
  /** Why the last upload failed, phrased for the admin, or null. */
  errorMessage: string | null;
}

/**
 * One upload into the artist's bio image pool, shared by the upload zone and
 * the display-image drop target: type-checks the file, runs the presign → S3
 * → register → variants pipeline, and keeps the in-flight flag and the last
 * failure so either surface can show them inline.
 */
export const useBioImageUpload = ({
  artistId,
  onUploaded,
}: UseBioImageUploadOptions): BioImageUpload => {
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const upload = useCallback(
    async (file: File, { alt, attribution }: BioImageUploadFields): Promise<boolean> => {
      if (!(BIO_IMAGE_UPLOAD_TYPES as readonly string[]).includes(file.type)) {
        setErrorMessage(WRONG_TYPE_MESSAGE);
        return false;
      }
      setErrorMessage(null);
      setIsUploading(true);
      try {
        const result = await uploadBioImage(file, { artistId, attribution, alt });
        if (!result.success || !result.data) {
          setErrorMessage(result.error ?? GENERIC_FAILURE_MESSAGE);
          return false;
        }
        onUploaded(result.data);
        return true;
      } finally {
        setIsUploading(false);
      }
    },
    [artistId, onUploaded]
  );

  return { upload, isUploading, errorMessage };
};
