/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { revalidatePath } from 'next/cache';

import { gateAction } from '@/lib/auth/action-gate';
import { ImageRepository } from '@/lib/repositories/tours/image-repository';
import { TourDateImageRepository } from '@/lib/repositories/tours/tour-date-image-repository';
import { ImageUploadService } from '@/lib/services/tours/image-upload-service';

import {
  confirmTourDateUploadAction,
  deleteTourDateImageAction,
  generateTourDateUploadUrlAction,
  reorderTourDateImagesAction,
  updateTourDateImageAltTextAction,
} from './tour-date-images';
import {
  confirmUploadAction,
  deleteImageAction,
  generateUploadUrlAction,
  reorderImagesAction,
  updateImageAltTextAction,
} from './tour-images';

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('@/lib/auth/action-gate');
vi.mock('@/lib/repositories/tours/image-repository');
vi.mock('@/lib/repositories/tours/tour-date-image-repository');
vi.mock('@/lib/services/tours/image-upload-service');

const REFUSAL = { success: false as const, error: 'Unauthorized', code: 'FORBIDDEN' as const };
const SESSION = { user: { id: 'admin-1', role: 'admin', email: 'admin@example.com' } };

const OWNER_ID = 'owner-1';
const IMAGE_ID = 'image-1';
const PRESIGNED = {
  uploadUrl: 'https://bucket.s3.amazonaws.com/put',
  s3Key: 'media/key.jpg',
  s3Bucket: 'bucket',
  expiresIn: 900,
};

/** The repository surface both image models share, as the actions call it. */
interface ImageRepositoryMock {
  count: (ownerId: string) => Promise<number>;
  findByOwner: (ownerId: string) => Promise<unknown[]>;
  findById: (id: string) => Promise<unknown>;
  create: (data: never) => Promise<unknown>;
  delete: (id: string) => Promise<unknown>;
  reorderImages: (orders: never) => Promise<unknown>;
  updateAltText: (id: string, altText: string | null) => Promise<unknown>;
}

/** One owner's action set and the facts the rules depend on. */
interface OwnerCase {
  ownerKey: 'tourId' | 'tourDateId';
  label: string;
  max: number;
  repository: ImageRepositoryMock;
  presign: () => unknown;
  generate: (request: never) => Promise<{ success: boolean; error?: string; data?: unknown }>;
  confirm: (request: never) => Promise<{ success: boolean; error?: string; data?: unknown }>;
  remove: (request: never) => Promise<{ success: boolean; error?: string }>;
  reorder: (request: never) => Promise<{ success: boolean; error?: string }>;
  updateAltText: (request: never) => Promise<{ success: boolean; error?: string }>;
  revalidated: string[];
}

const tourCase = (): OwnerCase => ({
  ownerKey: 'tourId',
  label: 'tour',
  max: 10,
  repository: {
    count: ImageRepository.count,
    findByOwner: ImageRepository.findByTourId,
    findById: ImageRepository.findById,
    create: ImageRepository.create as never,
    delete: ImageRepository.delete,
    reorderImages: ImageRepository.reorderImages as never,
    updateAltText: ImageRepository.updateAltText,
  },
  presign: () => ImageUploadService.generatePresignedUploadUrl,
  generate: generateUploadUrlAction as never,
  confirm: confirmUploadAction as never,
  remove: deleteImageAction as never,
  reorder: reorderImagesAction as never,
  updateAltText: updateImageAltTextAction as never,
  revalidated: [`/admin/tours/${OWNER_ID}`, `/tours/${OWNER_ID}`, '/tours'],
});

const tourDateCase = (): OwnerCase => ({
  ownerKey: 'tourDateId',
  label: 'tour date',
  max: 20,
  repository: {
    count: TourDateImageRepository.count,
    findByOwner: TourDateImageRepository.findByTourDateId,
    findById: TourDateImageRepository.findById,
    create: TourDateImageRepository.create as never,
    delete: TourDateImageRepository.delete,
    reorderImages: TourDateImageRepository.reorderImages as never,
    updateAltText: TourDateImageRepository.updateAltText,
  },
  presign: () => ImageUploadService.generateTourDatePresignedUploadUrl,
  generate: generateTourDateUploadUrlAction as never,
  confirm: confirmTourDateUploadAction as never,
  remove: deleteTourDateImageAction as never,
  reorder: reorderTourDateImagesAction as never,
  updateAltText: updateTourDateImageAltTextAction as never,
  revalidated: ['/admin/tours', '/tours'],
});

const imageRow = (ownerKey: OwnerCase['ownerKey'], overrides: Record<string, unknown> = {}) => ({
  id: IMAGE_ID,
  [ownerKey]: OWNER_ID,
  s3Key: 'media/key.jpg',
  s3Url: 'https://cdn.example.com/media/key.jpg',
  s3Bucket: 'bucket',
  fileName: 'photo.jpg',
  fileSize: 1024,
  mimeType: 'image/jpeg',
  displayOrder: 0,
  altText: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  uploadedBy: 'admin-1',
  ...overrides,
});

