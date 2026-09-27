/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type * as LambdaDispatch from './lambda-dispatch';
import type { JobSigningIdentity } from '@fakefour/job-contract/signing';

vi.mock('server-only', () => ({}));

const loggerWarnMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/utils/logger', () => ({
  loggers: { media: { warn: loggerWarnMock, error: vi.fn() } },
}));

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

const APP_SECRET = 's'.repeat(40);
const JOB: JobSigningIdentity = { kind: 'bio-generation', entityId: 'a1', jobToken: 'tok-1' };
const BODY = '{"jobToken":"tok-1","result":{"ok":true}}';

describe('signingKeyForJob', () => {
  it('derives the key from JOB_CALLBACK_SECRET and the job identity', async () => {
    vi.stubEnv('JOB_CALLBACK_SECRET', APP_SECRET);
    const { signingKeyForJob } = await loadFresh();
    const { deriveJobSigningKey } = await import('@fakefour/job-contract/signing');

    expect(signingKeyForJob(JOB)).toBe(deriveJobSigningKey(APP_SECRET, JOB));
  });

  it('throws a clear error when JOB_CALLBACK_SECRET is unset', async () => {
    vi.stubEnv('JOB_CALLBACK_SECRET', undefined);
    const { signingKeyForJob } = await loadFresh();

    expect(() => signingKeyForJob(JOB)).toThrow('JOB_CALLBACK_SECRET');
  });

  it('throws when JOB_CALLBACK_SECRET is shorter than 32 characters', async () => {
    vi.stubEnv('JOB_CALLBACK_SECRET', 'short');
    const { signingKeyForJob } = await loadFresh();

    expect(() => signingKeyForJob(JOB)).toThrow('JOB_CALLBACK_SECRET');
  });
});

describe('signCallbackBody', () => {
  it('signs with the same per-job key the verifier re-derives', async () => {
    vi.stubEnv('JOB_CALLBACK_SECRET', APP_SECRET);
    const { signCallbackBody, verifyJobCallback } = await loadFresh();

    const signature = signCallbackBody(JOB, BODY);

    expect(verifyJobCallback(JOB, { signature, rawBody: BODY })).toBe(true);
  });
});

describe('verifyJobCallback', () => {
  const signedBy = async (secret: string, identity = JOB, body = BODY): Promise<string> => {
    const { deriveJobSigningKey, signJobBody } = await import('@fakefour/job-contract/signing');
    return signJobBody(deriveJobSigningKey(secret, identity), body, Date.now() / 1000);
  };

  beforeEach(() => {
    loggerWarnMock.mockReset();
  });

  it('accepts a signature made with the key derived from the same secret and identity', async () => {
    vi.stubEnv('JOB_CALLBACK_SECRET', APP_SECRET);
    const { verifyJobCallback } = await loadFresh();

    const ok = verifyJobCallback(JOB, { signature: await signedBy(APP_SECRET), rawBody: BODY });

    expect(ok).toBe(true);
    expect(loggerWarnMock).not.toHaveBeenCalled();
  });

  it('rejects an unsigned callback and logs the reason', async () => {
    vi.stubEnv('JOB_CALLBACK_SECRET', APP_SECRET);
    const { verifyJobCallback } = await loadFresh();

    expect(verifyJobCallback(JOB, { signature: null, rawBody: BODY })).toBe(false);
    expect(loggerWarnMock).toHaveBeenCalledWith('job_callback_signature_rejected', {
      kind: 'bio-generation',
      entityId: 'a1',
      reason: 'missing',
    });
  });

  it('rejects a signature made under a key for another token', async () => {
    vi.stubEnv('JOB_CALLBACK_SECRET', APP_SECRET);
    const { verifyJobCallback } = await loadFresh();
    const forged = await signedBy(APP_SECRET, { ...JOB, jobToken: 'forged' });

    expect(verifyJobCallback(JOB, { signature: forged, rawBody: BODY })).toBe(false);
    expect(loggerWarnMock).toHaveBeenCalledWith(
      'job_callback_signature_rejected',
      expect.objectContaining({ reason: 'mismatch' })
    );
  });

  it('rejects a signature over a different body', async () => {
    vi.stubEnv('JOB_CALLBACK_SECRET', APP_SECRET);
    const { verifyJobCallback } = await loadFresh();
    const signature = await signedBy(APP_SECRET);

    expect(verifyJobCallback(JOB, { signature, rawBody: `${BODY} ` })).toBe(false);
  });

  it('fails closed when JOB_CALLBACK_SECRET is unset, without throwing', async () => {
    vi.stubEnv('JOB_CALLBACK_SECRET', undefined);
    const { verifyJobCallback } = await loadFresh();

    expect(verifyJobCallback(JOB, { signature: await signedBy(APP_SECRET), rawBody: BODY })).toBe(
      false
    );
    expect(loggerWarnMock).toHaveBeenCalledWith(
      'job_callback_signature_rejected',
      expect.objectContaining({ reason: 'unconfigured' })
    );
  });

  it('never logs the signature or the key', async () => {
    vi.stubEnv('JOB_CALLBACK_SECRET', APP_SECRET);
    const { verifyJobCallback } = await loadFresh();
    const signature = await signedBy(APP_SECRET, { ...JOB, jobToken: 'forged' });

    verifyJobCallback(JOB, { signature, rawBody: BODY });

    expect(JSON.stringify(loggerWarnMock.mock.calls)).not.toContain(signature.slice(-20));
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
