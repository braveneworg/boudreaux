/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { __resetSecretsCacheForTests, getGroqTpmLimit, getSearchApiKey } from './secrets.js';
import { DEFAULT_GROQ_TOKEN_LIMIT } from '../types.js';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: class {
    send = send;
  },
  GetParameterCommand: class {
    constructor(public input: unknown) {}
  },
}));

describe('getSearchApiKey', () => {
  beforeEach(() => {
    __resetSecretsCacheForTests();
    send.mockReset();
    delete process.env.SSM_PATH_SEARCH_API_KEY;
  });

  it('returns null when the SSM path env var is unset', async () => {
    const result = await getSearchApiKey();

    expect(result).toBeNull();
    expect(send).not.toHaveBeenCalled();
  });

  it('returns the decrypted parameter value when configured', async () => {
    process.env.SSM_PATH_SEARCH_API_KEY = '/fakefour/search/api-key';
    send.mockResolvedValue({ Parameter: { Value: 'tvly-123' } });

    const result = await getSearchApiKey();

    expect(result).toBe('tvly-123');
  });

  it('caches the value across calls (one SSM fetch per cold start)', async () => {
    process.env.SSM_PATH_SEARCH_API_KEY = '/fakefour/search/api-key';
    send.mockResolvedValue({ Parameter: { Value: 'tvly-123' } });

    await getSearchApiKey();
    await getSearchApiKey();

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('returns null (degrades) when the SSM lookup fails', async () => {
    process.env.SSM_PATH_SEARCH_API_KEY = '/fakefour/search/api-key';
    send.mockRejectedValue(new Error('AccessDenied'));

    const result = await getSearchApiKey();

    expect(result).toBeNull();
  });
});

describe('getGroqTpmLimit', () => {
  beforeEach(() => {
    __resetSecretsCacheForTests();
    send.mockReset();
    delete process.env.SSM_PATH_GROQ_TPM_LIMIT;
  });

  it('returns the default ceiling when the SSM path env var is unset', async () => {
    const result = await getGroqTpmLimit();

    expect(result).toBe(DEFAULT_GROQ_TOKEN_LIMIT);
    expect(send).not.toHaveBeenCalled();
  });

  it('returns the parsed integer parameter value when configured', async () => {
    process.env.SSM_PATH_GROQ_TPM_LIMIT = '/fakefour/groq/tpm-limit';
    send.mockResolvedValue({ Parameter: { Value: '6000' } });

    const result = await getGroqTpmLimit();

    expect(result).toBe(6000);
  });

  it('caches the value across calls (one SSM fetch per cold start)', async () => {
    process.env.SSM_PATH_GROQ_TPM_LIMIT = '/fakefour/groq/tpm-limit';
    send.mockResolvedValue({ Parameter: { Value: '6000' } });

    await getGroqTpmLimit();
    await getGroqTpmLimit();

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('falls back to the default when the parameter is not a positive number', async () => {
    process.env.SSM_PATH_GROQ_TPM_LIMIT = '/fakefour/groq/tpm-limit';
    send.mockResolvedValue({ Parameter: { Value: 'not-a-number' } });

    const result = await getGroqTpmLimit();

    expect(result).toBe(DEFAULT_GROQ_TOKEN_LIMIT);
  });

  it('falls back to the default (degrades) when the SSM lookup fails', async () => {
    process.env.SSM_PATH_GROQ_TPM_LIMIT = '/fakefour/groq/tpm-limit';
    send.mockRejectedValue(new Error('AccessDenied'));

    const result = await getGroqTpmLimit();

    expect(result).toBe(DEFAULT_GROQ_TOKEN_LIMIT);
  });
});
