/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { act, render, waitFor } from '@testing-library/react';

import type { ImageItem, ImageUploaderProps } from '@/app/components/ui/image-uploader';
import {
  confirmTourDateUploadAction,
  confirmUploadAction,
  deleteImageAction,
  deleteTourDateImageAction,
  generateTourDateUploadUrlAction,
  generateUploadUrlAction,
  reorderImagesAction,
  reorderTourDateImagesAction,
} from '@/lib/actions/tours/tour-images';

import { uploadImageToS3, type UploadImageOptions } from './image-upload-helpers';
import { TourImageUpload, type TourImageUploadProps } from './tour-image-upload';

import type * as ImageUploadHelpers from './image-upload-helpers';

/** The props the stubbed uploader last rendered with. */
const rendered = vi.hoisted(() => ({ props: null as ImageUploaderProps | null }));

vi.mock('@/app/components/ui/image-uploader', () => ({
  ImageUploader: (props: ImageUploaderProps) => {
    rendered.props = props;
    return <div data-testid="image-uploader">{props.images.length} images</div>;
  },
}));

vi.mock('@/lib/actions/tours/tour-images', () => ({
  generateUploadUrlAction: vi.fn(),
  confirmUploadAction: vi.fn(),
  deleteImageAction: vi.fn(),
  reorderImagesAction: vi.fn(),
  generateTourDateUploadUrlAction: vi.fn(),
  confirmTourDateUploadAction: vi.fn(),
  deleteTourDateImageAction: vi.fn(),
  reorderTourDateImagesAction: vi.fn(),
}));

vi.mock('./image-upload-helpers', async (importOriginal) => ({
  ...(await importOriginal<typeof ImageUploadHelpers>()),
  uploadImageToS3: vi.fn(),
}));

vi.mock('@/lib/utils/console-logger', () => ({ error: vi.fn() }));

const OWNER_ID = 'owner-1';

const uploaderProps = (): ImageUploaderProps => {
  if (!rendered.props) {
    throw new Error('ImageUploader was not rendered');
  }
  return rendered.props;
};

const OWNERS = [
  {
    label: 'tour',
    kind: 'tour' as const,
    ownerKey: 'tourId',
    max: 10,
    uploaderLabel: 'Upload tour images',
    generate: generateUploadUrlAction,
    confirm: confirmUploadAction,
    remove: deleteImageAction,
    reorder: reorderImagesAction,
  },
  {
    label: 'tour date',
    kind: 'tourDate' as const,
    ownerKey: 'tourDateId',
    max: 20,
    uploaderLabel: 'Upload tour date images',
    generate: generateTourDateUploadUrlAction,
    confirm: confirmTourDateUploadAction,
    remove: deleteTourDateImageAction,
    reorder: reorderTourDateImagesAction,
  },
];

const STORED_IMAGE = {
  id: 'stored-1',
  s3Url: 'https://cdn.example.com/stored-1.jpg',
  fileName: 'stored-1.jpg',
  altText: null,
  displayOrder: 0,
};

const pickedImage = (): ImageItem => ({
  id: 'temp-1',
  file: new File(['x'], 'photo.jpg', { type: 'image/jpeg' }),
  preview: 'data:image/jpeg;base64,eA==',
});

