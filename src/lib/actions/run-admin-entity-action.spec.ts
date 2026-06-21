/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { revalidatePath } from 'next/cache';

import { logSecurityEvent } from '@/lib/utils/audit-log';
import { requireRole } from '@/lib/utils/auth/require-role';

import { runAdminEntityAction } from './run-admin-entity-action';

vi.mock('server-only', () => ({}));
vi.mock('next/cache');
vi.mock('@/lib/utils/audit-log');
vi.mock('@/lib/utils/auth/require-role');

const mockSession = { user: { id: 'user-123', role: 'admin', email: 'admin@example.com' } };
const id = '507f1f77bcf86cd799439011';

const baseConfig = () => ({
  id,
  entityLabel: 'release',
  perform: vi.fn(() => Promise.resolve({ success: true as const, data: { id } })),
  event: 'media.release.deleted' as const,
  metadataKey: 'releaseId',
  revalidate: ['/admin/releases', '/releases'],
  failureError: 'Failed to delete release',
});

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireRole).mockResolvedValue(mockSession as never);
  vi.mocked(revalidatePath).mockImplementation(() => {});
});

describe('runAdminEntityAction', () => {
  it('returns Unauthorized when the admin role check fails', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));
    const config = baseConfig();

    const result = await runAdminEntityAction(config);

    expect(result).toEqual({ success: false, error: 'Unauthorized' });
    expect(config.perform).not.toHaveBeenCalled();
  });

  it('rejects an invalid object id using the entity label', async () => {
    const result = await runAdminEntityAction({ ...baseConfig(), id: 'nope' });

    expect(result).toEqual({ success: false, error: 'Invalid release ID' });
  });

  it('performs the mutation and returns success', async () => {
    const config = baseConfig();

    const result = await runAdminEntityAction(config);

    expect(config.perform).toHaveBeenCalledWith(id);
    expect(result).toEqual({ success: true });
  });

  it('logs the audit event with the configured metadata key', async () => {
    await runAdminEntityAction(baseConfig());

    expect(logSecurityEvent).toHaveBeenCalledWith({
      event: 'media.release.deleted',
      userId: 'user-123',
      metadata: { releaseId: id },
    });
  });

  it('revalidates every configured path', async () => {
    await runAdminEntityAction(baseConfig());

    expect(revalidatePath).toHaveBeenCalledWith('/admin/releases');
    expect(revalidatePath).toHaveBeenCalledWith('/releases');
  });

  it('surfaces a service failure result without logging or revalidating', async () => {
    const config = {
      ...baseConfig(),
      perform: vi.fn(() =>
        Promise.resolve({ success: false as const, error: 'Release not found' })
      ),
    };

    const result = await runAdminEntityAction(config);

    expect(result).toEqual({ success: false, error: 'Release not found' });
    expect(logSecurityEvent).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('returns the configured failure error when perform throws', async () => {
    const config = {
      ...baseConfig(),
      perform: vi.fn(() => Promise.reject(new Error('Database error'))),
    };

    const result = await runAdminEntityAction(config);

    expect(result).toEqual({ success: false, error: 'Failed to delete release' });
  });
});
