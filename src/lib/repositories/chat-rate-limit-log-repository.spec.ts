/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import { prisma } from '@/lib/prisma';

import {
  ChatRateLimitLogRepository,
  RATE_LIMIT_LOG_RETENTION_MS,
} from './chat-rate-limit-log-repository';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    chatRateLimitLog: {
      create: vi.fn(),
      count: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

describe('ChatRateLimitLogRepository', () => {
  describe('logBreach', () => {
    it('appends a single breach record', async () => {
      vi.mocked(prisma.chatRateLimitLog.create).mockResolvedValue({ id: 'log-1' } as never);
      vi.mocked(prisma.chatRateLimitLog.deleteMany).mockResolvedValue({ count: 0 } as never);

      await ChatRateLimitLogRepository.logBreach({
        fingerprint: 'fp-abc',
        ipAddress: '203.0.113.5',
      });

      expect(prisma.chatRateLimitLog.create).toHaveBeenCalledWith({
        data: { fingerprint: 'fp-abc', ipAddress: '203.0.113.5' },
      });
    });

    it('prunes the fingerprint rows older than the retention window', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-01T00:00:00Z'));
      vi.mocked(prisma.chatRateLimitLog.create).mockResolvedValue({ id: 'log-1' } as never);
      vi.mocked(prisma.chatRateLimitLog.deleteMany).mockResolvedValue({ count: 3 } as never);

      await ChatRateLimitLogRepository.logBreach({
        fingerprint: 'fp-abc',
        ipAddress: '203.0.113.5',
      });

      expect(prisma.chatRateLimitLog.deleteMany).toHaveBeenCalledWith({
        where: {
          fingerprint: 'fp-abc',
          attemptedAt: {
            lt: new Date(Date.parse('2026-06-01T00:00:00Z') - RATE_LIMIT_LOG_RETENTION_MS),
          },
        },
      });

      vi.useRealTimers();
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
