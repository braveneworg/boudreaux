/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ServiceResponse } from '@/lib/services/service.types';
import type { TourDateImageScalars, TourImageScalars } from '@/lib/types/tours';
import type { PresignedUrlResponse, SupportedImageType } from '@/lib/validation/tours/image-schema';

/** What a tour image belongs to: a Tour, or one of its tour dates. */
export type TourImageOwnerKind = 'tour' | 'tourDate';

/** One owner of tour images, named by its kind and id. */
export interface TourImageOwner<K extends TourImageOwnerKind = TourImageOwnerKind> {
  kind: K;
  id: string;
}

/** The stored row each owner kind's images are read back as. */
export interface TourImageRowMap {
  tour: TourImageScalars;
  tourDate: TourDateImageScalars;
}

/** The file an admin asks to upload, before any object exists. */
export interface TourImageFile {
  fileName: string;
  fileSize: number;
  mimeType: SupportedImageType;
}

/** A file the browser has put in the bucket, to record against its owner. */
export interface UploadedTourImage extends TourImageFile {
  s3Key: string;
  s3Bucket: string;
  altText?: string;
}

/** One image's new place in its owner's order. */
export interface TourImageOrder {
  id: string;
  displayOrder: number;
}

/** A row to create, with the owner named generically; its display order is the owner's next. */
export interface NewTourImageRecord {
  ownerId: string;
  s3Key: string;
  s3Url: string;
  s3Bucket: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  altText?: string;
  uploadedBy?: string;
}

/**
 * The persistence port one owner kind's images go through. There is one
 * adapter per Prisma model (`TourImage`, `TourDateImage`); the module never
 * sees which model it is writing.
 */
export interface TourImageRecords<Row> {
  /** The owner id stored on a row (`tourId` or `tourDateId`). */
  ownerIdOf: (row: Row) => string;
  findByOwner: (ownerId: string) => Promise<Row[]>;
  count: (ownerId: string) => Promise<number>;
  findById: (id: string) => Promise<Row | null>;
  /**
   * Store the row as the owner's last image unless the owner already holds
   * `maxImages`, atomically per owner: concurrent calls never store more
   * than `maxImages`. Null when the owner is at its cap.
   */
  createWithinCap: (record: NewTourImageRecord, maxImages: number) => Promise<Row | null>;
  delete: (id: string) => Promise<void>;
  reorder: (orders: TourImageOrder[]) => Promise<void>;
}

/** Every owner kind's persistence adapter. */
export type TourImageRecordsByKind = {
  [K in TourImageOwnerKind]: TourImageRecords<TourImageRowMap[K]>;
};

/** One presigned PUT the store is asked to sign. */
export interface TourImagePut {
  s3Key: string;
  mimeType: SupportedImageType;
  fileSize: number;
  /** Stored as the object's user metadata. */
  metadata: Record<string, string>;
}

/**
 * The object-store port tour images go through: S3 in production, an
 * in-memory fake in specs. `delete` never throws; it is false when the
 * object could not be removed.
 */
export interface TourImageStore {
  presignPut: (put: TourImagePut) => Promise<ServiceResponse<PresignedUrlResponse>>;
  delete: (s3Key: string) => Promise<boolean>;
  /** The public URL a stored object is served from. */
  publicUrl: (s3Key: string) => string;
}

/** A confirmed image as the confirm action hands it back. */
export type ConfirmedTourImage<Row> = Omit<Row, 'createdAt' | 'altText' | 'uploadedBy'> & {
  altText?: string;
  uploadedBy?: string;
};
