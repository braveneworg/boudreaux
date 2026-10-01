/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';

import { chatMessageWhere } from './chat-message-where';

import type { Prisma } from '@prisma/client';

// Contract: `chatMessageWhere` matches exactly the rows the rule says on a
// real MongoDB, for every way `hiddenAt` and `pinnedAt` can be stored, and
// `byAllowedAuthor` reads the author's bans null-safely. Runs only under
// `pnpm run test:db`.

type Storage = 'absent' | 'null' | 'set';

const STORAGES: Storage[] = ['absent', 'null', 'set'];
const SET_AT = new Date('2026-01-01T00:00:00.000Z');

const dateFor = (storage: Storage): Date | null | undefined =>
  storage === 'set' ? SET_AT : storage === 'null' ? null : undefined;

const prefix = `__contract:${randomUUID()}:`;
const bodyOf = (hidden: Storage, pinned: Storage): string =>
  `${prefix}hiddenAt=${hidden}:pinnedAt=${pinned}`;
let authorId = '';
const userIds: string[] = [];

// Every row this file writes; the storage-pair rows are the author's alone.
const scope = (): Prisma.ChatMessageWhereInput => ({ body: { startsWith: prefix } });
const authorScope = (): Prisma.ChatMessageWhereInput => ({ ...scope(), userId: authorId });

const expectBodies = (predicate: (hidden: Storage, pinned: Storage) => boolean): string[] =>
  STORAGES.flatMap((hidden) =>
    STORAGES.filter((pinned) => predicate(hidden, pinned)).map((pinned) => bodyOf(hidden, pinned))
  ).sort();

const findBodies = async (
  where: Prisma.ChatMessageWhereInput,
  within: Prisma.ChatMessageWhereInput = authorScope()
): Promise<string[]> => {
  const rows = await prisma.chatMessage.findMany({
    where: { ...within, AND: [where] },
    select: { body: true },
  });
  return rows.map(({ body }) => body).sort();
};

const createUser = async (label: string): Promise<string> => {
  const user = await prisma.user.create({
    data: { email: `${prefix}${label}@example.com`, name: label },
    select: { id: true },
  });
  userIds.push(user.id);
  return user.id;
};

beforeAll(async () => {
  authorId = await createUser('author');
  // One message per (hiddenAt, pinnedAt) storage pair. Serial creates so an
  // omitted field is genuinely absent from the document.
  for (const hidden of STORAGES) {
    for (const pinned of STORAGES) {
      await prisma.chatMessage.create({
        data: {
          userId: authorId,
          body: bodyOf(hidden, pinned),
          hiddenAt: dateFor(hidden),
          pinnedAt: dateFor(pinned),
        },
      });
    }
  }
});

afterAll(async () => {
  await prisma.chatMessage.deleteMany({ where: scope() });
  await prisma.bannedIdentity.deleteMany({ where: { email: { startsWith: prefix } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

describe('chatMessageWhere (Docker Mongo contract)', () => {
  it('seeds one row per storage pair', async () => {
    expect(await findBodies({})).toEqual(expectBodies(() => true));
  });

  it('visible matches absent and null hiddenAt; hidden only a set one', async () => {
    expect(await findBodies(chatMessageWhere.visible)).toEqual(
      expectBodies((hidden) => hidden !== 'set')
    );
    expect(await findBodies(chatMessageWhere.hidden)).toEqual(
      expectBodies((hidden) => hidden === 'set')
    );
  });

  it('a bare null filter misses the absent row (the defect this fragment replaces)', async () => {
    expect(await findBodies({ hiddenAt: null })).toEqual(
      expectBodies((hidden) => hidden === 'null')
    );
  });

  it('pinned matches only a set pinnedAt', async () => {
    expect(await findBodies(chatMessageWhere.pinned)).toEqual(
      expectBodies((_, pinned) => pinned === 'set')
    );
  });

  describe('byAllowedAuthor', () => {
    // Three more authors with one message each: a lifted ban stored each way
    // keeps them allowed; only a ban that was never lifted silences them.
    const BAN_STORAGES: Storage[] = ['absent', 'null', 'set'];
    const banBodyOf = (storage: Storage): string => `${prefix}ban:unbannedAt=${storage}`;

    beforeAll(async () => {
      const adminId = await createUser('admin');
      for (const storage of BAN_STORAGES) {
        const bannedId = await createUser(`banned-${storage}`);
        await prisma.bannedIdentity.create({
          data: {
            userId: bannedId,
            email: `${prefix}ban-${storage}`,
            bannedByAdminId: adminId,
            unbannedAt: dateFor(storage),
          },
        });
        await prisma.chatMessage.create({ data: { userId: bannedId, body: banBodyOf(storage) } });
      }
    });

    it('silences an author whose ban was never lifted, stored absent or null', async () => {
      const found = await findBodies(chatMessageWhere.byAllowedAuthor, {
        body: { startsWith: `${prefix}ban:` },
      });
      expect(found).toEqual([banBodyOf('set')]);
    });
  });
});
