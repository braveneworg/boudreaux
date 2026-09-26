/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { createHmac } from 'node:crypto';

import { postBioCallback } from './callback.js';

import type { BioGenerationResult } from './types.js';

const logEventMock = vi.hoisted(() => vi.fn());

vi.mock('./lib/log.js', () => ({
  logEvent: logEventMock,
  toErrorMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
}));

const result: BioGenerationResult = {
  ok: true,
  data: {
    shortBio: 's',
    longBio: 'l',
    altBio: 'a',
    genres: 'rock',
    images: [],
    links: [],
    model: 'gemini-2.5-flash',
  },
};

const okResponse = (): Response => new Response('ok', { status: 200 });

const SIGNING_KEY = 'k'.repeat(64);

/** The `t=…,v1=…` header {@link postBioCallback} must send for `body` at second `t`. */
const expectedSignature = (body: string, t: number): string =>
  `t=${t},v1=${createHmac('sha256', SIGNING_KEY).update(`${t}.${body}`).digest('hex')}`;

const sentHeaders = (fetchFn: ReturnType<typeof vi.fn>, call = 0): Record<string, string> =>
  (fetchFn.mock.calls[call] as [string, RequestInit])[1].headers as Record<string, string>;

describe('postBioCallback signing', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-26T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('signs the exact body it sends with the per-job key in x-job-signature', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());

    await postBioCallback(
      { url: 'https://app.example/cb', jobToken: 'tok-1', result, signingKey: SIGNING_KEY },
      fetchFn
    );

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(sentHeaders(fetchFn)['x-job-signature']).toBe(
      expectedSignature(init.body as string, Math.floor(Date.now() / 1000))
    );
  });

  it('sends no signature header when the event carried no signing key', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());

    await postBioCallback({ url: 'https://app.example/cb', jobToken: 'tok-1', result }, fetchFn);

    expect(sentHeaders(fetchFn)).not.toHaveProperty('x-job-signature');
  });

  it('re-signs with a fresh timestamp on each retry', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(okResponse());

    const run = postBioCallback(
      { url: 'https://app.example/cb', jobToken: 'tok-1', result, signingKey: SIGNING_KEY },
      fetchFn
    );
    await vi.advanceTimersByTimeAsync(5_000);
    await run;

    expect(fetchFn).toHaveBeenCalledTimes(2);
    const timestampOf = (header: string): number => Number(header.match(/^t=(\d+),/)?.[1]);
    const first = sentHeaders(fetchFn, 0)['x-job-signature'];
    const second = sentHeaders(fetchFn, 1)['x-job-signature'];
    expect(timestampOf(second)).toBeGreaterThan(timestampOf(first));
    const [, init] = fetchFn.mock.calls[1] as [string, RequestInit];
    expect(second).toBe(expectedSignature(init.body as string, timestampOf(second)));
  });
});

describe('postBioCallback', () => {
  it('POSTs to the callback url', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());

    await postBioCallback({ url: 'https://app.example/cb', jobToken: 'tok-1', result }, fetchFn);

    expect(fetchFn).toHaveBeenCalledWith('https://app.example/cb', expect.anything());
  });

  it('uses the POST method', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());

    await postBioCallback({ url: 'https://app.example/cb', jobToken: 'tok-1', result }, fetchFn);

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(init.method).toBe('POST');
  });

  it('sends the jobToken and result as the JSON body', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());

    await postBioCallback({ url: 'https://app.example/cb', jobToken: 'tok-1', result }, fetchFn);

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ jobToken: 'tok-1', result });
  });

  it('sends a JSON content-type header', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());

    await postBioCallback({ url: 'https://app.example/cb', jobToken: 'tok-1', result }, fetchFn);

    const [, init] = fetchFn.mock.calls[0] as [string, RequestInit];
    expect(init.headers).toMatchObject({ 'content-type': 'application/json' });
  });

  it('does not throw when the callback responds non-ok', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('bad', { status: 500 }));

    await expect(
      postBioCallback({ url: 'https://app.example/cb', jobToken: 'tok-1', result }, fetchFn)
    ).resolves.toBeUndefined();
  });

  it('logs a warn event when the callback responds non-ok', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 400 }));

    await postBioCallback({ url: 'https://app.example/cb', jobToken: 'tok-1', result }, fetchFn);

    expect(logEventMock).toHaveBeenCalledWith('warn', 'bio_callback_non_ok', { status: 400 });
  });

  it('does not log the non-ok event when the callback responds 2xx', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());

    await postBioCallback({ url: 'https://app.example/cb', jobToken: 'tok-1', result }, fetchFn);

    expect(logEventMock).not.toHaveBeenCalledWith('warn', 'bio_callback_non_ok', expect.anything());
  });

  it('does not throw when the fetch itself rejects', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('network down'));

    await expect(
      postBioCallback({ url: 'https://app.example/cb', jobToken: 'tok-1', result }, fetchFn)
    ).resolves.toBeUndefined();
  });
});
