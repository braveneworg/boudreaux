/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { verifyJobSignature } from '@fakefour/job-contract/signing';

import { bioGenerationJob } from '@/lib/services/bio-generation-service';
import { imageLinksJob } from '@/lib/services/image-links-service';
import { videoEnrichmentJob } from '@/lib/services/video-enrichment-service';

import { jobInvoker, lambdaJobInvoker, localJobInvoker } from './job-invoker';

import type { JobAdapter, JobCopy, JobPayload, JobTypes } from './types';

vi.mock('server-only', () => ({}));

const mockLoggerError = vi.hoisted(() => vi.fn());
const sendMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/utils/logger', () => ({
  loggers: { media: { error: mockLoggerError, warn: vi.fn(), info: vi.fn() } },
}));

vi.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: class {
    send = sendMock;
  },
  InvokeCommand: class {
    constructor(
      readonly input: { FunctionName?: string; InvocationType?: string; Payload?: Uint8Array }
    ) {}
  },
}));

const CALLBACK_URL = 'https://fakefourrecords.com/api/things/t1/callback';
const PROGRESS_URL = 'https://fakefourrecords.com/api/things/t1/progress';
const SIGNING_KEY = 'a'.repeat(64);
const DEFAULT_DELAY_MS = 1200;

interface TestJobTypes extends JobTypes {
  request: { entityId: string };
  data: { value: string };
  checkpoint: { stage: string };
}

const COPY: JobCopy = {
  notFound: 'Thing not found.',
  noCallbackUrl: 'Thing callback URL is not configured',
  notConfigured: 'Thing is not configured (BIO_GENERATOR_LAMBDA_NAME unset)',
  unreachable: 'Failed to reach the thing',
  runFailed: 'Thing failed unexpectedly.',
  persistFailed: 'Thing persistence failed.',
};

/** Only the parts of an adapter an invoke reads: its kind, copy and fake data. */
const testJob = (overrides: Partial<JobAdapter<TestJobTypes>['fake']> = {}) =>
  ({
    kind: 'image-links',
    copy: COPY,
    fake: {
      delayMs: DEFAULT_DELAY_MS,
      checkpoint: () => ({ stage: 'reading' }),
      result: ({ entityId }) => ({ ok: true, data: { value: entityId } }),
      ...overrides,
    },
  }) as JobAdapter<TestJobTypes>;

const payload: JobPayload<TestJobTypes> = {
  entityId: 't1',
  callbackUrl: CALLBACK_URL,
  progressUrl: PROGRESS_URL,
  jobToken: 'tok-123',
  signingKey: SIGNING_KEY,
};

/** The subset of a `fetch` init the local adapter sends. */
type PostInit = { method: string; headers: Record<string, string>; body: string; cache: string };

/** Stubbed `fetch` standing in for the routes; `mockReset()` restores this 202. */
const fetchMock = vi.fn(
  async (_url: string, _init: PostInit): Promise<{ ok: boolean; status: number }> => ({
    ok: true,
    status: 202,
  })
);

const postedUrls = (): string[] => fetchMock.mock.calls.map(([url]) => url);

const postedInit = (url: string): PostInit | undefined =>
  fetchMock.mock.calls.find(([posted]) => posted === url)?.[1];

const postedBody = (url: string): unknown => {
  const init = postedInit(url);
  return init ? JSON.parse(init.body) : undefined;
};

/** Whether the POST to `url` carries a signature that verifies over its own body under `key`. */
const postIsSignedWith = (url: string, key: string): boolean =>
  verifyJobSignature({
    header: postedInit(url)?.headers['x-job-signature'] ?? null,
    rawBody: postedInit(url)?.body ?? '',
    signingKey: key,
    nowSeconds: Date.now() / 1000,
  }).ok;

type SentCommand = {
  input: { FunctionName?: string; InvocationType?: string; Payload?: Uint8Array };
};

const sentCommand = (): SentCommand => sendMock.mock.calls[0]?.[0] as SentCommand;

