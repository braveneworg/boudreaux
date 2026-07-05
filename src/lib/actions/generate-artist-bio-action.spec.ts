/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { GeneratedBioContent } from '@/lib/validation/bio-generation-schema';

import { generateArtistBioAction } from './generate-artist-bio-action';

vi.mock('server-only', () => ({}));

const revalidatePathMock = vi.fn();
vi.mock('next/cache', () => ({ revalidatePath: (path: string) => revalidatePathMock(path) }));

// Capture the after() callback so tests can run the "background" work on demand.
let afterCallback: (() => Promise<void>) | null = null;
vi.mock('next/server', () => ({
  after: (cb: () => Promise<void>) => {
    afterCallback = cb;
  },
}));

const logSecurityEventMock = vi.fn();
vi.mock('@/utils/audit-log', () => ({ logSecurityEvent: (e: unknown) => logSecurityEventMock(e) }));

const requireRoleMock = vi.fn();
vi.mock('@/lib/utils/auth/require-role', () => ({
  requireRole: (role: string) => requireRoleMock(role),
}));

const getBioGenerationStateMock = vi.fn();
const setBioStatusMock = vi.fn();
vi.mock('@/lib/repositories/artist-repository', () => ({
  ArtistRepository: {
    getBioGenerationState: (id: string) => getBioGenerationStateMock(id),
    setBioStatus: (id: string, status: string, opts: unknown) => setBioStatusMock(id, status, opts),
  },
}));

const runGenerationJobMock = vi.fn();
vi.mock('@/lib/services/bio-generation-service', () => ({
  BioGenerationService: {
    runGenerationJob: (id: string, opts: unknown) => runGenerationJobMock(id, opts),
  },
}));

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

const content: GeneratedBioContent = {
  shortBio: 'Short teaser',
  longBio: '<p>Long</p>',
  altBio: '<p>Punchy promo</p>',
  genres: 'art rock',
  images: [],
  links: [],
  model: 'gemini-2.5-pro',
};

beforeEach(() => {
  afterCallback = null;
  requireRoleMock.mockResolvedValue({ user: { id: 'admin-1' } });
  // Default: artist exists, never generated.
  getBioGenerationStateMock.mockResolvedValue({ bioStatus: null, bioStartedAt: null });
  setBioStatusMock.mockResolvedValue(undefined);
  runGenerationJobMock.mockResolvedValue({ status: 'completed', data: content, slug: 'radiohead' });
});

