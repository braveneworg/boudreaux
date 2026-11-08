/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { ImageUploadService } from '@/lib/services/tours/image-upload-service';

import type { TourImageStore } from './types';

/** The production store adapter: S3, through the upload service's calls. */
export const s3TourImageStore: TourImageStore = {
  presignPut: (put) => ImageUploadService.presignPut(put),
  delete: async (s3Key) => (await ImageUploadService.deleteFromS3(s3Key)).success,
  publicUrl: (s3Key) => ImageUploadService.generateCdnUrl(s3Key),
};
