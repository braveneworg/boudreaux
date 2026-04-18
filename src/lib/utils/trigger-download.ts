/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Triggers a file download without navigating the current page away.
 *
 * Creates a temporary anchor element and programmatically clicks it.
 * When the server responds with `Content-Disposition: attachment`, the
 * browser intercepts the response as a download rather than navigating.
 * This works cross-browser including iOS Safari 26+, which blocks
 * downloads from hidden iframes — especially cross-origin ones like S3
 * presigned URLs.
 */
export function triggerDownload(url: string, fileName?: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const normalizedUrl = normalizeDownloadUrl(url);
  if (!normalizedUrl) {
    return;
  }

  const anchor = document.createElement('a');
  anchor.href = normalizedUrl;
  if (fileName) {
    anchor.download = fileName;
  }
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function normalizeDownloadUrl(url: string): string | null {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) {
    return null;
  }

  try {
    const parsedUrl = new URL(trimmedUrl, window.location.origin);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return null;
    }

    return parsedUrl.toString();
  } catch {
    return null;
  }
}
