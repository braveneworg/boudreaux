/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { revalidatePath } from 'next/cache';

import { ReleaseService } from '@/lib/services/release-service';
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { requireRole } from '@/lib/utils/auth/require-role';

import { deleteReleaseAction } from './delete-release-action';

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('@/lib/services/release-service');
vi.mock('@/lib/utils/audit-log');
vi.mock('@/lib/utils/auth/require-role');

const mockSession = {
  user: { id: 'user-123', role: 'admin', email: 'admin@example.com' },
};

const releaseId = '507f1f77bcf86cd799439011';

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireRole).mockResolvedValue(mockSession as never);
  vi.mocked(revalidatePath).mockImplementation(() => {});
  vi.mocked(ReleaseService.deleteRelease).mockResolvedValue({
    success: true,
    data: { id: releaseId } as never,
  });
});

describe('deleteReleaseAction', () => {
  it('returns Unauthorized when the admin role check fails', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

    const result = await deleteReleaseAction(releaseId);

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
  });

  it('rejects an invalid release id', async () => {
    const result = await deleteReleaseAction('not-an-id');

    expect(result).toEqual({ success: false, error: 'Invalid release ID' });
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
    });

    const result = await deleteReleaseAction(releaseId);

    expect(result).toEqual({ success: false, error: 'Release not found' });
  });

  it('handles an unexpected service error', async () => {
    vi.mocked(ReleaseService.deleteRelease).mockRejectedValue(new Error('Database error'));

    const result = await deleteReleaseAction(releaseId);

    expect(result).toEqual({ success: false, error: 'Failed to delete release' });
  });
});
