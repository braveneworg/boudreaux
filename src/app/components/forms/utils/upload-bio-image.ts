/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { createArtistBioImageAction } from '@/lib/actions/create-artist-bio-image-action';
import { generateImageVariantsAction } from '@/lib/actions/generate-image-variants-action';
import {
  getPresignedUploadUrlsAction,
  type PresignedUrlResult,
} from '@/lib/actions/presigned-upload-actions';
import type { ArtistBioImageRecord } from '@/lib/types/domain/artist';
import { warn } from '@/lib/utils/console-logger';
import { uploadFilesToS3 } from '@/lib/utils/direct-upload';

export interface UploadBioImageParams {
  artistId: string;
  attribution: string;
  title?: string | null;
  alt?: string | null;
}

export interface UploadBioImageResult {
  success: boolean;
  data?: ArtistBioImageRecord;
  error?: string;
}

type StepOk<T> = { ok: true; data: T };
type StepErr = { ok: false; error: string };
type StepResult<T> = StepOk<T> | StepErr;

/** Request a presigned URL for one file and return the first result or an error. */
const stepGetPresigned = async (
  file: File,
  artistId: string
): Promise<StepResult<PresignedUrlResult>> => {
  const result = await getPresignedUploadUrlsAction('artists', artistId, [
    { fileName: file.name, contentType: file.type, fileSize: file.size },
  ]);
  const first = result.data?.[0];
  if (!result.success || first == null) {
    return { ok: false, error: result.error ?? 'Failed to get upload URL' };
  }
  return { ok: true, data: first };
};

/** Upload one file to S3 using its presigned URL and return the CDN URL or an error. */
const stepUploadToS3 = async (
  file: File,
  presigned: PresignedUrlResult
): Promise<StepResult<string>> => {
  const [result] = await uploadFilesToS3([file], [presigned]);
  if (!result?.success) {
    return { ok: false, error: result?.error ?? 'Failed to upload image' };
  }
  return { ok: true, data: result.cdnUrl };
};

/**
 * Orchestrates the full bio-image upload pipeline: presign → S3 upload →
 * register ArtistBioImage → fire-and-forget variant generation.
 *
 * Returns a typed result rather than throwing so callers can handle failures
 * without try/catch boilerplate.
 */
export const uploadBioImage = async (
  file: File,
  { artistId, attribution, title = null, alt = null }: UploadBioImageParams
): Promise<UploadBioImageResult> => {
  const presignedStep = await stepGetPresigned(file, artistId);
  if (!presignedStep.ok) {
    return { success: false, error: presignedStep.error };
  }

  const uploadStep = await stepUploadToS3(file, presignedStep.data);
  if (!uploadStep.ok) {
    return { success: false, error: uploadStep.error };
  }

  const cdnUrl = uploadStep.data;
  const created = await createArtistBioImageAction({
    artistId,
    url: cdnUrl,
    attribution,
    title,
    alt,
  });
  if (!created.success || !created.data) {
    return { success: false, error: created.error ?? 'Failed to save image' };
  }

  // Fire-and-forget: variants are a progressive enhancement, never block the insert.
  void generateImageVariantsAction(cdnUrl).catch((err: unknown) => {
    warn('[Bio image upload] Variant generation failed:', err);
  });

  return { success: true, data: created.data };
};
