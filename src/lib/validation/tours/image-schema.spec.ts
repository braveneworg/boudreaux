/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  confirmUploadSchema,
  deleteImageSchema,
  imageReorderSchema,
  imageUploadRequestSchema,
  MAX_IMAGES_PER_TOUR,
  MAX_IMAGES_PER_TOUR_DATE,
  tourDateConfirmUploadSchema,
  tourDateDeleteImageSchema,
  tourDateImageReorderSchema,
  tourDateImageUploadRequestSchema,
} from './image-schema';

import type { z } from 'zod';

interface OwnerSchemas {
  label: string;
  ownerKey: string;
  ownerMessage: string;
  max: number;
  upload: z.ZodType;
  confirm: z.ZodType;
  reorder: z.ZodType;
  remove: z.ZodType;
}

const OWNERS: OwnerSchemas[] = [
  {
    label: 'tour',
    ownerKey: 'tourId',
    ownerMessage: 'Tour ID is required',
    max: 10,
    upload: imageUploadRequestSchema,
    confirm: confirmUploadSchema,
    reorder: imageReorderSchema,
    remove: deleteImageSchema,
  },
  {
    label: 'tour date',
    ownerKey: 'tourDateId',
    ownerMessage: 'Tour date ID is required',
    max: 20,
    upload: tourDateImageUploadRequestSchema,
    confirm: tourDateConfirmUploadSchema,
    reorder: tourDateImageReorderSchema,
    remove: tourDateDeleteImageSchema,
  },
];

/** The first issue message a schema refuses `input` with, or null when it accepts it. */
const firstIssue = (schema: z.ZodType, input: unknown): string | null => {
  const parsed = schema.safeParse(input);
  return parsed.success ? null : (parsed.error.issues[0]?.message ?? 'unknown');
};

const FILE = { fileName: 'photo.jpg', fileSize: 1024, mimeType: 'image/jpeg' };
const UPLOADED = { ...FILE, s3Key: 'media/k.jpg', s3Bucket: 'bucket', altText: 'A crowd' };

describe('the caps', () => {
  it('lets a tour hold 10 images and a tour date 20', () => {
    expect([MAX_IMAGES_PER_TOUR, MAX_IMAGES_PER_TOUR_DATE]).toEqual([10, 20]);
  });
});

describe.each(OWNERS)('$label image schemas', (owner) => {
  const withOwner = (fields: object): object => ({ [owner.ownerKey]: 'owner-1', ...fields });

  it('accepts an upload request naming the owner', () => {
    expect(firstIssue(owner.upload, withOwner(FILE))).toBeNull();
  });

  it('refuses an upload request without the owner', () => {
    expect(firstIssue(owner.upload, { [owner.ownerKey]: '', ...FILE })).toBe(owner.ownerMessage);
  });

  it('refuses a file over 10MB', () => {
    expect(firstIssue(owner.upload, withOwner({ ...FILE, fileSize: 10 * 1024 * 1024 + 1 }))).toBe(
      'File size must not exceed 10MB'
    );
  });

  it('refuses a type it does not serve', () => {
    expect(firstIssue(owner.upload, withOwner({ ...FILE, mimeType: 'image/svg+xml' }))).toBe(
      'Invalid file type. Supported types: image/jpeg, image/png, image/gif, image/webp'
    );
  });

  it('accepts a confirm naming the uploaded object', () => {
    expect(firstIssue(owner.confirm, withOwner(UPLOADED))).toBeNull();
  });

  it('refuses a confirm without its key', () => {
    expect(firstIssue(owner.confirm, withOwner({ ...UPLOADED, s3Key: '' }))).toBe(
      'S3 key is required'
    );
  });

  it("accepts a reorder of up to the owner's cap", () => {
    const orders = Array.from({ length: owner.max }, (_, index) => ({
      id: `i-${index}`,
      displayOrder: index,
    }));

    expect(firstIssue(owner.reorder, withOwner({ imageOrders: orders }))).toBeNull();
  });

  it("refuses a reorder over the owner's cap", () => {
    const orders = Array.from({ length: owner.max + 1 }, (_, index) => ({
      id: `i-${index}`,
      displayOrder: index,
    }));

    expect(firstIssue(owner.reorder, withOwner({ imageOrders: orders }))).toBe(
      `Cannot reorder more than ${owner.max} images`
    );
  });

  it('refuses a delete without the image', () => {
    expect(firstIssue(owner.remove, withOwner({ imageId: '' }))).toBe('Image ID is required');
  });

  it('refuses a confirm with alt text over 500 characters', () => {
    expect(firstIssue(owner.confirm, withOwner({ ...UPLOADED, altText: 'x'.repeat(501) }))).toBe(
      'Alt text too long'
    );
  });
});
