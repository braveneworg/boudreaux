/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { VideoDescriptionLookupService } from './video-description-lookup-service';

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

describe('VideoDescriptionLookupService.lookup', () => {
  it('returns a deterministic fixture naming the video and artist on the fake path', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', 'true');

    const result = await VideoDescriptionLookupService.lookup({
      title: 'Bite Through Stone',
      artist: 'Ceschi',
    });

    expect(result?.description).toContain('Bite Through Stone');
    expect(result?.description).toContain('Ceschi');
    // The fixture mirrors the real contract: ~500 chars with attributed quotes.
    expect(result?.description.length).toBeGreaterThan(400);
    expect(result?.description.length).toBeLessThan(700);
    expect(result?.description).toContain('— ');
    expect(result?.sources.length).toBeGreaterThan(0);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('invokes the Lambda task with title, artist, and release date', async () => {
    delete process.env.BIO_GENERATOR_FAKE;
    vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'fn');
    sendMock.mockResolvedValue({
      Payload: new TextEncoder().encode(
        JSON.stringify({
          ok: true,
          result: { description: 'Prose.', confidence: 'medium', sources: ['https://x'] },
        })
      ),
    });

    const result = await VideoDescriptionLookupService.lookup({
      title: 'Song',
      artist: 'Band',
      releasedOn: '2021-04-09',
    });

    expect(result).toEqual({ description: 'Prose.', confidence: 'medium', sources: ['https://x'] });
    expect(sendMock).toHaveBeenCalledOnce();
    const command = sendMock.mock.calls[0][0] as { input: { Payload: Uint8Array } };
    expect(JSON.parse(Buffer.from(command.input.Payload).toString('utf-8'))).toEqual({
      task: 'video-description-lookup',
      title: 'Song',
      artist: 'Band',
      releasedOn: '2021-04-09',
    });
  });

  it('omits the release date from the payload when not supplied', async () => {
    delete process.env.BIO_GENERATOR_FAKE;
    vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'fn');
    sendMock.mockResolvedValue({
      Payload: new TextEncoder().encode(JSON.stringify({ ok: true, result: null })),
    });

    await VideoDescriptionLookupService.lookup({ title: 'Song', artist: 'Band' });

    const command = sendMock.mock.calls[0][0] as { input: { Payload: Uint8Array } };
    expect(JSON.parse(Buffer.from(command.input.Payload).toString('utf-8'))).toEqual({
      task: 'video-description-lookup',
      title: 'Song',
      artist: 'Band',
    });
  });

  it('returns null when the Lambda reports result:null', async () => {
    delete process.env.BIO_GENERATOR_FAKE;
    vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'fn');
    sendMock.mockResolvedValue({
      Payload: new TextEncoder().encode(JSON.stringify({ ok: true, result: null })),
    });

    expect(
      await VideoDescriptionLookupService.lookup({ title: 'Song', artist: 'Band' })
    ).toBeNull();
  });

  it('throws when the Lambda payload is ok:false', async () => {
    delete process.env.BIO_GENERATOR_FAKE;
    vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'fn');
    sendMock.mockResolvedValue({
      Payload: new TextEncoder().encode(JSON.stringify({ ok: false, error: 'boom' })),
    });

    await expect(
      VideoDescriptionLookupService.lookup({ title: 'Song', artist: 'Band' })
    ).rejects.toThrow('boom');
  });

  it('returns null when BIO_GENERATOR_LAMBDA_NAME is unset and does not call send', async () => {
    delete process.env.BIO_GENERATOR_FAKE;
    delete process.env.BIO_GENERATOR_LAMBDA_NAME;

    const result = await VideoDescriptionLookupService.lookup({ title: 'Song', artist: 'Band' });

    expect(result).toBeNull();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('throws when the Lambda response carries no payload', async () => {
    delete process.env.BIO_GENERATOR_FAKE;
    vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'fn');
    sendMock.mockResolvedValue({ Payload: undefined });

    await expect(
      VideoDescriptionLookupService.lookup({ title: 'Song', artist: 'Band' })
    ).rejects.toThrow('Description lookup returned no payload');
  });
});
