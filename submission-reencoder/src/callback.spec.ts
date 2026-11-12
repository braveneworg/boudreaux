/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { createHmac } from 'node:crypto';

import { submissionReencodeCallbackSchema } from '@fakefour/job-contract';
import { verifyJobSignature } from '@fakefour/job-contract/signing';

import { describeFetchError, postCallback } from './callback.js';

import type { SubmissionReencodeResult } from './types.js';

const logEventMock = vi.hoisted(() => vi.fn());

vi.mock('./lib/log.js', () => ({
  logEvent: logEventMock,
  toErrorMessage: (err: unknown) => (err instanceof Error ? err.message : String(err)),
}));

const result: SubmissionReencodeResult = { ok: false, error: 'too-long' };

const okResponse = (): Response => new Response('ok', { status: 200 });

const SIGNING_KEY = 'ab'.repeat(32);
const URL = 'https://app.example/api/community/attachments/a/reencode/callback?x=secret';
const START_MS = Date.parse('2026-11-11T12:00:00.000Z');

/** A transport whose clock moves forward by however long it is told to sleep. */
const transport = (fetchFn: ReturnType<typeof vi.fn>) => {
  let nowMs = START_MS;
  const sleep = vi.fn(async (ms: number): Promise<void> => {
    nowMs += ms;
  });
  return { fetchFn: fetchFn as unknown as typeof fetch, sleep, now: () => nowMs };
};

/** The `t=…,v1=…` header {@link postCallback} must send for `body` at second `t`. */
const expectedSignature = (body: string, t: number): string =>
  `t=${t},v1=${createHmac('sha256', SIGNING_KEY).update(`${t}.${body}`).digest('hex')}`;

const sentInit = (fetchFn: ReturnType<typeof vi.fn>, call = 0): RequestInit =>
  (fetchFn.mock.calls.at(call) as [string, RequestInit])[1];

const sentHeaders = (fetchFn: ReturnType<typeof vi.fn>, call = 0): Record<string, string> =>
  sentInit(fetchFn, call).headers as Record<string, string>;

describe('postCallback signing', () => {
  it('signs the exact body it sends with the per-job key in x-job-signature', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());

    await postCallback(
      { url: URL, jobToken: 'tok-1', result, signingKey: SIGNING_KEY },
      transport(fetchFn)
    );

    expect(sentHeaders(fetchFn)['x-job-signature']).toBe(
      expectedSignature(sentInit(fetchFn).body as string, START_MS / 1000)
    );
  });

  it('sends a signature the web app verifies', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());

    await postCallback(
      { url: URL, jobToken: 'tok-1', result, signingKey: SIGNING_KEY },
      transport(fetchFn)
    );

    expect(
      verifyJobSignature({
        header: sentHeaders(fetchFn)['x-job-signature'],
        rawBody: sentInit(fetchFn).body as string,
        signingKey: SIGNING_KEY,
        nowSeconds: START_MS / 1000,
      })
    ).toEqual({ ok: true });
  });

  it('sends no signature header when the event carried no signing key', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());

    await postCallback({ url: URL, jobToken: 'tok-1', result }, transport(fetchFn));

    expect(sentHeaders(fetchFn)).not.toHaveProperty('x-job-signature');
  });

  it('re-signs with a fresh timestamp on each retry', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(okResponse());

    await postCallback(
      { url: URL, jobToken: 'tok-1', result, signingKey: SIGNING_KEY },
      transport(fetchFn)
    );

    const timestampOf = (header: string): number => Number(header.match(/^t=(\d+),/)?.[1]);
    const first = sentHeaders(fetchFn, 0)['x-job-signature'];
    const second = sentHeaders(fetchFn, 1)['x-job-signature'];
    expect(timestampOf(second)).toBeGreaterThan(timestampOf(first));
    expect(second).toBe(
      expectedSignature(sentInit(fetchFn, 1).body as string, timestampOf(second))
    );
  });
});

