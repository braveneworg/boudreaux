/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { prisma } from '@/lib/prisma';

import { ChatRateLimitLogRepository } from './chat-rate-limit-log-repository';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    chatRateLimitLog: {
      create: vi.fn(),
      count: vi.fn(),
    },
  },
}));

describe('ChatRateLimitLogRepository', () => {
  describe('logBreach', () => {
    it('appends a single breach record', async () => {
      vi.mocked(prisma.chatRateLimitLog.create).mockResolvedValue({ id: 'log-1' } as never);

      await ChatRateLimitLogRepository.logBreach({
        fingerprint: 'fp-abc',
        ipAddress: '203.0.113.5',
      });

      expect(prisma.chatRateLimitLog.create).toHaveBeenCalledWith({
        data: { fingerprint: 'fp-abc', ipAddress: '203.0.113.5' },
      });
    });
  });

  describe('countByFingerprintSince', () => {
    it('counts breaches for a fingerprint within a rolling window', async () => {
      vi.mocked(prisma.chatRateLimitLog.count).mockResolvedValue(7);
      const since = new Date('2026-05-01T00:00:00Z');

      const result = await ChatRateLimitLogRepository.countByFingerprintSince('fp-abc', since);

      expect(prisma.chatRateLimitLog.count).toHaveBeenCalledWith({
        where: {
          fingerprint: 'fp-abc',
          attemptedAt: { gte: since },
        },
      });
      expect(result).toBe(7);
    });
  });
});
