/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { prisma } from '@/lib/prisma';
import type { CreateSubmissionReportData } from '@/lib/types/domain/submission-report';

import { submissionReportWhere } from './_internal/submission-report-where';
import { SubmissionReportRepository } from './submission-report-repository';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    submissionReport: {
      create: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
      findUnique: vi.fn(),
      updateMany: vi.fn(),
      groupBy: vi.fn(),
    },
  },
}));

const SUBMISSION_ID = 'c'.repeat(24);
const REPORT_ID = 'e'.repeat(24);
const APPROVER_ID = 'd'.repeat(24);
const OWNER_ID = 'a'.repeat(24);
const NOW = new Date('2026-11-12T12:00:00.000Z');
const FILED = new Date('2026-11-10T09:00:00.000Z');

const reports = vi.mocked(prisma.submissionReport);

const createData: CreateSubmissionReportData = {
  submissionId: SUBMISSION_ID,
  reason: 'NOT_THEIRS',
  note: 'That is my photo.',
  contactEmail: 'wronged@example.com',
};

const stored = { id: REPORT_ID, ...createData, handled: false, createdAt: FILED };

// A queued answer a failing case never reached must not answer the next one.
beforeEach(() => {
  reports.create.mockReset();
  reports.count.mockReset();
  reports.findMany.mockReset();
  reports.findUnique.mockReset();
  reports.updateMany.mockReset();
  reports.groupBy.mockReset();
});

