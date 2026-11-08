/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

'use server';

import { revalidatePath } from 'next/cache';

import { gateAction, type ActionGateCode } from '@/lib/auth/action-gate';
import type { ServiceResponse } from '@/lib/services/service.types';
import { tourImages } from '@/lib/services/tours/tour-images/tour-images';
import type { ConfirmedTourImage } from '@/lib/services/tours/tour-images/types';
import type { DataErrorCode } from '@/lib/types/domain/errors';
import type { TourDateImageScalars, TourImageScalars } from '@/lib/types/tours';
import { loggers } from '@/lib/utils/logger';
import {
  confirmUploadSchema,
  deleteImageSchema,
  imageReorderSchema,
  imageUploadRequestSchema,
  tourDateConfirmUploadSchema,
  tourDateDeleteImageSchema,
  tourDateImageReorderSchema,
  tourDateImageUploadRequestSchema,
  tourDateUpdateImageAltTextSchema,
  updateImageAltTextSchema,
  type ConfirmUploadRequest,
  type DeleteImageRequest,
  type ImageReorder,
  type ImageUploadRequest,
  type PresignedUrlResponse,
  type TourDateConfirmUploadRequest,
  type TourDateDeleteImageRequest,
  type TourDateImageReorder,
  type TourDateImageUploadRequest,
  type TourDateUpdateImageAltText,
  type UpdateImageAltText,
} from '@/lib/validation/tours/image-schema';

import type { z } from 'zod';

const logger = loggers.s3;

/** What every tour image action resolves to. */
export type TourImageActionResponse<T = void> =
  | { success: true; data: T }
  | { success: false; error: string; code: DataErrorCode | ActionGateCode };

/** The first message the schema refused the request with. */
const invalidRequest = (error: z.ZodError): TourImageActionResponse<never> => ({
  success: false,
  error: error.issues[0]?.message ?? 'Invalid request',
  code: 'VALIDATION',
});

/**
 * Run one action's work, answering anything it throws with `failure` copy:
 * a thrown error's own text never reaches the client.
 */
const settle = async <T>(
  failure: string,
  work: () => Promise<TourImageActionResponse<T>>
): Promise<TourImageActionResponse<T>> => {
  try {
    return await work();
  } catch (error) {
    logger.error(failure, error);
    return { success: false, error: failure, code: 'UNKNOWN' };
  }
};

/** Revalidate after a write that succeeded, and hand the result on. */
const afterWrite = <T>(
  result: ServiceResponse<T>,
  revalidate: () => void
): TourImageActionResponse<T> => {
  if (result.success) {
    revalidate();
  }
  return result;
};

const revalidateTour = (tourId: string) => (): void => {
  revalidatePath(`/admin/tours/${tourId}`);
  revalidatePath(`/tours/${tourId}`);
  revalidatePath('/tours');
};

const revalidateTourDates = (): void => {
  revalidatePath('/admin/tours');
  revalidatePath('/tours');
};

/** A presigned PUT for one more image of a tour. Admin only. */
export const generateUploadUrlAction = async (
  request: ImageUploadRequest
): Promise<TourImageActionResponse<PresignedUrlResponse>> =>
  settle('Failed to generate upload URL', async () => {
    const gate = await gateAction('admin');
    if (!gate.success) {
      return gate;
    }
    const parsed = imageUploadRequestSchema.safeParse(request);
    if (!parsed.success) {
      return invalidRequest(parsed.error);
    }

    const { tourId, ...file } = parsed.data;
    return tourImages.requestUpload({ kind: 'tour', id: tourId }, file);
  });

/** Record an image the browser put in the bucket as the tour's last image. Admin only. */
export const confirmUploadAction = async (
  request: ConfirmUploadRequest
): Promise<TourImageActionResponse<ConfirmedTourImage<TourImageScalars>>> =>
  settle('Failed to confirm upload', async () => {
    const gate = await gateAction('admin');
    if (!gate.success) {
      return gate;
    }
    const parsed = confirmUploadSchema.safeParse(request);
    if (!parsed.success) {
      return invalidRequest(parsed.error);
    }

    const { tourId, ...upload } = parsed.data;
    return afterWrite(
      await tourImages.confirmUpload({ kind: 'tour', id: tourId }, upload, gate.session.user.id),
      revalidateTour(tourId)
    );
  });

/** Delete one of a tour's images, object and row. Admin only. */
export const deleteImageAction = async (
  request: DeleteImageRequest
): Promise<TourImageActionResponse> =>
  settle('Failed to delete image', async () => {
    const gate = await gateAction('admin');
    if (!gate.success) {
      return gate;
    }
    const parsed = deleteImageSchema.safeParse(request);
    if (!parsed.success) {
      return invalidRequest(parsed.error);
    }

    const { tourId, imageId } = parsed.data;
    return afterWrite(
      await tourImages.delete({ kind: 'tour', id: tourId }, imageId),
      revalidateTour(tourId)
    );
  });

