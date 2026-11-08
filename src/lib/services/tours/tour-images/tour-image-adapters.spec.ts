/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { ImageRepository } from '@/lib/repositories/tours/image-repository';
import { TourDateImageRepository } from '@/lib/repositories/tours/tour-date-image-repository';
import { ImageUploadService } from '@/lib/services/tours/image-upload-service';

import { tourDateImageRecords, tourImageRecords } from './tour-image-records';
import { s3TourImageStore } from './tour-image-store';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/repositories/tours/image-repository');
vi.mock('@/lib/repositories/tours/tour-date-image-repository');
vi.mock('@/lib/services/tours/image-upload-service');

const NEW_RECORD = {
  ownerId: 'owner-1',
  s3Key: 'media/key.jpg',
  s3Url: 'https://cdn.example.com/media/key.jpg',
  s3Bucket: 'bucket',
  fileName: 'photo.jpg',
  fileSize: 1024,
  mimeType: 'image/jpeg',
  altText: 'A crowd',
  uploadedBy: 'admin-1',
};

const { ownerId: _ownerId, ...STORED_FIELDS } = NEW_RECORD;

describe('s3TourImageStore', () => {
  const put = {
    s3Key: 'media/key.jpg',
    mimeType: 'image/jpeg' as const,
    fileSize: 1024,
    metadata: { tourId: 'owner-1' },
  };

  it('signs through the upload service', async () => {
    const signed = {
      success: true as const,
      data: { uploadUrl: 'https://signed', s3Key: 'media/key.jpg', s3Bucket: 'b', expiresIn: 900 },
    };
    vi.mocked(ImageUploadService.presignPut).mockResolvedValueOnce(signed);

    const result = await s3TourImageStore.presignPut(put);

    expect(vi.mocked(ImageUploadService.presignPut).mock.calls).toEqual([[put]]);
    expect(result).toEqual(signed);
  });

  it('reports a delete that succeeded as true', async () => {
    vi.mocked(ImageUploadService.deleteFromS3).mockResolvedValueOnce({
      success: true,
      data: undefined,
    });

    await expect(s3TourImageStore.delete('media/key.jpg')).resolves.toBe(true);
    expect(ImageUploadService.deleteFromS3).toHaveBeenCalledWith('media/key.jpg');
  });

  it('reports a delete that failed as false', async () => {
    vi.mocked(ImageUploadService.deleteFromS3).mockResolvedValueOnce({
      success: false,
      error: 'Failed to delete file from S3',
      code: 'UNKNOWN',
    });

    await expect(s3TourImageStore.delete('media/key.jpg')).resolves.toBe(false);
  });

  it('serves an object from the upload service CDN URL', () => {
    vi.mocked(ImageUploadService.generateCdnUrl).mockReturnValueOnce('https://cdn/x.jpg');

    expect(s3TourImageStore.publicUrl('x.jpg')).toBe('https://cdn/x.jpg');
  });
});

describe('tourImageRecords', () => {
  it('stores the owner as the tour id, within the cap it is given', async () => {
    await tourImageRecords.createWithinCap(NEW_RECORD, 7);

    expect(vi.mocked(ImageRepository.createWithinCap).mock.calls).toEqual([
      [{ tourId: 'owner-1', ...STORED_FIELDS }, 7],
    ]);
  });

  it('reads the owner from the tour id', () => {
    expect(tourImageRecords.ownerIdOf({ tourId: 't-1' } as never)).toBe('t-1');
  });

  it('reads, counts, deletes, reorders and relabels through the tour image repository', async () => {
    const orders = [{ id: 'a', displayOrder: 0 }];

    await tourImageRecords.findByOwner('t-1');
    await tourImageRecords.count('t-1');
    await tourImageRecords.findById('a');
    await tourImageRecords.delete('a');
    await tourImageRecords.reorder(orders);
    await tourImageRecords.updateAltText('a', null);

    expect(ImageRepository.findByTourId).toHaveBeenCalledWith('t-1');
    expect(ImageRepository.count).toHaveBeenCalledWith('t-1');
    expect(ImageRepository.findById).toHaveBeenCalledWith('a');
    expect(ImageRepository.delete).toHaveBeenCalledWith('a');
    expect(ImageRepository.reorderImages).toHaveBeenCalledWith(orders);
    expect(ImageRepository.updateAltText).toHaveBeenCalledWith('a', null);
  });
});

describe('tourDateImageRecords', () => {
  it('stores the owner as the tour date id, within the cap it is given', async () => {
    await tourDateImageRecords.createWithinCap(NEW_RECORD, 7);

    expect(vi.mocked(TourDateImageRepository.createWithinCap).mock.calls).toEqual([
      [{ tourDateId: 'owner-1', ...STORED_FIELDS }, 7],
    ]);
  });

  it('reads the owner from the tour date id', () => {
    expect(tourDateImageRecords.ownerIdOf({ tourDateId: 'd-1' } as never)).toBe('d-1');
  });

  it('reads, counts, deletes, reorders and relabels through the tour date image repository', async () => {
    const orders = [{ id: 'a', displayOrder: 0 }];

    await tourDateImageRecords.findByOwner('d-1');
    await tourDateImageRecords.count('d-1');
    await tourDateImageRecords.findById('a');
    await tourDateImageRecords.delete('a');
    await tourDateImageRecords.reorder(orders);
    await tourDateImageRecords.updateAltText('a', 'alt');

    expect(TourDateImageRepository.findByTourDateId).toHaveBeenCalledWith('d-1');
    expect(TourDateImageRepository.count).toHaveBeenCalledWith('d-1');
    expect(TourDateImageRepository.findById).toHaveBeenCalledWith('a');
    expect(TourDateImageRepository.delete).toHaveBeenCalledWith('a');
    expect(TourDateImageRepository.reorderImages).toHaveBeenCalledWith(orders);
    expect(TourDateImageRepository.updateAltText).toHaveBeenCalledWith('a', 'alt');
  });
});
