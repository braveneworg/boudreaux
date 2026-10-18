/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { revalidatePath } from 'next/cache';

import { gateAction } from '@/lib/auth/action-gate';
import { ReleaseService } from '@/lib/services/release-service';
import { logSecurityEvent } from '@/lib/utils/audit-log';

import { publishReleaseAction } from './publish-release-action';

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('@/lib/services/release-service');
vi.mock('@/lib/utils/audit-log');
vi.mock('@/lib/auth/action-gate');

const mockSession = { user: { id: 'user-123', role: 'admin', email: 'admin@example.com' } };
const REFUSAL = { success: false as const, error: 'Unauthorized', code: 'FORBIDDEN' as const };
const releaseId = '507f1f77bcf86cd799439011';
const artistId = '507f1f77bcf86cd799439012';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(gateAction).mockResolvedValue({ success: true, session: mockSession as never });
  vi.mocked(revalidatePath).mockImplementation(() => {});
  vi.mocked(ReleaseService.publishRelease).mockResolvedValue({
    success: true,
    data: { id: releaseId } as never,
  });
});

describe('publishReleaseAction', () => {
  it('returns the gate refusal without calling the service', async () => {
    vi.mocked(gateAction).mockResolvedValueOnce(REFUSAL);

    const result = await publishReleaseAction(releaseId);

    expect(result).toEqual(REFUSAL);
    expect(ReleaseService.publishRelease).not.toHaveBeenCalled();
  });

  it('rejects an invalid release id', async () => {
    const result = await publishReleaseAction('not-an-id');

    expect(result).toEqual({ success: false, error: 'Invalid release ID', code: 'INVALID_INPUT' });
  });

  it('publishes with no decisions when none are given', async () => {
    await publishReleaseAction(releaseId);

    expect(vi.mocked(ReleaseService.publishRelease).mock.calls).toEqual([
      [
        releaseId,
        {
          decisions: { publishArtistIds: [], keepHiddenArtistIds: [] },
          publishedBy: 'user-123',
        },
      ],
    ]);
  });

  it("passes the admin's decisions and id to the service", async () => {
    const decisions = { publishArtistIds: [artistId], keepHiddenArtistIds: [] };

    await publishReleaseAction(releaseId, decisions);

    expect(vi.mocked(ReleaseService.publishRelease).mock.calls).toEqual([
      [releaseId, { decisions, publishedBy: 'user-123' }],
    ]);
  });

  it('rejects decisions that are not artist ids and publishes nothing', async () => {
    const result = await publishReleaseAction(releaseId, {
      publishArtistIds: ['mc-example'],
      keepHiddenArtistIds: [],
    });

    expect({ result, calls: vi.mocked(ReleaseService.publishRelease).mock.calls }).toEqual({
      result: { success: false, error: 'Invalid artist decisions', code: 'INVALID_INPUT' },
      calls: [],
    });
  });

  it('revalidates the artist pages, since artists may now be public', async () => {
    await publishReleaseAction(releaseId);

    expect(revalidatePath).toHaveBeenCalledWith('/artists');
  });

  it('returns success when the publish succeeds', async () => {
    const result = await publishReleaseAction(releaseId);

    expect(result).toEqual({ success: true });
  });

  it('logs a security event on successful publish', async () => {
    await publishReleaseAction(releaseId);

    expect(logSecurityEvent).toHaveBeenCalledWith({
      event: 'media.release.published',
      userId: 'user-123',
      metadata: { releaseId },
    });
  });

  it('revalidates the admin and public release paths after publish', async () => {
    await publishReleaseAction(releaseId);

    expect(revalidatePath).toHaveBeenCalledWith('/admin/releases');
    expect(revalidatePath).toHaveBeenCalledWith('/releases');
  });

  it('surfaces a service failure result', async () => {
    vi.mocked(ReleaseService.publishRelease).mockResolvedValue({
      success: false,
      error: 'Release not found',
      code: 'NOT_FOUND',
    });

    const result = await publishReleaseAction(releaseId);

    expect(result).toEqual({ success: false, error: 'Release not found', code: 'NOT_FOUND' });
  });

  it('handles an unexpected service error', async () => {
    vi.mocked(ReleaseService.publishRelease).mockRejectedValue(new Error('Database error'));

    const result = await publishReleaseAction(releaseId);

    expect(result).toEqual({ success: false, error: 'Failed to publish release', code: 'UNKNOWN' });
  });
});
