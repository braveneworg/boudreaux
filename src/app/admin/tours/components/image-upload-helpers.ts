/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import type { ImageItem } from '@/app/components/ui/image-uploader';

/** Presigned-URL payload returned by a `generate*UploadUrlAction`. */
export interface PresignedUploadTarget {
  uploadUrl: string;
  s3Key: string;
  s3Bucket: string;
}

/** Confirmed image record returned by a `confirm*UploadAction`. */
export interface ConfirmedUpload {
  /** Present after the database insert; the upload flow guards against its absence. */
  id?: string;
  s3Url: string;
}

/** Generic `{ success, error?, data? }` shape shared by the tour image actions. */
export interface ImageActionResult<T> {
  success: boolean;
  error?: string;
  data?: T;
}

/** The successfully-uploaded image's persisted id + URL. */
export interface UploadedImage {
  id: string;
  s3Url: string;
}

/** Options for {@link uploadImageToS3}. */
export interface UploadImageOptions {
  /** The image being uploaded; its `file` must be present. */
  imageItem: ImageItem;
  /** Requests a presigned S3 upload target for the given file. */
  generateUrl: (file: File) => Promise<ImageActionResult<PresignedUploadTarget>>;
  /** Confirms the upload and creates the database record. */
  confirmUpload: (
    s3Key: string,
    s3Bucket: string,
    file: File
  ) => Promise<ImageActionResult<ConfirmedUpload>>;
  /** Called after the S3 PUT succeeds (e.g. to advance the progress bar). */
  onS3Uploaded: () => void;
}

/**
 * Runs the three-step presigned-URL upload flow for a single image:
 * request a presigned URL, PUT the file to S3, then confirm to persist the
 * record. Resolves with the persisted id + URL, or throws on any failure.
 */
export const uploadImageToS3 = async ({
  imageItem,
  generateUrl,
  confirmUpload,
  onS3Uploaded,
}: UploadImageOptions): Promise<UploadedImage> => {
  const file = imageItem.file;
  if (!file) {
    throw new Error('Image is missing its file');
  }

  // Step 1: Get presigned URL from server
  const urlResult = await generateUrl(file);
  if (!urlResult.success || !urlResult.data) {
    throw new Error(urlResult.error || 'Failed to generate upload URL');
  }

  const { uploadUrl, s3Key, s3Bucket } = urlResult.data;

  // Step 2: Upload directly to S3
  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    body: file,
    headers: { 'Content-Type': file.type },
  });

  if (!uploadResponse.ok) {
    throw new Error(`S3 upload failed: ${uploadResponse.statusText}`);
  }

  onS3Uploaded();

  // Step 3: Confirm upload with server to create database record
  const confirmResult = await confirmUpload(s3Key, s3Bucket, file);
  if (!confirmResult.success || !confirmResult.data) {
    throw new Error(confirmResult.error || 'Failed to confirm upload');
  }

  // Ensure id is present (it will be after database insert)
  const uploadedId = confirmResult.data.id;
  if (!uploadedId) {
    throw new Error('Server did not return image ID');
  }

  return { id: uploadedId, s3Url: confirmResult.data.s3Url };
};

/** Builds the next images list reflecting an in-flight upload start. */
export const markImagesUploading = (images: ImageItem[], uploading: ImageItem[]): ImageItem[] =>
  images.map((img) =>
    uploading.find((i) => i.id === img.id) ? { ...img, isUploading: true, uploadProgress: 0 } : img
  );

/** Builds the next images list advancing a single image's progress. */
export const setImageProgress = (
  images: ImageItem[],
  imageId: string,
  uploadProgress: number
): ImageItem[] => images.map((img) => (img.id === imageId ? { ...img, uploadProgress } : img));

/** Builds the next images list reflecting a completed upload. */
export const markImageUploaded = (
  images: ImageItem[],
  imageId: string,
  uploaded: UploadedImage
): ImageItem[] =>
  images.map((img) =>
    img.id === imageId
      ? {
          ...img,
          id: uploaded.id,
          isUploading: false,
          uploadProgress: 100,
          uploadedUrl: uploaded.s3Url,
          preview: uploaded.s3Url,
          error: undefined,
        }
      : img
  );

/** Builds the next images list reflecting a failed upload. */
export const markImageError = (images: ImageItem[], imageId: string, error: string): ImageItem[] =>
  images.map((img) => (img.id === imageId ? { ...img, isUploading: false, error } : img));