describe('generateArtistBioAction', () => {
  it('rejects when the caller is not an admin', async () => {
    requireRoleMock.mockRejectedValue(new Error('Unauthorized'));

    await expect(generateArtistBioAction({ artistId: VALID_ID })).rejects.toThrow('Unauthorized');
  });

  it('returns an error for invalid input without touching the service', async () => {
    const result = await generateArtistBioAction({ artistId: 'not-an-id' });

    expect(result).toEqual({ success: false, error: 'Invalid bio generation request.' });
    expect(getBioGenerationStateMock).not.toHaveBeenCalled();
  });

  it('returns not-found when the artist does not exist', async () => {
    getBioGenerationStateMock.mockResolvedValue(null);

    const result = await generateArtistBioAction({ artistId: VALID_ID });

    expect(result).toEqual({ success: false, error: 'Artist not found.' });
    expect(setBioStatusMock).not.toHaveBeenCalled();
  });

  it('marks the job pending and returns immediately', async () => {
    const result = await generateArtistBioAction({
      artistId: VALID_ID,
      links: ['https://example.com'],
      description: 'x',
    });

    expect(result).toEqual({ success: true, status: 'pending' });
    expect(setBioStatusMock).toHaveBeenCalledWith(
      VALID_ID,
      'pending',
      expect.objectContaining({ error: null })
    );
    // Heavy work is deferred to after(), not run inline.
    expect(runGenerationJobMock).not.toHaveBeenCalled();
    expect(afterCallback).toBeTypeOf('function');
  });

  it('does not start a second run while one is in flight', async () => {
    getBioGenerationStateMock.mockResolvedValue({
      bioStatus: 'processing',
      bioStartedAt: new Date(),
    });

    const result = await generateArtistBioAction({ artistId: VALID_ID });

    expect(result).toEqual({ success: true, status: 'processing' });
    expect(setBioStatusMock).not.toHaveBeenCalled();
    expect(afterCallback).toBeNull();
  });

  // Pins STALE_JOB_MS to 17 min: a 16-min-old job is still in flight (under the
  // window, exceeds the Lambda's 15-min timeout) so it is NOT superseded.
  it('keeps a 16-minute-old in-flight job (under the stale window)', async () => {
    getBioGenerationStateMock.mockResolvedValue({
      bioStatus: 'processing',
      bioStartedAt: new Date(Date.now() - 16 * 60 * 1000),
    });

    const result = await generateArtistBioAction({ artistId: VALID_ID });

    expect(result).toEqual({ success: true, status: 'processing' });
    expect(setBioStatusMock).not.toHaveBeenCalled();
  });

  // Pins STALE_JOB_MS to 17 min: an 18-min-old job is past the window → stale.
  it('re-triggers a stale (18-minute-old) in-flight job', async () => {
    getBioGenerationStateMock.mockResolvedValue({
      bioStatus: 'processing',
      bioStartedAt: new Date(Date.now() - 18 * 60 * 1000),
    });

    const result = await generateArtistBioAction({ artistId: VALID_ID });

    expect(result).toEqual({ success: true, status: 'pending' });
    expect(setBioStatusMock).toHaveBeenCalledWith(VALID_ID, 'pending', expect.anything());
    expect(afterCallback).toBeTypeOf('function');
  });

  it('audit-logs the trigger with the admin user id at dispatch', async () => {
    await generateArtistBioAction({ artistId: VALID_ID });

    // Audit fires at trigger, before the background job runs.
    expect(logSecurityEventMock).toHaveBeenCalledWith({
      event: 'media.artist.updated',
      userId: 'admin-1',
      metadata: { artistId: VALID_ID, action: 'bio-generation-triggered' },
    });
    expect(runGenerationJobMock).not.toHaveBeenCalled();
  });

  it('revalidates but does not audit-log when the background job completes', async () => {
    await generateArtistBioAction({ artistId: VALID_ID });
    logSecurityEventMock.mockClear(); // drop the trigger-time audit
    await afterCallback?.();

    expect(runGenerationJobMock).toHaveBeenCalledWith(VALID_ID, {
      links: undefined,
      description: undefined,
    });
    // Completion no longer audit-logs (moved to the trigger).
    expect(logSecurityEventMock).not.toHaveBeenCalled();
    const revalidated = revalidatePathMock.mock.calls.map(([path]) => path);
    expect(revalidated).toContain('/artists/radiohead');
    expect(revalidated).toContain('/artists/radiohead/bio');
  });

  it('does not revalidate when the background job is dispatched to the Lambda', async () => {
    runGenerationJobMock.mockResolvedValue({ status: 'dispatched' });

    await generateArtistBioAction({ artistId: VALID_ID });
    logSecurityEventMock.mockClear();
    await afterCallback?.();

    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(logSecurityEventMock).not.toHaveBeenCalled();
  });

  it('does not revalidate when the background job fails', async () => {
    runGenerationJobMock.mockResolvedValue({ status: 'failed', error: 'boom' });

    await generateArtistBioAction({ artistId: VALID_ID });
    logSecurityEventMock.mockClear();
    await afterCallback?.();

    expect(revalidatePathMock).not.toHaveBeenCalled();
    expect(logSecurityEventMock).not.toHaveBeenCalled();
  });

  it('returns a typed error and logs when triggering throws unexpectedly', async () => {
    getBioGenerationStateMock.mockRejectedValue(new Error('DB down'));

    const result = await generateArtistBioAction({ artistId: VALID_ID });

    expect(result).toEqual({
      success: false,
      error: 'Bio generation failed to start. Please try again.',
    });
    expect(loggerErrorMock).toHaveBeenCalledTimes(1);
  });
});