beforeEach(() => {
  fetchMock.mockReset();
  sendMock.mockReset().mockResolvedValue({ StatusCode: 202 });
  vi.stubGlobal('fetch', fetchMock);
  vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'fakefour-bio-generator');
  vi.stubEnv('BIO_GENERATOR_FAKE_DELAY_MS', '0');
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('lambdaJobInvoker', () => {
  it('fires an Event invoke of the configured function carrying the payload', async () => {
    const ack = await lambdaJobInvoker.invoke(testJob(), payload);

    expect(ack).toEqual({ ok: true });
    expect(sentCommand().input.FunctionName).toBe('fakefour-bio-generator');
    expect(sentCommand().input.InvocationType).toBe('Event');
    expect(
      JSON.parse(Buffer.from(sentCommand().input.Payload ?? new Uint8Array()).toString('utf-8'))
    ).toEqual(payload);
  });

  it('acks the kind copy and never sends when the function name is unset', async () => {
    vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', '');

    const ack = await lambdaJobInvoker.invoke(testJob(), payload);

    expect(ack).toEqual({ ok: false, error: COPY.notConfigured });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('logs the unset function name', async () => {
    vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', '');

    await lambdaJobInvoker.invoke(testJob(), payload);

    expect(mockLoggerError).toHaveBeenCalledWith('job_invoke_unconfigured', undefined, {
      kind: 'image-links',
    });
  });

  it('acks the kind copy and logs when the send fails', async () => {
    const error = new Error('throttled');
    sendMock.mockRejectedValueOnce(error);

    const ack = await lambdaJobInvoker.invoke(testJob(), payload);

    expect(ack).toEqual({ ok: false, error: COPY.unreachable });
    expect(mockLoggerError).toHaveBeenCalledWith('job_invoke_failed', error, {
      kind: 'image-links',
    });
  });
});

describe('localJobInvoker', () => {
  it('posts the signed checkpoint, then the signed callback, and acks', async () => {
    const ack = await localJobInvoker.invoke(testJob(), payload);

    expect(ack).toEqual({ ok: true });
    expect(postedUrls()).toEqual([PROGRESS_URL, CALLBACK_URL]);
    expect(postIsSignedWith(PROGRESS_URL, SIGNING_KEY)).toBe(true);
    expect(postIsSignedWith(CALLBACK_URL, SIGNING_KEY)).toBe(true);
  });

  it('posts the checkpoint under the job token', async () => {
    await localJobInvoker.invoke(testJob(), payload);

    expect(postedBody(PROGRESS_URL)).toEqual({ jobToken: 'tok-123', stage: 'reading' });
  });

  it('posts the fake result under the job token', async () => {
    await localJobInvoker.invoke(testJob(), payload);

    expect(postedBody(CALLBACK_URL)).toEqual({
      jobToken: 'tok-123',
      result: { ok: true, data: { value: 't1' } },
    });
  });

  it('posts uncached JSON', async () => {
    await localJobInvoker.invoke(testJob(), payload);

    expect(postedInit(CALLBACK_URL)).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
  });

  it('skips the checkpoint when the kind supplies none', async () => {
    await localJobInvoker.invoke(testJob({ checkpoint: undefined }), payload);

    expect(postedUrls()).toEqual([CALLBACK_URL]);
  });

  it('skips the checkpoint when the payload has no progress URL', async () => {
    const { progressUrl: _progressUrl, ...withoutProgress } = payload;

    await localJobInvoker.invoke(testJob(), withoutProgress);

    expect(postedUrls()).toEqual([CALLBACK_URL]);
  });

  it('never invokes the Lambda', async () => {
    await localJobInvoker.invoke(testJob(), payload);

    expect(sendMock).not.toHaveBeenCalled();
  });

  it('still acks when a route answers non-2xx, and logs the rejection', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    const ack = await localJobInvoker.invoke(testJob(), payload);

    expect(ack).toEqual({ ok: true });
    expect(mockLoggerError).toHaveBeenCalledWith('local_job_dispatch_rejected', undefined, {
      kind: 'image-links',
      url: CALLBACK_URL,
      status: 500,
    });
  });

  it('acks a failure and logs when a post throws', async () => {
    const error = new Error('network down');
    fetchMock.mockRejectedValueOnce(error);

    const ack = await localJobInvoker.invoke(testJob(), payload);

    expect(ack).toEqual({ ok: false, error: 'Local job dispatch failed' });
    expect(mockLoggerError).toHaveBeenCalledWith('local_job_dispatch_failed', error, {
      kind: 'image-links',
    });
  });

  it('never posts the callback when the checkpoint post throws', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    await localJobInvoker.invoke(testJob(), payload);

    expect(postedUrls()).toEqual([PROGRESS_URL]);
  });

  it('does not arm a timer when the delay is zero', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    await localJobInvoker.invoke(testJob(), payload);

    expect(setTimeoutSpy).not.toHaveBeenCalled();
    setTimeoutSpy.mockRestore();
  });

  describe('in-flight delay', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('waits the configured delay between the checkpoint and the callback', async () => {
      vi.stubEnv('BIO_GENERATOR_FAKE_DELAY_MS', '1500');

      const ack = localJobInvoker.invoke(testJob(), payload);
      await vi.advanceTimersByTimeAsync(0);
      const beforeDelay = postedUrls();
      await vi.advanceTimersByTimeAsync(1500);
      await ack;

      expect(beforeDelay).toEqual([PROGRESS_URL]);
      expect(postedUrls()).toEqual([PROGRESS_URL, CALLBACK_URL]);
    });

    it('waits the kind default when the env value is not a number', async () => {
      vi.stubEnv('BIO_GENERATOR_FAKE_DELAY_MS', 'soon');

      const ack = localJobInvoker.invoke(testJob(), payload);
      await vi.advanceTimersByTimeAsync(DEFAULT_DELAY_MS - 1);
      const beforeDelay = postedUrls();
      await vi.advanceTimersByTimeAsync(1);
      await ack;

      expect(beforeDelay).toEqual([PROGRESS_URL]);
      expect(postedUrls()).toEqual([PROGRESS_URL, CALLBACK_URL]);
    });
  });
});

