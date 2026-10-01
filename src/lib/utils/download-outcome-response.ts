/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { FREE_FORMAT_TYPES } from '@/lib/constants/digital-formats';
import type { Denial, DenialReason, Outcome } from '@/lib/services/download-gate/types';

/** A refused download: everything the gate can say no with. */
export type DownloadRefusal = Extract<Outcome, { ok: false }>;

export interface RefusalResponse {
  status: number;
  body: Record<string, unknown>;
}

/**
 * HTTP for a refused download (ADR-0018). The error codes are the ones the
 * download dialog and the E2E suite already read, so the wire contract holds
 * while the decision moves behind the gate.
 */
export const downloadRefusal = (refusal: DownloadRefusal): RefusalResponse => {
  if (refusal.denial === null) {
    return refusal.reason === 'NOT_FOUND'
      ? { status: 404, body: { success: false, error: 'NOT_FOUND', message: 'Release not found.' } }
      : {
          status: 409,
          body: {
            success: false,
            error: 'LOCK_HELD',
            errorCode: 'LOCK_HELD',
            message: 'A download is already in progress. Please wait for it to finish.',
          },
        };
  }
  return denialResponse(refusal.denial);
};

/** One entry per DenialReason; `never` in the index keeps the table total. */
const DENIAL_RESPONSES: Record<DenialReason, (denial: Denial) => RefusalResponse> = {
  NO_FILES: () => ({
    status: 404,
    body: { success: false, error: 'NO_FILES', message: 'No files found for this release.' },
  }),
  PURCHASE_REQUIRED: ({ formats = [] }) => ({
    status: 403,
    body: {
      success: false,
      error: 'PURCHASE_REQUIRED',
      message: `This format requires a purchase. Free downloads are limited to ${FREE_FORMAT_TYPES.join(', ')}.`,
      formats,
      contactSupportUrl: '/support',
    },
  }),
  DELETED: ({ formats = [] }) => ({
    status: 410,
    body: {
      success: false,
      error: 'DELETED',
      message: 'This digital format is no longer available.',
      formats,
    },
  }),
  LIFETIME_CAP: () => ({
    status: 403,
    body: {
      success: false,
      error: 'QUOTA_EXCEEDED',
      message: 'You have reached your free download limit. Purchase this release to download it.',
    },
  }),
  THROTTLED: ({ resetsAt }) => ({
    status: 403,
    body: {
      success: false,
      error: 'CAP_REACHED',
      errorCode: 'CAP_REACHED',
      message: 'You have reached the free download limit for this release. Try again later.',
      resetsAtIso: resetsAt?.toISOString() ?? null,
    },
  }),
  DOWNLOAD_LIMIT: ({ resetInHours = null }) => ({
    status: 403,
    body: {
      success: false,
      error: 'DOWNLOAD_LIMIT',
      message: 'Download limit reached for this release. Please try again later.',
      resetInHours,
    },
  }),
};

const denialResponse = (denial: Denial): RefusalResponse => DENIAL_RESPONSES[denial.reason](denial);
