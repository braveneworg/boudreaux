/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Compile-time drift guards.
 *
 * Hand-written domain types (in `@/lib/types/domain`) mirror Prisma's generated
 * payload/input types. These helpers let a repository file — the only layer
 * permitted to import Prisma — assert at `tsc` time that a hand-written type and
 * its Prisma counterpart still agree. If the schema changes and the hand-written
 * type drifts, `pnpm run typecheck` fails.
 *
 * Usage (inside a repository file):
 *
 *   type _ArtistDrift = AssertExact<Artist, Prisma.ArtistGetPayload<{ include: typeof artistInclude }>>;
 *   const _assertArtist: _ArtistDrift = true; // tsc error here if the types diverge
 *
 * The trailing `const _assert: _Drift = true` is what actually breaks the build:
 * a bare type alias is erased, so without a value referencing it `never` never
 * surfaces as an error.
 *
 * Tuples (`[A] extends [B]`) prevent distribution over unions, so nullable
 * scalars like `string | null` compare as a whole rather than member-by-member.
 */

/** `true` iff A and B are mutually assignable (exact match); otherwise `never`. */
export type AssertExact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

/** `true` iff A is assignable to B (one-directional); otherwise `never`. */
export type AssertExtends<A, B> = [A] extends [B] ? true : never;
