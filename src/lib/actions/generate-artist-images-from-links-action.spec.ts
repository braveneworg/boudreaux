/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { STALE_JOB_MS } from '@/utils/async-job-lifecycle';

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

const requireRoleMock = vi.fn();
vi.mock('@/lib/utils/auth/require-role', () => ({
  requireRole: (role: string) => requireRoleMock(role),
}));

const getImageLinksJobStateMock = vi.fn();
const setImageLinksStatusMock = vi.fn();
vi.mock('@/lib/repositories/artist-repository', () => ({
  ArtistRepository: {
    getImageLinksJobState: (id: string) => getImageLinksJobStateMock(id),
    setImageLinksStatus: (id: string, status: string, opts: unknown) =>
      setImageLinksStatusMock(id, status, opts),
  },
}));

const runJobMock = vi.fn();
vi.mock('@/lib/services/image-links-service', () => ({
  ImageLinksService: { runJob: (id: string) => runJobMock(id) },
}));

vi.mock('@/lib/utils/logger', () => ({
  loggers: { media: { error: vi.fn(), warn: vi.fn(), info: vi.fn(), debug: vi.fn() } },
}));

const VALID_ID = 'a'.repeat(24);

beforeEach(() => {
  afterCallback = null;
  requireRoleMock.mockResolvedValue({ user: { id: 'admin-1' } });
  getImageLinksJobStateMock.mockResolvedValue({
    imageLinksStatus: null,
    imageLinksStartedAt: null,
  });
  setImageLinksStatusMock.mockResolvedValue(undefined);
  runJobMock.mockResolvedValue({ status: 'dispatched' });
});

describe('generateArtistImagesFromLinksAction', () => {
  it('rejects when the caller is not an admin', async () => {
    requireRoleMock.mockRejectedValueOnce(new Error('Unauthorized'));

    await expect(generateArtistImagesFromLinksAction({ artistId: VALID_ID })).rejects.toThrow(
      'Unauthorized'
    );
  });

  it('returns an error for invalid input without touching the repository', async () => {
    const result = await generateArtistImagesFromLinksAction({ artistId: 'not-an-id' });

    expect(result).toEqual({ success: false, error: 'Invalid image generation request.' });
    expect(getImageLinksJobStateMock).not.toHaveBeenCalled();
  });

  it('returns not-found when the artist does not exist', async () => {
    getImageLinksJobStateMock.mockResolvedValueOnce(null);

    const result = await generateArtistImagesFromLinksAction({ artistId: VALID_ID });

    expect(result).toEqual({ success: false, error: 'Artist not found.' });
    expect(setImageLinksStatusMock).not.toHaveBeenCalled();
  });

  it('marks the job pending, defers the dispatch to after() and audits the trigger', async () => {
    const result = await generateArtistImagesFromLinksAction({ artistId: VALID_ID });

    expect(result).toEqual({ success: true, status: 'pending' });
    expect(setImageLinksStatusMock).toHaveBeenCalledWith(
      VALID_ID,
      'pending',
      expect.objectContaining({ error: null, startedAt: expect.any(Date) })
    );
    expect(runJobMock).not.toHaveBeenCalled();
    expect(afterCallback).toBeTypeOf('function');
    await afterCallback?.();
    expect(runJobMock.mock.calls).toEqual([[VALID_ID]]);
    expect(logSecurityEventMock).toHaveBeenCalledWith({
      event: 'media.artist.updated',
      userId: 'admin-1',
      metadata: { artistId: VALID_ID, action: 'images-from-links-triggered' },
    });
  });

  it('does not start a second run while one is in flight', async () => {
    getImageLinksJobStateMock.mockResolvedValueOnce({
      imageLinksStatus: 'processing',
      imageLinksStartedAt: new Date(),
    });

    const result = await generateArtistImagesFromLinksAction({ artistId: VALID_ID });

    expect(result).toEqual({ success: true, status: 'processing' });
    expect(setImageLinksStatusMock).not.toHaveBeenCalled();
    expect(afterCallback).toBeNull();
  });

  it('starts a new run over a stale in-flight job', async () => {
    getImageLinksJobStateMock.mockResolvedValueOnce({
      imageLinksStatus: 'processing',
      imageLinksStartedAt: new Date(Date.now() - (STALE_JOB_MS + 60_000)),
    });

    const result = await generateArtistImagesFromLinksAction({ artistId: VALID_ID });

    expect(result).toEqual({ success: true, status: 'pending' });
    expect(afterCallback).toBeTypeOf('function');
  });

  it('returns a typed error when the repository throws', async () => {
    getImageLinksJobStateMock.mockRejectedValueOnce(new Error('db'));

    const result = await generateArtistImagesFromLinksAction({ artistId: VALID_ID });

    expect(result).toEqual({
      success: false,
      error: 'Image generation failed to start. Please try again.',
    });
  });
});
