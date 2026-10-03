/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import type { ReleaseCredit } from '@/lib/types/domain/release';
import { isPublicArtist, type PublicArtistFields } from '@/lib/utils/is-public-artist';

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
/** A credit row as every public read loads it: the artist with its public gate fields. */
export interface PublicCreditRow {
  artist: PublicArtistFields;
}

/** The credits a public surface may show, and who the byline names. */
export interface PublicCredits<TRow extends PublicCreditRow> {
  /**
   * The album artist — the first credit in stored order — when public; null
   * when the first credit is hidden. A hidden album artist leaves the byline
   * empty rather than handing it to the next credit (ADR-0015).
   */
  albumArtist: TRow['artist'] | null;
  /** The credits whose artist is public, in stored order. */
  credits: TRow[];
}

/**
 * Derive what a public surface shows from a release's FULL credit order:
 * the album artist is read first, then hidden artists are dropped. Every
 * public release read applies this before a row reaches a payload, so a
 * hidden name never does.
 */
export const publicCredits = <TRow extends PublicCreditRow>(
  credits: TRow[]
): PublicCredits<TRow> => {
  const first = credits.at(0)?.artist;
  return {
    albumArtist: first && isPublicArtist(first) ? first : null,
    credits: credits.filter(({ artist }) => isPublicArtist(artist)),
  };
};

/** A release row as a public read loads it: its full credit order, gate fields on each artist. */
export interface PublicBylineSource<TRow extends PublicCreditRow> {
  artistReleases: TRow[];
}

/** The same row as a public surface may show it: public credits plus the byline. */
export type WithPublicByline<T extends PublicBylineSource<PublicCreditRow>> = T & {
  albumArtist: T['artistReleases'][number]['artist'] | null;
};

/**
 * Apply {@link publicCredits} to a release row: `artistReleases` keeps only
 * the public credits and `albumArtist` names the byline (or null). Every
 * service that hands a release to a public surface does this once.
 */
export const withPublicByline = <T extends PublicBylineSource<PublicCreditRow>>(
  release: T
): WithPublicByline<T> => {
  const { albumArtist, credits } = publicCredits(release.artistReleases);
  return { ...release, albumArtist, artistReleases: credits };
};

/** {@link withPublicByline} for a row that carries its release nested, like a purchase. */
export const withPublicReleaseByline = <T extends { release: PublicBylineSource<PublicCreditRow> }>(
  row: T
): Omit<T, 'release'> & { release: WithPublicByline<T['release']> } => ({
  ...row,
  release: withPublicByline(row.release),
});

/** The album artist's display name for a credit list, or null when the byline is empty. */
export const publicAlbumArtistName = <A extends PublicArtistFields>(
  credits: Array<{ artist: A }>,
  nameOf: (artist: A) => string
): string | null => {
  const { albumArtist } = publicCredits(credits);
  return albumArtist ? nameOf(albumArtist) : null;
};

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
export const isListable = ({
  publishedAt,
  deletedOn,
}: Pick<CreditableRelease, 'publishedAt' | 'deletedOn'>): boolean =>
  publishedAt != null && deletedOn == null;

/** The release fields the artists-index summary reads from a direct release join. */
export interface SummarizableReleaseRow {
  release: Pick<CreditableRelease, 'id' | 'releasedOn' | 'publishedAt' | 'deletedOn'> & {
    title: string;
  };
}

/** The artists-index release summary: how many listed releases, and the newest of them. */
export interface ListedReleaseSummary {
  releaseCount: number;
  newestRelease: { id: string; title: string; releasedOn: Date } | null;
}

/**
 * Summarise an artist's DIRECT release credits for the artists index: the
 * number of listed (published, non-deleted) releases and the newest of them
 * by release date. Band releases are deliberately not counted — the index
 * lists only directly credited artists (ADR-0007), so a member credit neither
 * lists an artist nor inflates their count.
 */
export const summarizeListedReleases = (rows: SummarizableReleaseRow[]): ListedReleaseSummary => {
  const listed = rows.map(({ release }) => release).filter(isListable);
  const newest = listed.reduce<SummarizableReleaseRow['release'] | null>(
    (best, release) =>
      best === null || releasedOnTime(release.releasedOn) > releasedOnTime(best.releasedOn)
        ? release
        : best,
    null
  );

  return {
    releaseCount: listed.length,
    newestRelease:
      newest === null
        ? null
        : { id: newest.id, title: newest.title, releasedOn: new Date(newest.releasedOn ?? 0) },
  };
};

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
