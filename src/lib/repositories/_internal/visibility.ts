/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The visibility rules: whether the public may see a record. Each rule is
 * declared once, as the fields it reads and the state each one must be in,
 * and is read two ways: as a null-safe `where` fragment a query composes, and
 * as a predicate over a row already loaded (`rows.filter(publicArtist.matches)`).
 * `visibility.contract.spec.ts` proves on Docker Mongo that the two agree on
 * every way a field can be stored.
 *
 * Prisma is imported for its types alone, and nothing here is restricted to
 * the server: the predicates reach client bundles through
 * `artist-release-credits`, and CLI scripts load the fragments.
 */

import { allOf, isPresent, isUnset } from './where-kit';

import type { Prisma } from '@prisma/client';

/** A field a rule reads either holds a value (`set`) or is null or absent (`unset`). */
type FieldState = 'set' | 'unset';

/** A rule's declaration: each field it reads, and the state that field must be in. */
type Declaration = Record<string, FieldState>;

/** The fields a declaration requires to be in `state`. */
type FieldsIn<D extends Declaration, S extends FieldState> = {
  [F in keyof D]: D[F] extends S ? F : never;
}[keyof D] &
  string;

/** "Never set" for each field of `F`, as `isUnset` spells it. */
type UnsetClause<F> = F extends string ? ReturnType<typeof isUnset<F>> : never;

/**
 * The `where` fragment a declaration emits: every set field present, and the
 * unset fields as `AND` members, which leaves the top-level `OR` to the caller.
 */
type RuleWhere<D extends Declaration> = ReturnType<typeof isPresent<FieldsIn<D, 'set'>>> & {
  AND: Array<UnsetClause<FieldsIn<D, 'unset'>>>;
};

/** The row a rule's predicate reads: each declared field, stored or not. */
type RuleFields<D extends Declaration> = { -readonly [F in keyof D]?: Date | string | null };

/** One visibility rule, read two ways. */
interface VisibilityRule<D extends Declaration> {
  /**
   * The null-safe `where` fragment. Beside a caller's own clauses it goes in
   * as an `AND` member: spread into an object with its own `AND` key, it would
   * lose its unset fields.
   */
  where: RuleWhere<D>;
  /** The predicate over a loaded row. Works unbound, as a filter callback. */
  matches: (row: RuleFields<D>) => boolean;
}

/** Set means `!= null`; unset means `== null`, so an absent field and a null one alike. */
const isInState = (value: unknown, state: FieldState): boolean =>
  state === 'set' ? value != null : value == null;

/**
 * Emit a rule's two forms from its declaration: a set field becomes
 * `isPresent(field)` and the unset fields go inside `allOf(isUnset(...))`,
 * while the predicate checks each field's state on the row.
 */
const visibilityRule = <const D extends Declaration>(declaration: D): VisibilityRule<D> => {
  const fields = Object.entries(declaration);
  const fieldsIn = (state: FieldState): string[] =>
    fields.flatMap(([field, fieldState]) => (fieldState === state ? [field] : []));
  const clauses: object[] = [
    ...fieldsIn('set').map(isPresent),
    allOf(...fieldsIn('unset').map(isUnset)),
  ];

  return {
    where: clauses.reduce((where, clause) => ({ ...where, ...clause }), {}) as RuleWhere<D>,
    matches: (row) => {
      const stored = new Map(Object.entries(row));
      return fields.every(([field, state]) => isInState(stored.get(field), state));
    },
  };
};

/**
 * A public artist (ADR-0015, ADR-0016): published and not soft-deleted.
 * Whether the artist is still on the label plays no part. Every public read
 * applies it: to the artist a page is about, and, nested as
 * `{ artist: { is: publicArtist.where } }`, to the artists a release credits, a
 * band lists, a featured row names, or a tour date headlines. A read that must
 * see the hidden artists first (the artist page derives each release credit
 * from the full credit order) drops them afterwards with `publicArtist.matches`.
 */
export const publicArtist = visibilityRule({
  publishedOn: 'set',
  deletedOn: 'unset',
}) satisfies { where: Prisma.ArtistWhereInput };

/**
 * A listed Release: published and not soft-deleted. The only rule a public
 * Release read may use, and the release half of a listed artist (ADR-0007,
 * ADR-0022).
 */
export const listedRelease = visibilityRule({
  publishedAt: 'set',
  deletedOn: 'unset',
}) satisfies { where: Prisma.ReleaseWhereInput };

/** The artist fields the public artist rule reads. */
export type PublicArtistFields = Parameters<typeof publicArtist.matches>[0];

/** The release fields the listed Release rule reads. */
export type ListedReleaseFields = Parameters<typeof listedRelease.matches>[0];
