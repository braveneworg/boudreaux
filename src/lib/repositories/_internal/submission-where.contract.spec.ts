/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';

import { isPublicSubmission, submissionMatching, submissionWhere } from './submission-where';

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

// The community page's rows. They carry their own prefix, so the state-by-ban
// cases above never see them, and a search term no other row holds.
const listingPrefix = `__contract:${randomUUID()}:`;
const needle = `ndl${randomUUID().slice(0, 8)}`;
const listingTitle = (name: string): string => `${listingPrefix}${name}`;
const META_TITLE = 'meta .*(x';

const findListingTitles = async (where: Prisma.SubmissionWhereInput): Promise<string[]> => {
  const rows = await prisma.submission.findMany({
    where: { title: { startsWith: listingPrefix }, AND: [where] },
    select: { title: true },
  });
  return rows.map(({ title }) => title.slice(listingPrefix.length)).sort();
};

let namedOwnerId = '';

const seedListingRows = async (): Promise<void> => {
  const owner = async (data: Prisma.UserCreateInput): Promise<string> => {
    const { id } = await prisma.user.create({ data, select: { id: true } });
    return id;
  };
  const email = (name: string): string => `${listingPrefix}${name}@example.com`;

  const plain = await owner({ email: email('plain'), username: `${listingPrefix}plain` });
  const nameless = await owner({ email: email('nameless') });
  const banned = await owner({
    email: email('banned'),
    username: `${listingPrefix}${needle}-banned`,
    banned: true,
  });
  namedOwnerId = await owner({
    email: email('named'),
    username: `${listingPrefix}${needle.toUpperCase()}-named`,
  });

  const approved = { category: 'WRITING', status: 'APPROVED', listed: true } as const;
  const rows: Prisma.SubmissionUncheckedCreateInput[] = [
    { ...approved, ownerId: plain, title: listingTitle('listed') },
    { ...approved, ownerId: plain, title: listingTitle('unlisted'), listed: false },
    { ...approved, ownerId: plain, title: listingTitle('awaiting'), status: 'AWAITING_APPROVAL' },
    { ...approved, ownerId: banned, title: listingTitle(`banned ${needle}`) },
    { ...approved, ownerId: plain, title: listingTitle(`title ${needle.toUpperCase()}`) },
    {
      ...approved,
      ownerId: nameless,
      title: listingTitle('about'),
      aboutText: `Taped ${needle} at home`,
    },
    {
      ...approved,
      ownerId: plain,
      title: listingTitle('about-html-only'),
      aboutHtml: `<p>${needle}</p>`,
    },
    {
      ...approved,
      ownerId: plain,
      title: listingTitle('about-null'),
      aboutHtml: `<p>${needle}</p>`,
      aboutText: null,
    },
    {
      ...approved,
      ownerId: plain,
      title: listingTitle('writing'),
      writingHtml: `<p>${needle}</p>`,
    },
    { ...approved, ownerId: namedOwnerId, title: listingTitle('by-named') },
    // Characters a regular expression would read as syntax.
    { ...approved, ownerId: plain, title: listingTitle(META_TITLE) },
  ];
  for (const data of rows) {
    await prisma.submission.create({ data });
  }
};

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
  await seedListingRows();
});

afterAll(async () => {
  await prisma.submission.deleteMany({
    where: { OR: [scope(), { title: { startsWith: listingPrefix } }] },
  });
  await prisma.user.deleteMany({
    where: { OR: [{ email: { startsWith: prefix } }, { email: { startsWith: listingPrefix } }] },
  });
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

describe('the community page’s fragments (Docker Mongo contract)', () => {
  const NEEDLE_TITLE = `title ${needle.toUpperCase()}`;
  const BANNED_TITLE = `banned ${needle}`;

  it('listed matches an approved, listed submission whose owner is not banned', async () => {
    expect(await findListingTitles(submissionWhere.listed)).toEqual(
      [
        'about',
        'about-html-only',
        'about-null',
        'by-named',
        'listed',
        META_TITLE,
        NEEDLE_TITLE,
        'writing',
      ].sort()
    );
  });

  it('matching reads the title, the about text and the username, and nothing else', async () => {
    expect(await findListingTitles(submissionMatching(needle))).toEqual(
      ['about', BANNED_TITLE, 'by-named', NEEDLE_TITLE].sort()
    );
  });

  // Both fragments filter the `owner` relation: the shape that shares one
  // join on MongoDB (docs/lessons/prisma-mongo/same-relation-filters-share-one-join.md).
  it('listed and matching together keep both owner filters', async () => {
    expect(
      await findListingTitles({ AND: [submissionWhere.listed, submissionMatching(needle)] })
    ).toEqual(['about', 'by-named', NEEDLE_TITLE].sort());
  });

  // A term is text, never a pattern: `.*` unescaped would match every row,
  // and `(` unescaped would not compile.
  it.each(['.*', '(', '.*(x'])('matching reads %s as the characters themselves', async (term) => {
    expect(await findListingTitles(submissionMatching(term))).toEqual([META_TITLE]);
  });

  it('matching finds nothing, without failing, for a lone backslash', async () => {
    expect(await findListingTitles(submissionMatching('\\'))).toEqual([]);
  });

  it('an owner narrows the two together', async () => {
    expect(
      await findListingTitles({
        AND: [submissionWhere.listed, submissionMatching(needle), { ownerId: namedOwnerId }],
      })
    ).toEqual(['by-named']);
  });
});