/** Store a new order for a tour's images. Admin only. */
export const reorderImagesAction = async (
  request: ImageReorder
): Promise<TourImageActionResponse> =>
  settle('Failed to reorder images', async () => {
    const gate = await gateAction('admin');
    if (!gate.success) {
      return gate;
    }
    const parsed = imageReorderSchema.safeParse(request);
    if (!parsed.success) {
      return invalidRequest(parsed.error);
    }

    const { tourId, imageOrders } = parsed.data;
    return afterWrite(
      await tourImages.reorder({ kind: 'tour', id: tourId }, imageOrders),
      revalidateTour(tourId)
    );
  });

/** Set a tour image's alt text; blank clears it. Admin only. */
export const updateImageAltTextAction = async (
  request: UpdateImageAltText
): Promise<TourImageActionResponse<{ ownerId: string }>> =>
  settle('Failed to update alt text', async () => {
    const gate = await gateAction('admin');
    if (!gate.success) {
      return gate;
    }
    const parsed = updateImageAltTextSchema.safeParse(request);
    if (!parsed.success) {
      return invalidRequest(parsed.error);
    }

    const result = await tourImages.updateAltText('tour', parsed.data.imageId, parsed.data.altText);
    if (result.success) {
      revalidateTour(result.data.ownerId)();
    }
    return result;
  });

/** A presigned PUT for one more image of a tour date. Admin only. */
export const generateTourDateUploadUrlAction = async (
  request: TourDateImageUploadRequest
): Promise<TourImageActionResponse<PresignedUrlResponse>> =>
  settle('Failed to generate upload URL', async () => {
    const gate = await gateAction('admin');
    if (!gate.success) {
      return gate;
    }
    const parsed = tourDateImageUploadRequestSchema.safeParse(request);
    if (!parsed.success) {
      return invalidRequest(parsed.error);
    }

    const { tourDateId, ...file } = parsed.data;
    return tourImages.requestUpload({ kind: 'tourDate', id: tourDateId }, file);
  });

/** Record an image the browser put in the bucket as the tour date's last image. Admin only. */
export const confirmTourDateUploadAction = async (
  request: TourDateConfirmUploadRequest
): Promise<TourImageActionResponse<ConfirmedTourImage<TourDateImageScalars>>> =>
  settle('Failed to confirm upload', async () => {
    const gate = await gateAction('admin');
    if (!gate.success) {
      return gate;
    }
    const parsed = tourDateConfirmUploadSchema.safeParse(request);
    if (!parsed.success) {
      return invalidRequest(parsed.error);
    }

    const { tourDateId, ...upload } = parsed.data;
    return afterWrite(
      await tourImages.confirmUpload(
        { kind: 'tourDate', id: tourDateId },
        upload,
        gate.session.user.id
      ),
      revalidateTourDates
    );
  });

/** Delete one of a tour date's images, object and row. Admin only. */
export const deleteTourDateImageAction = async (
  request: TourDateDeleteImageRequest
): Promise<TourImageActionResponse> =>
  settle('Failed to delete image', async () => {
    const gate = await gateAction('admin');
    if (!gate.success) {
      return gate;
    }
    const parsed = tourDateDeleteImageSchema.safeParse(request);
    if (!parsed.success) {
      return invalidRequest(parsed.error);
    }

    const { tourDateId, imageId } = parsed.data;
    return afterWrite(
      await tourImages.delete({ kind: 'tourDate', id: tourDateId }, imageId),
      revalidateTourDates
    );
  });

/** Store a new order for a tour date's images. Admin only. */
export const reorderTourDateImagesAction = async (
  request: TourDateImageReorder
): Promise<TourImageActionResponse> =>
  settle('Failed to reorder images', async () => {
    const gate = await gateAction('admin');
    if (!gate.success) {
      return gate;
    }
    const parsed = tourDateImageReorderSchema.safeParse(request);
    if (!parsed.success) {
      return invalidRequest(parsed.error);
    }

    const { tourDateId, imageOrders } = parsed.data;
    return afterWrite(
      await tourImages.reorder({ kind: 'tourDate', id: tourDateId }, imageOrders),
      revalidateTourDates
    );
  });

/** Set a tour date image's alt text; blank clears it. Admin only. */
export const updateTourDateImageAltTextAction = async (
  request: TourDateUpdateImageAltText
): Promise<TourImageActionResponse<{ ownerId: string }>> =>
  settle('Failed to update alt text', async () => {
    const gate = await gateAction('admin');
    if (!gate.success) {
      return gate;
    }
    const parsed = tourDateUpdateImageAltTextSchema.safeParse(request);
    if (!parsed.success) {
      return invalidRequest(parsed.error);
    }

    return afterWrite(
      await tourImages.updateAltText('tourDate', parsed.data.imageId, parsed.data.altText),
      revalidateTourDates
    );
  });
