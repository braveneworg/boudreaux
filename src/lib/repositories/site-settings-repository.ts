/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import 'server-only';

import { prisma } from '@/lib/prisma';
import { DataError } from '@/lib/types/domain/errors';

import { runQuery } from './_internal/map-prisma-error';

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

  /**
   * Claim `value` for `key`, once: `true` for the one caller that moves the
   * setting to `value`, `false` for every caller that finds it already there.
   * It is how a job that must run once per day is claimed across instances:
   * the value is the day.
   *
   * A key that holds another value is moved with a conditional write. A key
   * nobody has written is created, and the unique index on `key` refuses all
   * but one of the callers that race to create it.
   */
  static async claimValue(key: string, value: string): Promise<boolean> {
    const { count } = await prisma.siteSettings.updateMany({
      where: { key, value: { not: value } },
      data: { value },
    });
    if (count > 0) {
      return true;
    }

    try {
      await runQuery(() => prisma.siteSettings.create({ data: { key, value } }));
      return true;
    } catch (error) {
      if (error instanceof DataError && error.code === 'DUPLICATE') {
        return false;
      }
      throw error;
    }
  }
}
