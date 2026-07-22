/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Compile-time assertion helpers.
 *
 * Used to tie two independently-declared types together so that a change to
 * one fails `pnpm run typecheck` until the other follows. The repository
 * layer's Prisma drift guards (`repositories/_internal/drift.ts`, which
 * re-exports these) and the validation layer's wire-schema coverage ties are
 * the two consumers.
 *
 * Usage:
 *
 *   type _SomeDrift = AssertExact<HandWritten, Generated>;
 *   const _someDrift: _SomeDrift = true; // tsc error here if the types diverge
 *
 * The trailing `const _assert: _Drift = true` is what actually breaks the
 * build: a bare type alias is erased, so without a value referencing it
 * `never` never surfaces as an error.
 *
 * Tuples (`[A] extends [B]`) prevent distribution over unions, so nullable
 * scalars like `string | null` compare as a whole rather than member-by-member.
 */

/** `true` iff A and B are mutually assignable (exact match); otherwise `never`. */
export type AssertExact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

/** `true` iff A is assignable to B (one-directional); otherwise `never`. */
export type AssertExtends<A, B> = [A] extends [B] ? true : never;
