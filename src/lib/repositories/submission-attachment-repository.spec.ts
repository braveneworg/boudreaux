/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { prisma } from '@/lib/prisma';
import type {
  CreateAttachmentData,
  ReencodedAttachmentData,
} from '@/lib/types/domain/submission-attachment';

import { SubmissionAttachmentRepository } from './submission-attachment-repository';

vi.mock('server-only', () => ({}));

vi.mock('@/lib/prisma', () => {
  const submissionAttachment = {
    create: vi.fn(),
    findUnique: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    delete: vi.fn(),
  };
  const submission = { update: vi.fn() };
  return {
    prisma: {
      submissionAttachment,
      submission,
      $transaction: vi.fn(
        async (
          fn: (tx: {
            submissionAttachment: typeof submissionAttachment;
            submission: typeof submission;
          }) => Promise<unknown>
        ) => fn({ submissionAttachment, submission })
      ),
    },
  };
});

const SUBMISSION_ID = 'a'.repeat(24);
const ATTACHMENT_ID = 'b'.repeat(24);
const NOW = new Date('2026-11-11T12:00:00.000Z');
const CAP = 10;
const COPY_PREFIX = `copies/${SUBMISSION_ID}/${ATTACHMENT_ID}/`;

const createData: CreateAttachmentData = {
  submissionId: SUBMISSION_ID,
  kind: 'IMAGE',
  fileName: 'show.jpg',
  uploadKey: `uploads/${SUBMISSION_ID}/3f0c9a52-6a1d-4d1e-9a51-0c1d2e3f4a5b`,
  uploadBytes: 1234,
  uploadType: 'image/jpeg',
};

const reencoded: ReencodedAttachmentData = {
  kind: 'VIDEO',
  copyKey: `${COPY_PREFIX}copy.mp4`,
  cardKey: `${COPY_PREFIX}card.webp`,
  posterKey: `${COPY_PREFIX}poster.jpg`,
  copyBytes: 5000,
  width: 1280,
  height: 720,
  durationSeconds: 42,
};

const stored = { id: ATTACHMENT_ID, submissionId: SUBMISSION_ID, kind: 'IMAGE' };

const attachments = vi.mocked(prisma.submissionAttachment);
const submissions = vi.mocked(prisma.submission);

