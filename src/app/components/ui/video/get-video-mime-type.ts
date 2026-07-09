/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Determines the correct MIME type for a video URL from its file extension.
 * Any query string (e.g. a signed CloudFront URL's params) and fragment are
 * stripped first, and the extension is lowercased. Falls back to 'video/mp4'.
 */
export const getVideoMimeType = (url: string): string => {
  const extension = url.split('?')[0].split('#')[0].split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    mp4: 'video/mp4',
    webm: 'video/webm',
  };
  return mimeTypes[extension ?? ''] ?? 'video/mp4';
};
