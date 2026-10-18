/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { revalidatePath } from 'next/cache';

import { gateAction } from '@/lib/auth/action-gate';
import { ReleaseService } from '@/lib/services/release-service';
import { logSecurityEvent } from '@/lib/utils/audit-log';

import { deleteReleaseAction } from './delete-release-action';

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('@/lib/services/release-service');
vi.mock('@/lib/utils/audit-log');
vi.mock('@/lib/auth/action-gate');

const mockSession = {
  user: { id: 'user-123', role: 'admin', email: 'admin@example.com' },
};
const REFUSAL = { success: false as const, error: 'Unauthorized', code: 'FORBIDDEN' as const };

const releaseId = '507f1f77bcf86cd799439011';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(gateAction).mockResolvedValue({ success: true, session: mockSession as never });
  vi.mocked(revalidatePath).mockImplementation(() => {});
  vi.mocked(ReleaseService.deleteRelease).mockResolvedValue({
    success: true,
    data: { id: releaseId } as never,
  });
});

describe('deleteReleaseAction', () => {
  it('returns the gate refusal without calling the service', async () => {
    vi.mocked(gateAction).mockResolvedValueOnce(REFUSAL);

    const result = await deleteReleaseAction(releaseId);

    expect(result).toEqual(REFUSAL);
    expect(ReleaseService.deleteRelease).not.toHaveBeenCalled();
  });

  it('rejects an invalid release id', async () => {
    const result = await deleteReleaseAction('not-an-id');

    expect(result).toEqual({ success: false, error: 'Invalid release ID', code: 'INVALID_INPUT' });
  });

  it('hard-deletes the release via the service', async () => {
    await deleteReleaseAction(releaseId);

    expect(ReleaseService.deleteRelease).toHaveBeenCalledWith(releaseId);
  });

  it('returns success when the deletion succeeds', async () => {
    const result = await deleteReleaseAction(releaseId);

    expect(result).toEqual({ success: true });
  });

  it('logs a security event on successful deletion', async () => {
    await deleteReleaseAction(releaseId);

    expect(logSecurityEvent).toHaveBeenCalledWith({
      event: 'media.release.deleted',
      userId: 'user-123',
      metadata: { releaseId },
    });
  });

  it('revalidates the admin and public release paths after deletion', async () => {
    await deleteReleaseAction(releaseId);

    expect(revalidatePath).toHaveBeenCalledWith('/admin/releases');
    expect(revalidatePath).toHaveBeenCalledWith('/releases');
  });

  it('surfaces a service failure result', async () => {
    vi.mocked(ReleaseService.deleteRelease).mockResolvedValue({
      success: false,
      error: 'Release not found',
      code: 'NOT_FOUND',
    });

    const result = await deleteReleaseAction(releaseId);

    expect(result).toEqual({ success: false, error: 'Release not found', code: 'NOT_FOUND' });
  });

  it('handles an unexpected service error', async () => {
    vi.mocked(ReleaseService.deleteRelease).mockRejectedValue(new Error('Database error'));

    const result = await deleteReleaseAction(releaseId);

    expect(result).toEqual({ success: false, error: 'Failed to delete release', code: 'UNKNOWN' });
  });
});
