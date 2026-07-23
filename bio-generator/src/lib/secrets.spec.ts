/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import {
  __resetSecretsCacheForTests,
  getGeminiApiKey,
  getScrapeApiKey,
  getSerperApiKey,
  getYoutubeApiKey,
} from './secrets.js';

const { send } = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock('@aws-sdk/client-ssm', () => ({
  SSMClient: class {
    send = send;
  },
  GetParameterCommand: class {
    constructor(public input: unknown) {}
  },
}));

describe('getGeminiApiKey', () => {
  beforeEach(() => {
    __resetSecretsCacheForTests();
    send.mockReset();
    delete process.env.SSM_PATH_GEMINI_API_KEY;
  });

  it('throws when the SSM path env var is unset', async () => {
    await expect(getGeminiApiKey()).rejects.toThrow('SSM_PATH_GEMINI_API_KEY');
    expect(send).not.toHaveBeenCalled();
  });

  it('returns the decrypted parameter value when configured', async () => {
    process.env.SSM_PATH_GEMINI_API_KEY = '/fakefour/gemini/api-key';
    send.mockResolvedValue({ Parameter: { Value: 'gmi-123' } });

    const result = await getGeminiApiKey();

    expect(result).toBe('gmi-123');
  });

  it('caches the value across calls (one SSM fetch per cold start)', async () => {
    process.env.SSM_PATH_GEMINI_API_KEY = '/fakefour/gemini/api-key';
    send.mockResolvedValue({ Parameter: { Value: 'gmi-123' } });

    await getGeminiApiKey();
    await getGeminiApiKey();

    expect(send).toHaveBeenCalledTimes(1);
  });
});

describe('getScrapeApiKey', () => {
  beforeEach(() => {
    __resetSecretsCacheForTests();
    send.mockReset();
    delete process.env.SSM_PATH_JINA_API_KEY;
  });

  it('returns null and logs when the SSM path env var is unset', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await getScrapeApiKey();

    expect(result).toBeNull();
    expect(send).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('returns the decrypted parameter value when configured', async () => {
    process.env.SSM_PATH_JINA_API_KEY = '/fakefour/jina/api-key';
    send.mockResolvedValue({ Parameter: { Value: 'jina-123' } });

    const result = await getScrapeApiKey();

    expect(result).toBe('jina-123');
  });

  it('caches the value across calls (one SSM fetch per cold start)', async () => {
    process.env.SSM_PATH_JINA_API_KEY = '/fakefour/jina/api-key';
    send.mockResolvedValue({ Parameter: { Value: 'jina-123' } });

    await getScrapeApiKey();
    await getScrapeApiKey();

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('returns null (degrades) when the SSM lookup fails', async () => {
    process.env.SSM_PATH_JINA_API_KEY = '/fakefour/jina/api-key';
    send.mockRejectedValue(new Error('AccessDenied'));

    const result = await getScrapeApiKey();

    expect(result).toBeNull();
  });
});

describe('getSerperApiKey', () => {
  beforeEach(() => {
    __resetSecretsCacheForTests();
    send.mockReset();
    delete process.env.SSM_PATH_SERPER_API_KEY;
  });

  it('returns null and logs when the SSM path env var is unset', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const result = await getSerperApiKey();

    expect(result).toBeNull();
    expect(send).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('returns the decrypted parameter value when configured', async () => {
    process.env.SSM_PATH_SERPER_API_KEY = '/fakefour/serper/api-key';
    send.mockResolvedValue({ Parameter: { Value: 'serper-123' } });

    const result = await getSerperApiKey();

    expect(result).toBe('serper-123');
  });

  it('caches the value across calls (one SSM fetch per cold start)', async () => {
    process.env.SSM_PATH_SERPER_API_KEY = '/fakefour/serper/api-key';
    send.mockResolvedValue({ Parameter: { Value: 'serper-123' } });

    await getSerperApiKey();
    await getSerperApiKey();

    expect(send).toHaveBeenCalledTimes(1);
  });

  it('returns null (degrades) when the SSM lookup fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.SSM_PATH_SERPER_API_KEY = '/fakefour/serper/api-key';
    send.mockRejectedValue(new Error('AccessDenied'));

    const result = await getSerperApiKey();

    expect(result).toBeNull();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('getYoutubeApiKey', () => {
  beforeEach(() => {
    __resetSecretsCacheForTests();
    send.mockReset();
    delete process.env.SSM_PATH_YOUTUBE_API_KEY;
  });

  it('returns null when the SSM path env var is unset', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    await expect(getYoutubeApiKey()).resolves.toBeNull();

    expect(send).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('returns the decrypted parameter value when configured', async () => {
    process.env.SSM_PATH_YOUTUBE_API_KEY = '/fakefour/youtube/api-key';
    send.mockResolvedValue({ Parameter: { Value: 'yt-123' } });

    await expect(getYoutubeApiKey()).resolves.toBe('yt-123');
  });

  it('returns null (degrades) when the SSM lookup fails', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    process.env.SSM_PATH_YOUTUBE_API_KEY = '/fakefour/youtube/api-key';
    send.mockRejectedValue(new Error('AccessDenied'));

    await expect(getYoutubeApiKey()).resolves.toBeNull();

    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe('stored secret hygiene', () => {
  beforeEach(() => {
    __resetSecretsCacheForTests();
    send.mockReset();
  });

  // A key pasted into SSM with a trailing newline is indistinguishable from a
  // clean one until the provider rejects it: YouTube answers `400 keyInvalid`,
  // which reads as "the lookup found nothing" rather than "your key is wrong".
  it('trims surrounding whitespace from a stored key', async () => {
    process.env.SSM_PATH_YOUTUBE_API_KEY = '/fakefour/youtube/api-key';
    send.mockResolvedValue({ Parameter: { Value: '  yt-123\n' } });

    await expect(getYoutubeApiKey()).resolves.toBe('yt-123');
  });

  it('trims the required Gemini key too', async () => {
    process.env.SSM_PATH_GEMINI_API_KEY = '/fakefour/gemini/api-key';
    send.mockResolvedValue({ Parameter: { Value: '\tgmi-123\n' } });

    await expect(getGeminiApiKey()).resolves.toBe('gmi-123');
  });

  it('treats a whitespace-only value as no value', async () => {
    process.env.SSM_PATH_GEMINI_API_KEY = '/fakefour/gemini/api-key';
    send.mockResolvedValue({ Parameter: { Value: '   ' } });

    await expect(getGeminiApiKey()).rejects.toThrow('returned no value');
  });
});
