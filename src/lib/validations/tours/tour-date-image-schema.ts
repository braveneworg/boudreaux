/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { z } from 'zod';

import { MAX_FILE_SIZE, SUPPORTED_IMAGE_TYPES } from './image-schema';

/**
 * Maximum number of images per tour date
 */
export const MAX_IMAGES_PER_TOUR_DATE = 20;

/**
 * Schema for tour date image upload request
 */
export const tourDateImageUploadRequestSchema = z.object({
  tourDateId: z.string().min(1, 'Tour date ID is required'),
  fileName: z.string().min(1, 'File name is required').max(255, 'File name too long'),
  fileSize: z
    .number()
    .min(1, 'File size must be greater than 0')
    .max(MAX_FILE_SIZE, `File size must not exceed ${MAX_FILE_SIZE / 1024 / 1024}MB`),
  mimeType: z.enum(SUPPORTED_IMAGE_TYPES, {
    message: `Invalid file type. Supported types: ${SUPPORTED_IMAGE_TYPES.join(', ')}`,
  }),
});

export type TourDateImageUploadRequest = z.infer<typeof tourDateImageUploadRequestSchema>;

/**
 * Schema for tour date image metadata after upload
 */
export const tourDateImageMetadataSchema = z.object({
  id: z.string().optional(),
  tourDateId: z.string().min(1, 'Tour date ID is required'),
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

export type TourDateImageMetadata = z.infer<typeof tourDateImageMetadataSchema>;

/**
 * Schema for confirm tour date image upload request (client to server)
 * s3Url and displayOrder are computed server-side
 */
export const tourDateConfirmUploadSchema = z.object({
  tourDateId: z.string().min(1, 'Tour date ID is required'),
  s3Key: z.string().min(1, 'S3 key is required'),
  s3Bucket: z.string().min(1, 'S3 bucket is required'),
  fileName: z.string().min(1, 'File name is required'),
  fileSize: z.number().positive('File size must be positive'),
  mimeType: z.enum(SUPPORTED_IMAGE_TYPES),
  altText: z.string().max(500, 'Alt text too long').optional(),
});

export type TourDateConfirmUploadRequest = z.infer<typeof tourDateConfirmUploadSchema>;

/**
 * Schema for tour date image reorder request
 */
export const tourDateImageReorderSchema = z.object({
  tourDateId: z.string().min(1, 'Tour date ID is required'),
  imageOrders: z
    .array(
      z.object({
        id: z.string().min(1, 'Image ID is required'),
        displayOrder: z.number().int().min(0, 'Display order must be non-negative'),
      })
    )
    .min(1, 'At least one image must be provided')
    .max(MAX_IMAGES_PER_TOUR_DATE, `Cannot reorder more than ${MAX_IMAGES_PER_TOUR_DATE} images`),
});

export type TourDateImageReorder = z.infer<typeof tourDateImageReorderSchema>;

/**
 * Schema for delete tour date image request
 */
export const tourDateDeleteImageSchema = z.object({
  imageId: z.string().min(1, 'Image ID is required'),
  tourDateId: z.string().min(1, 'Tour date ID is required'),
});

export type TourDateDeleteImageRequest = z.infer<typeof tourDateDeleteImageSchema>;

/**
 * Schema for updating tour date image alt text
 */
export const tourDateUpdateImageAltTextSchema = z.object({
  imageId: z.string().min(1, 'Image ID is required'),
  altText: z.string().max(500, 'Alt text too long').optional(),
});

export type TourDateUpdateImageAltText = z.infer<typeof tourDateUpdateImageAltTextSchema>;
