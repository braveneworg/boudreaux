/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';

import { isPublicSubmission, submissionWhere } from './submission-where';

import type { Prisma } from '@prisma/client';

// Contract: the submission fragments match exactly the rows the rule says on
// a real MongoDB, for every state a submission can be in and every way its
// owner's `banned` flag can be stored, and `isPublicSubmission` agrees with
// `submissionWhere.public` on each of them. Runs only under `pnpm run test:db`.

type Status = 'DRAFT' | 'AWAITING_APPROVAL' | 'APPROVED' | 'REJECTED';
type Ban = 'absent' | 'null' | 'false' | 'true';

const STATUSES: Status[] = ['DRAFT', 'AWAITING_APPROVAL', 'APPROVED', 'REJECTED'];
const BANS: Ban[] = ['absent', 'null', 'false', 'true'];

const bannedFor = (ban: Ban): boolean | null | undefined =>
  ban === 'true' ? true : ban === 'false' ? false : ban === 'null' ? null : undefined;

const prefix = `__contract:${randomUUID()}:`;
const emailOf = (ban: Ban): string => `${prefix}banned=${ban}@example.com`;
const titleOf = (status: Status, ban: Ban): string => `${prefix}${status}:banned=${ban}`;

const scope = (): Prisma.SubmissionWhereInput => ({ title: { startsWith: prefix } });

const expectTitles = (predicate: (status: Status, ban: Ban) => boolean): string[] =>
  STATUSES.flatMap((status) =>
    BANS.filter((ban) => predicate(status, ban)).map((ban) => titleOf(status, ban))
  ).sort();

const findTitles = async (where: Prisma.SubmissionWhereInput): Promise<string[]> => {
  const rows = await prisma.submission.findMany({
    where: { ...scope(), AND: [where] },
    select: { title: true },
  });
  return rows.map(({ title }) => title).sort();
};

const isBanned = (ban: Ban): boolean => ban === 'true';

beforeAll(async () => {
  // One owner per storage of `banned`, then one submission per state for each.
  // Serial creates: an omitted field is genuinely absent from the document,
  // and concurrent first writes race the read-back on a fresh collection.
  for (const ban of BANS) {
    const owner = await prisma.user.create({
      data: { email: emailOf(ban), name: 'contract', banned: bannedFor(ban) },
    });
    for (const status of STATUSES) {
      await prisma.submission.create({
        data: { ownerId: owner.id, title: titleOf(status, ban), category: 'WRITING', status },
      });
    }
  }
});

afterAll(async () => {
  await prisma.submission.deleteMany({ where: scope() });
  await prisma.user.deleteMany({ where: { email: { startsWith: prefix } } });
  await prisma.$disconnect();
});

describe('submissionWhere (Docker Mongo contract)', () => {
  it('seeds one row per state and ban storage', async () => {
    expect(await findTitles({})).toEqual(expectTitles(() => true));
  });

  it('unapproved matches a draft, one awaiting approval and a rejected one', async () => {
    expect(await findTitles(submissionWhere.unapproved)).toEqual(
      expectTitles((status) => status !== 'APPROVED')
    );
  });

  it('awaitingApproval matches only that state', async () => {
    expect(await findTitles(submissionWhere.awaitingApproval)).toEqual(
      expectTitles((status) => status === 'AWAITING_APPROVAL')
    );
  });

  it('public matches an approved submission unless its owner is banned', async () => {
    expect(await findTitles(submissionWhere.public)).toEqual(
      expectTitles((status, ban) => status === 'APPROVED' && !isBanned(ban))
    );
  });

  it('isPublicSubmission agrees with the public fragment on every loaded row', async () => {
    const rows = await prisma.submission.findMany({
      where: scope(),
      select: { title: true, status: true, owner: { select: { banned: true } } },
    });

    expect(
      rows
        .filter(isPublicSubmission)
        .map(({ title }) => title)
        .sort()
    ).toEqual(await findTitles(submissionWhere.public));
  });
});