/** The order mocked calls ran in, across mocks. */
const order = (...mocks: Array<{ mock: { invocationCallOrder: number[] } }>): number[] =>
  mocks.map(({ mock }) => mock.invocationCallOrder.at(0) ?? -1);

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  attachments.create.mockReset();
  attachments.findUnique.mockReset();
  attachments.findMany.mockReset();
  attachments.count.mockReset();
  attachments.update.mockReset();
  attachments.updateMany.mockReset();
  attachments.delete.mockReset();
  submissions.update.mockReset();
  attachments.count.mockResolvedValue(0);
  attachments.create.mockResolvedValue(stored as never);
  attachments.update.mockResolvedValue(stored as never);
  attachments.updateMany.mockResolvedValue({ count: 1 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('SubmissionAttachmentRepository', () => {
  describe('createWithinCap', () => {
    it('creates the attachment under the cap', async () => {
      attachments.count.mockResolvedValue(CAP - 1);

      const result = await SubmissionAttachmentRepository.createWithinCap(createData, CAP);

      expect(result).toEqual({ status: 'created', attachment: stored });
    });

    it('stores what it was given', async () => {
      await SubmissionAttachmentRepository.createWithinCap(createData, CAP);

      expect(attachments.create).toHaveBeenCalledWith({ data: createData });
    });

    it('answers full at the cap', async () => {
      attachments.count.mockResolvedValue(CAP);

      const result = await SubmissionAttachmentRepository.createWithinCap(createData, CAP);

      expect(result).toEqual({ status: 'full' });
    });

    it('creates nothing at the cap', async () => {
      attachments.count.mockResolvedValue(CAP);

      await SubmissionAttachmentRepository.createWithinCap(createData, CAP);

      expect(attachments.create).not.toHaveBeenCalled();
    });

    it('counts only that submission', async () => {
      await SubmissionAttachmentRepository.createWithinCap(createData, CAP);

      expect(attachments.count).toHaveBeenCalledWith({ where: { submissionId: SUBMISSION_ID } });
    });

    it('writes the submission before it counts, so concurrent creates conflict', async () => {
      await SubmissionAttachmentRepository.createWithinCap(createData, CAP);

      const [touched, counted] = order(submissions.update, attachments.count);
      expect(touched).toBeLessThan(counted ?? -1);
    });

    it('moves the submission on, so a decision loaded before it is stale', async () => {
      await SubmissionAttachmentRepository.createWithinCap(createData, CAP);

      expect(submissions.update).toHaveBeenCalledWith({
        where: { id: SUBMISSION_ID },
        data: { updatedAt: NOW },
      });
    });
  });

  describe('findById', () => {
    it('finds by id', async () => {
      attachments.findUnique.mockResolvedValue(stored as never);

      await expect(SubmissionAttachmentRepository.findById(ATTACHMENT_ID)).resolves.toBe(stored);
    });
  });

  describe('findWithSubmission', () => {
    it('reads the owner and state of the submission it belongs to', async () => {
      await SubmissionAttachmentRepository.findWithSubmission(ATTACHMENT_ID);

      expect(attachments.findUnique).toHaveBeenCalledWith({
        where: { id: ATTACHMENT_ID },
        include: { submission: { select: { id: true, ownerId: true, status: true } } },
      });
    });
  });

  describe('listBySubmission', () => {
    it('reads in upload order', async () => {
      attachments.findMany.mockResolvedValue([]);

      await SubmissionAttachmentRepository.listBySubmission(SUBMISSION_ID);

      expect(attachments.findMany).toHaveBeenCalledWith({
        where: { submissionId: SUBMISSION_ID },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
    });
  });

  describe('listBySubmissions', () => {
    it('reads every attachment of the given submissions, in upload order', async () => {
      attachments.findMany.mockResolvedValue([]);

      await SubmissionAttachmentRepository.listBySubmissions([SUBMISSION_ID]);

      expect(attachments.findMany).toHaveBeenCalledWith({
        where: { submissionId: { in: [SUBMISSION_ID] } },
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      });
    });

    it('asks nothing for no submissions', async () => {
      await expect(SubmissionAttachmentRepository.listBySubmissions([])).resolves.toEqual([]);
      expect(attachments.findMany).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes the attachment', async () => {
      await SubmissionAttachmentRepository.remove(ATTACHMENT_ID, SUBMISSION_ID);

      expect(attachments.delete).toHaveBeenCalledWith({ where: { id: ATTACHMENT_ID } });
    });

    it('moves the submission on in the same transaction', async () => {
      await SubmissionAttachmentRepository.remove(ATTACHMENT_ID, SUBMISSION_ID);

      expect(submissions.update).toHaveBeenCalledWith({
        where: { id: SUBMISSION_ID },
        data: { updatedAt: NOW },
      });
    });
  });

  describe('markReencodePending', () => {
    it('marks the job pending and records its start in the same write', async () => {
      await SubmissionAttachmentRepository.markReencodePending(ATTACHMENT_ID, NOW);

      expect(attachments.update).toHaveBeenCalledWith({
        where: { id: ATTACHMENT_ID },
        data: {
          reencodeStatus: 'pending',
          reencodeStartedAt: NOW,
          reencodeError: null,
          reencodeProgress: null,
        },
      });
    });
  });

  describe('beginReencodeRun', () => {
    it('is true when this caller began the run', async () => {
      await expect(
        SubmissionAttachmentRepository.beginReencodeRun(ATTACHMENT_ID, NOW)
      ).resolves.toBe(true);
    });

    it('is false when another run is already processing', async () => {
      attachments.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        SubmissionAttachmentRepository.beginReencodeRun(ATTACHMENT_ID, NOW)
      ).resolves.toBe(false);
    });

    it('flips to processing and stamps the start', async () => {
      await SubmissionAttachmentRepository.beginReencodeRun(ATTACHMENT_ID, NOW);

      expect(attachments.updateMany.mock.calls.at(0)?.at(0)?.data).toEqual({
        reencodeStatus: 'processing',
        reencodeStartedAt: NOW,
        reencodeError: null,
      });
    });

    it('is gated on the attachment and on the runner gate', async () => {
      await SubmissionAttachmentRepository.beginReencodeRun(ATTACHMENT_ID, NOW);

      expect(attachments.updateMany.mock.calls.at(0)?.at(0)?.where).toMatchObject({
        id: ATTACHMENT_ID,
        AND: [{ OR: expect.arrayContaining([{ reencodeStatus: { not: 'processing' } }]) }],
      });
    });
  });

  describe('setReencodeJobToken', () => {
    it('stores the token', async () => {
      await SubmissionAttachmentRepository.setReencodeJobToken(ATTACHMENT_ID, 'token');

      expect(attachments.update).toHaveBeenCalledWith({
        where: { id: ATTACHMENT_ID },
        data: { reencodeJobToken: 'token' },
      });
    });
  });

  describe('claimReencodeJobToken', () => {
    it('claims a matching token on a processing job, once', async () => {
      await SubmissionAttachmentRepository.claimReencodeJobToken(ATTACHMENT_ID, 'token');

      expect(attachments.updateMany).toHaveBeenCalledWith({
        where: { id: ATTACHMENT_ID, reencodeJobToken: 'token', reencodeStatus: 'processing' },
        data: { reencodeJobToken: null },
      });
    });

    it('is true for the caller that won the claim', async () => {
      await expect(
        SubmissionAttachmentRepository.claimReencodeJobToken(ATTACHMENT_ID, 'token')
      ).resolves.toBe(true);
    });

    it('is false for a spent or wrong token', async () => {
      attachments.updateMany.mockResolvedValue({ count: 0 });

      await expect(
        SubmissionAttachmentRepository.claimReencodeJobToken(ATTACHMENT_ID, 'token')
      ).resolves.toBe(false);
    });
  });

  describe('setReencodeProgress', () => {
    it('stores the checkpoint', async () => {
      const progress = { stage: 'encoding', percent: 40, at: NOW.toISOString() };

      await SubmissionAttachmentRepository.setReencodeProgress(ATTACHMENT_ID, progress);

      expect(attachments.update).toHaveBeenCalledWith({
        where: { id: ATTACHMENT_ID },
        data: { reencodeProgress: progress },
      });
    });
  });

  describe('recordReencodeFailed', () => {
    it('marks the job failed with its reason', async () => {
      await SubmissionAttachmentRepository.recordReencodeFailed(ATTACHMENT_ID, 'too-long');

      expect(attachments.update).toHaveBeenCalledWith({
        where: { id: ATTACHMENT_ID },
        data: { reencodeStatus: 'failed', reencodeError: 'too-long' },
      });
    });
  });

  describe('recordReencoded', () => {
    it('stores what the re-encode wrote and marks the job succeeded', async () => {
      await SubmissionAttachmentRepository.recordReencoded(ATTACHMENT_ID, reencoded);

      expect(attachments.update).toHaveBeenCalledWith({
        where: { id: ATTACHMENT_ID },
        data: { ...reencoded, reencodeStatus: 'succeeded', reencodeError: null },
      });
    });

    it('moves the submission on, so an approver reloads before deciding', async () => {
      await SubmissionAttachmentRepository.recordReencoded(ATTACHMENT_ID, reencoded);

      expect(submissions.update).toHaveBeenCalledWith({
        where: { id: SUBMISSION_ID },
        data: { updatedAt: NOW },
      });
    });
  });
});
