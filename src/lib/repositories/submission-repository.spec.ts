/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { prisma } from '@/lib/prisma';
import type { CreateSubmissionData, UpdateSubmissionData } from '@/lib/types/domain/submission';

import { submissionWhere } from './_internal/submission-where';
import { SubmissionRepository } from './submission-repository';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/prisma', () => {
  const submission = {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    updateMany: vi.fn(),
    deleteMany: vi.fn(),
  };
  const user = { update: vi.fn() };
  return {
    prisma: {
      submission,
      user,
      $transaction: vi.fn(
        async (
          fn: (tx: { submission: typeof submission; user: typeof user }) => Promise<unknown>
        ) => fn({ submission, user })
      ),
    },
  };
});

const OWNER_ID = 'a'.repeat(24);
const SUBMISSION_ID = 'c'.repeat(24);
const APPROVER_ID = 'd'.repeat(24);
const NOW = new Date('2026-11-11T12:00:00.000Z');
const LOADED = new Date('2026-11-10T09:00:00.000Z');
const CAP = 5;

const OWNER_INCLUDE = {
  owner: { select: { id: true, username: true, email: true, banned: true } },
};

const content = {
  title: 'Bus poem',
  category: 'WRITING',
  aboutHtml: '<p>about</p>',
  writingHtml: '<p>poem</p>',
  links: ['https://example.com'],
} as const;

const createData: CreateSubmissionData = {
  ...content,
  links: [...content.links],
  ownerId: OWNER_ID,
  listed: false,
  status: 'DRAFT',
  publishedAt: null,
};

const updateData: UpdateSubmissionData = {
  ...content,
  links: [...content.links],
  listed: true,
  status: 'AWAITING_APPROVAL',
  publishedAt: NOW,
};

const stored = { id: SUBMISSION_ID, ownerId: OWNER_ID, title: 'Bus poem', status: 'DRAFT' };

const target = (expected: 'DRAFT' | 'APPROVED') => ({
  id: SUBMISSION_ID,
  ownerId: OWNER_ID,
  expected,
});

