/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ReleaseCredit } from '@/lib/types/domain/release';

/**
 * Every credit the artist page can assign to a release, in display order:
 * the artist's own releases, then releases they are featured on, then releases
 * by a band they belong to.
 */
export const RELEASE_CREDITS = [
  'primary',
  'featured',
  'member',
] as const satisfies readonly ReleaseCredit[];

const CREDIT_RANK: Record<ReleaseCredit, number> = { primary: 0, featured: 1, member: 2 };

/** The release fields the credit derivation and listing filter read. */
export interface CreditableRelease {
  id: string;
  releasedOn: Date | string | null;
  publishedAt?: Date | string | null;
  deletedOn?: Date | string | null;
  /** Artist credits in album-artist-first order (the admin release form's `artistIds` order). */
  artistReleases: Array<{ artistId: string }>;
}

/** An `ArtistRelease` join row carrying a creditable release. */
export interface CreditableReleaseRow {
  release: CreditableRelease;
}

/** The slice of an artist's release graph the listing is built from. */
export interface ArtistReleaseGraph<TRow extends CreditableReleaseRow> {
  id: string;
  /** Releases the artist is credited on directly. */
  releases: TRow[];
  /** Bands the artist belongs to, each carrying the band's own release joins. */
  memberOf: Array<{ artist: { releases: TRow[] } }>;
}

/**
 * Whether a release the artist is credited on directly is their own release
 * (`primary`) or a guest appearance (`featured`).
 *
 * The first `ArtistRelease` row on a release is its album artist — the
 * convention the admin release listing and form already rely on — so an artist
 * credited anywhere but first is featured. A release with no credits at all is
 * treated as the artist's own so it is never hidden.
 */
export const deriveOwnReleaseCredit = (
  artistId: string,
  { artistReleases }: Pick<CreditableRelease, 'artistReleases'>
): ReleaseCredit => {
  const albumArtistId = artistReleases.at(0)?.artistId;
  return albumArtistId === undefined || albumArtistId === artistId ? 'primary' : 'featured';
};

/** Epoch millis of a release date; a missing date sorts after every dated release. */
const releasedOnTime = (releasedOn: CreditableRelease['releasedOn']): number =>
  releasedOn ? new Date(releasedOn).getTime() : 0;

/**
 * Sort comparator for the artist page: own releases first, then featured
 * appearances, then band releases — newest first within each credit.
 */
export const compareByCreditThenNewest = <
  TRow extends { credit: ReleaseCredit; release: Pick<CreditableRelease, 'releasedOn'> },
>(
  a: TRow,
  b: TRow
): number =>
  CREDIT_RANK[a.credit] - CREDIT_RANK[b.credit] ||
  releasedOnTime(b.release.releasedOn) - releasedOnTime(a.release.releasedOn);

/**
 * Public listing rule: only published, non-deleted releases. `publishedAt` may
 * be absent on legacy Mongo documents, which counts as unpublished.
 */
const isListable = ({ publishedAt, deletedOn }: CreditableRelease): boolean =>
  publishedAt != null && deletedOn == null;

/**
 * Build the artist page's release list from the artist's release graph: every
 * published release they are credited on (tagged `primary` or `featured`) plus
 * every published release of a band they belong to (tagged `member`), listed
 * once each — a direct credit wins over a band route — and ordered by
 * {@link compareByCreditThenNewest}.
 */
export const collectArtistReleases = <TRow extends CreditableReleaseRow>({
  id,
  releases,
  memberOf,
}: ArtistReleaseGraph<TRow>): Array<TRow & { credit: ReleaseCredit }> => {
  const own = releases
    .filter(({ release }) => isListable(release))
    .map((row) => ({ ...row, credit: deriveOwnReleaseCredit(id, row.release) }));

  const listed = new Set(own.map(({ release }) => release.id));
  const viaBands = memberOf
    .flatMap(({ artist }) => artist.releases)
    .filter(({ release }) => isListable(release))
    .filter(({ release }) => {
      // A direct credit wins over a band route, and two bands can share a
      // release — the first row seen keeps the slot.
      const isNew = !listed.has(release.id);
      listed.add(release.id);
      return isNew;
    })
    .map((row) => ({ ...row, credit: 'member' as const }));

  return [...own, ...viaBands].sort(compareByCreditThenNewest);
};
