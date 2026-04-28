/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { PurchaseService } from './purchase-service';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/constants', () => ({
  MAX_RELEASE_DOWNLOAD_COUNT: 5,
  DOWNLOAD_RESET_HOURS: 6,
}));

const mockFindByUserAndRelease = vi.hoisted(() => vi.fn());
const mockGetDownloadRecord = vi.hoisted(() => vi.fn());
const mockUpsertDownloadCount = vi.hoisted(() => vi.fn());
const mockResetDownloadCount = vi.hoisted(() => vi.fn());
const mockHasActiveSubscription = vi.hoisted(() => vi.fn());

vi.mock('@/lib/repositories/purchase-repository', () => ({
  PurchaseRepository: {
    findByUserAndRelease: mockFindByUserAndRelease,
    getDownloadRecord: mockGetDownloadRecord,
    upsertDownloadCount: mockUpsertDownloadCount,
    resetDownloadCount: mockResetDownloadCount,
  },
}));

vi.mock('@/lib/repositories/subscription-repository', () => ({
  SubscriptionRepository: {
    hasActiveSubscription: mockHasActiveSubscription,
  },
}));

describe('PurchaseService', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-04T12:00:00Z'));
    mockHasActiveSubscription.mockResolvedValue(false);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('checkExistingPurchase', () => {
    it('should return true when a purchase record exists for the user and release', async () => {
      mockFindByUserAndRelease.mockResolvedValue({ id: 'purchase-1' });

      const result = await PurchaseService.checkExistingPurchase('user-123', 'release-abc');

      expect(result).toBe(true);
      expect(mockFindByUserAndRelease).toHaveBeenCalledWith('user-123', 'release-abc');
    });

    it('should return false when no purchase record exists', async () => {
      mockFindByUserAndRelease.mockResolvedValue(null);

      const result = await PurchaseService.checkExistingPurchase('user-123', 'release-abc');

      expect(result).toBe(false);
      expect(mockFindByUserAndRelease).toHaveBeenCalledWith('user-123', 'release-abc');
    });
  });

  describe('getDownloadAccess', () => {
    it('should return not allowed with reason "no_purchase" when no purchase record exists', async () => {
      mockFindByUserAndRelease.mockResolvedValue(null);

      const result = await PurchaseService.getDownloadAccess('user-123', 'release-abc');

      expect(result).toEqual({
        allowed: false,
        reason: 'no_purchase',
        downloadCount: 0,
        lastDownloadedAt: null,
        resetInHours: null,
      });
      expect(mockGetDownloadRecord).not.toHaveBeenCalled();
    });

    it('should return not allowed with reason "download_limit_reached" when at max and within 6 hours', async () => {
      mockFindByUserAndRelease.mockResolvedValue({ id: 'purchase-1' });
      // Last downloaded 2 hours ago (within the 6-hour window)
      const twoHoursAgo = new Date('2026-04-04T10:00:00Z');
      mockGetDownloadRecord.mockResolvedValue({
        downloadCount: 5,
        lastDownloadedAt: twoHoursAgo,
      });

      const result = await PurchaseService.getDownloadAccess('user-123', 'release-abc');

      expect(result).toEqual({
        allowed: false,
        reason: 'download_limit_reached',
        downloadCount: 5,
        lastDownloadedAt: twoHoursAgo,
        resetInHours: 4,
        isSubscriber: false,
      });
      expect(mockResetDownloadCount).not.toHaveBeenCalled();
    });

    it('should auto-reset and return allowed when at max but 6+ hours have elapsed', async () => {
      mockFindByUserAndRelease.mockResolvedValue({ id: 'purchase-1' });
      // Last downloaded 7 hours ago (past the 6-hour window)
      const sevenHoursAgo = new Date('2026-04-04T05:00:00Z');
      mockGetDownloadRecord.mockResolvedValue({
        downloadCount: 5,
        lastDownloadedAt: sevenHoursAgo,
      });
      mockResetDownloadCount.mockResolvedValue({ downloadCount: 0 });

      const result = await PurchaseService.getDownloadAccess('user-123', 'release-abc');

      expect(result).toEqual({
        allowed: true,
        reason: null,
        downloadCount: 0,
        lastDownloadedAt: sevenHoursAgo,
        resetInHours: null,
        isSubscriber: false,
      });
      expect(mockResetDownloadCount).toHaveBeenCalledWith('user-123', 'release-abc');
    });

    it('should return allowed when downloadCount is below the maximum', async () => {
      mockFindByUserAndRelease.mockResolvedValue({ id: 'purchase-1' });
      const anHourAgo = new Date('2026-04-04T11:00:00Z');
      mockGetDownloadRecord.mockResolvedValue({
        downloadCount: 3,
        lastDownloadedAt: anHourAgo,
      });

      const result = await PurchaseService.getDownloadAccess('user-123', 'release-abc');

      expect(result).toEqual({
        allowed: true,
        reason: null,
        downloadCount: 3,
        lastDownloadedAt: anHourAgo,
        resetInHours: null,
        isSubscriber: false,
      });
    });

    it('should return allowed with downloadCount 0 when a purchase exists but no download record', async () => {
      mockFindByUserAndRelease.mockResolvedValue({ id: 'purchase-1' });
      mockGetDownloadRecord.mockResolvedValue(null);

      const result = await PurchaseService.getDownloadAccess('user-123', 'release-abc');

      expect(result).toEqual({
        allowed: true,
        reason: null,
        downloadCount: 0,
        lastDownloadedAt: null,
        resetInHours: null,
        isSubscriber: false,
      });
    });

    it('should not reset when at max with null lastDownloadedAt', async () => {
      mockFindByUserAndRelease.mockResolvedValue({ id: 'purchase-1' });
      mockGetDownloadRecord.mockResolvedValue({
        downloadCount: 5,
        lastDownloadedAt: null,
      });

      const result = await PurchaseService.getDownloadAccess('user-123', 'release-abc');

      expect(result).toEqual({
        allowed: false,
        reason: 'download_limit_reached',
        downloadCount: 5,
        lastDownloadedAt: null,
        resetInHours: null,
        isSubscriber: false,
      });
      expect(mockResetDownloadCount).not.toHaveBeenCalled();
    });

    it('should not reset when at max and exactly at the 6-hour boundary', async () => {
      mockFindByUserAndRelease.mockResolvedValue({ id: 'purchase-1' });
      // Exactly 6 hours ago (not past the window)
      const exactlySixHoursAgo = new Date('2026-04-04T06:00:00Z');
      mockGetDownloadRecord.mockResolvedValue({
        downloadCount: 5,
        lastDownloadedAt: exactlySixHoursAgo,
      });

      const result = await PurchaseService.getDownloadAccess('user-123', 'release-abc');

      expect(result).toEqual({
        allowed: false,
        reason: 'download_limit_reached',
        downloadCount: 5,
        lastDownloadedAt: exactlySixHoursAgo,
        resetInHours: null,
        isSubscriber: false,
      });
      expect(mockResetDownloadCount).not.toHaveBeenCalled();
    });

    it('should grant subscriber access when no purchase exists but user has an active subscription', async () => {
      mockFindByUserAndRelease.mockResolvedValue(null);
      mockHasActiveSubscription.mockResolvedValue(true);
      mockGetDownloadRecord.mockResolvedValue(null);

      const result = await PurchaseService.getDownloadAccess('user-123', 'release-abc');

      expect(result).toEqual({
        allowed: true,
        reason: null,
        downloadCount: 0,
        lastDownloadedAt: null,
        resetInHours: null,
        isSubscriber: true,
      });
    });

    it('should still enforce per-release download cap for subscribers', async () => {
      mockFindByUserAndRelease.mockResolvedValue(null);
      mockHasActiveSubscription.mockResolvedValue(true);
      const twoHoursAgo = new Date('2026-04-04T10:00:00Z');
      mockGetDownloadRecord.mockResolvedValue({
        downloadCount: 5,
        lastDownloadedAt: twoHoursAgo,
      });

      const result = await PurchaseService.getDownloadAccess('user-123', 'release-abc');

      expect(result).toEqual({
        allowed: false,
        reason: 'download_limit_reached',
        downloadCount: 5,
        lastDownloadedAt: twoHoursAgo,
        resetInHours: 4,
        isSubscriber: true,
      });
    });
  });

  describe('incrementDownloadCount', () => {
    it('should delegate to PurchaseRepository.upsertDownloadCount and return its result', async () => {
      const mockRecord = {
        id: 'dl-1',
        userId: 'user-123',
        releaseId: 'release-abc',
        downloadCount: 2,
        lastDownloadedAt: new Date(),
      };
      mockUpsertDownloadCount.mockResolvedValue(mockRecord);

      const result = await PurchaseService.incrementDownloadCount('user-123', 'release-abc');

      expect(mockUpsertDownloadCount).toHaveBeenCalledWith('user-123', 'release-abc');
      expect(result).toEqual(mockRecord);
    });
  });
});
