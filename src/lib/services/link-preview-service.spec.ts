/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { LinkPreview } from '@/lib/validation/link-preview-schema';

import { getLinkPreview, type LinkPreviewOutcome } from './link-preview-service';

vi.mock('server-only', () => ({}));

const vetHostnameMock = vi.fn();
const closeMock = vi.fn();
const buildPinnedDispatcherMock = vi.fn((_address: string, _family: number) => ({
  close: closeMock,
}));
vi.mock('@/lib/utils/ssrf-fetch', () => ({
  vetHostname: (hostname: string) => vetHostnameMock(hostname),
  buildPinnedDispatcher: (address: string, family: number) =>
    buildPinnedDispatcherMock(address, family),
}));

const extractOpenGraphMock = vi.fn();
vi.mock('@/lib/utils/extract-open-graph', () => ({
  extractOpenGraph: (html: string, pageUrl: string) => extractOpenGraphMock(html, pageUrl),
}));

const sanitizeBioTextMock = vi.fn((value: string) => `S:${value}`);
vi.mock('@/lib/utils/sanitize-bio-html', () => ({
  sanitizeBioText: (value: string) => sanitizeBioTextMock(value),
}));

// The service delegates the sharp transform to imageToWebpDataUri (its own
// real-sharp unit lives in Cycle A). Mock that helper here so this spec runs
// under the default `node` project with no native addon.
const imageToWebpDataUriMock = vi.fn();
vi.mock('@/lib/utils/thumbnail-data-uri', () => ({
  imageToWebpDataUri: (buffer: Buffer, width: number) => imageToWebpDataUriMock(buffer, width),
}));

const htmlResponse = (html: string): Response =>
  new Response(html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });

const imageResponse = (): Response =>
  new Response(new Uint8Array([1, 2, 3, 4]), {
    status: 200,
    headers: { 'Content-Type': 'image/png' },
  });

// Route by extension: hero/favicon URLs end in `.png`; page URLs do not.
const routeFetch = (input: string): Promise<Response> =>
  input.endsWith('.png')
    ? Promise.resolve(imageResponse())
    : Promise.resolve(htmlResponse('<html></html>'));

const okTags = {
  title: 'Real Title',
  description: 'Real Desc',
  siteName: 'Example Site',
  imageUrl: 'https://cdn.example.com/hero.png',
  faviconUrl: 'https://cdn.example.com/favicon.png',
};

let fetchMock: ReturnType<typeof vi.fn>;

// Guard that narrows the union without an `expect` inside a conditional.
const expectPreview = (outcome: LinkPreviewOutcome): LinkPreview => {
  if (outcome.kind !== 'ok') throw new Error(`expected ok outcome, got ${outcome.kind}`);
  return outcome.preview;
};

