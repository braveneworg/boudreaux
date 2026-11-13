/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { MAX_SUBMISSION_ATTACHMENTS } from '@/lib/constants/submissions';
import { prisma } from '@/lib/prisma';
import type {
  AttachmentCreate,
  CreateAttachmentData,
} from '@/lib/types/domain/submission-attachment';

import { SubmissionAttachmentRepository } from './submission-attachment-repository';
import { SubmissionRepository } from './submission-repository';

// Contract: on a real MongoDB, through the real repository transaction, a
// submission never holds more than `MAX_SUBMISSION_ATTACHMENTS`. Confirms
// that land together on a submission one under the cap may each have read
// the old count; at most one of them may be stored.
//
// Reach: a user who drops several files at once confirms them concurrently,
// each from its own Server Action call. Runs only under `pnpm run test:db`.
//
// Also proved here, because nothing else reaches a real database for it: a
// creation moves the submission's `updatedAt` on, the runner gate begins a
// job that never ran exactly once, and deleting a submission deletes its
// attachments.

const prefix = `__contract:${randomUUID()}:`;

/** Submissions raced, each from one under the cap. */
const SUBMISSIONS = 3;
/** Creates fired at each submission. */
const CONCURRENT_CREATES = 8;
/** Gap between the creates' starts, so some overlap and some straddle a commit. */
const STAGGER_MS = 1;

interface RaceOutcome {
  held: number;
  created: number;
  results: string[];
}

const outcomes: RaceOutcome[] = [];
let updatedAtBefore: Date | undefined;
let updatedAtAfter: Date | undefined;
let firstBegin: boolean | undefined;
let secondBegin: boolean | undefined;
let leftAfterDelete: number | undefined;

const attachment = (submissionId: string, name: string): CreateAttachmentData => ({
  submissionId,
  kind: 'IMAGE',
  fileName: `${prefix}${name}.jpg`,
  uploadKey: `uploads/${submissionId}/${randomUUID()}`,
  uploadBytes: 1024,
  uploadType: 'image/jpeg',
});

const pause = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** `created`, `full`, or how a create that threw failed. */
const describeResult = (result: PromiseSettledResult<AttachmentCreate>): string =>
  result.status === 'fulfilled' ? result.value.status : 'threw';

const createSubmission = async (ownerId: string, name: string): Promise<string> => {
  const { id } = await prisma.submission.create({
    data: { ownerId, title: `${prefix}${name}`, category: 'PHOTO' },
    select: { id: true },
  });
  return id;
};

// Every row is seeded, and every write is run, here: the tests run shuffled
// and only read.
beforeAll(async () => {
  const { id: ownerId } = await prisma.user.create({
    data: { email: `${prefix}owner@example.com` },
    select: { id: true },
  });

  for (let index = 0; index < SUBMISSIONS; index++) {
    const submissionId = await createSubmission(ownerId, `race-${index}`);

    // One under the cap, seeded one at a time (fresh-collection read-back
    // race, docs/lessons/prisma-mongo).
    for (let seeded = 0; seeded < MAX_SUBMISSION_ATTACHMENTS - 1; seeded++) {
      await prisma.submissionAttachment.create({
        data: attachment(submissionId, `seed-${index}-${seeded}`),
      });
    }

    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENT_CREATES }, async (_, create) => {
        await pause(create * STAGGER_MS);
        return SubmissionAttachmentRepository.createWithinCap(
          attachment(submissionId, `race-${index}-${create}`),
          MAX_SUBMISSION_ATTACHMENTS
        );
      })
    );

    outcomes.push({
      held: await prisma.submissionAttachment.count({ where: { submissionId } }),
      created: results.filter((result) => describeResult(result) === 'created').length,
      results: results.map(describeResult),
    });
  }

  // A creation moves the submission on, and the job it starts begins once.
  const touchedId = await createSubmission(ownerId, 'touched');
  updatedAtBefore = (await prisma.submission.findUnique({ where: { id: touchedId } }))?.updatedAt;
  await pause(5);
  const created = await SubmissionAttachmentRepository.createWithinCap(
    attachment(touchedId, 'touched'),
    MAX_SUBMISSION_ATTACHMENTS
  );
  updatedAtAfter = (await prisma.submission.findUnique({ where: { id: touchedId } }))?.updatedAt;

  if (created.status === 'created') {
    const now = new Date();
    firstBegin = await SubmissionAttachmentRepository.beginReencodeRun(created.attachment.id, now);
    secondBegin = await SubmissionAttachmentRepository.beginReencodeRun(created.attachment.id, now);
  }

  // Deleting a submission takes its attachments with it.
  await SubmissionRepository.deleteOwned(touchedId, ownerId);
  leftAfterDelete = await prisma.submissionAttachment.count({ where: { submissionId: touchedId } });
}, 60_000);

afterAll(async () => {
  await prisma.submissionAttachment.deleteMany({ where: { fileName: { startsWith: prefix } } });
  await prisma.submission.deleteMany({ where: { title: { startsWith: prefix } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: prefix } } });
  await prisma.$disconnect();
});

describe('the attachment cap (Docker Mongo contract)', () => {
  it('never stores more than the cap for any raced submission', () => {
    expect(outcomes.map(({ held }) => held)).toEqual(
      Array.from({ length: SUBMISSIONS }, () => MAX_SUBMISSION_ATTACHMENTS)
    );
  });

  it('lets exactly one of the racing creates through for each submission', () => {
    expect(outcomes.map(({ created }) => created)).toEqual(
      Array.from({ length: SUBMISSIONS }, () => 1)
    );
  });

  it('answers every other racing create as full or as a lost conflict, never as created', () => {
    const others = outcomes.flatMap(({ results }) =>
      results.filter((result) => result !== 'created')
    );

    expect(others.every((result) => result === 'full' || result === 'threw')).toBe(true);
  });

  it('moves the submission on when an attachment is created', () => {
    expect(updatedAtAfter?.getTime()).toBeGreaterThan(updatedAtBefore?.getTime() ?? Infinity);
  });

  it('begins a job that never ran', () => {
    expect(firstBegin).toBe(true);
  });

  it('refuses to begin a job that is already processing', () => {
    expect(secondBegin).toBe(false);
  });

  it('deletes the attachments of a deleted submission', () => {
    expect(leftAfterDelete).toBe(0);
  });
});
