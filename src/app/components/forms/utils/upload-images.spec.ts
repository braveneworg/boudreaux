/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { type ImageItem } from '@/app/components/ui/image-uploader';
import { getPresignedUploadUrlsAction } from '@/lib/actions/presigned-upload-actions';
import type { PresignedUrlResult } from '@/lib/actions/presigned-upload-actions';
import type { RegisterImageResult } from '@/lib/actions/register-image-actions';
import { uploadFilesToS3 } from '@/lib/utils/direct-upload';
import type { DirectUploadResult } from '@/lib/utils/direct-upload';

import {
  markImagesUploadError,
  markImagesUploading,
  mergeUploadedImages,
  mergeUploadedImagesByIndex,
  uploadAndRegisterImages,
} from './upload-images';

vi.mock('@/lib/actions/presigned-upload-actions', () => ({
  getPresignedUploadUrlsAction: vi.fn(),
}));
vi.mock('@/lib/utils/direct-upload', () => ({
  uploadFilesToS3: vi.fn(),
}));

const getPresignedMock = vi.mocked(getPresignedUploadUrlsAction);
const uploadFilesMock = vi.mocked(uploadFilesToS3);

const makeFile = (name: string): File => new File(['data'], name, { type: 'image/png' });

const makeImage = (overrides: Partial<ImageItem>): ImageItem => ({
  id: 'img-temp',
  preview: 'blob:preview',
  ...overrides,
});

const presigned = (s3Key: string, cdnUrl: string): PresignedUrlResult => ({
  uploadUrl: `https://s3.example.com/${s3Key}`,
  s3Key,
  cdnUrl,
});

const okUpload = (s3Key: string, cdnUrl: string): DirectUploadResult => ({
  success: true,
  s3Key,
  cdnUrl,
});

const registered = (id: string, src: string, sortOrder: number): RegisterImageResult => ({
  id,
  src,
  sortOrder,
});

describe('markImagesUploading', () => {
  it('sets isUploading on pending images (file present, no uploadedUrl)', () => {
    const images: ImageItem[] = [
      makeImage({ id: 'a', file: makeFile('a.png') }),
      makeImage({ id: 'b', uploadedUrl: 'https://cdn/b.png' }),
    ];

    const result = markImagesUploading(images);

    expect(result[0].isUploading).toBe(true);
  });

  it('leaves already-uploaded images untouched', () => {
    const images: ImageItem[] = [makeImage({ id: 'b', uploadedUrl: 'https://cdn/b.png' })];

    const result = markImagesUploading(images);

    expect(result[0].isUploading).toBeUndefined();
  });
});

describe('mergeUploadedImages (counter-based)', () => {
  it('assigns uploaded data to pending images in order, skipping uploaded ones', () => {
    const images: ImageItem[] = [
      makeImage({ id: 'old', uploadedUrl: 'https://cdn/old.png' }),
      makeImage({ id: 'temp-1', file: makeFile('1.png') }),
    ];
    const uploaded: RegisterImageResult[] = [registered('new-1', 'https://cdn/new-1.png', 5)];

    const result = mergeUploadedImages(images, uploaded);

    expect(result[1].id).toBe('new-1');
  });

  it('sets uploadedUrl from the registered src for a pending image', () => {
    const images: ImageItem[] = [makeImage({ id: 'temp-1', file: makeFile('1.png') })];
    const uploaded: RegisterImageResult[] = [registered('new-1', 'https://cdn/new-1.png', 0)];

    const result = mergeUploadedImages(images, uploaded);

    expect(result[0].uploadedUrl).toBe('https://cdn/new-1.png');
  });

  it('clears isUploading on images with no matching uploaded entry', () => {
    const images: ImageItem[] = [
      makeImage({ id: 'old', uploadedUrl: 'https://cdn/old.png', isUploading: true }),
    ];

    const result = mergeUploadedImages(images, []);

    expect(result[0].isUploading).toBe(false);
  });
});

describe('mergeUploadedImagesByIndex (direct index)', () => {
  it('matches the uploaded entry at the same array index for a pending image', () => {
    const images: ImageItem[] = [makeImage({ id: 'temp-1', file: makeFile('1.png') })];
    const uploaded: RegisterImageResult[] = [registered('new-1', 'https://cdn/new-1.png', 3)];

    const result = mergeUploadedImagesByIndex(images, uploaded);

    expect(result[0].id).toBe('new-1');
  });

  it('does not apply uploaded data when index has no entry (preserving direct-index behavior)', () => {
    const images: ImageItem[] = [
      makeImage({ id: 'old', uploadedUrl: 'https://cdn/old.png' }),
      makeImage({ id: 'temp-1', file: makeFile('1.png') }),
    ];
    // Only one uploaded result; at index 1 there is no entry.
    const uploaded: RegisterImageResult[] = [registered('new-1', 'https://cdn/new-1.png', 0)];

    const result = mergeUploadedImagesByIndex(images, uploaded);

    expect(result[1].id).toBe('temp-1');
  });
});

