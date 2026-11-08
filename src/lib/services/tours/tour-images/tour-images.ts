/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { failFromError } from '@/lib/services/_internal/map-data-error';
import type { ServiceResponse } from '@/lib/services/service.types';
import { loggers } from '@/lib/utils/logger';
import { buildMediaS3Key, type MediaEntityType } from '@/lib/utils/s3-key-utils';
import {
  MAX_IMAGES_PER_TOUR,
  MAX_IMAGES_PER_TOUR_DATE,
  type PresignedUrlResponse,
} from '@/lib/validation/tours/image-schema';

import { tourDateImageRecords, tourImageRecords } from './tour-image-records';
import { s3TourImageStore } from './tour-image-store';

import type {
  ConfirmedTourImage,
  TourImageFile,
  TourImageOrder,
  TourImageOwner,
  TourImageOwnerKind,
  TourImageRecordsByKind,
  TourImageRowMap,
  TourImageStore,
  UploadedTourImage,
} from './types';

/** What differs between the owner kinds, apart from the model they are stored in. */
interface OwnerPolicy {
  /** How the owner is named in copy. */
  label: string;
  maxImages: number;
  /** The `media/<entityType>/<ownerId>/…` namespace of the owner's objects. */
  keyEntity: MediaEntityType;
  /** The object metadata field that names the owner. */
  metadataKey: string;
}

const TOUR_POLICY: OwnerPolicy = {
  label: 'tour',
  maxImages: MAX_IMAGES_PER_TOUR,
  keyEntity: 'tours',
  metadataKey: 'tourId',
};

const TOUR_DATE_POLICY: OwnerPolicy = {
  label: 'tour date',
  maxImages: MAX_IMAGES_PER_TOUR_DATE,
  keyEntity: 'tour-dates',
  metadataKey: 'tourDateId',
};

const policyOf = (kind: TourImageOwnerKind): OwnerPolicy =>
  kind === 'tour' ? TOUR_POLICY : TOUR_DATE_POLICY;

const IMAGE_NOT_FOUND = 'Image not found';

/**
 * The one file name {@link buildMediaS3Key} gives an object inside an owner's
 * namespace: lowercase letters, digits and dashes, then a dotted extension.
 * No slash and no second dot, so the name can neither climb out of the
 * namespace nor sit in a folder below it.
 */
const OWNED_FILE_NAME = /^[a-z0-9-]+\.[a-z0-9]{1,8}$/;

/** Whether an object key sits directly in the owner's `media/<entity>/<id>/` namespace. */
const isOwnersKey = ({ keyEntity }: OwnerPolicy, ownerId: string, s3Key: string): boolean => {
  const namespace = `media/${keyEntity}/${ownerId}/`;
  return s3Key.startsWith(namespace) && OWNED_FILE_NAME.test(s3Key.slice(namespace.length));
};

const capExceeded = ({ maxImages, label }: OwnerPolicy): ServiceResponse<never> => ({
  success: false,
  error: `Maximum of ${maxImages} images per ${label} exceeded`,
  code: 'LIMIT_EXCEEDED',
});

/** A row in the shape the confirm action has always returned. */
const toConfirmed = <Row extends { altText: string | null; uploadedBy: string | null }>({
  createdAt: _createdAt,
  altText,
  uploadedBy,
  ...rest
}: Row & { createdAt: Date }): ConfirmedTourImage<Row> =>
  ({
    ...rest,
    altText: altText || undefined,
    uploadedBy: uploadedBy || undefined,
  }) as ConfirmedTourImage<Row>;

export interface TourImagesDeps {
  store: TourImageStore;
  records: TourImageRecordsByKind;
}

/**
 * The tour image module: every image a Tour or a tour date holds, from the
 * presigned upload to the stored, ordered row. It owns the rules both owner
 * kinds share — the per-owner cap, the key namespace, the next display
 * order, the check that an image belongs to the owner named, and a delete
 * that removes the object and then the row even when the object delete
 * fails. Objects go through a {@link TourImageStore}; rows go through one
 * {@link TourImageRecords} adapter per Prisma model.
 *
 * Every failure is a `ServiceResponse` with a code and fixed copy; a thrown
 * error's own text never reaches the caller.
 */
export class TourImages {
  constructor(private readonly deps: TourImagesDeps) {}

  /** The persistence adapter for one owner kind. */
  private recordsOf<K extends TourImageOwnerKind>(kind: K): TourImageRecordsByKind[K] {
    const { tour, tourDate } = this.deps.records;
    return (kind === 'tour' ? tour : tourDate) as TourImageRecordsByKind[K];
  }

  /** The owner's images, in display order. */
  async list<K extends TourImageOwnerKind>({
    kind,
    id,
  }: TourImageOwner<K>): Promise<ServiceResponse<TourImageRowMap[K][]>> {
    try {
      return { success: true, data: await this.recordsOf(kind).findByOwner(id) };
    } catch (error) {
      return failFromError(error, { UNKNOWN: 'Failed to fetch images' });
    }
  }