const uploadRequest = (ownerKey: OwnerCase['ownerKey']) => ({
  [ownerKey]: OWNER_ID,
  fileName: 'photo.jpg',
  fileSize: 1024,
  mimeType: 'image/jpeg',
});

const confirmRequest = (ownerKey: OwnerCase['ownerKey']) => ({
  [ownerKey]: OWNER_ID,
  s3Key: 'media/key.jpg',
  s3Bucket: 'bucket',
  fileName: 'photo.jpg',
  fileSize: 1024,
  mimeType: 'image/jpeg',
  altText: 'A crowd',
});

describe.each([
  { owner: 'tour', makeCase: tourCase },
  { owner: 'tour date', makeCase: tourDateCase },
])('$owner image actions', ({ makeCase }) => {
  let owner: OwnerCase;

  beforeEach(() => {
    vi.resetAllMocks();
    owner = makeCase();
    vi.mocked(gateAction).mockResolvedValue({ success: true, session: SESSION as never });
    vi.mocked(ImageUploadService.generateCdnUrl).mockReturnValue(
      'https://cdn.example.com/media/key.jpg'
    );
  });

  describe('generate upload URL', () => {
    it('returns the gate refusal without counting images', async () => {
      vi.mocked(gateAction).mockResolvedValueOnce(REFUSAL);

      const result = await owner.generate(uploadRequest(owner.ownerKey) as never);

      expect(result).toEqual(REFUSAL);
      expect(owner.repository.count).not.toHaveBeenCalled();
    });

    it('refuses once the owner already holds the maximum number of images', async () => {
      vi.mocked(owner.repository.count).mockResolvedValueOnce(owner.max);

      const result = await owner.generate(uploadRequest(owner.ownerKey) as never);

      expect(result).toEqual({
        success: false,
        error: `Maximum of ${owner.max} images per ${owner.label} exceeded`,
      });
      expect(owner.presign()).not.toHaveBeenCalled();
    });

    it('issues a presigned URL while the owner is one under the maximum', async () => {
      vi.mocked(owner.repository.count).mockResolvedValueOnce(owner.max - 1);
      vi.mocked(owner.presign() as () => Promise<unknown>).mockResolvedValueOnce({
        success: true,
        data: PRESIGNED,
      });

      const result = await owner.generate(uploadRequest(owner.ownerKey) as never);

      expect(owner.repository.count).toHaveBeenCalledWith(OWNER_ID);
      expect(result).toEqual({ success: true, data: PRESIGNED });
    });

    it('passes a presign failure through', async () => {
      vi.mocked(owner.repository.count).mockResolvedValueOnce(0);
      vi.mocked(owner.presign() as () => Promise<unknown>).mockResolvedValueOnce({
        success: false,
        error: 'Failed to generate upload URL',
        code: 'UNKNOWN',
      });

      const result = await owner.generate(uploadRequest(owner.ownerKey) as never);

      expect(result).toEqual({ success: false, error: 'Failed to generate upload URL' });
    });
  });

  describe('confirm upload', () => {
    it('appends the image after the existing ones, uploaded by the admin', async () => {
      vi.mocked(owner.repository.findByOwner).mockResolvedValueOnce([
        imageRow(owner.ownerKey, { id: 'a' }),
        imageRow(owner.ownerKey, { id: 'b', displayOrder: 1 }),
      ]);
      vi.mocked(owner.repository.count).mockResolvedValueOnce(2);
      vi.mocked(owner.repository.create).mockResolvedValueOnce(
        imageRow(owner.ownerKey, { displayOrder: 2, altText: 'A crowd' })
      );

      const result = await owner.confirm(confirmRequest(owner.ownerKey) as never);

      expect(vi.mocked(owner.repository.create).mock.calls).toEqual([
        [
          {
            [owner.ownerKey]: OWNER_ID,
            s3Key: 'media/key.jpg',
            s3Url: 'https://cdn.example.com/media/key.jpg',
            s3Bucket: 'bucket',
            fileName: 'photo.jpg',
            fileSize: 1024,
            mimeType: 'image/jpeg',
            displayOrder: 2,
            altText: 'A crowd',
            uploadedBy: 'admin-1',
          },
        ],
      ]);
      expect(result).toEqual({
        success: true,
        data: {
          id: IMAGE_ID,
          [owner.ownerKey]: OWNER_ID,
          s3Key: 'media/key.jpg',
          s3Url: 'https://cdn.example.com/media/key.jpg',
          s3Bucket: 'bucket',
          fileName: 'photo.jpg',
          fileSize: 1024,
          mimeType: 'image/jpeg',
          displayOrder: 2,
          altText: 'A crowd',
          uploadedBy: 'admin-1',
        },
      });
    });

    it('revalidates the owner surfaces', async () => {
      vi.mocked(owner.repository.findByOwner).mockResolvedValueOnce([]);
      vi.mocked(owner.repository.count).mockResolvedValueOnce(0);
      vi.mocked(owner.repository.create).mockResolvedValueOnce(imageRow(owner.ownerKey));

      await owner.confirm(confirmRequest(owner.ownerKey) as never);

      expect(vi.mocked(revalidatePath).mock.calls.map(([path]) => path)).toEqual(owner.revalidated);
    });
  });

  describe('delete image', () => {
    it('refuses an image that does not exist', async () => {
      vi.mocked(owner.repository.findById).mockResolvedValueOnce(null);

      const result = await owner.remove({ imageId: IMAGE_ID, [owner.ownerKey]: OWNER_ID } as never);

      expect(result).toEqual({ success: false, error: 'Image not found' });
      expect(owner.repository.delete).not.toHaveBeenCalled();
    });

    it('refuses an image that belongs to another owner, leaving S3 and the row alone', async () => {
      vi.mocked(owner.repository.findById).mockResolvedValueOnce(
        imageRow(owner.ownerKey, { [owner.ownerKey]: 'someone-else' })
      );

      const result = await owner.remove({ imageId: IMAGE_ID, [owner.ownerKey]: OWNER_ID } as never);

      expect(result).toEqual({
        success: false,
        error: `Image does not belong to specified ${owner.label}`,
      });
      expect(ImageUploadService.deleteFromS3).not.toHaveBeenCalled();
      expect(owner.repository.delete).not.toHaveBeenCalled();
    });

    it('deletes the S3 object, then the row', async () => {
      vi.mocked(owner.repository.findById).mockResolvedValueOnce(imageRow(owner.ownerKey));
      vi.mocked(ImageUploadService.deleteFromS3).mockResolvedValueOnce({
        success: true,
        data: undefined,
      });

      const result = await owner.remove({ imageId: IMAGE_ID, [owner.ownerKey]: OWNER_ID } as never);

      expect(ImageUploadService.deleteFromS3).toHaveBeenCalledWith('media/key.jpg');
      expect(owner.repository.delete).toHaveBeenCalledWith(IMAGE_ID);
      expect(result).toEqual({ success: true });
    });

    it('still deletes the row when the S3 delete fails', async () => {
      vi.mocked(owner.repository.findById).mockResolvedValueOnce(imageRow(owner.ownerKey));
      vi.mocked(ImageUploadService.deleteFromS3).mockResolvedValueOnce({
        success: false,
        error: 'Failed to delete file from S3',
        code: 'UNKNOWN',
      });

      const result = await owner.remove({ imageId: IMAGE_ID, [owner.ownerKey]: OWNER_ID } as never);

      expect(owner.repository.delete).toHaveBeenCalledWith(IMAGE_ID);
      expect(result).toEqual({ success: true });
    });
  });

  describe('reorder images', () => {
    it('refuses an order naming an image the owner does not hold', async () => {
      vi.mocked(owner.repository.findByOwner).mockResolvedValueOnce([imageRow(owner.ownerKey)]);

      const result = await owner.reorder({
        [owner.ownerKey]: OWNER_ID,
        imageOrders: [
          { id: IMAGE_ID, displayOrder: 1 },
          { id: 'stranger', displayOrder: 0 },
        ],
      } as never);

      expect(result).toEqual({
        success: false,
        error: `Image stranger does not belong to ${owner.label} ${OWNER_ID}`,
      });
      expect(owner.repository.reorderImages).not.toHaveBeenCalled();
    });

    it('writes the new order when every image is the owner’s', async () => {
      vi.mocked(owner.repository.findByOwner).mockResolvedValueOnce([
        imageRow(owner.ownerKey, { id: 'a' }),
        imageRow(owner.ownerKey, { id: 'b' }),
      ]);
      const imageOrders = [
        { id: 'b', displayOrder: 0 },
        { id: 'a', displayOrder: 1 },
      ];

      const result = await owner.reorder({ [owner.ownerKey]: OWNER_ID, imageOrders } as never);

      expect(owner.repository.reorderImages).toHaveBeenCalledWith(imageOrders);
      expect(result).toEqual({ success: true });
    });
  });

  describe('update alt text', () => {
    it('refuses an image that does not exist', async () => {
      vi.mocked(owner.repository.findById).mockResolvedValueOnce(null);

      const result = await owner.updateAltText({ imageId: IMAGE_ID, altText: 'x' } as never);

      expect(result).toEqual({ success: false, error: 'Image not found' });
      expect(owner.repository.updateAltText).not.toHaveBeenCalled();
    });

    it('clears blank alt text to null', async () => {
      vi.mocked(owner.repository.findById).mockResolvedValueOnce(imageRow(owner.ownerKey));

      const result = await owner.updateAltText({ imageId: IMAGE_ID, altText: '' } as never);

      expect(owner.repository.updateAltText).toHaveBeenCalledWith(IMAGE_ID, null);
      expect(result).toEqual({ success: true });
    });
  });
});
