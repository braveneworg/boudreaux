/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Null-safe predicate kit for Prisma `where` shapes on MongoDB.
 *
 * On this stack a nullable field can be stored three ways — set, explicitly
 * `null`, or absent from the document (Prisma omits optional fields on create)
 * — and the three do not filter alike:
 *
 * - `{ field: null }` matches only an explicit null and MISSES an absent field.
 * - `{ field: { not: null } }` excludes both null and absent.
 *
 * These helpers are the one spelling of that rule. Every fragment module in
 * this directory builds on them, and each fragment is proved against Docker
 * Mongo by a `*.contract.spec.ts` (`pnpm run test:db`), so a repository
 * method never writes `isSet` by hand. See
 * `docs/lessons/prisma-mongo/gate-where-shapes-need-a-live-probe.md`.
 */

// Prisma's `WhereInput` members are mutable arrays, so these stay mutable too;
// a `readonly` tuple would not satisfy `OR?: XWhereInput[]`.
type UnsetClause<F extends string> = {
  OR: [Record<F, null>, Record<F, { isSet: false }>];
};

type UnsetOrClause<F extends string, V> = {
  OR: [Record<F, V>, Record<F, null>, Record<F, { isSet: false }>];
};

type PresentClause<F extends string> = Record<F, { not: null }>;

/** "Never set": the field is `null` or absent from the document. */
export const isUnset = <F extends string>(field: F): UnsetClause<F> =>
  ({
    OR: [{ [field]: null }, { [field]: { isSet: false } }],
  }) as UnsetClause<F>;

/**
 * A tri-value field read with a default: rows where `field` holds `value`,
 * plus the rows where it is null or absent, which legacy documents written
 * before the field existed are read as. `isUnsetOr('reference', true)` is
 * "plays the reference role unless explicitly opted out".
 */
export const isUnsetOr = <F extends string, V>(field: F, value: V): UnsetOrClause<F, V> =>
  ({
    OR: [{ [field]: value }, { [field]: null }, { [field]: { isSet: false } }],
  }) as UnsetOrClause<F, V>;

/** "Set": the field holds a non-null value. */
export const isPresent = <F extends string>(field: F): PresentClause<F> =>
  ({ [field]: { not: null } }) as PresentClause<F>;

/**
 * Combine clauses as `AND` members. A `where` has room for one top-level `OR`,
 * so two `isUnset` clauses — or an `isUnset` beside a search `OR` — must each
 * sit inside their own `AND` member.
 */
export const allOf = <C extends object[]>(...clauses: C): { AND: C } => ({ AND: clauses });

/** Every character a regular expression reads as syntax. */
const REGEX_SYNTAX = /[.*+?^${}()|[\]\\]/g;

/** A value with its regular-expression syntax escaped, so it is read as text. */
const asText = (value: string): string => value.replace(REGEX_SYNTAX, '\\$&');

/**
 * The text filters. On this stack Prisma sends `contains`, `startsWith` and
 * `endsWith`, and any filter with `mode: 'insensitive'`, to MongoDB as a
 * regular expression, and it does not escape the value: `.*` matches every
 * row, `equals: 'a.c'` also matches "abc", `(` fails the query with "Invalid
 * Regex", and a crafted pattern can make the database backtrack. Only a
 * case-sensitive `equals` or `in` is compared as text.
 *
 * So every text filter is built here, where the value is escaped first, and
 * `text-filter-seam.spec.ts` fails if one is written by hand anywhere else.
 * Each helper is case-insensitive. Proved by `where-kit.contract.spec.ts`.
 */

/** "Contains this text", for a term someone typed. */
export const containsText = (term: string): { contains: string; mode: 'insensitive' } => ({
  contains: asText(term),
  mode: 'insensitive',
});

/** "Starts with this text": a prefix someone is typing. */
export const startsWithText = (prefix: string): { startsWith: string; mode: 'insensitive' } => ({
  startsWith: asText(prefix),
  mode: 'insensitive',
});

/** "Is this text, whatever the case": a name looked up or checked for a duplicate. */
export const equalsText = (value: string): { equals: string; mode: 'insensitive' } => ({
  equals: asText(value),
  mode: 'insensitive',
});

/** "Is one of these texts, whatever the case". */
export const inTexts = (values: string[]): { in: string[]; mode: 'insensitive' } => ({
  in: values.map(asText),
  mode: 'insensitive',
});
