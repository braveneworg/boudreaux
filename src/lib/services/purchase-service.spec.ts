/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { PurchaseService } from './purchase-service';

vi.mock('server-only', () => ({}));

const mockFindByUserAndRelease = vi.hoisted(() => vi.fn());

vi.mock('@/lib/repositories/purchase-repository', () => ({
  PurchaseRepository: { findByUserAndRelease: mockFindByUserAndRelease },
}));

describe('PurchaseService', () => {
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
});