describe('SubmissionReportRepository', () => {
  describe('create', () => {
    it('stores exactly what it is given and returns the stored report', async () => {
      reports.create.mockResolvedValueOnce(stored as never);

      const created = await SubmissionReportRepository.create(createData);

      expect(reports.create.mock.calls).toEqual([[{ data: createData }]]);
      expect(created).toBe(stored);
    });
  });

  describe('countOpenFor', () => {
    it('counts the open reports on one submission', async () => {
      reports.count.mockResolvedValueOnce(4);

      const count = await SubmissionReportRepository.countOpenFor(SUBMISSION_ID);

      expect(reports.count.mock.calls).toEqual([
        [{ where: { submissionId: SUBMISSION_ID, ...submissionReportWhere.open } }],
      ]);
      expect(count).toBe(4);
    });
  });

  describe('countOpen', () => {
    it('counts every open report', async () => {
      reports.count.mockResolvedValueOnce(7);

      const count = await SubmissionReportRepository.countOpen();

      expect(reports.count.mock.calls).toEqual([[{ where: submissionReportWhere.open }]]);
      expect(count).toBe(7);
    });
  });

  describe('listBySubmission', () => {
    it('reads a submission’s reports, open first and newest first within each', async () => {
      reports.findMany.mockResolvedValueOnce([stored] as never);

      const listed = await SubmissionReportRepository.listBySubmission(SUBMISSION_ID);

      expect(reports.findMany.mock.calls).toEqual([
        [
          {
            where: { submissionId: SUBMISSION_ID },
            orderBy: [{ handled: 'asc' }, { createdAt: 'desc' }],
          },
        ],
      ]);
      expect(listed).toEqual([stored]);
    });
  });

  describe('findTarget', () => {
    it('reads a report with its submission’s owner and nothing a reporter typed', async () => {
      const target = {
        id: REPORT_ID,
        handled: false,
        submissionId: SUBMISSION_ID,
        submission: { ownerId: OWNER_ID },
      };
      reports.findUnique.mockResolvedValueOnce(target as never);

      const found = await SubmissionReportRepository.findTarget(REPORT_ID);

      expect(reports.findUnique.mock.calls).toEqual([
        [
          {
            where: { id: REPORT_ID },
            select: {
              id: true,
              handled: true,
              submissionId: true,
              submission: { select: { ownerId: true } },
            },
          },
        ],
      ]);
      expect(found).toBe(target);
    });
  });

  describe('markHandled', () => {
    it('marks an open report handled, with who and when', async () => {
      reports.updateMany.mockResolvedValueOnce({ count: 1 });

      const handled = await SubmissionReportRepository.markHandled(REPORT_ID, {
        by: APPROVER_ID,
        at: NOW,
      });

      expect(reports.updateMany.mock.calls).toEqual([
        [
          {
            where: { id: REPORT_ID, ...submissionReportWhere.open },
            data: { handled: true, handledAt: NOW, handledBy: APPROVER_ID },
          },
        ],
      ]);
      expect(handled).toBe(true);
    });

    it('says so when the report was handled already', async () => {
      reports.updateMany.mockResolvedValueOnce({ count: 0 });

      const handled = await SubmissionReportRepository.markHandled(REPORT_ID, {
        by: APPROVER_ID,
        at: NOW,
      });

      expect(handled).toBe(false);
    });
  });

  describe('markAllHandledFor', () => {
    it('marks every open report on a submission handled and counts them', async () => {
      reports.updateMany.mockResolvedValueOnce({ count: 3 });

      const count = await SubmissionReportRepository.markAllHandledFor(SUBMISSION_ID, {
        by: APPROVER_ID,
        at: NOW,
      });

      expect(reports.updateMany.mock.calls).toEqual([
        [
          {
            where: { submissionId: SUBMISSION_ID, ...submissionReportWhere.open },
            data: { handled: true, handledAt: NOW, handledBy: APPROVER_ID },
          },
        ],
      ]);
      expect(count).toBe(3);
    });
  });

  describe('listReportedSubmissions', () => {
    const group = { submissionId: SUBMISSION_ID, _count: { _all: 2 }, _min: { createdAt: FILED } };

    it('groups the open reports by submission, oldest open report first, one page at a time', async () => {
      reports.groupBy
        .mockResolvedValueOnce([group] as never)
        .mockResolvedValueOnce([{ submissionId: SUBMISSION_ID }] as never);

      await SubmissionReportRepository.listReportedSubmissions({ skip: 25, take: 25 });

      expect(reports.groupBy.mock.calls).toEqual([
        [
          {
            by: ['submissionId'],
            where: submissionReportWhere.open,
            _count: { _all: true },
            _min: { createdAt: true },
            orderBy: [{ _min: { createdAt: 'asc' } }, { submissionId: 'asc' }],
            skip: 25,
            take: 25,
          },
        ],
        [{ by: ['submissionId'], where: submissionReportWhere.open }],
      ]);
    });

    it('returns each submission’s open count and oldest report, and the total across pages', async () => {
      reports.groupBy
        .mockResolvedValueOnce([group] as never)
        .mockResolvedValueOnce([
          { submissionId: SUBMISSION_ID },
          { submissionId: 'f'.repeat(24) },
        ] as never);

      const page = await SubmissionReportRepository.listReportedSubmissions({ skip: 0, take: 1 });

      expect(page).toEqual({
        groups: [{ submissionId: SUBMISSION_ID, openReports: 2, oldestReportAt: FILED }],
        total: 2,
      });
    });

    it('leaves one owner’s submissions out of the page and the total when asked to', async () => {
      reports.groupBy.mockResolvedValueOnce([] as never).mockResolvedValueOnce([] as never);
      const where = {
        ...submissionReportWhere.open,
        submission: { is: { ownerId: { not: OWNER_ID } } },
      };

      await SubmissionReportRepository.listReportedSubmissions({
        skip: 0,
        take: 25,
        exceptOwnerId: OWNER_ID,
      });

      expect(reports.groupBy.mock.calls.map(([args]) => args.where)).toEqual([where, where]);
    });

    it('drops a group the database returned without a date', async () => {
      reports.groupBy
        .mockResolvedValueOnce([{ ...group, _min: { createdAt: null } }] as never)
        .mockResolvedValueOnce([{ submissionId: SUBMISSION_ID }] as never);

      const page = await SubmissionReportRepository.listReportedSubmissions({ skip: 0, take: 25 });

      expect(page.groups).toEqual([]);
    });
  });

  describe('countReportedSubmissions', () => {
    it('counts the submissions that hold an open report', async () => {
      reports.groupBy.mockResolvedValueOnce([
        { submissionId: SUBMISSION_ID },
        { submissionId: 'f'.repeat(24) },
      ] as never);

      const count = await SubmissionReportRepository.countReportedSubmissions();

      expect(reports.groupBy.mock.calls).toEqual([
        [{ by: ['submissionId'], where: submissionReportWhere.open }],
      ]);
      expect(count).toBe(2);
    });

    it('leaves one owner’s submissions out of the count when asked to', async () => {
      reports.groupBy.mockResolvedValueOnce([] as never);

      await SubmissionReportRepository.countReportedSubmissions(OWNER_ID);

      expect(reports.groupBy.mock.calls.map(([args]) => args.where)).toEqual([
        { ...submissionReportWhere.open, submission: { is: { ownerId: { not: OWNER_ID } } } },
      ]);
    });
  });

  describe('eraseContactsFiledBefore', () => {
    it('erases only the contact email, on the reports the fragment matches', async () => {
      reports.updateMany.mockResolvedValueOnce({ count: 2 });

      const erased = await SubmissionReportRepository.eraseContactsFiledBefore(FILED);

      expect(reports.updateMany.mock.calls).toEqual([
        [
          {
            where: submissionReportWhere.contactFiledBefore(FILED),
            data: { contactEmail: null },
          },
        ],
      ]);
      expect(erased).toBe(2);
    });
  });
});
