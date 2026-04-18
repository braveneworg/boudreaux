/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Triggers a file download without navigating the current page away.
 *
 * Fetches the file as a blob and creates an object URL so that the
 * download is same-origin. This lets the `download` attribute control
 * the filename on iOS Safari, which ignores it for cross-origin URLs
 * (e.g. S3 presigned URLs) and appends `.download` instead.
 */
export async function triggerDownload(url: string, fileName?: string): Promise<void> {
  if (typeof globalThis.window === 'undefined' || typeof globalThis.document === 'undefined') {
    return;
  }

  const normalizedUrl = normalizeDownloadUrl(url);
  if (!normalizedUrl) {
    return;
  }

  const response = await fetch(normalizedUrl);
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  if (fileName) {
    anchor.download = fileName;
  }
  anchor.style.display = 'none';
  const container = document.body ?? document.documentElement;
  container.appendChild(anchor);
  anchor.click();
  anchor.remove();

  URL.revokeObjectURL(objectUrl);
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
