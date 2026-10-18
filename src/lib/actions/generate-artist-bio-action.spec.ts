/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { gateAction } from '@/lib/auth/action-gate';

import { generateArtistBioAction } from './generate-artist-bio-action';

vi.mock('server-only', () => ({}));

// Capture the after() callback so tests can run the "background" work on demand.
let afterCallback: (() => Promise<unknown>) | null = null;
vi.mock('next/server', () => ({
  after: (cb: () => Promise<unknown>) => {
    afterCallback = cb;
  },
}));

const logSecurityEventMock = vi.fn();
vi.mock('@/utils/audit-log', () => ({ logSecurityEvent: (e: unknown) => logSecurityEventMock(e) }));

vi.mock('@/lib/auth/action-gate');

const triggerMock = vi.hoisted(() => vi.fn());
const runMock = vi.hoisted(() => vi.fn());
vi.mock('@/lib/services/job-runner/job-runner', () => ({
  jobRunner: { trigger: triggerMock, run: runMock },
}));

const bioGenerationJob = vi.hoisted(() => ({ kind: 'bio-generation' }));
vi.mock('@/lib/services/bio-generation-service', () => ({ bioGenerationJob }));

const loggerErrorMock = vi.fn();
vi.mock('@/lib/utils/logger', () => ({
  loggers: {
    media: {
      error: (...args: unknown[]) => loggerErrorMock(...args),
      warn: vi.fn(),
      info: vi.fn(),
      debug: vi.fn(),
    },
  },
}));

const VALID_ID = 'a'.repeat(24);
const REFUSAL = { success: false as const, error: 'Unauthorized', code: 'FORBIDDEN' as const };

beforeEach(() => {
  afterCallback = null;
  vi.mocked(gateAction).mockResolvedValue({
    success: true,
    session: { user: { id: 'admin-1' } } as never,
  });
  triggerMock.mockReset().mockResolvedValue({
    success: true,
    data: { status: 'pending', started: true },
  });
  runMock.mockReset().mockResolvedValue({ status: 'dispatched' });
});

describe('generateArtistBioAction', () => {
  it('returns the gate refusal without touching the job runner', async () => {
    vi.mocked(gateAction).mockResolvedValueOnce(REFUSAL);

    const result = await generateArtistBioAction({ artistId: VALID_ID });

    expect(result).toEqual(REFUSAL);
    expect(triggerMock).not.toHaveBeenCalled();
  });

  it('returns an error for invalid input without touching the job runner', async () => {
    const result = await generateArtistBioAction({ artistId: 'not-an-id' });

    expect(result).toEqual({ success: false, error: 'Invalid bio generation request.' });
    expect(triggerMock).not.toHaveBeenCalled();
  });

  it('triggers the bio generation job for the artist', async () => {
    await generateArtistBioAction({ artistId: VALID_ID });

    expect(triggerMock.mock.calls).toEqual([[bioGenerationJob, VALID_ID]]);
  });

  it('returns the refusal copy when the trigger refuses', async () => {
    triggerMock.mockResolvedValueOnce({
      success: false,
      error: 'Artist not found.',
      code: 'NOT_FOUND',
    });

    const result = await generateArtistBioAction({ artistId: VALID_ID });

    expect(result).toEqual({ success: false, error: 'Artist not found.' });
    expect(afterCallback).toBeNull();
  });

  it('echoes an in-flight run without scheduling or auditing another', async () => {
    triggerMock.mockResolvedValueOnce({
      success: true,
      data: { status: 'processing', started: false },
    });

    const result = await generateArtistBioAction({ artistId: VALID_ID });

    expect(result).toEqual({ success: true, status: 'processing' });
    expect(afterCallback).toBeNull();
    expect(logSecurityEventMock).not.toHaveBeenCalled();
  });

  it('returns pending and defers the run to after the response', async () => {
    const result = await generateArtistBioAction({ artistId: VALID_ID });

    expect(result).toEqual({ success: true, status: 'pending' });
    expect(runMock).not.toHaveBeenCalled();
    expect(afterCallback).toBeTypeOf('function');
  });

  it('runs the job after the response with the admin links and description', async () => {
    await generateArtistBioAction({
      artistId: VALID_ID,
      links: ['https://example.com'],
      description: 'x',
    });
    await afterCallback?.();

    expect(runMock.mock.calls).toEqual([
      [bioGenerationJob, VALID_ID, { links: ['https://example.com'], description: 'x' }],
    ]);
  });

  it('audit-logs the started trigger with the admin user id', async () => {
    await generateArtistBioAction({ artistId: VALID_ID });

    // Audit fires at trigger, before the background job runs.
    expect(logSecurityEventMock).toHaveBeenCalledWith({
      event: 'media.artist.updated',
      userId: 'admin-1',
      metadata: { artistId: VALID_ID, action: 'bio-generation-triggered' },
    });
    expect(runMock).not.toHaveBeenCalled();
  });

  it('returns a typed error and logs when triggering throws unexpectedly', async () => {
    triggerMock.mockRejectedValueOnce(new Error('DB down'));

    const result = await generateArtistBioAction({ artistId: VALID_ID });

    expect(result).toEqual({
      success: false,
      error: 'Bio generation failed to start. Please try again.',
    });
    expect(loggerErrorMock).toHaveBeenCalledTimes(1);
  });
});
