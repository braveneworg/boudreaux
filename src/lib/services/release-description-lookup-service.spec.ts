/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { ReleaseDescriptionLookupService } from './release-description-lookup-service';

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

describe('ReleaseDescriptionLookupService.lookup', () => {
  it('returns a deterministic ~500-char fixture on the fake path', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', 'true');

    const result = await ReleaseDescriptionLookupService.lookup({
      title: 'Broken Bone Ballads',
      artist: 'Ceschi',
    });

    expect(result?.description).toContain('Broken Bone Ballads');
    expect(result?.description).toContain('Ceschi');
    expect(result?.description.length).toBeGreaterThan(400);
    expect(result?.description.length).toBeLessThan(700);
    expect(result?.description).toContain('— ');
    expect(result?.sources.length).toBeGreaterThan(0);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('leads the fake fixture with the label note when one is supplied', async () => {
    vi.stubEnv('BIO_GENERATOR_FAKE', 'true');

    const result = await ReleaseDescriptionLookupService.lookup({
      title: 'Broken Bone Ballads',
      artist: 'Ceschi',
      labelNotes: ['Cut live to tape in New Haven'],
    });

    expect(result?.description.startsWith('Cut live to tape in New Haven.')).toBe(true);
  });

  it('invokes the Lambda task with the full release context and label notes', async () => {
    delete process.env.BIO_GENERATOR_FAKE;
    vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'fn');
    sendMock.mockResolvedValue(
      payload({
        ok: true,
        result: { description: 'A blurb.', confidence: 'medium', sources: ['https://x'] },
      })
    );

    const result = await ReleaseDescriptionLookupService.lookup({
      title: 'Album',
      artist: 'Band',
      releasedOn: '2015-03-03',
      catalogNumber: 'FF4-042',
      formats: ['VINYL_12_INCH'],
      labelNotes: ['Cut live to tape.'],
    });

    expect(result).toEqual({
      description: 'A blurb.',
      confidence: 'medium',
      sources: ['https://x'],
    });
    expect(readSentPayload()).toEqual({
      task: 'release-description-lookup',
      title: 'Album',
      artist: 'Band',
      releasedOn: '2015-03-03',
      catalogNumber: 'FF4-042',
      formats: ['VINYL_12_INCH'],
      labelNotes: ['Cut live to tape.'],
    });
  });

  it('omits an empty label-notes array from the payload', async () => {
    delete process.env.BIO_GENERATOR_FAKE;
    vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'fn');
    sendMock.mockResolvedValue(payload({ ok: true, result: null }));

    await ReleaseDescriptionLookupService.lookup({
      title: 'Album',
      artist: 'Band',
      labelNotes: [],
    });

    expect(readSentPayload()).toEqual({
      task: 'release-description-lookup',
      title: 'Album',
      artist: 'Band',
    });
  });

  it('omits the optional context from the payload when not supplied', async () => {
    delete process.env.BIO_GENERATOR_FAKE;
    vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'fn');
    sendMock.mockResolvedValue(payload({ ok: true, result: null }));

    await ReleaseDescriptionLookupService.lookup({ title: 'Album', artist: 'Band' });

    expect(readSentPayload()).toEqual({
      task: 'release-description-lookup',
      title: 'Album',
      artist: 'Band',
    });
  });

  it('omits an empty formats array from the payload', async () => {
    delete process.env.BIO_GENERATOR_FAKE;
    vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'fn');
    sendMock.mockResolvedValue(payload({ ok: true, result: null }));

    await ReleaseDescriptionLookupService.lookup({ title: 'Album', artist: 'Band', formats: [] });

    expect(readSentPayload()).toEqual({
      task: 'release-description-lookup',
      title: 'Album',
      artist: 'Band',
    });
  });

  it('returns null when the Lambda reports result:null', async () => {
    delete process.env.BIO_GENERATOR_FAKE;
    vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'fn');
    sendMock.mockResolvedValue(payload({ ok: true, result: null }));

    expect(
      await ReleaseDescriptionLookupService.lookup({ title: 'Album', artist: 'Band' })
    ).toBeNull();
  });

  it('throws when the Lambda payload is ok:false', async () => {
    delete process.env.BIO_GENERATOR_FAKE;
    vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'fn');
    sendMock.mockResolvedValue(payload({ ok: false, error: 'boom' }));

    await expect(
      ReleaseDescriptionLookupService.lookup({ title: 'Album', artist: 'Band' })
    ).rejects.toThrow('boom');
  });

  it('returns null when BIO_GENERATOR_LAMBDA_NAME is unset and does not call send', async () => {
    delete process.env.BIO_GENERATOR_FAKE;
    delete process.env.BIO_GENERATOR_LAMBDA_NAME;

    const result = await ReleaseDescriptionLookupService.lookup({ title: 'Album', artist: 'Band' });

    expect(result).toBeNull();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('throws when the Lambda response carries no payload', async () => {
    delete process.env.BIO_GENERATOR_FAKE;
    vi.stubEnv('BIO_GENERATOR_LAMBDA_NAME', 'fn');
    sendMock.mockResolvedValue({ Payload: undefined });

    await expect(
      ReleaseDescriptionLookupService.lookup({ title: 'Album', artist: 'Band' })
    ).rejects.toThrow('Release description lookup returned no payload');
  });
});