describe('markImagesUploadError', () => {
  it('sets the error message and clears isUploading on pending images', () => {
    const images: ImageItem[] = [
      makeImage({ id: 'temp-1', file: makeFile('1.png'), isUploading: true }),
    ];

    const result = markImagesUploadError(images, 'boom');

    expect(result[0].error).toBe('boom');
  });

  it('leaves already-uploaded images untouched', () => {
    const images: ImageItem[] = [makeImage({ id: 'old', uploadedUrl: 'https://cdn/old.png' })];

    const result = markImagesUploadError(images, 'boom');

    expect(result[0].error).toBeUndefined();
  });
});

describe('uploadAndRegisterImages', () => {
  beforeEach(() => {
    getPresignedMock.mockReset();
    uploadFilesMock.mockReset();
  });

  it('calls the presigned action with the entity type, target id, and file infos', async () => {
    const file = makeFile('1.png');
    getPresignedMock.mockResolvedValue({
      success: true,
      data: [presigned('releases/rel-1/1.png', 'https://cdn/1.png')],
    });
    uploadFilesMock.mockResolvedValue([okUpload('releases/rel-1/1.png', 'https://cdn/1.png')]);
    const registerSpy = vi.fn().mockResolvedValue({ success: true, data: [] });

    await uploadAndRegisterImages([makeImage({ id: 't', file })], {
      entityType: 'releases',
      targetId: 'rel-1',
      register: registerSpy,
    });

    expect(getPresignedMock).toHaveBeenCalledWith('releases', 'rel-1', [
      { fileName: '1.png', contentType: 'image/png', fileSize: file.size },
    ]);
  });

  it('throws when the presigned action fails', async () => {
    getPresignedMock.mockResolvedValue({ success: false, error: 'no urls' });
    const registerSpy = vi.fn();

    await expect(
      uploadAndRegisterImages([makeImage({ id: 't', file: makeFile('1.png') })], {
        entityType: 'artists',
        targetId: 'art-1',
        register: registerSpy,
      })
    ).rejects.toThrow('no urls');
  });

  it('throws when one or more S3 uploads fail', async () => {
    getPresignedMock.mockResolvedValue({
      success: true,
      data: [presigned('artists/art-1/1.png', 'https://cdn/1.png')],
    });
    uploadFilesMock.mockResolvedValue([
      { success: false, s3Key: 'artists/art-1/1.png', cdnUrl: 'https://cdn/1.png' },
    ]);
    const registerSpy = vi.fn();

    await expect(
      uploadAndRegisterImages([makeImage({ id: 't', file: makeFile('1.png') })], {
        entityType: 'artists',
        targetId: 'art-1',
        register: registerSpy,
      })
    ).rejects.toThrow('Failed to upload 1 image(s)');
  });

  it('passes caption and altText through to the register action', async () => {
    getPresignedMock.mockResolvedValue({
      success: true,
      data: [presigned('releases/rel-1/1.png', 'https://cdn/1.png')],
    });
    uploadFilesMock.mockResolvedValue([okUpload('releases/rel-1/1.png', 'https://cdn/1.png')]);
    const registerSpy = vi.fn().mockResolvedValue({ success: true, data: [] });

    await uploadAndRegisterImages(
      [makeImage({ id: 't', file: makeFile('1.png'), caption: 'Cap', altText: 'Alt' })],
      { entityType: 'releases', targetId: 'rel-1', register: registerSpy }
    );

    expect(registerSpy).toHaveBeenCalledWith('rel-1', [
      {
        s3Key: 'releases/rel-1/1.png',
        cdnUrl: 'https://cdn/1.png',
        caption: 'Cap',
        altText: 'Alt',
      },
    ]);
  });

  it('returns the register action result on success', async () => {
    getPresignedMock.mockResolvedValue({
      success: true,
      data: [presigned('releases/rel-1/1.png', 'https://cdn/1.png')],
    });
    uploadFilesMock.mockResolvedValue([okUpload('releases/rel-1/1.png', 'https://cdn/1.png')]);
    const data = [registered('new-1', 'https://cdn/new-1.png', 0)];
    const registerSpy = vi.fn().mockResolvedValue({ success: true, data });

    const result = await uploadAndRegisterImages(
      [makeImage({ id: 't', file: makeFile('1.png') })],
      { entityType: 'releases', targetId: 'rel-1', register: registerSpy }
    );

    expect(result).toEqual({ success: true, data });
  });
});
