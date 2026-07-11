/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { postBioProgress } from './progress.js';

const logEventMock = vi.hoisted(() => vi.fn());

vi.mock('./lib/log.js', () => ({
  logEvent: logEventMock,
  toErrorMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
}));

const okResponse = (): Response => new Response('ok', { status: 200 });

const baseArgs = () => ({
  progressUrl: 'https://app.example/progress',
  jobToken: 'tok-1',
  stage: 'musicbrainz' as const,
});

describe('postBioProgress', () => {
  it('POSTs to the progress url', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());

    await postBioProgress(baseArgs(), fetchFn);

    expect(fetchFn).toHaveBeenCalledWith('https://app.example/progress', expect.anything());
  });

  it('uses the POST method', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());

    await postBioProgress(baseArgs(), fetchFn);

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
  });

  it('sends a JSON content-type header', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());

    await postBioProgress(baseArgs(), fetchFn);

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({ 'content-type': 'application/json' });
  });

  it('sends the jobToken and stage as the JSON body', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());

    await postBioProgress(baseArgs(), fetchFn);

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ jobToken: 'tok-1', stage: 'musicbrainz' });
  });

  it('includes detail and counts in the body when provided', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());

    await postBioProgress(
      { ...baseArgs(), stage: 'vision-gating', detail: 'gating', counts: { candidates: 12 } },
      fetchFn
    );

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      jobToken: 'tok-1',
      stage: 'vision-gating',
      detail: 'gating',
      counts: { candidates: 12 },
    });
  });

  it('never puts the progressUrl in the body', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());

    await postBioProgress(baseArgs(), fetchFn);

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).not.toHaveProperty('progressUrl');
  });

  it('caps the request with an abort timeout signal', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());

    await postBioProgress(baseArgs(), fetchFn);

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it('resolves without throwing when the endpoint responds non-ok', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('bad', { status: 500 }));

    await expect(postBioProgress(baseArgs(), fetchFn)).resolves.toBeUndefined();
  });

  it('logs a warn event with the stage and status when the endpoint responds non-ok', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 503 }));

    await postBioProgress({ ...baseArgs(), stage: 'drafting' }, fetchFn);

    expect(logEventMock).toHaveBeenCalledWith('warn', 'bio_progress_non_ok', {
      stage: 'drafting',
      status: 503,
    });
  });

  it('does not log the non-ok event on a 2xx response', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());

    await postBioProgress(baseArgs(), fetchFn);

    expect(logEventMock).not.toHaveBeenCalledWith('warn', 'bio_progress_non_ok', expect.anything());
  });

  it('resolves without throwing when the fetch itself rejects', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('network down'));

    await expect(postBioProgress(baseArgs(), fetchFn)).resolves.toBeUndefined();
  });

  it('logs a warn event with the stage and error when the fetch rejects', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('network down'));

    await postBioProgress({ ...baseArgs(), stage: 'web-search' }, fetchFn);

    expect(logEventMock).toHaveBeenCalledWith('warn', 'bio_progress_failed', {
      stage: 'web-search',
      error: 'network down',
    });
  });

  it('resolves without throwing when the request is aborted by the timeout', async () => {
    const fetchFn = vi
      .fn()
      .mockRejectedValue(new DOMException('The operation timed out', 'TimeoutError'));

    await expect(
      postBioProgress({ ...baseArgs(), stage: 'commons' }, fetchFn)
    ).resolves.toBeUndefined();
  });
});
