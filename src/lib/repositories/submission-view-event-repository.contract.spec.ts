/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';
import type { SubmissionViewCount } from '@/lib/types/domain/submission-view-event';

import { SubmissionRepository } from './submission-repository';
import { SubmissionViewEventRepository } from './submission-view-event-repository';

// Contract: on a real MongoDB, a view key is stored once however many writers
// race for it; the counts read only the rows since a cutoff and only the
// submissions at or over a minimum; the prune deletes exactly the rows before
// its cutoff; and deleting a submission deletes its view events (ADR-0029).
// Runs only under `pnpm run test:db`.
//
// No other contract file writes view events. The rows here are still dated in
// 2001, so a prune in this file can never reach a row another run wrote today.

const prefix = `__contract:${randomUUID()}:`;

const at = (minute: number): Date => new Date(Date.UTC(2001, 0, 1, 0, minute));

/** How many writers race for one key. */
const RACERS = 8;

/** A limit no case here reaches: every submission at the minimum is read. */
const EVERY = 1000;

interface Seeded {
  owner: string;
  three: string;
  two: string;
  oldOnly: string;
  raced: string;
  deleted: string;
}

let seeded: Seeded | undefined;
let counts: SubmissionViewCount[] = [];
let countsFromOne: SubmissionViewCount[] = [];
let topTwo: SubmissionViewCount[] = [];
let firstWrite: boolean | undefined;
let secondWrite: boolean | undefined;
let raceWrites: boolean[] = [];
let racedRows: number | undefined;
let knownKey: boolean | undefined;
let unknownKey: boolean | undefined;
let pruned: number | undefined;
let keysAfterPrune: string[] = [];
let rowsOfDeleted: number | undefined;

const ids = (): Seeded => {
  if (!seeded) {
    throw new Error('The contract rows were not seeded');
  }
  return seeded;
};

const createSubmission = async (ownerId: string, name: string): Promise<string> => {
  const { id } = await prisma.submission.create({
    data: { ownerId, title: `${prefix}${name}`, category: 'WRITING', status: 'APPROVED' },
    select: { id: true },
  });
  return id;
};

const view = (submissionId: string, name: string, minute: number): Promise<boolean> =>
  SubmissionViewEventRepository.record({
    submissionId,
    viewKey: `${prefix}${name}`,
    viewedAt: at(minute),
  });

/** Only this file's submissions, most viewed first. */
const mine = (rows: SubmissionViewCount[]): SubmissionViewCount[] => {
  const own = new Set(Object.values(ids()));
  return rows
    .filter(({ submissionId }) => own.has(submissionId))
    .toSorted((a, b) => b.views - a.views);
};

// Every row is seeded, and every read is run, here: the tests run shuffled
// and only assert. Serial creates, for the fresh-collection read-back race.
beforeAll(async () => {
  // The schema declares the unique index; a scratch database only has it once
  // something creates it. The once-a-day rule is that index, so create it
  // here rather than rely on a prior `prisma db push`.
  await prisma.$runCommandRaw({
    createIndexes: 'SubmissionViewEvent',
    indexes: [{ key: { viewKey: 1 }, name: 'SubmissionViewEvent_viewKey_key', unique: true }],
  });

  const { id: owner } = await prisma.user.create({
    data: { email: `${prefix}owner@example.com` },
    select: { id: true },
  });
  const three = await createSubmission(owner, 'three');
  const two = await createSubmission(owner, 'two');
  const oldOnly = await createSubmission(owner, 'old-only');
  const raced = await createSubmission(owner, 'raced');
  const deleted = await createSubmission(owner, 'deleted');
  seeded = { owner, three, two, oldOnly, raced, deleted };

  // The cutoff is minute 10. Each submission's rows on either side of it:
  firstWrite = await view(three, 'three-a', 10);
  secondWrite = await view(three, 'three-a', 11);
  await view(three, 'three-b', 12);
  await view(three, 'three-c', 13);
  await view(three, 'three-old', 9);
  await view(two, 'two-a', 10);
  await view(two, 'two-b', 20);
  await view(oldOnly, 'old-a', 1);
  await view(oldOnly, 'old-b', 2);
  await view(deleted, 'deleted-a', 15);

  raceWrites = await Promise.all(
    Array.from({ length: RACERS }, () => view(raced, 'raced-key', 15))
  );
  racedRows = await prisma.submissionViewEvent.count({ where: { submissionId: raced } });

  knownKey = await SubmissionViewEventRepository.exists(`${prefix}two-a`);
  unknownKey = await SubmissionViewEventRepository.exists(`${prefix}never-written`);

  counts = await SubmissionViewEventRepository.countsSince(at(10), 2, EVERY);
  countsFromOne = await SubmissionViewEventRepository.countsSince(at(10), 1, EVERY);
  topTwo = await SubmissionViewEventRepository.countsSince(at(10), 1, 2);

  await SubmissionRepository.deleteOwned(deleted, owner);
  rowsOfDeleted = await prisma.submissionViewEvent.count({ where: { submissionId: deleted } });

  pruned = await SubmissionViewEventRepository.deleteBefore(at(10));
  const left = await prisma.submissionViewEvent.findMany({
    where: { submissionId: { in: [three, two, oldOnly] } },
    select: { viewKey: true },
  });
  keysAfterPrune = left.map(({ viewKey }) => viewKey.slice(prefix.length)).toSorted();
});

