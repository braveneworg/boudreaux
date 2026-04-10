/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Public releases listing page at `/releases`.
 * Server Component that fetches all published releases and renders
 * a searchable card grid with breadcrumb navigation.
 */

import Link from 'next/link';

import { ReleaseCardGrid } from '@/app/components/release-card-grid';
import { ReleaseSearchCombobox } from '@/app/components/release-search-combobox';
import { BreadcrumbMenu } from '@/app/components/ui/breadcrumb-menu';
import { ContentContainer } from '@/app/components/ui/content-container';
import { Heading } from '@/app/components/ui/heading';
import PageContainer from '@/app/components/ui/page-container';
import type { PublishedReleaseListing } from '@/lib/types/media-models';
import { getInternalApiUrl } from '@/lib/utils/get-internal-api-url';
import {
  getArtistDisplayNameForRelease,
  getBandcampUrl,
  getReleaseCoverArt,
} from '@/lib/utils/release-helpers';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Releases',
  description: 'Browse all published releases. Search by artist or title.',
};

const breadcrumbItems = [{ anchorText: 'Releases', url: '/releases', isActive: true }];

/**
 * Transform a PublishedReleaseListing into the shape expected by ReleaseCardGrid.
 */
const toCardRelease = (release: PublishedReleaseListing) => {
  const artistName = release.artistReleases[0]
    ? getArtistDisplayNameForRelease(release.artistReleases[0].artist)
    : 'Unknown Artist';

  return {
    id: release.id,
    title: release.title,
    artistName: artistName ?? 'Unknown Artist',
    coverArt: getReleaseCoverArt(release),
    bandcampUrl: getBandcampUrl(release),
  };
};

/**
 * Releases listing page — renders all published releases in a searchable grid.
 */
export default async function ReleasesPage() {
  const url = getInternalApiUrl('/api/releases?listing=published');
  const res = await fetch(url, { cache: 'no-store' });

  const hasError = !res.ok;
  const releases: PublishedReleaseListing[] = res.ok ? ((await res.json()).releases ?? []) : [];
  const cardReleases = releases.map(toCardRelease);

  return (
    <PageContainer>
      <ContentContainer>
        <BreadcrumbMenu items={breadcrumbItems} />
        <Heading level={1}>Releases</Heading>
        {hasError ? (
          <div className="flex flex-col items-center gap-4 px-4 py-12 text-center">
            <p className="text-muted-foreground">
              Unable to load releases. Please try again later.
            </p>
            <Link
              href="/releases"
              className="rounded-md bg-primary px-4 py-2 text-primary-foreground hover:bg-primary/90"
            >
              Try again
            </Link>
          </div>
        ) : (
          <div className="flex flex-col gap-6 px-4 py-4">
            <ReleaseSearchCombobox releases={releases} />
            <ReleaseCardGrid releases={cardReleases} />
          </div>
        )}
      </ContentContainer>
    </PageContainer>
  );
}
