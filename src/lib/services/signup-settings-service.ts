/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { SiteSettingsRepository } from '@/lib/repositories/site-settings-repository';
import { cache, withCache } from '@/lib/utils/simple-cache';

export const SIGNUPS_PAUSED_SETTINGS_KEY = 'signups-paused';
const CACHE_KEY = `site-setting:${SIGNUPS_PAUSED_SETTINGS_KEY}`;

// Mirror the banner/featured-artists pattern: no cache in dev/E2E so the admin
// toggle is instant under test and the Playwright probe can't poison it.
const getCacheTtlSeconds = (): number =>
  process.env.NODE_ENV === 'development' || process.env.E2E_MODE === 'true' ? 0 : 300;

const isEnvForced = (): boolean => process.env.AUTH_DISABLE_SIGNUP === 'true';

const readDbPaused = async (): Promise<boolean> =>
  withCache(
    CACHE_KEY,
    async () =>
      (await SiteSettingsRepository.findByKey(SIGNUPS_PAUSED_SETTINGS_KEY))?.value === 'true',
    getCacheTtlSeconds()
  );

export const SignupSettingsService = {
  isEnvForced,
  areSignupsPaused: async (): Promise<boolean> => (isEnvForced() ? true : readDbPaused()),
  setSignupsPaused: async (paused: boolean): Promise<void> => {
    await SiteSettingsRepository.upsertByKey(SIGNUPS_PAUSED_SETTINGS_KEY, String(paused));
    cache.delete(CACHE_KEY);
  },
};
