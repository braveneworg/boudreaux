/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { MAX_UNAPPROVED_SUBMISSIONS } from '@/lib/constants/submissions';
import { prisma } from '@/lib/prisma';
import type { CreateSubmissionData, SubmissionWrite } from '@/lib/types/domain/submission';

import { SubmissionRepository } from './submission-repository';

// Contract: on a real MongoDB, through the real repository transaction, an
// owner never holds more than `MAX_UNAPPROVED_SUBMISSIONS` unapproved
// submissions. Saves that land together on an owner one under the cap may
// each have read the old count; at most one of them may be stored, and an
// approved submission is never counted.
//
// Reach: one browser tab runs Server Actions one at a time, but two tabs or
// two devices signed in as the same owner do not. Runs only under
// `pnpm run test:db`.

const prefix = `__contract:${randomUUID()}:`;

/** Owners raced, each from one under the cap. */
const OWNERS = 4;
/** Creates fired at each owner. */
const CONCURRENT_CREATES = 6;
/** Gap between the creates' starts, so some overlap and some straddle a commit. */
const STAGGER_MS = 3;

interface RaceOutcome {
  unapproved: number;
  written: number;
  results: string[];
}

const outcomes: RaceOutcome[] = [];
let approvedOwnerWrite: SubmissionWrite | undefined;

const draft = (ownerId: string, name: string): CreateSubmissionData => ({
  ownerId,
  title: `${prefix}${name}`,
  category: 'WRITING',
  aboutHtml: '',
  writingHtml: '<p>poem</p>',
  links: [],
  listed: false,
  status: 'DRAFT',
  publishedAt: null,
});

const pause = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

/** `written`, `full`, or how a create that threw failed. */
const describeResult = (result: PromiseSettledResult<SubmissionWrite>): string =>
  result.status === 'fulfilled' ? result.value.status : 'threw';

const createOwner = async (name: string): Promise<string> => {
  const { id } = await prisma.user.create({
    data: { email: `${prefix}${name}@example.com` },
    select: { id: true },
  });
  return id;
};

// Every row is seeded, and every write is run, here: the tests run shuffled
// and only read.
beforeAll(async () => {
  for (let owner = 0; owner < OWNERS; owner++) {
    const ownerId = await createOwner(`owner-${owner}`);

    // One under the cap, seeded one at a time (fresh-collection read-back
    // race, docs/lessons/prisma-mongo).
    for (let index = 0; index < MAX_UNAPPROVED_SUBMISSIONS - 1; index++) {
      await prisma.submission.create({ data: draft(ownerId, `seed-${owner}-${index}`) });
    }

    const results = await Promise.allSettled(
      Array.from({ length: CONCURRENT_CREATES }, async (_, index) => {
        await pause(index * STAGGER_MS);
        return SubmissionRepository.createWithinCap(
          draft(ownerId, `race-${owner}-${index}`),
          MAX_UNAPPROVED_SUBMISSIONS
        );
      })
    );

    outcomes.push({
      unapproved: await prisma.submission.count({ where: { ownerId } }),
      written: results.filter((result) => describeResult(result) === 'written').length,
      results: results.map(describeResult),
    });
  }

  // An owner whose submissions are all approved is nowhere near the cap.
  const approvedOwnerId = await createOwner('approved-owner');
  for (let index = 0; index < MAX_UNAPPROVED_SUBMISSIONS + 1; index++) {
    await prisma.submission.create({
      data: { ...draft(approvedOwnerId, `approved-${index}`), status: 'APPROVED' },
    });
  }
  approvedOwnerWrite = await SubmissionRepository.createWithinCap(
    draft(approvedOwnerId, 'after-approved'),
    MAX_UNAPPROVED_SUBMISSIONS
  );
}, 60_000);

afterAll(async () => {
  await prisma.submission.deleteMany({ where: { title: { startsWith: prefix } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: prefix } } });
  await prisma.$disconnect();
});

describe('the unapproved submission cap (Docker Mongo contract)', () => {
  it('never stores more than the cap for any raced owner', () => {
    expect(outcomes.map(({ unapproved }) => unapproved)).toEqual(
      Array.from({ length: OWNERS }, () => MAX_UNAPPROVED_SUBMISSIONS)
    );
  });

  it('lets exactly one of the racing creates through for each owner', () => {
    expect(outcomes.map(({ written }) => written)).toEqual(Array.from({ length: OWNERS }, () => 1));
  });

  it('answers every other racing create as full or as a lost conflict, never as written', () => {
    const others = outcomes.flatMap(({ results }) =>
      results.filter((result) => result !== 'written')
    );

    expect(others.every((result) => result === 'full' || result === 'threw')).toBe(true);
  });

  it('does not count approved submissions toward the cap', () => {
    expect(approvedOwnerWrite?.status).toBe('written');
  });
});
