/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { SiteSettingsRepository } from '@/lib/repositories/site-settings-repository';
import { cache } from '@/lib/utils/simple-cache';

import { SIGNUPS_PAUSED_SETTINGS_KEY, SignupSettingsService } from './signup-settings-service';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/repositories/site-settings-repository', () => ({
  SiteSettingsRepository: { findByKey: vi.fn(), upsertByKey: vi.fn() },
}));
vi.mock('@/lib/utils/simple-cache', () => ({
  // pass-through cache so we observe repository calls directly
  withCache: vi.fn((_key: string, fn: () => unknown) => fn()),
  cache: { delete: vi.fn() },
}));

const mockFindByKey = vi.mocked(SiteSettingsRepository.findByKey);
const mockUpsert = vi.mocked(SiteSettingsRepository.upsertByKey);

afterEach(() => vi.unstubAllEnvs());

describe('SignupSettingsService.areSignupsPaused', () => {
  it('returns true when AUTH_DISABLE_SIGNUP is "true" (env wins)', async () => {
    vi.stubEnv('AUTH_DISABLE_SIGNUP', 'true');
    expect(await SignupSettingsService.areSignupsPaused()).toBe(true);
  });

  it('does not hit the database when env forces pause', async () => {
    vi.stubEnv('AUTH_DISABLE_SIGNUP', 'true');
    await SignupSettingsService.areSignupsPaused();
    expect(mockFindByKey).not.toHaveBeenCalled();
  });

  it('returns true when the stored setting is "true"', async () => {
    vi.stubEnv('AUTH_DISABLE_SIGNUP', '');
    mockFindByKey.mockResolvedValue({
      id: '1',
      key: SIGNUPS_PAUSED_SETTINGS_KEY,
      value: 'true',
      updatedAt: new Date(),
    });
    expect(await SignupSettingsService.areSignupsPaused()).toBe(true);
  });

  it('returns false when the setting is absent', async () => {
    vi.stubEnv('AUTH_DISABLE_SIGNUP', '');
    mockFindByKey.mockResolvedValue(null);
    expect(await SignupSettingsService.areSignupsPaused()).toBe(false);
  });

  it('returns false when the stored setting is "false"', async () => {
    vi.stubEnv('AUTH_DISABLE_SIGNUP', '');
    mockFindByKey.mockResolvedValue({
      id: '1',
      key: SIGNUPS_PAUSED_SETTINGS_KEY,
      value: 'false',
      updatedAt: new Date(),
    });
    expect(await SignupSettingsService.areSignupsPaused()).toBe(false);
  });
});

describe('SignupSettingsService.setSignupsPaused', () => {
  it('upserts the stringified flag', async () => {
    await SignupSettingsService.setSignupsPaused(true);
    expect(mockUpsert).toHaveBeenCalledWith(SIGNUPS_PAUSED_SETTINGS_KEY, 'true');
  });

  it('invalidates the cache after writing', async () => {
    await SignupSettingsService.setSignupsPaused(false);
    expect(cache.delete).toHaveBeenCalledWith('site-setting:signups-paused');
  });
});

describe('SignupSettingsService.isEnvForced', () => {
  it('reflects the env var', () => {
    vi.stubEnv('AUTH_DISABLE_SIGNUP', 'true');
    expect(SignupSettingsService.isEnvForced()).toBe(true);
  });

  it('returns false when AUTH_DISABLE_SIGNUP is not "true"', () => {
    vi.stubEnv('AUTH_DISABLE_SIGNUP', '');
    expect(SignupSettingsService.isEnvForced()).toBe(false);
  });
});
