/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */
'use client';

import { Loader2 } from 'lucide-react';

import { useReleaseDigitalFormatsQuery } from '@/hooks/queries/use-release-digital-formats-query';
import { useReleaseQuery } from '@/hooks/queries/use-release-query';
import { useReleaseRelatedQuery } from '@/hooks/queries/use-release-related-query';
import { useReleaseUserStatusQuery } from '@/hooks/queries/use-release-user-status-query';
import { getArtistDisplayName } from '@/lib/utils/get-artist-display-name';

import { ArtistReleasesCarousel } from './artist-releases-carousel';
import { ReleaseNotes } from './release-notes';
import { ReleasePlayer } from './release-player';
import { ZinePanel } from './ui/zine-panel';

interface ReleaseDetailContentProps {
  releaseId: string;
  autoPlay: boolean;
}

/** The resolved (non-null) release payload returned by {@link useReleaseQuery}. */
type ReleaseData = NonNullable<ReturnType<typeof useReleaseQuery>['data']>;

/** The primary (first) artist on a release, if any. */
const getPrimaryArtist = (release: ReleaseData | null | undefined) =>
  release?.artistReleases?.[0]?.artist ?? null;

/**
 * Client content wrapper for the release detail page.
 * Orchestrates multiple TanStack Query hooks (hydrated from SSR prefetch).
 */
export const ReleaseDetailContent = ({ releaseId, autoPlay }: ReleaseDetailContentProps) => {
  const { isPending: releasePending, data: release } = useReleaseQuery(releaseId);
  // Pre-warm the TanStack Query cache for the data DeferredDownloadDialog
  // fetches once the user opens it. The hooks dedupe internally, so the dialog
  // sees instant data on first open.
  useReleaseUserStatusQuery(releaseId);
  useReleaseDigitalFormatsQuery(releaseId);

  const primaryArtistId = getPrimaryArtist(release)?.id ?? null;
  const { data: relatedData } = useReleaseRelatedQuery(releaseId, primaryArtistId);

  if (releasePending) {
    return (
      <div className="flex min-h-100 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-zinc-950" />
      </div>
    );
  }

  if (!release) {
    return (
      <div className="border-muted-foreground/25 bg-muted/5 flex min-h-100 items-center justify-center border-2 border-dashed p-8">
        <div className="text-center">
          <h3 className="text-lg font-semibold text-zinc-950">Release not found</h3>
          <p className="mt-2 text-sm text-zinc-950">
            The release you are looking for does not exist.
          </p>
        </div>
      </div>
    );
  }

  const primaryArtist = getPrimaryArtist(release);
  const artistName = primaryArtist ? getArtistDisplayName(primaryArtist) : null;

  const otherReleases = relatedData?.releases ?? [];

  const breadcrumbItems = [
    { anchorText: 'Releases', url: '/releases', isActive: false },
    {
      anchorText: release.title,
      url: `/releases/${release.id}`,
      isActive: true,
      className: 'max-w-[200px] truncate sm:max-w-none sm:overflow-visible',
    },
  ];

  return (
    <>
      <ZinePanel chat accent="cyan" tape={false} breadcrumbs={breadcrumbItems}>
        {otherReleases.length > 0 && (
          <ArtistReleasesCarousel releases={otherReleases} artistName={artistName} />
        )}
        <ReleasePlayer
          release={release}
          autoPlay={autoPlay}
          releaseId={release.id}
          releaseTitle={release.title}
        />
        <ReleaseNotes release={release} artistName={artistName} />
      </ZinePanel>
    </>
  );
};
