/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type * as LambdaDispatch from './lambda-dispatch';

vi.mock('server-only', () => ({}));

const lambdaClientConfigs = vi.hoisted((): unknown[] => []);
const handlerConfigs = vi.hoisted((): unknown[] => []);

vi.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: class {
    constructor(public config: unknown) {
      lambdaClientConfigs.push(config);
    }
  },
}));

vi.mock('@smithy/node-http-handler', () => ({
  NodeHttpHandler: class {
    constructor(public config: unknown) {
      handlerConfigs.push(config);
    }
  },
}));

type LambdaDispatchModule = typeof LambdaDispatch;

/** A fresh module instance, so each test starts with no cached client. */
const loadFresh = async (): Promise<LambdaDispatchModule> => {
  vi.resetModules();
  return import('./lambda-dispatch');
};

beforeEach(() => {
  lambdaClientConfigs.length = 0;
  handlerConfigs.length = 0;
  vi.stubEnv('AWS_REGION', 'eu-west-2');
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('INVOKE_REQUEST_TIMEOUT_MS', () => {
  it('is a short dispatch timeout — the Event invoke returns 202 immediately', async () => {
    const { INVOKE_REQUEST_TIMEOUT_MS } = await loadFresh();

    expect(INVOKE_REQUEST_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });
});

describe('getLambdaClient', () => {
  it('returns the same client on every call', async () => {
    const { getLambdaClient } = await loadFresh();

    expect(getLambdaClient()).toBe(getLambdaClient());
  });

  it('constructs the client only once', async () => {
    const { getLambdaClient } = await loadFresh();

    getLambdaClient();
    getLambdaClient();

    expect(lambdaClientConfigs).toHaveLength(1);
  });

  it('uses the configured AWS region', async () => {
    const { getLambdaClient } = await loadFresh();

    getLambdaClient();

    expect(lambdaClientConfigs).toEqual([expect.objectContaining({ region: 'eu-west-2' })]);
  });

  it('falls back to us-east-1 when AWS_REGION is unset', async () => {
    vi.stubEnv('AWS_REGION', '');
    const { getLambdaClient } = await loadFresh();

    getLambdaClient();

    expect(lambdaClientConfigs).toEqual([expect.objectContaining({ region: 'us-east-1' })]);
  });

  it('bounds each request with the dispatch timeout', async () => {
    const { getLambdaClient, INVOKE_REQUEST_TIMEOUT_MS } = await loadFresh();

    getLambdaClient();

    expect(handlerConfigs).toEqual([{ requestTimeout: INVOKE_REQUEST_TIMEOUT_MS }]);
  });
});

describe('tokensMatch', () => {
  it('matches identical tokens', async () => {
    const { tokensMatch } = await loadFresh();

    expect(tokensMatch('2f1c6c1e-token', '2f1c6c1e-token')).toBe(true);
  });

  it('rejects tokens of the same length that differ', async () => {
    const { tokensMatch } = await loadFresh();

    expect(tokensMatch('token-aaaa', 'token-aaab')).toBe(false);
  });

  it('rejects tokens of different lengths without throwing', async () => {
    const { tokensMatch } = await loadFresh();

    expect(tokensMatch('short', 'a-much-longer-token')).toBe(false);
  });

  it('compares bytes, not characters, for multi-byte input', async () => {
    const { tokensMatch } = await loadFresh();

    // Same character count, different UTF-8 byte lengths.
    expect(tokensMatch('é', 'e')).toBe(false);
  });
});

describe('resolveFakeDelayMs', () => {
  it('returns the fallback when the env var is unset', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE_DELAY_MS', undefined);
    const { resolveFakeDelayMs } = await loadFresh();

    expect(resolveFakeDelayMs(4000)).toBe(4000);
  });

  it('returns the configured delay', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE_DELAY_MS', '1500');
    const { resolveFakeDelayMs } = await loadFresh();

    expect(resolveFakeDelayMs(4000)).toBe(1500);
  });

  it('honours an explicit zero', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE_DELAY_MS', '0');
    const { resolveFakeDelayMs } = await loadFresh();

    expect(resolveFakeDelayMs(4000)).toBe(0);
  });

  it('returns the fallback when the env value is not a number', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE_DELAY_MS', 'soon');
    const { resolveFakeDelayMs } = await loadFresh();

    expect(resolveFakeDelayMs(4000)).toBe(4000);
  });

  it('returns the fallback when the env value is negative', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE_DELAY_MS', '-1');
    const { resolveFakeDelayMs } = await loadFresh();

    expect(resolveFakeDelayMs(0)).toBe(0);
  });
});

describe('sleep', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves only after the given delay', async () => {
    vi.useFakeTimers();
    const { sleep } = await loadFresh();
    const settled = vi.fn();

    const promise = sleep(1000).then(settled);
    await vi.advanceTimersByTimeAsync(999);
    const settledEarly = settled.mock.calls.length;
    await vi.advanceTimersByTimeAsync(1);
    await promise;

    expect([settledEarly, settled.mock.calls.length]).toEqual([0, 1]);
  });

  it('arms no timer for a zero delay', async () => {
    vi.useFakeTimers();
    const { sleep } = await loadFresh();

    await sleep(0);

    expect(vi.getTimerCount()).toBe(0);
  });
});
