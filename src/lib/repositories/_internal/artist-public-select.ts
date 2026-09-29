/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ArtistCreditScalars, ArtistPublicScalars } from '@/lib/types/domain/artist';

import type { AssertExact } from './drift';
import type { Prisma } from '@prisma/client';

/**
 * Public artist scalars — the select a public surface reads a GATED artist
 * through (#765): the artist-detail page artist and
 * `GET /api/artists/slug/[slug]`, both behind the publication gate. An artist
 * reached through another record reads through {@link artistCreditSelect}. An allow-list, so a column added to the schema stays off
 * every public payload until someone classifies it here; the drift guard below
 * fails `pnpm run typecheck` until {@link ArtistPublicScalars} agrees. Never
 * selects contact PII, notes, audit actors, or the async-job internals —
 * above all `bioJobToken` / `imageLinksJobToken`, the public job callbacks'
 * only credential.
 */
export const artistPublicSelect = {
  id: true,
  firstName: true,
  middleName: true,
  surname: true,
  akaNames: true,
  displayName: true,
  title: true,
  suffix: true,
  bio: true,
  shortBio: true,
  altBio: true,
  bioGeneratedAt: true,
  bioModel: true,
  bioStatus: true,
  slug: true,
  genres: true,
  bornOn: true,
  diedOn: true,
  formedOn: true,
  publishedOn: true,
  createdAt: true,
  updatedAt: true,
  deletedOn: true,
  deactivatedAt: true,
  reactivatedAt: true,
  tags: true,
  isPseudonymous: true,
  isActive: true,
  instruments: true,
  featuredArtistId: true,
} as const satisfies Prisma.ArtistSelect;

type _ArtistPublicScalarsDrift = AssertExact<
  ArtistPublicScalars,
  Prisma.ArtistGetPayload<{ select: typeof artistPublicSelect }>
>;
const _artistPublicScalarsDrift: _ArtistPublicScalarsDrift = true;

/**
 * Nested artist scalars — the select for an artist reached through another
 * record: a release credit, a band member or band on the artist-detail graph,
 * a tour headliner. {@link artistPublicSelect} without the bio fields: nothing
 * gates a nested artist on publication, so a draft artist's bio would
 * otherwise ride along on a published artist's page or a tour. Keeps
 * `publishedOn` and `deletedOn`, which `isPublicArtist` reads. An allow-list,
 * drift-checked against {@link ArtistCreditScalars}.
 */
export const artistCreditSelect = {
  id: true,
  firstName: true,
  middleName: true,
  surname: true,
  akaNames: true,
  displayName: true,
  title: true,
  suffix: true,
  slug: true,
  genres: true,
  bornOn: true,
  diedOn: true,
  formedOn: true,
  publishedOn: true,
  createdAt: true,
  updatedAt: true,
  deletedOn: true,
  deactivatedAt: true,
  reactivatedAt: true,
  tags: true,
  isPseudonymous: true,
  isActive: true,
  instruments: true,
  featuredArtistId: true,
} as const satisfies Prisma.ArtistSelect;

type _ArtistCreditScalarsDrift = AssertExact<
  ArtistCreditScalars,
  Prisma.ArtistGetPayload<{ select: typeof artistCreditSelect }>
>;
const _artistCreditScalarsDrift: _ArtistCreditScalarsDrift = true;
