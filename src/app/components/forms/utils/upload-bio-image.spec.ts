/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createArtistBioImageAction } from '@/lib/actions/create-artist-bio-image-action';
import { generateImageVariantsAction } from '@/lib/actions/generate-image-variants-action';
import { getPresignedUploadUrlsAction } from '@/lib/actions/presigned-upload-actions';
import type { ArtistBioImageRecord } from '@/lib/types/domain/artist';
import { warn } from '@/lib/utils/console-logger';
import { uploadFilesToS3 } from '@/lib/utils/direct-upload';

import { uploadBioImage } from './upload-bio-image';

vi.mock('@/lib/actions/presigned-upload-actions', () => ({
  getPresignedUploadUrlsAction: vi.fn(),
}));
vi.mock('@/lib/utils/direct-upload', () => ({
  uploadFilesToS3: vi.fn(),
}));
vi.mock('@/lib/actions/create-artist-bio-image-action', () => ({
  createArtistBioImageAction: vi.fn(),
}));
vi.mock('@/lib/actions/generate-image-variants-action', () => ({
  generateImageVariantsAction: vi.fn(),
}));
vi.mock('@/lib/utils/console-logger', () => ({
  warn: vi.fn(),
  error: vi.fn(),
}));

const getPresignedMock = vi.mocked(getPresignedUploadUrlsAction);
const uploadFilesMock = vi.mocked(uploadFilesToS3);
const createBioImageMock = vi.mocked(createArtistBioImageAction);
const generateVariantsMock = vi.mocked(generateImageVariantsAction);

const makeFile = (name: string, type: string, size: number): File => {
  const file = new File(['x'.repeat(size)], name, { type });
  return file;
};

const ARTIST_ID = 'artist-123';
const S3_KEY = 'media/artists/artist-123/p.jpg';
const CDN_URL = 'https://cdn.example.com/media/artists/artist-123/p.jpg';
const ATTRIBUTION = 'Photo by Test';

const makeBioImageRecord = (): ArtistBioImageRecord => ({
  id: 'bio-img-1',
  artistId: ARTIST_ID,
  url: CDN_URL,
  thumbnailUrl: null,
  title: 'Test title',
  attribution: ATTRIBUTION,
  license: null,
  licenseUrl: null,
  sourceUrl: null,
  originalUrl: null,
  width: null,
  height: null,
  isPrimary: false,
  kind: null,
  alt: null,
  hasFace: null,
  faceScore: null,
  origin: 'custom',
  sortOrder: 0,
  createdAt: new Date(),
});

describe('uploadBioImage', () => {
  beforeEach(() => {
    getPresignedMock.mockReset();
    uploadFilesMock.mockReset();
    createBioImageMock.mockReset();
    generateVariantsMock.mockReset();
  });

  it('happy path: returns success with created record and fires all pipeline steps', async () => {
    const file = makeFile('p.jpg', 'image/jpeg', 1234);
    const record = makeBioImageRecord();

    getPresignedMock.mockResolvedValue({
      success: true,
      data: [{ uploadUrl: 'https://s3.example.com/upload', s3Key: S3_KEY, cdnUrl: CDN_URL }],
    });
    uploadFilesMock.mockResolvedValue([{ success: true, s3Key: S3_KEY, cdnUrl: CDN_URL }]);
    createBioImageMock.mockResolvedValue({ success: true, data: record });
    generateVariantsMock.mockResolvedValue({ success: true, variantsGenerated: 2 });

    const result = await uploadBioImage(file, {
      artistId: ARTIST_ID,
      attribution: ATTRIBUTION,
      title: 'Test title',
      alt: null,
    });

    expect(result).toEqual({ success: true, data: record });
    expect(getPresignedMock).toHaveBeenCalledWith('artists', ARTIST_ID, [
      { fileName: 'p.jpg', contentType: 'image/jpeg', fileSize: 1234 },
    ]);
    expect(createBioImageMock).toHaveBeenCalledWith({
      artistId: ARTIST_ID,
      url: CDN_URL,
      attribution: ATTRIBUTION,
      title: 'Test title',
      alt: null,
    });
    expect(generateVariantsMock).toHaveBeenCalledWith(CDN_URL);
  });

  it('presigned failure: returns error and does not call createArtistBioImageAction', async () => {
    const file = makeFile('p.jpg', 'image/jpeg', 1234);

    getPresignedMock.mockResolvedValue({ success: false, error: 'Presigned URL failure' });

    const result = await uploadBioImage(file, {
      artistId: ARTIST_ID,
      attribution: ATTRIBUTION,
    });

    expect(result).toEqual({ success: false, error: 'Presigned URL failure' });
    expect(createBioImageMock).not.toHaveBeenCalled();
  });

  it('S3 upload failure: returns error and does not call createArtistBioImageAction', async () => {
    const file = makeFile('p.jpg', 'image/jpeg', 1234);

    getPresignedMock.mockResolvedValue({
      success: true,
      data: [{ uploadUrl: 'https://s3.example.com/upload', s3Key: S3_KEY, cdnUrl: CDN_URL }],
    });
    uploadFilesMock.mockResolvedValue([
      { success: false, s3Key: S3_KEY, cdnUrl: CDN_URL, error: 'S3 network error' },
    ]);

    const result = await uploadBioImage(file, {
      artistId: ARTIST_ID,
      attribution: ATTRIBUTION,
    });

    expect(result).toEqual({ success: false, error: 'S3 network error' });
    expect(createBioImageMock).not.toHaveBeenCalled();
  });

  it('create action failure: returns the action error', async () => {
    const file = makeFile('p.jpg', 'image/jpeg', 1234);

    getPresignedMock.mockResolvedValue({
      success: true,
      data: [{ uploadUrl: 'https://s3.example.com/upload', s3Key: S3_KEY, cdnUrl: CDN_URL }],
    });
    uploadFilesMock.mockResolvedValue([{ success: true, s3Key: S3_KEY, cdnUrl: CDN_URL }]);
    createBioImageMock.mockResolvedValue({ success: false, error: 'x' });

    const result = await uploadBioImage(file, {
      artistId: ARTIST_ID,
      attribution: ATTRIBUTION,
    });

    expect(result).toEqual({ success: false, error: 'x' });
  });

  it('variant generation rejects: still returns success (fire-and-forget)', async () => {
    const file = makeFile('p.jpg', 'image/jpeg', 1234);
    const record = makeBioImageRecord();

    getPresignedMock.mockResolvedValue({
      success: true,
      data: [{ uploadUrl: 'https://s3.example.com/upload', s3Key: S3_KEY, cdnUrl: CDN_URL }],
    });
    uploadFilesMock.mockResolvedValue([{ success: true, s3Key: S3_KEY, cdnUrl: CDN_URL }]);
    createBioImageMock.mockResolvedValue({ success: true, data: record });
    generateVariantsMock.mockRejectedValue(new Error('Variant generation boom'));

    const result = await uploadBioImage(file, {
      artistId: ARTIST_ID,
      attribution: ATTRIBUTION,
    });

    // Flush microtasks so the fire-and-forget .catch() runs
    await Promise.resolve();

    expect(result).toEqual({ success: true, data: record });
    expect(vi.mocked(warn)).toHaveBeenCalledWith(
      '[Bio image upload] Variant generation failed:',
      expect.any(Error)
    );
  });
});
