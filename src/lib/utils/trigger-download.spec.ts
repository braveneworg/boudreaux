/* @vitest-environment jsdom */
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { triggerDownload } from './trigger-download';

function requireCapturedAnchor(anchor: HTMLAnchorElement | null): HTMLAnchorElement {
  if (!anchor) {
    throw new Error('expected anchor click to capture element');
  }

  return anchor;
}

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
    let capturedAnchor: HTMLAnchorElement | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      capturedAnchor = this;
    });

    triggerDownload('https://example.com/uuid.zip', 'my-release.zip');

    const anchor = requireCapturedAnchor(capturedAnchor);
    expect(anchor.download).toBe('my-release.zip');
  });

  it('omits the download attribute when fileName is not provided', () => {
    let capturedAnchor: HTMLAnchorElement | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      capturedAnchor = this;
    });

    triggerDownload('https://example.com/uuid.zip');

    const anchor = requireCapturedAnchor(capturedAnchor);
    expect(anchor.download).toBe('');
  });

  it('sets the anchor href to the normalized URL', () => {
    let capturedAnchor: HTMLAnchorElement | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      capturedAnchor = this;
    });

    triggerDownload('https://example.com/file.zip', 'release.zip');

    const anchor = requireCapturedAnchor(capturedAnchor);
    expect(anchor.href).toBe('https://example.com/file.zip');
  });
});
