/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { notifyIfStaleServerAction } from '@/app/components/stale-page-toast';
import { type ImageItem } from '@/app/components/ui/image-uploader';
import { getPresignedUploadUrlsAction } from '@/lib/actions/presigned-upload-actions';
import {
  type RegisterImageActionResult,
  type RegisterImageInput,
  type RegisterImageResult,
} from '@/lib/actions/register-image-actions';
import { uploadFilesToS3 } from '@/lib/utils/direct-upload';
import { STALE_PAGE_MESSAGE } from '@/lib/utils/stale-server-action';

/** Entity buckets that own uploadable images (mirrors the presigned-action union). */
export type ImageUploadEntityType = 'artists' | 'releases';

/** Register action shared shape — `registerReleaseImagesAction`. */
export type RegisterImagesAction = (
  targetId: string,
  images: RegisterImageInput[]
) => Promise<RegisterImageActionResult>;

interface UploadAndRegisterOptions {
  entityType: ImageUploadEntityType;
  targetId: string;
  register: RegisterImagesAction;
}

/** An image that is pending upload — has a real `File` and no uploaded URL yet. */
type ImageWithFile = ImageItem & { file: File };

const isPending = (img: ImageItem): boolean => Boolean(img.file) && !img.uploadedUrl;

const hasFile = (img: ImageItem): img is ImageWithFile => img.file instanceof File;

/**
 * Pure S3 image-upload pipeline shared by the release and artist forms: request
 * presigned URLs, PUT the files to S3, then register the uploaded objects in the
 * database. Throws an `Error` on any step failure (no presigned URLs, a failed
 * S3 PUT) so the caller's `try`/`catch` can surface it; otherwise resolves with
 * the register action's result for the caller to merge into form state. A
 * Server Action rejected because the tab predates the deployed build shows
 * the reload toast and throws {@link STALE_PAGE_MESSAGE} in its place.
 */
export const uploadAndRegisterImages = async (
  imagesToUpload: ImageItem[],
  options: UploadAndRegisterOptions
): Promise<RegisterImageActionResult> => {
  try {
    return await runUploadAndRegister(imagesToUpload, options);
  } catch (error) {
    if (notifyIfStaleServerAction(error)) {
      throw Error(STALE_PAGE_MESSAGE, { cause: error });
    }
    throw error;
  }
};

const runUploadAndRegister = async (
  imagesToUpload: ImageItem[],
  { entityType, targetId, register }: UploadAndRegisterOptions
): Promise<RegisterImageActionResult> => {
  const imagesWithFiles = imagesToUpload.filter(hasFile);

  const fileInfos = imagesWithFiles.map((img) => ({
    fileName: img.file.name,
    contentType: img.file.type,
    fileSize: img.file.size,
  }));

  const presignedResult = await getPresignedUploadUrlsAction(entityType, targetId, fileInfos);

  if (!presignedResult.success || !presignedResult.data) {
    throw Error(presignedResult.error || 'Failed to get upload URLs');
  }

  const files = imagesWithFiles.map((img) => img.file);
  const uploadResults = await uploadFilesToS3(files, presignedResult.data);

  const failedUploads = uploadResults.filter((r) => !r.success);
  if (failedUploads.length > 0) {
    throw Error(`Failed to upload ${failedUploads.length} image(s)`);
  }

  const imageInfos = presignedResult.data.map((presigned, index) => {
    const imageWithFile = imagesWithFiles.at(index);
    return {
      s3Key: presigned.s3Key,
      cdnUrl: presigned.cdnUrl,
      caption: imageWithFile?.caption || '',
      altText: imageWithFile?.altText || '',
    };
  });

  return register(targetId, imageInfos);
};

/** Flag every pending image as uploading (leaves already-uploaded images intact). */
export const markImagesUploading = (images: ImageItem[]): ImageItem[] =>
  images.map((img) => (isPending(img) ? { ...img, isUploading: true } : img));

/**
 * Merge registered results into pending images in order, advancing a counter so
 * only pending images consume an uploaded entry. Non-matching images simply have
 * their uploading flag cleared.
 */
export const mergeUploadedImages = (
  images: ImageItem[],
  uploaded: RegisterImageResult[]
): ImageItem[] => {
  let uploadIndex = 0;
  return images.map((img) => {
    const next = uploaded.at(uploadIndex);
    if (isPending(img) && next) {
      uploadIndex++;
      return {
        ...img,
        id: next.id,
        uploadedUrl: next.src,
        isUploading: false,
        sortOrder: next.sortOrder,
      };
    }
    return { ...img, isUploading: false };
  });
};

/**
 * Merge registered results by the image's own array index (not a pending
 * counter). Used by the artist create path; preserved verbatim for parity.
 */
export const mergeUploadedImagesByIndex = (
  images: ImageItem[],
  uploaded: RegisterImageResult[]
): ImageItem[] =>
  images.map((img, index) => {
    const next = uploaded.at(index);
    if (isPending(img) && next) {
      return {
        ...img,
        id: next.id,
        uploadedUrl: next.src,
        isUploading: false,
        sortOrder: next.sortOrder,
      };
    }
    return { ...img, isUploading: false };
  });

/** Record an upload failure on the pending images (clears uploading, sets error). */
export const markImagesUploadError = (images: ImageItem[], errorMessage: string): ImageItem[] =>
  images.map((img) => (isPending(img) ? { ...img, isUploading: false, error: errorMessage } : img));
