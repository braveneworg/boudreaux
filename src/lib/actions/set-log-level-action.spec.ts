// @vitest-environment node
/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { logSecurityEvent } from '@/lib/utils/audit-log';
import { requireRole } from '@/lib/utils/auth/require-role';
import { setRuntimeLogLevel } from '@/lib/utils/logger';

import { setLogLevelAction } from './set-log-level-action';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/utils/auth/require-role', () => ({
  requireRole: vi.fn(),
}));

vi.mock('@/lib/utils/audit-log', () => ({
  logSecurityEvent: vi.fn(),
}));

const stateFixture = {
  configuredLevel: 'info',
  override: 'debug',
  effectiveLevel: 'debug',
  expiresAt: '2026-06-10T12:00:00.000Z',
};

vi.mock('@/lib/utils/logger', () => ({
  setRuntimeLogLevel: vi.fn(() => stateFixture),
  getLogLevelState: vi.fn(() => stateFixture),
}));

const adminSession = { user: { id: 'admin-1', email: 'a@example.com', role: 'admin' } };

beforeEach(() => {
  vi.mocked(requireRole).mockResolvedValue(adminSession as never);
});

describe('setLogLevelAction', () => {
  it('returns unauthorized when the caller is not an admin', async () => {
    vi.mocked(requireRole).mockRejectedValue(new Error('Unauthorized'));

    const result = await setLogLevelAction({ level: 'debug' });

    expect(result).toEqual({ success: false, error: 'unauthorized' });
    expect(setRuntimeLogLevel).not.toHaveBeenCalled();
  });

  it('rejects an invalid level', async () => {
    const result = await setLogLevelAction({ level: 'verbose' as never });

    expect(result).toEqual({ success: false, error: 'invalid' });
    expect(setRuntimeLogLevel).not.toHaveBeenCalled();
  });

  it('rejects an out-of-range ttl', async () => {
    const result = await setLogLevelAction({ level: 'debug', ttlMinutes: 3 });

    expect(result).toEqual({ success: false, error: 'invalid' });
  });

  it('applies the level with the default 60-minute TTL and audits the change', async () => {
    const result = await setLogLevelAction({ level: 'debug' });

    expect(setRuntimeLogLevel).toHaveBeenCalledWith('debug', 60 * 60_000);
    expect(logSecurityEvent).toHaveBeenCalledWith({
      event: 'admin.log_level.changed',
      userId: 'admin-1',
      metadata: {
        level: 'debug',
        ttlMinutes: 60,
        expiresAt: stateFixture.expiresAt,
      },
    });
    expect(result).toEqual({ success: true, state: stateFixture });
  });

  it('passes an explicit ttlMinutes through', async () => {
    await setLogLevelAction({ level: 'warn', ttlMinutes: 240 });

    expect(setRuntimeLogLevel).toHaveBeenCalledWith('warn', 240 * 60_000);
  });

  it('clears the override when level is null', async () => {
    await setLogLevelAction({ level: null });

    expect(setRuntimeLogLevel).toHaveBeenCalledWith(null);
    expect(logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: 'admin.log_level.changed',
        metadata: expect.not.objectContaining({ ttlMinutes: expect.anything() }),
      })
    );
  });
});