describe('jobInvoker', () => {
  it('takes the local adapter under BIO_GENERATOR_FAKE=true', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', 'true');

    await jobInvoker.invoke(testJob(), payload);

    expect(postedUrls()).toEqual([PROGRESS_URL, CALLBACK_URL]);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('takes the Lambda otherwise', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', 'false');

    await jobInvoker.invoke(testJob(), payload);

    expect(sendMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('one local adapter for every kind', () => {
  const dispatch = {
    callbackUrl: CALLBACK_URL,
    progressUrl: PROGRESS_URL,
    jobToken: 'tok-123',
    signingKey: SIGNING_KEY,
  };

  it('bio generation: a signed checkpoint to the progress URL, then a signed callback', async () => {
    await localJobInvoker.invoke(bioGenerationJob, {
      artistId: 'a'.repeat(24),
      displayName: 'Radiohead',
      ...dispatch,
    });

    expect(postedUrls()).toEqual([PROGRESS_URL, CALLBACK_URL]);
    expect(postIsSignedWith(PROGRESS_URL, SIGNING_KEY)).toBe(true);
    expect(postIsSignedWith(CALLBACK_URL, SIGNING_KEY)).toBe(true);
  });

  it('video enrichment: a signed checkpoint to the progress URL, then a signed callback', async () => {
    await localJobInvoker.invoke(videoEnrichmentJob, {
      task: 'video-enrichment',
      videoId: 'f'.repeat(24),
      title: 'Bite Through Stone',
      artistDisplay: 'Ceschi',
      category: 'MUSIC',
      artists: [{ artistId: 'a'.repeat(24), name: 'Ceschi', role: 'primary' }],
      ...dispatch,
    });

    expect(postedUrls()).toEqual([PROGRESS_URL, CALLBACK_URL]);
    expect(postIsSignedWith(PROGRESS_URL, SIGNING_KEY)).toBe(true);
    expect(postIsSignedWith(CALLBACK_URL, SIGNING_KEY)).toBe(true);
  });

  it('images-from-links: a signed callback alone, with no checkpoint', async () => {
    await localJobInvoker.invoke(imageLinksJob, {
      task: 'images-from-links',
      artistId: 'a'.repeat(24),
      displayName: 'Ceschi',
      links: ['https://press.test/kit'],
      callbackUrl: CALLBACK_URL,
      jobToken: 'tok-123',
      signingKey: SIGNING_KEY,
    });

    expect(postedUrls()).toEqual([CALLBACK_URL]);
    expect(postIsSignedWith(CALLBACK_URL, SIGNING_KEY)).toBe(true);
  });
});
