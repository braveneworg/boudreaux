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

/**
 * Maximum file size in bytes (10MB)
 */
export const MAX_FILE_SIZE = 10 * 1024 * 1024;

/**
 * Maximum number of images per tour
 */
export const MAX_IMAGES_PER_TOUR = 10;

/**
 * Schema for image upload request
 */
export const imageUploadRequestSchema = z.object({
  tourId: z.string().min(1, 'Tour ID is required'),
  fileName: z.string().min(1, 'File name is required').max(255, 'File name too long'),
  fileSize: z
    .number()
    .min(1, 'File size must be greater than 0')
    .max(MAX_FILE_SIZE, `File size must not exceed ${MAX_FILE_SIZE / 1024 / 1024}MB`),
  mimeType: z.enum(SUPPORTED_IMAGE_TYPES, {
    message: `Invalid file type. Supported types: ${SUPPORTED_IMAGE_TYPES.join(', ')}`,
  }),
});

export type ImageUploadRequest = z.infer<typeof imageUploadRequestSchema>;

/**
 * Schema for presigned URL response
 */
export const presignedUrlResponseSchema = z.object({
  uploadUrl: z.string().url('Invalid upload URL'),
  s3Key: z.string().min(1, 'S3 key is required'),
  s3Bucket: z.string().min(1, 'S3 bucket is required'),
  expiresIn: z.number().positive('Expiration time must be positive'),
});

export type PresignedUrlResponse = z.infer<typeof presignedUrlResponseSchema>;

/**
 * Schema for image metadata after upload
 */
export const imageMetadataSchema = z.object({
  id: z.string().optional(),
  tourId: z.string().min(1, 'Tour ID is required'),
  s3Key: z.string().min(1, 'S3 key is required'),
  s3Url: z.string().url('Invalid S3 URL'),
  s3Bucket: z.string().min(1, 'S3 bucket is required'),
  fileName: z.string().min(1, 'File name is required'),
  fileSize: z.number().positive('File size must be positive'),
  mimeType: z.enum(SUPPORTED_IMAGE_TYPES),
  displayOrder: z.number().int().min(0, 'Display order must be non-negative').default(0),
  altText: z.string().max(500, 'Alt text too long').optional(),
  uploadedBy: z.string().optional(),
});

export type ImageMetadata = z.infer<typeof imageMetadataSchema>;

/**
 * Schema for confirm upload request (client to server)
 * s3Url and displayOrder are computed server-side
 */
export const confirmUploadSchema = z.object({
  tourId: z.string().min(1, 'Tour ID is required'),
  s3Key: z.string().min(1, 'S3 key is required'),
  s3Bucket: z.string().min(1, 'S3 bucket is required'),
  fileName: z.string().min(1, 'File name is required'),
  fileSize: z.number().positive('File size must be positive'),
  mimeType: z.enum(SUPPORTED_IMAGE_TYPES),
  altText: z.string().max(500, 'Alt text too long').optional(),
});

export type ConfirmUploadRequest = z.infer<typeof confirmUploadSchema>;

/**
 * Schema for image reorder request
 */
export const imageReorderSchema = z.object({
  tourId: z.string().min(1, 'Tour ID is required'),
  imageOrders: z
    .array(
      z.object({
        id: z.string().min(1, 'Image ID is required'),
        displayOrder: z.number().int().min(0, 'Display order must be non-negative'),
      })
    )
    .min(1, 'At least one image must be provided')
    .max(MAX_IMAGES_PER_TOUR, `Cannot reorder more than ${MAX_IMAGES_PER_TOUR} images`),
});

export type ImageReorder = z.infer<typeof imageReorderSchema>;

/**
 * Schema for delete image request
 */
export const deleteImageSchema = z.object({
  imageId: z.string().min(1, 'Image ID is required'),
  tourId: z.string().min(1, 'Tour ID is required'),
});

export type DeleteImageRequest = z.infer<typeof deleteImageSchema>;

/**
 * Schema for updating image alt text
 */
export const updateImageAltTextSchema = z.object({
  imageId: z.string().min(1, 'Image ID is required'),
  altText: z.string().max(500, 'Alt text too long').optional(),
});

export type UpdateImageAltText = z.infer<typeof updateImageAltTextSchema>;
