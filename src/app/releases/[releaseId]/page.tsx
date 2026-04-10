/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at https://mozilla.org/MPL/2.0/. */

/**
 * Release media player page at `/releases/[releaseId]`.
 * Server Component that fetches a single release with tracks and renders
 * the media player, artist carousel, and breadcrumb navigation.
 */
import 'server-only';

import { cookies } from 'next/headers';
import { notFound } from 'next/navigation';

import { ArtistReleasesCarousel } from '@/app/components/artist-releases-carousel';
import { ReleaseDescription } from '@/app/components/release-description';
import { ReleasePlayer } from '@/app/components/release-player';
import { BreadcrumbMenu } from '@/app/components/ui/breadcrumb-menu';
import { ContentContainer } from '@/app/components/ui/content-container';
import PageContainer from '@/app/components/ui/page-container';
import type { DigitalFormatType } from '@/lib/constants/digital-formats';
import { getArtistDisplayName } from '@/lib/utils/get-artist-display-name';
import { getInternalApiUrl } from '@/lib/utils/get-internal-api-url';

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

  // Fetch the release with tracks from the API
  const releaseUrl = await getInternalApiUrl(`/api/releases/${releaseId}?withTracks=true`);
  const releaseRes = await fetch(releaseUrl, { cache: 'no-store' });

  if (!releaseRes.ok) {
    notFound();
    return;
  }

  const release = await releaseRes.json();

  const primaryArtist = release.artistReleases[0]?.artist;
  const primaryArtistId = primaryArtist?.id;
  const artistName = primaryArtist ? getArtistDisplayName(primaryArtist) : null;

  // Fetch user purchase status and related releases in parallel
  // Forward cookies so the user-status route can check auth
  const cookieStore = await cookies();
  const cookieHeader = cookieStore.toString();

  const [userStatusUrl, relatedUrl] = await Promise.all([
    getInternalApiUrl(`/api/releases/${releaseId}/user-status`),
    getInternalApiUrl(
      `/api/releases/${releaseId}/related${primaryArtistId ? `?artistId=${primaryArtistId}` : ''}`
    ),
  ]);

  const [userStatusRes, relatedRes] = await Promise.all([
    fetch(userStatusUrl, {
      cache: 'no-store',
      headers: { Cookie: cookieHeader },
    }),
    fetch(relatedUrl, { cache: 'no-store' }),
  ]);

  // User status — defaults for unauthenticated users
  let hasPurchase = false;
  let purchasedAt: Date | null = null;
  let downloadCount = 0;
  let availableFormats: Array<{ formatType: DigitalFormatType; fileName: string }> = [];

  if (userStatusRes.ok) {
    const status = await userStatusRes.json();
    hasPurchase = status.hasPurchase ?? false;
    purchasedAt = status.purchasedAt ? new Date(status.purchasedAt) : null;
    downloadCount = status.downloadCount ?? 0;
    availableFormats = status.availableFormats ?? [];
  }

  // Related releases
  const otherReleases = relatedRes.ok ? ((await relatedRes.json()).releases ?? []) : [];

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
          purchasedAt={purchasedAt}
          downloadCount={downloadCount}
          availableFormats={availableFormats}
        />
        <ReleaseDescription description={release.description ?? null} />
      </ContentContainer>
    </PageContainer>
  );
};

export default ReleasePlayerPage;
