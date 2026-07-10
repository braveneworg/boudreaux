/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { Prisma } from '@prisma/client';

import { prisma } from '@/lib/prisma';
import type { SmsBlastRecord } from '@/lib/types/domain';
import { DataError } from '@/lib/types/domain';

import { SmsBlastRepository } from './sms-blast-repository';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/prisma', () => ({
  prisma: {
    smsBlast: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

const mockCreate = vi.mocked(prisma.smsBlast.create);
const mockFindMany = vi.mocked(prisma.smsBlast.findMany);

const mockBlast: SmsBlastRecord = {
  id: 'blast-1',
  message: 'Test announcement to all subscribers',
  sentById: 'user-1',
  sentByEmail: 'admin@example.com',
  recipientCount: 10,
  sentCount: 9,
  failedCount: 1,
  createdAt: new Date('2026-07-01T00:00:00.000Z'),
};

const mockCreateData = {
  message: 'Test announcement to all subscribers',
  sentById: 'user-1',
  sentByEmail: 'admin@example.com',
  recipientCount: 10,
  sentCount: 9,
  failedCount: 1,
};

describe('SmsBlastRepository', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockFindMany.mockReset();
  });

  describe('create', () => {
    it('passes create data through and returns the created row', async () => {
      mockCreate.mockResolvedValue(mockBlast);

      const result = await SmsBlastRepository.create(mockCreateData);

      expect(result).toEqual(mockBlast);
      expect(mockCreate).toHaveBeenCalledWith({ data: mockCreateData });
    });

    it('wraps a Prisma error as a DataError', async () => {
      mockCreate.mockRejectedValue(new Error('boom'));

      await expect(SmsBlastRepository.create(mockCreateData)).rejects.toBeInstanceOf(DataError);
    });
  });

  describe('findRecent', () => {
    it('returns blasts ordered by createdAt descending with the given take', async () => {
      mockFindMany.mockResolvedValue([mockBlast]);

      const result = await SmsBlastRepository.findRecent(5);

      expect(result).toEqual([mockBlast]);
      expect(mockFindMany).toHaveBeenCalledWith({
        orderBy: { createdAt: 'desc' },
        take: 5,
      });
    });

    it('forwards different take values', async () => {
      mockFindMany.mockResolvedValue([]);

      await SmsBlastRepository.findRecent(20);

      expect(mockFindMany).toHaveBeenCalledWith(expect.objectContaining({ take: 20 }));
    });

    it('wraps a Prisma P2025 error as a NOT_FOUND DataError', async () => {
      mockFindMany.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Record not found', {
          code: 'P2025',
          clientVersion: '0.0.0',
        })
      );

      await expect(SmsBlastRepository.findRecent(5)).rejects.toMatchObject({
        name: 'DataError',
        code: 'NOT_FOUND',
      });
    });

    it('throws a DataError instance on generic failure', async () => {
      mockFindMany.mockRejectedValue(new Error('db gone'));

      await expect(SmsBlastRepository.findRecent(5)).rejects.toBeInstanceOf(DataError);
    });
  });
});
