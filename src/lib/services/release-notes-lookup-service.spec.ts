/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { ReleaseNotesLookupService } from './release-notes-lookup-service';

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

const payload = (body: unknown) => ({
  Payload: new TextEncoder().encode(JSON.stringify(body)),
});

const readSentPayload = (): unknown => {
  const command = sendMock.mock.calls[0][0] as { input: { Payload: Uint8Array } };
  return JSON.parse(Buffer.from(command.input.Payload).toString('utf-8'));
};

beforeEach(() => {
  sendMock.mockReset();
});

describe('ReleaseNotesLookupService.lookup', () => {
  it('returns a deterministic multi-paragraph fixture on the fake path', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', 'true');

    const result = await ReleaseNotesLookupService.lookup({
      title: 'Broken Bone Ballads',
      artist: 'Ceschi',
    });

    expect(result?.notes.length).toBeGreaterThan(1);
    expect(result?.notes.join(' ')).toContain('Broken Bone Ballads');
    expect(result?.notes.join(' ')).toContain('Ceschi');
    expect(result?.sources.length).toBeGreaterThan(0);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('invokes the Lambda task with the full release context', async () => {
    delete process.env.BIO_GENERATOR_FAKE;
    vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'fn');
    sendMock.mockResolvedValue(
      payload({
        ok: true,
        result: { notes: ['One.', 'Two.'], confidence: 'medium', sources: ['https://x'] },
      })
    );

    const result = await ReleaseNotesLookupService.lookup({
      title: 'Album',
      artist: 'Band',
      releasedOn: '2015-03-03',
      catalogNumber: 'FF4-042',
      formats: ['VINYL_12_INCH'],
    });

    expect(result).toEqual({
      notes: ['One.', 'Two.'],
      confidence: 'medium',
      sources: ['https://x'],
    });
    expect(readSentPayload()).toEqual({
      task: 'release-notes-lookup',
      title: 'Album',
      artist: 'Band',
      releasedOn: '2015-03-03',
      catalogNumber: 'FF4-042',
      formats: ['VINYL_12_INCH'],
    });
  });

  it('omits the optional context from the payload when not supplied', async () => {
    delete process.env.BIO_GENERATOR_FAKE;
    vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'fn');
    sendMock.mockResolvedValue(payload({ ok: true, result: null }));

    await ReleaseNotesLookupService.lookup({ title: 'Album', artist: 'Band' });

    expect(readSentPayload()).toEqual({
      task: 'release-notes-lookup',
      title: 'Album',
      artist: 'Band',
    });
  });

  it('omits an empty formats array from the payload', async () => {
    delete process.env.BIO_GENERATOR_FAKE;
    vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'fn');
    sendMock.mockResolvedValue(payload({ ok: true, result: null }));

    await ReleaseNotesLookupService.lookup({ title: 'Album', artist: 'Band', formats: [] });

    expect(readSentPayload()).toEqual({
      task: 'release-notes-lookup',
      title: 'Album',
      artist: 'Band',
    });
  });

  it('returns null when the Lambda reports result:null', async () => {
    delete process.env.BIO_GENERATOR_FAKE;
    vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'fn');
    sendMock.mockResolvedValue(payload({ ok: true, result: null }));

    expect(await ReleaseNotesLookupService.lookup({ title: 'Album', artist: 'Band' })).toBeNull();
  });

  it('throws when the Lambda payload is ok:false', async () => {
    delete process.env.BIO_GENERATOR_FAKE;
    vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'fn');
    sendMock.mockResolvedValue(payload({ ok: false, error: 'boom' }));

    await expect(
      ReleaseNotesLookupService.lookup({ title: 'Album', artist: 'Band' })
    ).rejects.toThrow('boom');
  });

  it('returns null when BIO_GENERATOR_LAMBDA_NAME is unset and does not call send', async () => {
    delete process.env.BIO_GENERATOR_FAKE;
    delete process.env.BIO_GENERATOR_LAMBDA_NAME;

    const result = await ReleaseNotesLookupService.lookup({ title: 'Album', artist: 'Band' });

    expect(result).toBeNull();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('throws when the Lambda response carries no payload', async () => {
    delete process.env.BIO_GENERATOR_FAKE;
    vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'fn');
    sendMock.mockResolvedValue({ Payload: undefined });

    await expect(
      ReleaseNotesLookupService.lookup({ title: 'Album', artist: 'Band' })
    ).rejects.toThrow('Release notes lookup returned no payload');
  });
});
