/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { ReleaseDateLookupService } from './release-date-lookup-service';

vi.mock('server-only', () => ({}));

const sendMock = vi.hoisted(() => vi.fn());
vi.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: class {
    send = sendMock;
  },
  InvokeCommand: class {
    constructor(readonly input: unknown) {}
  },
}));
vi.mock('@smithy/node-http-handler', () => ({ NodeHttpHandler: class {} }));
vi.mock('@/lib/utils/logger', () => ({
  loggers: new Proxy(
    {},
    { get: () => ({ debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }
  ),
}));

beforeEach(() => {
  sendMock.mockReset();
});

describe('ReleaseDateLookupService.lookup', () => {
  it('returns the fixture on the fake path without calling send', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', 'true');
    const result = await ReleaseDateLookupService.lookup('Song', 'Band');
    expect(result?.releasedOn).toBe('2020-06-01');
    expect(result?.confidence).toBe('medium');
    expect(result?.sources).toEqual(['https://musicbrainz.org/']);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('invokes the Lambda and parses a found result on the real path', async () => {
    delete process.env.BIO_GENERATOR_FAKE;
    vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'fn');
    sendMock.mockResolvedValue({
      Payload: new TextEncoder().encode(
        JSON.stringify({
          ok: true,
          result: { releasedOn: '2019-08-01', confidence: 'high', sources: ['https://x'] },
        })
      ),
    });
    const result = await ReleaseDateLookupService.lookup('Song', 'Band');
    expect(result).toEqual({
      releasedOn: '2019-08-01',
      confidence: 'high',
      sources: ['https://x'],
    });
    expect(sendMock).toHaveBeenCalledOnce();
  });

  it('returns null when the Lambda reports result:null', async () => {
    delete process.env.BIO_GENERATOR_FAKE;
    vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'fn');
    sendMock.mockResolvedValue({
      Payload: new TextEncoder().encode(JSON.stringify({ ok: true, result: null })),
    });
    expect(await ReleaseDateLookupService.lookup('Song')).toBeNull();
  });

  it('throws when the Lambda payload is ok:false', async () => {
    delete process.env.BIO_GENERATOR_FAKE;
    vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'fn');
    sendMock.mockResolvedValue({
      Payload: new TextEncoder().encode(JSON.stringify({ ok: false, error: 'boom' })),
    });
    await expect(ReleaseDateLookupService.lookup('Song')).rejects.toThrow('boom');
  });

  it('returns null when BIO_GENERATOR_LAMBDA_NAME is unset and does not call send', async () => {
    delete process.env.BIO_GENERATOR_FAKE;
    delete process.env.BIO_GENERATOR_LAMBDA_NAME;
    const result = await ReleaseDateLookupService.lookup('Song', 'Band');
    expect(result).toBeNull();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('throws when the Lambda response carries no payload', async () => {
    delete process.env.BIO_GENERATOR_FAKE;
    vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'fn');
    sendMock.mockResolvedValue({ Payload: undefined });
    await expect(ReleaseDateLookupService.lookup('Song', 'Band')).rejects.toThrow(
      'Release date lookup returned no payload'
    );
  });
});
