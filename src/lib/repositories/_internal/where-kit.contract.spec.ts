/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { randomUUID } from 'node:crypto';

import { prisma } from '@/lib/prisma';

import { containsText, equalsText, inTexts, startsWithText } from './where-kit';

import type { Prisma } from '@prisma/client';

// Contract: on a real MongoDB, each of the where kit's text helpers reads its
// value as the characters themselves, whatever the case. Written by hand,
// every one of these shapes runs its value as a regular expression: probed on
// 2026-11-13, `equals: 'a.c'` with `mode: 'insensitive'` also matched "abc",
// and a value holding `(` failed the query with error 51111. Runs only under
// `pnpm run test:db`.
//
// The rows are producers: a model with one free-text field and nothing else
// to seed.

const prefix = `__contract:${randomUUID()}:`;
const NAMES = ['a.c', 'abc', 'A.C', '(x', 'plain'];
const named = (name: string): string => `${prefix}${name}`;

const find = async (name: Prisma.StringFilter<'Producer'>): Promise<string[]> => {
  const rows = await prisma.producer.findMany({
    where: { AND: [{ name: { startsWith: prefix } }, { name }] },
    select: { name: true },
  });

  return rows.map(({ name: value }) => value.slice(prefix.length)).sort();
};

// Every row is seeded here: the tests run shuffled and only read. Serial
// creates, for the fresh-collection read-back race.
beforeAll(async () => {
  for (const name of NAMES) {
    await prisma.producer.create({ data: { name: named(name) } });
  }
});

afterAll(async () => {
  await prisma.producer.deleteMany({ where: { name: { startsWith: prefix } } });
  await prisma.$disconnect();
});

describe('the where kit’s text helpers (Docker Mongo contract)', () => {
  it('seeds the five rows', async () => {
    expect(await find({ not: '' })).toEqual([...NAMES].sort());
  });

  describe('containsText', () => {
    it('reads a dot as a dot, whatever the case', async () => {
      expect(await find(containsText('a.c'))).toEqual(['A.C', 'a.c']);
    });

    it('reads an opening parenthesis as one, without failing', async () => {
      expect(await find(containsText('(x'))).toEqual(['(x']);
    });

    it('does not read `.*` as "anything"', async () => {
      expect(await find(containsText(`${prefix}.*`))).toEqual([]);
    });
  });

  describe('startsWithText', () => {
    it('reads a dot as a dot, whatever the case', async () => {
      expect(await find(startsWithText(named('a.')))).toEqual(['A.C', 'a.c']);
    });

    it('reads an opening parenthesis as one, without failing', async () => {
      expect(await find(startsWithText(named('(')))).toEqual(['(x']);
    });
  });

  describe('equalsText', () => {
    it('matches the whole value and nothing a pattern would', async () => {
      expect(await find(equalsText(named('a.c')))).toEqual(['A.C', 'a.c']);
    });

    it('does not match a value that only begins the same way', async () => {
      expect(await find(equalsText(named('a.')))).toEqual([]);
    });

    it('reads an opening parenthesis as one, without failing', async () => {
      expect(await find(equalsText(named('(x')))).toEqual(['(x']);
    });
  });

  describe('inTexts', () => {
    it('matches each whole value, whatever the case', async () => {
      expect(await find(inTexts([named('a.c'), named('PLAIN')]))).toEqual(['A.C', 'a.c', 'plain']);
    });

    it('reads an opening parenthesis as one, without failing', async () => {
      expect(await find(inTexts([named('(x')]))).toEqual(['(x']);
    });

    it('matches nothing for no values', async () => {
      expect(await find(inTexts([]))).toEqual([]);
    });
  });
});
