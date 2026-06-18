/* @vitest-environment jsdom */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { triggerDownload } from './trigger-download';

const requireCapturedAnchor = (anchor: HTMLAnchorElement | null): HTMLAnchorElement => {
  if (!anchor) {
    throw new Error('expected anchor click to capture element');
  }

  return anchor;
};

/**
 * Captures the anchor that `triggerDownload` creates, returning a getter for it.
 * Spies on `document.createElement` to grab the anchor at creation time (avoiding any
 * reliance on `this`) and stubs the click so no real navigation occurs.
 */
const captureClickedAnchor = (): (() => HTMLAnchorElement | null) => {
  let captured: HTMLAnchorElement | null = null;
  const createElement = document.createElement.bind(document);
  vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
    const element = createElement(tagName);
    if (tagName === 'a') {
      captured = element as HTMLAnchorElement;
    }

    return element;
  });
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

  return () => captured;
};

describe('triggerDownload', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates a hidden anchor, clicks it, and removes it', () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const removeSpy = vi.spyOn(HTMLAnchorElement.prototype, 'remove');

    triggerDownload('https://example.com/download.zip');

    expect(clickSpy).toHaveBeenCalledOnce();
    expect(removeSpy).toHaveBeenCalledOnce();
  });

  it('rejects unsafe protocols', () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    triggerDownload('javascript:alert(1)');
    triggerDownload('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==');

    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('does nothing for empty or whitespace-only URLs', () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    triggerDownload('');
    triggerDownload('   ');

    expect(clickSpy).not.toHaveBeenCalled();
  });

  it('sets the download attribute when fileName is provided', () => {
    const getAnchor = captureClickedAnchor();

    triggerDownload('https://example.com/uuid.zip', 'my-release.zip');

    const anchor = requireCapturedAnchor(getAnchor());
    expect(anchor.download).toBe('my-release.zip');
  });

  it('omits the download attribute when fileName is not provided', () => {
    const getAnchor = captureClickedAnchor();

    triggerDownload('https://example.com/uuid.zip');

    const anchor = requireCapturedAnchor(getAnchor());
    expect(anchor.download).toBe('');
  });

  it('sets the anchor href to the normalized URL', () => {
    const getAnchor = captureClickedAnchor();

    triggerDownload('https://example.com/file.zip', 'release.zip');

    const anchor = requireCapturedAnchor(getAnchor());
    expect(anchor.href).toBe('https://example.com/file.zip');
  });

  it('falls back to documentElement when document.body is null', () => {
    const originalBody = document.body;
    const appendChildSpy = vi.spyOn(document.documentElement, 'appendChild');
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    vi.spyOn(HTMLAnchorElement.prototype, 'remove').mockImplementation(() => {});

    // Temporarily set body to null
    Object.defineProperty(document, 'body', { value: null, configurable: true });

    triggerDownload('https://example.com/file.zip');

    expect(appendChildSpy).toHaveBeenCalled();

    // Restore
    Object.defineProperty(document, 'body', { value: originalBody, configurable: true });
  });

  it('returns silently when the URL constructor throws', () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    // Force `new URL(...)` to throw inside `normalizeDownloadUrl` via a
    // monkey-patched stub. This exercises the catch branch that returns null.
    const RealURL = globalThis.URL;
    class ThrowingURL {
      constructor() {
        throw new TypeError('forced URL parse failure');
      }
    }
    vi.stubGlobal('URL', ThrowingURL);
    try {
      triggerDownload('https://example.com/file.zip');
      expect(clickSpy).not.toHaveBeenCalled();
    } finally {
      vi.stubGlobal('URL', RealURL);
    }
  });
});
