/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { prisma } from '@/lib/prisma';

import type { SiteSettings } from '@prisma/client';

/**
 * Data-access layer for `SiteSettings` key/value records.
 * Methods return raw Prisma results; parsing, validation, and
 * ServiceResponse wrapping stay in the calling service.
 */
export class SiteSettingsRepository {
  /**
   * Find a single setting by its unique `key`, or null when absent.
   */
  static async findByKey(key: string): Promise<SiteSettings | null> {
    return prisma.siteSettings.findUnique({
      where: { key },
    });
  }

  /**
   * Upsert a setting's `value` keyed by its unique `key`.
   */
  static async upsertByKey(key: string, value: string): Promise<SiteSettings> {
    return prisma.siteSettings.upsert({
      where: { key },
      update: { value },
      create: { key, value },
    });
  }
}
