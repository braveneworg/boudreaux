/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';
import type { ReportedSubmissionsPage } from '@/lib/types/domain/submission-report';

import { SubmissionReportRepository } from './submission-report-repository';

// Contract: on a real MongoDB, the Reported tab's grouped read lists exactly
// the submissions that hold an open report, the one with the oldest open
// report first, with each one's open count, page by page, and leaves out the
// submissions of one owner when asked to. Runs only under `pnpm run test:db`.
//
// The read is not scoped to these rows, and other contract files file reports
// too. These are dated in 2001, so they sort ahead of anything else there.

const prefix = `__contract:${randomUUID()}:`;

const at = (minute: number): Date => new Date(Date.UTC(2001, 0, 1, 0, minute));

interface Seeded {
  ownA: string;
  ownB: string;
  twoOpen: string;
  oneOpen: string;
  handledOnly: string;
  lateOpen: string;
}

let seeded: Seeded | undefined;
const pages: Record<string, ReportedSubmissionsPage> = {};
const counts: Record<string, number> = {};

const ids = (): Seeded => {
  if (!seeded) {
    throw new Error('The contract rows were not seeded');
  }
  return seeded;
};

const createOwner = async (name: string): Promise<string> => {
  const { id } = await prisma.user.create({
    data: { email: `${prefix}${name}@example.com` },
    select: { id: true },
  });
  return id;
};

const createSubmission = async (ownerId: string, name: string): Promise<string> => {
  const { id } = await prisma.submission.create({
    data: { ownerId, title: `${prefix}${name}`, category: 'WRITING', status: 'APPROVED' },
    select: { id: true },
  });
  return id;
};

const report = async (submissionId: string, minute: number, handled = false): Promise<void> => {
  await prisma.submissionReport.create({
    data: {
      submissionId,
      reason: 'HARMFUL',
      note: `${prefix}minute-${minute}`,
      handled,
      createdAt: at(minute),
    },
  });
};

/** Only this file's submissions, in the order the read returned them. */
const mine = ({ groups }: ReportedSubmissionsPage): ReportedSubmissionsPage['groups'] => {
  const own = new Set(Object.values(ids()));
  return groups.filter(({ submissionId }) => own.has(submissionId));
};

// Every row is seeded, and every read is run, here: the tests run shuffled
// and only assert. Serial creates, for the fresh-collection read-back race.
beforeAll(async () => {
  const ownA = await createOwner('owner-a');
  const ownB = await createOwner('owner-b');
  const twoOpen = await createSubmission(ownA, 'two-open');
  const oneOpen = await createSubmission(ownB, 'one-open');
  const handledOnly = await createSubmission(ownB, 'handled-only');
  const lateOpen = await createSubmission(ownB, 'late-open');
  seeded = { ownA, ownB, twoOpen, oneOpen, handledOnly, lateOpen };

  // A handled report older than every open one: it must not count, and must
  // not be the date its submission is ordered by.
  await report(twoOpen, 0, true);
  await report(twoOpen, 1);
  await report(twoOpen, 3);
  await report(oneOpen, 2);
  await report(handledOnly, 0, true);
  await report(lateOpen, 4);

  pages.all = await SubmissionReportRepository.listReportedSubmissions({ skip: 0, take: 3 });
  pages.second = await SubmissionReportRepository.listReportedSubmissions({ skip: 2, take: 1 });
  pages.withoutA = await SubmissionReportRepository.listReportedSubmissions({
    skip: 0,
    take: 3,
    exceptOwnerId: ownA,
  });
  pages.totalWithoutB = await SubmissionReportRepository.listReportedSubmissions({
    skip: 0,
    take: 1,
    exceptOwnerId: ownB,
  });
  counts.all = await SubmissionReportRepository.countReportedSubmissions();
  counts.withoutA = await SubmissionReportRepository.countReportedSubmissions(ownA);
});

afterAll(async () => {
  await prisma.submissionReport.deleteMany({ where: { note: { startsWith: prefix } } });
  await prisma.submission.deleteMany({ where: { title: { startsWith: prefix } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: prefix } } });
  await prisma.$disconnect();
});

describe('SubmissionReportRepository.listReportedSubmissions (Docker Mongo contract)', () => {
  it('lists the submissions with an open report, oldest open report first', () => {
    const { twoOpen, oneOpen, lateOpen } = ids();

    expect(mine(pages.all as ReportedSubmissionsPage)).toEqual([
      { submissionId: twoOpen, openReports: 2, oldestReportAt: at(1) },
      { submissionId: oneOpen, openReports: 1, oldestReportAt: at(2) },
      { submissionId: lateOpen, openReports: 1, oldestReportAt: at(4) },
    ]);
  });

  it('leaves out a submission whose reports are all handled', () => {
    const listed = mine(pages.all as ReportedSubmissionsPage).map(
      ({ submissionId }) => submissionId
    );

    expect(listed).not.toContain(ids().handledOnly);
  });

  it('pages through them in the same order', () => {
    expect(mine(pages.second as ReportedSubmissionsPage)).toEqual([
      { submissionId: ids().lateOpen, openReports: 1, oldestReportAt: at(4) },
    ]);
  });

  it('counts every reported submission in the total, whatever the page', () => {
    expect(pages.second?.total).toBe(pages.all?.total);
    expect(pages.all?.total).toBeGreaterThanOrEqual(3);
  });

  it('leaves out one owner’s submissions when asked to', () => {
    const { oneOpen, lateOpen } = ids();

    expect(
      mine(pages.withoutA as ReportedSubmissionsPage).map(({ submissionId }) => submissionId)
    ).toEqual([oneOpen, lateOpen]);
  });

  it('counts the reported submissions as the page’s total does, with and without an owner', () => {
    // Other contract files may file or delete reports between two reads, so
    // the difference an owner makes is what is compared, not two totals.
    expect(counts.all - counts.withoutA).toBe(1);
    expect(counts.all).toBeGreaterThanOrEqual(3);
  });

  it('counts the total without that owner’s submissions too', () => {
    // Owner A holds one reported submission and owner B two.
    expect((pages.all?.total ?? 0) - (pages.withoutA?.total ?? 0)).toBe(1);
    expect((pages.all?.total ?? 0) - (pages.totalWithoutB?.total ?? 0)).toBe(2);
  });
});