describe('SubmissionRepository', () => {
  describe('createWithinCap', () => {
    it('creates the submission when the owner is under the cap', async () => {
      vi.mocked(prisma.submission.count).mockResolvedValueOnce(CAP - 1);
      vi.mocked(prisma.submission.create).mockResolvedValueOnce(stored as never);

      await expect(SubmissionRepository.createWithinCap(createData, CAP)).resolves.toEqual({
        status: 'written',
        submission: stored,
      });
      expect(vi.mocked(prisma.submission.create).mock.calls).toEqual([[{ data: createData }]]);
    });

    it('counts only the unapproved submissions of that owner', async () => {
      vi.mocked(prisma.submission.count).mockResolvedValueOnce(0);
      vi.mocked(prisma.submission.create).mockResolvedValueOnce(stored as never);

      await SubmissionRepository.createWithinCap(createData, CAP);

      expect(vi.mocked(prisma.submission.count).mock.calls).toEqual([
        [{ where: { ownerId: OWNER_ID, AND: [submissionWhere.unapproved] } }],
      ]);
    });

    it('writes nothing and answers full when the owner is at the cap', async () => {
      vi.mocked(prisma.submission.count).mockResolvedValueOnce(CAP);

      await expect(SubmissionRepository.createWithinCap(createData, CAP)).resolves.toEqual({
        status: 'full',
      });
      expect(prisma.submission.create).not.toHaveBeenCalled();
    });

    it('touches the owner row first, so concurrent creates conflict instead of both passing', async () => {
      vi.mocked(prisma.submission.count).mockResolvedValueOnce(0);
      vi.mocked(prisma.submission.create).mockResolvedValueOnce(stored as never);

      await SubmissionRepository.createWithinCap(createData, CAP);

      expect(vi.mocked(prisma.user.update).mock.calls).toEqual([
        [{ where: { id: OWNER_ID }, data: { updatedAt: expect.any(Date) } }],
      ]);
      expect(vi.mocked(prisma.user.update).mock.invocationCallOrder[0]).toBeLessThan(
        vi.mocked(prisma.submission.count).mock.invocationCallOrder[0] ?? 0
      );
    });
  });

  describe('findById', () => {
    it('reads the submission by id', async () => {
      vi.mocked(prisma.submission.findUnique).mockResolvedValueOnce(stored as never);

      await expect(SubmissionRepository.findById(SUBMISSION_ID)).resolves.toBe(stored);
      expect(vi.mocked(prisma.submission.findUnique).mock.calls).toEqual([
        [{ where: { id: SUBMISSION_ID } }],
      ]);
    });
  });

  describe('findByIdWithOwner', () => {
    it('reads the submission with the owner fields a page needs', async () => {
      vi.mocked(prisma.submission.findUnique).mockResolvedValueOnce(null);

      await expect(SubmissionRepository.findByIdWithOwner(SUBMISSION_ID)).resolves.toBeNull();
      expect(vi.mocked(prisma.submission.findUnique).mock.calls).toEqual([
        [{ where: { id: SUBMISSION_ID }, include: OWNER_INCLUDE }],
      ]);
    });
  });

  describe('findByOwner', () => {
    it("lists the owner's submissions, most recently changed first", async () => {
      vi.mocked(prisma.submission.findMany).mockResolvedValueOnce([stored] as never);

      await expect(SubmissionRepository.findByOwner(OWNER_ID)).resolves.toEqual([stored]);
      expect(vi.mocked(prisma.submission.findMany).mock.calls).toEqual([
        [{ where: { ownerId: OWNER_ID }, orderBy: { updatedAt: 'desc' } }],
      ]);
    });
  });

  describe('updateOwned', () => {
    it('writes only while the row is the owner’s and still in the expected state', async () => {
      vi.mocked(prisma.submission.updateMany).mockResolvedValueOnce({ count: 1 });
      vi.mocked(prisma.submission.findUnique).mockResolvedValueOnce(stored as never);

      await expect(SubmissionRepository.updateOwned(target('DRAFT'), updateData)).resolves.toEqual({
        status: 'written',
        submission: stored,
      });
      expect(vi.mocked(prisma.submission.updateMany).mock.calls).toEqual([
        [{ where: { id: SUBMISSION_ID, ownerId: OWNER_ID, status: 'DRAFT' }, data: updateData }],
      ]);
    });

    it('answers stale when no row matched', async () => {
      vi.mocked(prisma.submission.updateMany).mockResolvedValueOnce({ count: 0 });

      await expect(SubmissionRepository.updateOwned(target('DRAFT'), updateData)).resolves.toEqual({
        status: 'stale',
      });
      expect(prisma.submission.findUnique).not.toHaveBeenCalled();
    });

    it('does not count or touch the owner when no cap is given', async () => {
      vi.mocked(prisma.submission.updateMany).mockResolvedValueOnce({ count: 1 });
      vi.mocked(prisma.submission.findUnique).mockResolvedValueOnce(stored as never);

      await SubmissionRepository.updateOwned(target('DRAFT'), updateData);

      expect(prisma.submission.count).not.toHaveBeenCalled();
      expect(prisma.user.update).not.toHaveBeenCalled();
    });

    it('answers full, writing nothing, when a capped write finds the owner at the cap', async () => {
      vi.mocked(prisma.submission.count).mockResolvedValueOnce(CAP);

      await expect(
        SubmissionRepository.updateOwned(target('APPROVED'), updateData, CAP)
      ).resolves.toEqual({ status: 'full' });
      expect(prisma.submission.updateMany).not.toHaveBeenCalled();
    });

    it('writes a capped update when the owner is under the cap', async () => {
      vi.mocked(prisma.submission.count).mockResolvedValueOnce(CAP - 1);
      vi.mocked(prisma.submission.updateMany).mockResolvedValueOnce({ count: 1 });
      vi.mocked(prisma.submission.findUnique).mockResolvedValueOnce(stored as never);

      await expect(
        SubmissionRepository.updateOwned(target('APPROVED'), updateData, CAP)
      ).resolves.toEqual({ status: 'written', submission: stored });
      expect(vi.mocked(prisma.user.update).mock.calls).toEqual([
        [{ where: { id: OWNER_ID }, data: { updatedAt: expect.any(Date) } }],
      ]);
    });
  });

  describe('setListed', () => {
    it('switches only an approved submission of that owner', async () => {
      vi.mocked(prisma.submission.updateMany).mockResolvedValueOnce({ count: 1 });
      vi.mocked(prisma.submission.findUnique).mockResolvedValueOnce(stored as never);

      await expect(SubmissionRepository.setListed(SUBMISSION_ID, OWNER_ID, true)).resolves.toBe(
        stored
      );
      expect(vi.mocked(prisma.submission.updateMany).mock.calls).toEqual([
        [
          {
            where: { id: SUBMISSION_ID, ownerId: OWNER_ID, status: 'APPROVED' },
            data: { listed: true },
          },
        ],
      ]);
    });

    it('answers null when nothing matched', async () => {
      vi.mocked(prisma.submission.updateMany).mockResolvedValueOnce({ count: 0 });

      await expect(
        SubmissionRepository.setListed(SUBMISSION_ID, OWNER_ID, false)
      ).resolves.toBeNull();
    });
  });

  describe('decide', () => {
    const approval = {
      status: 'APPROVED',
      approvedAt: NOW,
      approvedBy: APPROVER_ID,
      firstApprovedAt: NOW,
    } as const;

    it('writes the decision only on the content the approver loaded', async () => {
      vi.mocked(prisma.submission.updateMany).mockResolvedValueOnce({ count: 1 });
      vi.mocked(prisma.submission.findUnique).mockResolvedValueOnce(stored as never);

      await expect(
        SubmissionRepository.decide(
          SUBMISSION_ID,
          { statuses: ['AWAITING_APPROVAL'], updatedAt: LOADED },
          approval
        )
      ).resolves.toBe(stored);
      expect(vi.mocked(prisma.submission.updateMany).mock.calls).toEqual([
        [
          {
            where: {
              id: SUBMISSION_ID,
              status: { in: ['AWAITING_APPROVAL'] },
              updatedAt: LOADED,
            },
            data: approval,
          },
        ],
      ]);
    });

    it('answers null when the submission changed since it was loaded', async () => {
      vi.mocked(prisma.submission.updateMany).mockResolvedValueOnce({ count: 0 });

      await expect(
        SubmissionRepository.decide(
          SUBMISSION_ID,
          { statuses: ['AWAITING_APPROVAL', 'APPROVED'], updatedAt: LOADED },
          {
            status: 'REJECTED',
            rejectedAt: NOW,
            rejectedBy: APPROVER_ID,
            rejectionReason: 'Not your recording.',
          }
        )
      ).resolves.toBeNull();
    });
  });

  describe('deleteOwned', () => {
    it('deletes the owner’s submission and says so', async () => {
      vi.mocked(prisma.submission.deleteMany).mockResolvedValueOnce({ count: 1 });

      await expect(SubmissionRepository.deleteOwned(SUBMISSION_ID, OWNER_ID)).resolves.toBe(true);
      expect(vi.mocked(prisma.submission.deleteMany).mock.calls).toEqual([
        [{ where: { id: SUBMISSION_ID, ownerId: OWNER_ID } }],
      ]);
    });

    it('answers false when nothing matched', async () => {
      vi.mocked(prisma.submission.deleteMany).mockResolvedValueOnce({ count: 0 });

      await expect(SubmissionRepository.deleteOwned(SUBMISSION_ID, OWNER_ID)).resolves.toBe(false);
    });
  });

  describe('listByStatus', () => {
    it.each([
      ['AWAITING_APPROVAL', { publishedAt: 'asc' }],
      ['APPROVED', { approvedAt: 'desc' }],
      ['REJECTED', { rejectedAt: 'desc' }],
      ['DRAFT', { updatedAt: 'desc' }],
    ] as const)(
      'lists %s submissions with their owners, in queue order',
      async (status, orderBy) => {
        vi.mocked(prisma.submission.findMany).mockResolvedValueOnce([]);
        vi.mocked(prisma.submission.count).mockResolvedValueOnce(7);

        await expect(
          SubmissionRepository.listByStatus(status, { skip: 20, take: 10 })
        ).resolves.toEqual({ submissions: [], total: 7 });
        expect(vi.mocked(prisma.submission.findMany).mock.calls).toEqual([
          [{ where: { status }, include: OWNER_INCLUDE, orderBy, skip: 20, take: 10 }],
        ]);
        expect(vi.mocked(prisma.submission.count).mock.calls).toEqual([[{ where: { status } }]]);
      }
    );
  });

  describe('countAwaitingBefore', () => {
    it('counts the submissions awaiting approval that were published earlier', async () => {
      vi.mocked(prisma.submission.count).mockResolvedValueOnce(3);

      await expect(SubmissionRepository.countAwaitingBefore(NOW)).resolves.toBe(3);
      expect(vi.mocked(prisma.submission.count).mock.calls).toEqual([
        [{ where: { ...submissionWhere.awaitingApproval, publishedAt: { lt: NOW } } }],
      ]);
    });
  });

  describe('countAwaiting', () => {
    it('counts every submission awaiting approval', async () => {
      vi.mocked(prisma.submission.count).mockResolvedValueOnce(4);

      await expect(SubmissionRepository.countAwaiting()).resolves.toBe(4);
      expect(vi.mocked(prisma.submission.count).mock.calls).toEqual([
        [{ where: submissionWhere.awaitingApproval }],
      ]);
    });
  });
});
