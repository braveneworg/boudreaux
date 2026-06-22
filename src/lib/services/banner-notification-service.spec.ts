/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { BannerNotificationRepository } from '@/lib/repositories/banner-notification-repository';
import { SiteSettingsRepository } from '@/lib/repositories/site-settings-repository';
import { DataError } from '@/lib/types/domain/errors';
import { cache, withCache } from '@/lib/utils/simple-cache';

import { BannerNotificationService } from './banner-notification-service';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/repositories/banner-notification-repository', () => ({
  BannerNotificationRepository: {
    findAllOrderedBySlot: vi.fn(),
    searchByContent: vi.fn(),
    upsertBySlot: vi.fn(),
    deleteBySlot: vi.fn(),
  },
}));
vi.mock('@/lib/repositories/site-settings-repository', () => ({
  SiteSettingsRepository: {
    findByKey: vi.fn(),
    upsertByKey: vi.fn(),
  },
}));
vi.mock('@/lib/utils/simple-cache', () => ({
  cache: { delete: vi.fn() },
  withCache: vi.fn(async (_key: string, fn: () => Promise<unknown>, _ttl?: number) => fn()),
}));

const mockFindMany = vi.mocked(BannerNotificationRepository.findAllOrderedBySlot);
const mockSearch = vi.mocked(BannerNotificationRepository.searchByContent);
const mockBannerUpsert = vi.mocked(BannerNotificationRepository.upsertBySlot);
const mockDelete = vi.mocked(BannerNotificationRepository.deleteBySlot);
const mockSettingsFindUnique = vi.mocked(SiteSettingsRepository.findByKey);
const mockSettingsUpsert = vi.mocked(SiteSettingsRepository.upsertByKey);
const mockCacheDelete = vi.mocked(cache.delete);
const mockWithCache = vi.mocked(withCache);

const now = new Date('2026-04-07T12:00:00.000Z');

type FailureResult = { success: false; error: string };
type SuccessResult<T> = { success: true; data: T };

const mockNotification = {
  id: 'notif-1',
  slotNumber: 1,
  content: 'Test banner content',
  textColor: '#ffffff',
  backgroundColor: '#000000',
  displayFrom: new Date('2026-04-01T00:00:00.000Z'),
  displayUntil: new Date('2026-04-30T23:59:59.000Z'),
  repostedFromId: null,
  addedById: 'user-1',
  createdAt: new Date('2026-04-01T00:00:00.000Z'),
  updatedAt: new Date('2026-04-01T00:00:00.000Z'),
};

