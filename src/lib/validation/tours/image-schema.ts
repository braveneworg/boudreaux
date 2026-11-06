/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { z } from 'zod';

/**
 * Supported image MIME types
 */
export const SUPPORTED_IMAGE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
] as const;

/** One supported image MIME type. */
export type SupportedImageType = (typeof SUPPORTED_IMAGE_TYPES)[number];

/**
 * Maximum file size in bytes (10MB)
 */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/** How many images a tour may hold. */
export const MAX_IMAGES_PER_TOUR = 10;

/** How many images a tour date may hold. */
export const MAX_IMAGES_PER_TOUR_DATE = 20;

// The request shapes of a tour's and a tour date's images are the same
// fields with a different owner field (`tourId` / `tourDateId`) and cap, so
// each pair is built from one set of fields.

const tourOwner = { tourId: z.string().min(1, 'Tour ID is required') };
const tourDateOwner = { tourDateId: z.string().min(1, 'Tour date ID is required') };

const mimeType = z.enum(SUPPORTED_IMAGE_TYPES, {
  message: `Invalid file type. Supported types: ${SUPPORTED_IMAGE_TYPES.join(', ')}`,
});

/** The file an admin asks to upload. */
const fileFields = {
  fileName: z.string().min(1, 'File name is required').max(255, 'File name too long'),
  fileSize: z
    .number()
    .min(1, 'File size must be greater than 0')
    .max(MAX_FILE_SIZE, `File size must not exceed ${MAX_FILE_SIZE / 1024 / 1024}MB`),
  mimeType,
};

/** An object the browser put in the bucket; s3Url and displayOrder are set server-side. */
const uploadedFields = {
  s3Key: z.string().min(1, 'S3 key is required'),
  s3Bucket: z.string().min(1, 'S3 bucket is required'),
  fileName: z.string().min(1, 'File name is required'),
  fileSize: z.number().positive('File size must be positive'),
  mimeType: z.enum(SUPPORTED_IMAGE_TYPES),
  altText: z.string().max(500, 'Alt text too long').optional(),
};

/** A new order for up to `max` of the owner's images. */
const imageOrders = (max: number) =>
  z
    .array(
      z.object({
        id: z.string().min(1, 'Image ID is required'),
        displayOrder: z.number().int().min(0, 'Display order must be non-negative'),
      })
    )
    .min(1, 'At least one image must be provided')
    .max(max, `Cannot reorder more than ${max} images`);

const imageId = { imageId: z.string().min(1, 'Image ID is required') };

const altTextFields = {
  ...imageId,
  altText: z.string().max(500, 'Alt text too long').optional(),
};

/**
 * Schema for presigned URL response
 */
export const presignedUrlResponseSchema = z.object({
  uploadUrl: z.url('Invalid upload URL'),
  s3Key: z.string().min(1, 'S3 key is required'),
  s3Bucket: z.string().min(1, 'S3 bucket is required'),
  expiresIn: z.number().positive('Expiration time must be positive'),
});

export type PresignedUrlResponse = z.infer<typeof presignedUrlResponseSchema>;

// ── A tour's images ─────────────────────────────────────────────────────────

export const imageUploadRequestSchema = z.object({ ...tourOwner, ...fileFields });
export type ImageUploadRequest = z.infer<typeof imageUploadRequestSchema>;

export const confirmUploadSchema = z.object({ ...tourOwner, ...uploadedFields });
export type ConfirmUploadRequest = z.infer<typeof confirmUploadSchema>;

export const imageReorderSchema = z.object({
  ...tourOwner,
  imageOrders: imageOrders(MAX_IMAGES_PER_TOUR),
});
export type ImageReorder = z.infer<typeof imageReorderSchema>;

export const deleteImageSchema = z.object({ ...imageId, ...tourOwner });
export type DeleteImageRequest = z.infer<typeof deleteImageSchema>;

export const updateImageAltTextSchema = z.object(altTextFields);
export type UpdateImageAltText = z.infer<typeof updateImageAltTextSchema>;

// ── A tour date's images ────────────────────────────────────────────────────

export const tourDateImageUploadRequestSchema = z.object({ ...tourDateOwner, ...fileFields });
export type TourDateImageUploadRequest = z.infer<typeof tourDateImageUploadRequestSchema>;

export const tourDateConfirmUploadSchema = z.object({ ...tourDateOwner, ...uploadedFields });
export type TourDateConfirmUploadRequest = z.infer<typeof tourDateConfirmUploadSchema>;

export const tourDateImageReorderSchema = z.object({
  ...tourDateOwner,
  imageOrders: imageOrders(MAX_IMAGES_PER_TOUR_DATE),
});
export type TourDateImageReorder = z.infer<typeof tourDateImageReorderSchema>;

export const tourDateDeleteImageSchema = z.object({ ...imageId, ...tourDateOwner });
export type TourDateDeleteImageRequest = z.infer<typeof tourDateDeleteImageSchema>;

export const tourDateUpdateImageAltTextSchema = z.object(altTextFields);
export type TourDateUpdateImageAltText = z.infer<typeof tourDateUpdateImageAltTextSchema>;
