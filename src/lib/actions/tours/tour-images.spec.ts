/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { revalidatePath } from 'next/cache';

import { gateAction } from '@/lib/auth/action-gate';
import { tourImages } from '@/lib/services/tours/tour-images/tour-images';

import {
  confirmTourDateUploadAction,
  confirmUploadAction,
  deleteImageAction,
  deleteTourDateImageAction,
  generateTourDateUploadUrlAction,
  generateUploadUrlAction,
  reorderImagesAction,
  reorderTourDateImagesAction,
  updateImageAltTextAction,
  updateTourDateImageAltTextAction,
} from './tour-images';

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('@/lib/auth/action-gate');
vi.mock('@/lib/services/tours/tour-images/tour-images', () => ({
  tourImages: {
    requestUpload: vi.fn(),
    confirmUpload: vi.fn(),
    delete: vi.fn(),
    reorder: vi.fn(),
    updateAltText: vi.fn(),
  },
}));

const REFUSAL = { success: false as const, error: 'Unauthorized', code: 'FORBIDDEN' as const };
const SESSION = { user: { id: 'admin-1', role: 'admin', email: 'admin@example.com' } };
const OWNER_ID = 'owner-1';
const IMAGE_ID = 'image-1';
const FAILURE = { success: false as const, error: 'Image not found', code: 'NOT_FOUND' as const };

type ActionResult = Promise<{ success: boolean }>;

/** One owner kind's action set and the facts its actions depend on. */
interface OwnerCase {
  label: string;
  kind: 'tour' | 'tourDate';
  ownerKey: 'tourId' | 'tourDateId';
  generate: (request: never) => ActionResult;
  confirm: (request: never) => ActionResult;
  remove: (request: never) => ActionResult;
  reorder: (request: never) => ActionResult;
  updateAltText: (request: never) => ActionResult;
  revalidated: string[];
}

const OWNERS: OwnerCase[] = [
  {
    label: 'tour',
    kind: 'tour',
    ownerKey: 'tourId',
    generate: generateUploadUrlAction as never,
    confirm: confirmUploadAction as never,
    remove: deleteImageAction as never,
    reorder: reorderImagesAction as never,
    updateAltText: updateImageAltTextAction as never,
    revalidated: [`/admin/tours/${OWNER_ID}`, `/tours/${OWNER_ID}`, '/tours'],
  },
  {
    label: 'tour date',
    kind: 'tourDate',
    ownerKey: 'tourDateId',
    generate: generateTourDateUploadUrlAction as never,
    confirm: confirmTourDateUploadAction as never,
    remove: deleteTourDateImageAction as never,
    reorder: reorderTourDateImagesAction as never,
    updateAltText: updateTourDateImageAltTextAction as never,
    revalidated: ['/admin/tours', '/tours'],
  },
];

const FILE = { fileName: 'photo.jpg', fileSize: 1024, mimeType: 'image/jpeg' };
const UPLOAD = { ...FILE, s3Key: 'media/key.jpg', s3Bucket: 'bucket', altText: 'A crowd' };
const ORDERS = [
  { id: 'b', displayOrder: 0 },
  { id: 'a', displayOrder: 1 },
];

const revalidatedPaths = (): string[] => vi.mocked(revalidatePath).mock.calls.map(([path]) => path);

