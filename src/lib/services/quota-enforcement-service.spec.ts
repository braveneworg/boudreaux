/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { UserDownloadQuotaRepository } from '@/lib/repositories/user-download-quota-repository';
import type { DownloadSubject } from '@/types/download-subject';

import { QuotaEnforcementService } from './quota-enforcement-service';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/repositories/user-download-quota-repository');

describe('QuotaEnforcementService', () => {
  let service: QuotaEnforcementService;
  let mockQuotaRepo: {
    findOrCreateBySubject: ReturnType<typeof vi.fn>;
    addUniqueRelease: ReturnType<typeof vi.fn>;
  };

  const userId = 'user-123';
  const releaseId = 'release-456';
  const userSubject: DownloadSubject = { kind: 'user', userId };
  const guestSubject: DownloadSubject = { kind: 'guest', visitorId: 'visitor-1' };

  beforeEach(() => {
    mockQuotaRepo = {
      findOrCreateBySubject: vi.fn(),
      addUniqueRelease: vi.fn(),
    };

    service = new QuotaEnforcementService(
      mockQuotaRepo as unknown as UserDownloadQuotaRepository,
      5
    );
  });

  describe('checkFreeDownloadQuota', () => {
    it('should allow re-download of already downloaded release', async () => {
      mockQuotaRepo.findOrCreateBySubject.mockResolvedValue({
        userId,
        uniqueReleaseIds: [releaseId, 'release-2'],
      });

      const result = await service.checkFreeDownloadQuota(userSubject, releaseId);

      expect(result).toEqual({
        allowed: true,
        reason: 'ALREADY_DOWNLOADED',
        remainingQuota: 3,
        uniqueDownloads: 2,
      });
    });

    it('should allow new release when within quota', async () => {
      mockQuotaRepo.findOrCreateBySubject.mockResolvedValue({
        userId,
        uniqueReleaseIds: ['release-1', 'release-2'],
      });

      const result = await service.checkFreeDownloadQuota(userSubject, releaseId);

      expect(result).toEqual({
        allowed: true,
        reason: 'WITHIN_QUOTA',
        remainingQuota: 2,
        uniqueDownloads: 2,
      });
    });

    it('should deny new release when quota is exactly at limit', async () => {
      mockQuotaRepo.findOrCreateBySubject.mockResolvedValue({
        userId,
        uniqueReleaseIds: ['r1', 'r2', 'r3', 'r4', 'r5'],
      });

      const result = await service.checkFreeDownloadQuota(userSubject, releaseId);

      expect(result).toEqual({
        allowed: false,
        reason: 'QUOTA_EXCEEDED',
        remainingQuota: 0,
        uniqueDownloads: 5,
      });
    });

    it('should deny new release when quota exceeds limit', async () => {
      mockQuotaRepo.findOrCreateBySubject.mockResolvedValue({
        userId,
        uniqueReleaseIds: ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'],
      });

      const result = await service.checkFreeDownloadQuota(userSubject, releaseId);

      expect(result).toEqual({
        allowed: false,
        reason: 'QUOTA_EXCEEDED',
        remainingQuota: 0,
        uniqueDownloads: 6,
      });
    });

    it('should allow when user has no previous downloads', async () => {
      mockQuotaRepo.findOrCreateBySubject.mockResolvedValue({
        userId,
        uniqueReleaseIds: [],
      });

      const result = await service.checkFreeDownloadQuota(userSubject, releaseId);

      expect(result).toEqual({
        allowed: true,
        reason: 'WITHIN_QUOTA',
        remainingQuota: 4,
        uniqueDownloads: 0,
      });
    });

    it('should still allow re-download even when quota is at limit', async () => {
      mockQuotaRepo.findOrCreateBySubject.mockResolvedValue({
        userId,
        uniqueReleaseIds: ['r1', 'r2', 'r3', 'r4', releaseId],
      });

      const result = await service.checkFreeDownloadQuota(userSubject, releaseId);

      expect(result).toEqual({
        allowed: true,
        reason: 'ALREADY_DOWNLOADED',
        remainingQuota: 0,
        uniqueDownloads: 5,
      });
    });
  });

  describe('incrementQuota', () => {
    it('should call addUniqueRelease on the quota repo', async () => {
      mockQuotaRepo.addUniqueRelease.mockResolvedValue({
        userId,
        uniqueReleaseIds: [releaseId],
      });

      await service.incrementQuota(userSubject, releaseId);

      expect(mockQuotaRepo.addUniqueRelease).toHaveBeenCalledWith(userSubject, releaseId);
    });
  });

  describe('getQuotaStatus', () => {
    it('should return complete quota status', async () => {
      mockQuotaRepo.findOrCreateBySubject.mockResolvedValue({
        userId,
        uniqueReleaseIds: ['r1', 'r2', 'r3'],
      });

      const status = await service.getQuotaStatus(userSubject);

      expect(status).toEqual({
        remainingQuota: 2,
        uniqueDownloads: 3,
        maxQuota: 5,
        downloadedReleaseIds: ['r1', 'r2', 'r3'],
      });
    });

    it('should return full quota for new user', async () => {
      mockQuotaRepo.findOrCreateBySubject.mockResolvedValue({
        userId,
        uniqueReleaseIds: [],
      });

      const status = await service.getQuotaStatus(userSubject);

      expect(status).toEqual({
        remainingQuota: 5,
        uniqueDownloads: 0,
        maxQuota: 5,
        downloadedReleaseIds: [],
      });
    });

    it('should return zero remaining when quota is exceeded', async () => {
      mockQuotaRepo.findOrCreateBySubject.mockResolvedValue({
        userId,
        uniqueReleaseIds: ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'],
      });

      const status = await service.getQuotaStatus(userSubject);

      expect(status).toEqual({
        remainingQuota: 0,
        uniqueDownloads: 6,
        maxQuota: 5,
        downloadedReleaseIds: ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'],
      });
    });
  });

  describe('custom maxQuota', () => {
    it('should respect custom maxQuota value', async () => {
      const customService = new QuotaEnforcementService(
        mockQuotaRepo as unknown as UserDownloadQuotaRepository,
        3
      );

      mockQuotaRepo.findOrCreateBySubject.mockResolvedValue({
        userId,
        uniqueReleaseIds: ['r1', 'r2'],
      });

      const result = await customService.checkFreeDownloadQuota(userSubject, releaseId);

      expect(result).toEqual({
        allowed: true,
        reason: 'WITHIN_QUOTA',
        remainingQuota: 0,
        uniqueDownloads: 2,
      });
    });
  });

  describe('default repository', () => {
    it('should use default UserDownloadQuotaRepository when none provided', () => {
      const service = new QuotaEnforcementService();
      expect(service).toBeDefined();
    });
  });

  describe('guest subjects', () => {
    it('passes the guest subject through to the repository for quota checks', async () => {
      mockQuotaRepo.findOrCreateBySubject.mockResolvedValue({
        userId: null,
        visitorId: 'visitor-1',
        uniqueReleaseIds: [],
      });

      const result = await service.checkFreeDownloadQuota(guestSubject, releaseId);

      expect(mockQuotaRepo.findOrCreateBySubject).toHaveBeenCalledWith(guestSubject);
      expect(result).toEqual({
        allowed: true,
        reason: 'WITHIN_QUOTA',
        remainingQuota: 4,
        uniqueDownloads: 0,
      });
    });

    it('denies guests when their quota is exhausted', async () => {
      mockQuotaRepo.findOrCreateBySubject.mockResolvedValue({
        userId: null,
        visitorId: 'visitor-1',
        uniqueReleaseIds: ['r1', 'r2', 'r3', 'r4', 'r5'],
      });

      const result = await service.checkFreeDownloadQuota(guestSubject, releaseId);

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('QUOTA_EXCEEDED');
    });

    it('increments a guest quota by passing the subject through', async () => {
      mockQuotaRepo.addUniqueRelease.mockResolvedValue({
        visitorId: 'visitor-1',
        uniqueReleaseIds: [releaseId],
      });

      await service.incrementQuota(guestSubject, releaseId);

      expect(mockQuotaRepo.addUniqueRelease).toHaveBeenCalledWith(guestSubject, releaseId);
    });

    it('returns guest quota status', async () => {
      mockQuotaRepo.findOrCreateBySubject.mockResolvedValue({
        userId: null,
        visitorId: 'visitor-1',
        uniqueReleaseIds: ['r1'],
      });

      const status = await service.getQuotaStatus(guestSubject);

      expect(status).toEqual({
        remainingQuota: 4,
        uniqueDownloads: 1,
        maxQuota: 5,
        downloadedReleaseIds: ['r1'],
      });
    });
  });
});
