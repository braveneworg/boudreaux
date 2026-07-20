/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { fakeBioGeneration } from './bio-generation-fixture';
import {
  DEFAULT_LOCAL_DISPATCH_DELAY_MS,
  dispatchBioGenerationLocally,
} from './bio-generation-local-dispatch';

import type { BioGenerationLambdaInput } from './bio-generation-fixture';

vi.mock('server-only', () => ({}));

const mockLoggerError = vi.hoisted(() => vi.fn());
const mockLoggerWarn = vi.hoisted(() => vi.fn());

vi.mock('@/lib/utils/logger', () => ({
  loggers: { media: { error: mockLoggerError, warn: mockLoggerWarn } },
}));

const CALLBACK_URL = 'https://fakefourrecords.com/api/artists/a1/bio-generation/callback';
const PROGRESS_URL = 'https://fakefourrecords.com/api/artists/a1/bio-generation/progress';

/** The subset of a `fetch` init the adapter sends (typed so calls stay inspectable). */
type PostInit = { method: string; headers: Record<string, string>; body: string; cache: string };

/**
 * Stubbed `fetch` standing in for the callback/progress routes. `mockReset()`
 * restores this baked-in 202, so every test starts from "the route accepted it".
 */
const fetchMock = vi.fn(
  async (_url: string, _init: PostInit): Promise<{ ok: boolean; status: number }> => ({
    ok: true,
    status: 202,
  })
);

const baseInput: BioGenerationLambdaInput = {
  artistId: 'a1',
  displayName: 'Radiohead',
  callbackUrl: CALLBACK_URL,
  progressUrl: PROGRESS_URL,
  jobToken: 'tok-123',
};

const withInput = (overrides: Partial<BioGenerationLambdaInput>): BioGenerationLambdaInput => ({
  ...baseInput,
  ...overrides,
});

/** URLs the adapter POSTed to, in call order. */
const postedUrls = (): string[] => fetchMock.mock.calls.map(([url]) => url);

/** The JSON body POSTed to `url`, or undefined when the adapter never posted there. */
const postedBody = (url: string): Record<string, unknown> | undefined => {
  const call = fetchMock.mock.calls.find(([posted]) => posted === url);
  return call ? JSON.parse(call[1].body) : undefined;
};

/** The `fetch` init the adapter POSTed to `url`. */
const postedInit = (url: string): PostInit | undefined =>
  fetchMock.mock.calls.find(([posted]) => posted === url)?.[1];