afterAll(async () => {
  await prisma.submissionViewEvent.deleteMany({
    where: { submissionId: { in: Object.values(ids()) } },
  });
  await prisma.submission.deleteMany({ where: { ownerId: ids().owner } });
  await prisma.user.deleteMany({ where: { id: ids().owner } });
  await prisma.$disconnect();
});

describe('SubmissionViewEventRepository (Docker Mongo contract)', () => {
  it('stores a new key and says so', () => {
    expect(firstWrite).toBe(true);
  });

  it('refuses a key it already holds, at any time, and says so', () => {
    expect(secondWrite).toBe(false);
  });

  it('stores one row when many writers race for one key', () => {
    expect(racedRows).toBe(1);
  });

  it('tells exactly one of the racing writers that it wrote', () => {
    expect(raceWrites.filter(Boolean)).toHaveLength(1);
  });

  it('knows a key it holds', () => {
    expect(knownKey).toBe(true);
  });

  it('does not know a key it was never given', () => {
    expect(unknownKey).toBe(false);
  });

  it('counts each submission’s rows since the cutoff, the cutoff’s own instant included', () => {
    const { three, two, raced, deleted } = ids();

    expect(mine(countsFromOne)).toEqual([
      { submissionId: three, views: 3 },
      { submissionId: two, views: 2 },
      expect.objectContaining({ views: 1 }),
      expect.objectContaining({ views: 1 }),
    ]);
    expect(
      mine(countsFromOne)
        .slice(2)
        .map(({ submissionId }) => submissionId)
        .toSorted()
    ).toEqual([raced, deleted].toSorted());
  });

  it('leaves out a submission under the minimum', () => {
    const { three, two } = ids();

    expect(mine(counts)).toEqual([
      { submissionId: three, views: 3 },
      { submissionId: two, views: 2 },
    ]);
  });

  it('reads the most viewed first and stops at the limit', () => {
    // Only this file stores view events dated 2001, so the two most viewed
    // since the cutoff are this file's.
    const { three, two } = ids();

    expect(topTwo).toEqual([
      { submissionId: three, views: 3 },
      { submissionId: two, views: 2 },
    ]);
  });

  it('leaves out a submission whose rows are all before the cutoff', () => {
    expect(countsFromOne.map(({ submissionId }) => submissionId)).not.toContain(ids().oldOnly);
  });

  it('deletes a submission’s view events with the submission', () => {
    expect(rowsOfDeleted).toBe(0);
  });

  it('prunes exactly the rows before the cutoff and says how many', () => {
    expect(pruned).toBe(3);
  });

  it('keeps every row at or after the cutoff through a prune', () => {
    expect(keysAfterPrune).toEqual(['three-a', 'three-b', 'three-c', 'two-a', 'two-b']);
  });
});
