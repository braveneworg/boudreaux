/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';

import { submissionReportWhere } from './submission-report-where';

import type { Prisma } from '@prisma/client';

// Contract: the report fragments match exactly the rows the rule says on a
// real MongoDB, for a report that is open or handled and for every way its
// contact email can be stored (absent, null, set), filed before and after a
// cutoff. Runs only under `pnpm run test:db`.

type Contact = 'absent' | 'null' | 'set';
type Age = 'old' | 'new';

const CONTACTS: Contact[] = ['absent', 'null', 'set'];
const AGES: Age[] = ['old', 'new'];
const HANDLED = [false, true];

const CUTOFF = new Date('2026-08-14T12:00:00.000Z');
const filedAt = (age: Age): Date =>
  age === 'old' ? new Date('2026-08-14T11:59:59.999Z') : new Date('2026-08-14T12:00:00.000Z');

const prefix = `__contract:${randomUUID()}:`;
const noteOf = (handled: boolean, contact: Contact, age: Age): string =>
  `${prefix}handled=${handled}:contact=${contact}:age=${age}`;

const contactFor = (contact: Contact): string | null | undefined => {
  if (contact === 'set') {
    return 'wronged@example.com';
  }

  return contact === 'null' ? null : undefined;
};

const scope = (): Prisma.SubmissionReportWhereInput => ({ note: { startsWith: prefix } });

// Rows two cases write to. Their notes start with a prefix the base finder
// cannot match, so no other case ever counts them.
const erasePrefix = `__contract-erase:${randomUUID()}:`;
const doomedNote = `__contract-doomed:${randomUUID()}`;

const expectNotes = (
  predicate: (handled: boolean, contact: Contact, age: Age) => boolean
): string[] =>
  HANDLED.flatMap((handled) =>
    CONTACTS.flatMap((contact) =>
      AGES.filter((age) => predicate(handled, contact, age)).map((age) =>
        noteOf(handled, contact, age)
      )
    )
  ).sort();

const findNotes = async (where: Prisma.SubmissionReportWhereInput): Promise<string[]> => {
  const rows = await prisma.submissionReport.findMany({
    where: { ...scope(), AND: [where] },
    select: { note: true },
  });
  return rows.map(({ note }) => note).sort();
};

let doomedSubmissionId = '';

beforeAll(async () => {
  // Serial creates: an omitted field is genuinely absent from the document,
  // and concurrent first writes race the read-back on a fresh collection.
  const owner = await prisma.user.create({
    data: { email: `${prefix}owner@example.com`, name: 'contract' },
  });
  const submission = await prisma.submission.create({
    data: { ownerId: owner.id, title: `${prefix}reported`, category: 'WRITING' },
  });
  const submissionId = submission.id;

  for (const handled of HANDLED) {
    for (const contact of CONTACTS) {
      for (const age of AGES) {
        await prisma.submissionReport.create({
          data: {
            submissionId,
            reason: 'HARMFUL',
            note: noteOf(handled, contact, age),
            contactEmail: contactFor(contact),
            handled,
            createdAt: filedAt(age),
          },
        });
      }
    }
  }

  for (const age of AGES) {
    await prisma.submissionReport.create({
      data: {
        submissionId,
        reason: 'NOT_THEIRS',
        note: `${erasePrefix}${age}`,
        contactEmail: 'wronged@example.com',
        createdAt: filedAt(age),
      },
    });
  }

  const doomed = await prisma.submission.create({
    data: { ownerId: owner.id, title: `${prefix}doomed`, category: 'WRITING' },
  });
  doomedSubmissionId = doomed.id;
  await prisma.submissionReport.create({
    data: { submissionId: doomed.id, reason: 'OTHER', note: doomedNote },
  });
});

afterAll(async () => {
  await prisma.submissionReport.deleteMany({
    where: { OR: [scope(), { note: { startsWith: erasePrefix } }, { note: doomedNote }] },
  });
  await prisma.submission.deleteMany({ where: { title: { startsWith: prefix } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: prefix } } });
  await prisma.$disconnect();
});

describe('submissionReportWhere (Docker Mongo contract)', () => {
  it('seeds one row per handling, contact storage and age', async () => {
    expect(await findNotes({})).toEqual(expectNotes(() => true));
  });

  it('open matches every report no approver has handled', async () => {
    expect(await findNotes(submissionReportWhere.open)).toEqual(expectNotes((handled) => !handled));
  });

  it('contactFiledBefore matches only a held contact on a report filed before the cutoff', async () => {
    expect(await findNotes(submissionReportWhere.contactFiledBefore(CUTOFF))).toEqual(
      expectNotes((_handled, contact, age) => contact === 'set' && age === 'old')
    );
  });

  it('erasing through contactFiledBefore takes the old contact and leaves the new one', async () => {
    await prisma.submissionReport.updateMany({
      where: {
        note: { startsWith: erasePrefix },
        AND: [submissionReportWhere.contactFiledBefore(CUTOFF)],
      },
      data: { contactEmail: null },
    });

    const rows = await prisma.submissionReport.findMany({
      where: { note: { startsWith: erasePrefix } },
      select: { note: true, contactEmail: true },
      orderBy: { note: 'asc' },
    });

    expect(rows).toEqual([
      { note: `${erasePrefix}new`, contactEmail: 'wronged@example.com' },
      { note: `${erasePrefix}old`, contactEmail: null },
    ]);
  });

  it('deleting a submission deletes its reports', async () => {
    await prisma.submission.delete({ where: { id: doomedSubmissionId } });

    expect(await prisma.submissionReport.count({ where: { note: doomedNote } })).toBe(0);
  });
});