  /**
   * A presigned PUT for one more image, refused once the owner holds its
   * cap. The cap is counted here, before any object exists, and again at
   * confirm, since two URLs can be issued while the owner is one under it.
   */
  async requestUpload<K extends TourImageOwnerKind>(
    { kind, id }: TourImageOwner<K>,
    { fileName, fileSize, mimeType }: TourImageFile
  ): Promise<ServiceResponse<PresignedUrlResponse>> {
    const policy = policyOf(kind);
    try {
      const existing = await this.recordsOf(kind).count(id);
      if (existing >= policy.maxImages) {
        return capExceeded(policy);
      }

      return await this.deps.store.presignPut({
        s3Key: buildMediaS3Key({ entityType: policy.keyEntity, entityId: id, fileName }),
        mimeType,
        fileSize,
        metadata: Object.fromEntries([
          [policy.metadataKey, id],
          ['originalFileName', fileName],
          ['uploadedAt', new Date().toISOString()],
        ]),
      });
    } catch (error) {
      return failFromError(error, { UNKNOWN: 'Failed to generate upload URL' });
    }
  }

  /**
   * Record an uploaded object as the owner's last image, served from its
   * public URL. The object must sit in the owner's key namespace, where
   * {@link requestUpload} signed it: any other key is refused and left alone,
   * so a confirm can neither record nor delete another owner's object. A
   * confirm that would pass the cap is refused and its object deleted. The
   * count and the insert are separate reads, so two confirms racing at the
   * same instant can still both pass.
   */
  async confirmUpload<K extends TourImageOwnerKind>(
    { kind, id }: TourImageOwner<K>,
    upload: UploadedTourImage,
    userId: string
  ): Promise<ServiceResponse<ConfirmedTourImage<TourImageRowMap[K]>>> {
    const records = this.recordsOf(kind);
    const policy = policyOf(kind);
    if (!isOwnersKey(policy, id, upload.s3Key)) {
      return {
        success: false,
        error: `The uploaded object is not one of this ${policy.label}'s images`,
        code: 'INVALID_INPUT',
      };
    }
    try {
      const displayOrder = await records.count(id);
      if (displayOrder >= policy.maxImages) {
        // Another upload filled the cap after this one's URL was issued:
        // refuse it and remove the object it left in the bucket.
        await this.deps.store.delete(upload.s3Key);
        return capExceeded(policy);
      }

      const row = await records.create({
        ownerId: id,
        s3Key: upload.s3Key,
        s3Url: this.deps.store.publicUrl(upload.s3Key),
        s3Bucket: upload.s3Bucket,
        fileName: upload.fileName,
        fileSize: upload.fileSize,
        mimeType: upload.mimeType,
        displayOrder,
        altText: upload.altText,
        uploadedBy: userId,
      });
      return { success: true, data: toConfirmed(row) };
    } catch (error) {
      return failFromError(error, { UNKNOWN: 'Failed to confirm upload' });
    }
  }

  /**
   * Remove one of the owner's images: its object, then its row. A failed
   * object delete is logged and the row is removed anyway, so the admin
   * never sees an image that cannot be deleted.
   */
  async delete<K extends TourImageOwnerKind>(
    { kind, id }: TourImageOwner<K>,
    imageId: string
  ): Promise<ServiceResponse<void>> {
    const records = this.recordsOf(kind);
    try {
      const image = await records.findById(imageId);
      if (!image) {
        return { success: false, error: IMAGE_NOT_FOUND, code: 'NOT_FOUND' };
      }
      if (records.ownerIdOf(image) !== id) {
        return {
          success: false,
          error: `Image does not belong to specified ${policyOf(kind).label}`,
          code: 'INVALID_INPUT',
        };
      }

      if (!(await this.deps.store.delete(image.s3Key))) {
        loggers.s3.error('Failed to delete tour image object; deleting the row anyway', {
          imageId,
          s3Key: image.s3Key,
        });
      }

      await records.delete(imageId);
      return { success: true, data: undefined };
    } catch (error) {
      return failFromError(error, { UNKNOWN: 'Failed to delete image' });
    }
  }

  /** Store a new order for the owner's images; every image named must be the owner's. */
  async reorder<K extends TourImageOwnerKind>(
    { kind, id }: TourImageOwner<K>,
    orders: TourImageOrder[]
  ): Promise<ServiceResponse<void>> {
    const records = this.recordsOf(kind);
    try {
      const owned = new Set((await records.findByOwner(id)).map((image) => image.id));
      const stranger = orders.find((order) => !owned.has(order.id));
      if (stranger) {
        return {
          success: false,
          error: `Image ${stranger.id} does not belong to ${policyOf(kind).label} ${id}`,
          code: 'INVALID_INPUT',
        };
      }

      await records.reorder(orders);
      return { success: true, data: undefined };
    } catch (error) {
      return failFromError(error, { UNKNOWN: 'Failed to reorder images' });
    }
  }

  /** Set an image's alt text (blank clears it); resolves with the owner, for revalidation. */
  async updateAltText<K extends TourImageOwnerKind>(
    kind: K,
    imageId: string,
    altText: string | undefined
  ): Promise<ServiceResponse<{ ownerId: string }>> {
    const records = this.recordsOf(kind);
    try {
      const image = await records.findById(imageId);
      if (!image) {
        return { success: false, error: IMAGE_NOT_FOUND, code: 'NOT_FOUND' };
      }

      await records.updateAltText(imageId, altText || null);
      return { success: true, data: { ownerId: records.ownerIdOf(image) } };
    } catch (error) {
      return failFromError(error, { UNKNOWN: 'Failed to update alt text' });
    }
  }
}

/** The tour image module over S3 and the two image models. */
export const tourImages = new TourImages({
  store: s3TourImageStore,
  records: { tour: tourImageRecords, tourDate: tourDateImageRecords },
});
