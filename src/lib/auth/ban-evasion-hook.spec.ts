/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { loggers } from '@/lib/utils/logger';

import { assertNotBanEvading } from './ban-evasion-hook';

vi.mock('server-only', () => ({}));

const findActiveMatchMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/repositories/banned-identity-repository', () => ({
  BannedIdentityRepository: {
    findActiveMatch: findActiveMatchMock,
  },
}));

describe('assertNotBanEvading', () => {
  beforeEach(() => {
    findActiveMatchMock.mockReset();
  });

  it('returns without throwing when neither email nor userId is present', async () => {
    await expect(assertNotBanEvading({ email: null, userId: null })).resolves.toBeUndefined();
    expect(findActiveMatchMock).not.toHaveBeenCalled();
  });

  it('queries the repository with the supplied userId and email', async () => {
    findActiveMatchMock.mockResolvedValue(null);

    await assertNotBanEvading({ email: 'fan@example.com', userId: 'u1' });

    expect(findActiveMatchMock).toHaveBeenCalledWith({ userId: 'u1', email: 'fan@example.com' });
  });

  it('resolves (allows) when no active ban matches', async () => {
    findActiveMatchMock.mockResolvedValue(null);

    await expect(
      assertNotBanEvading({ email: 'fan@example.com', userId: 'u1' })
    ).resolves.toBeUndefined();
  });

  it('throws when an active ban matches', async () => {
    findActiveMatchMock.mockResolvedValue({ id: 'ban-1' });

    await expect(assertNotBanEvading({ email: 'fan@example.com', userId: 'u1' })).rejects.toThrow();
  });

  it('logs a warning when rejecting a banned identity', async () => {
    const warnSpy = vi.spyOn(loggers.auth, 'warn').mockImplementation(() => {});
    findActiveMatchMock.mockResolvedValue({ id: 'ban-1' });

    await expect(assertNotBanEvading({ email: 'fan@example.com', userId: 'u1' })).rejects.toThrow();

    expect(warnSpy).toHaveBeenCalledWith(
      'Sign-in rejected for banned identity',
      expect.objectContaining({ userId: 'u1' })
    );
    warnSpy.mockRestore();
  });

  it('fails open (resolves) when the repository throws, logging the error', async () => {
    const errorSpy = vi.spyOn(loggers.auth, 'error').mockImplementation(() => {});
    findActiveMatchMock.mockRejectedValue(new Error('DB down'));

    await expect(
      assertNotBanEvading({ email: 'fan@example.com', userId: 'u1' })
    ).resolves.toBeUndefined();

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('masks the email in the rejection log', async () => {
    const warnSpy = vi.spyOn(loggers.auth, 'warn').mockImplementation(() => {});
    findActiveMatchMock.mockResolvedValue({ id: 'ban-1' });

    await expect(assertNotBanEvading({ email: 'fan@example.com', userId: null })).rejects.toThrow();

    expect(warnSpy).toHaveBeenCalledWith(
      'Sign-in rejected for banned identity',
      expect.objectContaining({ maskedEmail: 'f***' })
    );
    warnSpy.mockRestore();
  });
});
