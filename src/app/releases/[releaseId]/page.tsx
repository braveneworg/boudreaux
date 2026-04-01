/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Release media player page at `/releases/[releaseId]`.
 * Server Component that fetches a single release with tracks and renders
 * the media player, artist carousel, and breadcrumb navigation.
 */
import 'server-only';

import { notFound } from 'next/navigation';

import { ArtistReleasesCarousel } from '@/app/components/artist-releases-carousel';
import { ReleaseDescription } from '@/app/components/release-description';
import { ReleasePlayer } from '@/app/components/release-player';
import { BreadcrumbMenu } from '@/app/components/ui/breadcrumb-menu';
import { ContentContainer } from '@/app/components/ui/content-container';
import PageContainer from '@/app/components/ui/page-container';
import { PurchaseRepository } from '@/lib/repositories/purchase-repository';
import { ReleaseDigitalFormatRepository } from '@/lib/repositories/release-digital-format-repository';
import { ReleaseService } from '@/lib/services/release-service';
import { getArtistDisplayName } from '@/lib/utils/get-artist-display-name';

import { auth } from '../../../../auth';

interface ReleasePlayerPageProps {
  params: Promise<{ releaseId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Release player page — renders a single release with audio player,
 * track list, and an optional carousel of other releases by the same artist.
 */
const ReleasePlayerPage = async ({ params, searchParams }: ReleasePlayerPageProps) => {
  const { releaseId } = await params;
  const resolvedSearchParams = await searchParams;
  const autoPlay = resolvedSearchParams.autoplay === 'true';

  const releaseResult = await ReleaseService.getReleaseWithTracks(releaseId);

  if (!releaseResult.success) {
    notFound();
    return; // notFound() throws in production; return satisfies TypeScript narrowing
  }

  const release = releaseResult.data;

  // Fetch auth session and purchase status for this user/release
  const session = await auth();
  const authUserId = (session?.user as { id?: string })?.id ?? null;

  const [hasPurchase, downloadRecord] = await Promise.all([
    authUserId
      ? PurchaseRepository.findByUserAndRelease(authUserId, releaseId).then((r) => r !== null)
      : Promise.resolve(false),
    authUserId
      ? PurchaseRepository.getDownloadRecord(authUserId, releaseId)
      : Promise.resolve(null),
  ]);
  const downloadCount = downloadRecord?.downloadCount ?? 0;

  // Fetch available digital formats for this release
  const formatRepo = new ReleaseDigitalFormatRepository();
  const digitalFormats = await formatRepo.findAllByRelease(releaseId);
  const availableFormats = digitalFormats
    .filter((f): f is typeof f & { fileName: string } => f.fileName !== null)
    .map((f) => ({
      formatType: f.formatType,
      fileName: f.fileName,
    }));

  const primaryArtist = release.artistReleases[0]?.artist;
  const primaryArtistId = primaryArtist?.id;

  const artistName = primaryArtist ? getArtistDisplayName(primaryArtist) : null;

  const otherReleasesResult = primaryArtistId
    ? await ReleaseService.getArtistOtherReleases(primaryArtistId, releaseId)
    : { success: false as const, data: [] };

  const otherReleases = otherReleasesResult.success ? otherReleasesResult.data : [];

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
    <PageContainer>
      <ContentContainer>
        <BreadcrumbMenu items={breadcrumbItems} />
        {otherReleases.length > 0 && (
          <ArtistReleasesCarousel releases={otherReleases} artistName={artistName} />
        )}
        <ReleasePlayer
          release={release}
          autoPlay={autoPlay}
          releaseId={release.id}
          releaseTitle={release.title}
          suggestedPrice={
            (release as unknown as { suggestedPrice?: number | null }).suggestedPrice
              ? (release as unknown as { suggestedPrice: number }).suggestedPrice / 100
              : null
          }
          hasPurchase={hasPurchase}
          downloadCount={downloadCount}
          availableFormats={availableFormats}
        />
        <ReleaseDescription description={release.description ?? null} />
      </ContentContainer>
    </PageContainer>
  );
};

export default ReleasePlayerPage;
