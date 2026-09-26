/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

import type { ArtistPublicScalars } from '@/lib/types/domain/artist';

import type { AssertExact } from './drift';
import type { Prisma } from '@prisma/client';

/**
 * Public artist scalars — the select every public surface reads an artist
 * through (#765): the artist-detail graph, `GET /api/artists/slug/[slug]`, and
 * tour headliners. An allow-list, so a column added to the schema stays off
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
