/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { PurchaseService } from './purchase-service';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/constants', () => ({
  MAX_RELEASE_DOWNLOAD_COUNT: 5,
}));

const mockFindByUserAndRelease = vi.hoisted(() => vi.fn());
const mockGetDownloadRecord = vi.hoisted(() => vi.fn());
const mockUpsertDownloadCount = vi.hoisted(() => vi.fn());

vi.mock('@/lib/repositories/purchase-repository', () => ({
  PurchaseRepository: {
    findByUserAndRelease: mockFindByUserAndRelease,
    getDownloadRecord: mockGetDownloadRecord,
    upsertDownloadCount: mockUpsertDownloadCount,
  },
}));

describe('PurchaseService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

      expect(result).toEqual({ allowed: false, reason: 'no_purchase', downloadCount: 0 });
      expect(mockGetDownloadRecord).not.toHaveBeenCalled();
    });

    it('should return not allowed with reason "download_limit_reached" when downloadCount equals the maximum (5)', async () => {
      mockFindByUserAndRelease.mockResolvedValue({ id: 'purchase-1' });
      mockGetDownloadRecord.mockResolvedValue({ downloadCount: 5 });

      const result = await PurchaseService.getDownloadAccess('user-123', 'release-abc');

      expect(result).toEqual({
        allowed: false,
        reason: 'download_limit_reached',
        downloadCount: 5,
      });
    });

    it('should return allowed when downloadCount is below the maximum', async () => {
      mockFindByUserAndRelease.mockResolvedValue({ id: 'purchase-1' });
      mockGetDownloadRecord.mockResolvedValue({ downloadCount: 3 });

      const result = await PurchaseService.getDownloadAccess('user-123', 'release-abc');

      expect(result).toEqual({ allowed: true, reason: null, downloadCount: 3 });
    });

    it('should return allowed with downloadCount 0 when a purchase exists but no download record', async () => {
      mockFindByUserAndRelease.mockResolvedValue({ id: 'purchase-1' });
      mockGetDownloadRecord.mockResolvedValue(null);

      const result = await PurchaseService.getDownloadAccess('user-123', 'release-abc');

      expect(result).toEqual({ allowed: true, reason: null, downloadCount: 0 });
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
