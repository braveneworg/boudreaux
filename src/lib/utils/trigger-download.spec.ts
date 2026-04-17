/* @vitest-environment jsdom */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { triggerDownload } from './trigger-download';

describe('triggerDownload', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    document.querySelectorAll('iframe').forEach((iframe) => iframe.remove());
  });

  it('appends a hidden iframe for valid https URLs', () => {
    triggerDownload('https://example.com/download.zip');

    const iframe = document.querySelector('iframe');
    expect(iframe).toBeInTheDocument();
    expect(iframe?.getAttribute('src')).toBe('https://example.com/download.zip');
    expect(iframe).toHaveStyle({ display: 'none' });
  });

  it('rejects unsafe protocols', () => {
    triggerDownload('javascript:alert(1)');
    triggerDownload('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==');

    expect(document.querySelector('iframe')).not.toBeInTheDocument();
  });

  it('falls back to documentElement when body is unavailable', () => {
    const bodyDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'body');
    if (!bodyDescriptor) {
      return;
    }

    Object.defineProperty(Document.prototype, 'body', {
      configurable: true,
      get: () => null,
    });

    try {
      triggerDownload('https://example.com/download.zip');

      const iframe = document.documentElement.querySelector('iframe');
      expect(iframe).toBeInTheDocument();
    } finally {
      if (bodyDescriptor) {
        Object.defineProperty(Document.prototype, 'body', bodyDescriptor);
      }
    }
  });

  it('removes the iframe after timeout', () => {
    vi.useFakeTimers();
    triggerDownload('https://example.com/download.zip');
    expect(document.querySelector('iframe')).toBeInTheDocument();

    vi.advanceTimersByTime(60_000);

    expect(document.querySelector('iframe')).not.toBeInTheDocument();
  });
});