describe.each(OWNERS)('$label image actions', (owner) => {
  const ownerRef = { kind: owner.kind, id: OWNER_ID };
  const withOwner = <T extends object>(fields: T) => ({ [owner.ownerKey]: OWNER_ID, ...fields });

  beforeEach(() => {
    vi.mocked(gateAction).mockResolvedValue({ success: true, session: SESSION as never });
  });

  describe('generate upload URL', () => {
    it('returns the gate refusal without reaching the module', async () => {
      vi.mocked(gateAction).mockResolvedValueOnce(REFUSAL);

      const result = await owner.generate(withOwner(FILE) as never);

      expect(result).toEqual(REFUSAL);
      expect(tourImages.requestUpload).not.toHaveBeenCalled();
    });

    it('answers an invalid request with the first validation message', async () => {
      const result = await owner.generate(withOwner({ ...FILE, fileName: '' }) as never);

      expect(result).toEqual({
        success: false,
        error: 'File name is required',
        code: 'VALIDATION',
      });
      expect(tourImages.requestUpload).not.toHaveBeenCalled();
    });

    it("asks the module for the owner's next upload and hands its answer back", async () => {
      const signed = {
        success: true as const,
        data: { uploadUrl: 'https://signed', s3Key: 'k', s3Bucket: 'b', expiresIn: 900 },
      };
      vi.mocked(tourImages.requestUpload).mockResolvedValueOnce(signed);

      const result = await owner.generate(withOwner(FILE) as never);

      expect(vi.mocked(tourImages.requestUpload).mock.calls).toEqual([[ownerRef, FILE]]);
      expect(result).toEqual(signed);
    });

    it('never hands a thrown error’s own text to the client', async () => {
      vi.mocked(tourImages.requestUpload).mockRejectedValueOnce(
        new Error('connect ECONNREFUSED mongodb://admin:hunter2@db')
      );

      const result = await owner.generate(withOwner(FILE) as never);

      expect(result).toEqual({
        success: false,
        error: 'Failed to generate upload URL',
        code: 'UNKNOWN',
      });
    });
  });

  describe('confirm upload', () => {
    it('records the upload as the admin and revalidates the owner surfaces', async () => {
      const confirmed = { success: true as const, data: { id: IMAGE_ID } };
      vi.mocked(tourImages.confirmUpload).mockResolvedValueOnce(confirmed as never);

      const result = await owner.confirm(withOwner(UPLOAD) as never);

      expect(vi.mocked(tourImages.confirmUpload).mock.calls).toEqual([
        [ownerRef, UPLOAD, 'admin-1'],
      ]);
      expect(revalidatedPaths()).toEqual(owner.revalidated);
      expect(result).toEqual(confirmed);
    });

    it('revalidates nothing when the module refuses', async () => {
      vi.mocked(tourImages.confirmUpload).mockResolvedValueOnce(FAILURE);

      const result = await owner.confirm(withOwner(UPLOAD) as never);

      expect(revalidatePath).not.toHaveBeenCalled();
      expect(result).toEqual(FAILURE);
    });

    it('answers a throw with generic copy', async () => {
      vi.mocked(tourImages.confirmUpload).mockRejectedValueOnce(new Error('raw'));

      const result = await owner.confirm(withOwner(UPLOAD) as never);

      expect(result).toEqual({
        success: false,
        error: 'Failed to confirm upload',
        code: 'UNKNOWN',
      });
    });
  });

  describe('delete image', () => {
    it('deletes through the module and revalidates the owner surfaces', async () => {
      vi.mocked(tourImages.delete).mockResolvedValueOnce({ success: true, data: undefined });

      const result = await owner.remove(withOwner({ imageId: IMAGE_ID }) as never);

      expect(vi.mocked(tourImages.delete).mock.calls).toEqual([[ownerRef, IMAGE_ID]]);
      expect(revalidatedPaths()).toEqual(owner.revalidated);
      expect(result).toEqual({ success: true, data: undefined });
    });

    it('hands a refusal back without revalidating', async () => {
      vi.mocked(tourImages.delete).mockResolvedValueOnce(FAILURE);

      const result = await owner.remove(withOwner({ imageId: IMAGE_ID }) as never);

      expect(revalidatePath).not.toHaveBeenCalled();
      expect(result).toEqual(FAILURE);
    });

    it('refuses a request without an image id', async () => {
      const result = await owner.remove(withOwner({ imageId: '' }) as never);

      expect(result).toEqual({ success: false, error: 'Image ID is required', code: 'VALIDATION' });
    });
  });

  describe('reorder images', () => {
    it('reorders through the module and revalidates the owner surfaces', async () => {
      vi.mocked(tourImages.reorder).mockResolvedValueOnce({ success: true, data: undefined });

      const result = await owner.reorder(withOwner({ imageOrders: ORDERS }) as never);

      expect(vi.mocked(tourImages.reorder).mock.calls).toEqual([[ownerRef, ORDERS]]);
      expect(revalidatedPaths()).toEqual(owner.revalidated);
      expect(result).toEqual({ success: true, data: undefined });
    });

    it('refuses an empty order', async () => {
      const result = await owner.reorder(withOwner({ imageOrders: [] }) as never);

      expect(result).toEqual({
        success: false,
        error: 'At least one image must be provided',
        code: 'VALIDATION',
      });
    });

    it('answers a throw with generic copy', async () => {
      vi.mocked(tourImages.reorder).mockRejectedValueOnce(new Error('raw'));

      const result = await owner.reorder(withOwner({ imageOrders: ORDERS }) as never);

      expect(result).toEqual({
        success: false,
        error: 'Failed to reorder images',
        code: 'UNKNOWN',
      });
    });
  });

  describe('update alt text', () => {
    it("updates through the module and revalidates the image owner's surfaces", async () => {
      vi.mocked(tourImages.updateAltText).mockResolvedValueOnce({
        success: true,
        data: { ownerId: OWNER_ID },
      });

      const result = await owner.updateAltText({ imageId: IMAGE_ID, altText: 'x' } as never);

      expect(vi.mocked(tourImages.updateAltText).mock.calls).toEqual([[owner.kind, IMAGE_ID, 'x']]);
      expect(revalidatedPaths()).toEqual(owner.revalidated);
      expect(result).toEqual({ success: true, data: { ownerId: OWNER_ID } });
    });

    it('hands a refusal back without revalidating', async () => {
      vi.mocked(tourImages.updateAltText).mockResolvedValueOnce(FAILURE);

      const result = await owner.updateAltText({ imageId: IMAGE_ID, altText: 'x' } as never);

      expect(revalidatePath).not.toHaveBeenCalled();
      expect(result).toEqual(FAILURE);
    });

    it('answers a throw with generic copy', async () => {
      vi.mocked(tourImages.updateAltText).mockRejectedValueOnce(new Error('raw'));

      const result = await owner.updateAltText({ imageId: IMAGE_ID, altText: 'x' } as never);

      expect(result).toEqual({
        success: false,
        error: 'Failed to update alt text',
        code: 'UNKNOWN',
      });
    });
  });
});
