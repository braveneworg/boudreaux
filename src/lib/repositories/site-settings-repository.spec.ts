/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { prisma } from '@/lib/prisma';

import { SiteSettingsRepository } from './site-settings-repository';

import type { SiteSettings } from '@prisma/client';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    siteSettings: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

const mockFindUnique = vi.mocked(prisma.siteSettings.findUnique);
const mockUpsert = vi.mocked(prisma.siteSettings.upsert);

const mockSetting: SiteSettings = {
  id: 'setting-1',
  key: 'carousel-rotation-interval',
  value: '8',
  updatedAt: new Date('2026-04-01T00:00:00.000Z'),
};

describe('SiteSettingsRepository', () => {
  describe('findByKey', () => {
    it('reads a setting by its unique key', async () => {
      mockFindUnique.mockResolvedValue(mockSetting);

      const result = await SiteSettingsRepository.findByKey('carousel-rotation-interval');

      expect(result).toEqual(mockSetting);
      expect(mockFindUnique).toHaveBeenCalledWith({
        where: { key: 'carousel-rotation-interval' },
      });
    });

    it('returns null when no setting exists', async () => {
      mockFindUnique.mockResolvedValue(null);

      const result = await SiteSettingsRepository.findByKey('missing-key');

      expect(result).toBeNull();
    });
  });

  describe('upsertByKey', () => {
    it('upserts the value keyed by the unique key', async () => {
      const upserted = { ...mockSetting, value: '10' };
      mockUpsert.mockResolvedValue(upserted);

      const result = await SiteSettingsRepository.upsertByKey('carousel-rotation-interval', '10');

      expect(result).toEqual(upserted);
      expect(mockUpsert).toHaveBeenCalledWith({
        where: { key: 'carousel-rotation-interval' },
        update: { value: '10' },
        create: { key: 'carousel-rotation-interval', value: '10' },
      });
    });
  });
});
