/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Triggers a file download without navigating the current page away.
 *
 * Uses a hidden iframe whose `src` is set to the download URL. When the
 * server responds with `Content-Disposition: attachment`, the browser
 * intercepts the response as a download rather than rendering it in the
 * iframe. This keeps the parent page — and any active connections such as
 * SSE streams — alive.
 *
 * This approach works cross-browser including iOS Safari, where
 * `window.open(url, '_self')` would navigate the page and tear down
 * active fetch streams.
 */
export function triggerDownload(url: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return;
  }

  const normalizedUrl = normalizeDownloadUrl(url);
  if (!normalizedUrl) {
    return;
  }

  const parentElement = document.body ?? document.documentElement;
  if (!parentElement) {
    return;
  }

  const iframe = document.createElement('iframe');
  iframe.style.display = 'none';
  iframe.src = normalizedUrl;
  parentElement.appendChild(iframe);

  // Clean up the iframe after the download has had time to register
  setTimeout(() => iframe.remove(), 60_000);
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
