/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { isInvalidS3Key } from '@/lib/actions/confirm-upload-action-helpers';
import type { DigitalFormatType } from '@/lib/constants/digital-formats';

/** The prefix every object of one Release's format sits under. */
export const formatKeyPrefix = (releaseId: string, formatType: DigitalFormatType): string =>
  `releases/${releaseId}/digital-formats/${formatType}/`;

/**
 * The key a received file is stored under: the format's prefix, the time it
 * was received, and the file name with every character outside
 * `[a-zA-Z0-9.-]` replaced by `-`.
 */
export const buildFormatKey = ({
  releaseId,
  formatType,
  fileName,
}: {
  releaseId: string;
  formatType: DigitalFormatType;
  fileName: string;
}): string =>
  `${formatKeyPrefix(releaseId, formatType)}${Date.now()}-${fileName.replace(/[^a-zA-Z0-9.-]/g, '-')}`;

/** True when `s3Key` sits under the format's prefix and does not traverse out of it. */
export const isFormatKey = (
  s3Key: string,
  { releaseId, formatType }: { releaseId: string; formatType: DigitalFormatType }
): boolean => !isInvalidS3Key(s3Key, formatKeyPrefix(releaseId, formatType));