describe.each(OWNERS)('TourImageUpload for a $label', (owner) => {
  const renderUpload = (props: Partial<TourImageUploadProps> = {}) =>
    render(<TourImageUpload owner={{ kind: owner.kind, id: OWNER_ID }} {...props} />);

  beforeEach(() => {
    rendered.props = null;
  });

  it("caps the uploader at the owner's image limit, with the owner's label", () => {
    renderUpload();

    expect({
      maxImages: uploaderProps().maxImages,
      label: uploaderProps().label,
      maxFileSize: uploaderProps().maxFileSize,
      acceptedTypes: uploaderProps().acceptedTypes,
    }).toEqual({
      maxImages: owner.max,
      label: owner.uploaderLabel,
      maxFileSize: 10 * 1024 * 1024,
      acceptedTypes: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    });
  });

  it('passes disabled through', () => {
    renderUpload({ disabled: true });

    expect(uploaderProps().disabled).toBe(true);
  });

  it('shows the stored images, falling back to the file name for alt text', () => {
    renderUpload({ initialImages: [STORED_IMAGE] });

    expect(uploaderProps().images).toEqual([
      {
        id: 'stored-1',
        preview: STORED_IMAGE.s3Url,
        altText: 'stored-1.jpg',
        uploadedUrl: STORED_IMAGE.s3Url,
        sortOrder: 0,
      },
    ]);
  });

  it("signs and confirms each upload against the owner's actions", async () => {
    vi.mocked(uploadImageToS3).mockResolvedValueOnce({ id: 'saved-1', s3Url: 'https://cdn/x' });
    renderUpload();

    await act(() => uploaderProps().onUpload?.([pickedImage()]) ?? Promise.resolve());

    const [[options]] = vi.mocked(uploadImageToS3).mock.calls as [[UploadImageOptions]];
    const file = new File(['x'], 'photo.jpg', { type: 'image/jpeg' });
    await options.generateUrl(file);
    await options.confirmUpload('media/k.jpg', 'bucket', file);

    expect(vi.mocked(owner.generate).mock.calls).toEqual([
      [{ [owner.ownerKey]: OWNER_ID, fileName: 'photo.jpg', fileSize: 1, mimeType: 'image/jpeg' }],
    ]);
    expect(vi.mocked(owner.confirm).mock.calls).toEqual([
      [
        {
          [owner.ownerKey]: OWNER_ID,
          s3Key: 'media/k.jpg',
          s3Bucket: 'bucket',
          fileName: 'photo.jpg',
          fileSize: 1,
          mimeType: 'image/jpeg',
        },
      ],
    ]);
  });

  it('marks an uploaded image with its stored id and URL, then reports completion', async () => {
    const onUploadComplete = vi.fn();
    vi.mocked(uploadImageToS3).mockResolvedValueOnce({ id: 'saved-1', s3Url: 'https://cdn/x' });
    renderUpload({ onUploadComplete });
    act(() => uploaderProps().onImagesChange([pickedImage()]));

    await act(() => uploaderProps().onUpload?.([pickedImage()]) ?? Promise.resolve());

    await waitFor(() => {
      expect(uploaderProps().images).toEqual([
        expect.objectContaining({
          id: 'saved-1',
          uploadedUrl: 'https://cdn/x',
          isUploading: false,
          uploadProgress: 100,
        }),
      ]);
    });
    expect(onUploadComplete).toHaveBeenCalledTimes(1);
  });

  it('marks a failed upload with its message', async () => {
    vi.mocked(uploadImageToS3).mockRejectedValueOnce(
      new Error(`Maximum of ${owner.max} images per ${owner.label} exceeded`)
    );
    renderUpload();
    act(() => uploaderProps().onImagesChange([pickedImage()]));

    await act(() => uploaderProps().onUpload?.([pickedImage()]) ?? Promise.resolve());

    await waitFor(() => {
      expect(uploaderProps().images).toEqual([
        expect.objectContaining({
          id: 'temp-1',
          isUploading: false,
          error: `Maximum of ${owner.max} images per ${owner.label} exceeded`,
        }),
      ]);
    });
  });

  it("stores a new order against the owner's reorder action", async () => {
    vi.mocked(owner.reorder).mockResolvedValueOnce({ success: true, data: undefined });
    renderUpload();

    await act(() => uploaderProps().onReorder?.(['b', 'a']) ?? Promise.resolve());

    expect(vi.mocked(owner.reorder).mock.calls).toEqual([
      [
        {
          [owner.ownerKey]: OWNER_ID,
          imageOrders: [
            { id: 'b', displayOrder: 0 },
            { id: 'a', displayOrder: 1 },
          ],
        },
      ],
    ]);
  });

  it('rejects a reorder the server refused, so the uploader can roll back', async () => {
    vi.mocked(owner.reorder).mockResolvedValueOnce({
      success: false,
      error: 'Failed to reorder images',
      code: 'UNKNOWN',
    });
    renderUpload();

    await expect(uploaderProps().onReorder?.(['a'])).rejects.toThrow('Failed to reorder images');
  });

  it("deletes against the owner's delete action and hands back its answer", async () => {
    const refused = {
      success: false as const,
      error: 'Image not found',
      code: 'NOT_FOUND' as const,
    };
    vi.mocked(owner.remove).mockResolvedValueOnce(refused);
    renderUpload();

    const result = await uploaderProps().onDelete?.('stored-1');

    expect(vi.mocked(owner.remove).mock.calls).toEqual([
      [{ imageId: 'stored-1', [owner.ownerKey]: OWNER_ID }],
    ]);
    expect(result).toEqual(refused);
  });
});