beforeEach(() => {
  fetchMock.mockReset();
  mockLoggerError.mockReset();
  mockLoggerWarn.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  // Nothing waits: the adapter's in-flight window is a UX affordance for the
  // polled timeline, asserted explicitly in the delay tests below.
  vi.stubEnv('BIO_GENERATOR_FAKE_DELAY_MS', '0');
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('dispatchBioGenerationLocally — missing wire configuration', () => {
  it('returns a typed error when the callback URL is missing', async () => {
    const result = await dispatchBioGenerationLocally(withInput({ callbackUrl: undefined }));

    expect(result).toEqual({
      ok: false,
      error: 'Local bio dispatch requires a callback URL and job token',
    });
  });

  it('never posts when the callback URL is missing', async () => {
    await dispatchBioGenerationLocally(withInput({ callbackUrl: undefined }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns a typed error when the job token is missing', async () => {
    const result = await dispatchBioGenerationLocally(withInput({ jobToken: undefined }));

    expect(result).toEqual({
      ok: false,
      error: 'Local bio dispatch requires a callback URL and job token',
    });
  });

  it('never posts when the job token is missing', async () => {
    await dispatchBioGenerationLocally(withInput({ jobToken: undefined }));

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('dispatchBioGenerationLocally — progress checkpoint', () => {
  it('posts the vision-gating checkpoint carrying the job token', async () => {
    await dispatchBioGenerationLocally(baseInput);

    expect(postedBody(PROGRESS_URL)).toEqual({
      jobToken: 'tok-123',
      stage: 'vision-gating',
      counts: { candidates: 3 },
    });
  });

  it('posts the checkpoint as uncached JSON', async () => {
    await dispatchBioGenerationLocally(baseInput);

    expect(postedInit(PROGRESS_URL)).toMatchObject({
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      cache: 'no-store',
    });
  });

  it('skips the checkpoint when no progress URL is configured', async () => {
    await dispatchBioGenerationLocally(withInput({ progressUrl: undefined }));

    expect(postedUrls()).toEqual([CALLBACK_URL]);
  });

  it('posts the checkpoint before the completion callback', async () => {
    await dispatchBioGenerationLocally(baseInput);

    expect(postedUrls()).toEqual([PROGRESS_URL, CALLBACK_URL]);
  });
});

describe('dispatchBioGenerationLocally — completion callback', () => {
  it('posts the callback carrying the job token', async () => {
    await dispatchBioGenerationLocally(baseInput);

    expect(postedBody(CALLBACK_URL)?.jobToken).toBe('tok-123');
  });

  it('posts the fixture generation result as the callback result', async () => {
    await dispatchBioGenerationLocally(baseInput);

    expect(postedBody(CALLBACK_URL)?.result).toEqual(fakeBioGeneration(baseInput));
  });

  it('acknowledges the dispatch once both posts land', async () => {
    const result = await dispatchBioGenerationLocally(baseInput);

    expect(result).toEqual({ ok: true });
  });
});

describe('dispatchBioGenerationLocally — route rejections', () => {
  it('still acknowledges when the callback route answers non-ok', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    const result = await dispatchBioGenerationLocally(baseInput);

    expect(result).toEqual({ ok: true });
  });

  it('logs the rejecting route url and status', async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 500 });

    await dispatchBioGenerationLocally(baseInput);

    expect(mockLoggerError).toHaveBeenCalledWith(
      'Local bio dispatch callback rejected',
      undefined,
      { url: CALLBACK_URL, status: 500 }
    );
  });

  it('resolves to a typed error when the fetch rejects', async () => {
    fetchMock.mockRejectedValue(new Error('network down'));

    const result = await dispatchBioGenerationLocally(baseInput);

    expect(result).toEqual({ ok: false, error: 'Failed to reach the bio generator' });
  });

  it('logs the failure when the fetch rejects', async () => {
    const error = new Error('network down');
    fetchMock.mockRejectedValue(error);

    await dispatchBioGenerationLocally(baseInput);

    expect(mockLoggerError).toHaveBeenCalledWith('Local bio dispatch failed', error);
  });

  it('never posts the callback when the progress post rejects', async () => {
    fetchMock.mockRejectedValueOnce(new Error('network down'));

    await dispatchBioGenerationLocally(baseInput);

    expect(postedUrls()).toEqual([PROGRESS_URL]);
  });
});

describe('dispatchBioGenerationLocally — in-flight delay', () => {
  it('waits the configured delay before posting the completion callback', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE_DELAY_MS', '1500');
    vi.useFakeTimers();
    try {
      const promise = dispatchBioGenerationLocally(baseInput);
      await vi.advanceTimersByTimeAsync(0);
      expect(postedUrls()).toEqual([PROGRESS_URL]);

      await vi.advanceTimersByTimeAsync(1500);
      await promise;
      expect(postedUrls()).toEqual([PROGRESS_URL, CALLBACK_URL]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back to the default delay when the env value is not a number', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE_DELAY_MS', 'soon');
    vi.useFakeTimers();
    try {
      const promise = dispatchBioGenerationLocally(baseInput);
      await vi.advanceTimersByTimeAsync(DEFAULT_LOCAL_DISPATCH_DELAY_MS);
      await promise;

      expect(postedUrls()).toEqual([PROGRESS_URL, CALLBACK_URL]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back to the default delay when the env value is negative', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE_DELAY_MS', '-1');
    vi.useFakeTimers();
    try {
      const promise = dispatchBioGenerationLocally(baseInput);
      await vi.advanceTimersByTimeAsync(0);
      expect(postedUrls()).toEqual([PROGRESS_URL]);

      await vi.advanceTimersByTimeAsync(DEFAULT_LOCAL_DISPATCH_DELAY_MS);
      await promise;
      expect(postedUrls()).toEqual([PROGRESS_URL, CALLBACK_URL]);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not arm a timer when the delay is zero', async () => {
    const setTimeoutSpy = vi.spyOn(globalThis, 'setTimeout');

    await dispatchBioGenerationLocally(baseInput);

    expect(setTimeoutSpy).not.toHaveBeenCalled();
    setTimeoutSpy.mockRestore();
  });
});
