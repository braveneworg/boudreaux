/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Public releases listing page at `/releases`.
 * Server Component that fetches all published releases and renders
 * a searchable card grid with breadcrumb navigation.
 */
import 'server-only';

import Link from 'next/link';

import { ReleaseCardGrid } from '@/app/components/release-card-grid';
import { ReleaseSearchCombobox } from '@/app/components/release-search-combobox';
import { BreadcrumbMenu } from '@/app/components/ui/breadcrumb-menu';
import { ContentContainer } from '@/app/components/ui/content-container';
import { Heading } from '@/app/components/ui/heading';
import PageContainer from '@/app/components/ui/page-container';
import { ReleaseService } from '@/lib/services/release-service';
import type { PublishedReleaseListing } from '@/lib/types/media-models';
import {
  getArtistDisplayNameForRelease,
  getBandcampUrl,
  getReleaseCoverArt,
} from '@/lib/utils/release-helpers';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Releases',
  description: 'Browse all published releases. Search by artist, title, or group.',
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
    artistName,
    coverArt: getReleaseCoverArt(release),
    bandcampUrl: getBandcampUrl(release),
  };
};

/**
 * Releases listing page — renders all published releases in a searchable grid.
 */
const ReleasesPage = async () => {
  const result = await ReleaseService.getPublishedReleases();

  const releases: PublishedReleaseListing[] = result.success ? result.data : [];
  const cardReleases = releases.map(toCardRelease);
  const hasError = !result.success;

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
};

export default ReleasesPage;
