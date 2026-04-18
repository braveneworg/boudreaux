/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Triggers a file download without navigating the current page away.
 *
 * Creates a temporary anchor element and programmatically clicks it.
 * When the server responds with `Content-Disposition: attachment`, the
 * browser intercepts the response as a download rather than navigating.
 *
 * The `download` attribute is set as a hint for browsers that support
 * it, but the authoritative filename comes from the S3 presigned URL's
 * `ResponseContentDisposition` header (built with RFC 6266 compliant
 * `filename` / `filename*` parameters).
 */
export function triggerDownload(url: string, fileName?: string): void {
  if (typeof globalThis.window === 'undefined' || typeof globalThis.document === 'undefined') {
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
  const container = document.body ?? document.documentElement;
  container.appendChild(anchor);
  anchor.click();
  anchor.remove();
}

function normalizeDownloadUrl(url: string): string | null {
  const trimmedUrl = url.trim();
  if (!trimmedUrl) {
    return null;
  }

  try {
    const parsedUrl = new URL(trimmedUrl, globalThis.window.location.origin);
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      return null;
    }

    return parsedUrl.toString();
  } catch {
    return null;
  }
}
