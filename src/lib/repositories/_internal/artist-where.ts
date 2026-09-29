/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * The `where` fragments that decide whether an artist may be public, shared by
 * the artist repositories and the backfill script so the rule has one
 * definition. Type-only Prisma import and no `server-only`, so a CLI script
 * can load it.
 */

import type { Prisma } from '@prisma/client';

/** Mongo null-safe "not soft-deleted" clause (absent field counts as not deleted). */
export const notDeletedOr = [{ deletedOn: null }, { deletedOn: { isSet: false } }] as const;

/** Mongo null-safe "never published" clause (absent field counts as unpublished). */
export const unpublishedOr = [{ publishedOn: null }, { publishedOn: { isSet: false } }] as const;

/** A release that the public may see: published and not soft-deleted. */
export const listedReleaseWhere = {
  publishedAt: { not: null },
  OR: [...notDeletedOr],
} as const satisfies Prisma.ReleaseWhereInput;

/**
 * A public artist (ADR-0015, ADR-0016): published and not soft-deleted.
 * Whether the artist is still on the label plays no part. Every public read
 * applies it: to the artist a page is about, and, nested as
 * `{ artist: { is: publicArtistWhere } }`, to the artists a release credits, a
 * band lists, a featured row names, or a tour date headlines.
 * `publishedOn: { not: null }` excludes an absent field as well as an explicit
 * null. Its in-memory twin is `isPublicArtist`.
 */
export const publicArtistWhere = {
  publishedOn: { not: null },
  OR: [...notDeletedOr],
} as const satisfies Prisma.ArtistWhereInput;

/**
 * Hidden only for want of a `publishedOn`: never published, not soft-deleted.
 * Stamping `publishedOn` on exactly these makes them public.
 */
const awaitingConfirmationGate = {
  AND: [{ OR: [...unpublishedOr] }, { OR: [...notDeletedOr] }],
} as const satisfies Prisma.ArtistWhereInput;

/** Hidden whatever `publishedOn` says: soft-deleted. */
const staysHiddenGate = {
  deletedOn: { not: null },
} as const satisfies Prisma.ArtistWhereInput;

/**
 * Artists whose credit awaits confirmation (ADR-0015): credited as `credit`
 * describes, and hidden only for want of a `publishedOn`.
 *
 * @param credit - Which credits count: one release's, or every listed release's.
 */
export const creditAwaitingConfirmationWhere = (
  credit: Prisma.ArtistReleaseWhereInput
): Prisma.ArtistWhereInput => ({ releases: { some: credit }, ...awaitingConfirmationGate });

/**
 * Artists whose credit stays hidden whatever `publishedOn` says.
 *
 * @param credit - Which credits count: one release's, or every listed release's.
 */
export const creditThatStaysHiddenWhere = (
  credit: Prisma.ArtistReleaseWhereInput
): Prisma.ArtistWhereInput => ({ releases: { some: credit }, ...staysHiddenGate });

/**
 * The same two gates over a given set of artists, for a write whose credits
 * are not stored yet (a release form naming the artists it will credit).
 */
export const awaitingConfirmationAmongWhere = (artistIds: string[]): Prisma.ArtistWhereInput => ({
  id: { in: artistIds },
  ...awaitingConfirmationGate,
});

export const staysHiddenAmongWhere = (artistIds: string[]): Prisma.ArtistWhereInput => ({
  id: { in: artistIds },
  ...staysHiddenGate,
});

/** The name parts every credit description composes its displayed name from. */
const creditNameSelect = {
  id: true,
  slug: true,
  displayName: true,
  firstName: true,
  middleName: true,
  surname: true,
  title: true,
  suffix: true,
} as const satisfies Prisma.ArtistSelect;

/** What a credit awaiting confirmation reads: the name and what would go live. */
export const creditConfirmationSelect = {
  ...creditNameSelect,
  bio: true,
  shortBio: true,
  altBio: true,
  bioGeneratedAt: true,
  bioImages: {
    select: { isPrimary: true, displayOrder: true, alt: true },
    orderBy: { sortOrder: 'asc' },
  },
} as const satisfies Prisma.ArtistSelect;

/** What a credit that stays hidden reads: the name and the field that hides it. */
export const hiddenCreditSelect = {
  ...creditNameSelect,
  deletedOn: true,
} as const satisfies Prisma.ArtistSelect;