beforeEach(() => {
  vetHostnameMock.mockResolvedValue({ ok: true, address: '93.184.216.34', family: 4 });
  closeMock.mockResolvedValue(undefined);
  extractOpenGraphMock.mockReturnValue({ ...okTags });
  imageToWebpDataUriMock.mockResolvedValue('data:image/webp;base64,d2VicA==');
  fetchMock = vi.fn(routeFetch);
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('getLinkPreview', () => {
  it('returns forbidden when the host resolves to a disallowed address', async () => {
    vetHostnameMock.mockResolvedValueOnce({ ok: false, reason: 'disallowed', address: '10.0.0.1' });

    const outcome = await getLinkPreview('https://forbidden.test/artist');

    expect(outcome).toEqual({ kind: 'forbidden' });
  });

  it('does not fetch when the host is forbidden', async () => {
    vetHostnameMock.mockResolvedValueOnce({ ok: false, reason: 'disallowed', address: '10.0.0.1' });

    await getLinkPreview('https://forbidden2.test/artist');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('degrades to a host-only fallback on DNS failure', async () => {
    vetHostnameMock.mockResolvedValueOnce({
      ok: false,
      reason: 'dns_failure',
      error: new Error('ENOTFOUND'),
    });

    const outcome = await getLinkPreview('https://dnsfail.test/artist');

    expect(outcome).toEqual({
      kind: 'ok',
      preview: {
        url: 'https://dnsfail.test/artist',
        resolved: false,
        title: null,
        description: null,
        siteName: 'dnsfail.test',
        imageDataUri: null,
        faviconDataUri: null,
      },
    });
  });

  it('does not fetch when DNS resolution fails', async () => {
    vetHostnameMock.mockResolvedValueOnce({
      ok: false,
      reason: 'dns_failure',
      error: new Error('ENOTFOUND'),
    });

    await getLinkPreview('https://dnsfail2.test/artist');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('resolves an OG-tagged page to resolved:true', async () => {
    const preview = expectPreview(await getLinkPreview('https://resolved.test/artist'));

    expect(preview.resolved).toBe(true);
  });

  it('sanitizes the extracted title through sanitizeBioText', async () => {
    const preview = expectPreview(await getLinkPreview('https://sanitize.test/artist'));

    expect(preview.title).toBe('S:Real Title');
  });

  it('sanitizes the extracted description through sanitizeBioText', async () => {
    const preview = expectPreview(await getLinkPreview('https://sanitizedesc.test/artist'));

    expect(preview.description).toBe('S:Real Desc');
  });

  it('sanitizes the extracted site name through sanitizeBioText', async () => {
    const preview = expectPreview(await getLinkPreview('https://sitename.test/artist'));

    expect(preview.siteName).toBe('S:Example Site');
  });

  it('encodes the hero image as a webp data URI', async () => {
    const preview = expectPreview(await getLinkPreview('https://heroimg.test/artist'));

    expect(preview.imageDataUri).toBe('data:image/webp;base64,d2VicA==');
  });

  it('encodes the favicon as a webp data URI', async () => {
    const preview = expectPreview(await getLinkPreview('https://favimg.test/artist'));

    expect(preview.faviconDataUri).toBe('data:image/webp;base64,d2VicA==');
  });

  it('falls the siteName back to the hostname when og:site_name is absent', async () => {
    extractOpenGraphMock.mockReturnValueOnce({ ...okTags, siteName: null });

    const preview = expectPreview(await getLinkPreview('https://nosite.test/artist'));

    expect(preview.siteName).toBe('nosite.test');
  });

  it('degrades to resolved:false on a redirect response', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, { status: 302, headers: { Location: 'https://evil.test' } })
    );

    const preview = expectPreview(await getLinkPreview('https://redirect.test/artist'));

    expect(preview.resolved).toBe(false);
  });

  it('degrades to resolved:false on a non-2xx response', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 500 }));

    const preview = expectPreview(await getLinkPreview('https://fivehundred.test/artist'));

    expect(preview.resolved).toBe(false);
  });

  it('degrades to resolved:false on a non-HTML content type', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })
    );

    const preview = expectPreview(await getLinkPreview('https://json.test/artist'));

    expect(preview.resolved).toBe(false);
  });

  it('degrades to resolved:false on an empty body', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('', { status: 200, headers: { 'Content-Type': 'text/html' } })
    );

    const preview = expectPreview(await getLinkPreview('https://empty.test/artist'));

    expect(preview.resolved).toBe(false);
  });

  it('degrades to a host-only fallback when the page fetch throws', async () => {
    fetchMock.mockRejectedValueOnce(
      Object.assign(new Error('The operation was aborted'), { name: 'AbortError' })
    );

    const outcome = await getLinkPreview('https://timeout.test/artist');

    expect(outcome).toEqual({
      kind: 'ok',
      preview: {
        url: 'https://timeout.test/artist',
        resolved: false,
        title: null,
        description: null,
        siteName: 'timeout.test',
        imageDataUri: null,
        faviconDataUri: null,
      },
    });
  });

  it('stops reading the page body once the byte cap is reached', async () => {
    const cancelSpy = vi.fn();
    const chunk = new Uint8Array(256 * 1024); // 256 KB per pull
    // A stream that never closes on its own: only the ~512 KB cap stops the read.
    const cappedBody = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.enqueue(chunk);
      },
      cancel: cancelSpy,
    });
    fetchMock.mockResolvedValueOnce(
      new Response(cappedBody, { status: 200, headers: { 'Content-Type': 'text/html' } })
    );

    await getLinkPreview('https://capped.test/artist');

    expect(cancelSpy).toHaveBeenCalled();
  });

  it('degrades to resolved:false when no tags are extractable', async () => {
    extractOpenGraphMock.mockReturnValueOnce({
      title: null,
      description: null,
      siteName: null,
      imageUrl: null,
      faviconUrl: null,
    });

    const preview = expectPreview(await getLinkPreview('https://notags.test/artist'));

    expect(preview.resolved).toBe(false);
  });

  it('nulls the hero data URI when thumbnailing fails but keeps the preview resolved', async () => {
    imageToWebpDataUriMock.mockRejectedValue(new Error('thumbnail boom'));

    const preview = expectPreview(await getLinkPreview('https://herofail.test/artist'));

    expect(preview.imageDataUri).toBeNull();
  });

  it('nulls the hero data URI when the image host is disallowed', async () => {
    vetHostnameMock
      .mockResolvedValueOnce({ ok: true, address: '93.184.216.34', family: 4 }) // page host
      .mockResolvedValue({ ok: false, reason: 'disallowed', address: '10.0.0.1' }); // image hosts

    const preview = expectPreview(await getLinkPreview('https://badimg.test/artist'));

    expect(preview.imageDataUri).toBeNull();
  });

  it('nulls the hero data URI when the image response is not an image', async () => {
    fetchMock.mockImplementation((input: string) =>
      input.endsWith('.png')
        ? Promise.resolve(
            new Response('nope', { status: 200, headers: { 'Content-Type': 'text/plain' } })
          )
        : Promise.resolve(htmlResponse('<html></html>'))
    );

    const preview = expectPreview(await getLinkPreview('https://notimage.test/artist'));

    expect(preview.imageDataUri).toBeNull();
  });

  it('nulls the hero data URI when the image response exceeds the 5MB cap', async () => {
    fetchMock.mockImplementation((input: string) =>
      input.endsWith('.png')
        ? Promise.resolve(
            new Response(new Uint8Array(6 * 1024 * 1024), {
              status: 200,
              headers: { 'Content-Type': 'image/png' },
            })
          )
        : Promise.resolve(htmlResponse('<html></html>'))
    );

    const preview = expectPreview(await getLinkPreview('https://bigimg.test/artist'));

    expect(preview.imageDataUri).toBeNull();
  });

  it('nulls the hero data URI when the image response is a redirect', async () => {
    fetchMock.mockImplementation((input: string) =>
      input.endsWith('.png')
        ? Promise.resolve(
            new Response(null, { status: 302, headers: { Location: 'https://evil.test/x.png' } })
          )
        : Promise.resolve(htmlResponse('<html></html>'))
    );

    const preview = expectPreview(await getLinkPreview('https://imgredirect.test/artist'));

    expect(preview.imageDataUri).toBeNull();
  });

  it('serves a cached preview on the second call without re-fetching', async () => {
    await getLinkPreview('https://cached.test/artist');
    const callsAfterFirst = fetchMock.mock.calls.length;

    await getLinkPreview('https://cached.test/artist');

    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
  });

  it('caches resolved:false negatives too', async () => {
    fetchMock.mockResolvedValueOnce(new Response('nope', { status: 500 }));
    await getLinkPreview('https://cachedneg.test/artist');
    const callsAfterFirst = fetchMock.mock.calls.length;

    await getLinkPreview('https://cachedneg.test/artist');

    expect(fetchMock.mock.calls.length).toBe(callsAfterFirst);
  });

  it('short-circuits without any network call in E2E_MODE', async () => {
    vi.stubEnv('E2E_MODE', 'true');

    await getLinkPreview('https://e2e.test/artist');

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('does not vet the host in E2E_MODE', async () => {
    vi.stubEnv('E2E_MODE', 'true');

    await getLinkPreview('https://e2evet.test/artist');

    expect(vetHostnameMock).not.toHaveBeenCalled();
  });

  it('returns a deterministic host-only fallback in E2E_MODE', async () => {
    vi.stubEnv('E2E_MODE', 'true');

    const outcome = await getLinkPreview('https://e2e2.test/artist');

    expect(outcome).toEqual({
      kind: 'ok',
      preview: {
        url: 'https://e2e2.test/artist',
        resolved: false,
        title: null,
        description: null,
        siteName: 'e2e2.test',
        imageDataUri: null,
        faviconDataUri: null,
      },
    });
  });
});
