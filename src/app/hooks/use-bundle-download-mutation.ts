/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { useMutation } from '@tanstack/react-query';

interface BundleDownloadParams {
  releaseId: string;
  formats: string[];
}

interface BundleDownloadApiResponse {
  success?: boolean;
  downloadUrl?: string;
  fileName?: string;
  message?: string;
}

/**
 * Calls the bundle download API, parses the JSON response, and returns
 * the presigned download URL. Throws on any error so TanStack Query
 * surfaces it via `mutation.error`.
 */
const GENERIC_ERROR = 'Download failed. Please try again.';

const fetchBundleDownload = async ({
  releaseId,
  formats,
}: BundleDownloadParams): Promise<string> => {
  const encodedReleaseId = encodeURIComponent(releaseId);
  const encodedFormats = formats.map((format) => encodeURIComponent(format)).join(',');

  let response: Response;
  try {
    response = await fetch(
      `/api/releases/${encodedReleaseId}/download/bundle?formats=${encodedFormats}`
    );
  } catch {
    throw new Error(GENERIC_ERROR);
  }

  const data = (await response.json().catch(() => null)) as BundleDownloadApiResponse | null;

  if (!response.ok || !data?.success) {
    throw new Error(data?.message ?? GENERIC_ERROR);
  }

  if (!data.downloadUrl) {
    throw new Error('Download link is unavailable. Please try again.');
  }

  return data.downloadUrl;
};

/**
 * Shared mutation hook for downloading a bundle of digital format files.
 *
 * On success the presigned S3 URL is opened via `window.open` to trigger
 * the browser's native download. Callers can pass an optional `onSuccess`
 * callback for side-effects like closing a dialog.
 *
 * Usage:
 * ```ts
 * const download = useBundleDownloadMutation({ onSuccess: () => setOpen(false) });
 * download.mutate({ releaseId, formats: ['FLAC', 'WAV'] });
 * // download.isPending, download.isSuccess, download.error
 * ```
 */
export const useBundleDownloadMutation = (options?: { onSuccess?: () => void }) => {
  return useMutation({
    mutationFn: fetchBundleDownload,
    onSuccess: (downloadUrl) => {
      window.open(downloadUrl, '_self');
      options?.onSuccess?.();
    },
  });
};
