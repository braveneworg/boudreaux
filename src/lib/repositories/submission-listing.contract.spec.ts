/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';

import { SubmissionRepository } from './submission-repository';

// Contract: on a real MongoDB, the community page's read lists only listed
// submissions, newest first by first approval with the id breaking a tie,
// page by page with no row repeated or dropped, narrowed by a search term and
// by an owner together; and `isPublic` answers for each state an id can be
// in. Runs only under `pnpm run test:db`.
//
// The read is not scoped to these rows, and other contract files approve
// submissions too. Every list here carries this run's search term, which no
// other row holds.

const run = randomUUID().slice(0, 8);
const prefix = `__contract:${randomUUID()}:`;
const needle = `ndl${run}`;

const at = (minute: number): Date => new Date(Date.UTC(2026, 0, 1, 0, minute));

interface Seeded {
  ownerA: string;
  ownerB: string;
  newest: string;
  tieOne: string;
  tieTwo: string;
  oldest: string;
  byOwnerB: string;
  unlisted: string;
  draft: string;
  bannedOwners: string;
}

let seeded: Seeded | undefined;

const ids = (): Seeded => {
  if (!seeded) {
    throw new Error('The contract rows were not seeded');
  }
  return seeded;
};

const createOwner = async (name: string, banned?: boolean): Promise<string> => {
  const { id } = await prisma.user.create({
    data: { email: `${prefix}${name}@example.com`, username: `${prefix}${name}`, banned },
    select: { id: true },
  });
  return id;
};

interface SubmissionSeed {
  ownerId: string;
  name: string;
  status?: 'DRAFT' | 'APPROVED';
  listed?: boolean;
  firstApprovedAt?: Date;
}

const createSubmission = async ({
  ownerId,
  name,
  status = 'APPROVED',
  listed = true,
  firstApprovedAt,
}: SubmissionSeed): Promise<string> => {
  const { id } = await prisma.submission.create({
    data: {
      ownerId,
      title: `${prefix}${name} ${needle}`,
      category: 'WRITING',
      status,
      listed,
      firstApprovedAt,
    },
    select: { id: true },
  });
  return id;
};

const listed = async (
  query: Partial<Parameters<typeof SubmissionRepository.listListed>[0]> = {}
): Promise<string[]> => {
  const rows = await SubmissionRepository.listListed({
    skip: 0,
    take: 24,
    search: needle,
    ...query,
  });
  return rows.map(({ id }) => id);
};

// Every row is seeded here: the tests run shuffled and only read. Serial
// creates, for the fresh-collection read-back race.
beforeAll(async () => {
  const ownerA = await createOwner('owner-a');
  const ownerB = await createOwner('owner-b');
  const banned = await createOwner('owner-banned', true);

  seeded = {
    ownerA,
    ownerB,
    oldest: await createSubmission({ ownerId: ownerA, name: 'oldest', firstApprovedAt: at(1) }),
    tieOne: await createSubmission({ ownerId: ownerA, name: 'tie-one', firstApprovedAt: at(2) }),
    tieTwo: await createSubmission({ ownerId: ownerA, name: 'tie-two', firstApprovedAt: at(2) }),
    byOwnerB: await createSubmission({ ownerId: ownerB, name: 'by-b', firstApprovedAt: at(3) }),
    newest: await createSubmission({ ownerId: ownerA, name: 'newest', firstApprovedAt: at(4) }),
    unlisted: await createSubmission({
      ownerId: ownerA,
      name: 'unlisted',
      listed: false,
      firstApprovedAt: at(5),
    }),
    draft: await createSubmission({ ownerId: ownerA, name: 'draft', status: 'DRAFT' }),
    bannedOwners: await createSubmission({
      ownerId: banned,
      name: 'banned-owners',
      firstApprovedAt: at(6),
    }),
  };
});

afterAll(async () => {
  await prisma.submission.deleteMany({ where: { title: { startsWith: prefix } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: prefix } } });
  await prisma.$disconnect();
});

describe('SubmissionRepository.listListed (Docker Mongo contract)', () => {
  it('lists the listed submissions, newest first, the later id first on a tie', async () => {
    const { newest, byOwnerB, tieOne, tieTwo, oldest } = ids();
    const tie = [tieOne, tieTwo].sort().reverse();

    expect(await listed()).toEqual([newest, byOwnerB, ...tie, oldest]);
  });

  it('leaves out an unlisted one, a draft and a banned owner’s', async () => {
    const { unlisted, draft, bannedOwners } = ids();

    expect(await listed()).not.toEqual(expect.arrayContaining([unlisted]));
    expect(await listed()).not.toEqual(expect.arrayContaining([draft]));
    expect(await listed()).not.toEqual(expect.arrayContaining([bannedOwners]));
  });

  it('pages through them without repeating or dropping a row', async () => {
    const pages = [
      await listed({ skip: 0, take: 2 }),
      await listed({ skip: 2, take: 2 }),
      await listed({ skip: 4, take: 2 }),
    ];

    expect(pages.flat()).toEqual(await listed());
    expect(pages.map((page) => page.length)).toEqual([2, 2, 1]);
  });

  it('narrows to one owner’s, with a search term in the same read', async () => {
    const { ownerA, ownerB, byOwnerB } = ids();

    expect(await listed({ ownerId: ownerB })).toEqual([byOwnerB]);
    expect(await listed({ ownerId: ownerA })).toHaveLength(4);
  });

  it('carries the owner’s username and email for the card', async () => {
    const [row] = await SubmissionRepository.listListed({
      skip: 0,
      take: 1,
      search: needle,
      ownerId: ids().ownerB,
    });

    expect(row).toEqual({
      id: ids().byOwnerB,
      title: `${prefix}by-b ${needle}`,
      category: 'WRITING',
      owner: { username: `${prefix}owner-b`, email: `${prefix}owner-b@example.com` },
    });
  });
});

describe('SubmissionRepository.isPublic (Docker Mongo contract)', () => {
  it('is true for an approved submission that is listed', async () => {
    expect(await SubmissionRepository.isPublic(ids().newest)).toBe(true);
  });

  it('is true for an approved submission that is unlisted', async () => {
    expect(await SubmissionRepository.isPublic(ids().unlisted)).toBe(true);
  });

  it('is false for a draft', async () => {
    expect(await SubmissionRepository.isPublic(ids().draft)).toBe(false);
  });

  it('is false for a banned owner’s approved submission', async () => {
    expect(await SubmissionRepository.isPublic(ids().bannedOwners)).toBe(false);
  });

  it('is false for an id that names nothing', async () => {
    expect(await SubmissionRepository.isPublic('0'.repeat(24))).toBe(false);
  });
});
