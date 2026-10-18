/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { gateAction } from '@/lib/auth/action-gate';

import { generateArtistImagesFromLinksAction } from './generate-artist-images-from-links-action';

vi.mock('server-only', () => ({}));

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

const imageLinksJob = vi.hoisted(() => ({ kind: 'image-links' }));
vi.mock('@/lib/services/image-links-service', () => ({ imageLinksJob }));

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

describe('generateArtistImagesFromLinksAction', () => {
  it('returns the gate refusal without touching the job runner', async () => {
    vi.mocked(gateAction).mockResolvedValueOnce(REFUSAL);

    const result = await generateArtistImagesFromLinksAction({ artistId: VALID_ID });

    expect(result).toEqual(REFUSAL);
    expect(triggerMock).not.toHaveBeenCalled();
  });

  it('returns an error for invalid input without touching the job runner', async () => {
    const result = await generateArtistImagesFromLinksAction({ artistId: 'nope' });

    expect(result).toEqual({ success: false, error: 'Invalid image generation request.' });
    expect(triggerMock).not.toHaveBeenCalled();
  });

  it('triggers the images-from-links job for the artist', async () => {
    await generateArtistImagesFromLinksAction({ artistId: VALID_ID });

    expect(triggerMock.mock.calls).toEqual([[imageLinksJob, VALID_ID]]);
  });

  it('returns the refusal copy when the trigger refuses', async () => {
    triggerMock.mockResolvedValueOnce({
      success: false,
      error: 'Artist not found.',
      code: 'NOT_FOUND',
    });

    const result = await generateArtistImagesFromLinksAction({ artistId: VALID_ID });

    expect(result).toEqual({ success: false, error: 'Artist not found.' });
    expect(afterCallback).toBeNull();
  });

  it('echoes an in-flight run without scheduling or auditing another', async () => {
    triggerMock.mockResolvedValueOnce({
      success: true,
      data: { status: 'processing', started: false },
    });

    const result = await generateArtistImagesFromLinksAction({ artistId: VALID_ID });

    expect(result).toEqual({ success: true, status: 'processing' });
    expect(afterCallback).toBeNull();
    expect(logSecurityEventMock).not.toHaveBeenCalled();
  });

  it('returns pending, runs the job after the response and audits the trigger', async () => {
    const result = await generateArtistImagesFromLinksAction({ artistId: VALID_ID });

    expect(result).toEqual({ success: true, status: 'pending' });
    expect(runMock).not.toHaveBeenCalled();
    expect(logSecurityEventMock).toHaveBeenCalledWith({
      event: 'media.artist.updated',
      userId: 'admin-1',
      metadata: { artistId: VALID_ID, action: 'images-from-links-triggered' },
    });

    await afterCallback?.();

    expect(runMock.mock.calls).toEqual([[imageLinksJob, VALID_ID, undefined]]);
  });

  it('returns a typed error and logs when triggering throws', async () => {
    triggerMock.mockRejectedValueOnce(new Error('db down'));

    const result = await generateArtistImagesFromLinksAction({ artistId: VALID_ID });

    expect(result).toEqual({
      success: false,
      error: 'Image generation failed to start. Please try again.',
    });
    expect(loggerErrorMock).toHaveBeenCalledTimes(1);
  });
});