describe('BannerNotificationService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    mockWithCache.mockImplementation(
      async (_key: string, fn: () => Promise<unknown>, _ttl?: number) => fn()
    );
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('getActiveBanners', () => {
    it('should return banners with active notification', async () => {
      mockFindMany.mockResolvedValue([mockNotification]);
      mockSettingsFindUnique.mockResolvedValue(null);

      const result = await BannerNotificationService.getActiveBanners();

      expect(result).toEqual(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            banners: expect.arrayContaining([
              expect.objectContaining({
                slotNumber: 1,
                imageFilename: 'FFINC Banner 1_5_1920.webp',
                notification: {
                  id: 'notif-1',
                  content: 'Test banner content',
                  textColor: '#ffffff',
                  backgroundColor: '#000000',
                  displayFrom: mockNotification.displayFrom.toISOString(),
                  displayUntil: mockNotification.displayUntil.toISOString(),
                },
              }),
            ]),
            rotationInterval: 6.5,
          }),
        })
      );
      const data = (result as { success: true; data: { banners: { notification: unknown }[] } })
        .data;
      expect(data.banners).toHaveLength(5);
      expect(data.banners[1].notification).toBeNull();
      expect(data.banners[2].notification).toBeNull();
      expect(data.banners[3].notification).toBeNull();
      expect(data.banners[4].notification).toBeNull();
    });

    it('should return null notification when content is null', async () => {
      const nullContentNotification = { ...mockNotification, content: null };
      mockFindMany.mockResolvedValue([nullContentNotification]);
      mockSettingsFindUnique.mockResolvedValue(null);

      const result = await BannerNotificationService.getActiveBanners();

      expect(result.success).toBe(true);
      const data = (result as { success: true; data: { banners: { notification: unknown }[] } })
        .data;
      expect(data.banners[0].notification).toBeNull();
    });

    it('should return null notification when displayFrom is in the future', async () => {
      const futureNotification = {
        ...mockNotification,
        displayFrom: new Date('2026-05-01T00:00:00.000Z'),
      };
      mockFindMany.mockResolvedValue([futureNotification]);
      mockSettingsFindUnique.mockResolvedValue(null);

      const result = await BannerNotificationService.getActiveBanners();

      expect(result.success).toBe(true);
      const data = (result as { success: true; data: { banners: { notification: unknown }[] } })
        .data;
      expect(data.banners[0].notification).toBeNull();
    });

    it('should return null notification when displayUntil is in the past', async () => {
      const expiredNotification = {
        ...mockNotification,
        displayUntil: new Date('2026-03-31T23:59:59.000Z'),
      };
      mockFindMany.mockResolvedValue([expiredNotification]);
      mockSettingsFindUnique.mockResolvedValue(null);

      const result = await BannerNotificationService.getActiveBanners();

      expect(result.success).toBe(true);
      const data = (result as { success: true; data: { banners: { notification: unknown }[] } })
        .data;
      expect(data.banners[0].notification).toBeNull();
    });

    it('should return active notification when displayFrom and displayUntil are null', async () => {
      const noDateNotification = {
        ...mockNotification,
        displayFrom: null,
        displayUntil: null,
      };
      mockFindMany.mockResolvedValue([noDateNotification]);
      mockSettingsFindUnique.mockResolvedValue(null);

      const result = await BannerNotificationService.getActiveBanners();

      expect(result.success).toBe(true);
      const data = (result as { success: true; data: { banners: { notification: unknown }[] } })
        .data;
      expect(data.banners[0].notification).toEqual({
        id: 'notif-1',
        content: 'Test banner content',
        textColor: '#ffffff',
        backgroundColor: '#000000',
        displayFrom: null,
        displayUntil: null,
      });
    });

    it('should sanitize notification content at the read boundary', async () => {
      // Defense-in-depth: even if unsanitized HTML reached the DB (seed,
      // migration, or a future write path that bypasses the write-time
      // sanitizer), the public read path must strip it with the parser-based
      // sanitizer before it reaches the carousel's dangerouslySetInnerHTML.
      const maliciousNotification = {
        ...mockNotification,
        displayFrom: null,
        displayUntil: null,
        content: '<strong>Sale</strong><script>alert(1)</script><img src=x onerror=alert(1)>',
      };
      mockFindMany.mockResolvedValue([maliciousNotification]);
      mockSettingsFindUnique.mockResolvedValue(null);

      const result = await BannerNotificationService.getActiveBanners();

      expect(result.success).toBe(true);
      const data = (result as { success: true; data: { banners: { notification: unknown }[] } })
        .data;
      expect((data.banners[0].notification as { content: string }).content).toBe(
        '<strong>Sale</strong>'
      );
    });

    it('should strip javascript: hrefs from anchor content at the read boundary', async () => {
      const jsHrefNotification = {
        ...mockNotification,
        displayFrom: null,
        displayUntil: null,
        content: '<a href="javascript:alert(1)">click</a>',
      };
      mockFindMany.mockResolvedValue([jsHrefNotification]);
      mockSettingsFindUnique.mockResolvedValue(null);

      const result = await BannerNotificationService.getActiveBanners();

      const data = (result as { success: true; data: { banners: { notification: unknown }[] } })
        .data;
      expect((data.banners[0].notification as { content: string }).content).not.toContain(
        'javascript:'
      );
    });

    it('should return error on UNAVAILABLE DataError', async () => {
      mockWithCache.mockRejectedValue(new DataError('UNAVAILABLE', 'DB down'));

      const result = await BannerNotificationService.getActiveBanners();

      expect(result.success).toBe(false);
      expect((result as { success: false; error: string }).error).toBe(
        'Database connection failed'
      );
    });

    it('should return error on generic error', async () => {
      mockWithCache.mockRejectedValue(new Error('Something went wrong'));

      const result = await BannerNotificationService.getActiveBanners();

      expect(result.success).toBe(false);
      expect((result as { success: false; error: string }).error).toBe(
        'Failed to fetch active banners'
      );
    });

    it('should call withCache with correct key and TTL', async () => {
      mockFindMany.mockResolvedValue([]);
      mockSettingsFindUnique.mockResolvedValue(null);

      await BannerNotificationService.getActiveBanners();

      expect(mockWithCache).toHaveBeenCalledWith(
        'banner-notifications:2026-04-07',
        expect.any(Function),
        300
      );
    });

    it('should disable caching (TTL 0) in E2E mode', async () => {
      vi.stubEnv('E2E_MODE', 'true');
      mockFindMany.mockResolvedValue([]);
      mockSettingsFindUnique.mockResolvedValue(null);

      await BannerNotificationService.getActiveBanners();

      expect(mockWithCache).toHaveBeenCalledWith(
        'banner-notifications:2026-04-07',
        expect.any(Function),
        0
      );
      vi.unstubAllEnvs();
    });

    it('should disable caching (TTL 0) in development', async () => {
      vi.stubEnv('NODE_ENV', 'development');
      mockFindMany.mockResolvedValue([]);
      mockSettingsFindUnique.mockResolvedValue(null);

      await BannerNotificationService.getActiveBanners();

      expect(mockWithCache).toHaveBeenCalledWith(
        'banner-notifications:2026-04-07',
        expect.any(Function),
        0
      );
      vi.unstubAllEnvs();
    });
  });

  describe('getAllNotifications', () => {
    it('should return all notifications', async () => {
      mockFindMany.mockResolvedValue([mockNotification]);

      const result = await BannerNotificationService.getAllNotifications();

      expect(result.success).toBe(true);
      expect((result as SuccessResult<unknown[]>).data).toEqual([mockNotification]);
      expect(mockFindMany).toHaveBeenCalledWith();
    });

    it('should return error on UNAVAILABLE DataError', async () => {
      mockFindMany.mockRejectedValue(new DataError('UNAVAILABLE', 'DB down'));

      const result = await BannerNotificationService.getAllNotifications();

      expect(result.success).toBe(false);
      expect((result as FailureResult).error).toBe('Database connection failed');
    });

    it('should return error on generic error', async () => {
      mockFindMany.mockRejectedValue(new Error('Unknown error'));

      const result = await BannerNotificationService.getAllNotifications();

      expect(result.success).toBe(false);
      expect((result as FailureResult).error).toBe('Failed to fetch notifications');
    });
  });

  describe('upsertNotification', () => {
    const upsertData = {
      content: 'Updated content',
      textColor: '#ff0000',
      backgroundColor: '#00ff00',
      displayFrom: new Date('2026-04-01T00:00:00.000Z'),
      displayUntil: new Date('2026-04-30T23:59:59.000Z'),
      repostedFromId: null,
      addedById: 'user-1',
    };

    it('should update existing notification', async () => {
      const updated = { ...mockNotification, ...upsertData };
      mockBannerUpsert.mockResolvedValue(updated);

      const result = await BannerNotificationService.upsertNotification(1, upsertData);

      expect(result.success).toBe(true);
      expect((result as SuccessResult<{ content: string }>).data.content).toBe('Updated content');
      expect(mockBannerUpsert).toHaveBeenCalledWith(1, upsertData);
      expect(mockCacheDelete).toHaveBeenCalled();
    });

    it('should create new notification when none exists', async () => {
      const created = { ...mockNotification, slotNumber: 2, ...upsertData };
      mockBannerUpsert.mockResolvedValue(created);

      const result = await BannerNotificationService.upsertNotification(2, upsertData);

      expect(result.success).toBe(true);
      expect(mockBannerUpsert).toHaveBeenCalledWith(2, upsertData);
      expect(mockCacheDelete).toHaveBeenCalled();
    });

    it('should return error on failure', async () => {
      mockBannerUpsert.mockRejectedValue(new Error('DB error'));

      const result = await BannerNotificationService.upsertNotification(1, upsertData);

      expect(result.success).toBe(false);
      expect((result as FailureResult).error).toBe('Failed to save notification');
    });
  });

  describe('deleteNotification', () => {
    it('should delete notification successfully', async () => {
      mockDelete.mockResolvedValue(mockNotification);

      const result = await BannerNotificationService.deleteNotification(1);

      expect(result.success).toBe(true);
      expect((result as SuccessResult<{ deleted: boolean }>).data).toEqual({ deleted: true });
      expect(mockDelete).toHaveBeenCalledWith(1);
      expect(mockCacheDelete).toHaveBeenCalled();
    });

    it('should return not found error on NOT_FOUND DataError', async () => {
      mockDelete.mockRejectedValue(new DataError('NOT_FOUND', 'Record not found'));

      const result = await BannerNotificationService.deleteNotification(99);

      expect(result.success).toBe(false);
      expect((result as FailureResult).error).toBe('Notification not found');
    });

    it('should return error on generic error', async () => {
      mockDelete.mockRejectedValue(new Error('Delete failed'));

      const result = await BannerNotificationService.deleteNotification(1);

      expect(result.success).toBe(false);
      expect((result as FailureResult).error).toBe('Failed to delete notification');
    });
  });

  describe('searchNotifications', () => {
    const searchResult = {
      id: 'notif-1',
      content: 'Test banner content',
      textColor: '#ffffff',
      backgroundColor: '#000000',
      slotNumber: 1,
      displayFrom: new Date('2026-04-01T00:00:00.000Z'),
      displayUntil: new Date('2026-04-30T23:59:59.000Z'),
      repostedFromId: null,
      addedById: 'user-1',
      createdAt: new Date('2026-04-01T00:00:00.000Z'),
      updatedAt: new Date('2026-04-01T00:00:00.000Z'),
    };

    it('should search with query string', async () => {
      mockSearch.mockResolvedValue([searchResult]);

      const result = await BannerNotificationService.searchNotifications('test');

      expect(result.success).toBe(true);
      expect((result as SuccessResult<unknown[]>).data).toEqual([searchResult]);
      expect(mockSearch).toHaveBeenCalledWith('test', 20);
    });

    it('should return all non-null content when query is empty', async () => {
      mockSearch.mockResolvedValue([searchResult]);

      const result = await BannerNotificationService.searchNotifications('');

      expect(result.success).toBe(true);
      expect(mockSearch).toHaveBeenCalledWith('', 20);
    });

    it('should respect custom take parameter', async () => {
      mockSearch.mockResolvedValue([]);

      await BannerNotificationService.searchNotifications('test', 5);

      expect(mockSearch).toHaveBeenCalledWith('test', 5);
    });

    it('should return error on failure', async () => {
      mockSearch.mockRejectedValue(new Error('Search failed'));

      const result = await BannerNotificationService.searchNotifications('test');

      expect(result.success).toBe(false);
      expect((result as FailureResult).error).toBe('Failed to search notifications');
    });
  });

  describe('getRotationInterval', () => {
    it('should return parsed interval when valid setting exists', async () => {
      mockSettingsFindUnique.mockResolvedValue({
        id: 'setting-1',
        key: 'carousel-rotation-interval',
        value: '8',
        updatedAt: new Date(),
      });

      const result = await BannerNotificationService.getRotationInterval();

      expect(result).toBe(8);
      expect(mockSettingsFindUnique).toHaveBeenCalledWith('carousel-rotation-interval');
    });

    it('should return default interval when no setting exists', async () => {
      mockSettingsFindUnique.mockResolvedValue(null);

      const result = await BannerNotificationService.getRotationInterval();

      expect(result).toBe(6.5);
    });

    it('should return default interval when value is NaN', async () => {
      mockSettingsFindUnique.mockResolvedValue({
        id: 'setting-1',
        key: 'carousel-rotation-interval',
        value: 'not-a-number',
        updatedAt: new Date(),
      });

      const result = await BannerNotificationService.getRotationInterval();

      expect(result).toBe(6.5);
    });

    it('should return default interval when value is below minimum (3)', async () => {
      mockSettingsFindUnique.mockResolvedValue({
        id: 'setting-1',
        key: 'carousel-rotation-interval',
        value: '2',
        updatedAt: new Date(),
      });

      const result = await BannerNotificationService.getRotationInterval();

      expect(result).toBe(6.5);
    });

    it('should return default interval when value is above maximum (15)', async () => {
      mockSettingsFindUnique.mockResolvedValue({
        id: 'setting-1',
        key: 'carousel-rotation-interval',
        value: '20',
        updatedAt: new Date(),
      });

      const result = await BannerNotificationService.getRotationInterval();

      expect(result).toBe(6.5);
    });

    it('should return default interval on database error', async () => {
      mockSettingsFindUnique.mockRejectedValue(new Error('DB error'));

      const result = await BannerNotificationService.getRotationInterval();

      expect(result).toBe(6.5);
    });

    it('should accept boundary value of 3', async () => {
      mockSettingsFindUnique.mockResolvedValue({
        id: 'setting-1',
        key: 'carousel-rotation-interval',
        value: '3',
        updatedAt: new Date(),
      });

      const result = await BannerNotificationService.getRotationInterval();

      expect(result).toBe(3);
    });

    it('should accept boundary value of 15', async () => {
      mockSettingsFindUnique.mockResolvedValue({
        id: 'setting-1',
        key: 'carousel-rotation-interval',
        value: '15',
        updatedAt: new Date(),
      });

      const result = await BannerNotificationService.getRotationInterval();

      expect(result).toBe(15);
    });
  });

  describe('updateRotationInterval', () => {
    it('should upsert the interval successfully', async () => {
      mockSettingsUpsert.mockResolvedValue({
        id: 'setting-1',
        key: 'carousel-rotation-interval',
        value: '10',
        updatedAt: new Date(),
      });

      const result = await BannerNotificationService.updateRotationInterval(10);

      expect(result.success).toBe(true);
      expect((result as SuccessResult<{ interval: number }>).data).toEqual({ interval: 10 });
      expect(mockSettingsUpsert).toHaveBeenCalledWith('carousel-rotation-interval', '10');
      expect(mockCacheDelete).toHaveBeenCalled();
    });

    it('should return error on failure', async () => {
      mockSettingsUpsert.mockRejectedValue(new Error('Upsert failed'));

      const result = await BannerNotificationService.updateRotationInterval(10);

      expect(result.success).toBe(false);
      expect((result as FailureResult).error).toBe('Failed to update rotation interval');
    });
  });

  describe('invalidateCache', () => {
    it('should call cache.delete with the correct date-based key', () => {
      BannerNotificationService.invalidateCache();

      expect(mockCacheDelete).toHaveBeenCalledWith('banner-notifications:2026-04-07');
    });
  });
});
