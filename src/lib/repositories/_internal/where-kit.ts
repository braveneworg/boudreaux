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
