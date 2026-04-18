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

const FAKE_BLOB = new Blob(['zip-content'], { type: 'application/zip' });

describe('triggerDownload', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ blob: () => Promise.resolve(FAKE_BLOB) }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('fetches the URL as a blob and clicks a hidden anchor', async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await triggerDownload('https://example.com/download.zip');

    expect(globalThis.fetch).toHaveBeenCalledWith('https://example.com/download.zip');
    expect(clickSpy).toHaveBeenCalledOnce();
  });

  it('rejects unsafe protocols', async () => {
    await triggerDownload('javascript:alert(1)');
    await triggerDownload('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==');

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('does nothing for empty or whitespace-only URLs', async () => {
    await triggerDownload('');
    await triggerDownload('   ');

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('sets the download attribute when fileName is provided', async () => {
    let capturedAnchor: HTMLAnchorElement | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      capturedAnchor = this;
    });

    await triggerDownload('https://example.com/uuid.zip', 'my-release.zip');

    expect(capturedAnchor).not.toBeNull();
    const anchor = requireCapturedAnchor(capturedAnchor);
    expect(anchor.download).toBe('my-release.zip');
  });

  it('omits the download attribute when fileName is not provided', async () => {
    let capturedAnchor: HTMLAnchorElement | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      capturedAnchor = this;
    });

    await triggerDownload('https://example.com/uuid.zip');

    expect(capturedAnchor).not.toBeNull();
    const anchor = requireCapturedAnchor(capturedAnchor);
    expect(anchor.download).toBe('');
  });

  it('uses a blob object URL for same-origin download', async () => {
    const revokeObjectURL = vi.spyOn(URL, 'revokeObjectURL');
    let capturedAnchor: HTMLAnchorElement | null = null;
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      capturedAnchor = this;
    });

    await triggerDownload('https://example.com/file.zip', 'release.zip');

    const anchor = requireCapturedAnchor(capturedAnchor);
    expect(anchor.href).toMatch(/^blob:/);
    expect(revokeObjectURL).toHaveBeenCalledOnce();
  });
});
