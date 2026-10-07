/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
import { notFound } from 'next/navigation';

import { ReleaseCard } from '@/app/components/release-card';
import { ContentContainer } from '@/app/components/ui/content-container';
import { PageContainer } from '@/app/components/ui/page-container';
import { ZineHeading } from '@/app/components/ui/zine-heading';
import { ZinePanel } from '@/app/components/ui/zine-panel';
import type { ArtistPublishedReleaseRow } from '@/lib/types/domain/artist';
import type { ReleaseCredit } from '@/lib/types/domain/release';
import { RELEASE_CREDITS } from '@/lib/utils/artist-release-credits';
import { getArtistDisplayName } from '@/lib/utils/get-artist-display-name';
import {
  getArtistDisplayNameForRelease,
  getBandcampUrl,
  getFirstTrackStreamSource,
  getReleaseCoverArt,
} from '@/lib/utils/release-helpers';

import { getPublicArtist } from '../get-public-artist';

import type { Metadata } from 'next';

interface ArtistReleasesPageProps {
  params: Promise<{ slug: string }>;
}

/** The heading of each credit group, in ADR-0006 order. */
const GROUP_HEADINGS = new Map<ReleaseCredit, string>([
  ['primary', 'Own releases'],
  ['featured', 'Featured on'],
  ['member', 'With the band'],
]);

export async function generateMetadata({ params }: ArtistReleasesPageProps): Promise<Metadata> {
  const { slug } = await params;
  const artist = await getPublicArtist(slug);
  if (!artist) return { title: 'Artist Not Found' };
  const displayName = getArtistDisplayName(artist);
  return {
    title: `${displayName} – Releases`,
    description: `Every release credited to ${displayName}.`,
  };
}

/** A grid of release cards; each card derives its own display values from the row. */
const ReleaseGrid = ({ rows }: { rows: ArtistPublishedReleaseRow[] }): React.ReactElement => (
  <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
    {rows.map(({ id, release, albumArtist }) => (
      <li key={id} className="flex">
        <ReleaseCard
          id={release.id}
          title={release.title}
          // The byline is the album artist when public, else empty (ADR-0015).
          artistName={albumArtist ? getArtistDisplayNameForRelease(albumArtist) : null}
          coverArt={getReleaseCoverArt(release)}
          releasedOn={release.releasedOn}
          bandcampUrl={getBandcampUrl(release)}
          playSrc={getFirstTrackStreamSource(release)}
        />
      </li>
    ))}
  </ul>
);

/**
 * Every release the artist is credited on, in the artist page's order
 * (ADR-0006): own releases, then featured appearances, then the band's,
 * each as a `ReleaseCard` with the `/releases` Play flow. The groups get a
 * heading each only when there is more than one of them.
 */
export default async function ArtistReleasesPage({ params }: ArtistReleasesPageProps) {
  const { slug } = await params;
  const artist = await getPublicArtist(slug);
  if (!artist) notFound();

  const displayName = getArtistDisplayName(artist);
  const groups = RELEASE_CREDITS.map((credit) => ({
    credit,
    heading: GROUP_HEADINGS.get(credit) ?? credit,
    rows: artist.releases.filter((row) => row.credit === credit),
  })).filter((group) => group.rows.length > 0);

  return (
    <PageContainer>
      <ContentContainer>
        <ZinePanel
          accent="orange"
          tape={false}
          breadcrumbs={[
            { anchorText: 'Artists', url: '/artists', isActive: false },
            { anchorText: displayName, url: `/artists/${slug}`, isActive: false },
            { anchorText: 'Releases', url: `/artists/${slug}/releases`, isActive: true },
          ]}
          contentClassName="space-y-8"
        >
          <ZineHeading level={1}>{displayName}</ZineHeading>
          {groups.length === 0 && <p className="text-zinc-700">No releases yet.</p>}
          {groups.length === 1 && <ReleaseGrid rows={groups[0].rows} />}
          {groups.length > 1 &&
            groups.map(({ credit, heading, rows }) => (
              <section key={credit} aria-labelledby={`releases-${credit}`} className="space-y-4">
                <h2 id={`releases-${credit}`} className="text-xl font-semibold">
                  {heading}
                </h2>
                <ReleaseGrid rows={rows} />
              </section>
            ))}
        </ZinePanel>
      </ContentContainer>
    </PageContainer>
  );
}