describe('postCallback', () => {
  it('POSTs to the callback url', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());

    await postCallback({ url: URL, jobToken: 'tok-1', result }, transport(fetchFn));

    expect(fetchFn).toHaveBeenCalledWith(URL, expect.objectContaining({ method: 'POST' }));
  });

  it('sends a body the wire contract accepts', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());

    await postCallback({ url: URL, jobToken: 'tok-1', result }, transport(fetchFn));

    const body: unknown = JSON.parse(sentInit(fetchFn).body as string);
    expect(body).toEqual({ jobToken: 'tok-1', result });
    expect(submissionReencodeCallbackSchema.safeParse(body).success).toBe(true);
  });

  it('sends a JSON content-type header', async () => {
    const fetchFn = vi.fn().mockResolvedValue(okResponse());

    await postCallback({ url: URL, jobToken: 'tok-1', result }, transport(fetchFn));

    expect(sentHeaders(fetchFn)).toMatchObject({ 'content-type': 'application/json' });
  });

  it('caps every attempt with its own abort timeout signal', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(okResponse());

    await postCallback({ url: URL, jobToken: 'tok-1', result }, transport(fetchFn));

    expect(sentInit(fetchFn, 0).signal).toBeInstanceOf(AbortSignal);
    expect(sentInit(fetchFn, 1).signal).not.toBe(sentInit(fetchFn, 0).signal);
  });

  it('retries a 429 and a 503, then stops at the first ok', async () => {
    const fetchFn = vi
      .fn()
      .mockResolvedValueOnce(new Response('slow down', { status: 429 }))
      .mockResolvedValueOnce(new Response('busy', { status: 503 }))
      .mockResolvedValueOnce(okResponse());

    await postCallback({ url: URL, jobToken: 'tok-1', result }, transport(fetchFn));

    expect(fetchFn).toHaveBeenCalledTimes(3);
  });

  it('gives up after the initial attempt and three retries', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response('busy', { status: 503 }));

    await postCallback({ url: URL, jobToken: 'tok-1', result }, transport(fetchFn));

    expect(fetchFn).toHaveBeenCalledTimes(4);
  });

  it('logs the status, and nothing else, when the callback stays non-ok', async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 400 }));

    await postCallback({ url: URL, jobToken: 'tok-1', result }, transport(fetchFn));

    expect(logEventMock).toHaveBeenCalledWith('warn', 'reencode_callback_non_ok', { status: 400 });
  });

  it('does not throw when the fetch itself rejects', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('network down'));

    await expect(
      postCallback({ url: URL, jobToken: 'tok-1', result }, transport(fetchFn))
    ).resolves.toBeUndefined();
  });

  it('never logs the callback url, the token or the key', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error(`connect failed for ${URL}`));

    await postCallback(
      { url: URL, jobToken: 'tok-1', result, signingKey: SIGNING_KEY },
      transport(fetchFn)
    );

    const logged = JSON.stringify(logEventMock.mock.calls);
    expect(logged).not.toContain('x=secret');
    expect(logged).not.toContain('tok-1');
    expect(logged).not.toContain(SIGNING_KEY);
  });

  it('logs what kind of failure a rejected fetch was', async () => {
    const refused = new TypeError('fetch failed', { cause: { code: 'ECONNREFUSED' } });
    const fetchFn = vi.fn().mockRejectedValue(refused);

    await postCallback({ url: URL, jobToken: 'tok-1', result }, transport(fetchFn));

    expect(logEventMock).toHaveBeenCalledWith('warn', 'reencode_callback_failed', {
      error: 'TypeError:ECONNREFUSED',
    });
  });
});

describe('describeFetchError', () => {
  it('names the error and the socket code behind it', () => {
    const err = new TypeError('fetch failed', { cause: { code: 'ENOTFOUND' } });

    expect(describeFetchError(err)).toBe('TypeError:ENOTFOUND');
  });

  it('names the error alone when nothing is behind it', () => {
    const err = new DOMException('The operation timed out', 'TimeoutError');

    expect(describeFetchError(err)).toBe('TimeoutError');
  });

  it('never repeats the error’s message, which can carry the url', () => {
    expect(describeFetchError(new Error(`no route to ${URL}`))).toBe('Error');
  });

  it('answers unknown for a thrown value that is not an error', () => {
    expect(describeFetchError('a string')).toBe('unknown');
  });
});
