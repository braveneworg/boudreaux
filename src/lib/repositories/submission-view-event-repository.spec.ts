/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { prisma } from '@/lib/prisma';
import { DataError } from '@/lib/types/domain/errors';

import { SubmissionViewEventRepository } from './submission-view-event-repository';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    submissionViewEvent: {
      create: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

const SUBMISSION_ID = 'c'.repeat(24);
const OTHER_ID = 'd'.repeat(24);
const VIEW_KEY = 'f'.repeat(64);
const NOW = new Date('2026-11-14T12:00:00.000Z');
const CUTOFF = new Date('2026-10-15T12:00:00.000Z');

const events = vi.mocked(prisma.submissionViewEvent);

const data = { submissionId: SUBMISSION_ID, viewKey: VIEW_KEY, viewedAt: NOW };

// A queued answer a failing case never reached must not answer the next one.
beforeEach(() => {
  events.create.mockReset();
  events.count.mockReset();
  events.groupBy.mockReset();
  events.deleteMany.mockReset();
});

describe('SubmissionViewEventRepository', () => {
  describe('record', () => {
    it('stores exactly the submission, the key and the time', async () => {
      events.create.mockResolvedValueOnce({ id: 'e'.repeat(24) } as never);

      await SubmissionViewEventRepository.record(data);

      expect(events.create.mock.calls).toEqual([[{ data, select: { id: true } }]]);
    });

    it('says it wrote a new key', async () => {
      events.create.mockResolvedValueOnce({ id: 'e'.repeat(24) } as never);

      await expect(SubmissionViewEventRepository.record(data)).resolves.toBe(true);
    });

    it('says it did not write a key that is already held', async () => {
      events.create.mockRejectedValueOnce(new DataError('DUPLICATE', 'Unique constraint failed'));

      await expect(SubmissionViewEventRepository.record(data)).resolves.toBe(false);
    });

    it('says so too when the duplicate was raised by another copy of the error class', async () => {
      // On the dev server the Prisma client can be built by another route's
      // copy of the module, and its errors are then no instance of ours.
      events.create.mockRejectedValueOnce(
        Object.assign(new Error('Unique constraint failed'), {
          name: 'DataError',
          code: 'DUPLICATE',
        })
      );

      await expect(SubmissionViewEventRepository.record(data)).resolves.toBe(false);
    });

    it('passes on any other failure', async () => {
      const down = new DataError('UNAVAILABLE', 'Database is down');
      events.create.mockRejectedValueOnce(down);

      await expect(SubmissionViewEventRepository.record(data)).rejects.toBe(down);
    });

    it('passes on a failure that is not a data error', async () => {
      const odd = new Error('Something else');
      events.create.mockRejectedValueOnce(odd);

      await expect(SubmissionViewEventRepository.record(data)).rejects.toBe(odd);
    });
  });

  describe('exists', () => {
    it('asks for the key alone', async () => {
      events.count.mockResolvedValueOnce(1);

      await SubmissionViewEventRepository.exists(VIEW_KEY);

      expect(events.count.mock.calls).toEqual([[{ where: { viewKey: VIEW_KEY } }]]);
    });

    it('is true when the key is held', async () => {
      events.count.mockResolvedValueOnce(1);

      await expect(SubmissionViewEventRepository.exists(VIEW_KEY)).resolves.toBe(true);
    });

    it('is false when the key is not held', async () => {
      events.count.mockResolvedValueOnce(0);

      await expect(SubmissionViewEventRepository.exists(VIEW_KEY)).resolves.toBe(false);
    });
  });

  describe('countsSince', () => {
    it('groups the rows from the cutoff on by submission, keeping those at the minimum', async () => {
      events.groupBy.mockResolvedValueOnce([] as never);

      await SubmissionViewEventRepository.countsSince(CUTOFF, 5);

      expect(events.groupBy.mock.calls).toEqual([
        [
          {
            by: ['submissionId'],
            where: { viewedAt: { gte: CUTOFF } },
            _count: { _all: true },
            having: { submissionId: { _count: { gte: 5 } } },
          },
        ],
      ]);
    });

    it('returns each submission with its count', async () => {
      events.groupBy.mockResolvedValueOnce([
        { submissionId: SUBMISSION_ID, _count: { _all: 7 } },
        { submissionId: OTHER_ID, _count: { _all: 5 } },
      ] as never);

      await expect(SubmissionViewEventRepository.countsSince(CUTOFF, 5)).resolves.toEqual([
        { submissionId: SUBMISSION_ID, views: 7 },
        { submissionId: OTHER_ID, views: 5 },
      ]);
    });
  });

  describe('deleteBefore', () => {
    it('deletes the rows from before the cutoff and no others', async () => {
      events.deleteMany.mockResolvedValueOnce({ count: 0 });

      await SubmissionViewEventRepository.deleteBefore(CUTOFF);

      expect(events.deleteMany.mock.calls).toEqual([[{ where: { viewedAt: { lt: CUTOFF } } }]]);
    });

    it('returns how many it deleted', async () => {
      events.deleteMany.mockResolvedValueOnce({ count: 12 });

      await expect(SubmissionViewEventRepository.deleteBefore(CUTOFF)).resolves.toBe(12);
    });
  });
});
